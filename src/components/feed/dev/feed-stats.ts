import type { FeedCard, Tier } from "~/server/services/feed";

// The dev knob panel's readout arithmetic (plan 09-05-26). Pure, so it is testable and so the
// panel component stays a rendering concern. This is scripts/probe-feed.ts's `tierCounts` /
// `topicCounts` brought client-side, plus the split the whole exercise is about: how many cards
// landed on one of the sixteen the reader picked from, and how many on a grown topic.
//
// Maps rather than objects for topics/sources so insertion order is the order of first
// appearance — the readout lists "what this page was made of" in the order it was made.
export interface PageStats {
  cards: number;
  tiers: Record<Tier, number>;
  original: number;
  grown: number;
  /** Cards the WILD tier drew — un-homed items, which belong to neither `original` nor `grown`
   *  because they belong to no topic at all. The three add up to `cards`. */
  wild: number;
  /** Writing cards (`item.type === "article"`, 09-30-26) — across the split above, not a fourth
   *  bucket of it: a writing card also counts as original, grown or wild by its topic. */
  writing: number;
  topics: Map<string, number>;
  sources: Map<string, number>;
}

const emptyTiers = (): Record<Tier, number> => ({
  CORE: 0,
  DRIFT: 0,
  JUMP: 0,
  WILD: 0,
});

export function pageStats(
  cards: FeedCard[],
  originalIds: ReadonlySet<string>,
): PageStats {
  const s: PageStats = {
    cards: cards.length,
    tiers: emptyTiers(),
    original: 0,
    grown: 0,
    wild: 0,
    writing: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const c of cards) {
    s.tiers[c.tier]++;
    if (c.item.type === "article") s.writing++;
    // `topicId` is the card's *display* topic (Cut 1). Null is no longer a bug to be seen: as of
    // 09-06-26 it means, and only means, a WILD card — an un-homed item the new tier drew. It
    // gets its own bucket rather than being folded into original or grown, because "no topic fits
    // this yet" is the fact the readout exists to show.
    if (c.topicId === null) {
      s.wild++;
    } else {
      if (originalIds.has(c.topicId)) s.original++;
      else s.grown++;
      s.topics.set(c.topicId, (s.topics.get(c.topicId) ?? 0) + 1);
    }
    s.sources.set(c.item.source, (s.sources.get(c.item.source) ?? 0) + 1);
  }
  return s;
}

export function sumStats(pages: PageStats[]): PageStats {
  const t: PageStats = {
    cards: 0,
    tiers: emptyTiers(),
    original: 0,
    grown: 0,
    wild: 0,
    writing: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const p of pages) {
    t.cards += p.cards;
    for (const k of Object.keys(t.tiers) as Tier[]) t.tiers[k] += p.tiers[k];
    t.original += p.original;
    t.grown += p.grown;
    t.wild += p.wild;
    t.writing += p.writing;
    for (const [k, n] of p.topics) t.topics.set(k, (t.topics.get(k) ?? 0) + n);
    for (const [k, n] of p.sources)
      t.sources.set(k, (t.sources.get(k) ?? 0) + n);
  }
  return t;
}

/** One row of the panel's "Your topics" readout. `weight` is null for a cooled topic the reader
 *  has not picked (it has no weight to show); `cool` is null for a topic that is not cooled. */
export interface YourTopicRow {
  topicId: string;
  label: string;
  weight: number | null;
  cool: number | null;
}

/**
 * Merge `topics.mine` and `topics.cools` into the readout: one row per topic in either list,
 * ranked by weight (a cooled non-pick has none, so it sorts after every pick), top twelve.
 * Dev panel only — the one place a weight is shown as a raw number.
 */
export function mergeYourTopics(
  picks: { topicId: string; weight: number }[],
  cools: { topicId: string; label: string; cool: number }[],
  topicLabels: Record<string, string>,
  limit = 12,
): YourTopicRow[] {
  const byId = new Map<string, YourTopicRow>();
  for (const p of picks) {
    byId.set(p.topicId, {
      topicId: p.topicId,
      label: topicLabels[p.topicId] ?? p.topicId,
      weight: p.weight,
      cool: null,
    });
  }
  for (const c of cools) {
    const row = byId.get(c.topicId);
    if (row) row.cool = c.cool;
    else
      byId.set(c.topicId, {
        topicId: c.topicId,
        label: c.label,
        weight: null,
        cool: c.cool,
      });
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        (b.weight ?? -Infinity) - (a.weight ?? -Infinity) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}
