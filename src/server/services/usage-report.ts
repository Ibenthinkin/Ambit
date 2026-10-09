// The markdown half of `bun run usage:report` (docs/DESIGN_usage.md, Cut 0). Pure: it takes the
// numbers the readers in `db/usage.ts` produced and turns them into text, with no database and
// no clock, so a hand-built `ReportData` in the test is enough to prove every line.
//
// One rule runs through it: a reader is `#3 (joined 09-20)`, never an email. The digest may be
// pasted into a chat, and the readers never put an email into `ReportData` in the first place —
// only opaque user ids, which this file maps to labels and then drops.
//
// The imports below are `import type`: they vanish at compile time, so this file never pulls in
// `db/usage.ts` (and through it the database client) — important because CI runs unit tests with
// no environment at all.
import type {
  OnboardingSummary,
  ReaderActivity,
  ReaderLabel,
  RetentionWeek,
  SaveRate,
  SignInDay,
  Sitting,
  SourceShare,
} from "~/server/db/usage";

export type ReportData = {
  window: { since: Date; until: Date };
  /** How many weeks of retention `retention` covers (only used for its caption). */
  weeks: number;
  labels: ReaderLabel[];
  readers: ReaderActivity[];
  sittings: Sitting[];
  saves: SaveRate;
  onboarding: OnboardingSummary[];
  signIns: SignInDay[];
  sources: SourceShare[];
  retention: RetentionWeek[];
};

export type SittingSummary = {
  userId: string;
  sittings: number;
  medianServed: number;
  medianMinutes: number;
};

/** Median of a non-empty list; the mean of the middle pair when the count is even. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * One row per reader instead of one per sitting (a week of sittings is unreadable): how many
 * sittings, and the median items served and minutes long. Median, not mean, so a single
 * left-open tab does not drag the picture.
 */
export function summariseSittings(all: Sitting[]): SittingSummary[] {
  const byUser = new Map<string, Sitting[]>();
  for (const s of all)
    byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  return [...byUser.entries()].map(([userId, list]) => ({
    userId,
    sittings: list.length,
    medianServed: median(list.map((s) => s.served)),
    medianMinutes: median(
      list.map((s) => (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000),
    ),
  }));
}

// ---- formatting helpers ---------------------------------------------------------------------

const mmdd = (d: Date) => d.toISOString().slice(5, 10);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** At most one decimal, no trailing ".0". */
const num = (n: number) => String(Math.round(n * 10) / 10);
const pct = (x: number) => `${num(x * 100)}%`;

/** A markdown table; the header row is the first array. */
function table(rows: string[][]): string {
  const [head, ...body] = rows;
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(head!), line(head!.map(() => "---")), ...body.map(line)].join(
    "\n",
  );
}

const NOBODY = "_Nobody in this window._";

export function renderReport(d: ReportData): string {
  const byId = new Map(d.labels.map((l) => [l.userId, l]));
  // A reader we have no label for (deleted between the two queries) stays anonymous.
  const who = (id: string) => {
    const l = byId.get(id);
    return l ? `#${l.n} (joined ${mmdd(l.joinedAt)})` : "#? (unknown)";
  };
  const num_ = (id: string) => byId.get(id)?.n ?? Infinity;
  const byReader = <T extends { userId: string }>(xs: T[]) =>
    [...xs].sort((a, b) => num_(a.userId) - num_(b.userId));
  const section = (title: string, body: string) => `## ${title}\n\n${body}`;

  const out: string[] = [
    `# Ambit usage\n\nWindow: ${ymd(d.window.since)} to ${ymd(d.window.until)} (UTC, end exclusive). Personas and e2e accounts are left out.`,

    section(
      "Readers",
      d.readers.length === 0
        ? NOBODY
        : table([
            ["Reader", "Days", "Served", "Saved", "First", "Last"],
            ...byReader(d.readers).map((r) => [
              who(r.userId),
              String(r.days),
              String(r.served),
              String(r.saves),
              ymd(r.firstAt),
              ymd(r.lastAt),
            ]),
          ]),
    ),

    section(
      "Sittings",
      d.sittings.length === 0
        ? NOBODY
        : table([
            ["Reader", "Sittings", "Median items", "Median minutes"],
            ...byReader(summariseSittings(d.sittings)).map((s) => [
              who(s.userId),
              String(s.sittings),
              num(s.medianServed),
              num(s.medianMinutes),
            ]),
          ]),
    ),

    section(
      "Saves",
      `${d.saves.saves} saved of ${d.saves.served} served: **${num(d.saves.perHundred)} per hundred**.`,
    ),

    section(
      "Onboarding",
      d.onboarding.length === 0
        ? NOBODY
        : table([
            ["Reader", "Runs", "Skipped in latest", "Free text"],
            ...byReader(d.onboarding).map((o) => [
              who(o.userId),
              String(o.runs),
              String(o.skippedInLatest),
              o.freeText ? "yes" : "no",
            ]),
          ]),
    ),

    section(
      "Sign-ins",
      d.signIns.length === 0
        ? NOBODY
        : table([
            ["Day", "Sessions", "Readers"],
            ...d.signIns.map((s) => [
              s.day,
              String(s.sessions),
              String(s.readers),
            ]),
          ]),
    ),

    section(
      "Sources",
      d.sources.length === 0
        ? "_No sources._"
        : "Ratio is share served over share of the drawable corpus; above 1 the feed over-shows the source.\n\n" +
            table([
              [
                "Source",
                "Served",
                "Served share",
                "Corpus",
                "Corpus share",
                "Ratio",
              ],
              ...d.sources.map((s) => [
                s.source,
                String(s.served),
                pct(s.servedShare),
                String(s.corpus),
                pct(s.corpusShare),
                s.ratio === null ? "n/a" : num(s.ratio),
              ]),
            ]),
    ),

    section(
      "Retention",
      d.retention.length === 0
        ? NOBODY
        : `Last ${d.weeks} weeks; a week starts on its Monday (UTC).\n\n` +
            table([
              ["Week of", "Active", "Returning"],
              ...d.retention.map((w) => [
                w.week,
                String(w.active),
                String(w.returning),
              ]),
            ]),
    ),
  ];
  return out.join("\n\n") + "\n";
}
