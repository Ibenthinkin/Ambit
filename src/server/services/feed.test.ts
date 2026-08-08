// Pure unit tests for the feed engine (SPEC §9) — no DB, no network: every fixture (weights,
// graph, pools) is injected directly. This is deliberately "the highest-value test target" in the
// app (docs/BUILD_PLAN.md 4.1) — it's what proves the ported algorithm still has the same shape
// and guarantees as the validated phase0/feed.template.html reference.
import { describe, expect, it } from "vitest";

import type { Item } from "~/server/db/items";
import { TOPICS } from "~/server/config/topics";
import { hashSeed, mulberry32 } from "./random";
import {
  DEFAULT_KNOBS,
  coldStartWeights,
  composePage,
  decodeCursor,
  encodeCursor,
  pickCore,
  pickDrift,
  pickJump,
  type FeedCursor,
  type FeedKnobs,
  type TopicGraph,
} from "./feed";

let nextId = 0;
function makeItem(overrides: Partial<Item> = {}): Item {
  nextId++;
  return {
    id: overrides.id ?? `item-${nextId}`,
    source: overrides.source ?? "wikipedia",
    sourceId: overrides.sourceId ?? `src-${nextId}`,
    type: overrides.type ?? "article",
    title: overrides.title ?? `Item ${nextId}`,
    summary: overrides.summary ?? "A summary long enough to be unremarkable.",
    body: overrides.body ?? null,
    imageUrl: overrides.imageUrl ?? null,
    sourceUrl: overrides.sourceUrl ?? `https://example.com/${nextId}`,
    attribution: overrides.attribution ?? null,
    license: overrides.license ?? null,
    tags: overrides.tags ?? [],
    topicId: overrides.topicId ?? "topic-a",
    curationScore: overrides.curationScore ?? 7,
    aestheticTags: overrides.aestheticTags ?? [],
    fetchedAt: overrides.fetchedAt ?? new Date(),
  };
}

describe("pickCore", () => {
  it("returns null when there are no topics to draw from", () => {
    expect(pickCore(new Map(), Math.random)).toBeNull();
  });

  it("only ever returns a topic present in weights", () => {
    const weights = new Map([
      ["a", 1],
      ["b", 5],
    ]);
    for (let i = 0; i < 200; i++) {
      const pick = pickCore(weights, Math.random);
      expect(["a", "b"]).toContain(pick?.topicId);
    }
  });
});

describe("pickDrift", () => {
  const knobs = { temp: 0.15, hop2: 0.5 };

  it("walks positive-similarity bridges only — never a negative-sim first hop", () => {
    const graph: TopicGraph = {
      a: [
        { topic: "b", sim: 0.5 },
        { topic: "c", sim: 0.2 },
        { topic: "d", sim: -0.3 }, // must never be the first hop
      ],
    };
    const weights = new Map([["a", 1]]);
    for (let i = 0; i < 500; i++) {
      const pick = pickDrift(weights, graph, knobs, Math.random);
      const firstHop = pick?.driftPath?.[1];
      if (firstHop) expect(firstHop).not.toBe("d");
    }
  });

  it("stays on the start topic when its row has no positive bridge", () => {
    const graph: TopicGraph = {
      c: [
        { topic: "a", sim: -0.1 },
        { topic: "b", sim: -0.4 },
      ],
      // "lonely" has no row at all — the `graph[from] ?? []` fallback.
    };
    const weights = new Map([["c", 1]]);
    expect(pickDrift(weights, graph, knobs, Math.random)).toEqual({
      topicId: "c",
      why: "DRIFT · c (no row)",
      driftPath: ["c"],
    });

    const weights2 = new Map([["lonely", 1]]);
    expect(pickDrift(weights2, {}, knobs, Math.random)).toEqual({
      topicId: "lonely",
      why: "DRIFT · lonely (no row)",
      driftPath: ["lonely"],
    });
  });

  it("fires a second hop at roughly the hop2 rate", () => {
    // b's row has a single positive neighbour, so every *attempted* second hop succeeds and is
    // never rejected — isolates the hop2 coin flip from the "never lands back on start" rule.
    const graph: TopicGraph = {
      a: [{ topic: "b", sim: 0.9 }],
      b: [{ topic: "e", sim: 0.9 }],
    };
    const weights = new Map([["a", 1]]);
    let secondHopCount = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const pick = pickDrift(
        weights,
        graph,
        { temp: 0.15, hop2: 0.5 },
        Math.random,
      );
      if (pick?.driftPath?.length === 3) secondHopCount++;
    }
    const rate = secondHopCount / n;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
  });

  it("never lands back on the start topic even when the second hop tries to", () => {
    const graph: TopicGraph = {
      a: [{ topic: "b", sim: 0.9 }],
      b: [
        { topic: "a", sim: 0.9 }, // would land back on start — must be rejected
        { topic: "e", sim: 0.9 },
      ],
    };
    const weights = new Map([["a", 1]]);
    for (let i = 0; i < 1000; i++) {
      // hop2: 1 — always attempt the second hop, to actually exercise the rejection path.
      const pick = pickDrift(
        weights,
        graph,
        { temp: 0.15, hop2: 1 },
        Math.random,
      );
      expect(pick?.topicId).not.toBe("a");
    }
  });
});

describe("pickJump", () => {
  it("draws only from the bottom half of the row", () => {
    const row = [
      { topic: "s0", sim: 0.9 },
      { topic: "s1", sim: 0.7 },
      { topic: "s2", sim: 0.5 },
      { topic: "s3", sim: 0.1 },
      { topic: "s4", sim: -0.2 },
      { topic: "s5", sim: -0.6 },
    ];
    const graph: TopicGraph = { a: row };
    const weights = new Map([["a", 1]]);
    const bottomHalf = new Set(["s3", "s4", "s5"]);
    for (let i = 0; i < 500; i++) {
      const pick = pickJump(weights, graph, Math.random);
      expect(bottomHalf.has(pick!.topicId)).toBe(true);
    }
  });

  it("stays on the start topic when it has no row", () => {
    const weights = new Map([["solo", 1]]);
    expect(pickJump(weights, {}, Math.random)).toEqual({
      topicId: "solo",
      why: "JUMP · solo (no row)",
      driftPath: ["solo"],
    });
  });
});

describe("composePage", () => {
  const baseKnobs: FeedKnobs = { ...DEFAULT_KNOBS };

  it("mixes tiers at roughly the configured CORE/DRIFT/JUMP ratio", () => {
    // A dense little graph so DRIFT/JUMP always resolve to *some* topic, and a generous topicCap
    // so the cap never blocks a draw — isolates the tier-mix signal from diversity constraints.
    const topics = ["a", "b", "c", "d"];
    const graph: TopicGraph = Object.fromEntries(
      topics.map((t) => [
        t,
        topics.filter((o) => o !== t).map((o) => ({ topic: o, sim: 0.3 })),
      ]),
    );
    const weights = new Map(topics.map((t) => [t, 1]));
    const pools = new Map(
      topics.map((t) => [
        t,
        Array.from({ length: 200 }, () => makeItem({ topicId: t })),
      ]),
    );
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 1000, pageSize: 1000 };
    const cards = composePage({
      weights,
      graph,
      pools,
      rng: Math.random,
      knobs,
    });

    const counts = { CORE: 0, DRIFT: 0, JUMP: 0 };
    for (const c of cards) counts[c.tier]++;
    const total = cards.length;
    expect(counts.CORE / total).toBeCloseTo(0.4, 1);
    expect(counts.DRIFT / total).toBeCloseTo(0.35, 1);
    expect(counts.JUMP / total).toBeCloseTo(0.25, 1);
  });

  it("respects the per-page topic cap", () => {
    const weights = new Map([["only", 1]]);
    const pool = Array.from({ length: 20 }, () =>
      makeItem({ topicId: "only" }),
    );
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 3, pageSize: 10 };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs,
    });
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.topicId === "only")).toBe(true);
  });

  it("never repeats an item within the same page (in-page exclusion)", () => {
    const weights = new Map([["only", 1]]);
    const pool = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `x${i}`, topicId: "only" }),
    );
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, pageSize: 10 };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs,
    });
    // Only 5 items exist — the page can't exceed that, and every id is unique.
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((c) => c.item.id)).size).toBe(5);
  });

  it("avoids adjacent same-source cards when the pool allows it", () => {
    const weights = new Map([["only", 1]]);
    const pool = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeItem({ id: `s1-${i}`, topicId: "only", source: "s1" }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeItem({ id: `s2-${i}`, topicId: "only", source: "s2" }),
      ),
    ];
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, pageSize: 6 };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs,
    });
    expect(cards).toHaveLength(6);
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i]!.item.source).not.toBe(cards[i - 1]!.item.source);
    }
  });

  it("relaxes the source-adjacency constraint rather than starving the page", () => {
    const weights = new Map([["only", 1]]);
    const pool = Array.from({ length: 3 }, (_, i) =>
      makeItem({ id: `only-src-${i}`, topicId: "only", source: "onlySource" }),
    );
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, pageSize: 3 };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs,
    });
    // All three items get served despite every adjacent pair sharing a source — relaxing the
    // constraint, not dropping cards to honor it.
    expect(cards).toHaveLength(3);
  });

  it("returns an empty page when every pool is empty (exhaustion)", () => {
    const weights = new Map([["only", 1]]);
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([["only", []]]),
      rng: Math.random,
      knobs: baseKnobs,
    });
    expect(cards).toEqual([]);
  });

  it("same cursor-derived rng + same pools produce an identical page", () => {
    const weights = new Map([["a", 1]]);
    const graph: TopicGraph = { a: [{ topic: "b", sim: 0.5 }] };
    const pools = new Map([
      [
        "a",
        Array.from({ length: 30 }, (_, i) =>
          makeItem({ id: `a${i}`, topicId: "a" }),
        ),
      ],
      [
        "b",
        Array.from({ length: 30 }, (_, i) =>
          makeItem({ id: `b${i}`, topicId: "b" }),
        ),
      ],
    ]);
    const rngA = mulberry32(hashSeed("777:0"));
    const rngB = mulberry32(hashSeed("777:0"));
    const pageA = composePage({
      weights,
      graph,
      pools,
      rng: rngA,
      knobs: baseKnobs,
    });
    const pageB = composePage({
      weights,
      graph,
      pools,
      rng: rngB,
      knobs: baseKnobs,
    });
    expect(pageB).toEqual(pageA);
  });

  it("only attaches debug info when debug: true", () => {
    const weights = new Map([["only", 1]]);
    const pool = [makeItem({ id: "d1", topicId: "only" })];
    const withDebug = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs: baseKnobs,
      debug: true,
    });
    const withoutDebug = composePage({
      weights,
      graph: {},
      pools: new Map([["only", pool]]),
      rng: Math.random,
      knobs: baseKnobs,
      debug: false,
    });
    expect(withDebug[0]?.debug).toBeDefined();
    expect(withoutDebug[0]?.debug).toBeUndefined();
  });
});

describe("coldStartWeights", () => {
  it("assigns uniform weight 1 across every known topic by default", () => {
    const weights = coldStartWeights();
    expect(weights.size).toBe(TOPICS.length);
    for (const w of weights.values()) expect(w).toBe(1);
  });

  it("accepts a custom topic id list", () => {
    const weights = coldStartWeights(["x", "y"]);
    expect([...weights.entries()]).toEqual([
      ["x", 1],
      ["y", 1],
    ]);
  });
});

describe("cursor codec", () => {
  it("round-trips a cursor through encode/decode", () => {
    const cursor: FeedCursor = {
      v: 1,
      seed: 12345,
      page: 2,
      anchor: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      prev: ["a", "b", "c"],
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("throws on malformed input", () => {
    expect(() => decodeCursor("not-valid-base64url-json")).toThrow();
  });

  it("throws on an unrecognized version", () => {
    const bad = Buffer.from(
      JSON.stringify({ v: 2, seed: 1, page: 0, anchor: "x", prev: [] }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });

  it("throws on a well-formed but incomplete object", () => {
    const bad = Buffer.from(JSON.stringify({ v: 1, seed: 1 })).toString(
      "base64url",
    );
    expect(() => decodeCursor(bad)).toThrow();
  });
});
