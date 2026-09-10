import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const saveLoginSession = internalMutation({
    args: {
        userTokenIdentifier: v.string(),
        service: v.string(),
        firecrawlProfileName: v.string(),
        firecrawlLiveViewURL: v.string(),
        firecrawlSessionID: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("serviceLoginSessions", args);
    }
});

export const findExistingLoginSession = internalQuery({
    args: {
        userTokenIdentifier: v.string(),
        service: v.string(),
    },
    handler: async (ctx, { service, userTokenIdentifier }) => {
        return await ctx.db
            .query("serviceLoginSessions")
            .withIndex("by_userTokenIdentifier_and_service", (q) => (
                q.eq("userTokenIdentifier", userTokenIdentifier)
                .eq("service", service)
            ))
            .first();
    }
});

export const completeLogin = internalMutation({
    args: {
        serviceLoginSessionsDocumentID: v.id("serviceLoginSessions"),
        userTokenIdentifier: v.string(),
        service: v.string(),
        firecrawlProfileName: v.string(),
    },
    handler: async (ctx, { service, serviceLoginSessionsDocumentID, userTokenIdentifier, firecrawlProfileName }) => {
        await ctx.db.delete("serviceLoginSessions", serviceLoginSessionsDocumentID);
        await ctx.db.insert("linkedServices", { userTokenIdentifier, service, firecrawlProfileName });
    }
});

export const deleteExistingSession = internalMutation({
    args: {
        serviceLoginSessionsDocumentID: v.id("serviceLoginSessions"),
    },
    handler: async (ctx, { serviceLoginSessionsDocumentID }) => {
        await ctx.db.delete("serviceLoginSessions", serviceLoginSessionsDocumentID);
    }
})