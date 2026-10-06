// "a", "a and b", "a, b and c" — the one way the reveal's sentences list things (the compass's
// clauses, the subtitle's wings, what the reader opened). A leaf, so compass.ts stays one too.
export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
