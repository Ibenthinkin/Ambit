// Deterministic randomness for the feed engine (SPEC §7, §9). This is the property every Phase
// 4.1 test hangs off: given the same seed, every draw in the feed algorithm reproduces bit-for-
// bit — which is what lets a cursor "freeze" a page (SPEC §7: refetching the same cursor returns
// the same page even though the underlying pool state may have shifted slightly since). The
// prototype (phase0/feed.template.html) just called `Math.random()` directly; everywhere it did,
// the server port instead takes an injected `rng: () => number` sourced from here, so the same
// call sequence against the same seed always produces the same numbers.

/**
 * xmur3-style string hash (bryc's public-domain implementation, adapted to a single-shot call):
 * turns an arbitrary string into a well-mixed uint32. Used to turn a cursor's `${seed}:${page}`
 * key into the numeric seed mulberry32 wants — not cryptographic, just needs to spread similar
 * inputs (adjacent pages of the same seed) across the full 32-bit range so their sequences don't
 * visibly correlate.
 */
export function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * mulberry32 (Tommy Ettinger's public-domain PRNG): a small, fast, seeded generator returning
 * floats in [0, 1) — a drop-in, reproducible replacement for every `Math.random()` call in the
 * ported prototype algorithm. Not cryptographic; feed composition has no adversarial requirement,
 * only "same seed → same page." Returns a closure (not a value) because the algorithm needs a
 * *sequence* — every call advances the internal state, exactly like `Math.random()` would.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weighted random choice over `[value, weight]` pairs — ported near-verbatim from
 * phase0/feed.template.html:235-241. Every tier draw, topic draw, and item draw in the feed
 * engine reduces to a call to this. `rng` is always injected (never defaults to `Math.random`
 * here) so every caller's tests can pin the exact sequence.
 *
 * Returns `null` when there's nothing to pick — an empty `entries` array, or weights that sum to
 * zero or less (a topic with no eligible items, a knob misconfigured to zero, ...). Every caller
 * in services/feed.ts treats `null` as "this slot didn't pan out," not an error: it either retries
 * the guard loop or falls back to a simpler tier (SPEC §9.3's "constraints are soft").
 */
export function weightedPick<T>(
  entries: [T, number][],
  rng: () => number,
): T | null {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  // Float-rounding fallback (the running subtraction can leave a hair of `r` unspent) — the
  // prototype takes the same fallback, and `entries` is non-empty here (an empty array would
  // have summed to 0 and returned above already).
  return entries[entries.length - 1]![0];
}
