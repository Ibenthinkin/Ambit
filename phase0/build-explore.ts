#!/usr/bin/env bun
/**
 * Phase 0 · step 0.4 — build the eyeball harness (throwaway code, see docs/BUILD_PLAN.md).
 *
 * Precomputes, for every item and each of the four 0.3 vector sets, two
 * RESTRICTED-TO-OTHER-SOURCES neighbor bands: "near" (top-10, ranks 1-10) and
 * "mid" (10 evenly-spaced picks from ranks 21-120) — Ben's first pass at the
 * harness only showed "near", which is relevant-but-unsurprising by construction,
 * and can't be distinguished from the random baseline being the more interesting
 * column. Injects both plus item metadata into explore.template.html →
 * phase0/explore.html — self-contained, open straight in a browser. The random
 * baseline column is seeded client-side and unaffected by the near/mid toggle.
 *
 *   bun run phase0/build-explore.ts
 */

const dir = new URL("./", import.meta.url).pathname;
const NEAR_N = 10;
// Band is ranks 21-120 (skip the obvious top-20, sample past it); 10 picks
// evenly spaced across the band rather than clustered right after the cutoff.
const MID_BAND = [20, 120] as const;
const MID_N = 10;

const SETS = [
  { id: "te3s-A", label: "text-embedding-3-small · A", file: "text-embedding-3-small--A.json" },
  { id: "te3s-B", label: "text-embedding-3-small · B", file: "text-embedding-3-small--B.json" },
  { id: "bgem3-A", label: "bge-m3 · A", file: "bge-m3--A.json" },
  { id: "bgem3-B", label: "bge-m3 · B", file: "bge-m3--B.json" },
];

const items: any[] = await Bun.file(`${dir}items.json`).json();
const keyOf = (i: any) => `${i.source}:${i.sourceId}`;

// Only what the page renders — keeps the inlined payload small.
const itemsByKey = Object.fromEntries(
  items.map((i) => [
    keyOf(i),
    {
      source: i.source,
      title: i.title,
      summary: i.summary,
      imageUrl: i.imageUrl,
      sourceUrl: i.sourceUrl,
      tags: i.tags.slice(0, 12),
      topic: i.topic,
    },
  ]),
);

function normalized(vec: number[]): Float32Array {
  const v = Float32Array.from(vec);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** 10 evenly-spaced indices across whatever of the [lo, hi) band actually exists. */
function sampleBand<T>(scored: T[], lo: number, hi: number, n: number): T[] {
  const band = scored.slice(lo, hi);
  if (band.length <= n) return band;
  const step = band.length / n;
  return Array.from({ length: n }, (_, i) => band[Math.floor(i * step)]);
}

const neighbors: Record<string, { near: Record<string, [string, number][]>; mid: Record<string, [string, number][]> }> = {};
const setsMeta: { id: string; label: string; dim: number }[] = [];

for (const set of SETS) {
  const t0 = performance.now();
  const raw = await Bun.file(`${dir}vectors/${set.file}`).json();
  const keys = Object.keys(raw.vectors);
  const vecs = keys.map((k) => normalized(raw.vectors[k]));
  const sources = keys.map((k) => k.split(":")[0]);

  const near: Record<string, [string, number][]> = {};
  const mid: Record<string, [string, number][]> = {};
  const round = (s: number) => Math.round(s * 1000) / 1000;
  for (let a = 0; a < keys.length; a++) {
    const scored: [string, number][] = [];
    for (let b = 0; b < keys.length; b++) {
      if (sources[a] === sources[b]) continue; // the whole point: cross-source only
      let dot = 0;
      const va = vecs[a], vb = vecs[b];
      for (let d = 0; d < va.length; d++) dot += va[d] * vb[d];
      scored.push([keys[b], dot]);
    }
    scored.sort((x, y) => y[1] - x[1]);
    near[keys[a]] = scored.slice(0, NEAR_N).map(([k, s]) => [k, round(s)]);
    mid[keys[a]] = sampleBand(scored, MID_BAND[0], MID_BAND[1], MID_N).map(([k, s]) => [k, round(s)]);
  }
  neighbors[set.id] = { near, mid };
  setsMeta.push({ id: set.id, label: set.label, dim: raw.dim });
  console.log(`✓ ${set.label} — ${keys.length} items → near/mid cross-source · ${(performance.now() - t0).toFixed(0)}ms`);
}

const payload = { generatedAt: new Date().toISOString(), sets: setsMeta, items: itemsByKey, neighbors };
const template = await Bun.file(`${dir}explore.template.html`).text();
if (!template.includes("/*__DATA__*/null")) throw new Error("template placeholder missing");
const html = template.replace("/*__DATA__*/null", JSON.stringify(payload));

await Bun.write(`${dir}explore.html`, html);
console.log(`→ phase0/explore.html (${(html.length / 1e6).toFixed(1)} MB) — open it in a browser`);
