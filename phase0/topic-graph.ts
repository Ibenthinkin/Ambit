/**
 * topic-graph.ts — build the topic adjacency matrix that drives feed drift.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 0.4 killed item-level nearest-neighbour recommendation: embedding a museum
 * item's `title + summary` mostly embeds *catalog boilerplate* (Met titles are a median
 * of 4 words; 580 of our 3168 items share a title with another item — 67 are just
 * "textile"). Cosine similarity over that text degenerates into string matching, so
 * top-k NN returned pages of near-identical calligraphy. A straight line, not a drift.
 *
 * But the failure was about *what we embedded*, not about embeddings. Topics are a small,
 * clean, semantically meaningful vocabulary. So we keep embeddings for exactly one job:
 *
 *   - Embeddings choose WHERE to look   (topic level — 16 clean concepts, computed offline)
 *   - Random + filters choose WHAT to show (item level — where embeddings failed)
 *
 * The output is a 16x16 matrix. It is computed ONCE, offline, and checked in as JSON.
 * There is no pgvector, no per-item vector in the database, no embedding call at request
 * time. The entire "ML recommender" collapses into a static lookup table you can read,
 * hand-edit, and diff in a PR.
 */

// Centroids are computed over the CURATED corpus (0.5), not the raw harvest:
// the graph should describe the pool the feed can actually serve, and curation
// strips exactly the duplicated-boilerplate items that would drag a topic's
// centroid toward the generic-catalog direction.
const ITEMS = "phase0/items.curated.json";
const VECS = "phase0/vectors/text-embedding-3-small--A.json";
const OUT = "phase0/topic-graph.json";

type Item = { source: string; sourceId: string; topic: string };

const items: Item[] = await Bun.file(ITEMS).json();
const vf = await Bun.file(VECS).json();
const V: Record<string, number[]> = vf.vectors;
const dim: number = vf.dim;

// ---------------------------------------------------------------------------
// 1. Topic centroid = the mean of every item vector carrying that topic.
//
// Note this asks "what does this topic actually CONTAIN in our corpus?" rather than
// "what does the word 'Poetry' mean?". That's deliberate — it grounds the graph in the
// items we can actually serve, so a drift edge always leads somewhere with content.
// ---------------------------------------------------------------------------
const groups = new Map<string, number[][]>();
for (const it of items) {
  const v = V[`${it.source}:${it.sourceId}`];
  if (!v) continue;
  if (!groups.has(it.topic)) groups.set(it.topic, []);
  groups.get(it.topic)!.push(v);
}

const topics = [...groups.keys()].sort();
const rawCentroid = new Map<string, Float64Array>();
for (const [topic, vecs] of groups) {
  const c = new Float64Array(dim);
  for (const v of vecs) for (let d = 0; d < dim; d++) c[d] += v[d];
  for (let d = 0; d < dim; d++) c[d] /= vecs.length;
  rawCentroid.set(topic, c);
}

// ---------------------------------------------------------------------------
// 2. THE LOAD-BEARING STEP: subtract the global mean centroid.
//
// Without this, the graph is broken in a way that LOOKS like it works. Raw cosine over
// these centroids makes Geology the top-2 neighbour of TEN of the sixteen topics —
// Music->Geology scores 0.73, Portraiture->Geology 0.70. That's nonsense.
//
// It's "hubness": in high dimensions, a centroid that happens to sit near the corpus mean
// is close to *everything*. Every user on the platform would drift into rocks.
//
// The global mean is the "generic digitised museum object" direction — the shared component
// that says nothing about topic. Subtracting it leaves only what makes each topic distinct.
// After centering, Geology appears in a top-2 three times, and the graph goes flat.
// ---------------------------------------------------------------------------
const globalMean = new Float64Array(dim);
for (const c of rawCentroid.values()) for (let d = 0; d < dim; d++) globalMean[d] += c[d];
for (let d = 0; d < dim; d++) globalMean[d] /= rawCentroid.size;

const l2 = (c: Float64Array) => {
  let n = 0;
  for (let d = 0; d < dim; d++) n += c[d] * c[d];
  n = Math.sqrt(n);
  for (let d = 0; d < dim; d++) c[d] /= n;
  return c;
};

const centroid = new Map<string, Float64Array>();
for (const [topic, c] of rawCentroid) {
  const centered = new Float64Array(dim);
  for (let d = 0; d < dim; d++) centered[d] = c[d] - globalMean[d];
  centroid.set(topic, l2(centered));
}

const cos = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let d = 0; d < dim; d++) s += a[d] * b[d];
  return s;
};

// ---------------------------------------------------------------------------
// 3. Emit the adjacency matrix: for each topic, every other topic ranked by similarity.
//
// The feed reads two ends of each row:
//   - the head (positive sims) -> DRIFT, softmax-sampled adjacent neighbours
//   - the tail HALF            -> JUMP pool, drawn uniformly. Not the strict
//     antipode: the tail ordering of a 16-point mean-centered space is noise,
//     so treating rank 15 as meaningfully "farther" than rank 12 would be
//     false precision. A far draw is principled enough.
// ---------------------------------------------------------------------------
const graph: Record<string, { topic: string; sim: number }[]> = {};
for (const t of topics) {
  graph[t] = topics
    .filter((o) => o !== t)
    .map((o) => ({ topic: o, sim: +cos(centroid.get(t)!, centroid.get(o)!).toFixed(4) }))
    .sort((a, b) => b.sim - a.sim);
}

await Bun.write(
  OUT,
  JSON.stringify(
    {
      model: vf.model,
      recipe: vf.recipe,
      note: "Mean-centered topic centroids over the curated corpus. Positive head of each row = drift bridges, tail half = jump pool. Hand-editable: rows with max sim < 0.06 are noise and should be curated by hand (see WEAK ROWS in the build output).",
      builtFrom: { items: items.length, topics: topics.length },
      createdAt: new Date().toISOString(),
      graph,
    },
    null,
    2,
  ),
);

// ---------------------------------------------------------------------------
// 4. Report — including the honest caveat.
// ---------------------------------------------------------------------------
console.log(`${topics.length} topics from ${items.length} items -> ${OUT}\n`);
console.log("TOPIC".padEnd(16), "DRIFT (rank 1-2)".padEnd(40), "JUMP (antipode)");
console.log("-".repeat(92));
for (const t of topics) {
  const row = graph[t];
  const fmt = (e: { topic: string; sim: number }) => `${e.topic} ${e.sim.toFixed(2)}`;
  console.log(
    t.padEnd(16),
    row.slice(0, 2).map(fmt).join(", ").padEnd(40),
    fmt(row[row.length - 1]),
  );
}

// A topic whose best neighbour barely clears zero has no real structure — its drift is
// indistinguishable from a random jump. Flag these rather than pretending the graph is
// uniformly good; they're the rows a human should overwrite.
const weak = topics.filter((t) => graph[t][0].sim < 0.06);
console.log(`\nWEAK ROWS (best neighbour < 0.06 — drift here is ~noise, curate by hand):`);
console.log("  " + (weak.length ? weak.join(", ") : "none"));
