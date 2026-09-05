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

const core = new Set(["poetry", "machines"]);

describe("pageStats", () => {
  it("counts tiers, core vs grown, topics and sources", () => {
    const s = pageStats(
      [
        card("CORE", "poetry", "met"),
        card("DRIFT", "birds", "thisiscolossal"),
        card("DRIFT", "machines", "met"),
        card("JUMP", "clay", "pdr"),
        card("CORE", null, "loc"), // an un-homed card: neither core nor grown
      ],
      core,
    );
    expect(s.cards).toBe(5);
    expect(s.tiers).toEqual({ CORE: 2, DRIFT: 2, JUMP: 1 });
    expect(s.core).toBe(2);
    expect(s.grown).toBe(2);
    expect([...s.topics.entries()]).toEqual([
      ["poetry", 1],
      ["birds", 1],
      ["machines", 1],
      ["clay", 1],
    ]);
    expect(s.sources.get("met")).toBe(2);
  });

  it("sumStats adds pages and keeps insertion order of first appearance", () => {
    const a = pageStats([card("CORE", "poetry", "met")], core);
    const b = pageStats(
      [card("JUMP", "clay", "pdr"), card("CORE", "poetry", "met")],
      core,
    );
    const t = sumStats([a, b]);
    expect(t.cards).toBe(3);
    expect(t.tiers).toEqual({ CORE: 2, DRIFT: 0, JUMP: 1 });
    expect(t.core).toBe(2);
    expect(t.grown).toBe(1);
    expect([...t.topics.keys()]).toEqual(["poetry", "clay"]);
  });

  it("an empty page is all zeros, not NaN", () => {
    const s = pageStats([], core);
    expect(s).toMatchObject({ cards: 0, core: 0, grown: 0 });
    expect(sumStats([]).tiers).toEqual({ CORE: 0, DRIFT: 0, JUMP: 0 });
  });
});
