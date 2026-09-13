'use node';

import { createOpenAI } from '@ai-sdk/openai';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { env, internalAction } from '../_generated/server';
import { digestCategoryValidator, serviceValidator } from '../schema';
import { scrapeInstagramFeed } from '../scraping/instagram';
import { scrapeLinkedInFeed } from '../scraping/linkedin';
import { runServiceScraperWithProfile } from '../scraping/shared';
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

export const scrapeServiceToDigest = internalAction({
  args: { digestId: v.id('digests'), service: serviceValidator, maxPosts: v.number() },
  returns: v.number(),
  handler: async (ctx, { digestId, service, maxPosts }): Promise<number> => {
    const scrapeContext = await ctx.runQuery(internal.digests.getScrapeContext, { digestId, service });
    if (scrapeContext === null) {
      throw new Error('AUTH_REQUIRED');
    }
    const posts: ScrapedPost[] = await runServiceScraperWithProfile(
      ctx,
      scrapeContext.firecrawlProfileName,
      maxPosts,
      serviceScrapers[service],
    );
    return await ctx.runMutation(internal.digests.saveScrapedPosts, { digestId, service, posts });
  },
});

export const classifyPosts = internalAction({
  args: { digestPostIds: v.array(v.id('digestPosts')) },
  returns: v.array(
    v.object({
      digestPostId: v.id('digestPosts'),
      category: digestCategoryValidator,
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
