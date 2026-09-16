'use node';

import type { Page, Request, Response } from 'playwright-core';
import { hasPostContent } from './shared';
import type { RawPost } from './types';

type ResponseParser = (data: unknown, response: Response) => RawPost[];
const INITIAL_RESPONSE_TIMEOUT = 30_000;
const MAX_SCROLLS = 240;
const MAX_STALLED_REQUESTS = 30;
const SCROLL_DISTANCE = 8_000;
const SCROLL_PAUSE_MS = 500;
const SCROLL_TIMEOUT_MS = 10_000;
const ADVANCE_TIMEOUT_MS = 10_000;
const RESPONSE_BODY_TIMEOUT_MS = 10_000;

export async function collectFeedResponses({
  page,
  maxPosts,
  navigate,
  matches,
  parse,
  onPost,
  advance,
  scroll,
}: {
  page: Page;
  maxPosts: number;
  navigate: () => Promise<void>;
  matches: (response: Response) => boolean;
  parse: ResponseParser;
  onPost?: (post: RawPost) => void;
  advance?: (response: Response) => Promise<{ fetched: boolean; posts: RawPost[] }>;
  scroll?: () => Promise<void>;
}): Promise<RawPost[]> {
  const posts = new Map<string, RawPost>();
  const pending = new Set<Promise<void>>();
  const observedRequests: Array<{ path: string; name: string | null }> = [];
  let matchingResponses = 0;
  let firstResponseError: unknown = null;
  let latestResponse: Response | null = null;

  const handleRequest = (request: Request) => {
    const url = new URL(request.url());
    if (!/graphql|feed|timeline/i.test(url.pathname) || observedRequests.length >= 25) {
      return;
    }
    const params = new URLSearchParams(request.postData() ?? '');
    const name = params.get('fb_api_req_friendly_name');
    if (!observedRequests.some((entry) => entry.path === url.pathname && entry.name === name)) {
      observedRequests.push({ path: url.pathname, name });
    }
  };

  const handleResponse = (response: Response) => {
    if (!matches(response)) {
      return;
    }

    matchingResponses += 1;
    latestResponse = response;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const body = Promise.race([
      response.text(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('FEED_RESPONSE_BODY_TIMEOUT')), RESPONSE_BODY_TIMEOUT_MS);
      }),
    ]);
    const task: Promise<void> = body
      .then((text) => {
        let data: unknown = text;
        try {
          data = JSON.parse(text) as unknown;
        } catch {
          data = text;
        }
        for (const post of parse(data, response)) {
          if (hasPostContent(post) && !posts.has(post.id)) {
            posts.set(post.id, post);
            onPost?.(post);
          }
        }
      })
      .catch((error: unknown) => {
        firstResponseError ??= error;
        if (error instanceof Error && error.message === 'FEED_RESPONSE_BODY_TIMEOUT') {
          console.warn('[digest] feed response body timed out', { path: new URL(response.url()).pathname });
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        pending.delete(task);
      });
    pending.add(task);
  };

  page.on('request', handleRequest);
  page.on('response', handleResponse);
  try {
    const initialResponse = page.waitForResponse(matches, { timeout: INITIAL_RESPONSE_TIMEOUT }).catch(() => null);
    await navigate();
    await initialResponse;
    await Promise.all(pending);
    console.log('[digest] feed capture initialized', {
      host: new URL(page.url()).hostname,
      matchingResponses,
      observedPosts: posts.size,
      expectedPosts: maxPosts,
    });
    if (matchingResponses === 0) {
      const path = new URL(page.url()).pathname;
      console.warn('[digest] no initial feed response', { path, observedRequests });
      if (/login|checkpoint|challenge|authwall/i.test(path)) {
        throw new Error('AUTH_REQUIRED');
      }
      throw new Error('FEED_CAPTURE_TIMEOUT');
    }

    let stalledRequests = 0;
    let advanceEnabled = advance !== undefined;
    for (let requests = 0; posts.size < maxPosts && requests < MAX_SCROLLS; requests += 1) {
      const previousPostCount = posts.size;
      let fetched = false;
      let directPosts: RawPost[] = [];
      if (advanceEnabled && advance !== undefined && latestResponse !== null) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        try {
          const result = await Promise.race([
            advance(latestResponse).catch(() => ({ fetched: false, posts: [] })),
            new Promise<{ fetched: boolean; posts: RawPost[] }>((resolve) => {
              timeout = setTimeout(() => {
                timedOut = true;
                resolve({ fetched: false, posts: [] });
              }, ADVANCE_TIMEOUT_MS);
            }),
          ]);
          fetched = result.fetched;
          directPosts = result.posts;
        } finally {
          clearTimeout(timeout);
        }
        if (timedOut) {
          advanceEnabled = false;
          console.warn('[digest] direct feed fetch timed out', { host: new URL(page.url()).hostname });
        }
      }
      for (const post of directPosts) {
        if (hasPostContent(post) && !posts.has(post.id)) {
          posts.set(post.id, post);
          onPost?.(post);
        }
      }
      if (!fetched) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            scroll?.() ?? page.mouse.wheel(0, SCROLL_DISTANCE),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('FEED_SCROLL_TIMEOUT')), SCROLL_TIMEOUT_MS);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
        await page.waitForTimeout(SCROLL_PAUSE_MS);
      }
      if (!fetched) {
        await Promise.all(pending);
      }
      stalledRequests = posts.size === previousPostCount ? stalledRequests + 1 : 0;
      if (requests === 0 || (requests + 1) % 5 === 0) {
        console.log('[digest] feed capture progress', {
          host: new URL(page.url()).hostname,
          requests: requests + 1,
          matchingResponses,
          observedPosts: posts.size,
          stalledRequests,
          directFetch: fetched,
        });
      }
      if (advance !== undefined && stalledRequests >= MAX_STALLED_REQUESTS) {
        console.warn('[digest] feed capture stopped after no new posts', {
          host: new URL(page.url()).hostname,
          requests: requests + 1,
          matchingResponses,
          observedPosts: posts.size,
        });
        break;
      }
    }
  } finally {
    page.off('request', handleRequest);
    page.off('response', handleResponse);
    await Promise.all(pending);
  }

  if (matchingResponses === 0) {
    const currentURL = page.url();
    console.warn('[digest] no matching feed responses', {
      matchingResponses,
      expectedPosts: maxPosts,
      authRedirect: /login|checkpoint|challenge|authwall/i.test(currentURL),
    });
    if (/login|checkpoint|challenge|authwall/i.test(currentURL)) {
      throw new Error('AUTH_REQUIRED');
    }
    throw new Error('FEED_CAPTURE_TIMEOUT');
  }
  if (posts.size === 0 && firstResponseError !== null) {
    throw firstResponseError;
  }
  if (posts.size < maxPosts) {
    console.warn('[digest] feed post threshold not reached', {
      matchingResponses,
      observedPosts: posts.size,
      expectedPosts: maxPosts,
    });
    throw new Error('FEED_POST_THRESHOLD_NOT_REACHED');
  }

  return [...posts.values()].slice(0, maxPosts);
}
