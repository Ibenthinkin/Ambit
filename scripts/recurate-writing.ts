#!/usr/bin/env bun
/**
 * Re-score the articles already in the DB with the writing curator (docs/PLAN_writing.md Phase 1,
 * docs/DESIGN_writing.md D1). Every article was scored by the image rubric at ingest — Wikipedia
 * averages 5.2 under it, a third of it at the floor — and none of them has a `kind` or a reading
 * time. This is the one-off that fixes the rows ingest will never revisit.
 *
 * **Run it only after the calibration agrees with Ben** (`bun run writing:calibrate`): that file
 * is the gate, and this script is what it gates.
 *
 * Unlike `recurate` (image repair, writes by default) this one is the other way round, like the
 * repair scripts: **a dry run unless `--confirm`**. A dry run still bills the curator — the
 * answers land in `.cache/curation`, so the `--confirm` run that follows is free — and prints
 * what would change: the mean score per source before and after, the kind histogram, and every
 * piece the curator called `news` (demoted to 1 on write, never deleted).
 *
 * The write itself is `services/writing-rescore.ts`: fields replaced, memberships added as
 * `curator`, the display topic set only where it was NULL.
 *
 * **Loupe is left out** unless `--source loupe` names it (Ben, calibration note on #4, 09-28-26:
 * "i think we should exclude the archive entries for now"). Its OCR clippings are fragments the
 * rubric cannot judge fairly yet, and Loupe is suspended on production anyway.
 *
 * Usage:
 *   bun run recurate:writing                          # every article but Loupe's, dry run
 *   bun run recurate:writing --source wikipedia --limit 20
 *   bun run recurate:writing --confirm                # write
 *   bun run recurate:writing --offset 1200 --confirm  # resume (rows are (source, sourceId)-ordered)
 */
import { and, eq, notInArray } from "drizzle-orm";

import { isClassifiable } from "~/server/config/topics";
import { WRITING_KINDS } from "~/server/config/writing";
import { db } from "~/server/db/client";
import { item, topic } from "~/server/db/schema";
import { curateItems, CURATOR_MODEL } from "~/server/services/curator";
import type { NormalizedItem } from "~/server/services/sources/types";
import {
  applyWritingRescore,
  planWritingRescore,
} from "~/server/services/writing-rescore";

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}

const source = flagValue("source");
/** Sources a bare run skips; naming one with --source still re-scores it. */
const EXCLUDED_SOURCES = ["loupe"];
const limit = flagValue("limit") ? Number(flagValue("limit")) : undefined;
const offset = Number(flagValue("offset") ?? 0);
const confirm = args.includes("--confirm");
const model = flagValue("model") ?? CURATOR_MODEL;

if (limit !== undefined && !(limit > 0)) {
  console.error(
    `--limit must be a positive number, got "${flagValue("limit")}"`,
  );
  process.exit(1);
}
if (!(offset >= 0)) {
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

const rows = await db
  .select()
  .from(item)
  .where(
    source
      ? and(eq(item.type, "article"), eq(item.source, source))
      : and(
          eq(item.type, "article"),
          notInArray(item.source, EXCLUDED_SOURCES),
        ),
  )
  .orderBy(item.source, item.sourceId)
  .limit(limit ?? Number.MAX_SAFE_INTEGER)
  .offset(offset);

if (rows.length === 0) {
  console.log("no article rows match — nothing to do");
  process.exit(0);
}

// The same vocabulary ingest classifies with: every topic, less test leftovers and period topics.
const vocabulary = (await db.select().from(topic)).filter(isClassifiable);

console.log(
  `${rows.length} article(s)${source ? ` from ${source}` : ` (skipping ${EXCLUDED_SOURCES.join(", ")})`}${offset ? ` (from offset ${offset})` : ""}, ` +
    `model ${model}, vocabulary ${vocabulary.length} topics` +
    (confirm ? "" : " — DRY RUN (bills the curator, writes nothing)"),
);

function rowToNormalized(row: (typeof rows)[number]): NormalizedItem {
  return {
    source: row.source as NormalizedItem["source"],
    sourceId: row.sourceId,
    type: row.type,
    title: row.title,
    summary: row.summary ?? "",
    // Carried on purpose: the writing curator reads the body, and reading time is counted on it.
    body: row.body,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    attribution: row.attribution ?? "",
    license: row.license ?? "",
    tags: row.tags,
  };
}

const CHUNK = 50;
type Tally = { n: number; before: number; after: number };
const bySource = new Map<string, Tally>();
const kinds: Record<string, number> = {};
const news: string[] = [];
let skippedFallback = 0;
let membershipsAdded = 0;
let gainedDisplay = 0;
let written = 0;

for (let at = 0; at < rows.length; at += CHUNK) {
  const chunk = rows.slice(at, at + CHUNK);
  const curated = await curateItems(chunk.map(rowToNormalized), {
    topics: vocabulary,
    writingModel: model,
  });

  for (const [i, answer] of curated.entries()) {
    const row = chunk[i];
    if (!row) continue;
    // curateItems' gave-up-after-retries fallback: score 5, no tags, no kind. Keep the old row
    // rather than write a guess — the same rule `recurate` follows.
    if (
      answer.curationScore === 5 &&
      answer.aestheticTags.length === 0 &&
      !answer.kind
    ) {
      skippedFallback++;
      continue;
    }
    const plan = planWritingRescore(row.id, answer);
    const t = bySource.get(row.source) ?? { n: 0, before: 0, after: 0 };
    t.n++;
    t.before += row.curationScore;
    t.after += plan.score;
    bySource.set(row.source, t);
    kinds[plan.kind ?? "(none)"] = (kinds[plan.kind ?? "(none)"] ?? 0) + 1;
    if (plan.news) news.push(`${row.source}:${row.sourceId}  ${row.title}`);

    if (confirm) {
      const out = await applyWritingRescore(db, plan);
      membershipsAdded += out.membershipsAdded;
      if (out.gainedDisplay) gainedDisplay++;
      written++;
    }
  }
  console.log(`  ${Math.min(at + CHUNK, rows.length)}/${rows.length}`);
}

console.log("\nmean score by source (before → after)");
for (const [s, t] of bySource)
  console.log(
    `  ${s.padEnd(12)} ${t.n} rows  ${(t.before / t.n).toFixed(2)} → ${(t.after / t.n).toFixed(2)}`,
  );
console.log(
  `\nkinds: ${[...WRITING_KINDS, "(none)"].map((k) => `${k} ${kinds[k] ?? 0}`).join(" · ")}`,
);
console.log(
  `\nnews (${news.length}) — ${confirm ? "demoted to 1" : "would be demoted to 1"}:`,
);
for (const n of news) console.log(`  ${n}`);
if (skippedFallback)
  console.log(`\nkept old row (curator fallback): ${skippedFallback}`);
console.log(
  confirm
    ? `\nwritten ${written} · memberships added ${membershipsAdded} · gained a display topic ${gainedDisplay}`
    : `\nnothing written — re-run with --confirm (free: the answers are cached)`,
);
process.exit(0);
