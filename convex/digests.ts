import {
  cancel as cancelWorkflow,
  cleanup,
  type WorkflowId,
  vResultValidator,
  vWorkflowId,
  start as startWorkflow,
} from '@convex-dev/workflow';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { env, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server';
import schema, { digestDecisionValidator, serviceValidator } from './schema';
import { scrapedPostValidator } from './scraping/types';
import { getIdentityOrThrow } from './utilities/auth';
import type { Service } from './utilities/sites';
import { classificationCategoryIds, DEFAULT_CLASSIFICATION_PROMPT } from '../shared/classificationPrompt';
import { digestPath } from '../shared/routes';
import { renderDigestEmail } from '../shared/digestEmail';

const MAX_POSTS_PER_SERVICE = 50;
const MAX_DIGEST_POSTS = 150;
const serviceOrder: Service[] = ['instagram', 'x', 'linkedin'];
const DELETE_BATCH_SIZE = 25;

const digestEmailPayloadValidator = v.union(
  v.object({
    kind: v.literal('send'),
    inboxId: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
    idempotencyKey: v.string(),
  }),
  v.object({ kind: v.literal('skip'), failureCode: v.string() }),
);

type DigestEmailPayload = Infer<typeof digestEmailPayloadValidator>;

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
  args: { digestId: v.string() },
  returns: v.union(
    v.object({
      digest: schema.doc('digests'),
      posts: v.array(digestPostViewValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { digestId: routeDigestId }) => {
    const identity = await getIdentityOrThrow(ctx);
    const digestId = ctx.db.normalizeId('digests', routeDigestId);
    if (digestId === null) return null;
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
    const userId = ctx.db.normalizeId('users', identity.subject);
    const digestId = await startDigestForUser(ctx, identity.tokenIdentifier, userId);
    if (digestId === null) {
      throw new Error('NO_CONNECTED_SERVICES');
    }
    return digestId;
  },
});

export const remove = mutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const identity = await getIdentityOrThrow(ctx);
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.userTokenIdentifier !== identity.tokenIdentifier) {
      throw new Error('DIGEST_NOT_FOUND');
    }
    if (digest.workflowId !== undefined) {
      await deleteWorkflow(ctx, digest.workflowId);
    }
    await ctx.db.delete('digests', digestId);
    await deleteRelatedAssets(ctx, digestId);
    await startNextDigest(ctx);
    return null;
  },
});

async function deleteWorkflow(ctx: MutationCtx, workflowId: string) {
  if (await cleanup(ctx, components.workflow, workflowId as WorkflowId)) return;
  try {
    await cancelWorkflow(ctx, components.workflow, workflowId as WorkflowId);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Workflow not found:')) throw error;
  }
  await cleanup(ctx, components.workflow, workflowId as WorkflowId);
}

async function deleteRelatedAssets(ctx: MutationCtx, digestId: Id<'digests'>) {
  const posts = await ctx.db.query('digestPosts')
    .withIndex('by_digestId_and_position', (q) => q.eq('digestId', digestId))
    .take(DELETE_BATCH_SIZE);
  const assets = await ctx.db.query('digestAssets')
    .withIndex('by_digestId', (q) => q.eq('digestId', digestId))
    .take(DELETE_BATCH_SIZE);
  const replies = await ctx.db.query('emailPreferenceReplies')
    .withIndex('by_digestId', (q) => q.eq('digestId', digestId))
    .take(DELETE_BATCH_SIZE);
  const storageIds = new Set([
    ...posts.flatMap((post) => post.imageStorageIds),
    ...assets.map((asset) => asset.storageId),
  ]);
  for (const storageId of storageIds) {
    if (await ctx.db.system.get('_storage', storageId)) await ctx.storage.delete(storageId);
  }
  for (const post of posts) await ctx.db.delete('digestPosts', post._id);
  for (const asset of assets) await ctx.db.delete('digestAssets', asset._id);
  for (const reply of replies) {
    if (reply.workflowId !== undefined) await deleteWorkflow(ctx, reply.workflowId);
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: reply.agentThreadId,
      limit: 25,
    });
    await ctx.db.delete('emailPreferenceReplies', reply._id);
  }
  if ([posts, assets, replies].some((batch) => batch.length === DELETE_BATCH_SIZE)) {
    await ctx.scheduler.runAfter(0, internal.digests.deleteAssetsBatch, { digestId });
  }
}

export const deleteAssetsBatch = internalMutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    await deleteRelatedAssets(ctx, digestId);
    return null;
  },
});

export const registerAsset = internalMutation({
  args: { digestId: v.id('digests'), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { digestId, storageId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.insert('digestAssets', { digestId, storageId });
    return true;
  },
});

export const startForUser = internalMutation({
  args: {
    userTokenIdentifier: v.string(),
    userId: v.id('users'),
  },
  returns: v.union(v.id('digests'), v.null()),
  handler: async (ctx, { userTokenIdentifier, userId }) =>
    await startDigestForUser(ctx, userTokenIdentifier, userId, 'scheduled'),
});

async function startDigestForUser(
  ctx: MutationCtx,
  userTokenIdentifier: string,
  userId: Id<'users'> | null,
  source: 'manual' | 'scheduled' = 'manual',
): Promise<Id<'digests'> | null> {
  const user = userId === null ? null : await ctx.db.get('users', userId);
  const activeDigest = await ctx.db
    .query('digests')
    .withIndex('by_userTokenIdentifier_and_status', (q) =>
      q.eq('userTokenIdentifier', userTokenIdentifier).eq('status', 'running'),
    )
    .first();
  if (activeDigest !== null) {
    if (source === 'scheduled') await ctx.db.patch('digests', activeDigest._id, { source });
    return activeDigest._id;
  }

  const linkedServices = await ctx.db
    .query('linkedServices')
    .withIndex('by_userTokenIdentifier_and_service', (q) => q.eq('userTokenIdentifier', userTokenIdentifier))
    .take(100);
  const connected = new Set(linkedServices.map(({ service }) => service));
  const services = serviceOrder.filter((service) => connected.has(service));
  if (services.length === 0) {
    return null;
  }

  const preferences = userId === null ? null : await ctx.db
    .query('userPreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first();
  const digestId = await ctx.db.insert('digests', {
    userTokenIdentifier,
    source,
    status: 'running',
    stage: 'queued',
    workflowQueueState: 'queued',
    maxPostsPerService: MAX_POSTS_PER_SERVICE,
    serviceResults: services.map((service) => ({ service, status: 'pending' as const, postCount: 0 })),
    postCount: 0,
    classificationFallbackCount: 0,
    classificationPrompt: preferences?.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT,
    ...(user?.email === undefined ? {} : { recipientEmail: user.email }),
    emailDeliveryStatus: 'pending',
  });
  await startNextDigest(ctx);
  return digestId;
}

async function startNextDigest(ctx: MutationCtx): Promise<void> {
  const running = await ctx.db
    .query('digests')
    .withIndex('by_workflowQueueState', (q) => q.eq('workflowQueueState', 'running'))
    .first();
  if (running !== null) return;

  for (const stage of ['scraping', 'classifying'] as const) {
    const existing = await ctx.db
      .query('digests')
      .withIndex('by_stage', (q) => q.eq('stage', stage))
      .first();
    if (existing !== null) return;
  }

  const next = await ctx.db
    .query('digests')
    .withIndex('by_workflowQueueState', (q) => q.eq('workflowQueueState', 'queued'))
    .order('asc')
    .first();
  if (next === null) return;

  const digestId = next._id;
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
  await ctx.db.patch('digests', digestId, { workflowId, workflowQueueState: 'running', stage: 'scraping' });
}

export const cancelRunning = internalMutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest?.status === 'running') {
      if (digest.workflowId) {
        await cancelWorkflow(ctx, components.workflow, digest.workflowId as WorkflowId);
      } else if (digest.workflowQueueState === 'queued') {
        await ctx.db.patch('digests', digestId, {
          status: 'failed',
          stage: 'done',
          workflowQueueState: undefined,
          completedAt: Date.now(),
          failureCode: 'WORKFLOW_CANCELED',
        });
        await startNextDigest(ctx);
      }
    }
    return null;
  },
});

export const getScrapeContexts = internalQuery({
  args: { digestId: v.id('digests') },
  returns: v.array(
    v.object({
      service: serviceValidator,
      firecrawlProfileName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { digestId }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    return await Promise.all(
      digest.serviceResults.map(async ({ service }) => {
        const linkedService = await ctx.db
          .query('linkedServices')
          .withIndex('by_userTokenIdentifier_and_service', (q) =>
            q.eq('userTokenIdentifier', digest.userTokenIdentifier).eq('service', service),
          )
          .first();
        return { service, firecrawlProfileName: linkedService?.firecrawlProfileName ?? null };
      }),
    );
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
      for (const storageId of new Set(posts.flatMap((post) => post.images.map((image) => image.storageId)))) {
        if (await ctx.db.system.get('_storage', storageId)) await ctx.storage.delete(storageId);
      }
      return 0;
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
        ...(post.isMutual === undefined ? {} : { isMutual: post.isMutual }),
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
    classificationPrompt: v.string(),
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
    return {
      userTokenIdentifier: digest.userTokenIdentifier,
      classificationPrompt: digest.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT,
      posts: existingPosts,
    };
  },
});

export const applyClassifications = internalMutation({
  args: {
    digestId: v.id('digests'),
    source: v.union(v.literal('llm'), v.literal('fallback')),
    classifications: v.array(
      v.object({
        digestPostId: v.id('digestPosts'),
        category: digestDecisionValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { digestId, source, classifications }) => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || digest.status !== 'running') {
      throw new Error('DIGEST_NOT_RUNNING');
    }
    const allowedCategories = new Set(
      classificationCategoryIds(digest.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT),
    );
    if (classifications.some(({ category }) => !allowedCategories.has(category))) {
      throw new Error('INVALID_CLASSIFICATION_CATEGORY');
    }
    const posts = await Promise.all(
      classifications.map(async (classification) => {
        const post = await ctx.db.get('digestPosts', classification.digestPostId);
        if (post === null || post.digestId !== digestId) {
          throw new Error('DIGEST_POST_NOT_FOUND');
        }
        return { classification, post };
      }),
    );
    const droppedPostIds = new Set(
      posts.filter(({ classification }) => classification.category === 'drop').map(({ post }) => post._id),
    );
    const remainingPosts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_position', (q) => q.eq('digestId', digestId))
      .take(MAX_DIGEST_POSTS);
    const retainedStorageIds = new Set(
      remainingPosts.filter((post) => !droppedPostIds.has(post._id)).flatMap((post) => post.imageStorageIds),
    );
    const storageIdsToDelete = new Set<Id<'_storage'>>();
    for (const { classification, post } of posts) {
      if (classification.category === 'drop') {
        for (const storageId of post.imageStorageIds) {
          if (!retainedStorageIds.has(storageId)) storageIdsToDelete.add(storageId);
        }
        await ctx.db.delete('digestPosts', post._id);
      } else {
        await ctx.db.patch('digestPosts', post._id, {
          category: classification.category,
          classificationSource: source,
        });
      }
    }
    for (const storageId of storageIdsToDelete) {
      await ctx.storage.delete(storageId);
    }
    if (source === 'fallback') {
      await ctx.db.patch('digests', digestId, {
        classificationFallbackCount: digest.classificationFallbackCount + classifications.length,
        postCount: digest.postCount - droppedPostIds.size,
      });
    } else if (droppedPostIds.size > 0) {
      await ctx.db.patch('digests', digestId, { postCount: digest.postCount - droppedPostIds.size });
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
      console.error('[digest] all services failed', {
        digestId,
        results: digest.serviceResults.map(({ service, errorCode }) => ({ service, errorCode })),
      });
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

export const getDigestEmailPayload = internalQuery({
  args: { digestId: v.id('digests') },
  returns: digestEmailPayloadValidator,
  handler: async (ctx, { digestId }): Promise<DigestEmailPayload> => {
    const digest = await ctx.db.get('digests', digestId);
    if (digest === null || (digest.status !== 'completed' && digest.status !== 'partial')) {
      return { kind: 'skip', failureCode: 'DIGEST_NOT_READY' };
    }
    if (digest.source !== 'scheduled') {
      const preferences = await ctx.db.query('userPreferences')
        .withIndex('by_userTokenIdentifier', (q) => q.eq('userTokenIdentifier', digest.userTokenIdentifier))
        .first();
      if (preferences?.emailAfterDigestEnabled === false) {
        return { kind: 'skip', failureCode: 'DIGEST_EMAIL_DISABLED' };
      }
    }
    if (digest.recipientEmail === undefined) {
      return { kind: 'skip', failureCode: 'NO_RECIPIENT_EMAIL' };
    }
    if (env.AGENTMAIL_INBOX_ID === undefined || env.DIGEST_APP_URL === undefined) {
      return { kind: 'skip', failureCode: 'EMAIL_NOT_CONFIGURED' };
    }

    const posts = await ctx.db
      .query('digestPosts')
      .withIndex('by_digestId_and_position', (q) => q.eq('digestId', digestId))
      .take(MAX_DIGEST_POSTS);
    const digestUrl = new URL(env.DIGEST_APP_URL);
    digestUrl.pathname = `${digestUrl.pathname.replace(/\/$/, '')}${digestPath(digestId)}`;
    digestUrl.searchParams.delete('page');
    digestUrl.searchParams.delete('digest');
    digestUrl.hash = '';
    const digestDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(digest._creationTime);
    const rendered = renderDigestEmail({
      date: digestDate,
      url: digestUrl.toString(),
      classificationPrompt: digest.classificationPrompt,
      classificationFallbackCount: digest.classificationFallbackCount,
      failedServices: digest.serviceResults.filter(({ status }) => status === 'failed').map(({ service }) => service),
      posts: await Promise.all(
        posts.map(async (post) => ({
          ...post,
          imageUrl: post.imageStorageIds[0] === undefined ? null : await ctx.storage.getUrl(post.imageStorageIds[0]),
        })),
      ),
    });
    return {
      kind: 'send',
      inboxId: env.AGENTMAIL_INBOX_ID,
      to: digest.recipientEmail,
      subject: `Your Digest — ${digestDate}`,
      ...rendered,
      idempotencyKey: digestId,
    };
  },
});

export const markDigestEmailSkipped = internalMutation({
  args: { digestId: v.id('digests'), failureCode: v.string() },
  returns: v.null(),
  handler: async (ctx, { digestId, failureCode }) => {
    await ctx.db.patch('digests', digestId, {
      emailDeliveryStatus: 'skipped',
      emailFailureCode: failureCode,
    });
    return null;
  },
});

export const markDigestEmailSent = internalMutation({
  args: {
    digestId: v.id('digests'),
    messageId: v.string(),
    threadId: v.optional(v.string()),
    inboxId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { digestId, messageId, threadId, inboxId }) => {
    await ctx.db.patch('digests', digestId, {
      emailDeliveryStatus: 'sent',
      emailOutboundId: messageId,
      ...(threadId === undefined ? {} : { emailThreadId: threadId }),
      ...(inboxId === undefined ? {} : { emailInboxId: inboxId }),
    });
    return null;
  },
});

export const markDigestEmailFailed = internalMutation({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    await ctx.db.patch('digests', digestId, {
      emailDeliveryStatus: 'failed',
      emailFailureCode: 'EMAIL_SEND_FAILED',
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
      console.error('[digest] workflow did not complete', { digestId: context.digestId, resultKind: result.kind });
      await ctx.db.patch('digests', context.digestId, {
        status: 'failed',
        stage: 'done',
        completedAt: Date.now(),
        failureCode: result.kind === 'canceled' ? 'WORKFLOW_CANCELED' : 'WORKFLOW_FAILED',
      });
    }
    if (digest !== null) {
      await ctx.db.patch('digests', context.digestId, { workflowQueueState: undefined });
    }
    await cleanup(ctx, components.workflow, workflowId);
    await startNextDigest(ctx);
    return null;
  },
});
