// How a new vision judge is accepted (docs/DESIGN_claude-judge-ingest.md D8): the pure half of
// `bun run vision:compare`. Writing has Ben's forty marks to calibrate against; pictures have
// none. What they have is ~170,000 scores from the judge Ben has been reading the feed through
// for two months, so a new judge is compared with *that*: does it rank pictures the same way,
// does it shift a source's average, and where it disagrees most, who is right? The last question
// is Ben's, and the report ends with the twenty pictures to look at.

import { spearman } from "./writing-calibration";

export type VisionPair = {
  itemId: string;
  source: string;
  title: string;
  /** The stored score, from the judge that ingested it. */
  old: number;
  /** The new judge's score for the same picture. */
  next: number;
};

export type VisionReport = {
  n: number;
  meanOld: number;
  meanNew: number;
  /** Mean absolute difference. */
  mae: number;
  spearman: number;
  /** Share of pictures the two judges put within one point of each other. */
  within1: number;
  /** Share scoring 8 or more under each judge — the band the landing reel and re-curation read. */
  top8Old: number;
  top8New: number;
  perSource: { source: string; n: number; shift: number; mae: number }[];
  worst: VisionPair[];
};

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export function visionReport(pairs: readonly VisionPair[]): VisionReport {
  const share = (test: (p: VisionPair) => boolean) =>
    pairs.length ? pairs.filter(test).length / pairs.length : 0;
  const sources = [...new Set(pairs.map((p) => p.source))];
  return {
    n: pairs.length,
    meanOld: mean(pairs.map((p) => p.old)),
    meanNew: mean(pairs.map((p) => p.next)),
    mae: mean(pairs.map((p) => Math.abs(p.next - p.old))),
    spearman: spearman(
      pairs.map((p) => p.old),
      pairs.map((p) => p.next),
    ),
    within1: share((p) => Math.abs(p.next - p.old) <= 1),
    top8Old: share((p) => p.old >= 8),
    top8New: share((p) => p.next >= 8),
    perSource: sources
      .map((source) => {
        const own = pairs.filter((p) => p.source === source);
        return {
          source,
          n: own.length,
          shift: mean(own.map((p) => p.next - p.old)),
          mae: mean(own.map((p) => Math.abs(p.next - p.old))),
        };
      })
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)),
    worst: [...pairs]
      .sort((a, b) => Math.abs(b.next - b.old) - Math.abs(a.next - a.old))
      .slice(0, 20),
  };
}

export function renderVision(
  report: VisionReport,
  meta: { model: string; excluded: number; date: string },
): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return [
    `# Vision comparison — ${meta.model} against the stored scores (${meta.date})`,
    "",
    `${report.n} pictures compared, ${meta.excluded} excluded (image not fetched, or the judgment failed).`,
    "",
    `- mean score: stored ${f(report.meanOld)} → new ${f(report.meanNew)}`,
    `- mean absolute difference: ${f(report.mae)}`,
    `- Spearman rank agreement: ${f(report.spearman)}`,
    `- within one point: ${pct(report.within1)}`,
    `- scoring 8 or more: stored ${pct(report.top8Old)} → new ${pct(report.top8New)}`,
    "",
    "Proposed bar (D8): Spearman ≥ 0.60, mean shift within ±0.5, no source shifting more than 1.0. The verdict is Ben's.",
    "",
    "## By source (largest shift first)",
    "",
    "| source | n | shift | MAE |",
    "| --- | --- | --- | --- |",
    ...report.perSource.map(
      (r) =>
        `| ${r.source} | ${r.n} | ${r.shift >= 0 ? "+" : ""}${f(r.shift)} | ${f(r.mae)} |`,
    ),
    "",
    "## The largest disagreements — look at these",
    "",
    ...report.worst.map(
      (p) =>
        `- stored **${p.old}**, new **${p.next}** — ${p.source}: [${p.title.slice(0, 70)}](http://localhost:3000/i/${p.itemId})`,
    ),
    "",
  ].join("\n");
}
