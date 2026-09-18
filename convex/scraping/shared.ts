'use node';

import Firecrawl from 'firecrawl';
import { chromium } from 'playwright-core';
import type { ActionCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { env } from '../_generated/server';
import { internal } from '../_generated/api';
import { getIdentityOrThrow } from '../utilities/auth';
import type { Service } from '../utilities/sites';
import { type OpenedBrowserSession, type RawPost, type ScrapedPost, type ServiceScraper } from './types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_CONCURRENCY = 6;
const SESSION_RETRY_DELAYS = [2_000, 4_000, 8_000, 12_000];
const CAPTURE_OVERSCAN = 10;

export function hasPostContent(post: Pick<RawPost, 'body' | 'imageUrls'>) {
  return post.body.trim() !== '' || post.imageUrls.length > 0;
}

export function validateMaxPosts(maxPosts: number) {
  if (!Number.isInteger(maxPosts) || maxPosts < 1) {
    throw new Error('maxPosts must be a positive integer');
  }
}

async function downloadImage(session: OpenedBrowserSession, sourceURL: string): Promise<Blob> {
  const response = await fetch(sourceURL);
  if (response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentType.startsWith('image/') && contentLength <= MAX_IMAGE_BYTES) {
      const blob = await response.blob();
      if (blob.size <= MAX_IMAGE_BYTES) {
        return blob;
      }
    }
  }

  const browserResponse = await session.context.request.get(sourceURL);
  const contentType = browserResponse.headers()['content-type'] ?? '';
  const body = await browserResponse.body();
  if (!browserResponse.ok() || !contentType.startsWith('image/') || body.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Unable to download scraped image');
  }
  return new Blob([new Uint8Array(body)], { type: contentType });
}

async function persistPosts(ctx: ActionCtx, session: OpenedBrowserSession, posts: RawPost[], digestId?: Id<'digests'>): Promise<ScrapedPost[]> {
  const postsWithContent = posts.filter(hasPostContent);
  const imageCache = new Map<string, ScrapedPost['images'][number] | null>();
  const sourceURLs = [...new Set(postsWithContent.flatMap((post) => post.imageUrls))];
  let nextImage = 0;
  const workers = Array.from({ length: Math.min(IMAGE_CONCURRENCY, sourceURLs.length) }, async () => {
    while (nextImage < sourceURLs.length) {
      const sourceURL = sourceURLs[nextImage];
      nextImage += 1;
      try {
        const blob = await downloadImage(session, sourceURL);
        const storageId = await ctx.storage.store(blob);
        if (digestId !== undefined) {
          let registered: boolean;
          try {
            registered = await ctx.runMutation(internal.digests.registerAsset, { digestId, storageId });
          } catch (error) {
            await ctx.storage.delete(storageId);
            throw error;
          }
          if (!registered) {
            imageCache.set(sourceURL, null);
            continue;
          }
        }
        const url = await ctx.storage.getUrl(storageId);
        imageCache.set(sourceURL, url === null ? null : { storageId, url });
      } catch {
        imageCache.set(sourceURL, null);
      }
    }
  });
  await Promise.all(workers);

  return postsWithContent
    .map((post) => ({
      sourcePostId: post.id,
      author: post.author,
      body: post.body,
      images: post.imageUrls
        .map((sourceURL) => imageCache.get(sourceURL) ?? null)
        .filter((image): image is ScrapedPost['images'][number] => image !== null),
      ...(post.isMutual === undefined ? {} : { isMutual: post.isMutual }),
    }))
    .filter((post) => post.body.trim() !== '' || post.images.length > 0);
}

async function openBrowserSession(firecrawl: Firecrawl, profileName: string) {
  let writeAttempts = 0;
  let rateRetries = 0;
  for (;;) {
    try {
      return await firecrawl.browser({
        ttl: 600,
        activityTtl: 600,
        profile: { name: profileName, saveChanges: false },
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      let delay: number | undefined;
      if (/rate limit exceeded/i.test(error.message)) {
        if (rateRetries > 0) {
          throw new Error('FIRECRAWL_RATE_LIMITED');
        }
        rateRetries += 1;
        const retryAfter = /retry after (\d+)s/i.exec(error.message);
        delay = retryAfter ? (Number(retryAfter[1]) + 1) * 1_000 : 60_000;
        console.warn('[digest] Firecrawl browser rate limited', { retryAfterSeconds: Math.ceil(delay / 1_000) });
      } else if (/another session is currently writing/i.test(error.message)) {
        delay = SESSION_RETRY_DELAYS[writeAttempts];
        writeAttempts += 1;
      }
      if (delay === undefined) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function runServiceScraper(
  ctx: ActionCtx,
  service: Service,
  maxPosts: number,
  scrape: ServiceScraper,
): Promise<ScrapedPost[]> {
  validateMaxPosts(maxPosts);
  const identity = await getIdentityOrThrow(ctx);
  const linkedService = await ctx.runQuery(internal.login.findLinkedService, {
    userTokenIdentifier: identity.tokenIdentifier,
    service,
  });
  if (linkedService === null) {
    throw new Error('AUTH_REQUIRED');
  }

  return await runServiceScraperWithProfile(ctx, linkedService.firecrawlProfileName, maxPosts, scrape);
}

export async function runServiceScraperWithProfile(
  ctx: ActionCtx,
  firecrawlProfileName: string,
  maxPosts: number,
  scrape: ServiceScraper,
  digestId?: Id<'digests'>,
): Promise<ScrapedPost[]> {
  validateMaxPosts(maxPosts);

  return await withBrowserSession(firecrawlProfileName, async (session) =>
    scrapeServiceWithSession(ctx, session, maxPosts, scrape, digestId),
  );
}

export async function scrapeServiceWithSession(
  ctx: ActionCtx,
  session: OpenedBrowserSession,
  maxPosts: number,
  scrape: ServiceScraper,
  digestId?: Id<'digests'>,
): Promise<ScrapedPost[]> {
  validateMaxPosts(maxPosts);
  const rawPosts = await scrape(session, maxPosts + CAPTURE_OVERSCAN);
  const posts = await persistPosts(ctx, session, rawPosts, digestId);
  console.log('[digest] mutual post persistence', {
    host: new URL(session.page.url()).hostname,
    rawMutuals: rawPosts.filter((post) => post.isMutual === true).length,
    persistedMutuals: posts.filter((post) => post.isMutual === true).length,
    savedMutuals: posts.slice(0, maxPosts).filter((post) => post.isMutual === true).length,
  });
  if (posts.length < maxPosts) {
    console.warn('[digest] persisted post threshold not reached', {
      rawPosts: rawPosts.length,
      observedPosts: posts.length,
      expectedPosts: maxPosts,
    });
    throw new Error('FEED_POST_THRESHOLD_NOT_REACHED');
  }
  return posts.slice(0, maxPosts);
}

export async function withBrowserSession<T>(
  firecrawlProfileName: string,
  run: (session: OpenedBrowserSession) => Promise<T>,
): Promise<T> {
  const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY, timeoutMs: 20_000, maxRetries: 1 });
  const firecrawlSession = await openBrowserSession(firecrawl, firecrawlProfileName);
  if (!firecrawlSession.id || !firecrawlSession.cdpUrl) {
    throw new Error(`Unable to open Firecrawl browser: ${firecrawlSession.error ?? 'unknown error'}`);
  }

  let completed = false;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  try {
    console.log('[digest] Firecrawl browser session opened');
    browser = await chromium.connectOverCDP(firecrawlSession.cdpUrl);
    const context = browser.contexts()[0];
    if (context === undefined) {
      throw new Error('Firecrawl browser did not provide a browser context');
    }
    const page = context.pages()[0] ?? (await context.newPage());
    const session = { browser, context, page };
    const result = await run(session);
    completed = true;
    return result;
  } finally {
    console.log('[digest] Firecrawl browser session closing');
    if (browser !== null) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      try {
        await Promise.race([
          browser.close().catch(() => null),
          new Promise<void>((resolve) => {
            timeout = setTimeout(() => {
              timedOut = true;
              resolve();
            }, 10_000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      if (timedOut) {
        console.warn('[digest] Firecrawl browser close timed out');
      }
    }
    const deleteResult = await firecrawl.deleteBrowser(firecrawlSession.id);
    console.log('[digest] Firecrawl browser session closed', { success: deleteResult.success });
    if (completed && !deleteResult.success) {
      throw new Error(`Unable to close Firecrawl browser: ${deleteResult.error ?? 'unknown error'}`);
    }
  }
}
