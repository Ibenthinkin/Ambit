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
  core: number;
  grown: number;
  topics: Map<string, number>;
  sources: Map<string, number>;
}

const emptyTiers = (): Record<Tier, number> => ({ CORE: 0, DRIFT: 0, JUMP: 0 });

export function pageStats(
  cards: FeedCard[],
  coreIds: ReadonlySet<string>,
): PageStats {
  const s: PageStats = {
    cards: cards.length,
    tiers: emptyTiers(),
    core: 0,
    grown: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const c of cards) {
    s.tiers[c.tier]++;
    // `topicId` is the card's *display* topic (Cut 1); null means the item is stored but
    // un-homed, which the feed cannot draw today — so a null here is a bug worth seeing, and
    // it is counted in neither bucket rather than hidden in one.
    if (c.topicId !== null) {
      if (coreIds.has(c.topicId)) s.core++;
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
    core: 0,
    grown: 0,
    topics: new Map(),
    sources: new Map(),
  };
  for (const p of pages) {
    t.cards += p.cards;
    for (const k of Object.keys(t.tiers) as Tier[]) t.tiers[k] += p.tiers[k];
    t.core += p.core;
    t.grown += p.grown;
    for (const [k, n] of p.topics) t.topics.set(k, (t.topics.get(k) ?? 0) + n);
    for (const [k, n] of p.sources)
      t.sources.set(k, (t.sources.get(k) ?? 0) + n);
  }
  return t;
}
