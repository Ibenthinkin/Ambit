// The writing curator (docs/DESIGN_writing.md D1, docs/PLAN_writing.md Phase 1): the floor,
// the parser, the cache key and the dispatch by type. Network-free — the dispatch tests stub
// `fetch` the way curator.test.ts does.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CURATION_CACHE_DIR,
  curateItems,
  curationCacheKey,
  CURATOR_MODEL,
  CURATOR_PROMPT,
  parseWritingResponse,
  splitNews,
  type CuratedItem,
  WRITING_PROMPT,
  WRITING_PROMPT_VERSION,
  writingCacheKey,
  writingFloor,
  WRITING_MIN_CHARS,
  writingPrompt,
} from "./curator";
import type { NormalizedItem } from "./sources/types";

function makeItem(overrides: Partial<NormalizedItem>): NormalizedItem {
  return {
    source: "wikipedia",
    sourceId: "1",
    type: "article",
    title: "A clean, ordinary item title",
    summary: "A summary.",
    body: null,
    imageUrl: null,
    sourceUrl: "https://example.com/1",
    attribution: "Example",
    license: "CC0",
    tags: [],
    ...overrides,
  };
}

const text = (n: number) => "x".repeat(n);

describe("writingFloor — thin-text", () => {
  it(`drops an article whose text is under ${WRITING_MIN_CHARS} characters`, () => {
    const thin = makeItem({
      sourceId: "thin",
      summary: text(WRITING_MIN_CHARS - 1),
    });
    const { kept, dropped } = writingFloor([thin]);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([{ item: thin, rule: "thin-text" }]);
  });

  it("keeps an article at the floor", () => {
    const ok = makeItem({ summary: text(WRITING_MIN_CHARS) });
    expect(writingFloor([ok]).kept).toEqual([ok]);
  });

  it("reads the body when there is one, so a short dek over a long body survives", () => {
    const ok = makeItem({
      summary: "Short dek.",
      body: text(WRITING_MIN_CHARS + 50),
    });
    expect(writingFloor([ok]).kept).toEqual([ok]);
  });

  it("does not count the apparatus toward the floor", () => {
    const padded = makeItem({
      body: `${text(100)}\n== References ==\n${text(WRITING_MIN_CHARS * 2)}`,
    });
    expect(writingFloor([padded]).dropped).toHaveLength(1);
  });

  it("never touches an image", () => {
    const img = makeItem({ type: "image", summary: "" });
    expect(writingFloor([img]).kept).toEqual([img]);
  });
});

describe("parseWritingResponse", () => {
  const ids = new Set(["botany", "zoology", "maps", "myth"]);

  it("reads score, tags, kind, timeliness and known topics", () => {
    const out = parseWritingResponse(
      '{"score": 8, "tags": ["Odd History", "x"], "kind": "curiosity", "timeliness": "dated", "topics": ["botany", "invented"]}',
      { topicIds: ids },
    );
    expect(out).toEqual({
      score: 8,
      tags: ["odd history", "x"],
      kind: "curiosity",
      timeliness: "dated",
      topics: ["botany"],
      overFiled: 0,
    });
  });

  it("turns an unknown kind into null and an unknown timeliness into timeless", () => {
    const out = parseWritingResponse(
      '{"score": 5, "tags": [], "kind": "listicle", "timeliness": "evergreen"}',
      { topicIds: ids },
    );
    expect(out.kind).toBeNull();
    expect(out.timeliness).toBe("timeless");
  });

  it("caps topics at three and counts the rest", () => {
    const out = parseWritingResponse(
      '{"score": 5, "tags": [], "kind": "essay", "timeliness": "news", "topics": ["botany", "zoology", "maps", "myth"]}',
      { topicIds: ids },
    );
    expect(out.topics).toEqual(["botany", "zoology", "maps"]);
    expect(out.overFiled).toBe(1);
    expect(out.timeliness).toBe("news");
  });

  it("rejects an unusable score, like the image parser", () => {
    expect(() =>
      parseWritingResponse('{"score": 0, "kind": "essay"}', { topicIds: ids }),
    ).toThrow(/bad curator score/);
  });
});

describe("writing prompt", () => {
  it("names the four kinds, the three timeliness verdicts, and welcomes longform journalism", () => {
    for (const k of ["essay", "curiosity", "criticism", "archive"])
      expect(WRITING_PROMPT).toContain(`"${k}"`);
    for (const t of ["timeless", "dated", "news"])
      expect(WRITING_PROMPT).toContain(`"${t}"`);
    expect(WRITING_PROMPT.toLowerCase()).toContain("longform");
  });

  it("writingPrompt lists the vocabulary it is given", () => {
    const p = writingPrompt([{ id: "botany", label: "Botany" }]);
    expect(p).toContain("botany — Botany");
    expect(p.startsWith(WRITING_PROMPT.slice(0, 200))).toBe(true);
  });

  it("does not touch the image prompt", () => {
    expect(CURATOR_PROMPT).not.toContain("timeliness");
  });
});

describe("writingCacheKey", () => {
  const it0 = { source: "wikipedia", sourceId: "Tree" } as const;

  it("is its own namespace, apart from both image keys", () => {
    const k = writingCacheKey(it0);
    expect(k).not.toBe(curationCacheKey(it0, false));
    expect(k).not.toBe(curationCacheKey(it0, true));
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(WRITING_PROMPT_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("is keyed on the model, so the calibration comparison never collides", () => {
    expect(writingCacheKey(it0, "google/gemini-2.5-flash")).not.toBe(
      writingCacheKey(it0, CURATOR_MODEL),
    );
    expect(writingCacheKey(it0)).toBe(writingCacheKey(it0, CURATOR_MODEL));
  });

  it("leaves the image keys byte-identical (every cached museum and blog score stays free)", () => {
    expect(curationCacheKey({ source: "met", sourceId: "436535" }, false)).toBe(
      "21a06fb110e52a22191e91a94ad5d127",
    );
    expect(
      curationCacheKey({ source: "thisiscolossal", sourceId: "123" }, true),
    ).toBe("2ed555412ac20fa5c2367f300d75bef8");
  });
});

describe("curateItems dispatches by type", () => {
  let bodies: {
    model: string;
    messages: { role: string; content: unknown }[];
  }[];
  beforeEach(() => {
    bodies = [];
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", (input: string | URL, init?: { body?: string }) => {
      if (!String(input).includes("openrouter.ai"))
        return Promise.resolve({ ok: false, status: 404 });
      const body = JSON.parse(init?.body ?? "{}") as (typeof bodies)[number];
      bodies.push(body);
      const writing = String(body.messages[0]?.content).includes("timeliness");
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: writing
                    ? '{"score": 9, "tags": ["odd"], "kind": "essay", "timeliness": "timeless", "topics": ["botany"]}'
                    : '{"score": 6, "tags": ["img"], "topics": ["botany"]}',
                },
              },
            ],
            usage: { total_tokens: 1 },
          }),
      });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const vocab = [{ id: "botany", label: "Botany" }];
  const body = `${"word ".repeat(460)}\n== References ==\nA citation that must not reach the model.`;

  it("sends an article to the writing curator, which always classifies — in the search lane too", async () => {
    const [out] = await curateItems(
      [makeItem({ source: "pdr", sourceId: `w-${Date.now()}`, body })],
      { force: true, topics: vocab },
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.messages[0]!.content).toBe(writingPrompt(vocab));
    expect(out).toMatchObject({
      curationScore: 9,
      aestheticTags: ["odd"],
      kind: "essay",
      timeliness: "timeless",
      topics: ["botany"],
      readingMinutes: 2,
    });
  });

  it("stores a Wikipedia piece as a curiosity whatever kind the model names (SOURCE_KINDS)", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `wk-${Date.now()}`, body })],
      { force: true, topics: vocab },
    );
    expect(out).toMatchObject({ kind: "curiosity", curationScore: 9 });
  });

  it("sends the body, its length, and no apparatus — and never an image", async () => {
    await curateItems(
      [
        makeItem({
          sourceId: `w2-${Date.now()}`,
          body,
          imageUrl: "https://example.com/lead.jpg",
        }),
      ],
      { force: true, topics: vocab },
    );
    const user = bodies[0]!.messages[1]!.content as string;
    expect(typeof user).toBe("string");
    expect(user).toContain("Length: ~460 words");
    expect(user).toContain("Text: word word");
    expect(user).not.toContain("citation");
  });

  it("uses the model it is given for writing", async () => {
    await curateItems([makeItem({ sourceId: `w3-${Date.now()}`, body })], {
      force: true,
      topics: vocab,
      writingModel: "google/gemini-2.5-flash",
    });
    expect(bodies[0]!.model).toBe("google/gemini-2.5-flash");
  });

  it("still sends an image to the image curator, unclassified outside classify mode", async () => {
    const [out] = await curateItems(
      [makeItem({ sourceId: `i-${Date.now()}`, type: "image" })],
      { force: true, topics: vocab },
    );
    expect(bodies[0]!.messages[0]!.content).toBe(CURATOR_PROMPT);
    expect(out?.topics).toEqual([]);
    expect(out?.kind).toBeUndefined();
  });
});

describe("splitNews", () => {
  const curated = (
    sourceId: string,
    over: Partial<CuratedItem>,
  ): CuratedItem => ({
    ...makeItem({ sourceId }),
    curationScore: 7,
    aestheticTags: [],
    topics: [],
    ...over,
  });

  it("drops a news piece and keeps timeless, dated and every image", () => {
    const news = curated("n", { timeliness: "news" });
    const dated = curated("d", { timeliness: "dated" });
    const img = curated("i", { type: "image" });
    const { kept, news: dropped } = splitNews([news, dated, img]);
    expect(kept).toEqual([dated, img]);
    expect(dropped).toEqual([news]);
  });
});

// What makes a calibration re-run, and `recurate:writing --confirm` after its dry run, free: a
// cached writing answer is read without any fetch, and re-validated against the vocabulary of
// the current run. `fetch` throws, so a cache miss fails loudly.
describe("curateItems reads a cached writing answer with no LLM call", () => {
  const files: string[] = [];
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", () => {
      throw new Error("fetch must not be called on a cache hit");
    });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await Promise.all(files.splice(0).map((f) => rm(f, { force: true })));
  });

  it("returns the cached verdict, reports the hit, and drops a topic no longer offered", async () => {
    const it0 = makeItem({
      source: "pdr",
      sourceId: `wcache-${Date.now()}`,
      body: "x ".repeat(300),
    });
    const file = path.join(CURATION_CACHE_DIR, `${writingCacheKey(it0)}.json`);
    await mkdir(CURATION_CACHE_DIR, { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        score: 8,
        tags: ["odd history"],
        kind: "archive",
        timeliness: "dated",
        topics: ["botany", "retired-topic"],
        overFiled: 0,
      }),
    );
    files.push(file);

    const hits: string[] = [];
    const [out] = await curateItems([it0], {
      topics: [{ id: "botany", label: "Botany" }],
      onCacheHit: (i) => hits.push(i.sourceId),
    });
    expect(hits).toEqual([it0.sourceId]);
    expect(out).toMatchObject({
      curationScore: 8,
      kind: "archive",
      timeliness: "dated",
      topics: ["botany"],
      readingMinutes: 2,
    });
  });
});
