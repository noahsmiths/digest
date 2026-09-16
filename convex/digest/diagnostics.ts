export function errorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: message
      .slice(0, 500)
      .replace(/https?:\/\/[^\s"']+/gi, '[url]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (value) =>
        /^[A-Z]+(?:_[A-Z]+)+$/.test(value) ? value : '[token]',
      )
      .replace(/((?:api[_-]?key|authorization|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]'),
  };
}
