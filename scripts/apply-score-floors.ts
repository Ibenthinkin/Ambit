#!/usr/bin/env bun
/**
 * Lift stored rows to their source's score floor (10-01-26).
 *
 *   bun run floor:sources            # report only: per source, how many rows sit under the floor
 *   bun run floor:sources --confirm  # write
 *
 * `SOURCE_SCORE_FLOOR` (services/curator.ts) lifts a designated source's items as they are
 * judged; this applies the same floor to rows judged before it existed. Today that is one source
 * — Ben: "bump ALL DOP POSTS up to the 8 threshold whether you think they are dark or not" — so
 * every `doorofperception` row scored under 8 becomes 8, the grotesque ones included. Rows at or
 * above the floor are untouched.
 *
 * Nothing calls a model and nothing else about a row changes: tags, topics and memberships
 * stay. The judge's original score is still in the curation cache envelope, so this is
 * reversible by re-reading it. Idempotent — a second run finds nothing under the floor. Runs on
 * production inside the app container after a deploy, like the repair scripts.
 */
import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { SOURCE_SCORE_FLOOR } from "~/server/services/curator";

const confirm = process.argv.includes("--confirm");

for (const [source, floor] of Object.entries(SOURCE_SCORE_FLOOR)) {
  if (floor === undefined) continue;
  const under = and(eq(item.source, source), lt(item.curationScore, floor));
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      under: sql<number>`count(*) filter (where ${item.curationScore} < ${floor})::int`,
    })
    .from(item)
    .where(eq(item.source, source));
  console.log(
    `${source}: floor ${floor} — ${counts?.under ?? 0} of ${counts?.total ?? 0} rows are under it`,
  );
  if (confirm && (counts?.under ?? 0) > 0) {
    await db.update(item).set({ curationScore: floor }).where(under);
    console.log(`  lifted ${counts?.under} rows to ${floor}`);
  }
}
if (!confirm) console.log("\nreport only — pass --confirm to write");
process.exit(0);
