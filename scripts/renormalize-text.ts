#!/usr/bin/env bun
/**
 * Re-normalise `item.title` / `item.summary` rows that still carry source HTML — the repair half
 * of Phase 8.1's markup fix (the Phase 7.2 finding: 41 rows of `<i>`/`<em>` italics that four
 * adapters had passed through verbatim, reader-visible on the item page as literal `<i>`).
 *
 * The adapters now run both fields through htmlToText() at ingest, so no *new* row can arrive
 * like this — but scripts/ingest.ts skips any (source, sourceId) already upserted, so an existing
 * row is never re-normalised by an ingest run, no matter what. This script closes that gap, with
 * the same shape as `retire`: report by default, write only with `--confirm`.
 *
 *   bun run renormalize                      # report: per-source counts + before/after samples
 *   bun run renormalize --confirm            # rewrite those rows, one transaction
 *   bun run renormalize --source wellcome    # either of the above, one source only
 *
 * It selects with the *narrow* tag regex `source-invariants.test.ts` uses (`<p>`, `</i>`,
 * `<a href=…>` — never a bare `<` in prose), then applies the very same htmlToText() the adapters
 * do, so a repaired row is byte-for-byte what a fresh ingest would have produced. Safe to re-run:
 * a second pass finds zero rows. Production runs it once, after the deploy that carries the
 * adapter fix, via `docker exec "$C" bun run renormalize --confirm`.
 */
import { and, eq, or, sql } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { ALL_SOURCE_IDS } from "~/server/services/sources";
import { htmlToText } from "~/server/services/sources/normalize";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const source = flag("source");
const confirm = args.includes("--confirm");

if (source && !(ALL_SOURCE_IDS as string[]).includes(source)) {
  console.error(
    `unknown source "${source}" — known: ${ALL_SOURCE_IDS.join(", ")}`,
  );
  process.exit(1);
}

/** A real tag — an element name (or `/` + name) right after the `<`. Same as the invariant test. */
const TAG = "<[a-zA-Z/][^>]*>";

const rows = await db
  .select({
    id: item.id,
    source: item.source,
    title: item.title,
    summary: item.summary,
  })
  .from(item)
  .where(
    and(
      or(sql`${item.title} ~ ${TAG}`, sql`${item.summary} ~ ${TAG}`),
      source ? eq(item.source, source) : undefined,
    ),
  )
  .orderBy(item.source, item.sourceId);

const repairs = rows.map((r) => ({
  ...r,
  newTitle: htmlToText(r.title),
  newSummary: r.summary === null ? null : htmlToText(r.summary),
}));

const bySource = new Map<string, number>();
for (const r of repairs)
  bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);

console.log(`${repairs.length} row(s) carry markup in title or summary`);
for (const [s, n] of [...bySource].sort((a, b) => b[1] - a[1]))
  console.log(`  ${s.padEnd(16)} ${n}`);

// Show the first change per source so a dry run is a *readable* proof, not just a count.
const shown = new Set<string>();
for (const r of repairs) {
  if (shown.has(r.source)) continue;
  shown.add(r.source);
  const field = r.title !== r.newTitle ? "title" : "summary";
  const before = field === "title" ? r.title : r.summary;
  const after = field === "title" ? r.newTitle : r.newSummary;
  console.log(`\n  ${r.source}/${r.id} ${field}:`);
  console.log(`    - ${before}`);
  console.log(`    + ${after}`);
}

if (!confirm) {
  console.log(
    `\nDry run — nothing written. Re-run with --confirm to rewrite ${repairs.length} row(s).`,
  );
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const r of repairs) {
    await tx
      .update(item)
      .set({ title: r.newTitle, summary: r.newSummary })
      .where(eq(item.id, r.id));
  }
});
console.log(`\nRewrote ${repairs.length} row(s).`);
process.exit(0);
