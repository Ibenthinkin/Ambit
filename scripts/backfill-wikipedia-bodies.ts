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
 * Run it by hand, once, after merging 5.7. Never in tests, never in CI.
 *
 * Usage:
 *   bun scripts/backfill-wikipedia-bodies.ts --limit 5 --dry-run   # smoke test, no writes
 *   bun scripts/backfill-wikipedia-bodies.ts                       # the real thing
 */
import { eq } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
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
    .where(eq(item.source, "wikipedia"))
    .limit(limit ?? Number.MAX_SAFE_INTEGER);

  console.log(
    `${rows.length} wikipedia rows to refresh${dryRun ? " (--dry-run, no writes will be made)" : ""}\n`,
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
        await db.update(item).set({ body }).where(eq(item.id, row.id));
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
