// The writing curator (docs/DESIGN_writing.md D1, docs/PLAN_writing.md Phase 1): the floor,
// the parser, the cache key and the dispatch by type. Network-free — the dispatch tests stub
// `fetch` the way curator.test.ts does.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAUDE_JUDGE_MODEL,
  claudeRuntime,
  resetClaudeJudge,
} from "./claude-judge";
import {
  CURATION_CACHE_DIR,
  curateItems,
  curationCacheKey,
  CURATOR_MODEL,
  CURATOR_PROMPT,
  parseWritingResponse,
  WRITING_PROMPT,
  WRITING_PROMPT_VERSION,
  writingAsText,
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

  // Writing Phase 5: a publication ships its full text for scoring only (`curationText`), and
  // keeps `body` NULL — a link card never displays it. The floor reads it all the same.
  it("reads curationText when there is no body, so a publication's short dek survives", () => {
    const ok = makeItem({
      source: "themarginalian",
      summary: "Short dek.",
      curationText: text(WRITING_MIN_CHARS + 50),
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

describe("writingAsText — curationText", () => {
  it("scores a publication on its full text, and sends the dek as the summary", () => {
    const out = writingAsText(
      makeItem({
        summary: "The dek.",
        curationText: "The whole essay, never stored.",
      }),
    );
    expect(out).toContain("Text: The whole essay, never stored.");
    expect(out).toContain("Summary: The dek.");
  });

  it("prefers a stored body to curationText", () => {
    const out = writingAsText(
      makeItem({ body: "The body.", curationText: "Not this." }),
    );
    expect(out).toContain("Text: The body.");
    expect(out).not.toContain("Not this.");
  });
});

describe("parseWritingResponse", () => {
  const ids = new Set(["botany", "zoology", "maps", "myth"]);

  it("reads score, tags, kind and known topics, and ignores timeliness", () => {
    const out = parseWritingResponse(
      '{"score": 8, "tags": ["Odd History", "x"], "kind": "curiosity", "timeliness": "dated", "topics": ["botany", "invented"]}',
      { topicIds: ids },
    );
    expect(out).toEqual({
      score: 8,
      tags: ["odd history", "x"],
      kind: "curiosity",
      topics: ["botany"],
      overFiled: 0,
    });
  });

  it("turns an unknown kind into null", () => {
    const out = parseWritingResponse(
      '{"score": 5, "tags": [], "kind": "listicle", "timeliness": "evergreen"}',
      { topicIds: ids },
    );
    expect(out.kind).toBeNull();
  });

  // Ben dropped the news rule 09-30-26: he keeps news out by choosing sources. The prompt still
  // asks (it is the cache key), and a `news` answer is scored like any other.
  it("keeps a piece the model called news at its own score", () => {
    const out = parseWritingResponse(
      '{"score": 7, "tags": ["film"], "kind": "criticism", "timeliness": "news", "topics": []}',
      { topicIds: ids },
    );
    expect(out.score).toBe(7);
    expect(out).not.toHaveProperty("timeliness");
  });

  it("caps topics at three and counts the rest", () => {
    const out = parseWritingResponse(
      '{"score": 5, "tags": [], "kind": "essay", "timeliness": "news", "topics": ["botany", "zoology", "maps", "myth"]}',
      { topicIds: ids },
    );
    expect(out.topics).toEqual(["botany", "zoology", "maps"]);
    expect(out.overFiled).toBe(1);
  });

  it("rejects an unusable score, like the image parser", () => {
    expect(() =>
      parseWritingResponse('{"score": 0, "kind": "essay"}', { topicIds: ids }),
    ).toThrow(/bad curator score/);
  });
});

describe("writing prompt", () => {
  // The timeliness verdicts are asked for and ignored: the prompt text is the cache key, so it
  // stays byte-identical until the prompt changes for a reason of its own (see WRITING_PROMPT).
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
      topics: ["botany"],
      readingMinutes: 2,
    });
  });

  it("counts a publication's reading time from its curationText", async () => {
    const [out] = await curateItems(
      [
        makeItem({
          source: "themarginalian",
          sourceId: `ct-${Date.now()}`,
          curationText: "word ".repeat(700),
        }),
      ],
      { force: true, topics: vocab },
    );
    expect(out).toMatchObject({ readingMinutes: 4 });
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

  // The cached file carries `timeliness`, as every answer production holds does — it must read.
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
      topics: ["botany"],
      readingMinutes: 2,
    });
    expect(out).not.toHaveProperty("timeliness");
  });
});

describe("the writing curator on the Claude judge", () => {
  const realRun = claudeRuntime.run;
  let systems: string[];
  beforeEach(() => {
    systems = [];
    resetClaudeJudge();
    vi.stubEnv("CURATOR_JUDGE", "claude");
    vi.stubGlobal("fetch", () =>
      Promise.reject(new Error("no HTTP call is expected")),
    );
    claudeRuntime.run = (args) => {
      systems.push(args[args.indexOf("--system-prompt") + 1] ?? "");
      return Promise.resolve({
        code: 0,
        stdout: JSON.stringify({
          type: "result",
          is_error: false,
          result:
            '```json\n{"score": 9, "tags": ["odd"], "kind": "essay", "timeliness": "timeless", "topics": ["botany"]}\n```',
          usage: { input_tokens: 2000, output_tokens: 30 },
        }),
        stderr: "",
      });
    };
  });
  afterEach(() => {
    claudeRuntime.run = realRun;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads a fenced writing reply: score, kind and topics", async () => {
    const [out] = await curateItems(
      [
        makeItem({
          source: "pdr",
          sourceId: `cw-${Date.now()}`,
          body: "word ".repeat(460),
        }),
      ],
      { force: true, topics: [{ id: "botany", label: "Botany" }] },
    );
    expect(out?.curationScore).toBe(9);
    expect(out?.kind).toBe("essay");
    expect(out?.topics).toEqual(["botany"]);
    expect(systems[0]).toContain("timeliness");
  });

  it("an explicit writingModel overrides the env's judge", () => {
    expect(writingCacheKey({ source: "pdr", sourceId: "1" })).toBe(
      writingCacheKey({ source: "pdr", sourceId: "1" }, CLAUDE_JUDGE_MODEL),
    );
  });
});
