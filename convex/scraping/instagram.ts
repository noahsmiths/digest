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
  return { id, author, body, imageUrls: instagramImages(record) };
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
  if (!url.includes('/graphql/query')) {
    return false;
  }
  const body = response.request().postData() ?? '';
  return /feedtimeline|feed_timeline|polarisfeed|followingfeed/i.test(body);
}

export async function scrapeInstagramFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  return await collectFeedResponses({
    page: session.page,
    maxPosts,
    matches: isInstagramFeedResponse,
    parse: parseInstagramResponse,
    navigate: async () => {
      await session.page.goto('https://www.instagram.com/?variant=following', {
        waitUntil: 'domcontentloaded',
      });
    },
  });
}

export const scrape = action({
  args: { maxPosts: v.number() },
  returns: v.array(scrapedPostValidator),
  handler: async (ctx, { maxPosts }) => {
    return await runServiceScraper(ctx, 'instagram', maxPosts, scrapeInstagramFeed);
  },
});
