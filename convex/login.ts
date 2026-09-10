import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import schema, { serviceValidator } from './schema';
import { getIdentityOrThrow } from './utilities/auth';

export const listLinkedServices = query({
  args: {},
  returns: v.array(serviceValidator),
  handler: async (ctx) => {
    const identity = await getIdentityOrThrow(ctx);
    const linkedServices = await ctx.db
      .query('linkedServices')
      .withIndex('by_userTokenIdentifier_and_service', (q) => q.eq('userTokenIdentifier', identity.tokenIdentifier))
      .take(100);

    return linkedServices.map(({ service }) => service);
  },
});

export const saveLoginSession = internalMutation({
  args: {
    userTokenIdentifier: v.string(),
    service: serviceValidator,
    firecrawlProfileName: v.string(),
    firecrawlLiveViewURL: v.string(),
    firecrawlSessionID: v.string(),
  },
  returns: v.id('serviceLoginSessions'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('serviceLoginSessions', args);
  },
});

export const findExistingLoginSession = internalQuery({
  args: {
    userTokenIdentifier: v.string(),
    service: serviceValidator,
  },
  returns: v.union(schema.doc('serviceLoginSessions'), v.null()),
  handler: async (ctx, { service, userTokenIdentifier }) => {
    return await ctx.db
      .query('serviceLoginSessions')
      .withIndex('by_userTokenIdentifier_and_service', (q) =>
        q.eq('userTokenIdentifier', userTokenIdentifier).eq('service', service),
      )
      .first();
  },
});

export const findLinkedService = internalQuery({
  args: {
    userTokenIdentifier: v.string(),
    service: serviceValidator,
  },
  returns: v.union(schema.doc('linkedServices'), v.null()),
  handler: async (ctx, { service, userTokenIdentifier }) => {
    return await ctx.db
      .query('linkedServices')
      .withIndex('by_userTokenIdentifier_and_service', (q) =>
        q.eq('userTokenIdentifier', userTokenIdentifier).eq('service', service),
      )
      .first();
  },
});

export const completeLogin = internalMutation({
  args: {
    serviceLoginSessionsDocumentID: v.id('serviceLoginSessions'),
    userTokenIdentifier: v.string(),
    service: serviceValidator,
    firecrawlProfileName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { service, serviceLoginSessionsDocumentID, userTokenIdentifier, firecrawlProfileName }) => {
    await ctx.db.delete('serviceLoginSessions', serviceLoginSessionsDocumentID);
    await ctx.db.insert('linkedServices', { userTokenIdentifier, service, firecrawlProfileName });
    return null;
  },
});

export const deleteExistingSession = internalMutation({
  args: {
    serviceLoginSessionsDocumentID: v.id('serviceLoginSessions'),
  },
  returns: v.null(),
  handler: async (ctx, { serviceLoginSessionsDocumentID }) => {
    await ctx.db.delete('serviceLoginSessions', serviceLoginSessionsDocumentID);
    return null;
  },
});

export const deleteLinkedService = internalMutation({
  args: {
    linkedServiceDocumentID: v.id('linkedServices'),
  },
  returns: v.null(),
  handler: async (ctx, { linkedServiceDocumentID }) => {
    await ctx.db.delete('linkedServices', linkedServiceDocumentID);
    return null;
  },
});
