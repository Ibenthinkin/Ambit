#!/usr/bin/env bun
/**
 * Phase 0 · step 0.3 — embed the harvested sample (throwaway code, see docs/BUILD_PLAN.md).
 *
 * Embeds phase0/items.json through OpenRouter (POST /api/v1/embeddings, batched
 * array input) as 2 models × 2 summary recipes = 4 vector sets, one JSON file
 * each under phase0/vectors/ for step 0.4's side-by-side eyeball harness.
 *
 * Recipes exist because 0.2 found the embedding *text* is a bigger lever than
 * the model: museum summaries are catalogue fields (artist/date/medium) with
 * the subject buried in the tags. Recipe B pulls the tags forward.
 *
 * Also probes whether OpenRouter honors OpenAI's `dimensions` param, which
 * decides if the 1536-dim model can be shortened before the VECTOR(n) column
 * is locked in.
 *
 *   bun run phase0/embed.ts           # skips vector sets already on disk
 *   bun run phase0/embed.ts --force   # re-embed everything
 *
 * Needs OPENROUTER_API_KEY (Bun auto-loads .env).
 */

import { mkdir } from "node:fs/promises";

const ITEMS_FILE = new URL("./items.json", import.meta.url).pathname;
const OUT_DIR = new URL("./vectors/", import.meta.url).pathname;
const FORCE = process.argv.includes("--force");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/embeddings";
const API_KEY = process.env.OPENROUTER_API_KEY;
const BATCH_SIZE = 100;

interface Item {
  source: string;
  sourceId: string;
  title: string;
  summary: string;
  tags: string[];
}

const MODELS = [
  { id: "openai/text-embedding-3-small", expectedDim: 1536 },
  { id: "baai/bge-m3", expectedDim: 1024 },
] as const;

/**
 * What actually gets embedded — the lever 0.2 said to keep swappable.
 *  A: title + summary exactly as harvested (catalogue fields lead for museum items).
 *  B: subject-first — tags between title and summary, so medium/department
 *     can't dominate the vector.
 */
const RECIPES = {
  A: (i: Item) => `${i.title}\n${i.summary}`,
  B: (i: Item) => [i.title, i.tags.join(", "), i.summary].filter(Boolean).join("\n"),
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(model: string, input: string[], extra: Record<string, unknown> = {}) {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input, ...extra }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json: any = await res.json();
      const embeddings: number[][] = (json.data ?? [])
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
      if (embeddings.length !== input.length)
        throw new Error(`asked for ${input.length} embeddings, got ${embeddings.length}`);
      return { embeddings, usage: json.usage ?? null };
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

async function embedSet(items: Item[], model: (typeof MODELS)[number], recipe: keyof typeof RECIPES) {
  const outFile = `${OUT_DIR}${model.id.split("/")[1]}--${recipe}.json`;
  const label = `${model.id} × recipe ${recipe}`;

  if (!FORCE && (await Bun.file(outFile).exists())) {
    console.log(`⏭  ${label} — already on disk (--force to redo)`);
    return;
  }

  const texts = items.map(RECIPES[recipe]);
  const vectors: Record<string, number[]> = {};
  let promptTokens = 0;
  const t0 = performance.now();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings, usage } = await embedBatch(model.id, batch);
    embeddings.forEach((vec, j) => {
      const item = items[i + j];
      vectors[`${item.source}:${item.sourceId}`] = vec.map(round6);
    });
    promptTokens += usage?.prompt_tokens ?? 0;
  }

  const ms = Math.round(performance.now() - t0);
  const dim = Object.values(vectors)[0]?.length ?? 0;
  if (dim !== model.expectedDim)
    console.warn(`⚠️  ${label}: got ${dim}-dim vectors, expected ${model.expectedDim}`);

  await Bun.write(
    outFile,
    JSON.stringify({
      model: model.id,
      recipe,
      dim,
      items: Object.keys(vectors).length,
      promptTokens,
      elapsedMs: ms,
      createdAt: new Date().toISOString(),
      vectors,
    }),
  );
  console.log(
    `✓  ${label} — ${Object.keys(vectors).length} vectors · ${dim}-dim · ` +
      `${promptTokens} tokens · ${(ms / 1000).toFixed(1)}s → ${outFile.split("/phase0/")[1]}`,
  );
}

/** Does OpenRouter pass OpenAI's `dimensions` param through? Decides if 1536 can shrink. */
async function probeDimensions() {
  try {
    const { embeddings } = await embedBatch(
      "openai/text-embedding-3-small",
      ["dimensions probe"],
      { dimensions: 512 },
    );
    const got = embeddings[0].length;
    console.log(
      got === 512
        ? "🔎 dimensions probe: HONORED — asked 512, got 512. 1536 can be shortened."
        : `🔎 dimensions probe: IGNORED — asked 512, got ${got}. Take 1536 as-is or slice+renormalize ourselves.`,
    );
  } catch (err) {
    console.log(`🔎 dimensions probe: request REJECTED (${err}). Param unsupported.`);
  }
}

if (!API_KEY) {
  console.error("OPENROUTER_API_KEY is not set — add it to .env (see .env.example).");
  process.exit(1);
}

const items: Item[] = await Bun.file(ITEMS_FILE).json();
await mkdir(OUT_DIR, { recursive: true });
console.log(`Embedding ${items.length} items · ${MODELS.length} models × ${Object.keys(RECIPES).length} recipes\n`);

for (const model of MODELS)
  for (const recipe of Object.keys(RECIPES) as (keyof typeof RECIPES)[])
    await embedSet(items, model, recipe);

await probeDimensions();
