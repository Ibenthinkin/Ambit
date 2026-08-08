import { describe, expect, it } from "vitest";

import { hashSeed, mulberry32, weightedPick } from "./random";

describe("hashSeed + mulberry32", () => {
  it("same seed string produces the same PRNG sequence", () => {
    const seqA = Array.from({ length: 20 }, mulberry32(hashSeed("42:0")));
    const seqB = Array.from({ length: 20 }, mulberry32(hashSeed("42:0")));
    expect(seqA).toEqual(seqB);
  });

  it("different seed strings produce different sequences", () => {
    const a = mulberry32(hashSeed("42:0"));
    const b = mulberry32(hashSeed("42:1"));
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("mulberry32 output always lands in [0, 1)", () => {
    const rng = mulberry32(hashSeed("some-seed:3"));
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("hashSeed is deterministic for a given string", () => {
    expect(hashSeed("abc:1")).toBe(hashSeed("abc:1"));
    expect(hashSeed("abc:1")).not.toBe(hashSeed("abc:2"));
  });
});

describe("weightedPick", () => {
  it("returns null for an empty entries array", () => {
    expect(weightedPick([], () => 0.5)).toBeNull();
  });

  it("returns null when every weight is zero", () => {
    expect(
      weightedPick(
        [
          ["a", 0],
          ["b", 0],
        ],
        () => 0.5,
      ),
    ).toBeNull();
  });

  it("returns null when weights sum to <= 0", () => {
    expect(
      weightedPick(
        [
          ["a", -1],
          ["b", -1],
        ],
        () => 0.5,
      ),
    ).toBeNull();
  });

  it("picks the only entry deterministically", () => {
    expect(weightedPick([["solo", 5]], () => 0.999)).toBe("solo");
  });

  it("honors a fixed rng draw against known cumulative weights", () => {
    // Entries: a=[0,1), b=[1,4), c=[4,10) out of a total of 10.
    const entries: [string, number][] = [
      ["a", 1],
      ["b", 3],
      ["c", 6],
    ];
    expect(weightedPick(entries, () => 0)).toBe("a"); // r = 0 -> falls in a's slice
    expect(weightedPick(entries, () => 0.15)).toBe("b"); // r = 1.5 -> b
    expect(weightedPick(entries, () => 0.99)).toBe("c"); // r = 9.9 -> c
  });

  it("respects weights over many draws (statistical)", () => {
    const entries: [string, number][] = [
      ["rare", 1],
      ["common", 9],
    ];
    let seed = 12345;
    const rng = () => {
      // Simple LCG, deterministic but well-spread over many draws.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 2000; i++) {
      const pick = weightedPick(entries, rng);
      if (pick) counts[pick as "rare" | "common"]++;
    }
    // ~10% rare, ~90% common — loose bounds, just proving weight dominance not a coin flip.
    expect(counts.common).toBeGreaterThan(counts.rare * 4);
  });
});
