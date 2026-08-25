import { describe, expect, it } from "vitest";

import {
  fadeMs,
  LANDING_SLIDES,
  pickRun,
  shuffle,
  SLIDES_PER_RUN,
  type LandingSlide,
} from "./landing-slides";

/** Eight throwaway slides — enough to prove `pickRun` actually subsets. */
const FIXTURE: LandingSlide[] = Array.from({ length: 12 }, (_, i) => ({
  src: `/landing/fixture-${i}.jpg`,
  credit: `Fixture ${i}`,
}));

describe("fadeMs", () => {
  it("is just over half the slide time at the shipped cadence", () => {
    expect(fadeMs(600)).toBe(330);
  });

  it("caps at 520ms so a slow cadence doesn't become an endless dissolve", () => {
    expect(fadeMs(1200)).toBe(520);
    expect(fadeMs(5000)).toBe(520);
  });
});

describe("shuffle", () => {
  it("never mutates its input", () => {
    const input = FIXTURE.slice(0, 4);
    const before = input.slice();
    shuffle(input, () => 0);
    expect(input).toEqual(before);
  });

  it("preserves every element — a shuffle loses nothing", () => {
    const out = shuffle(
      FIXTURE,
      makeRng([0.1, 0.9, 0.4, 0.7, 0.2, 0.5, 0.3, 0.8, 0.6, 0.15, 0.35]),
    );
    expect(out).toHaveLength(FIXTURE.length);
    expect([...out].sort(bySrc)).toEqual([...FIXTURE].sort(bySrc));
  });

  it("actually reorders — a fixed rng of 0 rotates rather than returning the input", () => {
    const out = shuffle(FIXTURE, () => 0);
    expect(out).not.toEqual(FIXTURE);
  });
});

describe("pickRun", () => {
  it("returns exactly SLIDES_PER_RUN slides from a longer list", () => {
    const run = pickRun(FIXTURE, () => 0);
    expect(run).toHaveLength(SLIDES_PER_RUN);
  });

  it("returns distinct slides — a run must never repeat an image", () => {
    const run = pickRun(
      FIXTURE,
      makeRng([0.3, 0.8, 0.1, 0.6, 0.9, 0.2, 0.5, 0.7, 0.4, 0.25, 0.65]),
    );
    expect(new Set(run.map((s) => s.src)).size).toBe(run.length);
  });

  it("returns the whole list when it's shorter than a run", () => {
    const short = FIXTURE.slice(0, 3);
    expect(pickRun(short, () => 0)).toHaveLength(3);
  });

  it("honours an explicit size — static mode asks for one slide", () => {
    expect(pickRun(FIXTURE, () => 0, 1)).toHaveLength(1);
  });
});

describe("LANDING_SLIDES", () => {
  it("has at least a full run's worth of slides", () => {
    expect(LANDING_SLIDES.length).toBeGreaterThanOrEqual(SLIDES_PER_RUN);
  });

  it("serves every slide same-origin from /landing/", () => {
    for (const slide of LANDING_SLIDES) {
      expect(slide.src.startsWith("/landing/")).toBe(true);
    }
  });

  it("carries a credit for every slide", () => {
    for (const slide of LANDING_SLIDES) {
      expect(slide.credit.trim().length).toBeGreaterThan(0);
    }
  });

  // The licensing gate, as a test rather than a comment nobody reads. The design bundle's
  // `uploads/*.webp` are rights-uncleared; if one is ever copied in under its original path this
  // fails loudly instead of shipping quietly.
  it("contains nothing from the design bundle's uncleared uploads/", () => {
    for (const slide of LANDING_SLIDES) {
      expect(slide.src).not.toContain("uploads/");
    }
  });
});

/** Deterministic rng that walks a fixed list and then repeats its last value. */
function makeRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

function bySrc(a: LandingSlide, b: LandingSlide): number {
  return a.src.localeCompare(b.src);
}
