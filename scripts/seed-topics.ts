// Seed script: load the sixteen v1 topics from config into the `topic` table (SPEC §5.2).
// Run with `bun run db:seed`. Safe to re-run — that's the whole point of it.
//
// This is a *config load*, not a user-facing repository operation, which is why it writes to the
// table directly rather than going through server/db/topics.ts (whose header says as much). It
// also has to run before anything can be ingested: item.topic_id is NOT NULL REFERENCES topic(id),
// so an empty `topic` table means Phase 3.4's ingestion can't insert a single row.
//
// Note this uses a different idempotency idiom than scripts/invite.ts, deliberately. An invite is
// user data — re-running must never overwrite it, so invite.ts reads first and bails. Topics are
// config: if someone edits a label or adds a seed query in topics.ts, re-seeding *should* push
// that change through. Hence upsert-with-update below. Same goal (a second run is safe), opposite
// treatment of an existing row, because the two kinds of data want opposite things.
import { sql } from "drizzle-orm";

import type { SeedQueries } from "~/server/config/topics";
import { SEED_SOURCES, TOPICS } from "~/server/config/topics";
import { db } from "~/server/db/client";
import { topic } from "~/server/db/schema";

/**
 * Compare seed queries the way Postgres stores them, not the way we wrote them.
 *
 * JSONB is not a verbatim copy of the JSON it was given — it normalizes object key order (shortest
 * key first, then bytewise), so `{wikipedia, met, aic, ...}` comes back as `{aic, cma, met, ...}`.
 * A naive `JSON.stringify` comparison therefore reports *every* topic as changed on every run.
 * Walking a fixed key list sidesteps that. Array order inside each source is meaningful and *is*
 * preserved by JSONB, so it's compared as-is.
 */
function seedQueriesEqual(a: SeedQueries, b: SeedQueries): boolean {
  // SEED_SOURCES, not V1_SOURCES: since Phase 6.2 a topic can carry trial-source cells too, and
  // walking only the v1 six would report "unchanged" for a run that in fact rewrote them — the
  // upsert would still be correct, but the summary would be lying about what it did.
  return SEED_SOURCES.every((source) => {
    const [x, y] = [a[source] ?? [], b[source] ?? []];
    return x.length === y.length && x.every((q, i) => q === y[i]);
  });
}

async function main() {
  const existing = await db.select().from(topic);
  const byId = new Map(existing.map((row) => [row.id, row]));

  // Classify before writing, so the summary can tell the truth about what actually changed. An
  // unconditional upsert would report "16 written" on every run, which is noise dressed as work.
  const isNew: string[] = [];
  const changed: string[] = [];

  for (const t of TOPICS) {
    const row = byId.get(t.id);
    if (!row) {
      isNew.push(t.id);
    } else if (
      row.label !== t.label ||
      !seedQueriesEqual(row.seedQueries as SeedQueries, t.seedQueries)
    ) {
      changed.push(t.id);
    }
  }

  await db
    .insert(topic)
    .values(
      TOPICS.map((t) => ({
        id: t.id,
        label: t.label,
        seedQueries: t.seedQueries,
      })),
    )
    .onConflictDoUpdate({
      target: topic.id,
      set: {
        label: sql`excluded.label`,
        seedQueries: sql`excluded.seed_queries`,
      },
    });

  // Never delete. A stale row is almost certainly still referenced by item.topic_id or
  // user_topic.topic_id, so dropping it would either fail on the FK or orphan real user data —
  // retiring a topic is a migration with a plan, not a side effect of running the seeder.
  const orphans = existing.filter(
    (row) => !TOPICS.some((t) => t.id === row.id),
  );
  for (const row of orphans) {
    console.warn(
      `Warning: topic "${row.id}" is in the database but not in topics.ts — left untouched.`,
    );
  }

  const unchanged = TOPICS.length - isNew.length - changed.length;
  if (isNew.length === 0 && changed.length === 0) {
    console.log(`${TOPICS.length} topics already up to date — nothing to do.`);
  } else {
    console.log(
      `Seeded ${TOPICS.length} topics: ${isNew.length} new, ${changed.length} updated, ${unchanged} unchanged.`,
    );
    if (isNew.length) console.log(`  new:     ${isNew.join(", ")}`);
    if (changed.length) console.log(`  updated: ${changed.join(", ")}`);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("seed-topics script failed:", err);
  process.exit(1);
});
