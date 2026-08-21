import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { TopicGraph } from "./feed";
import { hashSeed, mulberry32 } from "./random";
import { getWanderNext, pickWanderTopics } from "./wander";

// Same seam as feed.test.ts: mock the repo, pin the rng, and the whole service becomes a pure
// function of its fixtures.
const { mockGetItemById, mockDrawFromTopic } = vi.hoisted(() => ({
  mockGetItemById: vi.fn(),
  mockDrawFromTopic: vi.fn(),
}));
vi.mock("~/server/db/items", () => ({
  getItemById: mockGetItemById,
  drawFromTopic: mockDrawFromTopic,
}));

const rng = () => mulberry32(hashSeed("wander"))();

const GRAPH: TopicGraph = {
  botany: [
    { topic: "zoology", sim: 0.4 },
    { topic: "art", sim: 0.3 },
    { topic: "ceramics", sim: 0.1 },
    { topic: "machines", sim: -0.2 },
  ],
  lonely: [],
};

const makeItem = (over: Partial<Item> & { id: string }): Item =>
  ({
    title: `Item ${over.id}`,
    topicId: "botany",
    ...over,
  }) as Item;

describe("pickWanderTopics", () => {
  it("picks near neighbours plus one longer leap, never the start topic", () => {
    const picks = pickWanderTopics("botany", GRAPH, mulberry32(hashSeed("a")));

    expect(picks.length).toBeGreaterThan(0);
    expect(picks.length).toBeLessThanOrEqual(3);
    expect(picks).not.toContain("botany");
    expect(new Set(picks).size).toBe(picks.length); // no duplicates
  });

  // A weak or negative edge is not a doorway — same rule as feed.ts's `hop()`.
  it("never drifts across a negative-similarity edge", () => {
    for (let i = 0; i < 25; i++) {
      const picks = pickWanderTopics(
        "botany",
        GRAPH,
        mulberry32(hashSeed(`neg-${i}`)),
      );
      // `machines` sits at sim -0.2, and is also in the far half of the row — the leap draws
      // uniformly from that half, so it can appear there; what must never happen is a *drift*
      // (near) pick landing on it. Drift picks are all but the last entry.
      expect(picks.slice(0, -1)).not.toContain("machines");
    }
  });

  it("returns nothing for a topic with no graph row", () => {
    expect(pickWanderTopics("lonely", GRAPH, rng)).toEqual([]);
    expect(pickWanderTopics("not-in-the-graph", GRAPH, rng)).toEqual([]);
  });
});

describe("getWanderNext", () => {
  beforeEach(() => {
    mockGetItemById.mockReset();
    mockDrawFromTopic.mockReset();
  });

  it("returns nothing at all for an unknown item", async () => {
    mockGetItemById.mockResolvedValue(undefined);

    expect(await getWanderNext("nope")).toEqual([]);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
  });

  it("returns three rows with topic-anchored reasons and nothing else", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "start" }));
    let n = 0;
    mockDrawFromTopic.mockImplementation((topicId: string) => {
      n++;
      return Promise.resolve([
        makeItem({ id: `drawn-${n}`, title: `From ${topicId}`, topicId }),
      ]);
    });

    const rows = await getWanderNext("start", mulberry32(hashSeed("b")));

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      // The wire shape is the privacy boundary: this teaser renders for anonymous visitors.
      expect(Object.keys(row).sort()).toEqual(["id", "reason", "title"]);
      expect(row.reason).toMatch(
        /^(a drift from|a longer leap, from|more from)/,
      );
    }
    // Nothing repeats, and the item itself is never offered back.
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain("start");
  });

  it("labels the last pick as the longer leap", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "start" }));
    mockDrawFromTopic.mockImplementation((topicId: string) =>
      Promise.resolve([makeItem({ id: `drawn-${topicId}`, topicId })]),
    );

    const rows = await getWanderNext("start", mulberry32(hashSeed("c")));

    expect(rows.at(-1)!.reason).toMatch(/^a longer leap, from /);
    expect(rows[0]!.reason).toMatch(/^a drift from /);
  });

  // The e2e corpus is a handful of items in one throwaway topic with no graph row at all. The
  // teaser still has to render, or its Done-bar assertion has nothing to assert.
  it("falls back to the item's own topic when the graph offers nothing", async () => {
    mockGetItemById.mockResolvedValue(
      makeItem({ id: "start", topicId: "no-such-topic" }),
    );
    let n = 0;
    mockDrawFromTopic.mockImplementation(() =>
      Promise.resolve([makeItem({ id: `own-${++n}` })]),
    );

    const rows = await getWanderNext("start", mulberry32(hashSeed("d")));

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.reason.startsWith("more from "))).toBe(true);
    expect(
      mockDrawFromTopic.mock.calls.every(
        ([topic]) => topic === "no-such-topic",
      ),
    ).toBe(true);
  });

  it("stops rather than spinning when the topic is exhausted", async () => {
    mockGetItemById.mockResolvedValue(
      makeItem({ id: "start", topicId: "no-such-topic" }),
    );
    mockDrawFromTopic.mockResolvedValue([]);

    const rows = await getWanderNext("start", mulberry32(hashSeed("e")));

    expect(rows).toEqual([]);
    expect(mockDrawFromTopic.mock.calls.length).toBeLessThan(5);
  });

  it("excludes what it has already offered from each subsequent draw", async () => {
    mockGetItemById.mockResolvedValue(makeItem({ id: "start" }));
    let n = 0;
    mockDrawFromTopic.mockImplementation(() =>
      Promise.resolve([makeItem({ id: `drawn-${++n}` })]),
    );

    await getWanderNext("start", mulberry32(hashSeed("f")));

    const lastCall = mockDrawFromTopic.mock.calls.at(-1)!;
    expect((lastCall[1] as { excludeIds: string[] }).excludeIds).toContain(
      "start",
    );
    expect((lastCall[1] as { excludeIds: string[] }).excludeIds).toContain(
      "drawn-1",
    );
  });
});
