// The pure, testable core of scripts/ingest.ts's collision rule (SPEC §15) — split out from the
// script itself so the property that actually matters (order-independence) has a fast, DB-free,
// network-free unit-test surface. Everything else about ingestion (fetching, curating, upserting)
// is orchestration around this one decision.
//
// THE PROBLEM: `item` is UNIQUE on `(source, source_id)` but `topic_id` is single-valued and
// NOT NULL (schema.ts) — so when the same museum object answers two different topics' seed
// queries, ingestion has to pick exactly one topic to file it under. Phase 0's harvester picked
// by scan order ("last topic wins"), which silently starved whichever topic came *first* in its
// topic list: measured on AIC, `astronomy` found 419 usable items and kept 4 (SPEC §15). A rule
// that depends on input order just relocates that bug, so `resolveCollisions` below is designed
// to produce the *same* winners no matter what order its `claims` array arrives in.
//
// THE RULE (settled 08-07-26, docs/PHASE3_PLAN.md): highest search rank wins — the topic whose
// seed query surfaced this object closest to the top of its results is the topic it "belongs to"
// most. Ties (same rank from two different queries) break on the alphabetically-smallest topic
// id, an arbitrary but fully deterministic tiebreaker.
import type { NormalizedItem } from "./sources/types";

/** One topic's seed query surfacing one item, at some rank within that query's results.
 *  `rank` is the array index `adapter.search()` returned it at — see SourceAdapter's doc comment
 *  in sources/types.ts, which calls this out as load-bearing. */
export interface Claim {
  topicId: string;
  rank: number;
  item: NormalizedItem;
}

/** The collision key: two claims are "the same object" iff both match — the same key the DB's
 *  `item_source_sourceId_unique` constraint enforces, so this function's notion of "collision"
 *  lines up exactly with what upsertItem would otherwise silently overwrite. */
function claimKey(item: NormalizedItem): string {
  return `${item.source}:${item.sourceId}`;
}

/**
 * Group claims by (source, sourceId), pick one winner per group by the rule above, and report how
 * many collisions each source produced (for the ingestion summary table — collisions must be
 * visible, not silent, per the SPEC §15 postmortem).
 *
 * Output is sorted by claim key rather than left in input order, which is what actually makes the
 * function order-independent: two calls with the same claims in different array orders produce
 * byte-identical `winners`/`collisionCountBySource` results.
 */
export function resolveCollisions(claims: Claim[]): {
  winners: (Claim & { collidedWith: string[] })[];
  collisionCountBySource: Record<string, number>;
} {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const key = claimKey(c.item);
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const winners: (Claim & { collidedWith: string[] })[] = [];
  const collisionCountBySource: Record<string, number> = {};

  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key)!;

    const winner = group.reduce((best, c) => {
      if (c.rank !== best.rank) return c.rank < best.rank ? c : best;
      return c.topicId < best.topicId ? c : best;
    });

    const collidedWith = group
      .filter((c) => c !== winner)
      .map((c) => c.topicId)
      .sort();
    winners.push({ ...winner, collidedWith });

    // A group of size 1 never collided; a group of size N (N>1) is ONE collision event for its
    // source, however many topics piled onto it — the summary asks "how many objects were
    // multiply-claimed", not "how many claims did we throw away".
    if (group.length > 1) {
      const source = winner.item.source;
      collisionCountBySource[source] =
        (collisionCountBySource[source] ?? 0) + 1;
    }
  }

  return { winners, collisionCountBySource };
}
