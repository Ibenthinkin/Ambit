// Small text-shaping helpers shared by every adapter's toItem(). Ported verbatim in spirit from
// phase0/harvest.ts (toLede, uniqueTags) — the same functions that produced the corpus the topic
// graph and curation prompt were validated against, so the real adapters keep behaving the way
// Phase 0's findings assumed.

/**
 * Collapse whitespace (Wikipedia's plaintext extracts, in particular, come back with irregular
 * runs of spaces/newlines) and trim to a lede-sized string, cutting at a sentence boundary where
 * one exists past the halfway point — a hard mid-word cut reads worse than a shorter-but-clean one.
 */
export function toLede(text: string, max = 700): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > max * 0.5
    ? cut.slice(0, lastStop + 1)
    : cut.trimEnd() + "…";
}

/**
 * Dedupe a tag list, dropping null/undefined/whitespace-only entries and trimming what's kept.
 * Every source hands toItem() a slightly different raw tag shape (Wikipedia categories, Met
 * department/medium/culture, CMA type/technique, ...) — this is the one place that mess gets
 * cleaned up before it lands on `item.tags`.
 */
export function uniqueTags(tags: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      tags.filter((t): t is string => Boolean(t?.trim())).map((t) => t.trim()),
    ),
  ];
}
