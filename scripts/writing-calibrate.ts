#!/usr/bin/env bun
/**
 * Calibrate the writing curator against Ben (docs/PLAN_writing.md Phase 1, DESIGN D1). **The gate
 * before any re-score**: `recurate:writing` does not run until this agrees with him.
 *
 *   bun run writing:calibrate --sample 40     # draw 40 articles, score each with both models,
 *                                             #   write docs/writing-calibration.md
 *   (Ben fills in ben-score / ben-kind / note for each piece)
 *   bun run writing:calibrate --read          # agreement per model: score MAE + Spearman, kind
 *                                             #   confusion, five worst
 *   bun run writing:calibrate --rescore       # after a prompt change: the pieces already in the
 *                                             #   file, in the same order, with fresh answers
 *
 * The sample is stratified by source and by old (image-rubric) score band — services/
 * writing-calibration.ts says why. Both models are part of the curator's cache key, so the
 * comparison costs cents and a re-run is free. After a prompt change (bump
 * WRITING_PROMPT_VERSION), run `--rescore`: it reads the item ids out of the file rather than
 * drawing again, so the pieces Ben marked are exactly the pieces re-scored, and his marks are
 * carried over by item. (A fresh `--sample` with the same `--seed` draws the same pieces only
 * while the article set is unchanged — an ingest in between moves the draw.)
 *
 * Flags: --seed <s> (default "writing-calibration"), --models <a,b> (default flash-lite,flash),
 * --file <path> (default docs/writing-calibration.md).
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

import { eq, inArray } from "drizzle-orm";

import { isClassifiable } from "~/server/config/topics";
import { readingMinutes, writingText } from "~/server/config/writing";
import { db } from "~/server/db/client";
import { item, topic } from "~/server/db/schema";
import { curateItems, judgePreflight } from "~/server/services/curator";
import { hashSeed, mulberry32 } from "~/server/services/random";
import type { NormalizedItem } from "~/server/services/sources/types";
import {
  type CalibrationEntry,
  calibrationReport,
  parseCalibration,
  renderCalibration,
  stratifiedSample,
} from "~/server/services/writing-calibration";

const args = process.argv.slice(2);
function flagValue(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 ? args[idx + 1] : undefined;
}
const file = flagValue("file") ?? "docs/writing-calibration.md";

if (args.includes("--read")) {
  const entries = parseCalibration(await readFile(file, "utf-8"));
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
  for (const r of calibrationReport(entries)) {
    console.log(`\n${r.model} — ${r.marked} of ${entries.length} marked`);
    console.log(`  score MAE ${f(r.mae)} · Spearman ${f(r.spearman)}`);
    console.log("  kind confusion (rows Ben, columns model):");
    const cols = Object.keys(r.confusion);
    console.log(
      `    ${"".padEnd(10)}${cols.map((c) => c.padEnd(10)).join("")}`,
    );
    for (const [ben, row] of Object.entries(r.confusion))
      console.log(
        `    ${ben.padEnd(10)}${cols.map((c) => String(row[c as keyof typeof row]).padEnd(10)).join("")}`,
      );
    console.log("  worst disagreements:");
    for (const w of r.worst)
      console.log(
        `    #${w.n} ${w.title.slice(0, 50)} — Ben ${w.ben}, model ${w.model}${w.note ? ` (${w.note})` : ""}`,
      );
  }
  process.exit(0);
}

const rescore = args.includes("--rescore");
const n = Number(flagValue("sample"));
if (!rescore && !(n > 0)) {
  console.error("usage: writing:calibrate --sample <n> | --rescore | --read");
  process.exit(1);
}
if (rescore && !existsSync(file)) {
  console.error(
    `--rescore re-scores the pieces in ${file}, and it does not exist.`,
  );
  process.exit(1);
}
const models = (
  flagValue("models") ?? "google/gemini-2.5-flash-lite,google/gemini-2.5-flash"
).split(",");
const judgeProblem = judgePreflight(models);
if (judgeProblem) {
  console.error(judgeProblem);
  process.exit(1);
}
const seed = flagValue("seed") ?? "writing-calibration";

// Marks already in the file survive a re-sample, by item — a prompt iteration keeps Ben's work.
const previousEntries = existsSync(file)
  ? parseCalibration(await readFile(file, "utf-8"))
  : [];
const previous = new Map(previousEntries.map((e) => [e.itemId, e.ben]));

let sample: (typeof item.$inferSelect)[];
if (rescore) {
  // The file's own pieces, in the file's order: the numbering Ben's notes refer to survives.
  const ids = previousEntries.map((e) => e.itemId);
  const byId = new Map(
    (await db.select().from(item).where(inArray(item.id, ids))).map((r) => [
      r.id,
      r,
    ]),
  );
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`not in the database any more: ${missing.join(", ")}`);
    process.exit(1);
  }
  sample = ids.map((id) => byId.get(id)!);
} else {
  // Ordered, so the seeded shuffle starts from the same sequence on every run.
  const articles = await db
    .select()
    .from(item)
    .where(eq(item.type, "article"))
    .orderBy(item.source, item.sourceId);
  sample = stratifiedSample(articles, n, mulberry32(hashSeed(seed)));
}
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

const byModel = new Map<string, Awaited<ReturnType<typeof curateItems>>>();
for (const model of models) {
  console.log(`scoring ${sample.length} with ${model}…`);
  byModel.set(
    model,
    await curateItems(normalized, { topics: vocabulary, writingModel: model }),
  );
}

const entries: CalibrationEntry[] = sample.map((row, i) => ({
  n: i + 1,
  itemId: row.id,
  key: `${row.source}:${row.sourceId}`,
  title: row.title,
  source: row.source,
  minutes: readingMinutes(row.body),
  oldScore: row.curationScore,
  url: row.sourceUrl,
  excerpt: writingText(row.body?.trim() ? row.body : (row.summary ?? ""))
    .replace(/\s+/g, " ")
    .slice(0, 300),
  answers: models.map((model) => {
    const a = byModel.get(model)![i]!;
    return {
      model: model.replace(/^google\//, ""),
      score: a.curationScore,
      kind: a.kind ?? null,
      tags: a.aestheticTags,
      topics: a.topics,
    };
  }),
  ben: previous.get(row.id) ?? {
    score: null,
    kind: null,
    note: "",
  },
}));

await writeFile(file, renderCalibration(entries));
console.log(`wrote ${entries.length} pieces to ${file}`);
process.exit(0);
