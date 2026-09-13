'use node';

import { v } from 'convex/values';
import { action } from '../_generated/server';
import { array, firstStringAt, object, string } from './data';
import { runServiceScraper } from './shared';
import { scrapedPostValidator, type OpenedBrowserSession, type RawPost } from './types';

const PAGE_SIZE = 20;

function vectorImageURL(value: unknown): string | null {
  const record = object(value);
  const rootURL = string(record?.rootUrl);
  if (rootURL === null) {
    return null;
  }
  const artifacts = array(record?.artifacts)
    .map((artifact) => object(artifact))
    .filter((artifact) => artifact !== null)
    .sort(
      (left, right) =>
        Number(right.width ?? 0) * Number(right.height ?? 0) - Number(left.width ?? 0) * Number(left.height ?? 0),
    );
  const segment = string(artifacts[0]?.fileIdentifyingUrlPathSegment);
  return segment === null ? null : `${rootURL}${segment}`;
}

function linkedInImages(update: Record<string, unknown>): string[] {
  const content = object(update.content);
  const images = array(content?.images).flatMap((image) =>
    array(object(image)?.attributes)
      .map((attribute) => vectorImageURL(object(attribute)?.vectorImage))
      .filter((url): url is string => url !== null),
  );
  return [...new Set(images)];
}

function normalizeLinkedInUpdate(update: unknown): RawPost | null {
  const record = object(update);
  if (record === null || object(object(object(record.updateMetadata)?.trackingData)?.sponsoredTracking) !== null) {
    return null;
  }

  const id = firstStringAt(record, [['entityUrn'], ['updateMetadata', 'urn']]);
  const author = firstStringAt(record, [['actor', 'name', 'text']]);
  if (id === null || author === null) {
    return null;
  }

  return {
    id,
    author,
    body: firstStringAt(record, [['commentary', 'text', 'text']]) ?? '',
    imageUrls: linkedInImages(record),
  };
}

function parseLinkedInResponse(data: unknown): RawPost[] {
  const record = object(data);
  const updates = new Map(
    array(record?.included)
      .filter((candidate) => string(object(candidate)?.$type) === 'com.linkedin.voyager.feed.render.UpdateV2')
      .map((candidate) => [string(object(candidate)?.entityUrn), candidate] as const)
      .filter((entry): entry is readonly [string, unknown] => entry[0] !== null),
  );
  const references = array(object(record?.data)?.['*elements']).filter(
    (reference): reference is string => typeof reference === 'string',
  );
  const visibleUpdates =
    references.length > 0
      ? references.map((reference) => updates.get(reference)).filter((update) => update !== undefined)
      : [...updates.values()];
  return visibleUpdates.map(normalizeLinkedInUpdate).filter((post): post is RawPost => post !== null);
}

function paginationToken(data: unknown): string | null {
  return firstStringAt(data, [['data', 'metadata', 'paginationToken']]);
}

async function fetchFeedPage(session: OpenedBrowserSession, start: number, token: string | null): Promise<unknown> {
  const params = new URLSearchParams({
    q: 'chronFeed',
    count: String(PAGE_SIZE),
    start: String(start),
  });
  if (token !== null) {
    params.set('paginationToken', token);
  }
  const endpoint = `https://www.linkedin.com/voyager/api/feed/updatesV2?${params}`;

  return await session.page.evaluate(async (url) => {
    const cookie = document.cookie.split('; ').find((entry) => entry.startsWith('JSESSIONID='));
    const csrfToken = decodeURIComponent(cookie?.slice('JSESSIONID='.length) ?? '').replace(/^"|"$/g, '');
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': csrfToken,
        'x-restli-protocol-version': '2.0.0',
      },
    });
    if (!response.ok) {
      throw new Error(`LinkedIn feed request failed with status ${response.status}`);
    }
    return (await response.json()) as unknown;
  }, endpoint);
}

async function selectRecentFeed(session: OpenedBrowserSession) {
  const sortBy = session.page.getByText(/^Sort by:/i).first();
  await sortBy.waitFor({ state: 'visible', timeout: 30_000 });
  if (/recent/i.test((await sortBy.textContent()) ?? '')) {
    return;
  }
  await sortBy.click();
  const recent = session.page.getByText(/^Recent$/i).last();
  await recent.waitFor({ state: 'visible', timeout: 15_000 });
  const recentRequest = session.page
    .waitForRequest(
      (request) =>
        request.url().includes('/voyager/api/feed/updatesV2') ||
        request.url().includes('sduiid=com.linkedin.sdui.pagers.feed.mainFeed'),
      { timeout: 30_000 },
    )
    .catch(() => null);
  await recent.click();
  await recentRequest;
}

export async function scrapeLinkedInFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  await session.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  if (/login|checkpoint|authwall/i.test(session.page.url())) {
    throw new Error('AUTH_REQUIRED');
  }
  await selectRecentFeed(session);

  const posts = new Map<string, RawPost>();
  const seenTokens = new Set<string>();
  let token: string | null = null;
  for (let start = 0; posts.size < maxPosts; start += PAGE_SIZE) {
    const data = await fetchFeedPage(session, start, token);
    for (const post of parseLinkedInResponse(data)) {
      posts.set(post.id, post);
    }
    const nextToken = paginationToken(data);
    if (nextToken === null || seenTokens.has(nextToken)) {
      break;
    }
    seenTokens.add(nextToken);
    token = nextToken;
  }
  return [...posts.values()].slice(0, maxPosts);
}

export const scrape = action({
  args: { maxPosts: v.number() },
  returns: v.array(scrapedPostValidator),
  handler: async (ctx, { maxPosts }) => {
    return await runServiceScraper(ctx, 'linkedin', maxPosts, scrapeLinkedInFeed);
  },
});
