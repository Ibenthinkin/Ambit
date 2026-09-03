// Cut 2a's graph maths (docs/PLAN_topic-vocabulary-cut2.md, Task 5). Pure functions over tag
// profiles; scripts/rebuild-topic-graph.ts is the shell that reads the corpus and writes the
// artifact. Split the same way topic-mining.ts is, and for the same reason: this is the part worth
// a test, and a test under scripts/ would never be collected (vitest.config.ts's include is
// src/**).
//
// **The graph is a HYBRID, by Ben's decision (09-02-26), and the reason is measured.** Tag
// co-occurrence was validated against the shipped embedding graph on the sixteen topics that
// already have one: mean Spearman rho 0.502, top-3 neighbour overlap 50%. Real signal, but not a
// drop-in replacement — and the sixteen rows encode a drift feel Ben tuned by hand in Phase 0.5.

/** One edge out of a topic. The same shape topic-graph.json's rows already use, and what
 *  feed.ts's pickDrift/pickJump read. */
export interface Neighbor {
  topic: string;
  sim: number;
}

/** Population standard deviation. Empty row → 0, which `rescaleTo` treats as "nothing to scale". */
export function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/**
 * Centre a row on zero and scale it to `target` standard deviation, preserving order. An all-equal
 * row has no spread to scale, so it is returned centred and flat rather than NaN.
 *
 * **This is the subtlest thing in Cut 2a.** Raw co-occurrence sims are ~4x flatter than the
 * embedding graph's (-0.033..0.093 against -0.384..0.348), and `pickDrift` softmaxes over the
 * positive head of a row with a temperature knob — so writing raw values in would turn DRIFT into
 * a near-uniform draw, a silent regression no test elsewhere would catch.
 */
export function rescaleTo(row: Neighbor[], target: number): Neighbor[] {
  const sims = row.map((n) => n.sim);
  const mean = sims.reduce((a, b) => a + b, 0) / (sims.length || 1);
  const sd = stdDev(sims);
  const k = sd === 0 ? 0 : target / sd;
  return row.map((n) => ({
    topic: n.topic,
    sim: +((n.sim - mean) * k).toFixed(4),
  }));
}

/**
 * IDF-weighted cosine over each topic's tag profile — "how much do these two topics get described
 * with the same words".
 *
 * IDF matters because a tag on every topic (`art`) says nothing about which two are close, while a
 * tag on three says a great deal: `log(topics / documentFrequency)` zeroes the first out entirely
 * and leaves the second carrying the comparison. `log(1 + n)` on the count keeps one prolific tag
 * from swamping a profile the way a raw count would.
 */
export function cooccurrenceSims(
  profiles: Map<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const ids = [...profiles.keys()];
  const df = new Map<string, number>();
  for (const m of profiles.values())
    for (const tag of m.keys()) df.set(tag, (df.get(tag) ?? 0) + 1);

  const vecs = new Map<string, Map<string, number>>();
  for (const [id, m] of profiles) {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [tag, n] of m) {
      const w = Math.log(1 + n) * Math.log(ids.length / (df.get(tag) ?? 1));
      if (w > 0) {
        v.set(tag, w);
        norm += w * w;
      }
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    vecs.set(id, v);
  }
  const out = new Map<string, Map<string, number>>();
  for (const a of ids) {
    const row = new Map<string, number>();
    for (const b of ids) {
      if (a === b) continue;
      let s = 0;
      for (const [k, w] of vecs.get(a)!) {
        const o = vecs.get(b)!.get(k);
        if (o) s += w * o;
      }
      row.set(b, s);
    }
    out.set(a, row);
  }
  return out;
}
