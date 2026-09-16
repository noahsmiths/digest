'use node';

import { v } from 'convex/values';
import type { Response } from 'playwright-core';
import { action } from '../_generated/server';
import { array, collectObjects, firstStringAt, object, string, stringAt, uniqueStrings } from './data';
import { collectFeedResponses } from './network';
import { runServiceScraper } from './shared';
import { scrapedPostValidator, type OpenedBrowserSession, type RawPost } from './types';

function bestImageURL(media: unknown): string | null {
  const candidates = array(object(object(media)?.image_versions2)?.candidates)
    .map((candidate) => object(candidate))
    .filter((candidate) => candidate !== null)
    .sort(
      (left, right) =>
        Number(right.width ?? 0) * Number(right.height ?? 0) - Number(left.width ?? 0) * Number(left.height ?? 0),
    );
  return string(candidates[0]?.url) ?? stringAt(media, ['display_url']);
}

function instagramImages(media: unknown): string[] {
  const carousel = array(object(media)?.carousel_media);
  if (carousel.length > 0) {
    return uniqueStrings(carousel.map(bestImageURL));
  }
  return uniqueStrings([bestImageURL(media)]);
}

function isPromotedMedia(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isPromotedMedia);
  }
  const record = object(value);
  if (record === null) {
    return false;
  }
  return Object.entries(record).some(([key, child]) => {
    if (/^(ad_metadata|sponsored_label_info|is_ad)$/i.test(key)) {
      return typeof child === 'boolean' ? child : child !== null && child !== undefined && child !== '';
    }
    return isPromotedMedia(child);
  });
}

function instagramFollowing(media: Record<string, unknown>): boolean | undefined {
  const relationship = object(object(media.user)?.friendship_status);
  const following = relationship?.following;
  return typeof following === 'boolean' ? following : undefined;
}

function normalizeInstagramMedia(media: unknown): RawPost | null {
  const record = object(media);
  if (record === null || isPromotedMedia(record)) {
    return null;
  }

  const id = firstStringAt(record, [['pk'], ['id'], ['code']]);
  const author = firstStringAt(record, [
    ['user', 'full_name'],
    ['user', 'username'],
    ['owner', 'full_name'],
    ['owner', 'username'],
  ]);
  if (id === null || author === null) {
    return null;
  }

  const body =
    firstStringAt(record, [
      ['caption', 'text'],
      ['edge_media_to_caption', 'edges', '0', 'node', 'text'],
    ]) ?? '';
  const authorUserId = firstStringAt(record, [['user', 'pk'], ['user', 'id'], ['owner', 'pk'], ['owner', 'id']]);
  const authorUsername = firstStringAt(record, [['user', 'username'], ['owner', 'username']]);
  const isFollowing = instagramFollowing(record);
  return {
    id,
    author,
    body,
    imageUrls: instagramImages(record),
    ...(authorUserId === null ? {} : { authorUserId }),
    ...(authorUsername === null ? {} : { authorUsername }),
    ...(isFollowing === undefined ? {} : { isFollowing }),
  };
}

function parseInstagramResponse(data: unknown): RawPost[] {
  const feedItems = array(object(data)?.feed_items)
    .map((item) => object(item)?.media_or_ad)
    .filter((item) => item !== undefined);
  const media =
    feedItems.length > 0
      ? feedItems
      : collectObjects(data, (candidate) =>
          Boolean(candidate.user && (candidate.image_versions2 || candidate.carousel_media)),
        );

  return media.map(normalizeInstagramMedia).filter((post): post is RawPost => post !== null);
}

function isInstagramFeedCandidate(response: Response) {
  const url = response.url();
  if (url.includes('/api/v1/feed/timeline')) {
    return true;
  }
  if (!url.includes('/graphql/query')) {
    return false;
  }
  const body = response.request().postData() ?? '';
  return /feedtimeline|feed_timeline|polarisfeed|followingfeed/i.test(body);
}

function isInstagramFeedResponse(response: Response) {
  return isInstagramFeedCandidate(response) &&
    (response.url().includes('/api/v1/feed/timeline') || instagramRequestVariant(response) === 'following');
}

function instagramRequestVariant(response: Response): string | null {
  const variables = new URLSearchParams(response.request().postData() ?? '').get('variables');
  if (variables === null) return null;
  try {
    return string(object(JSON.parse(variables))?.variant);
  } catch {
    return null;
  }
}

function graphqlFeedCursor(data: unknown): string | null {
  const connections = collectObjects(data, (candidate) =>
    string(object(candidate.page_info)?.end_cursor) !== null && array(candidate.edges).length > 0,
  );
  const feed = connections.find((candidate) => parseInstagramResponse(candidate).length > 0);
  const pageInfo = object(feed?.page_info);
  return pageInfo?.has_next_page === false ? null : string(pageInfo?.end_cursor);
}

function replacePaginationCursor(value: unknown, cursor: string): boolean {
  if (Array.isArray(value)) {
    return value.some((child) => replacePaginationCursor(child, cursor));
  }
  const record = object(value);
  if (record === null) {
    return false;
  }
  for (const [key, child] of Object.entries(record)) {
    if (/^(after|cursor|max_id|pagination_token)$/i.test(key) && (typeof child === 'string' || child === null)) {
      record[key] = cursor;
      return true;
    }
    if (replacePaginationCursor(child, cursor)) {
      return true;
    }
  }
  return false;
}

function instagramFeedAdvance(session: OpenedBrowserSession) {
  const seenCursors = new Set<string>();
  let templateResponse: Response | null = null;
  let latestData: unknown = null;

  return async (response: Response): Promise<{ fetched: boolean; posts: RawPost[] }> => {
    const sourceResponse = templateResponse ?? response;
    const request = sourceResponse.request();
    const timeline = sourceResponse.url().includes('/api/v1/feed/timeline') && request.method() === 'GET';
    const graphql = sourceResponse.url().includes('/graphql/query') && request.method() === 'POST';
    if (!timeline && !graphql) {
      return { fetched: false, posts: [] };
    }
    const data: unknown = latestData ?? await sourceResponse.json();
    const cursor = timeline ? string(object(data)?.next_max_id) : graphqlFeedCursor(data);
    if (cursor === null || seenCursors.has(cursor)) {
      return { fetched: false, posts: [] };
    }

    const endpoint = new URL(request.url());
    let body: string | undefined;
    if (timeline) {
      endpoint.searchParams.set('max_id', cursor);
    } else {
      const params = new URLSearchParams(request.postData() ?? '');
      const variables = params.get('variables');
      if (variables === null) {
        return { fetched: false, posts: [] };
      }
      const parsedVariables: unknown = JSON.parse(variables);
      if (!replacePaginationCursor(parsedVariables, cursor)) {
        return { fetched: false, posts: [] };
      }
      params.set('variables', JSON.stringify(parsedVariables));
      body = params.toString();
    }
    const requestHeaders = await request.allHeaders();
    const headers = Object.fromEntries(
      Object.entries(requestHeaders).filter(([name]) =>
        ['accept', 'content-type', 'x-csrftoken', 'x-ig-app-id', 'x-instagram-ajax', 'x-requested-with'].includes(
          name.toLowerCase(),
        ),
      ),
    );

    const fetchedData: unknown = await session.page.evaluate(
      async ({ url, method, body, headers }) => {
        const result = await fetch(url, { method, body, credentials: 'include', headers });
        return result.ok ? await result.json() : null;
      },
      { url: endpoint.toString(), method: request.method(), body, headers },
    );
    if (fetchedData === null) {
      return { fetched: false, posts: [] };
    }
    seenCursors.add(cursor);
    templateResponse = sourceResponse;
    latestData = fetchedData;
    return { fetched: true, posts: parseInstagramResponse(fetchedData) };
  };
}

async function instagramFollowers(session: OpenedBrowserSession): Promise<{ ids: string[]; usernames: string[] }> {
  const cookies = await session.context.cookies('https://www.instagram.com/');
  const userId = cookies.find((cookie) => cookie.name === 'ds_user_id')?.value;
  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  const followerRequest = session.page.evaluate(async ({ userId, maxPages }) => {
    const ids = new Set<string>();
    const usernames = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let pages = 0; pages < maxPages; pages += 1) {
      const params = new URLSearchParams({ count: '200', search_surface: 'follow_list_page' });
      if (cursor !== null) {
        params.set('max_id', cursor);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let response: globalThis.Response;
      try {
        response = await fetch(`https://www.instagram.com/api/v1/friendships/${userId}/followers/?${params}`, {
          credentials: 'include',
          headers: { 'x-ig-app-id': '936619743392459' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        throw new Error(`Instagram followers request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        users?: Array<{ pk?: string; id?: string; username?: string }>;
        has_more?: boolean;
        next_max_id?: string;
      };
      if (!Array.isArray(data.users) || typeof data.has_more !== 'boolean') {
        throw new Error('Instagram followers response was incomplete');
      }
      for (const user of data.users) {
        const id = user.pk ?? user.id;
        if (id) {
          ids.add(id);
        }
        if (user.username) {
          usernames.add(user.username.toLowerCase());
        }
      }
      if (!data.has_more) {
        return { ids: [...ids], usernames: [...usernames] };
      }
      const nextCursor = data.next_max_id;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error('Instagram followers pagination stalled');
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error('Instagram followers page limit reached');
  }, { userId, maxPages: 1_000 });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      followerRequest,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('FOLLOWER_CAPTURE_TIMEOUT')), 120_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeInstagramFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  const posts = await collectFeedResponses({
    page: session.page,
    maxPosts,
    matches: isInstagramFeedResponse,
    parse: parseInstagramResponse,
    advance: instagramFeedAdvance(session),
    scroll: async () => {
      await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    },
    navigate: async () => {
      let feedSeen = false;
      const requestVariants = new Set<string>();
      const markFeed = (response: Response) => {
        if (isInstagramFeedCandidate(response)) {
          requestVariants.add(instagramRequestVariant(response) ?? 'unknown');
          feedSeen ||= isInstagramFeedResponse(response);
        }
      };
      session.page.on('response', markFeed);
      try {
        await session.page.goto('https://www.instagram.com/?variant=following', {
          waitUntil: 'domcontentloaded',
        });
        for (let index = 0; index < 5; index += 1) {
          await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await session.page.waitForTimeout(750);
        }
        if (!feedSeen && (await session.page.getByText(/^Following$/i).count()) > 0) {
          await session.page.getByText(/^Following$/i).first().click({ timeout: 5_000 }).catch(() => null);
          await session.page.waitForTimeout(1_500);
        }
        if (!feedSeen) {
          await session.page.goto('https://www.instagram.com/?variant=following', { waitUntil: 'domcontentloaded' });
          for (let index = 0; index < 3; index += 1) {
            await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await session.page.waitForTimeout(750);
          }
        }
        console.log('[digest] Instagram feed navigation', {
          path: new URL(session.page.url()).pathname,
          feedSeen,
          requestVariants: [...requestVariants],
          articleCount: await session.page.locator('article').count(),
        });
      } finally {
        session.page.off('response', markFeed);
      }
    },
  });
  const followers = await instagramFollowers(session);
  const followerIds = new Set(followers.ids);
  const followerUsernames = new Set(followers.usernames);
  console.log('[digest] Instagram followers collected', { count: followerIds.size });

  const classifiedPosts = posts.map((post) => {
    const identified = post.authorUserId !== undefined || post.authorUsername !== undefined;
    const followsUs =
      (post.authorUserId !== undefined && followerIds.has(post.authorUserId)) ||
      (post.authorUsername !== undefined && followerUsernames.has(post.authorUsername.toLowerCase()));
    const isMutual = post.isFollowing === false ? false : post.isFollowing === true && identified ? followsUs : undefined;
    return { ...post, ...(isMutual === undefined ? {} : { isMutual }) };
  });
  console.log('[digest] Instagram mutual classification', {
    known: classifiedPosts.filter((post) => post.isMutual !== undefined).length,
    mutuals: classifiedPosts.filter((post) => post.isMutual === true).length,
    followingTrue: posts.filter((post) => post.isFollowing === true).length,
    followingFalse: posts.filter((post) => post.isFollowing === false).length,
    followerIdMatches: posts.filter((post) => post.authorUserId !== undefined && followerIds.has(post.authorUserId)).length,
    followerUsernameMatches: posts.filter((post) => post.authorUsername !== undefined && followerUsernames.has(post.authorUsername.toLowerCase())).length,
    variant: new URL(session.page.url()).searchParams.get('variant') ?? 'default',
  });
  return classifiedPosts;
}

export const scrape = action({
  args: { maxPosts: v.number() },
  returns: v.array(scrapedPostValidator),
  handler: async (ctx, { maxPosts }) => {
    return await runServiceScraper(ctx, 'instagram', maxPosts, scrapeInstagramFeed);
  },
});
