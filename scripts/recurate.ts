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
 *   bun run recurate --source doorofperception --chunk 4   # four at a time — the Claude judge's
 *                                               # pool on VM 202; keep 2 for a host that 429s
 *
 * Under the Claude judge (10-04-26) a run can outlast the subscription's five-hour window. When
 * the judge stops at its ceiling the script prints `resume-offset: N` and exits 3 — the one exit
 * code that means "wait for the reset and run again from N" (.cache/dop-rescore-prod.sh loops on
 * it). Every other stop, the seven-day window included, is exit 1: a person should look.
 */
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { claudeStopReason } from "~/server/services/claude-judge";
import {
  CuratorAbortError,
  curateItems,
  judgePreflight,
  SOURCE_SCORE_FLOOR,
} from "~/server/services/curator";
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
const chunkFlag = flagValue("chunk") ? Number(flagValue("chunk")) : 2;
const dryRun = args.includes("--dry-run");
// Write the judge's new aesthetic tags and leave the stored score alone (10-04-26). Door of
// Perception's floor turns Haiku's harsher scores into a flat 8 — a 40-picture sample went
// 8.30 → 8.03 — so a full re-score would erase its 9s and 10s; this keeps them and still gets
// the new tags (`grotesque`, `gore`) the dark-material setting will filter on.
const tagsOnly = args.includes("--tags-only");

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

if (!Number.isInteger(chunkFlag) || chunkFlag < 1 || chunkFlag > 8) {
  console.error(
    `--chunk must be a whole number 1–8, got "${flagValue("chunk")}"`,
  );
  process.exit(1);
}

/** Exit 3 only for the five-hour window: it resets within hours, so waiting is the right answer.
 *  The seven-day window (or a refused call) would mean waiting days and starving the weekly
 *  ingest, so those stay exit 1. */
const RESUMABLE_EXIT = 3;
function isFiveHourStop(): boolean {
  return /\bfive_hour window\b/.test(claudeStopReason() ?? "");
}

const judgeProblem = await judgePreflight();
if (judgeProblem) {
  console.error(judgeProblem);
  if (isFiveHourStop()) {
    console.log(`resume-offset: ${offset}`);
    process.exit(RESUMABLE_EXIT);
  }
  process.exit(1);
}

// Chunk-of-2 + pause = the throttle described in the header. ABORT_AFTER is deliberately low:
// by the 10th failure *in a row* the pattern is a returned block, not a flaky CDN, and every
// further item would just burn tokens to produce a score this script refuses to write anyway.
// In a row, not in total (10-04-26): a 10,000-picture run meets ten scattered misses as a
// matter of course, and a lifetime count would end it for no reason.
const CHUNK = chunkFlag;
const PAUSE_MS = 500;
const ABORT_AFTER = 10;

/** The shape of curateItems' gave-up fallback for this source: a neutral 5 with no tags, LIFTED
 *  by the source's floor. Door of Perception's floor makes it an 8 — compared against a bare 5,
 *  a failed judgment would have been written and wiped the picture's tags (10-04-26). */
const FALLBACK_SCORE = Math.max(5, SOURCE_SCORE_FLOOR[source] ?? 0);

// ── Load the rows and rebuild the curator's input shape ────────────────────

const rows = await db
  .select()
  .from(item)
  // Images only (09-28-26): articles go to the writing curator now, which this script would
  // re-bill under the sixteen-topic default and then write only half of (no kind, no reading
  // time, no memberships). `recurate:writing` is their repair.
  .where(and(eq(item.source, source), eq(item.type, "image")))
  .orderBy(item.sourceId)
  .limit(limit ?? Number.MAX_SAFE_INTEGER)
  .offset(offset);

if (rows.length === 0) {
  console.log(
    `no ${source} image rows in the DB — nothing to do (articles: bun run recurate:writing)`,
  );
  process.exit(0);
}

const beforeAvg = rows.reduce((s, r) => s + r.curationScore, 0) / rows.length;
console.log(
  `${source}: ${rows.length} rows${offset ? ` (from offset ${offset})` : ""}, current avg ${beforeAvg.toFixed(2)}` +
    `${dryRun ? " (dry run — no writes)" : ""}${tagsOnly ? " (tags only — scores kept)" : ""}`,
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
let failuresInARow = 0;
let written = 0;
let keptNoImage = 0;
let keptSuspectFallback = 0;
let unchanged = 0;
let newScoreSum = 0;
let done = 0;

for (let at = 0; at < rows.length; at += CHUNK) {
  const chunk = rows.slice(at, at + CHUNK);
  let curated;
  try {
    curated = await curateItems(chunk.map(rowToNormalized), {
      force: true,
      onImageFetchFailure: (it) => noImage.add(`${it.source}:${it.sourceId}`),
    });
  } catch (err) {
    if (!(err instanceof CuratorAbortError)) throw err;
    // This chunk is unwritten (its answers are cached but `force` re-asks), so resume AT it.
    console.error(`\n${err.message}`);
    console.log(
      `stopped after ${written} written; resume-offset: ${offset + at}`,
    );
    process.exit(isFiveHourStop() ? RESUMABLE_EXIT : 1);
  }

  for (const [i, scored] of curated.entries()) {
    const row = chunk[i];
    if (!row) continue;

    if (noImage.has(`${scored.source}:${scored.sourceId}`)) {
      keptNoImage++;
      failuresInARow++;
    } else if (
      scored.curationScore === FALLBACK_SCORE &&
      scored.aestheticTags.length === 0
    ) {
      keptSuspectFallback++;
    } else {
      failuresInARow = 0;
      newScoreSum += scored.curationScore;
      if (scored.curationScore === row.curationScore) unchanged++;
      if (!dryRun) {
        await db
          .update(item)
          .set(
            tagsOnly
              ? { aestheticTags: scored.aestheticTags }
              : {
                  curationScore: scored.curationScore,
                  aestheticTags: scored.aestheticTags,
                },
          )
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

  if (failuresInARow >= ABORT_AFTER) {
    console.error(
      `\nABORT: ${failuresInARow} image fetches in a row have failed — the block looks like it's back.` +
        `\nRows already written keep their new image-backed scores; the remaining ` +
        `${rows.length - done} keep their old ones. Re-run later to finish.` +
        `\nresume-offset: ${offset + done}`,
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
