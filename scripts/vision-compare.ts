#!/usr/bin/env bun
/**
 * Compare a new vision judge with the scores already in the database
 * (docs/DESIGN_claude-judge-ingest.md D8). **The gate before the Claude judge scores pictures
 * for real.**
 *
 *   CURATOR_JUDGE=claude bun run vision:compare --sample 300
 *
 * Draws a sample of stored pictures — sources take turns, and within a source its score bands
 * take turns (writing-calibration.ts's stratifiedSample) — scores each under the current judge,
 * and writes docs/vision-comparison.md: the shift per source, the rank agreement, and the twenty
 * largest disagreements as links for Ben to look at. Writes nothing to the database.
 *
 * Every picture goes through classify mode, the walk lane's prompt: it is the curator prompt plus
 * the topic list, and its answers land in the same cache namespace a later walk reads, so the
 * walk-source half of this sample is never judged twice. Loupe is left out: its images are
 * bearer-gated and its corpus is Ben's own.
 *
 * Flags: --sample <n> (required), --seed <s> (default "vision-comparison"),
 * --file <path> (default docs/vision-comparison.md).
 */
import { writeFile } from "node:fs/promises";

import { and, eq, ne } from "drizzle-orm";

import { isClassifiable } from "~/server/config/topics";
import { db } from "~/server/db/client";
import { item, topic } from "~/server/db/schema";
import { claudeUsage } from "~/server/services/claude-judge";
import {
  curateItems,
  judgeModel,
  judgePreflight,
} from "~/server/services/curator";
import { hashSeed, mulberry32 } from "~/server/services/random";
import { ALL_SOURCE_IDS } from "~/server/services/sources";
import type { NormalizedItem } from "~/server/services/sources/types";
import {
  renderVision,
  visionReport,
  type VisionPair,
} from "~/server/services/vision-comparison";
import { stratifiedSample } from "~/server/services/writing-calibration";

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}
const n = Number(flagValue("sample"));
const file = flagValue("file") ?? "docs/vision-comparison.md";
const seed = flagValue("seed") ?? "vision-comparison";
if (!(n > 0)) {
  console.error("usage: vision:compare --sample <n>");
  process.exit(1);
}
const problem = judgePreflight();
if (problem) {
  console.error(problem);
  process.exit(1);
}

// A narrow projection: this is ~170,000 rows, and their bodies and summaries are not needed to
// choose a sample. Ordered, so the seeded shuffle starts from the same sequence every run.
const pictures = await db
  .select({
    id: item.id,
    source: item.source,
    sourceId: item.sourceId,
    curationScore: item.curationScore,
  })
  .from(item)
  .where(and(eq(item.type, "image"), ne(item.source, "loupe")))
  .orderBy(item.source, item.sourceId);
// Registered sources only: a local database also holds rows the e2e suite left behind under
// fixture source names, whose "pictures" are placeholders and whose scores mean nothing.
const known = new Set<string>(ALL_SOURCE_IDS);
const chosen = stratifiedSample(
  pictures.filter((p) => known.has(p.source)),
  n,
  mulberry32(hashSeed(seed)),
);

const rows = new Map<string, typeof item.$inferSelect>();
for (const picked of chosen) {
  const [row] = await db.select().from(item).where(eq(item.id, picked.id));
  if (row) rows.set(row.id, row);
}
const sample = chosen.flatMap((c) => rows.get(c.id) ?? []);
const vocabulary = (await db.select().from(topic)).filter(isClassifiable);

const normalized: NormalizedItem[] = sample.map((row) => ({
  source: row.source as NormalizedItem["source"],
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
}));

console.log(`scoring ${sample.length} pictures with ${judgeModel()}…`);
const unseen = new Set<string>();
const curated = await curateItems(normalized, {
  classify: true,
  topics: vocabulary,
  onImageFetchFailure: (it) => unseen.add(`${it.source}:${it.sourceId}`),
  onProgress: (done, total) => {
    if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`);
  },
});

// Two kinds of answer are not a comparison of judges and are left out: a picture the curator
// could not fetch (judged from its caption), and curateItems' gave-up fallback (score 5, no tags).
const pairs: VisionPair[] = [];
sample.forEach((row, i) => {
  const answer = curated[i];
  if (!answer) return;
  if (unseen.has(`${row.source}:${row.sourceId}`)) return;
  if (answer.curationScore === 5 && answer.aestheticTags.length === 0) return;
  pairs.push({
    itemId: row.id,
    source: row.source,
    title: row.title,
    old: row.curationScore,
    next: answer.curationScore,
  });
});

const now = new Date();
const date = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getFullYear()).slice(2)}`;
await writeFile(
  file,
  renderVision(visionReport(pairs), {
    model: judgeModel(),
    excluded: sample.length - pairs.length,
    date,
  }),
);
console.log(`wrote ${pairs.length} comparisons to ${file}`);
const usage = claudeUsage();
if (usage)
  console.log(
    `subscription: ${JSON.stringify(usage.first.unifiedWindows)} → ${JSON.stringify(usage.last.unifiedWindows)}`,
  );
process.exit(0);
