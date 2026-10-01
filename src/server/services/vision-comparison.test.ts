import { describe, expect, it } from "vitest";

import {
  renderVision,
  visionReport,
  type VisionPair,
} from "./vision-comparison";

const pair = (
  source: string,
  old: number,
  next: number,
  n = 0,
): VisionPair => ({
  itemId: `${source}-${old}-${next}-${n}`,
  source,
  title: `${source} ${n}`,
  old,
  next,
});

describe("visionReport", () => {
  const pairs = [
    pair("met", 8, 8),
    pair("met", 6, 7),
    pair("met", 9, 6),
    pair("loc", 4, 5),
    pair("loc", 7, 7),
  ];
  const report = visionReport(pairs);

  it("summarises the whole sample", () => {
    expect(report.n).toBe(5);
    expect(report.meanOld).toBeCloseTo(6.8);
    expect(report.meanNew).toBeCloseTo(6.6);
    expect(report.mae).toBeCloseTo(1.0);
    expect(report.within1).toBeCloseTo(0.8);
    expect(report.top8Old).toBeCloseTo(0.4);
    expect(report.top8New).toBeCloseTo(0.2);
  });
  it("breaks the shift down by source, largest shift first", () => {
    expect(report.perSource.map((r) => r.source)).toEqual(["met", "loc"]);
    expect(report.perSource[0]).toMatchObject({ n: 3, shift: -2 / 3 });
    expect(report.perSource[1]?.shift).toBeCloseTo(0.5);
  });
  it("lists the largest disagreements first", () => {
    expect(report.worst[0]).toMatchObject({ source: "met", old: 9, next: 6 });
  });
  it("is empty-safe", () => {
    expect(visionReport([]).n).toBe(0);
  });
});

describe("renderVision", () => {
  it("writes a table per source and a link per disagreement", () => {
    const md = renderVision(visionReport([pair("met", 9, 6)]), {
      model: "claude-haiku-4-5-20251001",
      excluded: 2,
      date: "10-02-26",
    });
    expect(md).toContain("| met ");
    expect(md).toContain("http://localhost:3000/i/met-9-6-0");
    expect(md).toContain("2 excluded");
  });
});
