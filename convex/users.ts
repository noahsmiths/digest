import { vGithubProfile } from '@convex-dev/auth/providers/oauth/github';
import { validateEmailFormat } from '@convex-dev/auth/email/validation';
import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx } from './_generated/server';
import schema from './schema';

const DEFAULT_DELIVERY_TIME = '08:00';

function initialDeliveryAt() {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0);
  return today > now.getTime() ? today : today + 24 * 60 * 60 * 1000;
}

async function createDefaultPreferences(
  ctx: MutationCtx,
  userId: Id<'users'>,
) {
  await ctx.db.insert('userPreferences', {
    userId,
    automaticDigestEnabled: true,
    deliveryTime: DEFAULT_DELIVERY_TIME,
    timeZone: 'UTC',
    nextDeliveryAt: initialDeliveryAt(),
  });
}

export const createUserPassword = internalMutation({
  args: {
    provider: v.literal('password'),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id('users'),
  handler: async (ctx, { profile }) => {
    if (validateEmailFormat(profile.username) !== null) {
      throw new ConvexError('Enter a valid email address.');
    }
    const userId = await ctx.db.insert('users', { email: profile.username });
    await createDefaultPreferences(ctx, userId);
    return userId;
  },
});

export const createUserGithub = internalMutation({
  args: {
    provider: v.literal('github'),
    providerAccountId: v.string(),
    profile: vGithubProfile,
  },
  returns: v.id('users'),
  handler: async (ctx, { profile }) => {
    const userId = await ctx.db.insert('users', {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
    await createDefaultPreferences(ctx, userId);
    return userId;
  },
});

export const getCurrent = query({
  args: {},
  returns: v.union(schema.doc('users'), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    const userId = ctx.db.normalizeId('users', identity.subject);
    return userId === null ? null : await ctx.db.get('users', userId);
  },
});
