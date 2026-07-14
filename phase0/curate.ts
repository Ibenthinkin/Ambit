#!/usr/bin/env bun
/**
 * Phase 0 · step 0.5 — curate the harvested corpus (throwaway code, see the
 * Phase 0.5 plan + docs/BUILD_PLAN.md).
 *
 * The 0.4 verdict established that the corpus, not the ranking function, is
 * what makes the feed feel good — a random draw over a pool where 67 items are
 * titled "textile" can't feel curated no matter how clever the recommender is.
 * This script is the "taste layer": it turns the raw harvest into the pool the
 * feed prototype actually draws from.
 *
 * Two stages:
 *   1. STRUCTURAL (free, always runs) — drop catalog noise: duplicated titles,
 *      bare-noun titles, summaries with no signal. Pure heuristics.
 *   2. LLM (cents, cached) — a cheap vision model plays the role of the human
 *      curators old Tumblr had: every survivor gets a 1–10 "would a great
 *      art-blog curator post this?" score plus a few aesthetic tags. Image
 *      items are judged by *looking at the image*, not at their catalog
 *      boilerplate — judging visual interest from "Textile. 18th century."
 *      would just be the 0.4 string-matching trap again.
 *
 *   bun run phase0/curate.ts              # both stages (LLM calls cached)
 *   bun run phase0/curate.ts --skip-llm   # structural stage only
 *   bun run phase0/curate.ts --force      # ignore the LLM cache, re-score all
 *   bun run phase0/curate.ts --sample 40  # LLM-score a random 40 only (probe a
 *                                         # prompt/model change cheaply before
 *                                         # committing to the full corpus)
 *
 * Reads  phase0/items.json          (the raw harvest)
 * Writes phase0/items.curated.json  (survivors + curationScore + aestheticTags)
 *
 * Needs OPENROUTER_API_KEY for the LLM stage (Bun auto-loads .env).
 */

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

const ITEMS_FILE = new URL("./items.json", import.meta.url).pathname;
const OUT_FILE = new URL("./items.curated.json", import.meta.url).pathname;
// LLM responses cache here, one file per item — same cache-aside pattern as
// harvest.ts, so tweaking anything downstream never re-buys the same scores.
const CACHE_DIR = new URL("./.cache-curate/", import.meta.url).pathname;

const SKIP_LLM = process.argv.includes("--skip-llm");
const FORCE = process.argv.includes("--force");
const sampleIdx = process.argv.indexOf("--sample");
const SAMPLE_N = sampleIdx > -1 ? Number(process.argv[sampleIdx + 1]) : null;

// ── the LLM curator ─────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Cheap, vision-capable, fast — the job is thousands of tiny judgments, not
 * deep reasoning. Swappable on purpose: if the scores feel wrong in the feed
 * prototype, trying a different judge is a one-line change + re-run (the cache
 * key includes the model, so old scores aren't clobbered).
 */
const CURATOR_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Bump this when the prompt changes — it's part of the cache key, so a new
 * prompt version invalidates exactly the responses it should and nothing else.
 */
const PROMPT_VERSION = 1;

/** How many curator calls run at once. Chat completions are per-item (no batch
 *  endpoint), so we recover throughput with a small concurrency pool instead. */
const CONCURRENCY = 8;

/**
 * The persona is the product spec in miniature. Ambit is chasing the feel of
 * the old Tumblr art blogs — human curators with a strong point of view who
 * surfaced the striking 1% and skipped the filler. The prompt asks the model
 * to *be* that person. (Calibration knob for Ben: the taste description below
 * is where reference blogs / example links would get distilled to.)
 */
const CURATOR_PROMPT = `You are the curator of a beloved, long-running art and ideas blog — the kind people used to follow on old Tumblr because every single post was worth stopping for. Your taste: visually striking or quietly beautiful images (strong composition, texture, color, oddness, wit); ideas and stories with a genuine spark of "huh, I never knew that". You post museum objects, illustrations, diagrams, photographs, and short articles. You are highly selective: most things a museum digitizes are catalog filler — fragments, routine studio shots, objects with no visual or intellectual hook — and you skip them without guilt. You never post anything sensational, gory, or engagement-baity.

Rate the following item for your blog on a 1-10 scale:
  1-3  = filler; you would scroll past it (fragments, routine catalog shots, dull or context-free)
  4-6  = fine but forgettable; post only on a slow day
  7-8  = good; a solid post your followers would enjoy
  9-10 = exceptional; the kind of find your blog is known for

Also give 2-4 short lowercase aesthetic tags describing its look or appeal (e.g. "botanical plate", "hand-lettered", "brutalist", "lurid palette", "quiet portrait", "strange diagram").

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."]}`;

// ── shapes ──────────────────────────────────────────────────────────────────

/** Matches harvest.ts's Item; `source` is a plain string so new sources don't break this file. */
interface Item {
  source: string;
  sourceId: string;
  type: "image" | "article";
  title: string;
  summary: string;
  imageUrl: string | null;
  sourceUrl: string;
  tags: string[];
  attribution: string;
  license: string;
  topic: string;
}

/** What this script adds. The feed prototype treats the score threshold as a knob. */
interface CuratedItem extends Item {
  curationScore: number;
  aestheticTags: string[];
}

// ── stage 1: structural quality floor ───────────────────────────────────────

/**
 * Titles are compared in a normalized form so "Textile", "textile " and
 * "Textile." all count as the same title — the duplicates 0.4 found were
 * exact-after-normalization, not fuzzy.
 */
const normTitle = (t: string) =>
  t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();

/**
 * The three drop rules, each mapped to a 0.4 finding:
 *  - dup-title: 580 of 3168 items sat on a literally duplicated title. Items
 *    sharing a normalized title with >2 others are interchangeable catalog
 *    stubs; picking one to keep would be arbitrary, so all of them go.
 *  - bare-title: a museum image titled with a single noun ("Bowl", "Fragment")
 *    has nothing to say for itself. Scoped to image items — a one-word
 *    Wikipedia title ("Astronomy") fronts a rich article and is fine.
 *  - thin-summary: below ~60 chars a museum summary is just a department name;
 *    there is no signal for the embedding, the curator LLM, or the reader.
 */
function structuralPass(items: Item[]) {
  const titleCounts = new Map<string, number>();
  for (const item of items) {
    const key = normTitle(item.title);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const kept: Item[] = [];
  // Per-rule drop counts, plus per source × topic so the report shows where
  // the losses land (0.4 predicted: lopsidedly on the museums).
  const drops = { "dup-title": 0, "bare-title": 0, "thin-summary": 0 };
  const dropsBySourceTopic = new Map<string, number>();

  for (const item of items) {
    const rule =
      (titleCounts.get(normTitle(item.title)) ?? 0) > 2 ? "dup-title"
      : item.type === "image" && normTitle(item.title).split(" ").length <= 1 ? "bare-title"
      : item.summary.trim().length < 60 ? "thin-summary"
      : null;

    if (rule === null) {
      kept.push(item);
    } else {
      drops[rule]++;
      const key = `${item.source}:${item.topic}`;
      dropsBySourceTopic.set(key, (dropsBySourceTopic.get(key) ?? 0) + 1);
    }
  }
  return { kept, drops, dropsBySourceTopic };
}

// ── stage 2: LLM curation ───────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything the curator gets to read (the image travels separately). */
function itemAsText(item: Item): string {
  return [
    `Type: ${item.type}`,
    `Title: ${item.title}`,
    item.tags.length ? `Tags: ${item.tags.slice(0, 12).join(", ")}` : null,
    `Text: ${item.summary}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Fetch an image and return it as a base64 data URL, or null if unreachable.
 *
 * Why we download instead of passing the URL through: the 40-item probe found
 * AIC's IIIF server 403s the provider's server-side fetcher (fine in a browser
 * — it's bot-blocking), and one Met URL contains literal spaces the provider
 * rejects as malformed. Fetching ourselves sidesteps every provider-fetcher
 * quirk at the cost of local bandwidth, which is free.
 */
async function imageAsDataUrl(url: string): Promise<string | null> {
  for (const candidate of [url, encodeURI(url)]) {
    try {
      const res = await fetch(candidate, { headers: { "User-Agent": "AmbitPhase0/0.1" } });
      if (!res.ok) continue;
      const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      if (!mime.startsWith("image/")) continue;
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return `data:${mime};base64,${b64}`;
    } catch {
      // try the encoded variant, then give up
    }
  }
  return null;
}

/**
 * One curator call for one item. Image items are judged by the image itself,
 * downloaded locally and inlined as base64 (see imageAsDataUrl). If the image
 * can't be fetched, the curator judges on text alone rather than failing —
 * a missing thumbnail shouldn't null out an item's score.
 */
async function scoreItem(item: Item): Promise<{ score: number; tags: string[]; tokens: number }> {
  const cacheKey = createHash("sha256")
    .update(`${CURATOR_MODEL}|v${PROMPT_VERSION}|${item.source}:${item.sourceId}`)
    .digest("hex")
    .slice(0, 32);
  const cacheFile = `${CACHE_DIR}${cacheKey}.json`;

  if (!FORCE) {
    const cached = Bun.file(cacheFile);
    if (await cached.exists()) return { ...(await cached.json()), tokens: 0 };
  }

  // Multimodal chat messages take an ARRAY of content parts (text + images)
  // instead of a plain string — this is the standard OpenAI-compatible shape.
  const content: any[] = [{ type: "text", text: itemAsText(item) }];
  if (item.type === "image" && item.imageUrl) {
    const dataUrl = await imageAsDataUrl(item.imageUrl);
    if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl } });
    else content[0].text += "\n(The image could not be fetched — judge from the text alone.)";
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CURATOR_MODEL,
          messages: [
            { role: "system", content: CURATOR_PROMPT },
            { role: "user", content },
          ],
          // Asks the provider to guarantee syntactically valid JSON output.
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json: any = await res.json();
      const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");

      // Trust nothing: clamp the score into range, coerce tags to strings.
      const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score) || 0)));
      if (!Number.isFinite(score) || Number(parsed.score) <= 0) throw new Error(`bad score: ${JSON.stringify(parsed).slice(0, 100)}`);
      const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
        .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t: string) => t.trim().toLowerCase())
        .slice(0, 4);

      const result = { score, tags };
      await Bun.write(cacheFile, JSON.stringify(result));
      return { ...result, tokens: json.usage?.total_tokens ?? 0 };
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

/**
 * A hand-rolled concurrency pool: CONCURRENCY workers pull the next index off
 * a shared counter until items run out. This is the zero-dependency stand-in
 * for p-limit — the shared `next` counter is safe because JS is single-threaded;
 * "parallel" here means overlapping network waits, not threads.
 */
async function scoreAll(items: Item[]): Promise<CuratedItem[]> {
  const out: CuratedItem[] = new Array(items.length);
  let next = 0;
  let done = 0;
  let failed = 0;
  let tokens = 0;
  const t0 = performance.now();

  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      try {
        const { score, tags, tokens: t } = await scoreItem(item);
        out[i] = { ...item, curationScore: score, aestheticTags: tags };
        tokens += t;
      } catch (err) {
        // A failed judgment gets a neutral score rather than silently vanishing
        // from the corpus — and it's logged so a systemic failure is visible.
        console.warn(`  ⚠️  ${item.source}:${item.sourceId} "${item.title.slice(0, 40)}" — ${err}`);
        out[i] = { ...item, curationScore: 5, aestheticTags: [] };
        failed++;
      }
      if (++done % 250 === 0)
        console.log(`  … ${done}/${items.length} scored (${Math.round(performance.now() - t0) / 1000}s)`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `  scored ${done} items · ${failed} failures (given neutral 5) · ` +
      `${tokens} tokens billed this run · ${((performance.now() - t0) / 1000).toFixed(0)}s`,
  );
  return out;
}

// ── report helpers ──────────────────────────────────────────────────────────

function reportStructural(before: Item[], result: ReturnType<typeof structuralPass>) {
  const line = "─".repeat(72);
  const { kept, drops, dropsBySourceTopic } = result;
  console.log(`\n${line}\nStage 1 — structural floor: ${before.length} → ${kept.length}\n${line}`);
  for (const [rule, n] of Object.entries(drops)) console.log(`  ${rule.padEnd(14)} dropped ${n}`);

  // The ten hardest-hit source:topic buckets — the report exists to answer
  // "did any topic just lose its whole corpus?" at a glance.
  const worst = [...dropsBySourceTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`  worst-hit buckets:`);
  for (const [key, n] of worst) console.log(`    ${key.padEnd(28)} -${n}`);

  // Survivors per source, so thin sources are visible before the LLM spends on them.
  const bySource = new Map<string, number>();
  for (const i of kept) bySource.set(i.source, (bySource.get(i.source) ?? 0) + 1);
  console.log(`  survivors: ${[...bySource.entries()].map(([s, n]) => `${s} ${n}`).join(" · ")}`);
}

function reportScores(items: CuratedItem[]) {
  const line = "─".repeat(72);
  console.log(`\n${line}\nStage 2 — curator score distribution\n${line}`);
  const hist = new Map<number, number>();
  for (const i of items) hist.set(i.curationScore, (hist.get(i.curationScore) ?? 0) + 1);
  for (let s = 1; s <= 10; s++) {
    const n = hist.get(s) ?? 0;
    console.log(`  ${String(s).padStart(2)}  ${"█".repeat(Math.ceil((n / items.length) * 120)).padEnd(30)} ${n}`);
  }

  const sorted = [...items].sort((a, b) => b.curationScore - a.curationScore);
  console.log(`  top of the pile:`);
  for (const i of sorted.slice(0, 5))
    console.log(`    ${i.curationScore}  [${i.source}] ${i.title.slice(0, 56)} (${i.aestheticTags.join(", ")})`);
  console.log(`  bottom of the pile:`);
  for (const i of sorted.slice(-5))
    console.log(`    ${i.curationScore}  [${i.source}] ${i.title.slice(0, 56)}`);
}

// ── run ─────────────────────────────────────────────────────────────────────

const raw: Item[] = await Bun.file(ITEMS_FILE).json();
console.log(`Curating ${raw.length} harvested items…`);

const structural = structuralPass(raw);
reportStructural(raw, structural);

let curated: CuratedItem[];
if (SKIP_LLM) {
  // Structural-only mode still writes a valid curated file (neutral scores) so
  // downstream scripts can run before the LLM pass has been paid for.
  curated = structural.kept.map((i) => ({ ...i, curationScore: 5, aestheticTags: [] }));
  console.log(`\nStage 2 skipped (--skip-llm) — all survivors written with neutral score 5.`);
} else {
  if (!API_KEY) {
    console.error("OPENROUTER_API_KEY is not set — add it to .env, or run with --skip-llm.");
    process.exit(1);
  }
  await mkdir(CACHE_DIR, { recursive: true });
  // --sample mode: score a random slice, write ONLY that slice to the output
  // (marked in the console) — a cheap dry run for prompt/model changes.
  const toScore = SAMPLE_N
    ? [...structural.kept].sort(() => Math.random() - 0.5).slice(0, SAMPLE_N)
    : structural.kept;
  console.log(`\nStage 2 — ${CURATOR_MODEL} judging ${toScore.length} items (prompt v${PROMPT_VERSION}, ${CONCURRENCY}-wide)${SAMPLE_N ? " — SAMPLE RUN, output is partial" : ""}…`);
  curated = await scoreAll(toScore);
  reportScores(curated);
}

await Bun.write(OUT_FILE, JSON.stringify(curated, null, 2));
console.log(`\n${curated.length} curated items → ${OUT_FILE}`);
