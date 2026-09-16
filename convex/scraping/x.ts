'use node';

import { v } from 'convex/values';
import type { Response } from 'playwright-core';
import { action } from '../_generated/server';
import { array, containsKey, firstStringAt, object, path, string, uniqueStrings } from './data';
import { collectFeedResponses } from './network';
import { runServiceScraper } from './shared';
import { scrapedPostValidator, type OpenedBrowserSession, type RawPost } from './types';

function unwrapTweet(value: unknown): unknown {
  const record = object(value);
  if (record === null) {
    return null;
  }
  if (record.__typename === 'TweetWithVisibilityResults') {
    return unwrapTweet(record.tweet);
  }

  const retweet = path(record, ['legacy', 'retweeted_status_result', 'result']);
  return retweet === null ? record : unwrapTweet(retweet);
}

function xImages(tweet: unknown): string[] {
  const currentMedia = array(object(tweet)?.media_entities).flatMap((entity) => {
    const mediaInfo = object(path(entity, ['media_results', 'result', 'media_info']));
    return [string(mediaInfo?.original_img_url), stringAtObject(mediaInfo?.preview_image, 'original_img_url')];
  });
  const legacyMedia = array(path(tweet, ['legacy', 'extended_entities', 'media'])).map((media) =>
    firstStringAt(media, [['media_url_https'], ['media_url']]),
  );
  return uniqueStrings([...currentMedia, ...legacyMedia]);
}

function stringAtObject(value: unknown, key: string) {
  return string(object(value)?.[key]);
}

function xMutual(tweet: Record<string, unknown>): boolean | undefined {
  const user = object(path(tweet, ['core', 'user_results', 'result']));
  const legacyUser = object(user?.legacy);
  const perspectives = object(user?.relationship_perspectives);
  const following = perspectives?.following ?? user?.following ?? legacyUser?.following;
  const followedBy = perspectives?.followed_by ?? user?.followed_by ?? legacyUser?.followed_by;
  if (following === false || followedBy === false) return false;
  return following === true && followedBy === true ? true : undefined;
}

function normalizeTweet(value: unknown): RawPost | null {
  const tweet = object(unwrapTweet(value));
  if (tweet === null) {
    return null;
  }

  const id = firstStringAt(tweet, [['rest_id'], ['legacy', 'id_str']]);
  const author = firstStringAt(tweet, [
    ['core', 'user_results', 'result', 'core', 'name'],
    ['core', 'user_results', 'result', 'legacy', 'name'],
    ['core', 'user_results', 'result', 'core', 'screen_name'],
    ['core', 'user_results', 'result', 'legacy', 'screen_name'],
  ]);
  if (id === null || author === null) {
    return null;
  }

  const body =
    firstStringAt(tweet, [
      ['note_tweet', 'note_tweet_results', 'result', 'text'],
      ['legacy', 'full_text'],
    ]) ?? '';
  const isMutual = xMutual(tweet);
  return { id, author, body, imageUrls: xImages(tweet), ...(isMutual === undefined ? {} : { isMutual }) };
}

function timelineEntries(data: unknown): unknown[] {
  const instructions = array(path(data, ['data', 'home', 'home_timeline_urt', 'instructions']));
  return instructions.flatMap((instruction) => {
    const record = object(instruction);
    if (record === null) {
      return [];
    }
    return [...array(record.entries), ...(record.entry === undefined ? [] : [record.entry])];
  });
}

function tweetsFromEntry(entry: unknown): unknown[] {
  const direct = path(entry, ['content', 'itemContent', 'tweet_results', 'result']);
  const moduleItems = array(path(entry, ['content', 'items'])).map((item) =>
    path(item, ['item', 'itemContent', 'tweet_results', 'result']),
  );
  return [...(direct === null ? [] : [direct]), ...moduleItems.filter((item) => item !== null)];
}

function parseXResponse(data: unknown): RawPost[] {
  return timelineEntries(data).flatMap((entry) => {
    if (containsKey(entry, /promoted/i)) {
      return [];
    }
    return tweetsFromEntry(entry)
      .map(normalizeTweet)
      .filter((post): post is RawPost => post !== null);
  });
}

function isFollowingTimelineResponse(response: Response) {
  return /\/HomeLatestTimeline(?:\?|$)/.test(response.url());
}

export async function scrapeXFeed(session: OpenedBrowserSession, maxPosts: number): Promise<RawPost[]> {
  return await collectFeedResponses({
    page: session.page,
    maxPosts,
    matches: isFollowingTimelineResponse,
    parse: parseXResponse,
    navigate: async () => {
      await session.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
      const followingTab = session.page.getByRole('tab', { name: /^Following$/i }).first();
      if (
        await followingTab
          .waitFor({ state: 'visible', timeout: 15_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await followingTab.click();
      } else {
        const timelineTabs = session.page.locator('main [role="tab"]');
        const fallbackFollowingTab = timelineTabs.nth(1);
        await fallbackFollowingTab.waitFor({ state: 'visible', timeout: 15_000 });
        await fallbackFollowingTab.click();
      }
    },
  });
}

export const scrape = action({
  args: { maxPosts: v.number() },
  returns: v.array(scrapedPostValidator),
  handler: async (ctx, { maxPosts }) => {
    return await runServiceScraper(ctx, 'x', maxPosts, scrapeXFeed);
  },
});
