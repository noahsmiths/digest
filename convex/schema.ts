import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const serviceValidator = v.union(v.literal('instagram'), v.literal('x'), v.literal('linkedin'));

export const digestCategoryValidator = v.string();

export const digestDecisionValidator = v.string();

export const digestStatusValidator = v.union(
  v.literal('running'),
  v.literal('completed'),
  v.literal('partial'),
  v.literal('failed'),
);

export const digestStageValidator = v.union(
  v.literal('queued'),
  v.literal('scraping'),
  v.literal('classifying'),
  v.literal('done'),
);

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
  userPreferences: defineTable({
    userId: v.id('users'),
    userTokenIdentifier: v.optional(v.string()),
    automaticDigestEnabled: v.boolean(),
    deliveryTime: v.string(),
    timeZone: v.string(),
    nextDeliveryAt: v.number(),
    classificationPrompt: v.optional(v.string()),
  })
    .index('by_userId', ['userId'])
    .index('by_userTokenIdentifier', ['userTokenIdentifier'])
    .index('by_automaticDigestEnabled_and_nextDeliveryAt', ['automaticDigestEnabled', 'nextDeliveryAt']),
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
    classificationPrompt: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    workflowQueueState: v.optional(v.union(v.literal('queued'), v.literal('running'))),
    completedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    emailDeliveryStatus: v.optional(digestEmailDeliveryStatusValidator),
    emailOutboundId: v.optional(v.string()),
    emailThreadId: v.optional(v.string()),
    emailInboxId: v.optional(v.string()),
    emailFailureCode: v.optional(v.string()),
  })
    .index('by_userTokenIdentifier', ['userTokenIdentifier'])
    .index('by_userTokenIdentifier_and_status', ['userTokenIdentifier', 'status'])
    .index('by_workflowQueueState', ['workflowQueueState'])
    .index('by_stage', ['stage'])
    .index('by_emailOutboundId', ['emailOutboundId']),
  emailPreferenceReplies: defineTable({
    digestId: v.id('digests'),
    preferencesId: v.id('userPreferences'),
    inboxId: v.string(),
    messageId: v.string(),
    eventId: v.string(),
    threadId: v.string(),
    senderEmail: v.string(),
    agentThreadId: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('applied'),
      v.literal('unchanged'),
      v.literal('ignored'),
      v.literal('failed'),
    ),
    directives: v.optional(v.string()),
    previousPrompt: v.optional(v.string()),
    updatedPrompt: v.optional(v.string()),
    confirmationText: v.optional(v.string()),
    confirmationMessageId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    workflowId: v.optional(v.string()),
  })
    .index('by_inboxId_and_messageId', ['inboxId', 'messageId'])
    .index('by_digestId', ['digestId']),
  digestAssets: defineTable({
    digestId: v.id('digests'),
    storageId: v.id('_storage'),
  }).index('by_digestId', ['digestId']),
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
