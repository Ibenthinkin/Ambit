#!/usr/bin/env bun
/**
 * Phase 0 · step 0.4 — build the eyeball harness (throwaway code, see docs/BUILD_PLAN.md).
 *
 * Precomputes, for every item, the top-10 nearest neighbors RESTRICTED TO OTHER
 * SOURCES under each of the four 0.3 vector sets, and injects that plus item
 * metadata into explore.template.html → phase0/explore.html — a self-contained
 * page (gitignored) you open straight in a browser, no server. The random
 * baseline column is seeded client-side.
 *
 *   bun run phase0/build-explore.ts
 */

const dir = new URL("./", import.meta.url).pathname;
const TOP_N = 10;

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

const neighbors: Record<string, Record<string, [string, number][]>> = {};
const setsMeta: { id: string; label: string; dim: number }[] = [];

for (const set of SETS) {
  const t0 = performance.now();
  const raw = await Bun.file(`${dir}vectors/${set.file}`).json();
  const keys = Object.keys(raw.vectors);
  const vecs = keys.map((k) => normalized(raw.vectors[k]));
  const sources = keys.map((k) => k.split(":")[0]);

  const bySet: Record<string, [string, number][]> = {};
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
    bySet[keys[a]] = scored.slice(0, TOP_N).map(([k, s]) => [k, Math.round(s * 1000) / 1000]);
  }
  neighbors[set.id] = bySet;
  setsMeta.push({ id: set.id, label: set.label, dim: raw.dim });
  console.log(`✓ ${set.label} — ${keys.length} items → top-${TOP_N} cross-source · ${(performance.now() - t0).toFixed(0)}ms`);
}

const payload = { generatedAt: new Date().toISOString(), sets: setsMeta, items: itemsByKey, neighbors };
const template = await Bun.file(`${dir}explore.template.html`).text();
if (!template.includes("/*__DATA__*/null")) throw new Error("template placeholder missing");
const html = template.replace("/*__DATA__*/null", JSON.stringify(payload));

await Bun.write(`${dir}explore.html`, html);
console.log(`→ phase0/explore.html (${(html.length / 1e6).toFixed(1)} MB) — open it in a browser`);
