// What `/api/health` says about the weekly ingests (Phase 8.2, PHASE8_PLAN_8.2.md D3) — the pure
// half, so the one number in it (eight days and six hours) has a test instead of a comment.
//
// The question it answers is not "did the last run fail?" — Coolify's failure notification and the
// ingest's own exit code (runVerdict) cover that — but "has a run *succeeded* recently?", which is
// the only way to notice a run that never happened at all: a stopped scheduler, a container that
// was mid-restart at 01:30, a task someone disabled. None of those produce a failure to report.
// They produce silence, and silence is only visible as time since the last success.

/** `never` is a fresh database (or one that has only ever seen failed runs). */
export type IngestStatus = "ok" | "stale" | "never";

/**
 * How old a kind's last successful run may be before it reads `stale`. The cadence is weekly
 * (pictures Monday, writing Thursday, 08:00 UTC) with a catch-up run the following night for a
 * run that stopped at the Claude judge's ceiling — so a healthy kind's successes can be eight
 * days apart: last Monday's, then next Tuesday's. Six hours on top covers a long run and a late
 * start. It was 30 hours while the ingest was nightly (8.2); under a weekly schedule that read
 * `stale` six days in seven.
 */
export const INGEST_STALE_AFTER_MS = (8 * 24 + 6) * 60 * 60 * 1000;

export function ingestStatus(
  lastSuccessAt: Date | null,
  now: Date,
): IngestStatus {
  if (lastSuccessAt === null) return "never";
  return now.getTime() - lastSuccessAt.getTime() < INGEST_STALE_AFTER_MS
    ? "ok"
    : "stale";
}

/**
 * One word for several kinds: the worst of them. `ok` only when every kind is ok — which is
 * what lets the outside monitor keep matching the single keyword `"ingest":"ok"` while the
 * route's `ingestKinds` says which job went quiet.
 */
export function worstIngestStatus(
  statuses: readonly IngestStatus[],
): IngestStatus {
  if (statuses.includes("never")) return "never";
  return statuses.includes("stale") ? "stale" : "ok";
}
