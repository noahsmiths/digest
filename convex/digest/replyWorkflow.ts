import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { workflow } from './workflow';

export const run = workflow.define({
  args: { replyId: v.id('emailPreferenceReplies') },
  handler: async (step, { replyId }): Promise<void> => {
    try {
      const directives: string | null = await step.runAction(internal.digest.replyActions.hydrateReply, { replyId });
      if (directives === null) {
        await step.runMutation(internal.emailReplies.finishWithoutUpdate, { replyId, status: 'ignored' });
        return;
      }
      await step.runMutation(internal.emailReplies.recordDirectives, { replyId, directives });
      let saved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const context = await step.runQuery(internal.emailReplies.getContext, { replyId }, { name: `preferences-${attempt}` });
        const update: { updatedPrompt: string | null; message: string } = await step.runAction(internal.digest.replyActions.proposeUpdate, {
          replyId, classificationPrompt: context.classificationPrompt,
        }, { name: `edit-preferences-${attempt}` });
        const outcome: 'saved' | 'conflict' = await step.runMutation(internal.emailReplies.applyUpdate, {
          replyId, expectedPrompt: context.classificationPrompt, ...update,
        }, { name: `save-preferences-${attempt}` });
        if (outcome === 'saved') { saved = true; break; }
      }
      if (!saved) throw new Error('PREFERENCE_CONFLICT');
    } catch {
      await step.runMutation(internal.emailReplies.finishWithoutUpdate, { replyId, status: 'failed', failureCode: 'PREFERENCE_UPDATE_FAILED' });
    }
    await step.runAction(internal.digest.replyActions.sendConfirmation, { replyId });
  },
});
