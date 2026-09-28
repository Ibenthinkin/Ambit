// Body enrichment at ingest (docs/PLAN_writing.md Phase 2 §1). Internal to ingest, not part of
// the SourceAdapter contract: an adapter's `search()` stays cheap, and the one-request-per-page
// body fetch is paid here, only for the rows that are new and survived the structural floor.
//
// **The bug this closes.** Until 09-28-26 ingest never called `fetchBody`, so every Wikipedia row
// on production — 3,191 of them — was stored with a NULL body and a tapped card showed one
// paragraph. Locally the rows had bodies only because `scripts/backfill-wikipedia-bodies.ts` had
// been run here by hand. Ingest runs this before the writing floor and the curator, which is what
// lets them read the article rather than its lede.

import { fetchBody } from "./wikipedia";
import type { NormalizedItem, SourceId } from "./types";

/** One source's body fetch. Null means "no body to be had" — the item is kept without one. */
export type BodyFetcher = (item: NormalizedItem) => Promise<string | null>;

/** Which sources have a body worth fetching separately. One today. */
export const BODY_FETCHERS: Partial<Record<SourceId, BodyFetcher>> = {
  wikipedia: (item) => fetchBody(Number(item.sourceId)),
};

/**
 * Fill in `body` for every article from a source with a fetcher, where it is missing. Sequential
 * on purpose: `fetchJson`'s per-call delay is the politeness budget, and a night's new Wikipedia
 * rows are a few hundred at most. A fetch that throws or returns nothing leaves the item
 * bodiless — it is still judged, on its summary — and is counted, so a Wikipedia outage shows in
 * the ingest summary rather than as a quiet drop in reading times.
 */
export async function enrichBodies(
  items: readonly NormalizedItem[],
  fetchers: Partial<Record<string, BodyFetcher>> = BODY_FETCHERS,
): Promise<{ items: NormalizedItem[]; fetched: number; failed: number }> {
  let fetched = 0;
  let failed = 0;
  const out: NormalizedItem[] = [];
  for (const item of items) {
    const fetcher = fetchers[item.source];
    if (item.type !== "article" || item.body?.trim() || !fetcher) {
      out.push(item);
      continue;
    }
    try {
      const body = await fetcher(item);
      if (body?.trim()) {
        fetched++;
        out.push({ ...item, body });
      } else {
        failed++;
        out.push(item);
      }
    } catch {
      failed++;
      out.push(item);
    }
  }
  return { items: out, fetched, failed };
}
