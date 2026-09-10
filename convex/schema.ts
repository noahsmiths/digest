import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const serviceValidator = v.union(
  v.literal('instagram'),
  v.literal('x'),
  v.literal('facebook'),
  v.literal('linkedin'),
);

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
});
