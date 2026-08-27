// Pure-function tests for the curation service (SPEC §6.2). Structural floor and response
// parsing are both deterministic and network-free, so they're covered here on literals; the
// live LLM call path (curateItems' network branch) is exercised by the Phase 3.3 curator smoke
// script instead — no live HTTP in unit tests (CLAUDE.md / PHASE3_PLAN.md convention).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLASSIFY_PROMPT,
  CURATOR_PROMPT,
  curateItems,
  parseCuratorResponse,
  structuralFloor,
  TOPIC_IDS,
} from "./curator";
import type { NormalizedItem } from "./sources/types";

/** A minimal, valid NormalizedItem literal — tests override just the fields they care about. */
function makeItem(overrides: Partial<NormalizedItem>): NormalizedItem {
  return {
    source: "wikipedia",
    sourceId: "1",
    type: "article",
    title: "A clean, ordinary item title",
    summary:
      "A summary long enough to clear the 60-character thin-summary floor easily.",
    body: null,
    imageUrl: null,
    sourceUrl: "https://example.com/1",
    attribution: "Example",
    license: "CC0",
    tags: [],
    ...overrides,
  };
}

describe("structuralFloor", () => {
  it("drops all items sharing a normalized title with more than two others (dup-title)", () => {
    const items = [
      makeItem({ sourceId: "1", title: "Textile" }),
      makeItem({ sourceId: "2", title: "textile " }),
      makeItem({ sourceId: "3", title: "TEXTILE." }),
      makeItem({ sourceId: "4", title: "textile" }),
    ];
    const { kept, dropped } = structuralFloor(items);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(4);
    expect(dropped.every((d) => d.rule === "dup-title")).toBe(true);
  });

  it("drops a bare single-word title on an image item (bare-title)", () => {
    const bowl = makeItem({ type: "image", title: "Bowl" });
    const { kept, dropped } = structuralFloor([bowl]);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual([{ item: bowl, rule: "bare-title" }]);
  });

  it("keeps a bare single-word title on an article — the rule is image-scoped", () => {
    const { kept, dropped } = structuralFloor([
      makeItem({ type: "article", title: "Astronomy" }),
    ]);
    expect(dropped).toHaveLength(0);
    expect(kept).toHaveLength(1);
  });

  it("drops a summary under 60 characters (thin-summary)", () => {
    const summary = "x".repeat(59);
    expect(summary).toHaveLength(59);
    const thin = makeItem({ summary });
    const { kept, dropped } = structuralFloor([thin]);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual([{ item: thin, rule: "thin-summary" }]);
  });

  it("keeps a clean item that trips no rule", () => {
    const item = makeItem({});
    const { kept, dropped } = structuralFloor([item]);
    expect(dropped).toHaveLength(0);
    expect(kept).toEqual([item]);
  });
});

describe("parseCuratorResponse", () => {
  it("parses a valid response into a clamped score + lowercase tags", () => {
    const result = parseCuratorResponse(
      '{"score": 8, "tags": ["Botanical Plate", "hand-lettered"]}',
    );
    expect(result).toEqual({
      score: 8,
      tags: ["botanical plate", "hand-lettered"],
      // Phase 6.3: parseCuratorResponse always reports a topic, and outside classify mode the
      // honest answer is null — a museum item's topic comes from the seed query that found it.
      topicId: null,
    });
  });

  it("throws on a missing score (retryable, not a silent bad cache write)", () => {
    expect(() => parseCuratorResponse('{"tags": ["x"]}')).toThrow(
      /bad curator score/,
    );
  });

  it("throws on a score of 0", () => {
    expect(() => parseCuratorResponse('{"score": 0, "tags": []}')).toThrow(
      /bad curator score/,
    );
  });

  it("clamps an out-of-range score (14) down to 10", () => {
    const result = parseCuratorResponse('{"score": 14, "tags": []}');
    expect(result.score).toBe(10);
  });

  it("treats a negative score the same as 0 — retryable, not silently clamped", () => {
    expect(() => parseCuratorResponse('{"score": -3, "tags": []}')).toThrow(
      /bad curator score/,
    );
  });

  it("falls back to an empty tag list when tags isn't an array", () => {
    const result = parseCuratorResponse('{"score": 5, "tags": "not-an-array"}');
    expect(result.tags).toEqual([]);
  });

  it("filters out junk tag entries and caps the list at 4", () => {
    const result = parseCuratorResponse(
      '{"score": 5, "tags": [123, "", "  ", "Real Tag", "second", "third", "fourth", "fifth"]}',
    );
    expect(result.tags).toEqual(["real tag", "second", "third", "fourth"]);
  });
});

// The one place this file's "no live HTTP" rule needs a stub rather than a literal. The behavior
// under test — that an unfetchable image is *reported* rather than silently absorbed — lives
// entirely inside curateItems' network branch, and it is exactly the kind of thing a smoke script
// won't assert because a smoke run against healthy sources never triggers it. So: `fetch` is
// stubbed, not called. Nothing here touches the network.
//
// Why it exists at all: Phase 6.2 ingested 334 Library of Congress items while tile.loc.gov was
// returning 429 to every image request, and the run reported clean success. The curator scored
// those items from their text alone and said nothing.
describe("curateItems image-fetch reporting", () => {
  const okCompletion = {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: '{"score": 7, "tags": ["a"]}' } }],
        usage: { total_tokens: 1 },
      }),
  };

  /** Stubs fetch so image requests fail with `imageStatus` and the OpenRouter call succeeds. */
  function stubFetch(imageStatus: number) {
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai")) return Promise.resolve(okCompletion);
      return Promise.resolve({ ok: false, status: imageStatus });
    });
  }

  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports each image item whose image could not be fetched", async () => {
    stubFetch(429);
    const failures: string[] = [];
    // `force: true` bypasses the on-disk cache read — a cached score reports no failure (it made
    // no fetch to fail), which is correct behavior and would make this test pass for the wrong
    // reason on a second run.
    await curateItems(
      [
        makeItem({
          sourceId: "curator-test-a",
          type: "image",
          imageUrl: "https://tile.example.gov/a.jpg",
        }),
        makeItem({
          sourceId: "curator-test-b",
          type: "image",
          imageUrl: "https://tile.example.gov/b.jpg",
        }),
      ],
      { force: true, onImageFetchFailure: (it) => failures.push(it.sourceId) },
    );
    // Sorted, not positional: curateItems runs a concurrency pool, so the order callbacks fire in
    // is genuinely nondeterministic. (Only the *returned array* is order-stable — the pool writes
    // each result to its own input index precisely so the caller's rank logic can rely on it.)
    expect(failures.sort()).toEqual(["curator-test-a", "curator-test-b"]);
  });

  it("says nothing for an article item, which has no image to fetch", async () => {
    stubFetch(429);
    const failures: string[] = [];
    await curateItems([makeItem({ sourceId: "curator-test-article" })], {
      force: true,
      onImageFetchFailure: (it) => failures.push(it.sourceId),
    });
    expect(failures).toEqual([]);
  });

  it("still scores the item rather than dropping it", async () => {
    stubFetch(404);
    const [curated] = await curateItems(
      [
        makeItem({
          sourceId: "curator-test-c",
          type: "image",
          imageUrl: "https://tile.example.gov/c.jpg",
        }),
      ],
      { force: true },
    );
    // A missing thumbnail must not null out a score — the item is judged on its text instead.
    expect(curated?.curationScore).toBe(7);
  });
});

describe("CLASSIFY_PROMPT", () => {
  it("is the curator rubric plus a topic block and a topic-aware reply line", () => {
    const rubric = CURATOR_PROMPT.slice(
      0,
      CURATOR_PROMPT.lastIndexOf("Reply with ONLY"),
    );
    expect(CLASSIFY_PROMPT.startsWith(rubric)).toBe(true);
    for (const id of TOPIC_IDS) expect(CLASSIFY_PROMPT).toContain(`  ${id} —`);
    expect(CLASSIFY_PROMPT).toMatch(/"topic": <topic id or null>\}$/);
    // The product artifact is untouched: it still ends with its original reply line.
    expect(CURATOR_PROMPT).toMatch(
      /\{"score": <1-10>, "tags": \["\.\.\.", "\.\.\."\]\}$/,
    );
  });
});

describe("parseCuratorResponse — classify mode", () => {
  const ids = new Set(["botany", "zoology"]);

  it("returns a known topic id", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": ["a"], "topic": "botany"}', {
        topicIds: ids,
      }),
    ).toEqual({ score: 8, tags: ["a"], topicId: "botany" });
  });

  it("turns an invented topic id into null — never a foreign-key error 300 items in", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "psychedelia"}', {
        topicIds: ids,
      }).topicId,
    ).toBeNull();
  });

  it("returns null for an explicit null, a missing field, and outside classify mode", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": null}', {
        topicIds: ids,
      }).topicId,
    ).toBeNull();
    expect(
      parseCuratorResponse('{"score": 8, "tags": []}', { topicIds: ids })
        .topicId,
    ).toBeNull();
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "botany"}')
        .topicId,
    ).toBeNull();
  });
});

describe("curateItems classify mode", () => {
  let bodies: {
    model: string;
    messages: { role: string; content: unknown }[];
  }[];
  beforeEach(() => {
    bodies = [];
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", (input: string | URL, init?: { body?: string }) => {
      if (String(input).includes("openrouter.ai")) {
        bodies.push(JSON.parse(init?.body ?? "{}") as (typeof bodies)[number]);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: '{"score": 7, "tags": ["a"], "topic": "botany"}',
                  },
                },
              ],
              usage: { total_tokens: 1 },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends CLASSIFY_PROMPT and returns the topic when classify is on", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `classify-${Date.now()}` })],
      { classify: true, force: true },
    );
    expect(out?.topicId).toBe("botany");
    expect(bodies[0]?.messages[0]?.content).toBe(CLASSIFY_PROMPT);
  });

  it("sends CURATOR_PROMPT and ignores any topic when classify is off", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `score-${Date.now()}` })],
      { force: true },
    );
    expect(out?.topicId).toBeNull();
    expect(bodies[0]?.messages[0]?.content).toBe(CURATOR_PROMPT);
  });
});
