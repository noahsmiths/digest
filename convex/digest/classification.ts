import { Agent } from '@convex-dev/agent';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { ModelMessage, UserContent } from 'ai';
import { z } from 'zod/v3';
import { components } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';

const categorySchema = z.enum(['news', 'social', 'artists', 'other']);
const classificationSchema = z.object({
  classifications: z.array(
    z.object({
      ordinal: z.number().int().nonnegative(),
      category: categorySchema,
    }),
  ),
});

const classifierInstructions = `Categorize every supplied post using its content first and its author only as a tie-breaker.
News: reporting or analysis of current politics. Nothing pop-media
Artists: creative work, releases, performances, process, or creator updates.
Social: personal or professional life, opinions, conversations, or community updates.
Other: anything outside those definitions.
Return exactly one classification for every ordinal. Do not rewrite, summarize, or quote the posts.`;

export type DigestClassification = {
  digestPostId: Id<'digestPosts'>;
  category: z.infer<typeof categorySchema>;
};

export async function classifyPostsWithModel(
  ctx: ActionCtx,
  userId: string,
  posts: Array<Pick<Doc<'digestPosts'>, '_id' | 'author' | 'body' | 'imageStorageIds'>>,
  languageModel: LanguageModelV4,
): Promise<DigestClassification[]> {
  const content: UserContent = [];
  for (const [ordinal, post] of posts.entries()) {
    content.push({
      type: 'text',
      text: `Post ${ordinal}\nAuthor: ${post.author}\nBody: ${post.body === '' ? '[No text]' : post.body}`,
    });
    for (const storageId of post.imageStorageIds) {
      const url = await ctx.storage.getUrl(storageId);
      if (url !== null) content.push({ type: 'file', mediaType: 'image', data: new URL(url) });
    }
  }
  const messages: ModelMessage[] = [{ role: 'user', content }];
  const classifier = new Agent(components.agent, {
    name: 'Digest Classifier',
    languageModel,
    instructions: classifierInstructions,
    contextOptions: { recentMessages: 0 },
    storageOptions: { saveMessages: 'none' },
  });
  const result = await classifier.generateObject(
    ctx,
    { userId },
    { messages, schema: classificationSchema, maxRetries: 1 },
    { contextOptions: { recentMessages: 0 }, storageOptions: { saveMessages: 'none' } },
  );
  const output: z.infer<typeof classificationSchema> = result.object;
  const ordinals = new Set(output.classifications.map(({ ordinal }) => ordinal));
  if (
    output.classifications.length !== posts.length ||
    ordinals.size !== posts.length ||
    output.classifications.some(({ ordinal }) => ordinal >= posts.length)
  ) {
    throw new Error('INVALID_CLASSIFICATION_OUTPUT');
  }
  return output.classifications
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(({ ordinal, category }) => ({ digestPostId: posts[ordinal]._id, category }));
}
