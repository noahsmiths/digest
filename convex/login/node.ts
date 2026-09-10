"use node";

import { v } from "convex/values";
import { action, env } from "../_generated/server";
import { getIdentityOrThrow } from "../utilities/auth";
import Firecrawl from "firecrawl";
import { serviceToLoginURL } from "../utilities/sites";
import { internal } from "../_generated/api";

export const startLoginSession = action({
    args: {
        service: v.string(),
    },
    handler: async (ctx, { service }) => {
        const identity = await getIdentityOrThrow(ctx);
        const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

        const existingLoginSession = await ctx.runQuery(internal.login.findExistingLoginSession, { userTokenIdentifier: identity.tokenIdentifier, service })
        if (existingLoginSession) {
            await firecrawl.deleteBrowser(existingLoginSession.firecrawlSessionID);
            await ctx.runMutation(internal.login.deleteExistingSession, { serviceLoginSessionsDocumentID: existingLoginSession._id });
        }

        const profileName = crypto.randomUUID();
        const TTL = 300;
        const session = await firecrawl.browser({ ttl: TTL, activityTtl: 120, streamWebView: true, profile: { name: profileName, saveChanges: true }});

        if (!session.id) {
            throw new Error(`Firecrawl session ID missing: ${session}`);
        }
        if (!session.interactiveLiveViewUrl) {
            throw new Error(`Firecrawl session lacks an interactiveLiveViewUrl: ${session.interactiveLiveViewUrl}`);
        }

        await firecrawl.browserExecute(session.id, {
            code: `await page.goto("${serviceToLoginURL(service)}");`,
            language: "node"
        });

        await ctx.runMutation(internal.login.saveLoginSession, {
            userTokenIdentifier: identity.tokenIdentifier,
            service,
            firecrawlProfileName: profileName,
            firecrawlLiveViewURL: session.interactiveLiveViewUrl,
            firecrawlSessionID: session.id,
        });

        return session.interactiveLiveViewUrl;
    },
});

export const completeLoginSession = action({
    args: {
        service: v.string(),
    },
    handler: async (ctx, { service }) => {
        const identity = await getIdentityOrThrow(ctx);
        const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });

        const existingLoginSession = await ctx.runQuery(internal.login.findExistingLoginSession, { userTokenIdentifier: identity.tokenIdentifier, service })
        if (!existingLoginSession) {
            throw new Error(`No existing login session for user ${identity.tokenIdentifier} and service ${service}`);
        }

        await firecrawl.deleteBrowser(existingLoginSession.firecrawlSessionID);

        await ctx.runMutation(internal.login.completeLogin, {
            serviceLoginSessionsDocumentID: existingLoginSession._id,
            userTokenIdentifier: identity.tokenIdentifier,
            service: service,
            firecrawlProfileName: existingLoginSession.firecrawlProfileName,
        });
    }
})
