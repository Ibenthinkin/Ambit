// The contract every source adapter implements (SPEC §6.1). Each source (Wikipedia, Met, AIC,
// CMA, Wellcome, and — since Phase A.5 — Ben's own archive service) lives in its own file under
// server/services/sources/ and speaks this same shape outward, so the ingestion job (Phase 3.4)
// never needs to know a source's own field names, pagination style, or licensing quirks — those
// all get absorbed by that source's toItem().

/** The open set of source ids. Kept a plain string union (not narrowed further) because Phase 6
 *  adds more sources without touching this file — only the DB's `item.source` column and this
 *  union grow. */
export type SourceId =
  | "wikipedia"
  | "met"
  | "aic"
  | "cma"
  | "wellcome"
  | "archive"
  // Phase 6.2 trial sources (docs/source-candidates.md's trial loop). They are adapters and DB
  // rows, not yet committed v1 sources — each is promoted into SPEC §6.1 or cut after Ben's
  // Keep/Park/Cut verdict on the trial evidence.
  | "smithsonian"
  | "loc"
  | "nasa-images";

/**
 * What toItem() produces: the `item` table's insert shape, minus the four fields ingestion adds
 * itself (id, topicId, curationScore, aestheticTags — see src/server/db/schema.ts). `summary` is
 * always a real string (never null/empty) because both the LLM curator and the offline embedding
 * tooling read it as the item's primary text signal.
 */
export interface NormalizedItem {
  source: SourceId;
  sourceId: string;
  type: "image" | "article";
  title: string;
  summary: string;
  /** Full article text. Articles only — image items leave this null. */
  body: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  attribution: string;
  license: string;
  tags: string[];
}

export interface FetchOpts {
  /** How many normalized items the caller wants back. Adapters typically scan well past this —
   *  public-domain/licensing re-checks on the raw hits drop a large fraction on some sources
   *  (Phase 0 measured the Met losing 30-70% of its own "public domain" search filter's claims) —
   *  so `limit` bounds the *output*, not the number of raw records an adapter is willing to touch. */
  limit?: number;
}

/**
 * One adapter per source. `search()`'s return order is load-bearing: the array index IS that
 * item's search rank within this query, which scripts/ingest.ts's collision-resolution rule
 * ("highest search rank wins" — SPEC §15) depends on to pick a winner when the same object
 * answers two topics' seed queries.
 */
export interface SourceAdapter<Raw = unknown> {
  source: SourceId;
  search(query: string, opts?: FetchOpts): Promise<Raw[]>;
  /** Pure and synchronous on purpose — this is the unit-test surface, exercised against recorded
   *  fixtures rather than live API responses (see __fixtures__/). */
  toItem(raw: Raw): NormalizedItem;
}
