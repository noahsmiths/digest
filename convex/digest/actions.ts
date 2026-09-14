'use node';

import { createOpenAI } from '@ai-sdk/openai';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { env, internalAction } from '../_generated/server';
import { digestDecisionValidator, serviceValidator } from '../schema';
import { scrapeInstagramFeed } from '../scraping/instagram';
import { scrapeLinkedInFeed } from '../scraping/linkedin';
import { scrapeServiceWithSession, withBrowserSession } from '../scraping/shared';
import type { ScrapedPost, ServiceScraper } from '../scraping/types';
import { scrapeXFeed } from '../scraping/x';
import type { Service } from '../utilities/sites';
import { classifyPostsWithModel, type DigestClassification } from './classification';

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

const serviceScrapers: Record<Service, ServiceScraper> = {
  instagram: scrapeInstagramFeed,
  x: scrapeXFeed,
  linkedin: scrapeLinkedInFeed,
};

const SERVICE_RETRY_DELAYS = [1_000, 2_000, 4_000];

type ServiceScrapeResult = {
  service: Service;
  status: 'succeeded' | 'failed';
  postCount: number;
  errorCode?: string;
};

type ScrapeContext = {
  service: Service;
  firecrawlProfileName: string | null;
};

function scrapeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AUTH_REQUIRED')) return 'AUTH_REQUIRED';
  if (message.includes('FEED_CAPTURE_TIMEOUT')) return 'FEED_CAPTURE_TIMEOUT';
  if (message.includes('FEED_POST_THRESHOLD_NOT_REACHED')) return 'POST_THRESHOLD_NOT_REACHED';
  return 'SCRAPE_FAILED';
}

async function scrapeWithRetries(
  ctx: Parameters<typeof scrapeServiceWithSession>[0],
  session: Parameters<typeof scrapeServiceWithSession>[1],
  maxPosts: number,
  scrape: ServiceScraper,
): Promise<ScrapedPost[]> {
  let lastError: unknown = null;
  for (const delay of SERVICE_RETRY_DELAYS) {
    try {
      return await scrapeServiceWithSession(ctx, session, maxPosts, scrape);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export const scrapeServicesToDigest = internalAction({
  args: { digestId: v.id('digests'), services: v.array(serviceValidator), maxPosts: v.number() },
  returns: v.array(
    v.object({
      service: serviceValidator,
      status: v.union(v.literal('succeeded'), v.literal('failed')),
      postCount: v.number(),
      errorCode: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { digestId, services, maxPosts }): Promise<ServiceScrapeResult[]> => {
    const contexts: ScrapeContext[] = await ctx.runQuery(internal.digests.getScrapeContexts, { digestId });
    const contextsByService = new Map(contexts.map((context) => [context.service, context]));
    const profileName = contexts.find((context) => context.firecrawlProfileName !== null)?.firecrawlProfileName;
    if (profileName === undefined || profileName === null) {
      return services.map((service) => ({
        service,
        status: 'failed' as const,
        postCount: 0,
        errorCode: 'AUTH_REQUIRED',
      }));
    }

    return await withBrowserSession(profileName, async (session) => {
      const results: ServiceScrapeResult[] = [];
      for (const service of services) {
        if (contextsByService.get(service)?.firecrawlProfileName === null) {
          results.push({ service, status: 'failed', postCount: 0, errorCode: 'AUTH_REQUIRED' });
          continue;
        }
        try {
          const posts = await scrapeWithRetries(ctx, session, maxPosts, serviceScrapers[service]);
          const postCount = await ctx.runMutation(internal.digests.saveScrapedPosts, { digestId, service, posts });
          results.push({ service, status: 'succeeded', postCount });
        } catch (error) {
          results.push({ service, status: 'failed', postCount: 0, errorCode: scrapeErrorCode(error) });
        }
      }
      return results;
    });
  },
});

export const classifyPosts = internalAction({
  args: { digestPostIds: v.array(v.id('digestPosts')) },
  returns: v.array(
    v.object({
      digestPostId: v.id('digestPosts'),
      category: digestDecisionValidator,
    }),
  ),
  handler: async (ctx, { digestPostIds }): Promise<DigestClassification[]> => {
    const classificationContext = await ctx.runQuery(internal.digests.getPostsForClassification, {
      digestPostIds,
    });
    if (classificationContext.posts.length !== digestPostIds.length) {
      throw new Error('DIGEST_POST_NOT_FOUND');
    }

    return await classifyPostsWithModel(
      ctx,
      classificationContext.userTokenIdentifier,
      classificationContext.posts,
      openai.chat('gpt-5'),
    );
  },
});
