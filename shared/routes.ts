export function digestPath(digestId: string) {
  return `/digest/${encodeURIComponent(digestId)}`;
}
