#!/usr/bin/env bun
/**
 * One-off body refresh for Wikipedia rows ingested before Phase 5.7.
 *
 * **Why it exists.** Until 5.7 the adapter asked MediaWiki for `exsectionformat=plain`, which
 * strips an article's `== Section ==` markers. The reader variant of `/i/[itemId]` typesets from
 * exactly those markers (`src/lib/reader-blocks.ts`), so every pre-5.7 row renders as one
 * undivided slab of text — correct, but not a reading experience. Going-forward ingests get
 * wiki-format automatically (the adapter is flipped); this script fixes the rows already in the
 * table.
 *
 * **What it deliberately does not do.** It touches `body` and nothing else — not `fetched_at`,
 * not `curation_score`, not the topic assignment. It never calls the curator and never goes
 * through `upsertItem`: the item is already curated and already placed, and re-running that
 * pipeline would spend LLM budget re-deciding settled questions. Politeness comes from
 * `fetchBody`'s own 120ms pre-request delay and retry-with-backoff, so the loop is sequential on
 * purpose — this is a slow script by design, not one to parallelize.
 *
 * **Its second job (09-28-26, docs/PLAN_writing.md Phase 2 §2): production has no bodies at all.**
 * Ingest never called `fetchBody` until then, so all ~3,191 production Wikipedia rows are
 * bodiless; `--only-missing` fills exactly those. It now also writes `reading_minutes`, which is
 * derived from the body and which nothing else would ever fill for an existing row. **Run it
 * before `recurate:writing`** — the writing curator should read the article, not its lede.
 *
 * Never in tests, never in CI.
 *
 * Usage:
 *   bun scripts/backfill-wikipedia-bodies.ts --limit 5 --dry-run   # smoke test, no writes
 *   bun scripts/backfill-wikipedia-bodies.ts --only-missing        # production: NULL bodies only
 *   bun scripts/backfill-wikipedia-bodies.ts --only-missing --offset 1200   # resume (id order)
 *   bun scripts/backfill-wikipedia-bodies.ts                       # refresh every row
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { readingMinutes } from "~/server/config/writing";
import { fetchBody } from "~/server/services/sources/wikipedia";

// ── CLI flags ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}

const limitFlag = flagValue("limit");
const limit = limitFlag === undefined ? undefined : Number(limitFlag);
const dryRun = args.includes("--dry-run");
const onlyMissing = args.includes("--only-missing");
const offsetFlag = flagValue("offset");
const offset = Number(offsetFlag ?? 0);
if (!Number.isFinite(offset) || offset < 0) {
  console.error(`--offset must be a non-negative number, got "${offsetFlag}"`);
  process.exit(1);
}

if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
  console.error(`--limit must be a positive number, got "${limitFlag}"`);
  process.exit(1);
}

// ── the run ────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();

  const rows = await db
    .select({ id: item.id, sourceId: item.sourceId, title: item.title })
    .from(item)
    .where(
      onlyMissing
        ? and(eq(item.source, "wikipedia"), isNull(item.body))
        : eq(item.source, "wikipedia"),
    )
    // A stable order so `--offset` resumes where a killed run stopped. Under --only-missing the
    // rows already filled drop out of the set, so a resume there is simply a re-run.
    .orderBy(item.id)
    .limit(limit ?? Number.MAX_SAFE_INTEGER)
    .offset(offset);

  console.log(
    `${rows.length} wikipedia rows to ${onlyMissing ? "fill (NULL body only)" : "refresh"}${offset ? ` from offset ${offset}` : ""}${dryRun ? " (--dry-run, no writes will be made)" : ""}\n`,
  );

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [index, row] of rows.entries()) {
    const pageId = Number(row.sourceId);
    // `source_id` is the MediaWiki pageid as text. A row whose id isn't numeric can't be refetched
    // and isn't worth guessing about — count it and move on.
    if (!Number.isFinite(pageId)) {
      console.warn(
        `  ! ${row.id} has a non-numeric source_id ("${row.sourceId}") — skipped`,
      );
      skipped++;
      continue;
    }

    try {
      const body = await fetchBody(pageId);
      if (!body) {
        console.warn(
          `  ! no extract for "${row.title}" (pageid ${pageId}) — left as-is`,
        );
        skipped++;
        continue;
      }
      if (!dryRun) {
        await db
          .update(item)
          .set({ body, readingMinutes: readingMinutes(body) })
          .where(eq(item.id, row.id));
      }
      updated++;
    } catch (err) {
      console.error(`  ✗ "${row.title}" (pageid ${pageId}):`, err);
      errors++;
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  … ${index + 1}/${rows.length} processed`);
    }
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  const line = "─".repeat(72);
  console.log(`\n${line}\nBackfill summary\n${line}`);
  console.log(`${dryRun ? "would update" : "updated"}: ${updated}`);
  console.log(`skipped (no extract / bad id): ${skipped}`);
  console.log(`errors: ${errors}`);
  console.log(`elapsed: ${elapsedSec.toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("backfill script failed:", err);
    process.exit(1);
  });
