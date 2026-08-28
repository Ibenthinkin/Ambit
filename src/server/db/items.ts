// Repository for the `item` table (SPEC §6.3). Per docs/PHASE2_PLAN.md step 1.6, each function's
// real body lands with the phase that needs it — drawFromTopic is real as of Phase 3.3, upsertItem
// as of 3.4; getItemById stays a stub until Phase 4.
import { and, eq, gte, inArray, notInArray } from "drizzle-orm";

import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";
import { item } from "./schema";

export type NewItem = typeof item.$inferInsert;
export type Item = typeof item.$inferSelect;

/**
 * Idempotent by (source, sourceId) — the same constraint scripts/ingest.ts's skip-existing check
 * and resolveCollisions() key off (SPEC §6.4). A first sighting inserts; re-running ingestion on
 * an object already in the DB refreshes its *content* fields (the source may have re-catalogued
 * it) while deliberately leaving four columns alone:
 *   - `id` — untouched by definition (onConflictDoUpdate never rewrites the conflict target's row
 *     identity; every other join in the schema, e.g. saved_item.item_id, keeps pointing at it).
 *   - `topicId` — reassigning an existing item's topic on a later ingest run would reshuffle which
 *     users' feeds it can appear in, out from under them, for no product reason.
 *   - `curationScore` / `aestheticTags` — these were PAID FOR (an LLM call). Re-scoring on every
 *     ingest would burn tokens for (almost always) the same verdict; a genuine re-score only
 *     happens deliberately, by bumping curator.ts's PROMPT_VERSION, which the curation cache keys
 *     on — never as a side effect of an item's catalog record changing upstream.
 */
export async function upsertItem(values: NewItem): Promise<Item> {
  // Dynamic import for the same reason drawFromTopic below uses one: importing "./client" at
  // module scope pulls in "~/env"'s Zod validation, which crashes `bun run test` in CI (no env
  // vars set for that step at all — see the comment on drawFromTopic).
  const { db } = await import("./client");

  const [row] = await db
    .insert(item)
    .values(values)
    .onConflictDoUpdate({
      target: [item.source, item.sourceId],
      set: {
        title: values.title,
        summary: values.summary,
        body: values.body,
        imageUrl: values.imageUrl,
        sourceUrl: values.sourceUrl,
        attribution: values.attribution,
        license: values.license,
        tags: values.tags,
        fetchedAt: new Date(),
      },
    })
    .returning();

  // Drizzle types .returning() as possibly empty even though an insert-or-update on a single
  // values row always yields exactly one row; a thrown error here would mean Postgres itself
  // misbehaved, not a reachable app-level case — but the fallback keeps the return type honest.
  if (!row) {
    throw new Error(
      `upsertItem: insert/update returned no row for ${values.source}:${values.sourceId}`,
    );
  }
  return row;
}

/**
 * Single-item lookup by id — backs the public `/i/[itemId]` route and `items.byId` (SPEC §7,
 * §8.1), and used directly by scripts/probe-feed.ts to print a card's full record. Deliberately
 * not user-scoped: `items.byId` is the one procedure SPEC §11 calls out as intentionally public.
 */
export async function getItemById(id: string): Promise<Item | undefined> {
  // Dynamic import — see upsertItem's comment above for why "./client" is never imported at
  // module scope in this file.
  const { db } = await import("./client");
  const [row] = await db.select().from(item).where(eq(item.id, id)).limit(1);
  return row;
}

/**
 * The batch form: full rows for a set of ids, in one query (Phase 7.3).
 *
 * **Why it exists.** The feed engine composes a page out of `PoolItem` projections (db/feed.ts) —
 * five columns per row, so that reading ten thousand candidates costs kilobytes rather than tens
 * of megabytes. The twelve that win still have to be *rendered*, and this is the one query that
 * fetches them whole.
 *
 * Returns a **Map**, not an array: the caller has its own order (the order `composePage` drew the
 * cards in) and must not inherit whatever order Postgres felt like returning. An id that isn't in
 * the map was deleted between the two queries — the caller drops that card rather than throwing.
 */
export async function getItemsByIds(ids: string[]): Promise<Map<string, Item>> {
  const byId = new Map<string, Item>();
  // `inArray(id, [])` is invalid SQL (an empty IN-list) — the same footgun `drawFromTopic` and
  // `getTopicPools` already guard against.
  if (ids.length === 0) return byId;

  const { db } = await import("./client");
  const rows = await db.select().from(item).where(inArray(item.id, ids));
  for (const row of rows) byId.set(row.id, row);
  return byId;
}

/**
 * The feed's item-pick weight (SPEC §9.2): scores near the floor barely outweigh each other,
 * scores well above it dominate, and `power` is the knob that controls how sharply — `power = 0`
 * flattens every in-range score to weight 1 (pure random within the topic pool), while higher
 * powers make the draw increasingly score-greedy. `boostPerTag` then nudges the weight further
 * for items whose `aestheticTags` overlap the user's `tasteKeywords`. Exported standalone (not
 * folded into drawFromTopic) so this formula — the actual "taste" the feed expresses — has a
 * fast, DB-free unit-test surface, and so Phase 4.1's feed algorithm can reuse it unchanged.
 */
export function drawWeight(
  score: number,
  floor: number,
  power: number,
  sharedTags: number,
  boostPerTag: number,
): number {
  return (score - floor + 1) ** power * (1 + boostPerTag * sharedTags);
}

/**
 * Weighted sample of `limit` entries from `pool`, without replacement, using `rng` (injected so
 * tests can pin the sequence — defaults to Math.random). Standard "draw, remove, re-normalize"
 * approach: pool sizes here are topic-scoped (hundreds of rows, not millions), so recomputing the
 * running total each draw is cheap and keeps the algorithm simple over a Fenwick-tree-style
 * optimization that would only matter at a much larger scale.
 */
function weightedSampleWithoutReplacement<T>(
  pool: { value: T; weight: number }[],
  limit: number,
  rng: () => number,
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];

  while (picked.length < limit && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, r) => sum + r.weight, 0);
    let target = rng() * totalWeight;
    let index = remaining.length - 1; // falls back to the last entry on float rounding
    for (let i = 0; i < remaining.length; i++) {
      target -= remaining[i]!.weight;
      if (target <= 0) {
        index = i;
        break;
      }
    }
    picked.push(remaining[index]!.value);
    remaining.splice(index, 1);
  }

  return picked;
}

/**
 * The feed's item-pick step (SPEC §9.2): weighted-random draw of unseen items in `topicId` above
 * `scoreFloor` — weight = drawWeight(...) above. Never similarity-ranked (SPEC §9 — that was the
 * Phase 0.4 failure the whole tiered-topic-drift design replaced).
 */
export async function drawFromTopic(
  topicId: string,
  opts: {
    scoreFloor: number;
    excludeIds: string[];
    limit: number;
    tasteKeywords?: string[];
    /**
     * Restrict the pool to one item type. Added for the gallery rail (5.8), which is images-only
     * by construction — a full-bleed picture screen has nothing to do with an article. Absent for
     * every feed/wander caller, which wants whatever the topic holds.
     */
    type?: "image" | "article";
    /** Score-weight sharpness (SPEC §9.2's shipped default, phase0/feed.template.html:221). */
    power?: number;
    /** Aesthetic-tag-overlap boost per shared tag (same source as `power`'s default). */
    boostPerTag?: number;
    /** Injectable for deterministic tests; production callers should leave this at its default. */
    rng?: () => number;
  },
): Promise<Item[]> {
  const {
    scoreFloor,
    excludeIds,
    limit,
    tasteKeywords = [],
    type,
    power = 1.5,
    boostPerTag = 0.5,
    rng = Math.random,
  } = opts;

  // `db` is imported dynamically, here rather than at module scope, so that drawWeight (a pure
  // function used by every unit test in this file) never triggers "./client"'s env validation —
  // CI's `bun run test` step runs with no DATABASE_URL at all (it's only supplied to the later
  // `bun run build` step, see .github/workflows/ci.yml), so a static import would fail the whole
  // test run before a single test executes, not just this function's DB-backed tests.
  const { db } = await import("./client");

  // notInArray(id, []) is invalid SQL (an empty IN-list), so the exclusion clause is only added
  // when there's something to exclude — the common "first page, nothing seen yet" case included.
  const conditions = [
    eq(item.topicId, topicId),
    gte(item.curationScore, scoreFloor),
  ];
  // A suspended source's rows stay in the table but must never win a slot — same guard, same
  // reasoning, as db/feed.ts's `getTopicPools`. Filtering at draw time rather than at ingest is
  // what makes the switch retroactive over a corpus already full of rows from a source that was
  // healthy when they were fetched. Every draw path needs it, or the suspension is only half on.
  if (SUSPENDED_SOURCES.length > 0) {
    conditions.push(notInArray(item.source, SUSPENDED_SOURCES));
  }
  if (excludeIds.length > 0) conditions.push(notInArray(item.id, excludeIds));
  if (type) conditions.push(eq(item.type, type));

  const pool = await db
    .select()
    .from(item)
    .where(and(...conditions));

  return sampleCurated(pool, {
    scoreFloor,
    power,
    boostPerTag,
    tasteKeywords,
    limit,
    rng,
  });
}

/**
 * The shared tail of every curated draw: score each row with `drawWeight` (plus the taste-tag
 * boost) and sample without replacement. Extracted when the gallery rail's corpus-wide draw landed
 * (5.8) so the two draws can't drift apart — "curated-weighted random, never similarity" (SPEC §9)
 * is the one sentence the whole corpus-as-product bet rests on, and it deserves exactly one
 * implementation.
 */
function sampleCurated(
  pool: Item[],
  opts: {
    scoreFloor: number;
    power: number;
    boostPerTag: number;
    tasteKeywords: string[];
    limit: number;
    rng: () => number;
  },
): Item[] {
  const tasteSet = new Set(opts.tasteKeywords.map((k) => k.toLowerCase()));
  const weighted = pool.map((row) => {
    const sharedTags = row.aestheticTags.filter((t) =>
      tasteSet.has(t.toLowerCase()),
    ).length;
    return {
      value: row,
      weight: drawWeight(
        row.curationScore,
        opts.scoreFloor,
        opts.power,
        sharedTags,
        opts.boostPerTag,
      ),
    };
  });

  return weightedSampleWithoutReplacement(weighted, opts.limit, opts.rng);
}

/**
 * `drawFromTopic` with the topic taken away: a curated-weighted draw of images from the **whole**
 * corpus, above `scoreFloor`, optionally narrowed to a set of sources.
 *
 * This is the gallery rail's wildcard draw (5.8, SPEC §9's "gallery rail" note). The topic walk is
 * what makes the rail feel like it is going somewhere; the wildcard is what stops it from only ever
 * going somewhere *adjacent*. Where a JUMP still leaps along an edge of the topic graph, this
 * ignores the graph entirely — the serendipity dial with no floor under it.
 *
 * `sources` exists for `WILDCARD_SOURCES` (server/config/wildcard-sources.ts): when that list is
 * non-empty the wildcard prefers those sources, which is the hook ambit-archive's personal images
 * will hang on. Empty list → no source restriction, which is today's behaviour.
 *
 * Deliberately has no `topicId` and no `userId`: the rail is public and unpersonalized for the same
 * structural reason `services/wander.ts` is (there is no parameter to leak through).
 */
export async function drawImageAnywhere(opts: {
  scoreFloor: number;
  excludeIds: string[];
  limit: number;
  /** Narrow the draw to these sources; empty (the default) means the whole corpus. */
  sources?: string[];
  tasteKeywords?: string[];
  power?: number;
  boostPerTag?: number;
  /** Injectable for deterministic tests; production callers should leave this at its default. */
  rng?: () => number;
}): Promise<Item[]> {
  const {
    scoreFloor,
    excludeIds,
    limit,
    sources = [],
    tasteKeywords = [],
    power = 1.5,
    boostPerTag = 0.5,
    rng = Math.random,
  } = opts;

  // Dynamic import for the same envless-CI reason as every other function in this file — see the
  // long comment inside `drawFromTopic`.
  const { db } = await import("./client");

  const conditions = [
    eq(item.type, "image"),
    gte(item.curationScore, scoreFloor),
  ];
  // Same suspended-source guard as `drawFromTopic`. A new draw path that forgot it would quietly
  // re-open a source the app has switched off — "a source that is only half-suspended is worse
  // than one that isn't suspended at all" (config/suspended-sources.ts).
  if (SUSPENDED_SOURCES.length > 0) {
    conditions.push(notInArray(item.source, SUSPENDED_SOURCES));
  }
  if (excludeIds.length > 0) conditions.push(notInArray(item.id, excludeIds));
  // `inArray(col, [])` is invalid SQL for the same reason `notInArray` is — an empty IN-list.
  if (sources.length > 0) conditions.push(inArray(item.source, sources));

  const pool = await db
    .select()
    .from(item)
    .where(and(...conditions));

  return sampleCurated(pool, {
    scoreFloor,
    power,
    boostPerTag,
    tasteKeywords,
    limit,
    rng,
  });
}
