#!/usr/bin/env bun
/**
 * Phase 0 · step 0.5 — build the FEED-FEEL prototype (throwaway code, see the
 * Phase 0.5 plan + docs/BUILD_PLAN.md).
 *
 * Where explore.html was a lab instrument (inspect one item's neighbors),
 * feed.html is a wind tunnel for the product itself: a real scrolling feed
 * composed with the post-0.4 design — CORE / DRIFT / JUMP tiers over the topic
 * graph, curation-weighted random item picks, diversity constraints — so Ben
 * can judge the one question that gates Phase 1: does it FEEL like a drift
 * through the good wing of the museum?
 *
 * Deliberate split of responsibilities:
 *  - This script only assembles the DATA (curated items, topic graph, a
 *    taste-picker shortlist, optional favorites profile) and inlines it into
 *    feed.template.html — same self-contained-file trick as build-explore.ts.
 *  - The COMPOSITION ALGORITHM runs client-side in the template, with every
 *    parameter exposed as a live knob. Tuning the feel never needs a rebuild;
 *    only corpus changes do.
 *
 *   bun run phase0/build-feed.ts
 *   bun run phase0/build-feed.ts --favorites "Borges, Wes Anderson, old field guides"
 *
 * The --favorites flag runs the cold-start taste-inference ONCE at build time
 * (OPENROUTER_API_KEY needed): an LLM maps the freeform list to topic weights
 * + aesthetic keywords + a one-line "your wing of the museum" blurb, embedded
 * as a third onboarding mode in the page.
 *
 * Reads  phase0/items.curated.json + phase0/topic-graph.json
 * Writes phase0/feed.html (gitignored — open directly in a browser)
 */

const dir = new URL("./", import.meta.url).pathname;

interface CuratedItem {
  source: string;
  sourceId: string;
  type: "image" | "article";
  title: string;
  summary: string;
  imageUrl: string | null;
  sourceUrl: string;
  topic: string;
  curationScore: number;
  aestheticTags: string[];
}

const items: CuratedItem[] = await Bun.file(`${dir}items.curated.json`).json();
const graphFile = await Bun.file(`${dir}topic-graph.json`).json();
const topics: string[] = Object.keys(graphFile.graph).sort();

// ── payload: items ──────────────────────────────────────────────────────────
// Only what the page renders/composes with — keeps the inlined blob small.
const keyOf = (i: CuratedItem) => `${i.source}:${i.sourceId}`;
const itemsByKey = Object.fromEntries(
  items.map((i) => [
    keyOf(i),
    {
      source: i.source,
      type: i.type,
      title: i.title,
      summary: i.summary,
      imageUrl: i.imageUrl,
      sourceUrl: i.sourceUrl,
      topic: i.topic,
      score: i.curationScore,
      atags: i.aestheticTags,
    },
  ]),
);

// ── payload: taste-picker shortlist ─────────────────────────────────────────
// ~24 strong items spread across all topics, preferring images (they read
// instantly on the picker grid). Seeded shuffle for the tie-break so the
// shortlist is stable run-to-run until scores or corpus change.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xa4b17);

const byTopic = new Map<string, CuratedItem[]>();
for (const i of items) {
  if (!byTopic.has(i.topic)) byTopic.set(i.topic, []);
  byTopic.get(i.topic)!.push(i);
}
const tastePicker: string[] = [];
for (const topic of topics) {
  const pool = (byTopic.get(topic) ?? [])
    .filter((i) => i.imageUrl)
    .sort((a, b) => b.curationScore - a.curationScore || rng() - 0.5);
  // Top 1–2 per topic ≈ 24 tiles for 16 topics.
  for (const pick of pool.slice(0, tastePicker.length < topics.length ? 2 : 1))
    tastePicker.push(keyOf(pick));
}

// ── payload: optional favorites profile (the LLM cold-start experiment) ─────
// One chat call maps "name a few things you love" to topic weights over OUR
// topic list + aesthetic keywords. Build-time on purpose: the output page
// stays static and key-free.
const favIdx = process.argv.indexOf("--favorites");
const favoritesText = favIdx > -1 ? process.argv[favIdx + 1] : null;
let favorites: { input: string; weights: Record<string, number>; keywords: string[]; blurb: string } | null = null;

if (favoritesText) {
  const API_KEY = process.env.OPENROUTER_API_KEY;
  if (!API_KEY) {
    console.error("--favorites needs OPENROUTER_API_KEY in .env");
    process.exit(1);
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Someone tells you a few books, films, artists, or things they love. Infer their aesthetic and intellectual taste, then map it onto this fixed list of topics: ${topics.join(", ")}.\n` +
            `Reply with ONLY JSON: {"weights": {<topic>: <0..1 for topics that fit their taste — include only topics scoring 0.15+, at least 3, at most 8>}, "keywords": [<4-8 short lowercase aesthetic keywords capturing the vibe, e.g. "symmetry", "muted palette", "marginalia">], "blurb": "<one warm sentence describing the wing of the museum this person would get lost in — second person, no gushing>"}`,
        },
        { role: "user", content: favoritesText },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`favorites call failed: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  // Keep only topics that actually exist — the model occasionally invents one.
  const weights = Object.fromEntries(
    Object.entries(parsed.weights ?? {}).filter(([t, w]) => topics.includes(t) && Number(w) > 0)
      .map(([t, w]) => [t, Math.min(1, Number(w))]),
  );
  favorites = {
    input: favoritesText,
    weights,
    keywords: (parsed.keywords ?? []).filter((k: unknown) => typeof k === "string").slice(0, 8),
    blurb: typeof parsed.blurb === "string" ? parsed.blurb : "",
  };
  console.log(`✓ favorites profile: ${Object.keys(weights).join(", ")} · keywords: ${favorites.keywords.join(", ")}`);
}

// ── assemble ────────────────────────────────────────────────────────────────

const payload = {
  generatedAt: new Date().toISOString(),
  topics,
  // Adjacency rows come through as-is: sorted nearest→farthest per topic.
  // The client walks the head for DRIFT and draws from the tail half for JUMP.
  graph: graphFile.graph,
  graphNote: graphFile.note,
  items: itemsByKey,
  tastePicker,
  favorites,
};

const template = await Bun.file(`${dir}feed.template.html`).text();
if (!template.includes("/*__DATA__*/null")) throw new Error("template placeholder missing");
const html = template.replace("/*__DATA__*/null", JSON.stringify(payload));

await Bun.write(`${dir}feed.html`, html);
const withScores = items.filter((i) => i.curationScore !== 5).length;
console.log(
  `→ phase0/feed.html (${(html.length / 1e6).toFixed(1)} MB) — ${items.length} curated items ` +
    `(${withScores ? `${withScores} LLM-scored` : "neutral scores — run curate.ts without --skip-llm for real taste"}) · ` +
    `${topics.length} topics · open it in a browser`,
);
