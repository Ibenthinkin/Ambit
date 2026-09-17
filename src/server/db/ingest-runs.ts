// Repository for `ingest_run` (Phase 8.2) — the two things anything does with that table: the
// ingest script writes a row at the end of each real run, and `/api/health` reads when the newest
// successful one finished. See the table's comment in schema.ts for why the app keeps this record
// at all rather than trusting the scheduler's.
import { and, desc, eq } from "drizzle-orm";

import { db } from "~/server/db/client";
import { ingestRun } from "~/server/db/schema";

export type NewIngestRun = typeof ingestRun.$inferInsert;

export async function recordIngestRun(row: NewIngestRun): Promise<void> {
  await db.insert(ingestRun).values(row);
}

/**
 * When the newest successful real run finished, or null if there has never been one. "Successful"
 * is `exit_code = 0` — a run that exited 2 (a dead source) or 1 (threw) does not keep the health
 * field green, which is the point: two nights of a dead key must go `stale`, not stay `ok`.
 * Ordered on the indexed `finished_at`, so this is one index scan however long the table gets.
 */
export async function lastSuccessfulIngestAt(): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: ingestRun.finishedAt })
    .from(ingestRun)
    .where(and(eq(ingestRun.exitCode, 0), eq(ingestRun.dryRun, false)))
    .orderBy(desc(ingestRun.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}
