// How ingest turns `config/reading-phrases.ts` into Wikipedia queries (docs/PLAN_writing.md Phase
// 2 §4). Pure, so the split and the dedupe are tested here; `scripts/ingest.ts` cannot be
// imported by a test (it runs main() on import).

import type { ReadingPhrase } from "~/server/config/reading-phrases";
import type { NormalizedItem } from "./sources/types";

/** Articles one phrase asks for when it names no `limit`. Sharp phrases, so a handful each. */
export const DEFAULT_PHRASE_LIMIT = 15;

export type ReadingPlan = {
  /** Keyword searches whose hits are claims for a topic — the seed-cell path. */
  tied: { topicId: string; query: string; limit: number }[];
  /** Untied phrases and `list:<name>` draws — the walk items' write path. */
  untied: { query: string; limit: number }[];
};

/**
 * Split the phrases for one run. `quota` (ingest's `--quota`) caps every limit, so a smoke run
 * stays small. With `--topic`, only that topic's tied phrases run — an untied phrase belongs to
 * no topic, so a topic-scoped run has no business spending on it. `known` (the topic ids in the
 * database) drops a tied phrase whose topic isn't there, rather than writing a claim whose foreign
 * key would fail — the CI database seeds only the sixteen originals.
 */
export function planReadingQueries(
  phrases: readonly ReadingPhrase[],
  topicFlag: string | null,
  quota: number,
  known?: ReadonlySet<string>,
): ReadingPlan {
  const cap = (n: number | undefined) =>
    Math.min(n ?? DEFAULT_PHRASE_LIMIT, quota);
  const plan: ReadingPlan = { tied: [], untied: [] };
  for (const p of phrases) {
    if ("list" in p) {
      if (!topicFlag)
        plan.untied.push({ query: `list:${p.list}`, limit: cap(p.limit) });
    } else if (p.topic) {
      if (topicFlag && p.topic !== topicFlag) continue;
      if (known && !known.has(p.topic)) continue;
      plan.tied.push({
        topicId: p.topic,
        query: p.phrase,
        limit: cap(p.limit),
      });
    } else if (!topicFlag) {
      plan.untied.push({ query: p.phrase, limit: cap(p.limit) });
    }
  }
  return plan;
}

/**
 * The untied hits a run will write: minus anything a tied phrase already claimed (that page is a
 * claim, with its seed topic — writing it twice would be harmless, upsert never overwrites and
 * the second curation is a cache hit, but wrong in every count), and minus repeats within the
 * untied set itself (a page on two lists).
 */
export function mergeUnseeded(
  unseeded: readonly NormalizedItem[],
  claimedKeys: ReadonlySet<string>,
): NormalizedItem[] {
  const seen = new Set(claimedKeys);
  const out: NormalizedItem[] = [];
  for (const it of unseeded) {
    const key = `${it.source}:${it.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
