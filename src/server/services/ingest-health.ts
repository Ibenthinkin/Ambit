// What `/api/health` says about the nightly ingest (Phase 8.2, PHASE8_PLAN_8.2.md D3) — the pure
// half, so the one number in it (30 hours) has a test instead of a comment.
//
// The question it answers is not "did the last run fail?" — Coolify's failure notification and the
// ingest's own exit code (runVerdict) cover that — but "has a run *succeeded* recently?", which is
// the only way to notice a run that never happened at all: a stopped scheduler, a container that
// was mid-restart at 01:30, a task someone disabled. None of those produce a failure to report.
// They produce silence, and silence is only visible as time since the last success.

/** `never` is a fresh database (or one that has only ever seen failed runs). */
export type IngestStatus = "ok" | "stale" | "never";

/**
 * How old the last successful run may be before it reads `stale`: the nightly cadence (24 h) plus
 * room for one long run and a late start. A full ingest has taken ~70 min, a big walk night
 * longer; 30 h tolerates a run that starts at 01:30 and finishes at 04:00 being compared against
 * the next evening's check, without letting a whole skipped night slip past.
 */
export const INGEST_STALE_AFTER_MS = 30 * 60 * 60 * 1000;

export function ingestStatus(
  lastSuccessAt: Date | null,
  now: Date,
): IngestStatus {
  if (lastSuccessAt === null) return "never";
  return now.getTime() - lastSuccessAt.getTime() < INGEST_STALE_AFTER_MS
    ? "ok"
    : "stale";
}
