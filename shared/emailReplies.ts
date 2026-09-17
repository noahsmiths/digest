export function senderEmail(address: string): string | null {
  if (address.includes('<') && !/^[^<>@]*<[^<>]+>\s*$/.test(address)) return null;
  const email = (address.match(/<([^<>]+)>\s*$/)?.[1] ?? address).trim().toLowerCase();
  return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email) ? email : null;
}

export function replyReferences(inReplyTo: string | undefined, references: string[] = []): string[] {
  return [...new Set([...(inReplyTo === undefined ? [] : [inReplyTo]), ...references.slice(0, 20), ...references.slice(-10)])];
}

export function replyDirectives(message: { text?: string; extractedText?: string; labels: string[]; headers?: Record<string, string> }): string | null {
  if (message.labels.some((label) => ['spam', 'blocked', 'unauthenticated', 'sent'].includes(label.toLowerCase()))) return null;
  const headers = Object.fromEntries(Object.entries(message.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.toLowerCase()]));
  if ((headers['auto-submitted'] && headers['auto-submitted'] !== 'no') || /^(bulk|junk|list)$/.test(headers.precedence ?? '') || headers['x-autoreply'] || headers['x-autorespond']) return null;
  const text = message.extractedText ?? message.text ?? '';
  const lines = text.split(/\r?\n/);
  const quoteStart = lines.findIndex((line) => /^\s*(On .+wrote:|[-_]{2,}\s*(Original Message|Forwarded message)|Begin forwarded message:|Your digest for .+ is ready\.)/i.test(line));
  const directives = lines.slice(0, quoteStart === -1 ? lines.length : quoteStart).filter((line) => !/^\s*>/.test(line)).join('\n').trim();
  return directives === '' ? null : directives;
}
