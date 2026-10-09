import { describe, expect, it } from "vitest";

import {
  renderMail,
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
  visits: {
    count: 9,
    signedOut: 2,
    medianSeconds: 390,
    p90Seconds: 1500,
    device: { phone: 6, desktop: 3 },
    via: { standalone: 3, browser: 6 },
    standaloneShare: 1 / 3,
  },
  screens: {
    visits: 9,
    total: 27,
    mean: 3,
    median: 2,
    max: 8,
    byScreen: { feed: 12, item: 10, saved: 5 },
  },
  opens: {
    opens: 10,
    perVisit: 1.1,
    from: { feed: 7, rail: 3 },
    swipe: { runs: 2, median: 2.5, max: 4 },
  },
  actions: {
    opens: 10,
    linkout: { count: 2, per100: 20 },
    share: { count: 1, per100: 10, byMethod: { native: 1 } },
    zoom: { count: 0, per100: 0 },
    magazine: { count: 3, per100: 30 },
    unsave: { count: 0, per100: 0 },
  },
  topicEdits: { total: 3, byAction: { add: 2, remove: 1 } },
  funnel: {
    readers: 3,
    reached: [3, 3, 2, 2, 1, 1, 1, 1],
    stoppedAt: [0, 1, 0, 1, 0, 0, 0, 1],
  },
  installs: { prompt: 1, card: 2 },
  errors: [{ digest: "d41d8c", screen: "feed", count: 4 }],
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
  it("renders the fifteen sections in order, readers as #N and never an email", () => {
    const md = renderReport(data);
    const heads = md.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual([
      "## Readers",
      "## Sittings",
      "## Saves",
      "## Onboarding",
      "## Sign-ins",
      "## Sources",
      "## Visits",
      "## Screens",
      "## Items",
      "## Topic edits",
      "## Onboarding funnel",
      "## Installs",
      "## Errors",
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

      ## Visits

      | Measure | Value |
      | --- | --- |
      | Visits | 9 |
      | Signed out | 2 |
      | Median active minutes | 6.5 |
      | 90th percentile active minutes | 25 |
      | Device | phone 6, desktop 3 |
      | Opened via | browser 6, standalone 3 |
      | Installed-app share | 33.3% |

      ## Screens

      Per visit: mean 3, median 2, max 8.

      | Screen | Count |
      | --- | --- |
      | feed | 12 |
      | item | 10 |
      | saved | 5 |

      ## Items

      | Measure | Value |
      | --- | --- |
      | Opened | 10 |
      | Per visit | 1.1 |
      | Opened from | feed 7, rail 3 |
      | Swipe runs (median / max depth) | 2 (2.5 / 4) |
      | Link-outs | 2 (20 per 100) |
      | Shares | 1 (10 per 100) — native 1 |
      | Zooms | 0 (0 per 100) |
      | Magazine view | 3 (30 per 100) |
      | Unsaves | 0 (0 per 100) |

      ## Topic edits

      3 in all.

      | Action | Count |
      | --- | --- |
      | add | 2 |
      | remove | 1 |

      ## Onboarding funnel

      3 started; each reader's latest visit.

      | Step | Reached | Stopped here |
      | --- | --- | --- |
      | 1 | 3 | 0 |
      | 2 | 3 | 1 |
      | 3 | 2 | 0 |
      | 4 | 2 | 1 |
      | 5 | 1 | 0 |
      | 6 | 1 | 0 |
      | 7 | 1 | 0 |
      | 8 | 1 | 1 |

      ## Installs

      | How | Count |
      | --- | --- |
      | card | 2 |
      | prompt | 1 |

      ## Errors

      | Digest | Screen | Count |
      | --- | --- | --- |
      | d41d8c | feed | 4 |

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
      visits: { ...data.visits, count: 0 },
      screens: { ...data.screens, visits: 0, byScreen: {} },
      opens: { ...data.opens, opens: 0 },
      topicEdits: { total: 0, byAction: {} },
      funnel: { readers: 0, reached: [], stoppedAt: [] },
      installs: {},
      errors: [],
    });
    expect(md).toContain("_Nobody in this window._");
    for (const title of [
      "Visits",
      "Screens",
      "Items",
      "Topic edits",
      "Onboarding funnel",
      "Installs",
      "Errors",
    ])
      expect(md).toMatch(new RegExp(`## ${title}\\n\\n_[^\\n]*_\\n`));
  });
});

describe("renderMail", () => {
  it("subject names the week; the markdown is the text body", () => {
    expect(renderMail("# Ambit usage\n\nBody\n", "2026-10-02"))
      .toMatchInlineSnapshot(`
      {
        "subject": "Ambit — usage, week of 2026-10-02",
        "text": "# Ambit usage

      Body
      ",
      }
    `);
  });
});
