import { createThread } from '@convex-dev/agent';
import { cleanup, start as startWorkflow, vResultValidator, vWorkflowId } from '@convex-dev/workflow';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { env, internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import schema from './schema';
import { classificationPromptError, DEFAULT_CLASSIFICATION_PROMPT, parseClassificationPrompt, serializeClassificationPrompt } from '../shared/classificationPrompt';
import { replyReferences, senderEmail } from '../shared/emailReplies';

function currentPrompt(preferences: Doc<'userPreferences'>) {
  return serializeClassificationPrompt(parseClassificationPrompt(preferences.classificationPrompt ?? DEFAULT_CLASSIFICATION_PROMPT));
}

async function preferencesForReply(ctx: QueryCtx, reply: Doc<'emailPreferenceReplies'>) {
  const [digest, preferences] = await Promise.all([
    ctx.db.get('digests', reply.digestId),
    ctx.db.get('userPreferences', reply.preferencesId),
  ]);
  if (digest === null || preferences === null || preferences.userTokenIdentifier !== digest.userTokenIdentifier || senderEmail(digest.recipientEmail ?? '') !== reply.senderEmail) throw new Error('REPLY_NOT_AUTHORIZED');
  const user = await ctx.db.get('users', preferences.userId);
  if (senderEmail(user?.email ?? '') !== reply.senderEmail) throw new Error('REPLY_NOT_AUTHORIZED');
  return preferences;
}

export const enqueue = internalMutation({
  args: { inboxId: v.string(), messageId: v.string(), eventId: v.string(), threadId: v.string(), from: v.string(), inReplyTo: v.optional(v.string()), references: v.array(v.string()) },
  returns: v.union(v.id('emailPreferenceReplies'), v.null()),
  handler: async (ctx, args) => {
    if (args.inboxId !== env.AGENTMAIL_INBOX_ID) return null;
    const sender = senderEmail(args.from);
    if (sender === null) return null;
    const existing = await ctx.db.query('emailPreferenceReplies').withIndex('by_inboxId_and_messageId', (q) => q.eq('inboxId', args.inboxId).eq('messageId', args.messageId)).first();
    if (existing !== null) return existing._id;
    const candidates = await Promise.all(replyReferences(args.inReplyTo, args.references).map((messageId) => ctx.db.query('digests').withIndex('by_emailOutboundId', (q) => q.eq('emailOutboundId', messageId)).first()));
    const digest = candidates.find((candidate) => candidate !== null && senderEmail(candidate.recipientEmail ?? '') === sender && (candidate.emailInboxId ?? env.AGENTMAIL_INBOX_ID) === args.inboxId && (candidate.emailThreadId === undefined || candidate.emailThreadId === args.threadId));
    if (digest === undefined || digest === null) return null;
    const preferences = await ctx.db.query('userPreferences').withIndex('by_userTokenIdentifier', (q) => q.eq('userTokenIdentifier', digest.userTokenIdentifier)).first();
    if (preferences === null) return null;
    const user = await ctx.db.get('users', preferences.userId);
    if (senderEmail(user?.email ?? '') !== sender) return null;
    const agentThreadId = await createThread(ctx, components.agent, { userId: digest.userTokenIdentifier, title: 'Digest preferences from email' });
    const replyId = await ctx.db.insert('emailPreferenceReplies', {
      digestId: digest._id, preferencesId: preferences._id, inboxId: args.inboxId, messageId: args.messageId,
      eventId: args.eventId, threadId: args.threadId, senderEmail: sender, agentThreadId, status: 'pending',
    });
    const workflowId = await startWorkflow(ctx, internal.digest.replyWorkflow.run, { replyId }, {
      onComplete: internal.emailReplies.handleWorkflowComplete, context: { replyId }, startAsync: true,
    });
    await ctx.db.patch('emailPreferenceReplies', replyId, { workflowId });
    return replyId;
  },
});

export const getContext = internalQuery({
  args: { replyId: v.id('emailPreferenceReplies') },
  returns: v.object({ reply: schema.doc('emailPreferenceReplies'), classificationPrompt: v.string(), userTokenIdentifier: v.string() }),
  handler: async (ctx, { replyId }) => {
    const reply = await ctx.db.get('emailPreferenceReplies', replyId);
    if (reply === null) throw new Error('REPLY_NOT_FOUND');
    const preferences = await preferencesForReply(ctx, reply);
    return { reply, classificationPrompt: currentPrompt(preferences), userTokenIdentifier: preferences.userTokenIdentifier! };
  },
});

export const recordDirectives = internalMutation({
  args: { replyId: v.id('emailPreferenceReplies'), directives: v.string() },
  returns: v.null(),
  handler: async (ctx, { replyId, directives }) => {
    if (directives.length > 12_000) throw new Error('REPLY_TOO_LONG');
    await ctx.db.patch('emailPreferenceReplies', replyId, { directives });
    return null;
  },
});

export const applyUpdate = internalMutation({
  args: { replyId: v.id('emailPreferenceReplies'), expectedPrompt: v.string(), updatedPrompt: v.union(v.string(), v.null()), message: v.string() },
  returns: v.union(v.literal('saved'), v.literal('conflict')),
  handler: async (ctx, { replyId, expectedPrompt, updatedPrompt, message }) => {
    const reply = await ctx.db.get('emailPreferenceReplies', replyId);
    if (reply === null) throw new Error('REPLY_NOT_FOUND');
    const preferences = await preferencesForReply(ctx, reply);
    if (reply.status !== 'pending') return 'saved';
    if (currentPrompt(preferences) !== expectedPrompt) return 'conflict';
    if (updatedPrompt !== null) {
      const error = classificationPromptError(updatedPrompt);
      if (error !== null) throw new Error(error);
    }
    const changed = updatedPrompt !== null && updatedPrompt !== expectedPrompt;
    if (changed) await ctx.db.patch('userPreferences', preferences._id, { classificationPrompt: updatedPrompt });
    await ctx.db.patch('emailPreferenceReplies', replyId, {
      status: changed ? 'applied' : 'unchanged', previousPrompt: expectedPrompt,
      ...(updatedPrompt === null ? {} : { updatedPrompt }), confirmationText: message,
    });
    return 'saved';
  },
});

export const finishWithoutUpdate = internalMutation({
  args: { replyId: v.id('emailPreferenceReplies'), status: v.union(v.literal('ignored'), v.literal('failed')), failureCode: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { replyId, status, failureCode }) => {
    const reply = await ctx.db.get('emailPreferenceReplies', replyId);
    if (reply?.status === 'pending') await ctx.db.patch('emailPreferenceReplies', replyId, {
      status, ...(failureCode === undefined ? {} : { failureCode }),
      ...(status === 'failed' ? { confirmationText: "I couldn't update your digest preferences. Please reply again with a short, specific category change, or edit your rules in Settings. Your existing preferences are unchanged." } : {}),
    });
    return null;
  },
});

export const markConfirmed = internalMutation({
  args: { replyId: v.id('emailPreferenceReplies'), messageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { replyId, messageId }) => {
    const reply = await ctx.db.get('emailPreferenceReplies', replyId);
    await ctx.db.patch('emailPreferenceReplies', replyId, {
      confirmationMessageId: messageId,
      ...(reply?.status === 'applied' || reply?.status === 'unchanged' ? { failureCode: undefined } : {}),
    });
    return null;
  },
});

export const getWebhookConfig = internalQuery({
  args: {},
  returns: v.object({ inboxId: v.string(), url: v.string() }),
  handler: async () => ({ inboxId: env.AGENTMAIL_INBOX_ID, url: `${env.CONVEX_SITE_URL}/webhooks/agentmail` }),
});

export const handleWorkflowComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ replyId: v.id('emailPreferenceReplies') }) },
  returns: v.null(),
  handler: async (ctx, { workflowId, result, context }) => {
    if (result.kind !== 'success') {
      const reply = await ctx.db.get('emailPreferenceReplies', context.replyId);
      if (reply !== null) await ctx.db.patch('emailPreferenceReplies', reply._id, {
        ...(reply.status === 'pending' ? { status: 'failed' as const } : {}), failureCode: 'REPLY_WORKFLOW_FAILED',
      });
    }
    await cleanup(ctx, components.workflow, workflowId);
    return null;
  },
});
