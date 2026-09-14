'use node';

import type { Page, Response } from 'playwright-core';
import { hasPostContent } from './shared';
import type { RawPost } from './types';

type ResponseParser = (data: unknown, response: Response) => RawPost[];
const INITIAL_RESPONSE_TIMEOUT = 30_000;
const MAX_SCROLLS = 240;
const SCROLL_DISTANCE = 8_000;
const SCROLL_PAUSE_MS = 500;

export async function collectFeedResponses({
  page,
  maxPosts,
  navigate,
  matches,
  parse,
}: {
  page: Page;
  maxPosts: number;
  navigate: () => Promise<void>;
  matches: (response: Response) => boolean;
  parse: ResponseParser;
}): Promise<RawPost[]> {
  const posts = new Map<string, RawPost>();
  const pending = new Set<Promise<void>>();
  let matchingResponses = 0;
  let firstResponseError: unknown = null;

  const handleResponse = (response: Response) => {
    if (!matches(response)) {
      return;
    }

    matchingResponses += 1;
    const task: Promise<void> = response
      .text()
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
          }
        }
      })
      .catch((error: unknown) => {
        firstResponseError ??= error;
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  };

  page.on('response', handleResponse);
  try {
    const initialResponse = page.waitForResponse(matches, { timeout: INITIAL_RESPONSE_TIMEOUT }).catch(() => null);
    await navigate();
    await initialResponse;
    await Promise.all(pending);

    for (let scrolls = 0; posts.size < maxPosts && scrolls < MAX_SCROLLS; scrolls += 1) {
      await page.mouse.wheel(0, SCROLL_DISTANCE);
      await page.waitForTimeout(SCROLL_PAUSE_MS);
      await Promise.all(pending);
    }
  } finally {
    page.off('response', handleResponse);
    await Promise.all(pending);
  }

  if (matchingResponses === 0) {
    const currentURL = page.url();
    if (/login|checkpoint|challenge|authwall/i.test(currentURL)) {
      throw new Error('AUTH_REQUIRED');
    }
    throw new Error('FEED_CAPTURE_TIMEOUT');
  }
  if (posts.size === 0 && firstResponseError !== null) {
    throw firstResponseError;
  }
  if (posts.size < maxPosts) {
    throw new Error('FEED_POST_THRESHOLD_NOT_REACHED');
  }

  return [...posts.values()].slice(0, maxPosts);
}
