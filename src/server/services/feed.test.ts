// Pure unit tests for the feed engine (SPEC §9) — no DB, no network: every fixture (weights,
// graph, pools) is injected directly. This is deliberately "the highest-value test target" in the
// app (docs/BUILD_PLAN.md 4.1) — it's what proves the ported algorithm still has the same shape
// and guarantees as the validated phase0/feed.template.html reference.
//
// The one exception to "no DB, no network" is the `getFeedPage — FEED_DEBUG knob gating` block
// near the bottom: `knobOverrides` is a `getFeedPage`-only parameter (composePage and friends
// take an already-merged `knobs`), so exercising the actual FEED_DEBUG gate means calling
// `getFeedPage` itself — which the DB-free spirit of this file preserves by mocking its three
// external dependencies (`~/env`, db/topics.ts's `getUserTopicWeights`, db/feed.ts's
// `getTopicPools`/`markSeen`) rather than reaching a real Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoolItem } from "~/server/db/feed";
import type { Item } from "~/server/db/items";
import { WEIGHT_CAP } from "~/server/db/topics";
import { TOPICS } from "~/server/config/topics";
import { hashSeed, mulberry32 } from "./random";

// vi.mock factories are hoisted above every import in this file, so anything they close over has
// to go through vi.hoisted — this is Vitest's documented pattern for sharing *mutable* state with
// a mock (mockEnv.FEED_DEBUG gets flipped per-test below) rather than a fixed return value.
const {
  mockEnv,
  mockGetUserTopicWeights,
  mockGetTasteKeywords,
  mockGetTopicPools,
  mockGetWildPool,
  mockMarkSeen,
  mockGetItemsByIds,
  itemRegistry,
} = vi.hoisted(() => ({
  mockEnv: { FEED_DEBUG: undefined as boolean | undefined, NODE_ENV: "test" },
  mockGetUserTopicWeights: vi.fn(),
  mockGetTasteKeywords: vi.fn(),
  mockGetTopicPools: vi.fn(),
  mockGetWildPool: vi.fn(),
  mockMarkSeen: vi.fn(),
  mockGetItemsByIds: vi.fn(),
  // Every fixture `makeItem` ever built, by id — the stand-in for the `item` table that
  // `getItemsByIds` reads (Phase 7.3: the engine composes from projections and hydrates the
  // winners at the end, so a `getFeedPage` test needs both halves mocked, not just the pools).
  itemRegistry: new Map<string, unknown>(),
}));

vi.mock("~/env", () => ({ env: mockEnv }));
// Spread the actual module so pure exports (WEIGHT_BUMP/WEIGHT_CAP — pinned by the 6.1
// distribution tests below) stay real; only the DB-touching read is replaced. Safe to
// importActual here because db/topics.ts follows the repo's dynamic-import-of-client pattern —
// nothing env-touching runs at module scope.
vi.mock("~/server/db/topics", async (importActual) => ({
  ...(await importActual<typeof import("~/server/db/topics")>()),
  getUserTopicWeights: mockGetUserTopicWeights,
}));
vi.mock("~/server/db/saves", async (importActual) => ({
  ...(await importActual<typeof import("~/server/db/saves")>()),
  getTasteKeywords: mockGetTasteKeywords,
}));
vi.mock("~/server/db/feed", () => ({
  getTopicPools: mockGetTopicPools,
  getWildPool: mockGetWildPool,
  markSeen: mockMarkSeen,
}));
// `drawWeight` is a pure export of this module and the taste formula these tests pin, so it stays
// real; only the hydrate query is replaced. It answers out of `itemRegistry`, which is exactly
// what a real `item` table would hold for these fixtures.
vi.mock("~/server/db/items", async (importActual) => ({
  ...(await importActual<typeof import("~/server/db/items")>()),
  getItemsByIds: mockGetItemsByIds,
}));

import {
  CORE_TOPIC_IDS,
  DEFAULT_KNOBS,
  coldStartWeights,
  composePage,
  decodeCursor,
  encodeCursor,
  getFeedPage,
  pickCore,
  pickDrift,
  pickJump,
  planTopics,
  scaleGrownEdges,
  type FeedCursor,
  type FeedKnobs,
  type Tier,
  type TopicGraph,
} from "./feed";

let nextId = 0;
// Returns `Item & { topicId: string }`, not plain `Item`: since Cut 1 `Item.topicId` is
// `string | null`, but this helper's `?? "topic-a"` default catches null as well as undefined, so
// every fixture it builds really does carry a topic. Saying so in the type is what keeps a
// topic-pool fixture from silently becoming an un-homed one; a fixture that WANTS to be un-homed
// says so through `makeUnhomed` below, which is the WILD tier's input and nothing else's.
function makeItem(overrides: Partial<Item> = {}): Item & { topicId: string } {
  nextId++;
  const built = {
    id: overrides.id ?? `item-${nextId}`,
    // One source per fixture item unless a test says otherwise. Every item used to be "wikipedia",
    // which was fine until `sourceCap` (09-07-26) made three same-source cards the most a page
    // will carry — under that default, half this file's pages would have capped at three. A test
    // that is ABOUT sources sets them explicitly, so the default is only ever "unremarkable".
    source: overrides.source ?? `source-${nextId}`,
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
  // Registered so the mocked `getItemsByIds` can hand it back when the engine hydrates.
  itemRegistry.set(built.id, built);
  return built;
}

/** An UN-HOMED fixture: `topicId: null`, which since 09-06-26 the engine reads as "this can only
 *  be a WILD card". Registered like every other fixture so `getFeedPage` can hydrate it. */
function makeUnhomed(overrides: Partial<Item> = {}): Item & { topicId: null } {
  const built = { ...makeItem(overrides), topicId: null };
  itemRegistry.set(built.id, built);
  return built;
}

// The hydrate half of `getFeedPage`, answered from the fixtures this file built. Mirrors the real
// function's contract exactly: a Map, and an id it doesn't know about is simply absent.
mockGetItemsByIds.mockImplementation((ids: string[]) => {
  const found = new Map<string, Item>();
  for (const id of ids) {
    const row = itemRegistry.get(id);
    if (row) found.set(id, row as Item);
  }
  return Promise.resolve(found);
});

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
  const knobs = { temp: 0.15, hop2: 0.5, grownHopPenalty: 1 };

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
        { temp: 0.15, hop2: 0.5, grownHopPenalty: 1 },
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
        { temp: 0.15, hop2: 1, grownHopPenalty: 1 },
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

  // This assertion is statistical, so it's built to two rules that the original version of it
  // broke on both counts (it flaked at ~4.5% of runs — measured, not estimated):
  //
  // 1. **The page must be able to fill.** The pools have to hold comfortably more items than
  //    `pageSize`, or `composePage` runs to pool exhaustion and the mix stops being the configured
  //    ratio at all. The old fixture offered 4 × 200 = 800 items for a 1000-card page, so every
  //    run drained the pools dry; once a topic empties, every tier that lands on it just retries,
  //    and the tiers don't concentrate on topics equally (JUMP draws from the bottom half of a
  //    row, CORE spreads over all of `weights`). The measured result: JUMP centred on 0.229 rather
  //    than 0.25 — under 2σ from the old ±0.05 failure edge, which is where the flake came from.
  //    4 × 400 = 1600 items for the same 1000-card page fills every time and re-centres the
  //    measurement on 0.402 / 0.349 / 0.250.
  // 2. **The rng must be seeded.** Every *other* Math.random test in this file is an invariant
  //    ("only ever returns a topic in weights", "never lands back on start") where unseeded draws
  //    are a feature — they fuzz a bit more of the space on each run. This one is the opposite: it
  //    measures a *distribution*, so an unseeded rng just rolls dice against the tolerance on
  //    every CI run. Eight fixed seeds are pooled into one 8000-draw sample, which is both
  //    deterministic and tight enough to carry a ±0.02 tolerance — 2.5× stricter than the ±0.05
  //    it replaces, so this is a sharper regression detector than the flaky version, not a
  //    weakened one. (Checked against 40 different seed-block choices: worst deviation from
  //    target across all of them was 0.0146.)
  // 09-06-26: WILD joined the draw at weight 10 against 40/35/25, so the target is now a share of
  // 110, not of 100. The fourth tier draws from its own flat pool (no topic, no cap), which is why
  // it needs a `wildPool` fixture as generous as the topic pools.
  it("mixes tiers at roughly the configured CORE/DRIFT/JUMP/WILD ratio", () => {
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
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 1000, pageSize: 1000 };

    const counts = { CORE: 0, DRIFT: 0, JUMP: 0, WILD: 0 } satisfies Record<
      Tier,
      number
    >;
    let total = 0;
    for (let seed = 0; seed < 8; seed++) {
      // Fresh pools per seed: composePage splices drawn items out of its own working copy, but
      // each run needs to start from a full pool for the "page always fills" property to hold.
      const pools = new Map(
        topics.map((t) => [
          t,
          Array.from({ length: 400 }, () => makeItem({ topicId: t })),
        ]),
      );
      const cards = composePage({
        weights,
        graph,
        pools,
        wildPool: Array.from({ length: 400 }, () => makeUnhomed()),
        rng: mulberry32(hashSeed(`tier-mix:${seed}`)),
        knobs,
      });
      expect(cards).toHaveLength(knobs.pageSize); // rule 1: the page filled, no exhaustion skew
      for (const c of cards) counts[c.tier]++;
      total += cards.length;
    }

    const TOLERANCE = 0.02;
    const share = (w: number) => w / 110;
    expect(counts.CORE / total).toBeGreaterThan(share(40) - TOLERANCE);
    expect(counts.CORE / total).toBeLessThan(share(40) + TOLERANCE);
    expect(counts.DRIFT / total).toBeGreaterThan(share(35) - TOLERANCE);
    expect(counts.DRIFT / total).toBeLessThan(share(35) + TOLERANCE);
    expect(counts.JUMP / total).toBeGreaterThan(share(25) - TOLERANCE);
    expect(counts.JUMP / total).toBeLessThan(share(25) + TOLERANCE);
    expect(counts.WILD / total).toBeGreaterThan(share(10) - TOLERANCE);
    expect(counts.WILD / total).toBeLessThan(share(10) + TOLERANCE);
  });

  // ── the WILD tier (09-06-26, docs/PLAN_caption-less-and-wild.md T2) ──────────────────────────
  // The tier that draws items no topic fits. What must hold: it is the ONLY producer of a null
  // topicId; it is skipped rather than fatal when there is nothing un-homed; it costs nothing at
  // all when switched off; and it obeys the two page-level rules every tier obeys (no item twice,
  // same inputs ⇒ same page) while being exempt from the one that is about topics.
  describe("the WILD tier", () => {
    const wildKnobs: FeedKnobs = { ...baseKnobs, pageSize: 12 };
    const oneTopic = () =>
      new Map([
        [
          "only",
          Array.from({ length: 60 }, () => makeItem({ topicId: "only" })),
        ],
      ]);

    it("draws from wildPool, with a null topicId and no driftPath", () => {
      const wildPool = Array.from({ length: 40 }, () => makeUnhomed());
      const wildIds = new Set(wildPool.map((i) => i.id));
      const cards = composePage({
        weights: new Map([["only", 1]]),
        graph: {},
        pools: oneTopic(),
        wildPool,
        rng: mulberry32(hashSeed("wild:1")),
        knobs: { ...wildKnobs, topicCap: 1000 },
      });
      const wild = cards.filter((c) => c.tier === "WILD");
      expect(wild.length).toBeGreaterThan(0);
      for (const c of wild) {
        expect(c.topicId).toBeNull();
        expect(c.driftPath).toBeUndefined();
        expect(wildIds.has(c.item.id)).toBe(true);
      }
      // …and the converse: a null topicId means WILD and nothing else.
      for (const c of cards) {
        expect(c.topicId === null).toBe(c.tier === "WILD");
      }
    });

    it("skips the slot when nothing is un-homed, and the page still fills", () => {
      const cards = composePage({
        weights: new Map([["only", 1]]),
        graph: {},
        pools: oneTopic(),
        wildPool: [],
        rng: mulberry32(hashSeed("wild:2")),
        knobs: { ...wildKnobs, topicCap: 1000 },
      });
      expect(cards).toHaveLength(12);
      expect(cards.some((c) => c.tier === "WILD")).toBe(false);
    });

    it("at tierWild: 0 composes exactly the page it composed before the tier existed", () => {
      const args = {
        weights: new Map([["only", 1]]),
        graph: {} as TopicGraph,
        pools: oneTopic(),
        knobs: { ...wildKnobs, tierWild: 0, topicCap: 1000 },
      };
      const withoutPool = composePage({
        ...args,
        pools: oneTopic(),
        rng: mulberry32(hashSeed("wild:3")),
      });
      // Same rng, same topic pool, but a full wild pool it is not allowed to touch.
      const withPool = composePage({
        ...args,
        pools: oneTopic(),
        wildPool: Array.from({ length: 40 }, () => makeUnhomed()),
        rng: mulberry32(hashSeed("wild:3")),
      });
      expect(withPool.map((c) => c.tier)).toEqual(
        withoutPool.map((c) => c.tier),
      );
      expect(withPool.some((c) => c.tier === "WILD")).toBe(false);
    });

    it("never draws the same wild item twice on a page", () => {
      // A wild pool smaller than the page, so the slot is forced to run it down.
      const cards = composePage({
        weights: new Map([["only", 1]]),
        graph: {},
        pools: oneTopic(),
        wildPool: Array.from({ length: 3 }, () => makeUnhomed()),
        rng: mulberry32(hashSeed("wild:4")),
        knobs: { ...wildKnobs, tierWild: 500, topicCap: 1000 },
      });
      const wildIds = cards
        .filter((c) => c.tier === "WILD")
        .map((c) => c.item.id);
      expect(new Set(wildIds).size).toBe(wildIds.length);
      expect(wildIds.length).toBeLessThanOrEqual(3);
    });

    it("is reproducible: same rng, same pools, same wildPool ⇒ the same page", () => {
      const wildPool = Array.from({ length: 40 }, () => makeUnhomed());
      // The SAME pool object both times — composePage works from its own copy, so reusing it is
      // safe, and building a fresh one would change the fixture ids and test nothing.
      const pools = oneTopic();
      const compose = () =>
        composePage({
          weights: new Map([["only", 1]]),
          graph: {},
          pools,
          wildPool,
          rng: mulberry32(hashSeed("wild:5")),
          knobs: { ...wildKnobs, topicCap: 1000 },
        });
      expect(compose().map((c) => [c.tier, c.item.id])).toEqual(
        compose().map((c) => [c.tier, c.item.id]),
      );
    });

    it("does not count WILD cards against topicCap", () => {
      // topicCap 1 with a single topic: without WILD the page would be one card long.
      const cards = composePage({
        weights: new Map([["only", 1]]),
        graph: {},
        pools: oneTopic(),
        wildPool: Array.from({ length: 40 }, () => makeUnhomed()),
        rng: mulberry32(hashSeed("wild:6")),
        knobs: { ...wildKnobs, topicCap: 1 },
      });
      expect(cards.filter((c) => c.tier === "WILD").length).toBeGreaterThan(1);
      expect(cards.filter((c) => c.topicId === "only")).toHaveLength(1);
    });

    it("wildTagBoost moves the draw toward the reader's recent saves' aesthetic tags", () => {
      // One wild item shares the taste keyword; the other 39 share nothing. With the boost off it
      // should win about 1 time in 40; with it on, measurably more often.
      const wins = (wildTagBoost: number) => {
        let hits = 0;
        for (let seed = 0; seed < 200; seed++) {
          const favoured = makeUnhomed({ aestheticTags: ["botanical plate"] });
          const wildPool = [
            favoured,
            ...Array.from({ length: 39 }, () =>
              makeUnhomed({ aestheticTags: ["x"] }),
            ),
          ];
          const cards = composePage({
            weights: new Map([["only", 1]]),
            graph: {},
            pools: oneTopic(),
            wildPool,
            rng: mulberry32(hashSeed(`boost:${wildTagBoost}:${seed}`)),
            knobs: {
              ...wildKnobs,
              tierWild: 1000,
              topicCap: 1000,
              pageSize: 1,
            },
            tasteKeywords: ["botanical plate"],
          });
          if (cards[0]?.item.id === favoured.id) hits++;
        }
        return hits;
      };
      expect(wins(1)).toBeGreaterThan(wins(0));
    });

    it("uses wildTagBoost, not tagBoost, for the wild slot", () => {
      // tagBoost is turned off entirely; only wildTagBoost can be producing the lift.
      const favoured = makeUnhomed({ aestheticTags: ["botanical plate"] });
      const wildPool = [
        favoured,
        ...Array.from({ length: 3 }, () =>
          makeUnhomed({ aestheticTags: ["x"] }),
        ),
      ];
      const cards = composePage({
        weights: new Map([["only", 1]]),
        graph: {},
        pools: oneTopic(),
        wildPool,
        rng: mulberry32(hashSeed("wild:8")),
        knobs: {
          ...wildKnobs,
          tagBoost: 0,
          wildTagBoost: 50,
          tierWild: 1000,
          topicCap: 1000,
          pageSize: 1,
        },
        tasteKeywords: ["botanical plate"],
      });
      expect(cards[0]!.item.id).toBe(favoured.id);
    });
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

  // ── sourceCap (09-07-26) ──────────────────────────────────────────────────────────────────
  // Born from the first sovietpostcards walk: a 17,500-item blog became 92-100% of four grown
  // topics, so drifting into `illustration` meant a page of nothing but Soviet postcards. The cap
  // is the page-level answer — the sibling of topicCap, counted per SOURCE — and its one subtlety
  // is that it must filter *before* the draw, so a topic whose other sources are a 2% minority
  // still spends that minority rather than skipping the slot.
  it("respects the per-page source cap, spending the topic's other sources first", () => {
    const weights = new Map([["only", 1]]);
    const pool = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeItem({ id: `big-${i}`, topicId: "only", source: "big" }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeItem({ id: `small-${i}`, topicId: "only", source: "small" }),
      ),
    ];
    const knobs: FeedKnobs = {
      ...baseKnobs,
      topicCap: 100,
      sourceCap: 3,
      pageSize: 10,
    };
    // Repeated, because a single draw once passed with the cap broken: the adjacency filter was
    // rebuilding its candidates from the whole pool, and a lucky big/small/big/small order hid it.
    for (let run = 0; run < 50; run++) {
      const cards = composePage({
        weights,
        graph: {},
        pools: new Map([["only", pool]]),
        rng: Math.random,
        knobs,
      });
      const bySource = (s: string) => cards.filter((c) => c.item.source === s);
      // 3 from the capped source plus every one of the minority — 5 cards, never 10. (The
      // minority is kept under the cap on purpose: the cap is per source, not per majority.)
      expect(bySource("big")).toHaveLength(3);
      expect(bySource("small")).toHaveLength(2);
      expect(cards).toHaveLength(5);
    }
  });

  it("counts WILD cards against the source cap too", () => {
    // A wall of un-homed cards from one blog is the same reader problem as a wall of topic
    // cards from one blog — the cap is per page, whichever tier drew the card.
    const wildPool = Array.from({ length: 10 }, (_, i) =>
      makeUnhomed({ id: `w-${i}`, source: "blog" }),
    );
    const knobs: FeedKnobs = {
      ...baseKnobs,
      tierCore: 0,
      tierDrift: 0,
      tierJump: 0,
      tierWild: 1,
      sourceCap: 2,
      pageSize: 10,
    };
    const cards = composePage({
      weights: new Map(),
      graph: {},
      pools: new Map(),
      wildPool,
      rng: Math.random,
      knobs,
    });
    expect(cards).toHaveLength(2);
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

  it("never draws an item twice on a page when it sits in two pools (09-11-26)", () => {
    // The same five items are members of BOTH topics — what the membership join hands the
    // engine when an item carries two of the page's topics. Before drawnIds, splicing a drawn
    // item out of ITS pool left it drawable from the other.
    const shared = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `shared-${i}`, topicId: "a" }),
    );
    const weights = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    const knobs: FeedKnobs = {
      ...baseKnobs,
      topicCap: 100,
      pageSize: 10,
      tierWild: 0,
    };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([
        ["a", shared],
        ["b", shared.map((it) => ({ ...it, topicId: "b" }))],
      ]),
      rng: mulberry32(hashSeed("twice:1")),
      knobs,
    });
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((c) => c.item.id)).size).toBe(5);
  });

  it("with itemRng omitted composes exactly what it composed before (the single-stream default)", () => {
    const pools = new Map([
      ["only", Array.from({ length: 60 }, () => makeItem({ topicId: "only" }))],
    ]);
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, tierWild: 0 };
    const a = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      knobs,
    });
    const b = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      itemRng: mulberry32(hashSeed("single:1")), // a second stream with the SAME seed — not the same stream
      knobs,
    });
    // Different: the second call's topic draws no longer share a stream with its item draws.
    expect(b.map((c) => c.item.id)).not.toEqual(a.map((c) => c.item.id));
    // But each is reproducible on its own terms.
    const a2 = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      knobs,
    });
    expect(a2.map((c) => c.item.id)).toEqual(a.map((c) => c.item.id));
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

  // Regression coverage for a review finding: a hand-crafted cursor with the right *shape* but
  // garbage *content* used to sail past decodeCursor's checks and only fail much later (an opaque
  // Postgres error from an invalid date, or an oversized `notInArray` bind list) instead of a
  // clean, immediate `decodeCursor` throw the router maps to BAD_REQUEST.
  it("throws when anchor isn't a parseable date, even though it's a string", () => {
    const bad = Buffer.from(
      JSON.stringify({
        v: 1,
        seed: 1,
        page: 0,
        anchor: "not-a-date",
        prev: [],
      }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });

  it("throws when prev exceeds the max allowed length", () => {
    const bad = Buffer.from(
      JSON.stringify({
        v: 1,
        seed: 1,
        page: 0,
        anchor: new Date().toISOString(),
        prev: Array.from({ length: 65 }, (_, i) => `item-${i}`), // one past the 64 cap
      }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });

  it("accepts prev right at the max allowed length", () => {
    const cursor = {
      v: 1 as const,
      seed: 1,
      page: 0,
      anchor: new Date().toISOString(),
      prev: Array.from({ length: 64 }, (_, i) => `item-${i}`),
    };
    const encoded = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it("throws when prev contains non-string elements", () => {
    const bad = Buffer.from(
      JSON.stringify({
        v: 1,
        seed: 1,
        page: 0,
        anchor: new Date().toISOString(),
        prev: ["a", 42, "c"],
      }),
    ).toString("base64url");
    expect(() => decodeCursor(bad)).toThrow();
  });
});

// Regression coverage for a review finding: routers/feed.ts made getFeedPage network-reachable
// with zero test asserting the actual FEED_DEBUG on/off behavior — the gating logic itself
// (feed.ts's `env.FEED_DEBUG ?? env.NODE_ENV === "development"`, and the conditional spread of
// `knobOverrides` into `knobs`) was correct but unguarded. Five fixture topics, none present in
// the real checked-in TOPIC_GRAPH (so every tier's draw — CORE/DRIFT/JUMP alike — falls back to
// staying on its own weighted start topic, per pickDrift/pickJump's documented "no row" fallback),
// each with a 10-item pool comfortably above the default topicCap (3) × 5 topics = 15 achievable
// cards — enough headroom that `pageSize` (12 default, 3 in the override below), not `topicCap`,
// is always the binding constraint on how many cards come back.
// ── Cut 2a's feel levers (dev knob panel plan, 09-05-26) ─────────────────────────────────────
// Two knobs that exist to answer "how much of a page should land outside the reader's picks now
// that the graph has 99 nodes." Both default to 1 = today's behaviour; the tests below pin that
// identity first, because a lever that moves the feed at its default would silently retune
// production.
describe("scaleGrownEdges", () => {
  const core = new Set(["poetry", "machines"]);
  const graph: TopicGraph = {
    poetry: [
      { topic: "machines", sim: 0.4 }, // core×core — must never move
      { topic: "birds", sim: 0.3 }, // core→grown
      { topic: "clay", sim: -0.1 },
    ],
    machines: [
      { topic: "clay", sim: 0.5 },
      { topic: "poetry", sim: 0.4 },
      { topic: "birds", sim: -0.2 },
    ],
    birds: [
      { topic: "poetry", sim: 0.6 }, // grown→core
      { topic: "clay", sim: 0.2 }, // grown→grown
      { topic: "machines", sim: -0.3 },
    ],
    clay: [
      { topic: "machines", sim: 0.5 },
      { topic: "birds", sim: 0.2 },
      { topic: "poetry", sim: -0.1 },
    ],
  };

  it("scale 1 returns an equal graph (the identity the default relies on)", () => {
    expect(scaleGrownEdges(graph, core, 1)).toEqual(graph);
  });

  it("leaves core×core cells untouched and multiplies every other cell", () => {
    const out = scaleGrownEdges(graph, core, 0.5);
    const sim = (row: string, t: string) =>
      out[row]!.find((n) => n.topic === t)!.sim;
    expect(sim("poetry", "machines")).toBe(0.4); // tuned, kept
    expect(sim("poetry", "birds")).toBeCloseTo(0.15); // core→grown
    expect(sim("birds", "poetry")).toBeCloseTo(0.3); // grown→core
    expect(sim("birds", "clay")).toBeCloseTo(0.1); // grown→grown
    expect(sim("machines", "birds")).toBeCloseTo(-0.1); // negatives scale too
  });

  it("preserves every row's key set and length, and re-sorts descending", () => {
    // At scale 0 every grown-touching cell collapses to 0, so `poetry`'s row must re-order:
    // machines (0.4) first, then the two zeros. pickDrift reads a descending row and pickJump
    // slices its bottom half — an unsorted or shortened row breaks both silently.
    const out = scaleGrownEdges(graph, core, 0);
    for (const key of Object.keys(graph)) {
      expect(out[key]!.map((n) => n.topic).sort()).toEqual(
        graph[key]!.map((n) => n.topic).sort(),
      );
      const sims = out[key]!.map((n) => n.sim);
      expect(sims).toEqual([...sims].sort((a, b) => b - a));
    }
    expect(out.poetry![0]).toEqual({ topic: "machines", sim: 0.4 });
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(graph);
    scaleGrownEdges(graph, core, 2);
    expect(JSON.stringify(graph)).toBe(before);
  });
});

describe("pickDrift — grownHopPenalty", () => {
  // One start topic with two equally strong bridges: one core, one grown. With no penalty the
  // first hop splits ~50/50; with penalty 0 it can never land on the grown one.
  const core = new Set(["poetry", "machines"]);
  const graph: TopicGraph = {
    poetry: [
      { topic: "machines", sim: 0.5 },
      { topic: "birds", sim: 0.5 },
    ],
    machines: [],
    birds: [],
  };
  const weights = new Map([["poetry", 1]]);
  const sample = (penalty: number, seed: string) => {
    const rng = mulberry32(hashSeed(seed));
    const landed = { machines: 0, birds: 0 };
    for (let i = 0; i < 400; i++) {
      const pick = pickDrift(
        weights,
        graph,
        { temp: 0.15, hop2: 0, grownHopPenalty: penalty },
        rng,
        core,
      );
      if (pick?.topicId === "machines" || pick?.topicId === "birds")
        landed[pick.topicId]++;
    }
    return landed;
  };

  it("penalty 1 is a coin flip between an equal core and grown bridge", () => {
    const { machines, birds } = sample(1, "penalty:1");
    expect(birds / (machines + birds)).toBeGreaterThan(0.4);
    expect(birds / (machines + birds)).toBeLessThan(0.6);
  });

  it("penalty 0 never hops onto a grown topic", () => {
    const { machines, birds } = sample(0, "penalty:0");
    expect(birds).toBe(0);
    expect(machines).toBe(400);
  });

  it("penalty 0.25 lands on the grown bridge about a fifth of the time", () => {
    // Weights 1 : 0.25 → grown share 0.2. Eight seeds pooled, same as the tier-mix tests.
    let machines = 0;
    let birds = 0;
    for (let s = 0; s < 8; s++) {
      const r = sample(0.25, `penalty:0.25:${s}`);
      machines += r.machines;
      birds += r.birds;
    }
    expect(birds / (machines + birds)).toBeGreaterThan(0.15);
    expect(birds / (machines + birds)).toBeLessThan(0.25);
  });

  it("composePage threads coreTopicIds and the knob through to the hop", () => {
    const pools = new Map(
      ["poetry", "machines", "birds"].map((t) => [
        t,
        Array.from({ length: 10 }, (_, i) =>
          makeItem({ id: `penalty-${t}-${i}`, topicId: t, curationScore: 7 }),
        ),
      ]),
    );
    const cards = composePage({
      weights,
      graph,
      pools,
      rng: mulberry32(hashSeed("compose:penalty")),
      knobs: {
        ...DEFAULT_KNOBS,
        tierCore: 0,
        tierDrift: 1,
        tierJump: 0,
        hop2: 0,
        topicCap: 99,
        grownHopPenalty: 0,
      },
      coreTopicIds: core,
    });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.topicId !== "birds")).toBe(true);
  });
});

describe("CORE_TOPIC_IDS", () => {
  it("is the sixteen config topics, and DEFAULT_KNOBS' levers are identities", () => {
    expect(CORE_TOPIC_IDS.size).toBe(16);
    expect(CORE_TOPIC_IDS.has("poetry")).toBe(true);
    expect(DEFAULT_KNOBS.grownEdgeScale).toBe(1);
    expect(DEFAULT_KNOBS.grownHopPenalty).toBe(1);
  });
});

describe("getFeedPage — FEED_DEBUG knob gating", () => {
  const GATE_TOPICS = Array.from({ length: 5 }, (_, i) => `gate-topic-${i}`);

  beforeEach(() => {
    mockEnv.FEED_DEBUG = undefined;
    mockEnv.NODE_ENV = "test";

    mockGetUserTopicWeights
      .mockReset()
      .mockResolvedValue(new Map(GATE_TOPICS.map((id) => [id, 1])));
    // An empty taste profile — these tests exercise the FEED_DEBUG gate, not the tag boost.
    mockGetTasteKeywords.mockReset().mockResolvedValue([]);
    // No un-homed corpus by default: these tests are about the gate, and an empty wild pool means
    // the WILD slot is skipped and the page fills from the topic pools exactly as it always did.
    mockGetWildPool.mockReset().mockResolvedValue([]);
    mockGetTopicPools
      .mockReset()
      .mockImplementation(async (topicIds: string[]) => {
        const pools = new Map<string, Item[]>();
        for (const topicId of topicIds) {
          const pool = GATE_TOPICS.includes(topicId)
            ? Array.from({ length: 10 }, (_, i) =>
                makeItem({
                  id: `${topicId}-item-${i}`,
                  topicId,
                  curationScore: 7,
                }),
              )
            : [];
          pools.set(topicId, pool);
        }
        return pools;
      });
    mockMarkSeen.mockReset().mockResolvedValue(undefined);
    // Cleared, not reset: the default implementation set up at the top of the file (answer out of
    // `itemRegistry`) has to survive, but the call log must not leak between tests.
    mockGetItemsByIds.mockClear();
  });

  // The 5.7 move: composing a page says nothing about who saw it. The mock stays wired precisely
  // so this negative is provable — a server render that marks items is what burned 1,116 of them
  // in six minutes (log.md 08-20-26), and it would come back silently.
  it("never marks anything seen — receipt is the client's ack, not the render", async () => {
    const page = await getFeedPage("user-1");

    expect(page.cards.length).toBeGreaterThan(0);
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("ignores knobOverrides when FEED_DEBUG is explicitly off", async () => {
    mockEnv.FEED_DEBUG = false;
    const page = await getFeedPage("user-1", undefined, { pageSize: 3 });
    expect(page.cards).toHaveLength(DEFAULT_KNOBS.pageSize); // 12 — override never applied
  });

  it("applies knobOverrides when FEED_DEBUG is explicitly on", async () => {
    mockEnv.FEED_DEBUG = true;
    const page = await getFeedPage("user-1", undefined, { pageSize: 3 });
    expect(page.cards).toHaveLength(3);
  });

  it("falls back to enabled when FEED_DEBUG is unset and NODE_ENV is development", async () => {
    mockEnv.FEED_DEBUG = undefined;
    mockEnv.NODE_ENV = "development";
    const page = await getFeedPage("user-1", undefined, { pageSize: 3 });
    expect(page.cards).toHaveLength(3);
  });

  it("falls back to disabled when FEED_DEBUG is unset and NODE_ENV isn't development", async () => {
    mockEnv.FEED_DEBUG = undefined;
    mockEnv.NODE_ENV = "production";
    const page = await getFeedPage("user-1", undefined, { pageSize: 3 });
    expect(page.cards).toHaveLength(DEFAULT_KNOBS.pageSize); // 12 — override never applied
  });

  // **Phase 7.3's projection/hydrate seam.** `composePage` now works from five-column `PoolItem`
  // projections and `getFeedPage` re-fetches the winners whole. The thing that could silently go
  // wrong is the join between the two: hydrating a different set than was composed, losing the
  // composed order, or dropping the debug fields on the way through.
  it("hydrates exactly the ids it composed, in order, keeping every other card field", async () => {
    mockEnv.FEED_DEBUG = true;
    const page = await getFeedPage("user-1", undefined, { pageSize: 5 });

    expect(mockGetItemsByIds).toHaveBeenCalledOnce();
    const [askedFor] = mockGetItemsByIds.mock.calls[0] as [string[]];
    const returned = page.cards.map((c) => c.item.id);

    // Same ids, same order — not merely the same set.
    expect(returned).toEqual(askedFor);
    // And what came back is a whole row, not the projection the pools carried.
    expect(page.cards[0]!.item).toHaveProperty("sourceUrl");
    expect(page.cards[0]!.item).toHaveProperty("title");
    // The card's own fields survive the swap.
    expect(page.cards[0]!.tier).toBeTruthy();
    expect(page.cards[0]!.debug?.why).toBeTruthy();
  });

  // The one case where the two queries can legitimately disagree: an item deleted between them.
  // A page one card short beats a failed request (see getFeedPage's comment).
  it("drops a card whose item vanished between the pool query and the hydrate", async () => {
    mockEnv.FEED_DEBUG = false;
    mockGetItemsByIds.mockImplementationOnce((ids: string[]) => {
      const found = new Map<string, Item>();
      // Everything but the first — as if that row were deleted mid-request.
      for (const id of ids.slice(1)) {
        const row = itemRegistry.get(id);
        if (row) found.set(id, row as Item);
      }
      return Promise.resolve(found);
    });

    const page = await getFeedPage("user-1");

    expect(page.cards).toHaveLength(DEFAULT_KNOBS.pageSize - 1);
    // The cursor still names every id that was *drawn*, missing row included, so the next page
    // excludes it rather than offering it straight back.
    expect(page.nextCursor).toBeDefined();
  });
});

// Phase 6.1's done-bar assertion, in test form: a burst of saves in one domain (modelled as that
// topic sitting at WEIGHT_CAP, the most learning the bump can ever accumulate) measurably shifts
// page composition — but never overwhelms it. Both tests follow the two hard-won rules from the
// tier-mix test above: pools fat enough that every page fills (and asserting that it filled), and
// seeded rng pooled across 8 fixed seeds into one sample before any share is asserted.
describe("composePage — learned weights (6.1)", () => {
  // A dense 4-topic graph like the tier-mix test's, but with *rotated* sims rather than a flat
  // tie: row of topic i = [i+1 @ 0.9, i+2 @ 0.5, i+3 @ 0.1] (cyclic). The flat-0.3 fixture is
  // subtly asymmetric for a per-*topic* share measurement — pickJump slices each row's stored
  // tail, and with tied sims the tail membership falls out of array order, so whichever topic
  // sorts first is systematically underdrawn by JUMP (measured: 0.195 rather than 0.25). The
  // rotation gives every topic the same role in every mechanism — each is one topic's
  // 0.9-neighbour, one's 0.5, one's 0.1, and sits in exactly two JUMP tails — so uniform weights
  // really do mean a 0.25 share, and the boosted condition's only variable is the weight.
  const topics = ["a", "b", "c", "d"];
  const ROTATED_SIMS = [0.9, 0.5, 0.1];
  const graph: TopicGraph = Object.fromEntries(
    topics.map((t, i) => [
      t,
      ROTATED_SIMS.map((sim, hop) => ({
        topic: topics[(i + hop + 1) % topics.length]!,
        sim,
      })),
    ]),
  );

  /** One pooled 8000-draw sample of topic-a's share of the page, under the given weights. */
  function shareOfTopicA(weights: Map<string, number>): number {
    const knobs: FeedKnobs = {
      ...DEFAULT_KNOBS,
      topicCap: 1000,
      pageSize: 1000,
    };
    let aCount = 0;
    let total = 0;
    for (let seed = 0; seed < 8; seed++) {
      // Fresh pools per seed — composePage splices draws out of its working copy.
      const pools = new Map(
        topics.map((t) => [
          t,
          Array.from({ length: 400 }, () => makeItem({ topicId: t })),
        ]),
      );
      const cards = composePage({
        weights,
        graph,
        pools,
        rng: mulberry32(hashSeed(`learned-mix:${seed}`)),
        knobs,
      });
      expect(cards).toHaveLength(knobs.pageSize); // the page filled — no exhaustion skew
      aCount += cards.filter((c) => c.topicId === "a").length;
      total += cards.length;
    }
    return aCount / total;
  }

  it("a topic at the weight cap draws measurably more of the page, but never a majority", () => {
    const uniformShareA = shareOfTopicA(new Map(topics.map((t) => [t, 1])));
    const boostedShareA = shareOfTopicA(
      new Map(topics.map((t) => [t, t === "a" ? WEIGHT_CAP : 1])),
    );

    // Sanity: under uniform weights, four topics split the page evenly.
    expect(uniformShareA).toBeGreaterThan(0.25 - 0.03);
    expect(uniformShareA).toBeLessThan(0.25 + 0.03);

    // The "measurably shifts" clause of the 6.1 done bar…
    expect(boostedShareA).toBeGreaterThan(uniformShareA + 0.05);
    // …and the "but not overwhelmingly" clause: DRIFT+JUMP are 60% of slots and use weights only
    // to pick walk *starts*, so even a fully-learned topic never takes a majority of the page.
    expect(boostedShareA).toBeLessThan(0.5);
  });

  it("under shipped knobs the per-page topic cap bounds even a capped-weight topic", () => {
    const weights = new Map(topics.map((t) => [t, t === "a" ? WEIGHT_CAP : 1]));
    for (let seed = 0; seed < 8; seed++) {
      const pools = new Map(
        topics.map((t) => [
          t,
          Array.from({ length: 50 }, () => makeItem({ topicId: t })),
        ]),
      );
      const cards = composePage({
        weights,
        graph,
        pools,
        rng: mulberry32(hashSeed(`learned-cap:${seed}`)),
        knobs: DEFAULT_KNOBS,
      });
      // 4 topics × topicCap 3 = exactly pageSize 12 achievable — the page can and must fill.
      expect(cards).toHaveLength(DEFAULT_KNOBS.pageSize);
      // A fully-learned topic can never exceed a quarter of a shipped page.
      expect(cards.filter((c) => c.topicId === "a").length).toBeLessThanOrEqual(
        DEFAULT_KNOBS.topicCap,
      );
    }
  });
});

// ── planTopics (09-11-26, docs/DESIGN_feed-on-membership.md §4.3) ─────────────────────────────
// What makes the planned fetch safe: for the same topic stream, the set `planTopics` returns
// contains every topic `composePage` serves, and a page composed from ONLY those pools is the page
// composed from every pool. The two properties are checked over many seeds because each seed is a
// different tier/topic sequence — and a dense graph so DRIFT and JUMP actually go somewhere.
describe("planTopics (09-11-26)", () => {
  // A dense little graph: every topic a neighbour of every other, so DRIFT and JUMP have
  // somewhere to go and the plan is not trivially the weights' keys.
  const TOPIC_IDS = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const graph: TopicGraph = Object.fromEntries(
    TOPIC_IDS.map((from) => [
      from,
      TOPIC_IDS.filter((t) => t !== from).map((topic, j) => ({
        topic,
        sim: 0.9 - j * 0.15, // a head of positive bridges and a tail of negative ones
      })),
    ]),
  );
  const weights = new Map(TOPIC_IDS.slice(0, 3).map((id) => [id, 1]));
  const fullPools = () =>
    new Map(
      TOPIC_IDS.map((id) => [
        id,
        Array.from({ length: 60 }, () => makeItem({ topicId: id })),
      ]),
    );
  const knobs: FeedKnobs = { ...DEFAULT_KNOBS, tierWild: 0 };
  const core = new Set(TOPIC_IDS);

  it("covers every topic composePage serves, for the same topic stream (200 seeds)", () => {
    for (let seed = 0; seed < 200; seed++) {
      const planned = planTopics({
        weights,
        graph,
        knobs,
        rng: mulberry32(hashSeed(`plan:${seed}`)),
        coreTopicIds: core,
      });
      const cards = composePage({
        weights,
        graph,
        pools: fullPools(),
        rng: mulberry32(hashSeed(`plan:${seed}`)),
        itemRng: mulberry32(hashSeed(`plan:${seed}:items`)),
        knobs,
        coreTopicIds: core,
      });
      for (const card of cards) {
        expect(planned.has(card.topicId!)).toBe(true);
      }
    }
  });

  it("a page composed from only the planned pools is identical to one composed from every pool", () => {
    for (let seed = 0; seed < 50; seed++) {
      const planned = planTopics({
        weights,
        graph,
        knobs,
        rng: mulberry32(hashSeed(`same:${seed}`)),
        coreTopicIds: core,
      });
      const all = fullPools();
      const only = new Map([...all].filter(([id]) => planned.has(id)));
      const compose = (pools: Map<string, PoolItem[]>) =>
        composePage({
          weights,
          graph,
          pools,
          rng: mulberry32(hashSeed(`same:${seed}`)),
          itemRng: mulberry32(hashSeed(`same:${seed}:items`)),
          knobs,
          coreTopicIds: core,
        });
      expect(compose(only).map((c) => [c.topicId, c.item.id])).toEqual(
        compose(all).map((c) => [c.topicId, c.item.id]),
      );
    }
  });

  it("returns at most horizon topics and nothing outside the graph's reach", () => {
    const planned = planTopics({
      weights,
      graph,
      knobs,
      rng: mulberry32(hashSeed("bound")),
      coreTopicIds: core,
      horizon: 7,
    });
    expect(planned.size).toBeLessThanOrEqual(7);
    for (const id of planned) expect(TOPIC_IDS).toContain(id);
  });
});
