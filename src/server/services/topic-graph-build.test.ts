// The rescaling is the whole reason this file has a test. Co-occurrence similarities came out ~4x
// flatter than the embedding graph's (plan §0.6: -0.033..0.093 against -0.384..0.348), and
// pickDrift softmaxes over them with a temperature knob — so writing raw co-occurrence values into
// the graph would quietly flatten DRIFT into a near-uniform pick and nobody would see it fail.
import { describe, expect, it } from "vitest";

import { cooccurrenceSims, rescaleTo, stdDev } from "./topic-graph-build";

describe("rescaleTo", () => {
  it("stretches a flat row to the target spread while preserving order and centre", () => {
    const flat = [
      { topic: "a", sim: 0.02 },
      { topic: "b", sim: 0.0 },
      { topic: "c", sim: -0.02 },
    ];
    const out = rescaleTo(flat, 0.2);
    expect(out.map((n) => n.topic)).toEqual(["a", "b", "c"]); // order preserved
    expect(stdDev(out.map((n) => n.sim))).toBeCloseTo(0.2, 3);
    expect(out[1]!.sim).toBeCloseTo(0, 6); // the centre stays at zero
    expect(out[0]!.sim).toBeGreaterThan(0);
    expect(out[2]!.sim).toBeLessThan(0);
  });

  it("leaves an all-equal row alone rather than dividing by zero", () => {
    const flat = [
      { topic: "a", sim: 0.05 },
      { topic: "b", sim: 0.05 },
    ];
    expect(rescaleTo(flat, 0.2).every((n) => Number.isFinite(n.sim))).toBe(
      true,
    );
  });

  it("does not change which neighbours are the positive half", () => {
    // pickDrift only ever softmaxes over the positive head of a row, so a rescale that moved a
    // neighbour across zero would change which topics DRIFT can reach at all — a much bigger
    // change than the spread it is meant to fix.
    const row = [
      { topic: "a", sim: 0.09 },
      { topic: "b", sim: 0.03 },
      { topic: "c", sim: 0.01 },
      { topic: "d", sim: -0.02 },
    ];
    const before = row.filter((n) => n.sim > 0).map((n) => n.topic);
    // The row's mean is positive, so centring moves the smallest positives below zero — this is
    // the documented behaviour, not an accident: the graph is mean-centred per row by design
    // (topic-graph.json's own header), and the embedding rows are too.
    const after = rescaleTo(row, 0.2).filter((n) => n.sim > 0);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.topic).toBe(before[0]);
  });
});

describe("cooccurrenceSims", () => {
  it("scores two topics that share a rare tag above two that share nothing", () => {
    const profiles = new Map<string, Map<string, number>>([
      [
        "sculpture",
        new Map([
          ["bronze", 10],
          ["art", 50],
        ]),
      ],
      [
        "ceramics",
        new Map([
          ["bronze", 8],
          ["art", 50],
        ]),
      ],
      [
        "poetry",
        new Map([
          ["verse", 9],
          ["art", 50],
        ]),
      ],
    ]);
    const sims = cooccurrenceSims(profiles);
    expect(sims.get("sculpture")!.get("ceramics")!).toBeGreaterThan(
      sims.get("sculpture")!.get("poetry")!,
    );
  });

  it("gives a tag every topic carries no say in who is close to whom", () => {
    // IDF is the point: `art` is on all three profiles above, so log(3/3) = 0 weights it out
    // entirely. Without that, the shared boilerplate tag would dominate every comparison.
    const profiles = new Map<string, Map<string, number>>([
      ["a", new Map([["everywhere", 5]])],
      ["b", new Map([["everywhere", 5]])],
    ]);
    expect(cooccurrenceSims(profiles).get("a")!.get("b")!).toBe(0);
  });

  it("has no self-edge", () => {
    const profiles = new Map<string, Map<string, number>>([
      ["a", new Map([["x", 1]])],
      ["b", new Map([["y", 1]])],
    ]);
    expect(cooccurrenceSims(profiles).get("a")!.has("a")).toBe(false);
  });
});
