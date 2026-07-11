#!/usr/bin/env bun
/**
 * Phase 0 · step 0.2 — sample harvester (throwaway code, see docs/BUILD_PLAN.md).
 *
 * Pulls a few hundred raw items from Wikipedia + Met + Art Institute of Chicago
 * across the topic seeds below, normalizes them to a minimal common shape, and
 * dumps them to phase0/items.json for steps 0.3 (embed) and 0.4 (eyeball).
 *
 * Zero dependencies: Bun's fetch + fs only. Responses are cached under
 * phase0/.cache/ so re-runs (and 0.3/0.4 iteration) don't re-hit the APIs.
 *
 *   bun run phase0/harvest.ts            # cached where possible
 *   bun run phase0/harvest.ts --no-cache # force live fetches
 */

/*
 * ── If you're rusty on modern JS/TS, this file is a decent tour ──────────────
 * Things that changed while you were away, all used below:
 *  - Bun executes TypeScript directly — no compile step, no webpack/babel. This
 *    file is just a script: it runs top to bottom, and top-level `await` is
 *    legal in ES modules (no more wrapping everything in an async main()).
 *  - `fetch()` is built into the runtime now (no axios/request needed), and
 *    `Bun.file()` / `Bun.write()` are Bun's promise-based file I/O.
 *  - Syntax to notice: optional chaining `a?.b`, nullish coalescing `a ?? b`
 *    and its assignment form `a ??= b`, spread `[...set]`, and string-literal
 *    union types (`"image" | "article"`) instead of enums.
 *  - Patterns to notice: cache-aside fetching (getJson), retry with exponential
 *    backoff + jitter, per-host politeness delays, and normalizing three very
 *    different APIs into one shape — the seed of the real app's SourceAdapter
 *    interface (SPEC §6.1).
 */

// Bun ships Node's standard library; the `node:` prefix is the modern, explicit
// way to import from it (distinguishes stdlib from npm packages of the same name).
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

const PER_SOURCE_PER_TOPIC = 75;
// ES modules have no `__dirname`; `import.meta.url` is the module's own file URL,
// so `new URL(relative, import.meta.url)` resolves paths relative to THIS FILE
// rather than wherever the process happened to be launched from.
const CACHE_DIR = new URL("./.cache/", import.meta.url).pathname;
const OUT_FILE = new URL("./items.json", import.meta.url).pathname;
// Poor-man's flag parsing — fine for a script with one boolean flag.
const USE_CACHE = !process.argv.includes("--no-cache");

// Public-API etiquette: identify your bot with a project URL + contact email.
// Wikipedia's API policy asks for this explicitly, and it's the difference
// between "rate-limited politely" and "blocked as an anonymous scraper".
const USER_AGENT =
  "AmbitPhase0/0.1 (https://github.com/bentraverse/ambit; benjamin.reilly@gmail.com)";

/** The minimal Phase-0 shape. The real app's NormalizedItem lives in SPEC §5.1. */
interface Item {
  source: "wikipedia" | "met" | "aic";
  sourceId: string;
  type: "image" | "article";
  title: string;
  summary: string;
  imageUrl: string | null;
  sourceUrl: string;
  tags: string[];
  attribution: string;
  license: string;
  /** Which topic seed surfaced this item — 0.4 uses it to label cross-source jumps. */
  topic: string;
}

/**
 * Eight seeds spanning the onboarding chip range. Museums index by object
 * vocabulary, not concept, so they get concrete nouns where the topic is abstract.
 */
const TOPICS: { topic: string; wikipedia: string; met: string; aic: string }[] = [
  { topic: "Astronomy", wikipedia: "astronomy", met: "astronomy", aic: "astronomy" },
  { topic: "Botany", wikipedia: "botany", met: "botanical", aic: "botanical" },
  { topic: "Machines", wikipedia: "machine", met: "machine", aic: "machinery" },
  { topic: "Mythology", wikipedia: "mythology", met: "mythology", aic: "mythology" },
  { topic: "The ocean", wikipedia: "ocean", met: "ocean", aic: "sea" },
  { topic: "Typography", wikipedia: "typography", met: "typography", aic: "typography" },
  { topic: "Ancient history", wikipedia: "ancient history", met: "ancient", aic: "ancient" },
  { topic: "Poetry", wikipedia: "poetry", met: "poetry", aic: "poetry" },
  // Added for the scaled 0.4 re-run (07-10-26): more topics, same object-vocabulary
  // rule from 0.2 — museums index nouns, not abstractions.
  { topic: "Architecture", wikipedia: "architecture", met: "architecture", aic: "architecture" },
  { topic: "Music", wikipedia: "music", met: "musical instrument", aic: "musical instrument" },
  { topic: "Textiles", wikipedia: "textile", met: "textile", aic: "textile" },
  { topic: "Cartography", wikipedia: "cartography", met: "map", aic: "map" },
  { topic: "Zoology", wikipedia: "zoology", met: "animal", aic: "animal" },
  { topic: "Portraiture", wikipedia: "portrait", met: "portrait", aic: "portrait" },
  { topic: "Ceramics", wikipedia: "ceramic art", met: "ceramic", aic: "ceramic" },
  { topic: "Geology", wikipedia: "geology", met: "mineral", aic: "mineral" },
];

// ── plumbing ────────────────────────────────────────────────────────────────

const stats = {
  requests: 0,
  cacheHits: 0,
  errors: [] as string[],
  /** per source → per topic → kept count */
  kept: {} as Record<string, Record<string, number>>,
  /** per source → per topic → how many candidates the search offered before filtering */
  offered: {} as Record<string, Record<string, number>>,
  /** source:topic pairs whose search failed outright — NOT the same as zero results */
  failed: new Set<string>(),
};

// `??=` assigns only when the left side is null/undefined — the two uses here
// lazily create the nested `{source: {topic: count}}` buckets on first touch,
// replacing the old `if (!obj[k]) obj[k] = {}` dance.
function record(bucket: "kept" | "offered", source: string, topic: string, n: number) {
  ((stats[bucket][source] ??= {})[topic] ??= 0);
  stats[bucket][source][topic] += n;
}

// The standard "await a delay" idiom: wrap setTimeout in a Promise so it
// composes with async/await (`await sleep(400)`).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Met rate-limits with a 403 that looks exactly like a permanent denial but
 * clears after a pause, so back off hard rather than accepting the failure —
 * a dropped search would otherwise masquerade as "this topic has no content".
 */
async function getJson(url: string, delayMs = 0): Promise<any> {
  // Cache-aside pattern: hash the URL into a filename, return the cached body
  // if present, otherwise fetch and write it. This is why 0.3/0.4 could iterate
  // for free — a re-run replays every response from disk instead of the network.
  const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const cacheFile = `${CACHE_DIR}${key}.json`;

  if (USE_CACHE) {
    const cached = Bun.file(cacheFile);
    if (await cached.exists()) {
      stats.cacheHits++;
      return cached.json();
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (delayMs) await sleep(delayMs);
      stats.requests++;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await Bun.write(cacheFile, JSON.stringify(json));
      return json;
    } catch (err) {
      lastErr = err;
      // Exponential backoff: waits 1s → 3s → 9s between the 4 attempts, plus up
      // to 500ms of random "jitter" so parallel harvesters don't all retry at
      // the same instant. This shape (multiplier + jitter + max attempts) is the
      // canonical way to talk to any flaky or rate-limited API.
      if (attempt < 4) await sleep(1000 * 3 ** (attempt - 1) + Math.random() * 500);
    }
  }
  throw lastErr;
}

/** Collapse whitespace and trim to a lede-sized string, cutting at a sentence where possible. */
function toLede(text: string, max = 700): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…");
}

// Two idioms in one line: `new Set(...)` + spread is the standard dedupe, and
// `(t): t is string` is a TypeScript *type predicate* — it tells the compiler
// that whatever survives the filter is a string, so the nulls are gone from the
// type as well as the array. Without it, TS would still see (string|null)[].
const uniqueTags = (tags: (string | null | undefined)[]) =>
  [...new Set(tags.filter((t): t is string => Boolean(t && t.trim())).map((t) => t.trim()))];

// ── wikipedia ───────────────────────────────────────────────────────────────
// Articles. Text is CC BY-SA; embedded images carry their own per-file licenses,
// which this API surface doesn't expose (a real problem for 3.1, noted in NOTES.md).

const WIKI_API = "https://en.wikipedia.org/w/api.php";

/** Search results that are navigational rather than substantive — bad feed items. */
const isLowValueTitle = (title: string) =>
  /^(List of|Index of|Outline of|Timeline of|Glossary of)\b/i.test(title) ||
  /\(disambiguation\)/i.test(title);

async function harvestWikipedia(seed: (typeof TOPICS)[number]): Promise<Item[]> {
  const search = await getJson(
    `${WIKI_API}?action=query&format=json&list=search&srnamespace=0` +
      `&srlimit=${PER_SOURCE_PER_TOPIC + 10}&srsearch=${encodeURIComponent(seed.wikipedia)}`,
    120,
  );

  const hits: { pageid: number; title: string }[] = search?.query?.search ?? [];
  record("offered", "wikipedia", seed.topic, hits.length);

  const pageIds = hits.filter((h) => !isLowValueTitle(h.title)).map((h) => h.pageid);
  if (pageIds.length === 0) return [];

  // The extracts module caps at 20 pages per request when exintro/explaintext are set.
  const items: Item[] = [];
  for (let i = 0; i < pageIds.length && items.length < PER_SOURCE_PER_TOPIC; i += 20) {
    const batch = pageIds.slice(i, i + 20);
    // cllimit is a budget for the whole query, not per page — anything below `max`
    // silently hands every category to the first page or two and starves the rest.
    const detail = await getJson(
      `${WIKI_API}?action=query&format=json&prop=extracts|pageimages|categories` +
        `&exintro=1&explaintext=1&piprop=original&cllimit=max&clshow=!hidden` +
        `&pageids=${batch.join("|")}`,
      120,
    );

    for (const pageId of batch) {
      if (items.length >= PER_SOURCE_PER_TOPIC) break;
      const page = detail?.query?.pages?.[String(pageId)];
      const extract: string = page?.extract ?? "";
      // Stubs make useless cards and noisy embeddings.
      if (!page?.title || extract.trim().length < 200) continue;

      items.push({
        source: "wikipedia",
        sourceId: String(pageId),
        type: "article",
        title: page.title,
        summary: toLede(extract),
        imageUrl: page.original?.source ?? null,
        sourceUrl: `https://en.wikipedia.org/?curid=${pageId}`,
        tags: uniqueTags((page.categories ?? []).map((c: any) => c.title?.replace(/^Category:/, ""))),
        attribution: `Wikipedia contributors, “${page.title}”`,
        license: "CC BY-SA 4.0 (text)",
        topic: seed.topic,
      });
    }
  }
  return items;
}

// ── the met ─────────────────────────────────────────────────────────────────
// Images. Search filters to public-domain-with-image, but returns bare IDs,
// so every object costs its own request — the classic "N+1" shape (1 search +
// N detail fetches). Compare AIC below, whose search returns full records and
// costs one request per page. API shape drives adapter cost more than anything.

const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";
/** ~2.5 req/s. Faster than this and the Met starts 403ing partway through a run. */
const MET_DELAY_MS = 400;

/** Museum objects have no prose. Synthesize a summary from the catalogue fields. */
function metSummary(o: any): string {
  const who = [o.artistDisplayName, o.artistDisplayBio].filter(Boolean).join(", ");
  const parts = [
    who || null,
    o.objectDate || null,
    o.medium || null,
    o.culture || null,
    o.period || null,
    o.classification || null,
    o.department ? `${o.department} collection` : null,
    (o.tags ?? []).map((t: any) => t.term).filter(Boolean).join(", ") || null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

async function harvestMet(seed: (typeof TOPICS)[number]): Promise<Item[]> {
  const search = await getJson(
    `${MET_API}/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(seed.met)}`,
    MET_DELAY_MS,
  );

  const ids: number[] = search?.objectIDs ?? [];
  record("offered", "met", seed.topic, ids.length);

  // 0.2 found ~30-70% of "public domain" search hits fail the per-object check,
  // so scan well past the quota — Met's totals are in the thousands, it can afford it.
  const items: Item[] = [];
  for (const id of ids.slice(0, PER_SOURCE_PER_TOPIC * 4)) {
    if (items.length >= PER_SOURCE_PER_TOPIC) break;
    let o: any;
    try {
      o = await getJson(`${MET_API}/objects/${id}`, MET_DELAY_MS);
    } catch (err) {
      stats.errors.push(`met/${id}: ${err}`);
      continue;
    }
    // The search filters claim these, but objects occasionally disagree.
    if (!o?.isPublicDomain || !o?.primaryImage || !o?.title) continue;

    items.push({
      source: "met",
      sourceId: String(o.objectID),
      type: "image",
      title: o.title,
      summary: metSummary(o),
      imageUrl: o.primaryImageSmall || o.primaryImage,
      sourceUrl: o.objectURL,
      tags: uniqueTags([
        ...(o.tags ?? []).map((t: any) => t.term),
        o.department,
        o.classification,
        o.culture,
        o.objectName,
      ]),
      attribution: [o.creditLine, "The Metropolitan Museum of Art"].filter(Boolean).join(". "),
      license: "CC0 1.0 (public domain)",
      topic: seed.topic,
    });
  }
  return items;
}

// ── art institute of chicago ────────────────────────────────────────────────
// Images. One search call returns every field; public-domain filtering is ours to do.

const AIC_API = "https://api.artic.edu/api/v1";
const AIC_IIIF = "https://www.artic.edu/iiif/2";
const AIC_FIELDS =
  "id,title,image_id,artist_display,date_display,medium_display,department_title,term_titles,is_public_domain,classification_title,place_of_origin";

function aicSummary(a: any): string {
  const parts = [
    a.artist_display?.replace(/\n/g, ", ") || null,
    a.date_display || null,
    a.medium_display || null,
    a.place_of_origin || null,
    a.classification_title || null,
    a.department_title ? `${a.department_title} collection` : null,
    (a.term_titles ?? []).join(", ") || null,
  ];
  return toLede(parts.filter(Boolean).join(". "));
}

/** Undocumented: AIC 403s "Invalid limit" above 100 — not a rate limit, a hard page-size cap. */
const AIC_PAGE_SIZE = 100;

async function harvestAic(seed: (typeof TOPICS)[number]): Promise<Item[]> {
  const items: Item[] = [];
  let offered = 0;
  // Page until quota is hit, hits run out, or a safety cap on requests per topic.
  for (let page = 1; page <= 6 && items.length < PER_SOURCE_PER_TOPIC; page++) {
    const search = await getJson(
      `${AIC_API}/artworks/search?q=${encodeURIComponent(seed.aic)}` +
        `&page=${page}&limit=${AIC_PAGE_SIZE}&fields=${AIC_FIELDS}`,
      120,
    );

    const hits: any[] = search?.data ?? [];
    offered += hits.length;
    if (hits.length === 0) break;

    for (const a of hits) {
      if (items.length >= PER_SOURCE_PER_TOPIC) break;
      if (!a?.is_public_domain || !a?.image_id || !a?.title) continue;

      items.push({
        source: "aic",
        sourceId: String(a.id),
        type: "image",
        title: a.title,
        summary: aicSummary(a),
        // `!843,843` = fit within box, never upscale. The docs' `843,` 403s on any
        // original narrower than 843px (IIIF servers reject upscales).
        imageUrl: `${AIC_IIIF}/${a.image_id}/full/!843,843/0/default.jpg`,
        sourceUrl: `https://www.artic.edu/artworks/${a.id}`,
        tags: uniqueTags([...(a.term_titles ?? []), a.department_title, a.classification_title]),
        attribution: [a.artist_display?.replace(/\n/g, ", "), "The Art Institute of Chicago"]
          .filter(Boolean)
          .join(". "),
        license: "CC0 1.0 (public domain)",
        topic: seed.topic,
      });
    }
  }
  record("offered", "aic", seed.topic, offered);
  return items;
}

// ── run ─────────────────────────────────────────────────────────────────────

const HARVESTERS = { wikipedia: harvestWikipedia, met: harvestMet, aic: harvestAic } as const;

async function runSource(source: keyof typeof HARVESTERS): Promise<Item[]> {
  const out: Item[] = [];
  // Sequential within a source (one polite request stream per host); sources run
  // in parallel — see the Promise.all at the bottom. Rate limits are per-host,
  // so this gets 3× wall-clock speed without ever hammering any single API.
  for (const seed of TOPICS) {
    try {
      const items = await HARVESTERS[source](seed);
      record("kept", source, seed.topic, items.length);
      out.push(...items);
      console.log(`  ${source.padEnd(9)} ${seed.topic.padEnd(16)} ${String(items.length).padStart(3)} items`);
    } catch (err) {
      // Distinct from "search returned nothing" — never let this read as a density signal.
      stats.errors.push(`${source}/${seed.topic}: ${err}`);
      stats.failed.add(`${source}:${seed.topic}`);
      console.log(`  ${source.padEnd(9)} ${seed.topic.padEnd(16)} FAILED: ${err}`);
    }
  }
  return out;
}

function summarize(items: Item[]) {
  const line = "─".repeat(72);
  console.log(`\n${line}\nPer-source × topic (kept / offered by search)\n${line}`);
  console.log(["topic".padEnd(16), ...Object.keys(HARVESTERS).map((s) => s.padEnd(16))].join(""));
  for (const { topic } of TOPICS) {
    const cells = Object.keys(HARVESTERS).map((s) => {
      if (stats.failed.has(`${s}:${topic}`)) return "ERR".padEnd(16);
      const k = stats.kept[s]?.[topic] ?? 0;
      const o = stats.offered[s]?.[topic] ?? 0;
      return `${k}/${o}`.padEnd(16);
    });
    console.log([topic.padEnd(16), ...cells].join(""));
  }

  console.log(`\n${line}\nTotals\n${line}`);
  for (const source of Object.keys(HARVESTERS)) {
    const of = items.filter((i) => i.source === source);
    const withImage = of.filter((i) => i.imageUrl).length;
    const medianSummary = median(of.map((i) => i.summary.length));
    const medianTags = median(of.map((i) => i.tags.length));
    console.log(
      `${source.padEnd(10)} ${String(of.length).padStart(3)} items · ` +
        `${withImage} with image · median summary ${medianSummary} chars · median ${medianTags} tags`,
    );
  }
  console.log(`\ntotal ${items.length} items · ${stats.requests} requests · ${stats.cacheHits} cache hits`);
  if (stats.errors.length) console.log(`errors (${stats.errors.length}):\n  ${stats.errors.join("\n  ")}`);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

await mkdir(CACHE_DIR, { recursive: true });
console.log(`Harvesting ${TOPICS.length} topics × 3 sources (cache ${USE_CACHE ? "on" : "off"})…\n`);

const harvested = (await Promise.all(Object.keys(HARVESTERS).map((s) => runSource(s as any)))).flat();

// Same object can surface under two topic seeds. Dedupe idiom: build a Map keyed
// by `source:sourceId` — duplicate keys overwrite, so the LAST topic in TOPICS
// order wins — then take `.values()`. Same composite key that SPEC §5.1 makes
// UNIQUE, which is what will make the real ingestion upsert idempotent.
const deduped = [...new Map(harvested.map((i) => [`${i.source}:${i.sourceId}`, i])).values()];
const dupes = harvested.length - deduped.length;

await Bun.write(OUT_FILE, JSON.stringify(deduped, null, 2));
summarize(deduped);
console.log(`${dupes} cross-topic duplicates collapsed → ${OUT_FILE}`);
