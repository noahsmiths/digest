import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const serviceValidator = v.union(v.literal('instagram'), v.literal('x'), v.literal('linkedin'));

export const digestCategoryValidator = v.union(
  v.literal('news'),
  v.literal('social'),
  v.literal('artists'),
  v.literal('event'),
  v.literal('other'),
);

export const digestDecisionValidator = v.union(v.literal('social'), v.literal('event'), v.literal('drop'));

export const digestStatusValidator = v.union(
  v.literal('running'),
  v.literal('completed'),
  v.literal('partial'),
  v.literal('failed'),
);

export const digestStageValidator = v.union(v.literal('scraping'), v.literal('classifying'), v.literal('done'));

export const digestEmailDeliveryStatusValidator = v.union(
  v.literal('pending'),
  v.literal('queued'),
  v.literal('sent'),
  v.literal('skipped'),
  v.literal('failed'),
);

export const digestServiceResultValidator = v.object({
  service: serviceValidator,
  status: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed')),
  postCount: v.number(),
  errorCode: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }),
  linkedServices: defineTable({
    userTokenIdentifier: v.string(),
    service: serviceValidator,
    firecrawlProfileName: v.string(),
  }).index('by_userTokenIdentifier_and_service', ['userTokenIdentifier', 'service']),
  serviceLoginSessions: defineTable({
    userTokenIdentifier: v.string(),
    service: serviceValidator,
    firecrawlProfileName: v.string(),
    firecrawlLiveViewURL: v.string(),
    firecrawlSessionID: v.string(),
  })
    .index('by_userTokenIdentifier_and_service', ['userTokenIdentifier', 'service'])
    .index('by_firecrawlProfileName', ['firecrawlProfileName']),
  digests: defineTable({
    userTokenIdentifier: v.string(),
    status: digestStatusValidator,
    stage: digestStageValidator,
    maxPostsPerService: v.number(),
    serviceResults: v.array(digestServiceResultValidator),
    postCount: v.number(),
    classificationFallbackCount: v.number(),
    workflowId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    emailDeliveryStatus: v.optional(digestEmailDeliveryStatusValidator),
    emailOutboundId: v.optional(v.string()),
    emailFailureCode: v.optional(v.string()),
  })
    .index('by_userTokenIdentifier', ['userTokenIdentifier'])
    .index('by_userTokenIdentifier_and_status', ['userTokenIdentifier', 'status']),
  digestPosts: defineTable({
    digestId: v.id('digests'),
    service: serviceValidator,
    sourcePostId: v.string(),
    position: v.number(),
    author: v.string(),
    body: v.string(),
    imageStorageIds: v.array(v.id('_storage')),
    isMutual: v.optional(v.boolean()),
    category: v.optional(digestCategoryValidator),
    classificationSource: v.optional(v.union(v.literal('llm'), v.literal('fallback'))),
  })
    .index('by_digestId_and_position', ['digestId', 'position'])
    .index('by_digestId_and_service_and_sourcePostId', ['digestId', 'service', 'sourcePostId']),
});
