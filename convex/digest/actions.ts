'use node';

import { createOpenAI } from '@ai-sdk/openai';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { env, internalAction } from '../_generated/server';
import { digestDecisionValidator, serviceValidator } from '../schema';
import { scrapeInstagramFeed } from '../scraping/instagram';
import { scrapeLinkedInFeed } from '../scraping/linkedin';
import { runServiceScraperWithProfile } from '../scraping/shared';
import type { ScrapedPost, ServiceScraper } from '../scraping/types';
import { scrapeXFeed } from '../scraping/x';
import type { Service } from '../utilities/sites';
import { classifyPostsWithModel, type DigestClassification } from './classification';
import { errorDetails } from './diagnostics';

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
  if (message.includes('FIRECRAWL_RATE_LIMITED')) return 'FIRECRAWL_RATE_LIMITED';
  if (message.includes('FEED_CAPTURE_TIMEOUT')) return 'FEED_CAPTURE_TIMEOUT';
  if (message.includes('FEED_SCROLL_TIMEOUT')) return 'FEED_SCROLL_TIMEOUT';
  if (message.includes('FOLLOWER_CAPTURE_TIMEOUT')) return 'FOLLOWER_CAPTURE_TIMEOUT';
  if (message.includes('FEED_POST_THRESHOLD_NOT_REACHED')) return 'POST_THRESHOLD_NOT_REACHED';
  return 'SCRAPE_FAILED';
}

async function scrapeWithRetries(
  ctx: Parameters<typeof runServiceScraperWithProfile>[0],
  profileName: string,
  digestId: Id<'digests'>,
  service: Service,
  maxPosts: number,
  scrape: ServiceScraper,
): Promise<ScrapedPost[]> {
  let lastError: unknown = null;
  for (let index = 0; index < SERVICE_RETRY_DELAYS.length; index += 1) {
    try {
      return await runServiceScraperWithProfile(ctx, profileName, maxPosts, scrape);
    } catch (error) {
      lastError = error;
      console.warn('[digest] scrape attempt failed', { digestId, service, attempt: index + 1, error: errorDetails(error) });
      const errorCode = scrapeErrorCode(error);
      if (errorCode === 'FIRECRAWL_RATE_LIMITED' || errorCode === 'AUTH_REQUIRED') {
        throw error;
      }
      const delay = index < SERVICE_RETRY_DELAYS.length - 1 ? SERVICE_RETRY_DELAYS[index] : undefined;
      if (delay !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
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
    console.log('[digest] scraping started', {
      digestId,
      services,
      maxPosts,
      profilesAvailable: contexts.filter((context) => context.firecrawlProfileName !== null).map(({ service }) => service),
    });
    if (!contexts.some((context) => context.firecrawlProfileName !== null)) {
      console.warn('[digest] no browser profile available', { digestId, services });
      return services.map((service) => ({
        service,
        status: 'failed' as const,
        postCount: 0,
        errorCode: 'AUTH_REQUIRED',
      }));
    }

    const results: ServiceScrapeResult[] = [];
    for (const service of services) {
      const serviceProfileName = contextsByService.get(service)?.firecrawlProfileName;
      if (!serviceProfileName) {
        console.warn('[digest] service profile unavailable', { digestId, service });
        results.push({ service, status: 'failed', postCount: 0, errorCode: 'AUTH_REQUIRED' });
        continue;
      }
      try {
        const posts = await scrapeWithRetries(ctx, serviceProfileName, digestId, service, maxPosts, serviceScrapers[service]);
        const postCount = await ctx.runMutation(internal.digests.saveScrapedPosts, { digestId, service, posts });
        console.log('[digest] service scraped', { digestId, service, postCount });
        results.push({ service, status: 'succeeded', postCount });
      } catch (error) {
        console.error('[digest] service scrape failed', { digestId, service, error: errorDetails(error) });
        const errorCode = scrapeErrorCode(error);
        results.push({ service, status: 'failed', postCount: 0, errorCode });
        if (errorCode === 'FIRECRAWL_RATE_LIMITED') {
          results.push(
            ...services.slice(results.length).map((remainingService) => ({
              service: remainingService,
              status: 'failed' as const,
              postCount: 0,
              errorCode,
            })),
          );
          break;
        }
      }
    }
    return results;
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
      classificationContext.classificationPrompt,
    );
  },
});
