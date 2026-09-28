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
 * rows are a few hundred at most.
 *
 * Two kinds of "no body", treated differently (the Phase 2 review's finding):
 *  - **none** — the source answered and has no extract. That will not change, so the item is
 *    kept bodiless and judged on its summary.
 *  - **deferred** — the fetch *threw* (a Wikipedia blip, after `fetchJson`'s own retries). The
 *    item is **dropped from this run**, with a warning: kept, it would be curated from its lede
 *    and stored bodiless for good, because ingest never revisits a stored row. Dropped, it is
 *    simply new again tomorrow, and the retry costs nothing.
 */
export async function enrichBodies(
  items: readonly NormalizedItem[],
  fetchers: Partial<Record<string, BodyFetcher>> = BODY_FETCHERS,
  onWarn: (msg: string) => void = (msg) => console.warn(msg),
): Promise<{
  items: NormalizedItem[];
  fetched: number;
  none: number;
  deferred: number;
}> {
  let fetched = 0;
  let none = 0;
  let deferred = 0;
  const out: NormalizedItem[] = [];
  for (const item of items) {
    const fetcher = fetchers[item.source];
    if (item.type !== "article" || item.body?.trim() || !fetcher) {
      out.push(item);
      continue;
    }
    let body: string | null;
    try {
      body = await fetcher(item);
    } catch (err) {
      deferred++;
      onWarn(
        `  body fetch failed for ${item.source}:${item.sourceId} "${item.title.slice(0, 40)}" — ${String(err)}; left for the next run`,
      );
      continue;
    }
    if (body?.trim()) {
      fetched++;
      out.push({ ...item, body });
    } else {
      none++;
      out.push(item);
    }
  }
  return { items: out, fetched, none, deferred };
}
