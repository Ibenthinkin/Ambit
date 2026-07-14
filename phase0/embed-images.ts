#!/usr/bin/env bun
/**
 * Phase 0 · step 0.5 — VISUAL embeddings experiment (throwaway code, see the
 * Phase 0.5 plan + docs/BUILD_PLAN.md).
 *
 * The 0.4 verdict: text embeddings of museum items degenerate into string
 * matching, because the *text* is accession-catalog boilerplate ("Textile.
 * 18th century."). But the aesthetic — palette, composition, mood, the thing
 * old-Tumblr curators actually selected on — lives in the IMAGE, which the
 * text pipeline never looks at. This script tests whether image embeddings
 * capture that vibe where text couldn't.
 *
 * Provider: Voyage AI `voyage-multimodal-3.5` (researched 07-13-26):
 *  - up to 1,000 inputs per request → the whole corpus is a handful of calls,
 *  - text and images share ONE vector space → a text query ("quiet interior,
 *    muted palette") can hit images later, which is exactly the seam the
 *    favorites-prompt cold start would want,
 *  - free tier (150B pixels) covers this corpus many times over.
 *
 * Images are downloaded locally and sent as BASE64, not as URLs. The first run
 * passed URLs and crawled for hours: AIC's IIIF server bot-blocks Voyage's
 * fetcher (HTTP 400 per batch), so every batch containing an AIC image — i.e.
 * nearly all of them — failed wholesale and fell back to item-by-item retry
 * grind. Same trap and same fix as curate.ts's LLM image judging.
 *
 * Progress checkpoints to the output file every few batches, and a restart
 * resumes from whatever is already embedded — a kill never loses hours again.
 *
 *   bun run phase0/embed-images.ts           # resumes any partial progress
 *   bun run phase0/embed-images.ts --force   # re-embed everything from scratch
 *
 * Reads  phase0/items.curated.json  (curation survivors — no cents spent on
 *                                    items the structural floor already killed)
 * Writes phase0/vectors/voyage-multimodal--visual.json  (same shape as embed.ts
 *                                    sets, so build-explore.ts can add it as a column)
 *
 * Needs VOYAGE_API_KEY (Bun auto-loads .env; free key at dash.voyageai.com).
 */

const ITEMS_FILE = new URL("./items.curated.json", import.meta.url).pathname;
const OUT_DIR = new URL("./vectors/", import.meta.url).pathname;
const OUT_FILE = `${OUT_DIR}voyage-multimodal--visual.json`;
const FORCE = process.argv.includes("--force");

const VOYAGE_URL = "https://api.voyageai.com/v1/multimodalembeddings";
const API_KEY = process.env.VOYAGE_API_KEY;
const MODEL = "voyage-multimodal-3.5";
/** Voyage allows 1,000 inputs/request, but base64 payloads are big (~250KB per
 *  ~800px JPEG) — 24 keeps each request a few MB and any one failure cheap. */
const BATCH_SIZE = 24;
/** Write partial vectors to disk this often (in batches). */
const CHECKPOINT_EVERY = 8;

interface Item {
  source: string;
  sourceId: string;
  type: "image" | "article";
  imageUrl: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch an image ourselves and return a base64 data URL, or null if dead.
 * Same helper as curate.ts and for the same reason: museum image servers
 * bot-block third-party fetchers, so we hand the provider bytes, not URLs.
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
 * Voyage's multimodal request wraps every input in a `content` array (an input
 * can mix text and image parts; ours are image-only). `input_type: "document"`
 * marks these as the corpus side of retrieval — queries would use "query".
 */
async function embedBatch(dataUrls: string[]): Promise<{ embeddings: number[][]; pixels: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          inputs: dataUrls.map((d) => ({ content: [{ type: "image_base64", image_base64: d }] })),
          input_type: "document",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json: any = await res.json();
      // Sort by index rather than trusting response order — same silent-data-
      // corruption insurance as embed.ts.
      const embeddings: number[][] = (json.data ?? [])
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
      if (embeddings.length !== dataUrls.length)
        throw new Error(`asked for ${dataUrls.length} embeddings, got ${embeddings.length}`);
      return { embeddings, pixels: json.usage?.image_pixels ?? 0 };
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

// ── run ─────────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error("VOYAGE_API_KEY is not set — add it to .env (free key at dash.voyageai.com).");
  process.exit(1);
}

const items: Item[] = await Bun.file(ITEMS_FILE).json();
// Only items with an image can have a visual vector; articles keep text-only.
const imageItems = items.filter((i) => i.type === "image" && i.imageUrl);

// Resume: anything already in the output file (a finished run OR a checkpoint
// from an interrupted one) is skipped unless --force.
const vectors: Record<string, number[]> = {};
let totalPixels = 0;
if (!FORCE && (await Bun.file(OUT_FILE).exists())) {
  const prev = await Bun.file(OUT_FILE).json();
  Object.assign(vectors, prev.vectors ?? {});
  totalPixels = prev.imagePixels ?? 0;
}
const todo = imageItems.filter((i) => !vectors[`${i.source}:${i.sourceId}`]);
console.log(
  `Embedding ${todo.length} images via ${MODEL} ` +
    `(${imageItems.length} total, ${imageItems.length - todo.length} already on disk)…`,
);

const failures: string[] = [];
const t0 = performance.now();

async function writeOut() {
  const dim = Object.values(vectors)[0]?.length ?? 0;
  await Bun.write(
    OUT_FILE,
    JSON.stringify({
      model: MODEL,
      recipe: "visual",
      dim,
      items: Object.keys(vectors).length,
      imagePixels: totalPixels,
      createdAt: new Date().toISOString(),
      vectors,
    }),
  );
}

for (let i = 0; i < todo.length; i += BATCH_SIZE) {
  const batch = todo.slice(i, i + BATCH_SIZE);
  // Download the whole batch in parallel; dead images drop out here (logged)
  // instead of poisoning the API request.
  const downloads = await Promise.all(batch.map((b) => imageAsDataUrl(b.imageUrl!)));
  const alive = batch.filter((_, j) => downloads[j] !== null);
  const dataUrls = downloads.filter((d): d is string => d !== null);
  for (const [j, b] of batch.entries())
    if (downloads[j] === null) failures.push(`${b.source}:${b.sourceId} — image unreachable`);

  if (alive.length) {
    try {
      const { embeddings, pixels } = await embedBatch(dataUrls);
      embeddings.forEach((vec, j) => {
        vectors[`${alive[j].source}:${alive[j].sourceId}`] = vec.map(round6);
      });
      totalPixels += pixels;
    } catch (err) {
      // With downloads pre-validated a batch failure is rare (one corrupt or
      // oversized image); one-by-one recovery costs 24 requests, not 128.
      console.warn(`  batch at ${i} failed (${err}) — retrying items individually…`);
      for (const [j, b] of alive.entries()) {
        try {
          const { embeddings, pixels } = await embedBatch([dataUrls[j]]);
          vectors[`${b.source}:${b.sourceId}`] = embeddings[0].map(round6);
          totalPixels += pixels;
        } catch (innerErr) {
          failures.push(`${b.source}:${b.sourceId} — ${innerErr}`);
        }
      }
    }
  }

  const done = Math.min(i + BATCH_SIZE, todo.length);
  if ((i / BATCH_SIZE) % CHECKPOINT_EVERY === CHECKPOINT_EVERY - 1 || done === todo.length) {
    await writeOut(); // checkpoint — a kill from here loses at most a few batches
    console.log(`  … ${done}/${todo.length} (checkpointed, ${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  } else {
    console.log(`  … ${done}/${todo.length}`);
  }
}

await writeOut();
const dim = Object.values(vectors)[0]?.length ?? 0;
console.log(
  `✓  ${Object.keys(vectors).length} visual vectors · ${dim}-dim · ` +
    `${(totalPixels / 1e6).toFixed(1)}M pixels · ${((performance.now() - t0) / 1000).toFixed(1)}s → ${OUT_FILE.split("/phase0/")[1]}`,
);
if (failures.length) console.log(`failed items (${failures.length}):\n  ${failures.join("\n  ")}`);
