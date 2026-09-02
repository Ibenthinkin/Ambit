import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { TopicGraph } from "./feed";
import { WILDCARD_SOURCES } from "~/server/config/wildcard-sources";
import { hashSeed, mulberry32 } from "./random";
import {
  getGalleryRail,
  pickRailTopics,
  RAIL_KNOBS,
  type GalleryKnobs,
} from "./gallery-rail";

// Same seam as feed.test.ts and wander.test.ts: mock the repo, pin the rng, and the whole service
// becomes a pure function of its fixtures. `~/env` is mocked too — the shell reads FEED_DEBUG to
// decide whether to honor knob overrides and whether to attach `debug`, and both branches need
// exercising (feed.test.ts's `getFeedPage — FEED_DEBUG knob gating` block does the same).
const { mockGetItemById, mockDrawFromTopic, mockDrawImageAnywhere, mockEnv } =
  vi.hoisted(() => ({
    mockGetItemById: vi.fn(),
    mockDrawFromTopic: vi.fn(),
    mockDrawImageAnywhere: vi.fn(),
    mockEnv: { FEED_DEBUG: undefined as boolean | undefined, NODE_ENV: "test" },
  }));

vi.mock("~/server/db/items", () => ({
  getItemById: mockGetItemById,
  drawFromTopic: mockDrawFromTopic,
  drawImageAnywhere: mockDrawImageAnywhere,
}));
vi.mock("~/env", () => ({ env: mockEnv }));

const GRAPH: TopicGraph = {
  botany: [
    { topic: "zoology", sim: 0.4 },
    { topic: "art", sim: 0.3 },
    { topic: "ceramics", sim: 0.1 },
    { topic: "machines", sim: -0.2 },
  ],
  zoology: [
    { topic: "botany", sim: 0.4 },
    { topic: "machines", sim: -0.1 },
  ],
  art: [{ topic: "botany", sim: 0.3 }],
  ceramics: [{ topic: "botany", sim: 0.1 }],
  machines: [{ topic: "botany", sim: -0.2 }],
  lonely: [],
};

const makeItem = (over: Partial<Item> & { id: string }): Item =>
  ({
    title: `Item ${over.id}`,
    type: "image",
    topicId: "botany",
    attribution: null,
    imageUrl: `https://example.test/${over.id}.jpg`,
    summary: null,
    source: "met",
    sourceUrl: "https://example.test/o",
    license: null,
    ...over,
  }) as Item;

/**
 * An rng that replays a fixed sequence and then repeats its last value forever. The walk consumes
 * a variable number of draws per slot, so a finite array would run dry mid-test; freezing on the
 * tail keeps every subsequent roll deterministic instead of `undefined`.
 */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

const NEVER_WILDCARD: GalleryKnobs = { wildcardChance: 0 };
const ALWAYS_WILDCARD: GalleryKnobs = { wildcardChance: 1 };

describe("pickRailTopics", () => {
  it("fires a wildcard exactly at the configured rate, and holds the walk while it does", () => {
    // `wildcardChance` is the first roll of every slot: 0.05 < 0.1 fires, 0.5 doesn't.
    const steps = pickRailTopics(
      "botany",
      GRAPH,
      scripted([0.05, 0.05, 0.05, 0.05]),
      4,
      RAIL_KNOBS,
    );

    expect(steps.map((s) => s.via)).toEqual([
      "wildcard",
      "wildcard",
      "wildcard",
      "wildcard",
    ]);
    // A wildcard is a detour, not a relocation: the walk still stands where it started.
    expect(steps.every((s) => s.topic === "botany")).toBe(true);
  });

  it("never fires a wildcard at chance 0, and always at chance 1", () => {
    const off = pickRailTopics(
      "botany",
      GRAPH,
      mulberry32(hashSeed("off")),
      12,
      NEVER_WILDCARD,
    );
    expect(off.some((s) => s.via === "wildcard")).toBe(false);

    const on = pickRailTopics(
      "botany",
      GRAPH,
      mulberry32(hashSeed("on")),
      12,
      ALWAYS_WILDCARD,
    );
    expect(on.every((s) => s.via === "wildcard")).toBe(true);
  });

  it("stays put on a CORE-tier roll", () => {
    // Roll 1: 0.9 → no wildcard. Roll 2 picks the tier over [40, 35, 25] (total 100): 0.1 lands in
    // the first 40, i.e. `stay`.
    const [step] = pickRailTopics(
      "botany",
      GRAPH,
      scripted([0.9, 0.1]),
      1,
      RAIL_KNOBS,
    );

    expect(step).toEqual({ topic: "botany", via: "stay" });
  });

  it("advances the walk on a drift, across a positive edge only", () => {
    // Tier roll 0.5 lands in [40, 75) → `drift`. The near set is zoology/art/ceramics; `machines`
    // sits at sim -0.2 and is not a doorway.
    const steps = pickRailTopics(
      "botany",
      GRAPH,
      scripted([0.9, 0.5, 0.01]),
      2,
      RAIL_KNOBS,
    );

    expect(steps[0]!.via).toBe("drift");
    expect(["zoology", "art", "ceramics"]).toContain(steps[0]!.topic);
    // The second slot walks on from wherever the first landed, not from `botany`.
    expect(steps[1]!.topic).not.toBe("botany");
  });

  it("advances the walk on a jump, over the far half of the row", () => {
    // Tier roll 0.9 lands in [75, 100) → `jump`. `botany`'s far half is [ceramics, machines].
    const [step] = pickRailTopics(
      "botany",
      GRAPH,
      scripted([0.99, 0.9, 0]),
      1,
      RAIL_KNOBS,
    );

    expect(step!.via).toBe("jump");
    expect(["ceramics", "machines"]).toContain(step!.topic);
  });

  it("degrades to stay when the graph has no row for the topic", () => {
    for (const topic of ["lonely", "not-in-the-graph"]) {
      const steps = pickRailTopics(
        topic,
        GRAPH,
        mulberry32(hashSeed(topic)),
        8,
        NEVER_WILDCARD,
      );
      expect(steps.every((s) => s.via === "stay")).toBe(true);
      expect(steps.every((s) => s.topic === topic)).toBe(true);
    }
  });

  it("produces exactly `count` steps", () => {
    for (const count of [1, 3, 8, 16]) {
      expect(
        pickRailTopics("botany", GRAPH, mulberry32(hashSeed("n")), count),
      ).toHaveLength(count);
    }
  });
});

describe("getGalleryRail", () => {
  beforeEach(() => {
    mockGetItemById.mockReset();
    mockDrawFromTopic.mockReset();
    mockDrawImageAnywhere.mockReset();
    mockEnv.FEED_DEBUG = undefined;
    mockEnv.NODE_ENV = "test";
  });

  /** Every topic draw succeeds with a fresh item; nothing ever falls through the chain. */
  function drawsAlwaysWork() {
    let n = 0;
    mockDrawFromTopic.mockImplementation((topicId: string) =>
      Promise.resolve([makeItem({ id: `drawn-${++n}`, topicId })]),
    );
    mockDrawImageAnywhere.mockImplementation(() =>
      Promise.resolve([makeItem({ id: `wild-${++n}` })]),
    );
  }

  it("returns nothing at all for an unknown anchor, and draws nothing", async () => {
    mockGetItemById.mockResolvedValue(undefined);

    expect(await getGalleryRail("nope")).toEqual([]);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
    expect(mockDrawImageAnywhere).not.toHaveBeenCalled();
  });

  it("gives an un-homed anchor an all-wildcard rail — no topic, no walk (Cut 1)", async () => {
    mockEnv.FEED_DEBUG = true;
    mockDrawFromTopic.mockClear();
    // The mocks are untyped `vi.fn()`s, so these partial rows go in as-is — no cast needed, and
    // eslint rejects one as unnecessary. Only the fields the rail actually reads are set.
    mockGetItemById.mockResolvedValue({
      id: "anchor",
      type: "image",
      topicId: null,
    });
    let n = 0;
    mockDrawImageAnywhere.mockImplementation(async () => [
      { id: `w${n++}`, title: "wild", source: "met", topicId: null },
    ]);

    const rows = await getGalleryRail("anchor", {
      count: 3,
      rng: mulberry32(hashSeed("unhomed")),
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.debug)).toEqual([
      { via: "wildcard", topic: null },
      { via: "wildcard", topic: null },
      { via: "wildcard", topic: null },
    ]);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
  });

  it("asks only for images, above the feed's score floor", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();

    await getGalleryRail("anchor", {
      count: 4,
      rng: mulberry32(hashSeed("images")),
      knobs: { wildcardChance: 0 },
    });

    expect(mockDrawFromTopic).toHaveBeenCalled();
    for (const [, opts] of mockDrawFromTopic.mock.calls) {
      expect((opts as { type?: string }).type).toBe("image");
      expect((opts as { limit: number }).limit).toBe(1);
      expect((opts as { scoreFloor: number }).scoreFloor).toBeGreaterThan(0);
    }
  });

  it("never returns the anchor, and never repeats within a batch", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();

    const rail = await getGalleryRail("anchor", {
      count: 8,
      rng: mulberry32(hashSeed("dedupe")),
    });

    const ids = rail.map((r) => r.id);
    expect(ids).not.toContain("anchor");
    expect(new Set(ids).size).toBe(ids.length);
    // The anchor is excluded structurally, not by luck: it leads every draw's exclusion list.
    const lastCall = mockDrawFromTopic.mock.calls.at(-1);
    if (lastCall) {
      expect((lastCall[1] as { excludeIds: string[] }).excludeIds).toContain(
        "anchor",
      );
    }
  });

  it("carries the caller's excludeIds into every draw", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();

    await getGalleryRail("anchor", {
      count: 2,
      excludeIds: ["already-seen-1", "already-seen-2"],
      rng: mulberry32(hashSeed("exclude")),
      knobs: { wildcardChance: 0 },
    });

    for (const [, opts] of mockDrawFromTopic.mock.calls) {
      expect((opts as { excludeIds: string[] }).excludeIds).toEqual(
        expect.arrayContaining(["already-seen-1", "already-seen-2"]),
      );
    }
  });

  it("falls back topic → anchor's topic → anywhere, in that order", async () => {
    mockGetItemById.mockResolvedValue(
      makeItem({ id: "anchor", topicId: "botany" }),
    );
    // Every topic pool is empty; only the corpus-wide draw has anything.
    mockDrawFromTopic.mockResolvedValue([]);
    mockDrawImageAnywhere.mockResolvedValue([makeItem({ id: "rescued" })]);

    // A rng that never fires the wildcard, so the topic path is the one under test.
    const rail = await getGalleryRail("anchor", {
      count: 1,
      rng: mulberry32(hashSeed("fallback")),
      knobs: { wildcardChance: 0 },
    });

    expect(rail.map((r) => r.id)).toEqual(["rescued"]);
    // At most two topic attempts (the step's own topic, then the anchor's — collapsed to one when
    // they're the same), and then the corpus-wide rescue.
    expect(mockDrawFromTopic.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mockDrawImageAnywhere).toHaveBeenCalledTimes(1);
  });

  it("stops and returns short when every link of the chain is empty", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    mockDrawFromTopic.mockResolvedValue([]);
    mockDrawImageAnywhere.mockResolvedValue([]);

    const rail = await getGalleryRail("anchor", {
      count: 8,
      rng: mulberry32(hashSeed("exhausted")),
    });

    expect(rail).toEqual([]);
    // Stopped on the first empty slot rather than grinding through all eight.
    expect(mockDrawImageAnywhere.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("leaves the topic walk entirely on a wildcard slot, preferring the configured sources", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();
    mockEnv.FEED_DEBUG = true; // so the knob override below is honored

    const rail = await getGalleryRail("anchor", {
      count: 3,
      rng: mulberry32(hashSeed("wild")),
      knobs: { wildcardChance: 1 },
    });

    expect(rail).toHaveLength(3);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
    expect(mockDrawImageAnywhere).toHaveBeenCalledTimes(3);
    // Asserted against the config rather than a literal: the point is that whatever is in that list
    // is what a wildcard reaches for first, not that the list currently says "archive".
    for (const [opts] of mockDrawImageAnywhere.mock.calls) {
      expect((opts as { sources?: string[] }).sources).toEqual(
        WILDCARD_SOURCES,
      );
    }
    expect(rail.every((r) => r.debug?.via === "wildcard")).toBe(true);
  });

  // The half that makes opening the doorway safe against an archive with nothing in it yet: the
  // preferred draw comes back empty and the wildcard reaches the whole corpus instead, exactly as
  // it did when the list was empty.
  it("falls through to the whole corpus when the preferred sources have nothing", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    mockDrawFromTopic.mockResolvedValue([]);
    mockDrawImageAnywhere.mockImplementation((opts: { sources?: string[] }) =>
      Promise.resolve(
        opts.sources && opts.sources.length > 0
          ? [] // the archive is empty
          : [makeItem({ id: "from-the-corpus" })],
      ),
    );
    mockEnv.FEED_DEBUG = true;

    const rail = await getGalleryRail("anchor", {
      count: 1,
      rng: mulberry32(hashSeed("fallthrough")),
      knobs: { wildcardChance: 1 },
    });

    expect(rail.map((r) => r.id)).toEqual(["from-the-corpus"]);
    const attempted = mockDrawImageAnywhere.mock.calls.map(
      ([opts]) => (opts as { sources?: string[] }).sources,
    );
    expect(attempted).toEqual([WILDCARD_SOURCES, []]);
  });

  it("ignores knob overrides when the debug flag is off", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();
    mockEnv.FEED_DEBUG = false;

    await getGalleryRail("anchor", {
      count: 6,
      rng: mulberry32(hashSeed("gated")),
      knobs: { wildcardChance: 1 },
    });

    // At chance 1 every slot would be a wildcard and no topic draw would happen at all. The gate
    // held, so the default 0.1 applied and the topic walk did the work.
    expect(mockDrawFromTopic).toHaveBeenCalled();
  });

  it("attaches debug only when the debug flag is on", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();

    mockEnv.FEED_DEBUG = false;
    const quiet = await getGalleryRail("anchor", {
      count: 3,
      rng: mulberry32(hashSeed("debug")),
    });
    expect(quiet.every((r) => r.debug === undefined)).toBe(true);

    mockEnv.FEED_DEBUG = true;
    const loud = await getGalleryRail("anchor", {
      count: 3,
      rng: mulberry32(hashSeed("debug")),
    });
    expect(loud.every((r) => r.debug !== undefined)).toBe(true);
    expect(loud[0]!.debug!.via).toMatch(/^(stay|drift|jump|wildcard)$/);
  });

  it("returns the rail's public shape and nothing more", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "anchor" }));
    drawsAlwaysWork();
    mockEnv.FEED_DEBUG = false;

    const [row] = await getGalleryRail("anchor", {
      count: 1,
      rng: mulberry32(hashSeed("shape")),
    });

    // The wire shape is the privacy boundary: `/g/` renders for anonymous visitors, exactly like
    // `/i/`. Nothing user-shaped, and nothing about scores or seen-state, crosses it.
    expect(Object.keys(row!).sort()).toEqual([
      "attribution",
      "id",
      "imageUrl",
      "license",
      "source",
      "sourceUrl",
      "summary",
      "title",
      "topicId",
    ]);
  });
});
