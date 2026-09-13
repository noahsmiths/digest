import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { Id } from '../_generated/dataModel';
import { v } from 'convex/values';

export const scrapedImageValidator = v.object({
  storageId: v.id('_storage'),
  url: v.string(),
});

export const scrapedPostValidator = v.object({
  sourcePostId: v.string(),
  author: v.string(),
  body: v.string(),
  images: v.array(scrapedImageValidator),
});

export type RawPost = {
  id: string;
  author: string;
  body: string;
  imageUrls: string[];
};

export type ScrapedPost = {
  sourcePostId: string;
  author: string;
  body: string;
  images: Array<{
    storageId: Id<'_storage'>;
    url: string;
  }>;
};

export type OpenedBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

export type ServiceScraper = (session: OpenedBrowserSession, maxPosts: number) => Promise<RawPost[]>;
