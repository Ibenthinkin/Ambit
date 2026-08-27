#!/usr/bin/env bun
/**
 * Re-curation repair tool (SPEC §15) — re-score items ALREADY in the DB, bypassing both layers
 * that normally make re-scoring impossible:
 *
 *   1. scripts/ingest.ts skips any (source, sourceId) already upserted — an existing row is
 *      never re-curated by an ingest run, no matter what.
 *   2. curator.ts's disk cache returns the old judgment for free — including a judgment that
 *      was made *without the image*, because the image host was blocking us at the time.
 *
 * That second case is why this script exists. Phase 6.2's LoC ingest ran into a sustained
 * tile.loc.gov 429 partway through 334 image downloads, and the curator silently scored the
 * blocked items from text alone (docs/PHASE6_WALKTHROUGH_6.2.md, "The honest state of LoC's
 * 376 scores"). The repair is to re-run the curator with `force: true` once the block clears —
 * which is exactly what this does, with two safeguards the ingest path doesn't need:
 *
 *   - THROTTLED image fetches. The 429 was tripped by the curator's own download path running
 *     8 concurrent fetches with no delay. Re-running the repair at the same intensity would
 *     re-trip the block and write a fresh batch of text-only scores — the exact thing being
 *     repaired. So items go through curateItems() in chunks of 2 with a pause between chunks,
 *     trading ~4x wall-clock for staying far under any per-IP budget.
 *
 *   - NO WRITE WITHOUT THE IMAGE. An item whose image fetch fails is scored from text alone by
 *     design (a missing thumbnail shouldn't null an item at ingest) — but for a *repair* that
 *     score is worthless: the old score stays, the skip is counted, and if failures pile up the
 *     run aborts early (the block is back; later items keep their old scores untouched).
 *     Likewise a score of exactly 5 with zero tags is skipped: that's the shape of
 *     curateItems()'s gave-up-after-4-retries fallback, indistinguishable from a genuine
 *     neutral 5 with no tags — and "keep the old score" is the safe reading of both.
 *
 * Usage:
 *   bun run recurate --source loc               # re-score every loc row (LLM cost: cents)
 *   bun run recurate --source loc --limit 5     # smoke test on 5 rows first
 *   bun run recurate --source loc --offset 259  # resume a run that died partway (rows are
 *                                               # sourceId-ordered, so offset N skips the N
 *                                               # already repaired — see the first run's log)
 *   bun run recurate --source loc --dry-run     # score + report, write nothing (still bills)
 */
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { curateItems } from "~/server/services/curator";
import type { NormalizedItem } from "~/server/services/sources/types";
import { ALL_SOURCE_IDS } from "~/server/services/sources";
import type { SourceId } from "~/server/services/sources";

// ── CLI flags (same conventions as scripts/ingest.ts) ──────────────────────

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}

const sourceFlag = flagValue("source");
const limit = flagValue("limit") ? Number(flagValue("limit")) : undefined;
const offset = flagValue("offset") ? Number(flagValue("offset")) : 0;
const dryRun = args.includes("--dry-run");

const knownSources = ALL_SOURCE_IDS;
if (!sourceFlag || !knownSources.includes(sourceFlag as SourceId)) {
  console.error(`--source is required — known: ${knownSources.join(", ")}`);
  process.exit(1);
}
const source = sourceFlag as SourceId;

if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
  console.error(
    `--limit must be a positive number, got "${flagValue("limit")}"`,
  );
  process.exit(1);
}
if (!Number.isFinite(offset) || offset < 0) {
  console.error(
    `--offset must be a non-negative number, got "${flagValue("offset")}"`,
  );
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set — required for re-curation (add it to .env).",
  );
  process.exit(1);
}

// Chunk-of-2 + pause = the throttle described in the header. ABORT_AFTER is deliberately low:
// by failure #10 the pattern is a returned block, not a flaky CDN, and every further item would
// just burn LLM tokens to produce a score this script refuses to write anyway.
const CHUNK = 2;
const PAUSE_MS = 500;
const ABORT_AFTER = 10;

// ── Load the rows and rebuild the curator's input shape ────────────────────

const rows = await db
  .select()
  .from(item)
  .where(eq(item.source, source))
  .orderBy(item.sourceId)
  .limit(limit ?? Number.MAX_SAFE_INTEGER)
  .offset(offset);

if (rows.length === 0) {
  console.log(`no ${source} rows in the DB — nothing to do`);
  process.exit(0);
}

const beforeAvg = rows.reduce((s, r) => s + r.curationScore, 0) / rows.length;
console.log(
  `${source}: ${rows.length} rows${offset ? ` (from offset ${offset})` : ""}, current avg ${beforeAvg.toFixed(2)}` +
    `${dryRun ? " (dry run — no writes)" : ""}`,
);

// The DB row is a superset of NormalizedItem with three fields relaxed to nullable
// (summary/attribution/license) — coalesce those back and the curator can't tell the
// difference from a fresh ingest.
function rowToNormalized(row: (typeof rows)[number]): NormalizedItem {
  return {
    source: row.source as SourceId,
    sourceId: row.sourceId,
    type: row.type,
    title: row.title,
    summary: row.summary ?? "",
    body: row.body,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    attribution: row.attribution ?? "",
    license: row.license ?? "",
    tags: row.tags,
  };
}

// ── The chunked re-curation loop ───────────────────────────────────────────

const noImage = new Set<string>(); // "source:sourceId" of items scored without their image
let written = 0;
let keptNoImage = 0;
let keptSuspectFallback = 0;
let unchanged = 0;
let newScoreSum = 0;
let done = 0;

for (let at = 0; at < rows.length; at += CHUNK) {
  const chunk = rows.slice(at, at + CHUNK);
  const curated = await curateItems(chunk.map(rowToNormalized), {
    force: true,
    onImageFetchFailure: (it) => noImage.add(`${it.source}:${it.sourceId}`),
  });

  for (const [i, scored] of curated.entries()) {
    const row = chunk[i];
    if (!row) continue;

    if (noImage.has(`${scored.source}:${scored.sourceId}`)) {
      keptNoImage++;
    } else if (
      scored.curationScore === 5 &&
      scored.aestheticTags.length === 0
    ) {
      keptSuspectFallback++;
    } else {
      newScoreSum += scored.curationScore;
      if (scored.curationScore === row.curationScore) unchanged++;
      if (!dryRun) {
        await db
          .update(item)
          .set({
            curationScore: scored.curationScore,
            aestheticTags: scored.aestheticTags,
          })
          .where(
            and(eq(item.source, row.source), eq(item.sourceId, row.sourceId)),
          );
      }
      written++;
    }
  }

  done += chunk.length;
  if (done % 20 < CHUNK || done === rows.length) {
    console.log(
      `  ${done}/${rows.length}  written ${written}  no-image ${keptNoImage}  fallback-skips ${keptSuspectFallback}`,
    );
  }

  if (noImage.size >= ABORT_AFTER) {
    console.error(
      `\nABORT: ${noImage.size} image fetches have failed — the block looks like it's back.` +
        `\nRows already written keep their new image-backed scores; the remaining ` +
        `${rows.length - done} keep their old ones. Re-run later to finish.`,
    );
    process.exit(1);
  }

  if (at + CHUNK < rows.length)
    await new Promise((r) => setTimeout(r, PAUSE_MS));
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${source} re-curation ${dryRun ? "(dry run) " : ""}complete:`);
console.log(
  `  re-scored with image : ${written} (${unchanged} landed on the same score)`,
);
console.log(`  kept old (no image)  : ${keptNoImage}`);
console.log(`  kept old (fallback?) : ${keptSuspectFallback}`);
if (written > 0) {
  console.log(
    `  avg: ${beforeAvg.toFixed(2)} before → ${(newScoreSum / written).toFixed(2)} across re-scored items`,
  );
}
process.exit(0);
