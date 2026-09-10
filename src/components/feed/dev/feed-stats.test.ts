import { describe, expect, it } from "vitest";

import type { FeedCard } from "~/server/services/feed";
import { pageStats, sumStats } from "./feed-stats";

// The readout is only as useful as it is honest, and "honest" here is arithmetic: counts must
// match what a person would get tallying the badges by hand.
function card(
  tier: FeedCard["tier"],
  topicId: string | null,
  source: string,
): FeedCard {
  return {
    tier,
    topicId,
    item: {
      id: `${tier}-${topicId}-${source}-${Math.random()}`,
      source,
    } as FeedCard["item"],
  };
}

const original = new Set(["poetry", "machines"]);

describe("pageStats", () => {
  it("counts tiers, original vs grown, topics and sources", () => {
    const s = pageStats(
      [
        card("CORE", "poetry", "met"),
        card("DRIFT", "birds", "thisiscolossal"),
        card("DRIFT", "machines", "met"),
        card("JUMP", "clay", "pdr"),
        card("WILD", null, "loc"), // an un-homed card: neither original nor grown
      ],
      original,
    );
    expect(s.cards).toBe(5);
    expect(s.tiers).toEqual({ CORE: 1, DRIFT: 2, JUMP: 1, WILD: 1 });
    expect(s.original).toBe(2); // poetry (CORE) + machines (DRIFT, but an original topic)
    expect(s.grown).toBe(2);
    // The third bucket: an item no topic fits is counted, and counted separately, so the readout
    // says how much of a page is the un-homed residue rather than hiding it in "grown".
    expect(s.wild).toBe(1);
    expect(s.original + s.grown + s.wild).toBe(s.cards);
    expect([...s.topics.entries()]).toEqual([
      ["poetry", 1],
      ["birds", 1],
      ["machines", 1],
      ["clay", 1],
    ]);
    expect(s.sources.get("met")).toBe(2);
  });

  it("sumStats adds pages and keeps insertion order of first appearance", () => {
    const a = pageStats([card("CORE", "poetry", "met")], original);
    const b = pageStats(
      [card("JUMP", "clay", "pdr"), card("CORE", "poetry", "met")],
      original,
    );
    const t = sumStats([a, b]);
    expect(t.cards).toBe(3);
    expect(t.tiers).toEqual({ CORE: 2, DRIFT: 0, JUMP: 1, WILD: 0 });
    expect(t.original).toBe(2);
    expect(t.grown).toBe(1);
    expect(t.wild).toBe(0);
    expect([...t.topics.keys()]).toEqual(["poetry", "clay"]);
  });

  it("an empty page is all zeros, not NaN", () => {
    const s = pageStats([], original);
    expect(s).toMatchObject({ cards: 0, original: 0, grown: 0, wild: 0 });
    expect(sumStats([]).tiers).toEqual({
      CORE: 0,
      DRIFT: 0,
      JUMP: 0,
      WILD: 0,
    });
  });

  it("sums the wild bucket across pages", () => {
    const a = pageStats([card("WILD", null, "loc")], original);
    const b = pageStats(
      [card("WILD", null, "met"), card("CORE", "poetry", "met")],
      original,
    );
    const t = sumStats([a, b]);
    expect(t.wild).toBe(2);
    expect(t.tiers.WILD).toBe(2);
    // A wild card contributes to no topic histogram — it has no topic to contribute to.
    expect([...t.topics.keys()]).toEqual(["poetry"]);
  });
});
