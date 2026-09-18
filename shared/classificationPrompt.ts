export type PromptCategory = { id: string; name: string; prompt: string };
export type ClassificationPrompt = { categories: PromptCategory[] };

export const DEFAULT_CLASSIFICATION_PROMPT = `## Social
Personal life updates from friends, such as trips, birthdays, conversations, graduations, or other social events people want to know about. If the post isn't from a mutual, definitely do NOT include it. If the post is from a mutual, it likely should be included.

## Events
A future meetup, gathering, performance, or other scheduled event with enough concrete timing or planning information to be useful.`;

export function parseClassificationPrompt(prompt: string): ClassificationPrompt {
  const headings = [...prompt.matchAll(/^## (.*)$/gm)];
  return {
    categories: headings.map((heading, index) => {
      const name = heading[1].trim();
      return {
        id: name.toLowerCase(),
        name,
        prompt: prompt.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? prompt.length).trim(),
      };
    }).filter(({ id }) => id !== 'drop'),
  };
}

export function serializeClassificationPrompt({ categories }: ClassificationPrompt): string {
  return categories.map(({ name, prompt }) => `## ${name.trim()}\n${prompt.trim()}`).join('\n\n');
}

export function classificationPromptError(prompt: string): string | null {
  const parsed = parseClassificationPrompt(prompt);
  if (prompt.length > 20_000) return 'Keep your classification prompt under 20,000 characters.';
  if ([...prompt.matchAll(/^## (.*)$/gm)].some((heading) => heading[1].trim().toLowerCase() === 'drop')) return 'Drop is reserved and cannot be configured as a category.';
  if (parsed.categories.length < 1) return 'Add at least one digest category.';
  if (parsed.categories.length > 30) return 'Use no more than 30 categories.';
  if (parsed.categories.some(({ name, prompt }) => !name || name.length > 80 || !prompt)) return 'Give every category a name of up to 80 characters and a prompt.';
  if (new Set(parsed.categories.map(({ id }) => id)).size !== parsed.categories.length) return 'Each category needs a unique name.';
  return null;
}

export function classificationCategoryIds(prompt: string): [string, ...string[]] {
  return ['drop', ...parseClassificationPrompt(prompt).categories.map(({ id }) => id)];
}

export function digestCategories(prompt: string, postCategories: Array<string | undefined> = []) {
  const categories = parseClassificationPrompt(prompt).categories
    .map(({ id, name }) => ({ id, name }));
  for (const id of postCategories) {
    if (id !== undefined && id !== 'drop' && !categories.some((category) => category.id === id)) {
      categories.push({ id, name: id.charAt(0).toUpperCase() + id.slice(1) });
    }
  }
  return categories;
}
