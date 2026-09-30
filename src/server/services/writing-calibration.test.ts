import { describe, expect, it } from "vitest";

import { mulberry32 } from "./random";
import {
  type CalibrationEntry,
  calibrationReport,
  parseCalibration,
  renderCalibration,
  scoreBand,
  spearman,
  stratifiedSample,
} from "./writing-calibration";

describe("stratifiedSample", () => {
  const rows = [
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `w${i}`,
      source: "wikipedia",
      curationScore: (i % 9) + 1,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      source: "pdr",
      curationScore: 8,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `l${i}`,
      source: "loupe",
      curationScore: 4,
    })),
  ];

  it("draws n distinct rows and reaches every source and band present", () => {
    const out = stratifiedSample(rows, 12, mulberry32(1));
    expect(out).toHaveLength(12);
    expect(new Set(out.map((r) => r.id)).size).toBe(12);
    expect(new Set(out.map((r) => r.source))).toEqual(
      new Set(["wikipedia", "pdr", "loupe"]),
    );
    const wikiBands = new Set(
      out
        .filter((r) => r.source === "wikipedia")
        .map((r) => scoreBand(r.curationScore)),
    );
    expect(wikiBands.size).toBe(3);
  });

  it("gives each source an equal turn, however many bands it spans", () => {
    const skewed = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `w${i}`,
        source: "wikipedia",
        curationScore: 5,
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `l${i}`,
        source: "loupe",
        curationScore: (i % 9) + 1,
      })),
    ];
    const out = stratifiedSample(skewed, 12, mulberry32(3));
    expect(out.filter((r) => r.source === "loupe")).toHaveLength(6);
  });

  it("returns everything when asked for more than there is", () => {
    expect(stratifiedSample(rows.slice(0, 5), 40, mulberry32(1))).toHaveLength(
      5,
    );
  });

  it("is deterministic for a seed", () => {
    expect(stratifiedSample(rows, 10, mulberry32(7))).toEqual(
      stratifiedSample(rows, 10, mulberry32(7)),
    );
  });
});

describe("spearman", () => {
  it("is 1 for the same order and -1 for the reverse", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
  it("handles ties by average rank", () => {
    expect(spearman([1, 1, 2], [1, 1, 2])).toBeCloseTo(1);
  });
});

const entry = (
  n: number,
  over: Partial<CalibrationEntry> = {},
): CalibrationEntry => ({
  n,
  itemId: `id${n}`,
  key: `wikipedia:Piece_${n}`,
  title: `Piece ${n}`,
  source: "wikipedia",
  minutes: 5,
  oldScore: 4,
  url: `https://en.wikipedia.org/wiki/Piece_${n}`,
  excerpt: "An excerpt.",
  answers: [
    {
      model: "flash-lite",
      score: 7,
      kind: "curiosity",
      tags: ["a", "b"],
      topics: ["maps"],
    },
  ],
  ben: { score: null, kind: null, note: "" },
  ...over,
});

describe("renderCalibration / parseCalibration", () => {
  it("round-trips, including Ben's marks", () => {
    const entries = [
      entry(1),
      entry(2, {
        ben: { score: 3, kind: "essay", note: "a stub" },
      }),
    ];
    const parsed = parseCalibration(renderCalibration(entries));
    expect(parsed).toEqual(entries);
  });

  it("reads hand-typed marks leniently", () => {
    const md = renderCalibration([entry(1)])
      .replace("- ben-score: ", "- ben-score: 8")
      .replace("- ben-kind: ", "- ben-kind: Criticism");
    expect(parseCalibration(md)[0]!.ben).toEqual({
      score: 8,
      kind: "criticism",
      note: "",
    });
  });

  // docs/writing-calibration.md was written with a `timeliness` column and `ben-news` lines;
  // Ben's marks in it must still read after the news rule went (09-30-26).
  it("reads a file written before the news rule went", () => {
    const old = `## 1. Spikelet

- item: wikipedia:Spikelet · abc
- source: wikipedia · minutes: 1 · old score: 4
- link: https://en.wikipedia.org/wiki/Spikelet · /i/abc

> An excerpt.

| model | score | kind | timeliness | tags | topics |
| --- | --- | --- | --- | --- | --- |
| flash-lite | 7 | curiosity | timeless | botany, odd | botany |

- ben-score: 8
- ben-kind: curiosity
- ben-news: no
- note: a shard
`;
    const [e] = parseCalibration(old);
    expect(e!.answers).toEqual([
      {
        model: "flash-lite",
        score: 7,
        kind: "curiosity",
        tags: ["botany", "odd"],
        topics: ["botany"],
      },
    ]);
    expect(e!.ben).toEqual({ score: 8, kind: "curiosity", note: "a shard" });
  });
});

describe("calibrationReport", () => {
  const marked = [
    entry(1, { ben: { score: 7, kind: "curiosity", note: "" } }),
    entry(2, {
      answers: [
        {
          model: "flash-lite",
          score: 9,
          kind: "essay",
          tags: [],
          topics: [],
        },
      ],
      ben: { score: 3, kind: "essay", note: "" },
    }),
    entry(3, {
      answers: [
        {
          model: "flash-lite",
          score: 2,
          kind: "archive",
          tags: [],
          topics: [],
        },
      ],
      ben: { score: 4, kind: "curiosity", note: "" },
    }),
    entry(4), // unmarked — ignored
  ];

  it("measures agreement per model over the marked entries only", () => {
    const [r] = calibrationReport(marked);
    expect(r!.model).toBe("flash-lite");
    expect(r!.marked).toBe(3);
    expect(r!.mae).toBeCloseTo((0 + 6 + 2) / 3);
    expect(r!.confusion.curiosity.archive).toBe(1);
    expect(r!.confusion.essay.essay).toBe(1);
    expect(r!.worst[0]!.n).toBe(2);
  });
});
