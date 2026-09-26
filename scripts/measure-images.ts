#!/usr/bin/env bun
/**
 * Records each cached master's pixel size on its item (`image_width`, `image_height`) — the data
 * the landing reel reads to give a phone tall pictures and a computer wide ones
 * (config/landing-pool.ts, docs/DESIGN_landing-redo.md's 09-25-26 amendment).
 *
 *   bun run img:dims --landing          # only the rows the landing can draw — seconds
 *   bun run img:dims                    # every item with a cached master
 *   bun run img:dims --dry-run          # count, write nothing
 *
 * **What it touches.** Reads `IMAGE_CACHE_DIR` headers (no pixels, no network) and writes two
 * integer columns on rows where they are NULL. Nothing is fetched: an item whose master isn't
 * cached is skipped and stays out of the landing pool until `img:warm` fills it (which records its
 * size itself). Idempotent — a second run finds nothing to do.
 */
import { and, eq, gte, isNull, like, sql } from "drizzle-orm";

import {
  isLandingLicense,
  LANDING_SCORE_FLOOR,
} from "~/server/config/landing-pool";
import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { readCachedSize } from "~/server/services/image-cache";

const dryRun = process.argv.includes("--dry-run");
const landingOnly = process.argv.includes("--landing");

const conditions = [like(item.imageUrl, "http%"), isNull(item.imageWidth)];
if (landingOnly) {
  conditions.push(eq(item.type, "image"));
  conditions.push(gte(item.curationScore, LANDING_SCORE_FLOOR));
}
const selected = await db
  .select({ id: item.id, license: item.license })
  .from(item)
  .where(and(...conditions));
const rows = landingOnly
  ? selected.filter((r) => isLandingLicense(r.license))
  : selected;

console.log(
  `dims: ${rows.length} unmeasured rows` +
    (landingOnly ? " (landing pool only)" : "") +
    (dryRun ? " · DRY RUN" : ""),
);

let measured = 0;
let uncached = 0;
let batch: { id: string; width: number; height: number }[] = [];

/** One `UPDATE … FROM (VALUES …)` per 500 rows: 195k single updates would take minutes. */
async function flush() {
  if (batch.length === 0 || dryRun) {
    batch = [];
    return;
  }
  const values = sql.join(
    batch.map((b) => sql`(${b.id}, ${b.width}::int, ${b.height}::int)`),
    sql`, `,
  );
  await db.execute(sql`
    update ${item} set image_width = v.w, image_height = v.h
    from (values ${values}) as v(id, w, h)
    where ${item.id} = v.id`);
  batch = [];
}

for (const r of rows) {
  const size = await readCachedSize(r.id);
  if (!size) {
    uncached++;
    continue;
  }
  measured++;
  batch.push({ id: r.id, ...size });
  if (batch.length >= 500) await flush();
  if (measured % 5000 === 0) process.stdout.write(`  … ${measured} measured\n`);
}
await flush();

console.log(
  `dims: ${measured} ${dryRun ? "would be " : ""}recorded · ${uncached} not cached (skipped)`,
);
process.exit(0);
