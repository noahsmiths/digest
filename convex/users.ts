import { vGithubProfile } from '@convex-dev/auth/providers/oauth/github';
import { validateEmailFormat } from '@convex-dev/auth/email/validation';
import { ConvexError, v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import schema from './schema';

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
    return await ctx.db.insert('users', { email: profile.username });
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
    return await ctx.db.insert('users', {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
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
