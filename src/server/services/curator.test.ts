// Pure-function tests for the curation service (SPEC §6.2). Structural floor and response
// parsing are both deterministic and network-free, so they're covered here on literals; the
// live LLM call path (curateItems' network branch) is exercised by the Phase 3.3 curator smoke
// script instead — no live HTTP in unit tests (CLAUDE.md / PHASE3_PLAN.md convention).
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAUDE_JUDGE_MODEL,
  claudeRuntime,
  resetClaudeJudge,
} from "./claude-judge";

import {
  CLASSIFY_PROMPT,
  classifyPrompt,
  CURATION_CACHE_DIR,
  curationCacheKey,
  CURATOR_PROMPT,
  curateItems,
  CuratorAbortError,
  MAX_CONSECUTIVE_FAILURES,
  parseCuratorResponse,
  PROMPT_VERSION,
  structuralFloor,
  TOPIC_IDS,
  CURATOR_MAX_TOKENS,
  CURATOR_MODEL,
  CLAUDE_CURATOR_PROMPT,
  CLAUDE_PROMPT_VERSION,
  curatorPrompt,
  SOURCE_SCORE_FLOOR,
  judgeModel,
  judgePreflight,
} from "./curator";
import { TOPICS } from "~/server/config/topics";
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

  // 09-06-26 (docs/PLAN_caption-less-and-wild.md T1): this test used to assert that walk sources
  // kept bare-title and thin-summary. They no longer apply to a walk source's IMAGES — both rules
  // are about museum records, where the text is all there is, and applying them to a picture blog
  // meant a rule about museums deciding which of Ben's designated blogs could be ingested at all
  // (137 of 150 thevaultoftheatomicspaceage posts floored on thin-summary alone). For a walk
  // image the curator, which sees the picture, is the whole quality bar. The asymmetry is what
  // this now pins.
  it("exempts a walk source's IMAGES from bare-title and thin-summary", () => {
    const bare = makeItem({
      source: "doorofperception",
      type: "image",
      title: "Colossal",
      summary:
        "A caption long enough to clear the sixty-character museum rule easily.",
    });
    // The caption-less picture-blog card: a one-word blog-label title AND an empty summary,
    // which is both rules at once and the exact shape T1 exists to keep.
    const captionless = makeItem({
      source: "thevaultoftheatomicspaceage",
      sourceId: "2",
      type: "image",
      title: "The Vault of the Atomic Space Age",
      summary: "",
    });
    const { kept, dropped } = structuralFloor([bare, captionless]);
    expect(dropped).toHaveLength(0);
    expect(kept).toHaveLength(2);
  });

  it("still applies thin-summary to a walk source's ARTICLES — they are read, not looked at", () => {
    const article = makeItem({
      source: "pdr",
      type: "article",
      title: "A Sea of Ink",
      summary: "A short note.",
    });
    const { kept, dropped } = structuralFloor([article]);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual([{ item: article, rule: "thin-summary" }]);
  });

  it("leaves search-shaped sources under both rules — the museums they were written for", () => {
    const bare = makeItem({ source: "met", type: "image", title: "Bowl" });
    const thin = makeItem({
      source: "met",
      sourceId: "2",
      type: "image",
      title: "A Bowl of Fruit",
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
      overFiled: 0,
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

  it("does not report a cache hit for a fresh call", async () => {
    stubFetch(404);
    const hits: string[] = [];
    await curateItems(
      [makeItem({ sourceId: `curator-test-fresh-${Date.now()}` })],
      { force: true, onCacheHit: (it) => hits.push(it.sourceId) },
    );
    expect(hits).toEqual([]);
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

  it("attaches the Loupe bearer to a loupe image download and nothing to a museum's", async () => {
    vi.stubEnv("LOUPE_API_TOKEN", "tok-123");
    const seen = new Map<string, Record<string, string>>();
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("openrouter.ai")) return Promise.resolve(okCompletion);
      seen.set(url, (init?.headers ?? {}) as Record<string, string>);
      // A 404 keeps the item on the "judge from text" path — this test is about the request,
      // not the response, and it must not need a real image.
      return Promise.resolve({ ok: false, status: 404 });
    });
    await curateItems(
      [
        makeItem({
          source: "loupe",
          sourceId: "walka00unse:1:0",
          type: "image",
          imageUrl: "http://localhost:3100/media/walka00unse/a.jpg",
        }),
        makeItem({
          source: "met",
          sourceId: "curator-test-met",
          type: "image",
          imageUrl: "https://images.metmuseum.org/b.jpg",
        }),
      ],
      { force: true },
    );
    expect(
      seen.get("http://localhost:3100/media/walka00unse/a.jpg")?.Authorization,
    ).toBe("Bearer tok-123");
    expect(
      seen.get("https://images.metmuseum.org/b.jpg")?.Authorization,
    ).toBeUndefined();
    expect(
      seen.get("https://images.metmuseum.org/b.jpg")?.["User-Agent"],
    ).toBeTruthy();
  });

  // 09-06-26 (plan T1c): a source may name a smaller rendition of the same picture purely for
  // scoring. What must be true is that scoreItem asks for THAT url and nothing else changes.
  it("fetches curationImageUrl when the source named one, and imageUrl when it did not", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = String(input);
      if (url.includes("openrouter.ai")) return Promise.resolve(okCompletion);
      asked.push(url);
      return Promise.resolve({ ok: false, status: 404 });
    });
    await curateItems(
      [
        makeItem({
          sourceId: "curator-test-small",
          type: "image",
          imageUrl: "https://media.example.com/a_1280.jpg",
          curationImageUrl: "https://media.example.com/a_500.jpg",
        }),
        makeItem({
          sourceId: "curator-test-plain",
          type: "image",
          imageUrl: "https://media.example.com/b_1280.jpg",
        }),
      ],
      { force: true },
    );
    // A Set: imageAsDataUrl retries a failed fetch, so each URL is asked for more than once.
    expect([...new Set(asked)].sort()).toEqual([
      "https://media.example.com/a_500.jpg",
      "https://media.example.com/b_1280.jpg",
    ]);
  });

  it("still stores and shows the full-size imageUrl when a curation rendition was used", async () => {
    vi.stubGlobal("fetch", (input: string | URL) =>
      Promise.resolve(
        String(input).includes("openrouter.ai")
          ? okCompletion
          : { ok: false, status: 404 },
      ),
    );
    const [curated] = await curateItems(
      [
        makeItem({
          sourceId: "curator-test-keeps-large",
          type: "image",
          imageUrl: "https://media.example.com/c_1280.jpg",
          curationImageUrl: "https://media.example.com/c_500.jpg",
        }),
      ],
      { force: true },
    );
    expect(curated?.imageUrl).toBe("https://media.example.com/c_1280.jpg");
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

// 09-06-26 (docs/PLAN_caption-less-and-wild.md T4). The vocabulary became a parameter so a walk
// item can home into one of Cut 2a's grown topics at ingest instead of waiting for the next
// manual promote:topics. Two things have to be true for that to be safe.
describe("classifyPrompt — the vocabulary is a parameter", () => {
  const vocab = [
    { id: "soviet-postcards", label: "Soviet Postcards" },
    { id: "space-age", label: "Space Age" },
  ];

  it("lists exactly the topics it was given, and none of the compile-time sixteen", () => {
    const prompt = classifyPrompt(vocab);
    expect(prompt).toContain("  soviet-postcards — Soviet Postcards");
    expect(prompt).toContain("  space-age — Space Age");
    for (const id of TOPIC_IDS) expect(prompt).not.toContain(`  ${id} —`);
  });

  it("keeps the rubric, the cap and the reply shape whatever the list is", () => {
    const prompt = classifyPrompt(vocab);
    expect(
      prompt.startsWith(
        CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY")),
      ),
    ).toBe(true);
    expect(prompt).toContain("never more than three");
    expect(prompt).toMatch(
      /"topics": \[<topic ids, best fit first, or empty>\]\}$/,
    );
    // The one sentence added for a 99-item list, so it does not read as a menu to fill.
    expect(prompt).toContain("The list is long");
  });

  it("CLASSIFY_PROMPT is still exactly the sixteen-topic prompt", () => {
    expect(CLASSIFY_PROMPT).toBe(classifyPrompt(TOPICS));
  });

  // D10, pinned: the cache key has no topic-list input, so growing the vocabulary re-bills
  // nothing. If someone ever adds one, this is what says the whole corpus is about to be
  // re-curated.
  it("the cache key does not depend on the topic list", () => {
    const item = { source: "70sscifiart" as const, sourceId: "1:1" };
    expect(curationCacheKey(item, true)).toBe(curationCacheKey(item, true));
    expect(curationCacheKey.length).toBe(2); // (item, classify) — no third argument
    expect(PROMPT_VERSION).toBe(1);
  });
});

describe("parseCuratorResponse — classify mode", () => {
  const ids = new Set(["botany", "zoology"]);

  it("returns a known topic id", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": ["a"], "topic": "botany"}', {
        topicIds: ids,
      }),
    ).toEqual({ score: 8, tags: ["a"], topics: ["botany"], overFiled: 0 });
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

  // MAX_TOPICS (09-07-26). The prompt has always said "never more than three", and the parser
  // deliberately kept everything, on the argument that truncating would hide an over-filing
  // model. Then the first sovietpostcards walk stored 89 items with 20+ memberships and nine
  // filed under all 99 topics — the model listing the vocabulary back, in order. Hiding it was
  // the wrong worry; STORING it was the harm. So: keep the first three (best fit first is the
  // prompt's own order), and report how many were dropped so over-filing stays visible.
  it("keeps only the first MAX_TOPICS known ids, and counts what it dropped", () => {
    const many = new Set(["a", "b", "c", "d", "e"]);
    const out = parseCuratorResponse(
      '{"score": 8, "tags": [], "topics": ["e", "junk", "d", "c", "b", "a"]}',
      { topicIds: many },
    );
    expect(out.topics).toEqual(["e", "d", "c"]);
    expect(out.overFiled).toBe(2); // b and a — the invented "junk" was never a topic to drop
  });

  it("reports overFiled 0 for an answer inside the cap", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topics": ["botany"]}', {
        topicIds: ids,
      }).overFiled,
    ).toBe(0);
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
    max_tokens?: number;
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

  it("caps every request with max_tokens so OpenRouter reserves a few hundred tokens, not the model's whole window", async () => {
    // Without it OpenRouter reserves the model's full output window (65,535 tokens for
    // gemini-2.5-flash-lite) against the key's remaining budget *before* dispatch — twelve
    // in-flight calls needed ~$0.31 of headroom to send ~$0.004 of work, and kvetchlandia's
    // walk died on a 402 with $2 still on the key (09-16-26).
    await curateItems(
      [makeItem({ type: "image", sourceId: `cap-${Date.now()}` })],
      {
        classify: true,
        force: true,
      },
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.max_tokens).toBe(CURATOR_MAX_TOKENS);
    expect(CURATOR_MAX_TOKENS).toBeGreaterThanOrEqual(200);
    expect(CURATOR_MAX_TOKENS).toBeLessThanOrEqual(1000);
  });

  it("sends CLASSIFY_PROMPT and returns the topic when classify is on", async () => {
    const [out] = await curateItems(
      [makeItem({ type: "image", sourceId: `classify-${Date.now()}` })],
      { classify: true, force: true },
    );
    expect(out?.topics).toEqual(["botany"]);
    expect(bodies[0]?.messages[0]?.content).toBe(CLASSIFY_PROMPT);
  });

  it("sends CURATOR_PROMPT and ignores any topic when classify is off", async () => {
    const [out] = await curateItems(
      [makeItem({ type: "image", sourceId: `score-${Date.now()}` })],
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
      type: "image",
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-a`,
    });
    await seedCache(it, { score: 7, tags: ["a"], topicId: "botany" });
    const [out] = await curateItems([it], { classify: true });
    // 8, not the cached 7: the item is a Door of Perception post, and that source has had a
    // score floor since 10-01-26 (SOURCE_SCORE_FLOOR). The topic read-forward is what this pins.
    expect(out).toMatchObject({ curationScore: 8, topics: ["botany"] });
  });

  it("a cached null topic becomes an empty array — stored un-homed, not dropped", async () => {
    const it = makeItem({
      type: "image",
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-b`,
    });
    await seedCache(it, { score: 9, tags: ["mural"], topicId: null });
    const [out] = await curateItems([it], { classify: true });
    expect(out).toMatchObject({ curationScore: 9, topics: [] });
  });

  // Why a hook and not a return field (09-07-26): the walk-stats report prints the curator's
  // image-fetch failures, and a cache hit reports none — it made no fetch. So "0 failed" on a
  // run answered from cache is not a clean run, it is an unmeasured one, and the report can only
  // say which if it knows how many calls were fresh.
  it("reports a cache hit through onCacheHit, so a caller can tell a free run from a clean one", async () => {
    const it = makeItem({
      type: "image",
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-d`,
    });
    await seedCache(it, { score: 7, tags: [], topics: ["botany"] });
    const hits: string[] = [];
    await curateItems([it], {
      classify: true,
      onCacheHit: (item) => hits.push(item.sourceId),
    });
    expect(hits).toEqual([it.sourceId]);
  });

  it("a Cut 1 entry round-trips its array", async () => {
    const it = makeItem({
      type: "image",
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-c`,
    });
    await seedCache(it, { score: 8, tags: [], topics: ["botany", "zoology"] });
    const [out] = await curateItems([it], { classify: true });
    expect(out?.topics).toEqual(["botany", "zoology"]);
  });

  it("caps an over-long cached array on read, and reports it — no re-bill", async () => {
    // The 09-06/07 walks wrote runaway lists into the cache before MAX_TOPICS existed. Those
    // entries are read forward like every other one: capped to three, counted, never re-billed.
    const it = makeItem({
      type: "image",
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-d`,
    });
    await seedCache(it, {
      score: 8,
      tags: [],
      topics: ["botany", "zoology", "poetry", "machines", "clay"],
    });
    const overFiled: number[] = [];
    const [out] = await curateItems([it], {
      classify: true,
      onOverFiled: (_item, n) => overFiled.push(n),
    });
    expect(out?.topics).toEqual(["botany", "zoology", "poetry"]);
    expect(overFiled).toEqual([2]);
  });

  it("PROMPT_VERSION is still 1 — bumping it would re-bill every walk item for nothing", () => {
    expect(PROMPT_VERSION).toBe(1);
  });
});

// The wallet failure (09-08-26). Walk 3 hit HTTP 402 at 18:28 and the curator kept going for 18
// hours: each item retried four times with backoff, then fell back to score 5 / no tags / no
// topics — the right answer for one flaky request, the wrong one for "the account is out of
// credits", where every remaining item would have been stored as unscored, un-homed junk under a
// clean summary. So 401/402 are neither transient nor per-item: no retry, and the batch aborts
// with nothing written. The same fail-fast rule the Loupe adapter follows for 401/403.
describe("curateItems fails fast on an account-level error", () => {
  let calls: number;
  function stubOpenRouter(status: number, body = "out of credits") {
    calls = 0;
    vi.stubGlobal("fetch", (input: string | URL) => {
      if (String(input).includes("openrouter.ai")) {
        calls++;
        return Promise.resolve({
          ok: false,
          status,
          text: () => Promise.resolve(body),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  }
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Runs curateItems under fake timers so the retry backoff (1s · 3s · 9s) costs nothing. */
  async function run(items: NormalizedItem[]) {
    const p = curateItems(items, { force: true });
    // Attach a handler before advancing so a rejection is never briefly unhandled.
    const settled = p.then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    // **Advance until the run settles, not once.** `runAllTimersAsync` returns as soon as no fake
    // timer is pending — but a *successful* judgment writes its cache file, and that is real disk
    // I/O the fake clock does not own. A worker still inside `writeFile` when the queue drains
    // schedules its next item's backoff *afterwards*, where nothing would ever advance it: the
    // test hangs to its 5 s timeout. It needs a disk slower than the other workers' retries,
    // which this Mac never is and a CI runner sometimes is (09-17-26 — red on PR #20's e2e job,
    // green in the same commit's check job). `setImmediate` is real here (only `setTimeout` is
    // faked), so each turn of the loop lets pending I/O land before draining again.
    let done = false;
    void settled.then(() => {
      done = true;
    });
    while (!done) {
      await vi.runAllTimersAsync();
      await new Promise((resolve) => setImmediate(resolve));
    }
    return settled;
  }

  it("402 on the first item aborts the batch without retrying — nothing scored", async () => {
    stubOpenRouter(
      402,
      "You requested up to 65535 tokens, but can only afford 44161",
    );
    const r = await run([
      makeItem({ sourceId: "abort-1" }),
      makeItem({ sourceId: "abort-2" }),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.e).toBeInstanceOf(CuratorAbortError);
    expect((r.e as CuratorAbortError).status).toBe(402);
    expect(String(r.e)).toContain("402");
    // No retry: the two workers each asked once and stopped. Never 4× per item.
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("401 (bad key) aborts the same way", async () => {
    stubOpenRouter(401, "No auth credentials found");
    const r = await run([makeItem({ sourceId: "abort-3" })]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.e).toBeInstanceOf(CuratorAbortError);
    expect(calls).toBe(1);
  });

  it("a 500 still retries and falls back to the neutral score — that is what the fallback is for", async () => {
    stubOpenRouter(500, "upstream hiccup");
    const r = await run([makeItem({ sourceId: "flaky-1" })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.v[0]?.curationScore).toBe(5);
    expect(calls).toBe(4);
  });

  // The softer guard: a failure the status code does not name (a provider down for the night,
  // a key revoked mid-run answering 403, a 429 that never clears) must not crawl to the end
  // either. After MAX_CONSECUTIVE_FAILURES fallbacks in a row with no success between them,
  // the batch aborts. A success anywhere resets the count, so ordinary sporadic failures never
  // trip it.
  it(`aborts after ${MAX_CONSECUTIVE_FAILURES} consecutive fallbacks for any reason`, async () => {
    stubOpenRouter(503, "provider down");
    const items = Array.from({ length: MAX_CONSECUTIVE_FAILURES + 5 }, (_, i) =>
      makeItem({ sourceId: `down-${i}` }),
    );
    const r = await run(items);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.e).toBeInstanceOf(CuratorAbortError);
    expect(String(r.e)).toContain("consecutive");
  });

  it("a success between failures resets the consecutive count", async () => {
    // Every other item fails all four attempts and falls back; the rest answer first time.
    // With eight workers interleaving, the longest run of fallbacks with no success between
    // stays far under the guard — so a source whose half-broken records fail sporadically is
    // never mistaken for a dead provider.
    vi.stubGlobal("fetch", (input: string | URL, init?: { body?: string }) => {
      if (!String(input).includes("openrouter.ai"))
        return Promise.resolve({ ok: false, status: 404 });
      if ((init?.body ?? "").includes("FAILS"))
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve("flaky"),
        });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"score": 7, "tags": ["a"]}' } }],
            usage: { total_tokens: 1 },
          }),
      });
    });
    const items = Array.from(
      { length: MAX_CONSECUTIVE_FAILURES * 2 + 2 },
      (_, i) =>
        makeItem({
          sourceId: `reset-${i}`,
          title: i % 2 === 0 ? "This one FAILS every time" : "This one is fine",
        }),
    );
    const r = await run(items);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.v.filter((it) => it.curationScore === 5)).toHaveLength(
      MAX_CONSECUTIVE_FAILURES + 1,
    );
  });
});

/** A successful CLI stream carrying `reply` (the shape captured 10-01-26). */
function claudeStream(reply: string) {
  return [
    {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        unifiedWindows: { seven_day: { utilization: 0.2 } },
      },
    },
    {
      type: "result",
      is_error: false,
      result: reply,
      usage: { input_tokens: 400, output_tokens: 14 },
    },
  ]
    .map((l) => JSON.stringify(l))
    .join("\n");
}

describe("judgeModel", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is the OpenRouter model when CURATOR_JUDGE is unset", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    expect(judgeModel()).toBe(CURATOR_MODEL);
  });
  it("is Haiku under CURATOR_JUDGE=claude", () => {
    vi.stubEnv("CURATOR_JUDGE", "claude");
    expect(judgeModel()).toBe(CLAUDE_JUDGE_MODEL);
  });
  it("refuses a value it does not know rather than guessing", () => {
    vi.stubEnv("CURATOR_JUDGE", "gemini");
    expect(() => judgeModel()).toThrow(/CURATOR_JUDGE/);
  });
});

describe("cache keys under the two judges", () => {
  afterEach(() => vi.unstubAllEnvs());
  const it1 = { source: "met" as const, sourceId: "42" };
  it("an explicit OpenRouter model gives the key the unset default gives", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    expect(curationCacheKey(it1, false, CURATOR_MODEL)).toBe(
      curationCacheKey(it1, false),
    );
  });
  it("the Claude judge has a namespace of its own", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    const openrouter = curationCacheKey(it1, true);
    vi.stubEnv("CURATOR_JUDGE", "claude");
    expect(curationCacheKey(it1, true)).not.toBe(openrouter);
    expect(curationCacheKey(it1, true)).toBe(
      curationCacheKey(it1, true, CLAUDE_JUDGE_MODEL),
    );
  });
});

describe("judgePreflight", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("asks for the OpenRouter key only when an OpenRouter model is in play", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(await judgePreflight([CURATOR_MODEL])).toMatch(/OPENROUTER_API_KEY/);
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    expect(await judgePreflight([CURATOR_MODEL])).toBeNull();
  });
});

describe("curateItems on the Claude judge", () => {
  const realRun = claudeRuntime.run;
  let runs: { args: string[]; stdin: string }[];
  let imageBytes: Buffer | null;

  beforeEach(() => {
    runs = [];
    imageBytes = null;
    resetClaudeJudge();
    vi.stubEnv("CURATOR_JUDGE", "claude");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubGlobal("fetch", (input: string | URL) => {
      // An OpenRouter call here would reject, be absorbed as a failed judgment, and come back as
      // the neutral score 5 — so asserting on the real score below proves none was made.
      if (String(input).includes("openrouter.ai"))
        return Promise.reject(
          new Error("the Claude judge must not call OpenRouter"),
        );
      if (!imageBytes) return Promise.resolve({ ok: false, status: 404 });
      const bytes = imageBytes;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: () =>
          Promise.resolve(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          ),
      });
    });
    claudeRuntime.run = (args, stdin) => {
      runs.push({ args, stdin });
      return Promise.resolve({
        code: 0,
        stdout: claudeStream(
          '```json\n{"score": 8, "tags": ["Ink Wash"]}\n```',
        ),
        stderr: "",
      });
    };
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("scores through the CLI with the curator's own prompt, never OpenRouter", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `claude-${Date.now()}`, type: "image" })],
      { force: true },
    );
    expect(out?.curationScore).toBe(8);
    expect(out?.aestheticTags).toEqual(["ink wash"]);
    expect(runs).toHaveLength(1);
    const system = runs[0]!.args[runs[0]!.args.indexOf("--system-prompt") + 1];
    expect(system).toBe(CLAUDE_CURATOR_PROMPT);
  });

  it("sends a picture as a downscaled JPEG, whatever the source served", async () => {
    imageBytes = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#884422" },
    })
      .png()
      .toBuffer();
    await curateItems(
      [
        makeItem({
          sourceId: `claude-img-${Date.now()}`,
          type: "image",
          imageUrl: "https://museum.example/big.png",
        }),
      ],
      { force: true },
    );
    const message = JSON.parse(runs[0]!.stdin) as {
      message: {
        content: {
          type: string;
          source?: { media_type: string; data: string };
        }[];
      };
    };
    const image = message.message.content.find((b) => b.type === "image");
    expect(image?.source?.media_type).toBe("image/jpeg");
    const meta = await sharp(
      Buffer.from(image!.source!.data, "base64"),
    ).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(512);
  });

  it("judges from text, and says so, when the bytes are not a picture sharp can read", async () => {
    imageBytes = Buffer.from("this is not an image");
    const failures: string[] = [];
    const [out] = await curateItems(
      [
        makeItem({
          sourceId: `claude-bad-${Date.now()}`,
          type: "image",
          imageUrl: "https://museum.example/odd.tiff",
        }),
      ],
      { force: true, onImageFetchFailure: (it) => failures.push(it.sourceId) },
    );
    expect(failures).toHaveLength(1);
    expect(out?.curationScore).toBe(8);
    expect(runs[0]!.stdin).toContain("could not be fetched");
    expect(runs[0]!.stdin).not.toContain('"type":"image"');
  });
});

describe("curateItems on the Claude judge — the review's fixes", () => {
  const realRun = claudeRuntime.run;
  beforeEach(() => {
    resetClaudeJudge();
    vi.stubEnv("CURATOR_JUDGE", "claude");
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("a transparent picture reaches the model on white, not black", async () => {
    const png = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: () =>
          Promise.resolve(
            png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
          ),
      }),
    );
    let stdin = "";
    claudeRuntime.run = (_args, input) => {
      stdin = input;
      return Promise.resolve({
        code: 0,
        stdout: claudeStream('{"score": 6, "tags": ["a"]}'),
        stderr: "",
      });
    };
    await curateItems(
      [
        makeItem({
          sourceId: `claude-alpha-${Date.now()}`,
          type: "image",
          imageUrl: "https://museum.example/line-art.png",
        }),
      ],
      { force: true },
    );
    const message = JSON.parse(stdin) as {
      message: { content: { type: string; source?: { data: string } }[] };
    };
    const image = message.message.content.find((b) => b.type === "image");
    const { data } = await sharp(Buffer.from(image!.source!.data, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it("answers in flight when the ceiling stops the run are still cached", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 404 }));
    const stamp = Date.now();
    const items = [0, 1, 2, 3, 4].map((n) =>
      makeItem({ sourceId: `claude-inflight-${stamp}-${n}`, type: "image" }),
    );
    let call = 0;
    claudeRuntime.run = () => {
      const first = call++ === 0;
      const stdout = [
        {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed",
            unifiedWindows: { seven_day: { utilization: first ? 0.9 : 0.5 } },
          },
        },
        {
          type: "result",
          is_error: false,
          result: '{"score": 7, "tags": ["a"]}',
          usage: { input_tokens: 400, output_tokens: 14 },
        },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n");
      // The first answer crosses the ceiling at once; the other three are still in flight.
      return new Promise((resolve) =>
        setTimeout(
          () => resolve({ code: 0, stdout, stderr: "" }),
          first ? 0 : 60,
        ),
      );
    };
    await expect(curateItems(items, { force: true })).rejects.toBeInstanceOf(
      CuratorAbortError,
    );
    for (const it of items.slice(0, 4))
      expect(
        existsSync(
          path.join(CURATION_CACHE_DIR, `${curationCacheKey(it, false)}.json`),
        ),
      ).toBe(true);
  });
});

describe("curateItems remembers a text-only judgment in the cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("reports it on the fresh call and again on the cache hit", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", (input: string | URL) =>
      String(input).includes("openrouter.ai")
        ? Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  { message: { content: '{"score": 7, "tags": ["a"]}' } },
                ],
                usage: { total_tokens: 1 },
              }),
          })
        : Promise.resolve({ ok: false, status: 429 }),
    );
    const item = makeItem({
      sourceId: `text-only-${Date.now()}`,
      type: "image",
      imageUrl: "https://tile.example.gov/x.jpg",
    });
    const textOnly: string[] = [];
    const fetchFailed: string[] = [];
    const opts = {
      onTextOnly: (it: NormalizedItem) => textOnly.push(it.sourceId),
      onImageFetchFailure: (it: NormalizedItem) =>
        fetchFailed.push(it.sourceId),
    };
    await curateItems([item], { ...opts, force: true });
    await curateItems([item], opts);
    expect(textOnly).toHaveLength(2);
    expect(fetchFailed).toHaveLength(1);
  });
});

describe("judgePreflight on the Claude judge", () => {
  const realRun = claudeRuntime.run;
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
  });
  it("makes one tiny call and passes when it answers", async () => {
    let calls = 0;
    claudeRuntime.run = () => {
      calls++;
      return Promise.resolve({
        code: 0,
        stdout: claudeStream("{}"),
        stderr: "",
      });
    };
    expect(await judgePreflight([CLAUDE_JUDGE_MODEL])).toBeNull();
    expect(calls).toBe(1);
  });
  it("says so in one sentence when the CLI is missing or logged out", async () => {
    claudeRuntime.run = () => Promise.reject(new Error("spawn claude ENOENT"));
    expect(await judgePreflight([CLAUDE_JUDGE_MODEL])).toMatch(
      /Claude judge is not usable.*ENOENT/,
    );
  });
});

// A `--kind writing` night judges with the writing model only, so a preflight that proved just the
// first Claude model would pass on Haiku and then fail on Sonnet's first judgment, after the whole
// walk. Each distinct Claude model gets its own tiny call; the run's replies are scripted by call
// order because the runtime's argv is not what is under test.
describe("judgePreflight proves every Claude model", () => {
  const realRun = claudeRuntime.run;
  const SECOND = "claude-sonnet-5-5";
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
  });
  it("calls once per distinct model and passes when both answer", async () => {
    let calls = 0;
    claudeRuntime.run = () => {
      calls++;
      return Promise.resolve({
        code: 0,
        stdout: claudeStream("{}"),
        stderr: "",
      });
    };
    expect(await judgePreflight([CLAUDE_JUDGE_MODEL, SECOND])).toBeNull();
    expect(calls).toBe(2);
  });
  it("names the second model when only it is refused", async () => {
    let calls = 0;
    claudeRuntime.run = () => {
      if (++calls === 2) return Promise.reject(new Error("model not allowed"));
      return Promise.resolve({
        code: 0,
        stdout: claudeStream("{}"),
        stderr: "",
      });
    };
    const message = await judgePreflight([CLAUDE_JUDGE_MODEL, SECOND]);
    expect(message).toMatch(/model not allowed/);
    expect(message).toContain(SECOND);
  });
  it("makes one call when the same model is listed twice", async () => {
    let calls = 0;
    claudeRuntime.run = () => {
      calls++;
      return Promise.resolve({
        code: 0,
        stdout: claudeStream("{}"),
        stderr: "",
      });
    };
    expect(
      await judgePreflight([CLAUDE_JUDGE_MODEL, CLAUDE_JUDGE_MODEL]),
    ).toBeNull();
    expect(calls).toBe(1);
  });
});

describe("structuralFloor — donation posts", () => {
  it("drops a post that is only a donation link, from any source, before it is scored", () => {
    const kofi = makeItem({
      source: "thevaultoftheatomicspaceage",
      sourceId: "kofi",
      type: "image",
      title: "https://ko-fi.com/thevault",
      summary: "https://ko-fi.com/thevault",
      imageUrl: "https://example.com/banner.jpg",
    });
    const { kept, dropped } = structuralFloor([kofi]);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([{ item: kofi, rule: "donation" }]);
  });

  it("keeps a real post whose long caption happens to mention a Patreon", () => {
    const post = makeItem({
      source: "thevaultoftheatomicspaceage",
      sourceId: "real",
      type: "image",
      title: "Atomic Age kitchen, 1956",
      summary:
        "A General Electric advertisement from 1956, scanned from Life. More scans like this are on patreon.com/thevault for supporters.",
      imageUrl: "https://example.com/kitchen.jpg",
    });
    expect(structuralFloor([post]).kept).toEqual([post]);
  });
});

describe("a designated source's score floor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  function stubScore(score: number) {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", (input: string | URL) =>
      String(input).includes("openrouter.ai")
        ? Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [
                  {
                    message: { content: `{"score": ${score}, "tags": ["a"]}` },
                  },
                ],
                usage: { total_tokens: 1 },
              }),
          })
        : Promise.resolve({ ok: false, status: 404 }),
    );
  }
  const dop = (id: string) =>
    makeItem({ source: "doorofperception", sourceId: id, type: "image" });

  it("names Door of Perception at 8", () => {
    expect(SOURCE_SCORE_FLOOR.doorofperception).toBe(8);
  });
  it("lifts a Door of Perception picture the judge scored low", async () => {
    stubScore(3);
    const [out] = await curateItems([dop(`floor-${Date.now()}`)], {
      force: true,
    });
    expect(out?.curationScore).toBe(8);
    expect(out?.aestheticTags).toEqual(["a"]);
  });
  it("keeps a judge's higher score", async () => {
    stubScore(9);
    const [out] = await curateItems([dop(`floor-hi-${Date.now()}`)], {
      force: true,
    });
    expect(out?.curationScore).toBe(9);
  });
  it("leaves every other source alone", async () => {
    stubScore(3);
    const [out] = await curateItems(
      [
        makeItem({
          source: "met",
          sourceId: `floor-met-${Date.now()}`,
          type: "image",
        }),
      ],
      { force: true },
    );
    expect(out?.curationScore).toBe(3);
  });
});

describe("the Claude judge has a picture rubric of its own", () => {
  afterEach(() => vi.unstubAllEnvs());
  const vocab = [{ id: "botany", label: "Botany" }];
  const piece = { source: "met" as const, sourceId: "42" };

  it("leaves the OpenRouter prompts exactly as they were", () => {
    vi.stubEnv("CURATOR_JUDGE", "");
    expect(curatorPrompt()).toBe(CURATOR_PROMPT);
    expect(classifyPrompt(TOPICS)).toBe(CLASSIFY_PROMPT);
    expect(
      classifyPrompt(vocab, CURATOR_MODEL).startsWith(
        CURATOR_PROMPT.slice(0, 200),
      ),
    ).toBe(true);
  });
  it("gives a claude-* model the Claude rubric, in both modes", () => {
    expect(curatorPrompt(CLAUDE_JUDGE_MODEL)).toBe(CLAUDE_CURATOR_PROMPT);
    const p = classifyPrompt(vocab, CLAUDE_JUDGE_MODEL);
    expect(p.startsWith(CLAUDE_CURATOR_PROMPT.slice(0, 200))).toBe(true);
    expect(p).toContain("botany — Botany");
    expect(p).toContain('"topics"');
  });
  it("keys the Claude cache on the Claude rubric's version", async () => {
    const { createHash } = await import("node:crypto");
    const sha = (s: string) =>
      createHash("sha256").update(s).digest("hex").slice(0, 32);
    expect(curationCacheKey(piece, true, CLAUDE_JUDGE_MODEL)).toBe(
      sha(`${CLAUDE_JUDGE_MODEL}|vc${CLAUDE_PROMPT_VERSION}|classify|met:42`),
    );
    expect(curationCacheKey(piece, false, CURATOR_MODEL)).toBe(
      sha(`${CURATOR_MODEL}|v${PROMPT_VERSION}|met:42`),
    );
  });
});

describe("judgePreflight at the ceiling", () => {
  const realRun = claudeRuntime.run;
  beforeEach(() => resetClaudeJudge());
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllEnvs();
  });

  // The preflight's own call succeeds — it is the call that *reads* the usage. Without this
  // check the run would walk every source for an hour and abort on its first judgment.
  it("refuses before any walk when a window is already past it", async () => {
    claudeRuntime.run = () =>
      Promise.resolve({
        code: 0,
        stdout: [
          {
            type: "rate_limit_event",
            rate_limit_info: {
              status: "allowed",
              unifiedWindows: {
                five_hour: { utilization: 0.91, resetsAt: 1790880000 },
              },
            },
          },
          {
            type: "result",
            is_error: false,
            result: '{"ok":true}',
            usage: { input_tokens: 400, output_tokens: 6 },
          },
        ]
          .map((l) => JSON.stringify(l))
          .join("\n"),
        stderr: "",
      });
    expect(await judgePreflight([CLAUDE_JUDGE_MODEL])).toMatch(
      /already at its ceiling.*five_hour window is at 91%/,
    );
  });
});
