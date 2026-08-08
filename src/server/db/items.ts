// Repository for the `item` table (SPEC §6.3). Per docs/PHASE2_PLAN.md step 1.6, each function's
// real body lands with the phase that needs it — drawFromTopic is real as of Phase 3.3, upsertItem
// as of 3.4; getItemById stays a stub until Phase 4.
import { and, eq, gte, notInArray } from "drizzle-orm";

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

export function getItemById(_id: string): Promise<Item | undefined> {
  throw new Error("getItemById: not implemented until Phase 4");
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
  if (excludeIds.length > 0) conditions.push(notInArray(item.id, excludeIds));

  const pool = await db
    .select()
    .from(item)
    .where(and(...conditions));

  const tasteSet = new Set(tasteKeywords.map((k) => k.toLowerCase()));
  const weighted = pool.map((row) => {
    const sharedTags = row.aestheticTags.filter((t) =>
      tasteSet.has(t.toLowerCase()),
    ).length;
    return {
      value: row,
      weight: drawWeight(
        row.curationScore,
        scoreFloor,
        power,
        sharedTags,
        boostPerTag,
      ),
    };
  });

  return weightedSampleWithoutReplacement(weighted, limit, rng);
}
