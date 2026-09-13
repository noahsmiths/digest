import type { Page, Response } from 'playwright-core';
import type { RawPost } from './types';

type ResponseParser = (data: unknown, response: Response) => RawPost[];
const INITIAL_RESPONSE_TIMEOUT = 30_000;
const PAGINATION_RESPONSE_TIMEOUT = 10_000;

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
          if (!posts.has(post.id)) {
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

    let attemptsWithoutProgress = 0;
    while (posts.size < maxPosts) {
      const previousSize = posts.size;
      const nextResponse = page.waitForResponse(matches, { timeout: PAGINATION_RESPONSE_TIMEOUT }).catch(() => null);
      await page.mouse.wheel(0, 4_000);
      await nextResponse;
      await Promise.all(pending);

      if (posts.size === previousSize) {
        attemptsWithoutProgress += 1;
      } else {
        attemptsWithoutProgress = 0;
      }
      if (attemptsWithoutProgress >= 3) {
        break;
      }
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

  return [...posts.values()].slice(0, maxPosts);
}
