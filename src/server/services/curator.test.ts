// Pure-function tests for the curation service (SPEC §6.2). Structural floor and response
// parsing are both deterministic and network-free, so they're covered here on literals; the
// live LLM call path (curateItems' network branch) is exercised by the Phase 3.3 curator smoke
// script instead — no live HTTP in unit tests (CLAUDE.md / PHASE3_PLAN.md convention).
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLASSIFY_PROMPT,
  CURATION_CACHE_DIR,
  curationCacheKey,
  CURATOR_PROMPT,
  curateItems,
  parseCuratorResponse,
  PROMPT_VERSION,
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

  // Sources round 2 (09-01-26): a blog's series posts ("Andy Goldsworthy" ×3) share a
  // caption-derived title on purpose, where a museum's duplicated titles were interchangeable
  // catalog stubs. Walk sources are exempt from dup-title only — Ben's call.
  it("exempts walk sources from dup-title — a blog series shares a title on purpose", () => {
    const series = ["1", "2", "3", "4"].map((sourceId) =>
      makeItem({
        source: "thingsorganizedneatly",
        sourceId,
        type: "image",
        title: "Andy Goldsworthy",
      }),
    );
    const { kept, dropped } = structuralFloor(series);
    expect(dropped).toHaveLength(0);
    expect(kept).toHaveLength(4);
  });

  it("still applies bare-title and thin-summary to walk sources", () => {
    const bare = makeItem({
      source: "doorofperception",
      type: "image",
      title: "Bowl",
    });
    const thin = makeItem({
      source: "doorofperception",
      type: "image",
      summary: "short",
    });
    const { kept, dropped } = structuralFloor([bare, thin]);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual([
      { item: bare, rule: "bare-title" },
      { item: thin, rule: "thin-summary" },
    ]);
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
      // Phase 6.3 / Cut 1: parseCuratorResponse always reports topics, and outside classify mode
      // the honest answer is none — a museum item's topic comes from the seed query that found it.
      topics: [],
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
    expect(CLASSIFY_PROMPT).toMatch(
      /"topics": \[<topic ids, best fit first, or empty>\]\}$/,
    );
    // The cap is in the prompt, not the parser (design §14 Q2).
    expect(CLASSIFY_PROMPT).toContain("never more than three");
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
    ).toEqual({ score: 8, tags: ["a"], topics: ["botany"] });
  });

  it("turns an invented topic id into null — never a foreign-key error 300 items in", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "psychedelia"}', {
        topicIds: ids,
      }).topics,
    ).toEqual([]);
  });

  it("returns null for an explicit null, a missing field, and outside classify mode", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": null}', {
        topicIds: ids,
      }).topics,
    ).toEqual([]);
    expect(
      parseCuratorResponse('{"score": 8, "tags": []}', { topicIds: ids })
        .topics,
    ).toEqual([]);
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "botany"}')
        .topics,
    ).toEqual([]);
  });

  it("returns every KNOWN id in the array, deduplicated, in the model's order", () => {
    expect(
      parseCuratorResponse(
        '{"score": 9, "tags": [], "topics": ["zoology", "psychedelia", "botany", "zoology"]}',
        { topicIds: ids },
      ).topics,
    ).toEqual(["zoology", "botany"]);
  });

  it("treats an empty array as a legal, non-error answer — the honest refusal", () => {
    const out = parseCuratorResponse(
      '{"score": 9, "tags": ["a"], "topics": []}',
      { topicIds: ids },
    );
    expect(out.topics).toEqual([]);
    expect(out.score).toBe(9); // a refusal costs the item nothing
  });

  it('reads a legacy single "topic" key as a one-element list', () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "botany"}', {
        topicIds: ids,
      }).topics,
    ).toEqual(["botany"]);
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
                    content:
                      '{"score": 7, "tags": ["a"], "topics": ["botany"]}',
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
    expect(out?.topics).toEqual(["botany"]);
    expect(bodies[0]?.messages[0]?.content).toBe(CLASSIFY_PROMPT);
  });

  it("sends CURATOR_PROMPT and ignores any topic when classify is off", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `score-${Date.now()}` })],
      { force: true },
    );
    expect(out?.topics).toEqual([]);
    expect(bodies[0]?.messages[0]?.content).toBe(CURATOR_PROMPT);
  });
});

// The property that makes Cut 1 free: a walk item scored under Phase 6.3's single-topic prompt is
// NOT re-billed. Its cache entry is read forward — `topicId: "botany"` → `topics: ["botany"]`,
// `topicId: null` → `topics: []`. `fetch` is stubbed to THROW so a cache miss fails loudly.
describe("curateItems reads pre-Cut-1 cache entries forward, with no LLM call", () => {
  const files: string[] = [];
  async function seedCache(item: NormalizedItem, body: unknown) {
    const file = path.join(
      CURATION_CACHE_DIR,
      `${curationCacheKey(item, true)}.json`,
    );
    await mkdir(CURATION_CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(body));
    files.push(file);
  }
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", () => {
      throw new Error("a cache hit must not call the LLM");
    });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await Promise.all(files.splice(0).map((f) => rm(f, { force: true })));
  });

  it("a cached single topic becomes a one-element array", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-a`,
    });
    await seedCache(it, { score: 7, tags: ["a"], topicId: "botany" });
    const [out] = await curateItems([it], { classify: true });
    expect(out).toMatchObject({ curationScore: 7, topics: ["botany"] });
  });

  it("a cached null topic becomes an empty array — stored un-homed, not dropped", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-b`,
    });
    await seedCache(it, { score: 9, tags: ["mural"], topicId: null });
    const [out] = await curateItems([it], { classify: true });
    expect(out).toMatchObject({ curationScore: 9, topics: [] });
  });

  it("a Cut 1 entry round-trips its array", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-c`,
    });
    await seedCache(it, { score: 8, tags: [], topics: ["botany", "zoology"] });
    const [out] = await curateItems([it], { classify: true });
    expect(out?.topics).toEqual(["botany", "zoology"]);
  });

  it("PROMPT_VERSION is still 1 — bumping it would re-bill every walk item for nothing", () => {
    expect(PROMPT_VERSION).toBe(1);
  });
});
