'use node';

import { AgentMailClient } from 'agentmail';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { env, internalAction } from '../_generated/server';

const agentmail = new AgentMailClient({ apiKey: env.AGENTMAIL_API_KEY });

export const sendDigestEmail = internalAction({
  args: { digestId: v.id('digests') },
  returns: v.null(),
  handler: async (ctx, { digestId }) => {
    const payload = await ctx.runQuery(internal.digests.getDigestEmailPayload, { digestId });
    if (payload.kind === 'skip') {
      await ctx.runMutation(internal.digests.markDigestEmailSkipped, {
        digestId,
        failureCode: payload.failureCode,
      });
      return null;
    }

    try {
      const response = await agentmail.inboxes.messages.send(
        payload.inboxId,
        {
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          labels: ['daily-digest'],
        },
        { idempotencyKey: payload.idempotencyKey },
      );
      await ctx.runMutation(internal.digests.markDigestEmailSent, {
        digestId,
        messageId: response.messageId,
        threadId: response.threadId,
        inboxId: payload.inboxId,
      });
    } catch (error) {
      await ctx.runMutation(internal.digests.markDigestEmailFailed, { digestId });
      throw error;
    }
    return null;
  },
});
