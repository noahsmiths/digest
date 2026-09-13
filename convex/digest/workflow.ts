import { WorkflowManager } from '@convex-dev/workflow';
import { v, type Infer } from 'convex/values';
import { components, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { digestCategoryValidator } from '../schema';

const CLASSIFICATION_BATCH_SIZE = 10;
const RETRY_BEHAVIOR = { maxAttempts: 3, initialBackoffMs: 1_000, base: 2 } as const;

type Category = Infer<typeof digestCategoryValidator>;
type Classification = { digestPostId: Id<'digestPosts'>; category: Category };

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 10,
    defaultRetryBehavior: RETRY_BEHAVIOR,
    retryActionsByDefault: true,
  },
});

function scrapeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AUTH_REQUIRED')) {
    return 'AUTH_REQUIRED';
  }
  if (message.includes('FEED_CAPTURE_TIMEOUT')) {
    return 'FEED_CAPTURE_TIMEOUT';
  }
  return 'SCRAPE_FAILED';
}

export const runDigest = workflow.define({
  args: { digestId: v.id('digests') },
  handler: async (step, { digestId }): Promise<void> => {
    const state: { services: Array<'instagram' | 'x' | 'linkedin'>; maxPostsPerService: number } = await step.runQuery(
      internal.digests.getWorkflowState,
      { digestId },
    );

    for (const service of state.services) {
      try {
        const postCount: number = await step.runAction(
          internal.digest.actions.scrapeServiceToDigest,
          { digestId, service, maxPosts: state.maxPostsPerService },
          { name: `scrape-${service}`, retry: RETRY_BEHAVIOR },
        );
        await step.runMutation(
          internal.digests.recordServiceSuccess,
          { digestId, service, postCount },
          { name: `record-${service}-success` },
        );
      } catch (error) {
        await step.runMutation(
          internal.digests.recordServiceFailure,
          { digestId, service, errorCode: scrapeErrorCode(error) },
          { name: `record-${service}-failure` },
        );
      }
    }

    await step.runMutation(internal.digests.markClassifying, { digestId }, { name: 'mark-classifying' });
    const digestPostIds: Id<'digestPosts'>[] = await step.runQuery(internal.digests.getPostIds, { digestId });
    const batches: Array<Id<'digestPosts'>[]> = [];
    for (let index = 0; index < digestPostIds.length; index += CLASSIFICATION_BATCH_SIZE) {
      batches.push(digestPostIds.slice(index, index + CLASSIFICATION_BATCH_SIZE));
    }

    const outcomes = await Promise.all(
      batches.map(async (batch, index): Promise<{ source: 'llm' | 'fallback'; classifications: Classification[] }> => {
        try {
          const classifications: Classification[] = await step.runAction(
            internal.digest.actions.classifyPosts,
            { digestPostIds: batch },
            { name: `classify-${index}`, retry: RETRY_BEHAVIOR },
          );
          return { source: 'llm', classifications };
        } catch {
          return {
            source: 'fallback',
            classifications: batch.map((digestPostId) => ({ digestPostId, category: 'other' })),
          };
        }
      }),
    );

    for (const [index, outcome] of outcomes.entries()) {
      await step.runMutation(
        internal.digests.applyClassifications,
        { digestId, source: outcome.source, classifications: outcome.classifications },
        { name: `save-classifications-${index}` },
      );
    }
    await step.runMutation(internal.digests.finalize, { digestId }, { name: 'finalize-digest' });
  },
});
