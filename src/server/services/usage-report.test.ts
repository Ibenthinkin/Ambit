import { describe, expect, it } from "vitest";

import {
  renderReport,
  summariseSittings,
  type ReportData,
} from "./usage-report";

const MIN = 60_000;
const t = (iso: string, plusMin = 0) =>
  new Date(new Date(iso).getTime() + plusMin * MIN);

const data: ReportData = {
  window: {
    since: new Date("2026-10-02T00:00:00Z"),
    until: new Date("2026-10-09T00:00:00Z"),
  },
  weeks: 2,
  labels: [
    { userId: "u1", n: 1, joinedAt: new Date("2026-09-20T10:00:00Z") },
    { userId: "u2", n: 2, joinedAt: new Date("2026-09-22T10:00:00Z") },
    { userId: "u3", n: 3, joinedAt: new Date("2026-09-25T10:00:00Z") },
  ],
  readers: [
    {
      userId: "u1",
      days: 3,
      served: 120,
      saves: 6,
      firstAt: t("2026-10-02T10:00:00Z"),
      lastAt: t("2026-10-06T10:00:00Z"),
    },
    {
      userId: "u3",
      days: 1,
      served: 12,
      saves: 0,
      firstAt: t("2026-10-03T10:00:00Z"),
      lastAt: t("2026-10-03T10:00:00Z"),
    },
  ],
  sittings: [
    {
      userId: "u1",
      startedAt: t("2026-10-02T10:00:00Z"),
      endedAt: t("2026-10-02T10:00:00Z", 10),
      served: 30,
    },
    {
      userId: "u1",
      startedAt: t("2026-10-04T10:00:00Z"),
      endedAt: t("2026-10-04T10:00:00Z", 20),
      served: 50,
    },
    {
      userId: "u1",
      startedAt: t("2026-10-06T10:00:00Z"),
      endedAt: t("2026-10-06T10:00:00Z", 30),
      served: 40,
    },
    {
      userId: "u3",
      startedAt: t("2026-10-03T10:00:00Z"),
      endedAt: t("2026-10-03T10:00:00Z", 4),
      served: 12,
    },
  ],
  saves: { served: 132, saves: 6, perHundred: 4.545 },
  onboarding: [{ userId: "u3", runs: 2, skippedInLatest: 5, freeText: true }],
  signIns: [
    { day: "2026-10-02", sessions: 2, readers: 1 },
    { day: "2026-10-03", sessions: 1, readers: 1 },
  ],
  sources: [
    {
      source: "pdr",
      served: 40,
      servedShare: 0.3,
      corpus: 100,
      corpusShare: 0.1,
      ratio: 3,
    },
    {
      source: "ghost",
      served: 2,
      servedShare: 0.02,
      corpus: 0,
      corpusShare: 0,
      ratio: null,
    },
  ],
  retention: [
    { week: "2026-09-28", active: 2, returning: 0 },
    { week: "2026-10-05", active: 2, returning: 1 },
  ],
};

describe("summariseSittings", () => {
  it("gives each reader a count and the median of items and minutes", () => {
    expect(summariseSittings(data.sittings)).toEqual([
      { userId: "u1", sittings: 3, medianServed: 40, medianMinutes: 20 },
      { userId: "u3", sittings: 1, medianServed: 12, medianMinutes: 4 },
    ]);
  });
  it("takes the mean of the middle pair for an even count", () => {
    const s = (served: number, min: number) => ({
      userId: "x",
      startedAt: t("2026-10-02T10:00:00Z"),
      endedAt: t("2026-10-02T10:00:00Z", min),
      served,
    });
    expect(summariseSittings([s(10, 2), s(20, 4)])[0]).toMatchObject({
      medianServed: 15,
      medianMinutes: 3,
    });
  });
});

describe("renderReport", () => {
  it("renders the seven sections in order, readers as #N and never an email", () => {
    const md = renderReport(data);
    const heads = md.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual([
      "## Readers",
      "## Sittings",
      "## Saves",
      "## Onboarding",
      "## Sign-ins",
      "## Sources",
      "## Retention",
    ]);
    expect(md).not.toContain("@");
    expect(md).toMatchInlineSnapshot(`
      "# Ambit usage

      Window: 2026-10-02 to 2026-10-09 (UTC, end exclusive). Personas and e2e accounts are left out.

      ## Readers

      | Reader | Days | Served | Saved | First | Last |
      | --- | --- | --- | --- | --- | --- |
      | #1 (joined 09-20) | 3 | 120 | 6 | 2026-10-02 | 2026-10-06 |
      | #3 (joined 09-25) | 1 | 12 | 0 | 2026-10-03 | 2026-10-03 |

      ## Sittings

      | Reader | Sittings | Median items | Median minutes |
      | --- | --- | --- | --- |
      | #1 (joined 09-20) | 3 | 40 | 20 |
      | #3 (joined 09-25) | 1 | 12 | 4 |

      ## Saves

      6 saved of 132 served: **4.5 per hundred**.

      ## Onboarding

      | Reader | Runs | Skipped in latest | Free text |
      | --- | --- | --- | --- |
      | #3 (joined 09-25) | 2 | 5 | yes |

      ## Sign-ins

      | Day | Sessions | Readers |
      | --- | --- | --- |
      | 2026-10-02 | 2 | 1 |
      | 2026-10-03 | 1 | 1 |

      ## Sources

      Ratio is share served over share of the drawable corpus; above 1 the feed over-shows the source.

      | Source | Served | Served share | Corpus | Corpus share | Ratio |
      | --- | --- | --- | --- | --- | --- |
      | pdr | 40 | 30% | 100 | 10% | 3 |
      | ghost | 2 | 2% | 0 | 0% | n/a |

      ## Retention

      Last 2 weeks; a week starts on its Monday (UTC).

      | Week of | Active | Returning |
      | --- | --- | --- |
      | 2026-09-28 | 2 | 0 |
      | 2026-10-05 | 2 | 1 |
      "
    `);
  });

  it("says so when a section has no rows", () => {
    const md = renderReport({
      ...data,
      readers: [],
      sittings: [],
      onboarding: [],
      signIns: [],
      sources: [],
      retention: [],
    });
    expect(md).toContain("_Nobody in this window._");
  });
});
