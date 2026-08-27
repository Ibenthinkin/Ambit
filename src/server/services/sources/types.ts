// The contract every source adapter implements (SPEC §6.1). Since Phase 6.3 there are two shapes
// in this file — SourceAdapter (search) and CorpusWalkAdapter (walk) — and scripts/ingest.ts runs
// one lane per shape. Each source (Wikipedia, Met, AIC,
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
  | "nasa-images"
  | "poetrydb"
  // Phase 6.3: the first designated blog (docs/PHASE6_DESIGN_6.3.md). Blogs are corpus-WALK
  // sources — see CorpusWalkAdapter below — and are registered in server/config/blogs.ts, which
  // is also where their credit-line label and license string live.
  | "doorofperception";

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

/**
 * One page of a corpus walk. `next` is the cursor for the following page and is ABSENT (not
 * null, not "") when the corpus is exhausted — ingest loops `while (next)`.
 */
export interface WalkPage<Raw> {
  raw: Raw[];
  next?: string;
}

/**
 * The second blessed adapter shape (Phase 6.3; Ambit-Admin's Ecosystem Architecture calls it
 * "corpus-walk"): a source with no search capability, ingested in full and topic-assigned on
 * Ambit's side by the curator's classify mode. Blogs are the first walk sources; loupe is the
 * next. A sibling of SourceAdapter, deliberately — that interface is a cross-service agreement
 * and adding a method to it would change what ambit-archive promised to implement.
 *
 * Two rules the ingest lane relies on:
 *   - `cursor` is opaque and adapter-defined (a WP page number, an RSS offset, a Tumblr start
 *     index). Ingest never inspects it; it only passes back what it was given.
 *   - A 401/403 must fail the walk immediately, never retry (fetchJson's `noRetryOn`). A blog
 *     that refuses us is a blog we stop asking — the artvee/50watts rule, at the wire.
 */
export interface CorpusWalkAdapter<Raw = unknown> {
  source: SourceId;
  walk(cursor?: string, opts?: FetchOpts): Promise<WalkPage<Raw>>;
  /** Pure and synchronous, fixture-tested — the same rule as SourceAdapter.toItem. */
  toItem(raw: Raw): NormalizedItem;
}
