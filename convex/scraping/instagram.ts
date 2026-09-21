'use node';

import { v } from 'convex/values';
import type { Page, Response } from 'playwright-core';
import { action } from '../_generated/server';
import { array, collectObjects, firstStringAt, object, string, stringAt, uniqueStrings } from './data';
import { collectFeedResponses } from './network';
import { runServiceScraper } from './shared';
import { scrapedPostValidator, type OpenedBrowserSession, type RawPost } from './types';

const MAX_FOLLOWER_SCROLLS = 2_500;
const FOLLOWER_SCROLL_PAUSE_MS = 100;
const MAX_STALLED_FOLLOWER_SCROLLS = 30;

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

function instagramMutual(media: Record<string, unknown>): boolean | undefined {
  const relationship = object(object(media.user)?.friendship_status);
  const following = relationship?.following;
  const followedBy = relationship?.followed_by;
  return typeof following === 'boolean' && typeof followedBy === 'boolean' ? following && followedBy : undefined;
}

function normalizeInstagramMedia(media: unknown): RawPost | null {
  const record = object(media);
  if (record === null || isPromotedMedia(record)) {
    return null;
  }

  const id = firstStringAt(record, [['code'], ['pk'], ['id']]);
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
  const authorUsername = firstStringAt(record, [
    ['user', 'username'],
    ['owner', 'username'],
  ]);
  const relationship = object(object(record.user)?.friendship_status);
  const isFollowing = relationship?.following;
  const isMutual = instagramMutual(record);
  return {
    id,
    author,
    body,
    imageUrls: instagramImages(record),
    ...(authorUsername === null ? {} : { authorUsername }),
    ...(typeof isFollowing === 'boolean' ? { isFollowing } : {}),
    ...(isMutual === undefined ? {} : { isMutual }),
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

function isInstagramFeedResponse(response: Response) {
  const url = response.url();
  if (url.includes('/api/v1/feed/timeline')) {
    return true;
  }
  if (!url.includes('/graphql/query') && !url.includes('/api/graphql')) {
    return false;
  }
  const requestName = new URLSearchParams(response.request().postData() ?? '').get('fb_api_req_friendly_name') ?? '';
  return /feedtimeline|feed_timeline|polarisfeed|followingfeed/i.test(requestName);
}

async function parseInstagramArticles(page: Page): Promise<RawPost[]> {
  return await page.locator('article').evaluateAll((articles) =>
    articles.flatMap((article) => {
      const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const postLink = links.find((link) => /^\/(?:p|reel)\/[^/]+\/?$/.test(new URL(link.href).pathname));
      const authorLink = links.find((link) => /^\/[A-Za-z0-9._]+\/?$/.test(new URL(link.href).pathname));
      if (postLink === undefined || authorLink === undefined) return [];
      const id = new URL(postLink.href).pathname.split('/')[2];
      const authorUsername = new URL(authorLink.href).pathname.split('/')[1];
      const text = (article as HTMLElement).innerText;
      const secondAuthor = text.indexOf(authorUsername, text.indexOf(authorUsername) + authorUsername.length);
      const body =
        secondAuthor < 0
          ? ''
          : text
              .slice(secondAuthor + authorUsername.length)
              .split(/\n(?:View all|Add a comment|Liked by|See translation)/i)[0]
              .replace(/\s+more\s*$/i, '')
              .trim();
      const imageUrls = Array.from(article.querySelectorAll<HTMLImageElement>('img'))
        .filter((image) => !/profile picture/i.test(image.alt) && image.getBoundingClientRect().width >= 100)
        .map((image) => image.currentSrc || image.src)
        .filter((url) => url !== '');
      return [{ id, author: authorUsername, authorUsername, body, imageUrls, isFollowing: true }];
    }),
  );
}

async function collectInstagramFollowers(
  session: OpenedBrowserSession,
): Promise<{ usernames: Set<string>; complete: boolean }> {
  const notificationsDialog = session.page.getByRole('dialog').filter({ hasText: 'Turn on Notifications' });
  if (await notificationsDialog.isVisible()) {
    await notificationsDialog.getByText(/^Not Now$/i).click();
  }
  const profileURL = await session.page
    .getByText(/^Profile$/i)
    .first()
    .evaluate((node) => node.closest('a')?.href ?? null);
  if (profileURL === null) {
    throw new Error('Instagram profile navigation is unavailable');
  }
  await session.page.goto(profileURL, { waitUntil: 'domcontentloaded' });

  const followersLink = session.page.getByRole('link', { name: /\bfollowers\b/i }).first();
  await followersLink.waitFor({ state: 'visible', timeout: 10_000 });
  const countText = (await followersLink.innerText()).trim().replace(/\s+/g, ' ');
  const countMatch = /(?:^|\s)(\d[\d,]*)(?=\s|$)/.exec(countText);
  const expectedCount = countMatch === null ? null : Number(countMatch[1].replace(/,/g, ''));
  if (expectedCount === 0) {
    return { usernames: new Set(), complete: true };
  }

  await followersLink.click();
  const dialog = session.page.getByRole('dialog').first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  const usernames = new Set<string>();
  let stalledScrolls = 0;
  for (let scrolls = 0; scrolls < MAX_FOLLOWER_SCROLLS; scrolls += 1) {
    const state = await dialog.evaluate((root) => {
      const visibleUsernames = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((link) => /^\/([A-Za-z0-9._]+)\/?$/.exec(new URL(link.href).pathname)?.[1]?.toLowerCase())
        .filter((username): username is string => username !== undefined);
      const scrollable = Array.from(root.querySelectorAll<HTMLElement>('div'))
        .filter(
          (element) =>
            element.scrollHeight > element.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(element).overflowY),
        )
        .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];
      if (scrollable === undefined) {
        return { visibleUsernames, moved: false, atBottom: true };
      }
      const previousTop = scrollable.scrollTop;
      scrollable.scrollTop += Math.max(300, scrollable.clientHeight);
      return {
        visibleUsernames,
        moved: scrollable.scrollTop > previousTop,
        atBottom: scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 8,
      };
    });
    const previousCount = usernames.size;
    for (const username of state.visibleUsernames) {
      usernames.add(username);
    }
    if (expectedCount !== null && usernames.size >= expectedCount) {
      return { usernames, complete: true };
    }
    stalledScrolls = usernames.size > previousCount || state.moved ? 0 : stalledScrolls + 1;
    if (state.atBottom && stalledScrolls >= MAX_STALLED_FOLLOWER_SCROLLS) {
      return { usernames, complete: expectedCount === null && usernames.size > 0 };
    }
    await session.page.waitForTimeout(FOLLOWER_SCROLL_PAUSE_MS);
  }
  return { usernames, complete: false };
}

async function captureInstagramFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  return await collectFeedResponses({
    page: session.page,
    maxPosts,
    matches: isInstagramFeedResponse,
    parse: parseInstagramResponse,
    parsePage: parseInstagramArticles,
    scroll: async () => {
      await session.page.evaluate(() => {
        const scroller = Array.from(document.querySelectorAll<HTMLElement>('div'))
          .filter(
            (element) =>
              element.querySelector('article') !== null &&
              element.scrollHeight > element.clientHeight + 100 &&
              /auto|scroll/.test(getComputedStyle(element).overflowY),
          )
          .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];
        if (scroller === undefined) {
          window.scrollTo(0, document.body.scrollHeight);
        } else {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });
    },
    navigate: async () => {
      let feedSeen = false;
      const markFeed = (response: Response) => {
        feedSeen ||= isInstagramFeedResponse(response);
      };
      session.page.on('response', markFeed);
      try {
        await session.page.goto('https://www.instagram.com/?variant=following', {
          waitUntil: 'domcontentloaded',
        });
        for (let index = 0; index < 5 && !feedSeen; index += 1) {
          await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await session.page.waitForTimeout(750);
        }
        if (!feedSeen && (await session.page.getByText(/^Following$/i).count()) > 0) {
          await session.page
            .getByText(/^Following$/i)
            .first()
            .click({ timeout: 1_500 })
            .catch(() => null);
          await session.page.waitForTimeout(750);
        }
        for (let index = 0; index < 3 && !feedSeen; index += 1) {
          await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await session.page.waitForTimeout(750);
        }
        console.log('[digest] Instagram feed navigation', {
          feedSeen,
          articleCount: await session.page.locator('article').count(),
          followingControls: await session.page.getByText(/^Following$/i).count(),
        });
      } finally {
        session.page.off('response', markFeed);
      }
    },
  });
}

export async function scrapeInstagramFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  const posts = await captureInstagramFeed(session, maxPosts);
  let followers: { usernames: Set<string>; complete: boolean };
  try {
    followers = await collectInstagramFollowers(session);
  } catch (error) {
    console.warn('[digest] Instagram followers UI capture failed', { error });
    return posts;
  }
  console.log('[digest] Instagram followers collected', {
    count: followers.usernames.size,
    complete: followers.complete,
  });
  return posts.map((post) => {
    if (post.isFollowing === false || post.authorUsername === undefined) {
      return post;
    }
    const isFollower = followers.usernames.has(post.authorUsername.toLowerCase());
    if (isFollower) {
      return { ...post, isMutual: true };
    }
    if (followers.complete && post.isFollowing === true) {
      return { ...post, isMutual: false };
    }
    return post;
  });
}

export const scrape = action({
  args: { maxPosts: v.number() },
  returns: v.array(scrapedPostValidator),
  handler: async (ctx, { maxPosts }) => {
    return await runServiceScraper(ctx, 'instagram', maxPosts, scrapeInstagramFeed);
  },
});
