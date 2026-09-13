import { cleanup, type WorkflowId, vResultValidator, vWorkflowId, start as startWorkflow } from '@convex-dev/workflow';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import schema, { digestCategoryValidator, serviceValidator } from './schema';
import { scrapedPostValidator } from './scraping/types';
import { getIdentityOrThrow } from './utilities/auth';
import type { Service } from './utilities/sites';

const MAX_POSTS_PER_SERVICE = 50;
const MAX_DIGEST_POSTS = 150;
const serviceOrder: Service[] = ['instagram', 'x', 'linkedin'];

const digestPostViewValidator = schema
  .doc('digestPosts')
  .omit('imageStorageIds')
  .extend({
    images: v.array(
      v.object({
        storageId: v.id('_storage'),
        url: v.string(),
      }),
    ),
  });

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc('digests')),
  handler: async (ctx, { paginationOpts }) => {
    const identity = await getIdentityOrThrow(ctx);
    return await ctx.db
      .query('digests')
      .withIndex('by_userTokenIdentifier', (q) => q.eq('userTokenIdentifier', identity.tokenIdentifier))
      .order('desc')
      .paginate(paginationOpts);
  },
});

export const get = query({
  args: { digestId: v.id('digests') },
  returns: v.union(
    v.object({
      digest: schema.doc('digests'),
      posts: v.array(digestPostViewValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { digestId }) => {
    const identity = await getIdentityOrThrow(ctx);
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.userTokenIdentifier !== identity.tokenIdentifier) {
      return null;
    }

    const posts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_position', (q) => q.eq('digestId', digestId))
      .take(MAX_DIGEST_POSTS);
    const postsWithImages = await Promise.all(
      posts.map(async ({ imageStorageIds, ...post }) => ({
        ...post,
        images: (
          await Promise.all(
            imageStorageIds.map(async (storageId) => {
              const url = await ctx.storage.getUrl(storageId);
              return url === null ? null : { storageId, url };
            }),
          )
        ).filter((image): image is { storageId: Id<'_storage'>; url: string } => image !== null),
      })),
    );

    return { digest, posts: postsWithImages };
  },
});

export const start = mutation({
  args: {},
  returns: v.id('digests'),
  handler: async (ctx): Promise<Id<'digests'>> => {
    const identity = await getIdentityOrThrow(ctx);
    const activeDigest = await ctx.db
      .query('digests')
      .withIndex('by_userTokenIdentifier_and_status', (q) =>
        q.eq('userTokenIdentifier', identity.tokenIdentifier).eq('status', 'running'),
      )
      .first();
    if (activeDigest !== null) {
      return activeDigest._id;
    }

    const linkedServices = await ctx.db
      .query('linkedServices')
      .withIndex('by_userTokenIdentifier_and_service', (q) => q.eq('userTokenIdentifier', identity.tokenIdentifier))
      .take(100);
    const connected = new Set(linkedServices.map(({ service }) => service));
    const services = serviceOrder.filter((service) => connected.has(service));
    if (services.length === 0) {
      throw new Error('NO_CONNECTED_SERVICES');
    }

    const digestId = await ctx.db.insert('digests', {
      userTokenIdentifier: identity.tokenIdentifier,
      status: 'running',
      stage: 'scraping',
      maxPostsPerService: MAX_POSTS_PER_SERVICE,
      serviceResults: services.map((service) => ({ service, status: 'pending' as const, postCount: 0 })),
      postCount: 0,
      classificationFallbackCount: 0,
    });
    const workflowId: WorkflowId = await startWorkflow(
      ctx,
      internal.digest.workflow.runDigest,
      { digestId },
      {
        onComplete: internal.digests.handleWorkflowComplete,
        context: { digestId },
        startAsync: true,
      },
    );
    await ctx.db.patch('digests', digestId, { workflowId });
    return digestId;
  },
});

export const getScrapeContext = internalQuery({
  args: { digestId: v.id('digests'), service: serviceValidator },
  returns: v.union(v.object({ firecrawlProfileName: v.string() }), v.null()),
  handler: async (ctx, { digestId, service }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (
      digest === null ||
      digest.status !== 'running' ||
      !digest.serviceResults.some((result) => result.service === service)
    ) {
      return null;
    }
    const linkedService = await ctx.db
      .query('linkedServices')
      .withIndex('by_userTokenIdentifier_and_service', (q) =>
        q.eq('userTokenIdentifier', digest.userTokenIdentifier).eq('service', service),
      )
      .first();
    return linkedService === null ? null : { firecrawlProfileName: linkedService.firecrawlProfileName };
  },
});

export const getWorkflowState = internalQuery({
  args: { digestId: v.id('digests') },
  returns: v.object({
    services: v.array(serviceValidator),
    maxPostsPerService: v.number(),
  }),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    return {
      services: digest.serviceResults.map(({ service }) => service),
      maxPostsPerService: digest.maxPostsPerService,
    };
  },
});

export const saveScrapedPosts = internalMutation({
  args: {
    digestId: v.id('digests'),
    service: serviceValidator,
    posts: v.array(scrapedPostValidator),
  },
  returns: v.number(),
  handler: async (ctx, { digestId, service, posts }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }

    const existingPosts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_service_and_sourcePostId', (q) => q.eq('digestId', digestId).eq('service', service))
      .take(MAX_POSTS_PER_SERVICE);
    const existingBySourceId = new Map(existingPosts.map((post) => [post.sourcePostId, post]));
    const incomingSourceIds = new Set(posts.map(({ sourcePostId }) => sourcePostId));
    const incomingStorageIds = new Set(posts.flatMap(({ images }) => images.map(({ storageId }) => storageId)));
    const storageIdsToDelete = new Set<Id<'_storage'>>();
    const serviceOffset = serviceOrder.indexOf(service) * MAX_POSTS_PER_SERVICE;

    for (const [index, post] of posts.entries()) {
      const value = {
        digestId,
        service,
        sourcePostId: post.sourcePostId,
        position: serviceOffset + index,
        author: post.author,
        body: post.body,
        imageStorageIds: post.images.map(({ storageId }) => storageId),
      };
      const existing = existingBySourceId.get(post.sourcePostId);
      if (existing === undefined) {
        await ctx.db.insert('digestPosts', value);
      } else {
        for (const storageId of existing.imageStorageIds) {
          storageIdsToDelete.add(storageId);
        }
        await ctx.db.replace('digestPosts', existing._id, value);
      }
    }

    for (const existing of existingPosts) {
      if (!incomingSourceIds.has(existing.sourcePostId)) {
        for (const storageId of existing.imageStorageIds) {
          storageIdsToDelete.add(storageId);
        }
        await ctx.db.delete('digestPosts', existing._id);
      }
    }
    for (const storageId of storageIdsToDelete) {
      if (!incomingStorageIds.has(storageId)) {
        await ctx.storage.delete(storageId);
      }
    }
    return posts.length;
  },
});

export const recordServiceSuccess = internalMutation({
  args: { digestId: v.id('digests'), service: serviceValidator, postCount: v.number() },
  returns: v.null(),
  handler: async (ctx, { digestId, service, postCount }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    const serviceResults = digest.serviceResults.map((result) =>
      result.service === service ? { service, status: 'succeeded' as const, postCount } : result,
    );
    await ctx.db.patch('digests', digestId, {
      serviceResults,
      postCount: serviceResults.reduce((total, result) => total + result.postCount, 0),
    });
    return null;
  },
});

export const recordServiceFailure = internalMutation({
  args: { digestId: v.id('digests'), service: serviceValidator, errorCode: v.string() },
  returns: v.null(),
  handler: async (ctx, { digestId, service, errorCode }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    const posts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_service_and_sourcePostId', (q) => q.eq('digestId', digestId).eq('service', service))
      .take(MAX_POSTS_PER_SERVICE);
    const storageIds = new Set(posts.flatMap(({ imageStorageIds }) => imageStorageIds));
    for (const storageId of storageIds) {
      await ctx.storage.delete(storageId);
    }
    for (const post of posts) {
      await ctx.db.delete('digestPosts', post._id);
    }
    const serviceResults = digest.serviceResults.map((result) =>
      result.service === service ? { service, status: 'failed' as const, postCount: 0, errorCode } : result,
    );
    await ctx.db.patch('digests', digestId, {
      serviceResults,
      postCount: serviceResults.reduce((total, result) => total + result.postCount, 0),
    });
    return null;
  },
});

export const markClassifying = internalMutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    await ctx.db.patch('digests', digestId, { stage: 'classifying' });
    return null;
  },
});

export const getPostIds = internalQuery({
  args: { digestId: v.id('digests') },
  returns: v.array(v.id('digestPosts')),
  handler: async (ctx, { digestId }) => {
    const posts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_position', (q) => q.eq('digestId', digestId))
      .take(MAX_DIGEST_POSTS);
    return posts.map(({ _id }) => _id);
  },
});

export const getPostsForClassification = internalQuery({
  args: { digestPostIds: v.array(v.id('digestPosts')) },
  returns: v.object({
    userTokenIdentifier: v.string(),
    posts: v.array(schema.doc('digestPosts')),
  }),
  handler: async (ctx, { digestPostIds }) => {
    const posts = await Promise.all(digestPostIds.map((digestPostId) => ctx.db.get('digestPosts', digestPostId)));
    if (posts.some((post) => post === null)) {
      throw new Error('DIGEST_POST_NOT_FOUND');
    }
    const existingPosts = posts.filter((post): post is NonNullable<typeof post> => post !== null);
    const digestId = existingPosts[0]?.digestId;
    if (digestId === undefined || existingPosts.some((post) => post.digestId !== digestId)) {
      throw new Error('DIGEST_POST_NOT_FOUND');
    }
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    return { userTokenIdentifier: digest.userTokenIdentifier, posts: existingPosts };
  },
});

export const applyClassifications = internalMutation({
  args: {
    digestId: v.id('digests'),
    source: v.union(v.literal('llm'), v.literal('fallback')),
    classifications: v.array(
      v.object({
        digestPostId: v.id('digestPosts'),
        category: digestCategoryValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { digestId, source, classifications }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    let fallbackDelta = 0;
    for (const classification of classifications) {
      const post = await ctx.db.get('digestPosts', classification.digestPostId);
      if (post === null || post.digestId !== digestId) {
        throw new Error('DIGEST_POST_NOT_FOUND');
      }
      if (post.classificationSource === 'fallback') {
        fallbackDelta -= 1;
      }
      if (source === 'fallback') {
        fallbackDelta += 1;
      }
      await ctx.db.patch('digestPosts', post._id, {
        category: classification.category,
        classificationSource: source,
      });
    }
    if (fallbackDelta !== 0) {
      await ctx.db.patch('digests', digestId, {
        classificationFallbackCount: digest.classificationFallbackCount + fallbackDelta,
      });
    }
    return null;
  },
});

export const finalize = internalMutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      return null;
    }
    const successfulServices = digest.serviceResults.filter(({ status }) => status === 'succeeded').length;
    if (successfulServices === 0) {
      await ctx.db.patch('digests', digestId, {
        status: 'failed',
        stage: 'done',
        completedAt: Date.now(),
        failureCode: 'ALL_SERVICES_FAILED',
      });
      return null;
    }
    const isPartial =
      digest.serviceResults.some(({ status }) => status === 'failed') || digest.classificationFallbackCount > 0;
    await ctx.db.patch('digests', digestId, {
      status: isPartial ? 'partial' : 'completed',
      stage: 'done',
      completedAt: Date.now(),
    });
    return null;
  },
});

export const handleWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ digestId: v.id('digests') }),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    const digest = await ctx.db.get('digests', context.digestId);
    if (digest !== null && digest.status === 'running') {
      await ctx.db.patch('digests', context.digestId, {
        status: 'failed',
        stage: 'done',
        completedAt: Date.now(),
        failureCode: result.kind === 'canceled' ? 'WORKFLOW_CANCELED' : 'WORKFLOW_FAILED',
      });
    }
    await cleanup(ctx, components.workflow, workflowId);
    return null;
  },
});
