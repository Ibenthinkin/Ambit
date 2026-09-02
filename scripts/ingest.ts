#!/usr/bin/env bun
/**
 * The ingestion job (SPEC §6.4, §13) — the script that actually fills the corpus. Cron-triggered
 * in production (`bun run ingest`); run by hand during Phase 3.4 to populate the dev DB.
 *
 * The story, end to end:
 *
 *   1. Read topics + their per-source seed queries from the DB (topics.ts's TOPICS array was
 *      seeded there by `bun run db:seed` in Phase 2.3 — the DB, not the config file, is the
 *      source of truth for what's active).
 *   2. For every (topic, source) cell, run each of that cell's seed queries through the source's
 *      adapter (server/services/sources/) — `search()` then `toItem()` — collecting the result as
 *      a "claim": this topic, at this rank, on this normalized item.
 *   3. The SAME object often answers more than one topic's seed queries (a Wellcome anatomical
 *      plate can satisfy both "anatomy" and "art" searches). A search item gets exactly one seed
 *      topic — resolveCollisions() (server/services/ingest-plan.ts) picks the highest-ranked claim,
 *      order-independently (SPEC §15) — written to `item.topic_id` (the display topic) and as one
 *      `origin='seed'` row in `item_topic`.
 *   3b. (Phase 6.3 / Cut 1) Corpus-WALK sources — blogs — have no seed cells. Each is walked to
 *       exhaustion (processWalker), its items skip collision resolution (nothing to collide on),
 *       and they join the search winners at step 4 below. The curator's classify mode names EVERY
 *       honest topic for each — possibly none. **Every curated walk item is stored** (the
 *       vocabulary-growth principle, docs/DESIGN_topic-vocabulary-growth.md): the first topic
 *       becomes the display `topic_id`, each topic an `origin='curator'` membership row, and an
 *       item with none is stored un-homed — counted, its tags printed, never dropped and never
 *       force-fitted. Un-homed items are invisible to the feed until Cut 2 promotes a topic for them.
 *   4. Winners already sitting in the DB (by the same (source, sourceId) key the UNIQUE
 *      constraint enforces) are skipped — this is what makes a second run of this script cheap
 *      and idempotent: nothing gets re-normalized, re-floored, or re-curated for free.
 *   5. The survivors pass through curator.ts's two-stage taste layer (SPEC §6.2): a free
 *      structural floor, then the LLM curator (skippable via --skip-llm for cost-free dry runs).
 *   6. Every curated item is upserted (insert-or-refresh-content, SPEC §6.4) into `item`.
 *   7. A structured summary table prints what happened — collision counts and per-topic keeps are
 *      surfaced explicitly, because Phase 0's harvester silently starved topics on exactly this
 *      kind of collision (SPEC §15) and a summary that hides it would let that bug recur unseen.
 *
 * Usage:
 *   bun run ingest                              # full run, all 16 topics × 6 sources, quota 150
 *   bun run ingest --quota 10 --dry-run          # cheap structure check, no writes, no LLM cost*
 *   bun run ingest --quota 10 --skip-llm         # writes with neutral score 5 — free but real rows
 *                                                # (walk sources: nothing written — an unscored,
 *                                                # unclassified walk row would block its real
 *                                                # curation forever)
 *   bun run ingest --topic astronomy --source met --quota 20
 *   bun run ingest --source doorofperception --dry-run   # walk + classify, print the topic +
 *                                                         # un-homed tag histograms, write nothing
 *                                                         # (bills only for uncached items)
 *   bun run ingest --source doorofperception --prune     # also delete rows for posts the blog
 *                                                         # has removed (complete walks only)
 *   (* --dry-run alone still calls the curator unless paired with --skip-llm; combine both for a
 *      genuinely free structural dry run.)
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { addItemTopics, upsertItem } from "~/server/db/items";
import { item, savedItem, seenItem, topic } from "~/server/db/schema";
import type { Claim } from "~/server/services/ingest-plan";
import {
  planPrune,
  resolveCollisions,
  tagHistogram,
  topicHistogram,
} from "~/server/services/ingest-plan";
import type {
  CuratedItem,
  StructuralDropRule,
} from "~/server/services/curator";
import { curateItems, structuralFloor } from "~/server/services/curator";
import { isSuspendedSource } from "~/server/config/suspended-sources";
import { adapters, ALL_SOURCE_IDS, walkers } from "~/server/services/sources";
import type {
  NormalizedItem,
  SearchSourceId,
  SourceId,
  WalkPage,
} from "~/server/services/sources";
import type { WalkSourceId } from "~/server/config/topics";

// ── CLI flags ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}

const sourceFlag = flagValue("source");
const topicFlag = flagValue("topic");
const quota = Number(flagValue("quota") ?? 150);
const skipLlm = args.includes("--skip-llm");
const dryRun = args.includes("--dry-run");
// Phase 6.3: delete rows of a walk source that a COMPLETE walk did not see (planPrune). Never
// the default: deletion is the one thing an ingest run must not do by accident.
const prune = args.includes("--prune");

if (!Number.isFinite(quota) || quota <= 0) {
  console.error(
    `--quota must be a positive number, got "${flagValue("quota")}"`,
  );
  process.exit(1);
}

const knownSources = ALL_SOURCE_IDS;
if (sourceFlag && !knownSources.includes(sourceFlag as SourceId)) {
  console.error(
    `unknown --source "${sourceFlag}" — known: ${knownSources.join(", ")}`,
  );
  process.exit(1);
}

// Fail fast, before any network calls: a curator call 800 items into a run is a much worse place
// to discover this than the first line of output.
if (!skipLlm && !process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set — required for LLM curation (add it to .env, or pass --skip-llm for a free dry run).",
  );
  process.exit(1);
}

// ── per-source search + normalize ───────────────────────────────────────────

type DbTopic = typeof topic.$inferSelect;

interface SourceRunStats {
  searched: number; // adapter.search() calls attempted (successful or not)
  offered: number; // raw hits successfully normalized into a Claim
  errors: number; // failed search() calls or toItem() throws — never folded into "offered: 0"
  claims: Claim[];
}

/**
 * Run one source's adapter across every topic that has a seed-query cell for it. Sequential
 * *within* a source (adapters own their own politeness delay — http.ts, Met 400ms, Wellcome
 * 250ms — and hammering one host from several queries at once would defeat that), but every
 * source runs concurrently with every other one (see the Promise.allSettled in main()) — the
 * same per-host-serial, cross-host-parallel shape phase0/harvest.ts proved out.
 */
async function processSource(
  // Phase 6.3 narrowed this from SourceId: `adapters` is now keyed by the search half of that
  // union, and a walk source reaches processWalker instead.
  sourceId: SearchSourceId,
  topics: DbTopic[],
  perCellQuota: number,
): Promise<SourceRunStats> {
  const adapter = adapters[sourceId];
  const stats: SourceRunStats = {
    searched: 0,
    offered: 0,
    errors: 0,
    claims: [],
  };

  for (const t of topics) {
    try {
      const queries =
        (t.seedQueries as Record<string, string[]>)[sourceId] ?? [];
      if (queries.length === 0) continue;

      // A topic's seed-query "cell" can hold several queries (2.3's per-source tuning) — split
      // the quota evenly across them rather than asking every query for the full amount, or a
      // 3-query cell would offer 3x what a 1-query cell does for the same --quota.
      const perQueryLimit = Math.ceil(perCellQuota / queries.length);

      for (const query of queries) {
        stats.searched++;
        try {
          const raws = await adapter.search(query, { limit: perQueryLimit });
          raws.forEach((raw, rank) => {
            try {
              const normalized = adapter.toItem(raw);
              stats.claims.push({ topicId: t.id, rank, item: normalized });
              stats.offered++;
            } catch (err) {
              stats.errors++;
              console.warn(
                `  ${sourceId}/${t.id} "${query}": toItem failed — ${String(err)}`,
              );
            }
          });
        } catch (err) {
          // A failed search is logged as an error, NEVER silently read as "zero results" — the
          // exact Phase 0.2 lesson that turned three real Met rate-limit 403s into what looked
          // like empty topics (SPEC §15 / phase0/NOTES.md).
          stats.errors++;
          console.warn(
            `  ${sourceId}/${t.id} "${query}": search FAILED — ${String(err)}`,
          );
        }
      }
    } catch (err) {
      // One malformed topic cell shouldn't take the whole source down.
      console.warn(`  ${sourceId}/${t.id}: FAILED — ${String(err)}`);
    }
  }

  return stats;
}

// ── Phase 6.3: per-walker walk + normalize ───────────────────────────────────

interface WalkRunStats {
  walked: number; // walk() pages attempted
  offered: number; // raws normalized into items
  errors: number; // failed pages or toItem throws — never folded into "offered: 0"
  /** Of `errors`, the ones that were whole pages — the only kind that voids completeness. */
  pageErrors: number;
  /** Every sourceId the walk normalized — planPrune's input. A raw that toItem rejects (no
   *  featured image, say) is not here, which is right: it was never a row, so planPrune cannot
   *  name it; and if it once WAS a row and has since lost its image, it should go. */
  seenSourceIds: string[];
  /** True iff the walk reached the end with no failed PAGE and no --quota bound: only then may
   *  the absence of a row mean the post is gone. A single rejected post does not void this —
   *  doorofperception has one permanently, and a walk that can never be complete is a --prune
   *  that can never run. (Found on the first real run, 08-27-26.) */
  complete: boolean;
  items: NormalizedItem[];
}

/**
 * Walk one corpus-walk source to exhaustion (or to `quotaItems` under --quota). Sequential by
 * construction — one host, one cursor — and the adapter owns its own politeness delay. A failed
 * page is an error and stops the walk (a cursor past a failure is not something we can trust),
 * which also marks the run incomplete so --prune cannot act on it.
 */
async function processWalker(
  sourceId: WalkSourceId,
  quotaItems: number | undefined,
): Promise<WalkRunStats> {
  const walker = walkers[sourceId];
  const stats: WalkRunStats = {
    walked: 0,
    offered: 0,
    errors: 0,
    pageErrors: 0,
    seenSourceIds: [],
    complete: false,
    items: [],
  };
  let cursor: string | undefined;
  let reachedEnd = false;
  do {
    stats.walked++;
    let page: WalkPage<unknown>;
    try {
      page = await walker.walk(
        cursor,
        quotaItems ? { limit: quotaItems - stats.offered } : undefined,
      );
    } catch (err) {
      stats.errors++;
      stats.pageErrors++;
      console.warn(
        `  ${sourceId}: walk FAILED at cursor ${cursor ?? "(start)"} — ${String(err)}`,
      );
      break;
    }
    for (const raw of page.raw) {
      try {
        const normalized = walker.toItem(raw);
        stats.seenSourceIds.push(normalized.sourceId);
        stats.items.push(normalized);
        stats.offered++;
      } catch (err) {
        stats.errors++;
        console.warn(`  ${sourceId}: toItem failed — ${String(err)}`);
      }
      if (quotaItems && stats.offered >= quotaItems) break;
    }
    cursor = page.next;
    reachedEnd = cursor === undefined;
  } while (
    cursor !== undefined &&
    !(quotaItems && stats.offered >= quotaItems)
  );

  stats.complete =
    reachedEnd && stats.pageErrors === 0 && quotaItems === undefined;
  return stats;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now();

  const allTopics = await db.select().from(topic);
  const topics = topicFlag
    ? allTopics.filter((t) => t.id === topicFlag)
    : allTopics;
  if (topicFlag && topics.length === 0) {
    console.error(`unknown --topic "${topicFlag}" — no such topic in the DB.`);
    process.exit(1);
  }
  // A default run skips suspended sources (config/suspended-sources.ts says why each is off).
  // An explicit `--source aic` still runs — the flag is how you re-test one, which is exactly what
  // you need the day the reason for the suspension is supposedly fixed — but it says so, so nobody
  // reads the resulting rows as evidence the source is back in the feed. (It isn't: the feed
  // filters suspended sources at draw time too.)
  const sourceIds = (
    sourceFlag
      ? [sourceFlag]
      : knownSources.filter((id) => !isSuspendedSource(id))
  ) as SourceId[];

  // Phase 6.3: the run has two lanes, because there are now two adapter shapes. `adapters` is
  // keyed by the search half of SourceId and `walkers` by the walk half, so membership in one of
  // those records is the split.
  const searchIds = sourceIds.filter(
    (id) => id in adapters,
  ) as SearchSourceId[];
  const walkIds = sourceIds.filter((id) => id in walkers) as WalkSourceId[];
  // For a walker, --quota is a TOTAL item bound (there are no cells to be "per" of); absent, the
  // walk runs to exhaustion, which is the only kind of walk --prune may trust.
  const walkQuota = args.includes("--quota") ? quota : undefined;

  if (topicFlag && sourceFlag && sourceFlag in walkers) {
    console.log(
      `note: --topic does not apply to "${sourceFlag}" — walk sources have no seed cells; walking everything.\n`,
    );
  }

  if (sourceFlag && isSuspendedSource(sourceFlag)) {
    console.log(
      `⚠ "${sourceFlag}" is a suspended source — ingesting it because you asked explicitly, but ` +
        `the feed will not draw its items until it is removed from SUSPENDED_SOURCES.\n`,
    );
  } else {
    const skipped = knownSources.filter((id) => isSuspendedSource(id));
    if (skipped.length > 0) {
      console.log(`Skipping suspended source(s): ${skipped.join(", ")}\n`);
    }
  }

  console.log(
    `Ingesting ${topics.length} topic(s) × ${searchIds.length} search source(s) + ${walkIds.length} walk source(s), quota ${quota}/cell` +
      `${skipLlm ? " [skip-llm]" : ""}${dryRun ? " [dry-run]" : ""}…\n`,
  );

  // Step 1: search + normalize, one source's worth of work per settled promise. allSettled (not
  // all) so a single source crashing outright doesn't take the other four down with it — the same
  // "one source down ≠ job dead" guarantee processSource already gives at the topic level, one
  // level up.
  // Phase 6.3: the walk lane runs alongside, under the same allSettled guarantee.
  const [searchResults, walkResults] = await Promise.all([
    Promise.allSettled(
      searchIds.map((sourceId) => processSource(sourceId, topics, quota)),
    ),
    Promise.allSettled(walkIds.map((id) => processWalker(id, walkQuota))),
  ]);

  const statsBySource = new Map<SourceId, SourceRunStats>();
  const allClaims: Claim[] = [];
  for (const [i, result] of searchResults.entries()) {
    const sourceId = searchIds[i]!;
    if (result.status === "fulfilled") {
      statsBySource.set(sourceId, result.value);
      allClaims.push(...result.value.claims);
    } else {
      console.warn(
        `  ${sourceId}: SOURCE FAILED ENTIRELY — ${String(result.reason)}`,
      );
      statsBySource.set(sourceId, {
        searched: 0,
        offered: 0,
        errors: 1,
        claims: [],
      });
    }
  }

  const walkStatsBySource = new Map<WalkSourceId, WalkRunStats>();
  const walkItems: NormalizedItem[] = [];
  for (const [i, result] of walkResults.entries()) {
    const sourceId = walkIds[i]!;
    if (result.status === "fulfilled") {
      walkStatsBySource.set(sourceId, result.value);
      walkItems.push(...result.value.items);
    } else {
      console.warn(
        `  ${sourceId}: WALK FAILED ENTIRELY — ${String(result.reason)}`,
      );
      walkStatsBySource.set(sourceId, {
        walked: 0,
        offered: 0,
        errors: 1,
        pageErrors: 1,
        seenSourceIds: [],
        complete: false,
        items: [],
      });
    }
  }

  // Step 2: collision resolution (SPEC §15) — one winner per (source, sourceId), regardless of
  // how many topics' seed queries surfaced it or in what order this loop happened to visit them.
  const { winners, collisionCountBySource } = resolveCollisions(allClaims);

  // Step 3: skip anything already in the DB — a single query up front, rather than one per item,
  // is what makes a second run of this whole script fast as well as free.
  const existingKeys = new Set(
    (
      await db
        .select({ source: item.source, sourceId: item.sourceId })
        .from(item)
    ).map((r) => `${r.source}:${r.sourceId}`),
  );
  const newWinners = winners.filter(
    (w) => !existingKeys.has(`${w.item.source}:${w.item.sourceId}`),
  );
  const alreadyInDb = winners.length - newWinners.length;
  // Walk items bypassed collision resolution (nothing to collide on) but share the skip: a
  // re-crawled post already in the DB costs nothing, exactly like a re-found museum object.
  const newWalkItems = walkItems.filter(
    (it) => !existingKeys.has(`${it.source}:${it.sourceId}`),
  );
  const alreadyInDbWalk = walkItems.length - newWalkItems.length;

  // Step 4: structural floor. structuralFloor() only sees NormalizedItems, so a lookup map keyed
  // on (source, sourceId) — the same key the DB's UNIQUE constraint uses — is how each surviving
  // item finds its way back to the topicId/rank it won under, after floor + curation are done.
  const winnerByKey = new Map(
    newWinners.map((w) => [`${w.item.source}:${w.item.sourceId}`, w] as const),
  );
  // Both lanes are floored together so dup-title is batch-wide, then split back apart: a walk
  // item is exactly one that no winner claimed.
  const { kept, dropped } = structuralFloor([
    ...newWinners.map((w) => w.item),
    ...newWalkItems,
  ]);
  const keptSearch = kept.filter((it) =>
    winnerByKey.has(`${it.source}:${it.sourceId}`),
  );
  const keptWalk = kept.filter(
    (it) => !winnerByKey.has(`${it.source}:${it.sourceId}`),
  );
  const flooredByRule: Record<StructuralDropRule, number> = {
    "dup-title": 0,
    "bare-title": 0,
    "thin-summary": 0,
  };
  for (const d of dropped) flooredByRule[d.rule]++;

  // Step 5: curate. --skip-llm assigns a neutral score instead of calling the network at all —
  // free, and useful for verifying the rest of the pipeline's plumbing before spending a cent.
  // Counted per source, printed in the summary below. A curator that can't fetch an image scores
  // the item from its text alone and says nothing about it — which in Phase 6.2 meant a 334-item
  // LoC run reported clean success while tile.loc.gov was busy 429ing every image request. "The
  // feed can't show what the curator couldn't fetch" is the AIC lesson; this is the counter that
  // makes it visible at the moment it happens rather than months later.
  const imageFetchFailures: Record<string, number> = {};
  let lastPrintedPct = -1;
  const curateOpts = {
    onProgress: (done: number, total: number) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPrintedPct && (pct % 10 === 0 || done === total)) {
        lastPrintedPct = pct;
        console.log(`  curating: ${done}/${total} (${pct}%)`);
      }
    },
    onImageFetchFailure: (it: NormalizedItem) => {
      imageFetchFailures[it.source] = (imageFetchFailures[it.source] ?? 0) + 1;
    },
  };
  const neutral = (it: NormalizedItem): CuratedItem => ({
    ...it,
    curationScore: 5,
    aestheticTags: [],
    topics: [],
  });
  const curatedSearch: CuratedItem[] = skipLlm
    ? keptSearch.map(neutral)
    : await curateItems(keptSearch, curateOpts);
  // Walk items get the classify mode. Under --skip-llm they cannot be classified at all, so the
  // walk lane writes nothing: a structural check of the walk, nothing more — see the write loop.
  const curatedWalk: CuratedItem[] = skipLlm
    ? keptWalk.map(neutral)
    : await curateItems(keptWalk, { ...curateOpts, classify: true });
  const histogram = topicHistogram(curatedWalk);

  // Step 6: upsert. Under --dry-run this loop still computes exactly what WOULD be written (so
  // the summary reflects reality) but never calls upsertItem — the "no DB writes" guarantee.
  // Every write is two statements: the row, then its memberships (additive — db/items.ts).
  let inserted = 0;
  let membershipsWritten = 0;
  const insertedByTopic = new Map<string, number>();
  for (const curatedItem of curatedSearch) {
    const winner = winnerByKey.get(
      `${curatedItem.source}:${curatedItem.sourceId}`,
    );
    if (!winner) continue; // unreachable in practice — every curated item came from winnerByKey's own keys
    if (!dryRun) {
      const row = await upsertItem({ ...curatedItem, topicId: winner.topicId });
      membershipsWritten += await addItemTopics(
        row.id,
        [winner.topicId],
        "seed",
      );
    }
    inserted++;
    insertedByTopic.set(
      winner.topicId,
      (insertedByTopic.get(winner.topicId) ?? 0) + 1,
    );
  }

  // Walk items (Cut 1): every curated item is stored. The first topic the curator listed is the
  // display topic; every topic it listed is a membership; an item it listed none for is stored
  // un-homed and characterised below — that tag histogram is what Cut 2's promotion runs on.
  //
  // Under --skip-llm nothing is written for the walk lane: such an item has neither a real score
  // nor a topic decision, and a score-5 un-homed row would be skipped as "already in DB" by every
  // later real run — blocking its curation forever. (The search lane's score-5 rows under
  // --skip-llm at least carry a real seed topic; the asymmetry is deliberate and pre-dates Cut 1.)
  let unhomed = 0;
  let walkUnwritten = 0;
  const unhomedItems: CuratedItem[] = [];
  for (const curatedItem of curatedWalk) {
    if (skipLlm) {
      walkUnwritten++;
      continue;
    }
    const primary = curatedItem.topics[0] ?? null;
    if (!dryRun) {
      const row = await upsertItem({ ...curatedItem, topicId: primary });
      membershipsWritten += await addItemTopics(
        row.id,
        curatedItem.topics,
        "curator",
      );
    }
    inserted++;
    if (primary === null) {
      unhomed++;
      unhomedItems.push(curatedItem);
    }
    for (const t of curatedItem.topics) {
      insertedByTopic.set(t, (insertedByTopic.get(t) ?? 0) + 1);
    }
  }
  const unhomedTags = tagHistogram(unhomedItems);

  // Phase 6.3: --prune. Only a COMPLETE walk may say a row is gone; and even then only delete
  // when asked. Children first — seen_item and saved_item both carry a foreign key onto item.
  const pruned: Record<string, number> = {};
  for (const [sourceId, ws] of walkStatsBySource) {
    const gone = ws.complete
      ? planPrune({
          source: sourceId,
          seenSourceIds: ws.seenSourceIds,
          existingKeys,
        })
      : [];
    if (gone.length === 0) continue;
    console.log(
      `\n${sourceId}: ${gone.length} row(s) in the DB were not seen by this complete walk:`,
    );
    for (const id of gone) console.log(`  ${id}`);
    if (!prune || dryRun) {
      console.log(
        `  (not deleted — ${dryRun ? "--dry-run" : "pass --prune to delete"})`,
      );
      continue;
    }
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: item.id })
        .from(item)
        .where(and(eq(item.source, sourceId), inArray(item.sourceId, gone)));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      await tx.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await tx.delete(savedItem).where(inArray(savedItem.itemId, ids));
      await tx.delete(item).where(inArray(item.id, ids));
      pruned[sourceId] = ids.length;
    });
    console.log(`  deleted ${pruned[sourceId] ?? 0}`);
  }

  printSummary({
    topics,
    sourceIds: searchIds,
    statsBySource,
    collisionCountBySource,
    imageFetchFailures,
    alreadyInDb: alreadyInDb + alreadyInDbWalk,
    flooredByRule,
    curatedCount: curatedSearch.length + curatedWalk.length,
    inserted,
    insertedByTopic,
    walkStatsBySource,
    histogram,
    membershipsWritten,
    unhomed,
    unhomedTags,
    walkUnwritten,
    pruned,
    elapsedSec: (performance.now() - t0) / 1000,
    dryRun,
    skipLlm,
  });

  process.exit(0);
}

// ── summary ──────────────────────────────────────────────────────────────

function printSummary(args: {
  topics: DbTopic[];
  sourceIds: SourceId[];
  statsBySource: Map<SourceId, SourceRunStats>;
  collisionCountBySource: Record<string, number>;
  /** Per source, how many items the curator scored from text alone because their image would not
   *  fetch. Zero is the expected reading; anything else is the AIC failure mode showing up. */
  imageFetchFailures: Record<string, number>;
  alreadyInDb: number;
  flooredByRule: Record<StructuralDropRule, number>;
  curatedCount: number;
  inserted: number;
  insertedByTopic: Map<string, number>;
  /** Phase 6.3: the walk lane's own table, D4's histogram, and what --prune did (or would do). */
  walkStatsBySource: Map<WalkSourceId, WalkRunStats>;
  histogram: { byTopic: Record<string, number>; unhomed: number };
  /** Cut 1: item_topic rows actually inserted this run (0 under --dry-run). */
  membershipsWritten: number;
  /** Cut 1: walk items stored with no topic — counted, never dropped — and what they are about. */
  unhomed: number;
  unhomedTags: { tag: string; n: number }[];
  /** Walk items NOT written because --skip-llm could neither score nor classify them. */
  walkUnwritten: number;
  pruned: Record<string, number>;
  elapsedSec: number;
  dryRun: boolean;
  skipLlm: boolean;
}) {
  const {
    topics,
    sourceIds,
    statsBySource,
    collisionCountBySource,
    imageFetchFailures,
    alreadyInDb,
    flooredByRule,
    curatedCount,
    inserted,
    insertedByTopic,
    walkStatsBySource,
    histogram,
    membershipsWritten,
    unhomed,
    unhomedTags,
    walkUnwritten,
    pruned,
    elapsedSec,
    dryRun,
    skipLlm,
  } = args;
  const line = "─".repeat(72);

  console.log(`\n${line}\nPer-source\n${line}`);
  console.log(
    [
      "source".padEnd(12),
      "searched".padEnd(10),
      "offered".padEnd(10),
      "errors".padEnd(8),
      "collisions".padEnd(12),
      "no-image",
    ].join(""),
  );
  for (const sourceId of sourceIds) {
    const s = statsBySource.get(sourceId) ?? {
      searched: 0,
      offered: 0,
      errors: 0,
      claims: [],
    };
    console.log(
      [
        sourceId.padEnd(12),
        String(s.searched).padEnd(10),
        String(s.offered).padEnd(10),
        String(s.errors).padEnd(8),
        String(collisionCountBySource[sourceId] ?? 0).padEnd(12),
        String(imageFetchFailures[sourceId] ?? 0),
      ].join(""),
    );
  }

  if (walkStatsBySource.size > 0) {
    console.log(`\n${line}\nWalk sources (Phase 6.3)\n${line}`);
    console.log(
      [
        "source".padEnd(18),
        "pages".padEnd(8),
        "offered".padEnd(10),
        "errors".padEnd(8),
        "complete".padEnd(10),
        "no-image",
      ].join(""),
    );
    for (const [id, s] of walkStatsBySource) {
      console.log(
        [
          id.padEnd(18),
          String(s.walked).padEnd(8),
          String(s.offered).padEnd(10),
          String(s.errors).padEnd(8),
          (s.complete ? "yes" : "no").padEnd(10),
          // Same reading as the search table's column: a blog whose heroes will not fetch is
          // being scored blind, and that must show up here, not months later in the feed.
          String(imageFetchFailures[id] ?? 0),
        ].join(""),
      );
    }
    console.log(
      `\nclassification (memberships — an item filed under two topics counts in both)${skipLlm ? " — --skip-llm: nothing classified, nothing written for walk sources" : ""}:`,
    );
    for (const [topicId, n] of Object.entries(histogram.byTopic).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${topicId.padEnd(24)} ${n}`);
    }
    console.log(`  ${"(un-homed — stored)".padEnd(24)} ${histogram.unhomed}`);
    for (const [id, n] of Object.entries(pruned)) {
      console.log(`pruned from ${id}: ${n}`);
    }
  }

  console.log(`\n${line}\nPipeline totals\n${line}`);
  console.log(`already in DB (skipped):  ${alreadyInDb}`);
  console.log(
    `${dryRun ? "would store" : "stored"} un-homed (walk): ${unhomed}`,
  );
  if (unhomedTags.length > 0) {
    // The promotion evidence (design §7): what the items no topic fits are ABOUT. Read this before
    // a source verdict, and before proposing a topic.
    console.log(
      `  top tags among them:    ${unhomedTags.map(({ tag, n }) => `${tag} ${n}`).join(" · ")}`,
    );
  }
  if (walkUnwritten > 0) {
    console.log(
      `walk items not written:   ${walkUnwritten} (--skip-llm cannot score or classify them)`,
    );
  }
  console.log(
    `structural floor dropped: ${Object.values(flooredByRule).reduce((a, b) => a + b, 0)}` +
      ` (dup-title ${flooredByRule["dup-title"]}, bare-title ${flooredByRule["bare-title"]}, thin-summary ${flooredByRule["thin-summary"]})`,
  );
  console.log(
    `curated:                  ${curatedCount}${skipLlm ? " (--skip-llm, neutral score 5)" : ""}`,
  );
  console.log(
    `${dryRun ? "would insert" : "inserted"}:${dryRun ? "" : "              "} ${inserted}${dryRun ? " (--dry-run, no writes made)" : ""}`,
  );
  console.log(
    `memberships written:      ${dryRun ? "0 (--dry-run)" : membershipsWritten}`,
  );

  console.log(
    `\n${line}\nPer-topic ${dryRun ? "would-insert" : "inserted"} (memberships)\n${line}`,
  );
  for (const t of topics) {
    console.log(`  ${t.id.padEnd(24)} ${insertedByTopic.get(t.id) ?? 0}`);
  }

  console.log(`\nelapsed: ${elapsedSec.toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error("ingest script failed:", err);
  process.exit(1);
});
