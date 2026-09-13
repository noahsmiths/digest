export type JsonObject = Record<string, unknown>;

export function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function path(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index)) {
        return null;
      }
      current = current[index];
      continue;
    }
    const record = object(current);
    if (record === null) {
      return null;
    }
    current = record[key];
  }
  return current;
}

export function stringAt(value: unknown, keys: string[]): string | null {
  return string(path(value, keys));
}

export function firstStringAt(value: unknown, paths: string[][]): string | null {
  for (const keys of paths) {
    const result = stringAt(value, keys);
    if (result !== null && result.trim() !== '') {
      return result;
    }
  }
  return null;
}

export function collectObjects(value: unknown, predicate: (value: JsonObject) => boolean): JsonObject[] {
  const matches: JsonObject[] = [];
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
      }
      return;
    }

    const record = object(current);
    if (record === null) {
      return;
    }
    if (predicate(record)) {
      matches.push(record);
    }
    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(value);
  return matches;
}

export function containsKey(value: unknown, pattern: RegExp): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsKey(item, pattern));
  }

  const record = object(value);
  if (record === null) {
    return false;
  }
  return Object.entries(record).some(([key, child]) => pattern.test(key) || containsKey(child, pattern));
}

export function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null && value !== ''))];
}
