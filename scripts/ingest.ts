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
 *      plate can satisfy both "anatomy" and "art" searches). `item.topic_id` is single-valued and
 *      NOT NULL, so exactly one claim has to win — resolveCollisions() (server/services/
 *      ingest-plan.ts) picks the highest-ranked claim, order-independently (SPEC §15).
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
 *   bun run ingest --topic astronomy --source met --quota 20
 *   (* --dry-run alone still calls the curator unless paired with --skip-llm; combine both for a
 *      genuinely free structural dry run.)
 */
import { db } from "~/server/db/client";
import { upsertItem } from "~/server/db/items";
import { item, topic } from "~/server/db/schema";
import type { Claim } from "~/server/services/ingest-plan";
import { resolveCollisions } from "~/server/services/ingest-plan";
import type {
  CuratedItem,
  StructuralDropRule,
} from "~/server/services/curator";
import { curateItems, structuralFloor } from "~/server/services/curator";
import { isSuspendedSource } from "~/server/config/suspended-sources";
import { adapters } from "~/server/services/sources";
import type { SourceId } from "~/server/services/sources";

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

if (!Number.isFinite(quota) || quota <= 0) {
  console.error(
    `--quota must be a positive number, got "${flagValue("quota")}"`,
  );
  process.exit(1);
}

const knownSources = Object.keys(adapters) as SourceId[];
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
  sourceId: SourceId,
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
    `Ingesting ${topics.length} topic(s) × ${sourceIds.length} source(s), quota ${quota}/cell` +
      `${skipLlm ? " [skip-llm]" : ""}${dryRun ? " [dry-run]" : ""}…\n`,
  );

  // Step 1: search + normalize, one source's worth of work per settled promise. allSettled (not
  // all) so a single source crashing outright doesn't take the other four down with it — the same
  // "one source down ≠ job dead" guarantee processSource already gives at the topic level, one
  // level up.
  const results = await Promise.allSettled(
    sourceIds.map((sourceId) => processSource(sourceId, topics, quota)),
  );

  const statsBySource = new Map<SourceId, SourceRunStats>();
  const allClaims: Claim[] = [];
  for (const [i, result] of results.entries()) {
    const sourceId = sourceIds[i]!;
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

  // Step 4: structural floor. structuralFloor() only sees NormalizedItems, so a lookup map keyed
  // on (source, sourceId) — the same key the DB's UNIQUE constraint uses — is how each surviving
  // item finds its way back to the topicId/rank it won under, after floor + curation are done.
  const winnerByKey = new Map(
    newWinners.map((w) => [`${w.item.source}:${w.item.sourceId}`, w] as const),
  );
  const { kept, dropped } = structuralFloor(newWinners.map((w) => w.item));
  const flooredByRule: Record<StructuralDropRule, number> = {
    "dup-title": 0,
    "bare-title": 0,
    "thin-summary": 0,
  };
  for (const d of dropped) flooredByRule[d.rule]++;

  // Step 5: curate. --skip-llm assigns a neutral score instead of calling the network at all —
  // free, and useful for verifying the rest of the pipeline's plumbing before spending a cent.
  let lastPrintedPct = -1;
  const curated: CuratedItem[] = skipLlm
    ? kept.map((it): CuratedItem => ({
        ...it,
        curationScore: 5,
        aestheticTags: [],
      }))
    : await curateItems(kept, {
        onProgress: (done, total) => {
          const pct = Math.floor((done / total) * 100);
          if (pct !== lastPrintedPct && (pct % 10 === 0 || done === total)) {
            lastPrintedPct = pct;
            console.log(`  curating: ${done}/${total} (${pct}%)`);
          }
        },
      });

  // Step 6: upsert. Under --dry-run this loop still computes exactly what WOULD be written (so
  // the summary reflects reality) but never calls upsertItem — the "no DB writes" guarantee.
  let inserted = 0;
  const insertedByTopic = new Map<string, number>();
  for (const curatedItem of curated) {
    const winner = winnerByKey.get(
      `${curatedItem.source}:${curatedItem.sourceId}`,
    );
    if (!winner) continue; // unreachable in practice — every curated item came from winnerByKey's own keys
    if (!dryRun) await upsertItem({ ...curatedItem, topicId: winner.topicId });
    inserted++;
    insertedByTopic.set(
      winner.topicId,
      (insertedByTopic.get(winner.topicId) ?? 0) + 1,
    );
  }

  printSummary({
    topics,
    sourceIds,
    statsBySource,
    collisionCountBySource,
    alreadyInDb,
    flooredByRule,
    curatedCount: curated.length,
    inserted,
    insertedByTopic,
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
  alreadyInDb: number;
  flooredByRule: Record<StructuralDropRule, number>;
  curatedCount: number;
  inserted: number;
  insertedByTopic: Map<string, number>;
  elapsedSec: number;
  dryRun: boolean;
  skipLlm: boolean;
}) {
  const {
    topics,
    sourceIds,
    statsBySource,
    collisionCountBySource,
    alreadyInDb,
    flooredByRule,
    curatedCount,
    inserted,
    insertedByTopic,
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
      "collisions",
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
        String(collisionCountBySource[sourceId] ?? 0),
      ].join(""),
    );
  }

  console.log(`\n${line}\nPipeline totals\n${line}`);
  console.log(`already in DB (skipped):  ${alreadyInDb}`);
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
    `\n${line}\nPer-topic ${dryRun ? "would-insert" : "inserted"}\n${line}`,
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
