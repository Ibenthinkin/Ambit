// The pure, testable core of scripts/ingest.ts's collision rule (SPEC §15) — split out from the
// script itself so the property that actually matters (order-independence) has a fast, DB-free,
// network-free unit-test surface. Everything else about ingestion (fetching, curating, upserting)
// is orchestration around this one decision.
//
// THE PROBLEM: `item` is UNIQUE on `(source, source_id)` and `item.topic_id` — the *display*
// topic, nullable since Cut 1 — is single-valued, and a search-shaped item gets exactly one seed
// topic: the winning claim. (Membership beyond that lives in `item_topic`; a losing claim is a
// lower-ranked query hit, not a verified home, and Cut 1 does not write it — design §3 D2, plan
// decision D-g.) So when the same museum object answers two different topics' seed
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

// ── Phase 6.3: the walk lane's two pure decisions ───────────────────────────────────────────

/** The per-topic yield of a classified batch, counted as MEMBERSHIPS (Cut 1: an item may name
 *  several topics and counts once under each), with the un-homed bucket kept separate. Printed by
 *  ingest under `--dry-run` and real runs alike; `--dry-run` on a walker is how a blog is sampled
 *  before a verdict (docs/source-candidates.md, trial loop). */
export function topicHistogram(items: { topics: readonly string[] }[]): {
  byTopic: Record<string, number>;
  unhomed: number;
} {
  const byTopic: Record<string, number> = {};
  let unhomed = 0;
  for (const it of items) {
    if (it.topics.length === 0) unhomed++;
    for (const t of it.topics) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }
  return { byTopic, unhomed };
}

/**
 * What a set of items is *about*, from both tag fields — the line in the ingest summary that turns
 * "stored un-homed: 63" from the end of a thought into the start of one (design §7). Each tag
 * counts once per item however many fields carry it, compared lowercase; most common first, ties
 * alphabetical so the output is stable across runs. Cut 2's promotion reads this by eye first
 * and by query later.
 */
export function tagHistogram(
  items: { tags: readonly string[]; aestheticTags: readonly string[] }[],
  top = 12,
): { tag: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const perItem = new Set(
      [...it.tags, ...it.aestheticTags]
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0),
    );
    for (const t of perItem) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
    .slice(0, top);
}

/**
 * Which of `source`'s rows in the DB did a complete walk NOT see? Those are posts the blog has
 * removed — the remove-on-request case. Pure: the caller guarantees the walk was complete (no
 * --quota, zero errors) before trusting the answer, and deletes only under --prune.
 * `existingKeys` is ingest's `${source}:${sourceId}` set, already loaded for the skip step.
 */
export function planPrune(args: {
  source: string;
  seenSourceIds: Iterable<string>;
  existingKeys: ReadonlySet<string>;
}): string[] {
  const seen = new Set(args.seenSourceIds);
  const prefix = `${args.source}:`;
  const gone: string[] = [];
  for (const key of args.existingKeys) {
    if (!key.startsWith(prefix)) continue;
    const sourceId = key.slice(prefix.length);
    if (!seen.has(sourceId)) gone.push(sourceId);
  }
  return gone.sort();
}
