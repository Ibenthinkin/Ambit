#!/usr/bin/env bun
/**
 * Rewrite stored wikipedia `item.image_url`s from full-resolution originals to 1600 px thumbnails —
 * the repair half of Phase 8.1 T7.4c (the 7.4 finding: `piprop=original` handed the image proxy
 * multi-megabyte files, `upload.wikimedia.org` budgets by bytes, and the warm was abandoned with
 * ~846 images uncached).
 *
 * The adapter now asks PageImages for `pithumbsize=1600` at ingest, so no *new* row arrives as an
 * original — but `scripts/ingest.ts` never revisits an existing (source, sourceId), so the rows
 * ingested before the flip keep their originals until this runs. Same contract as `renormalize`:
 * report by default, write only with `--confirm`.
 *
 *   bun run rethumb                    # report: what would change, and what is left alone, and why
 *   bun run rethumb --confirm          # rewrite, one transaction
 *   bun run rethumb --limit 100        # either of the above, first N rows only
 *
 * **Why this re-asks the API instead of rewriting URLs by pattern.** The plan's first draft called
 * the transform mechanical (`/a/ab/Name.jpg` → `/thumb/a/ab/Name.jpg/1600px-Name.jpg`). It is not:
 * a live probe (09-01-26) showed Wikimedia converts formats in the derivative name (`Margins.svg`
 * → `1920px-Margins.svg.png`, `.tif` → `lossless-page1-…tif.png`, `.pdf` → `page1-…pdf.jpg`,
 * `.webp` → `….webp.png`), snaps 1600 to its standard 1920 bucket, and hands back the *unscaled
 * original* when the file is already narrower than the request. Only the API knows which. One
 * `prop=pageimages` call covers 50 pages, so the whole corpus is ~27 requests to `en.wikipedia.org`
 * — the API host, not the budgeted image host.
 *
 * **The licence guard.** Ingest resolved each lead image's licence per *file*
 * (`imageinfo&iiprop=extmetadata`, see wikipedia.ts) and only stored an image it found free. An
 * article's lead image can change between ingest and now, and the new file's licence was never
 * checked — so a thumbnail is written only when `pageimage` names the SAME file the stored URL
 * points at (`leadImageFileName`). Anything else is reported and left alone; the row keeps
 * serving its original through the proxy exactly as before, and a re-ingest is the honest path to
 * a new image.
 *
 * Safe to re-run: a rewritten row carries `utm_content=thumbnail` (or `thumbnail_unscaled`) and is
 * not selected again. Production runs it once, from inside the container, after the deploy that
 * carries the adapter change: `docker exec "$C" bun run rethumb --confirm`.
 */
import { and, eq, isNotNull, notLike } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item } from "~/server/db/schema";
import { fetchJson } from "~/server/services/sources/http";
import {
  LEAD_IMAGE_WIDTH,
  leadImageFileName,
} from "~/server/services/sources/wikipedia";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const confirm = args.includes("--confirm");
const limit = flag("limit") ? Number(flag("limit")) : undefined;

const WIKI_API = "https://en.wikipedia.org/w/api.php";
/** PageImages' per-call ceiling (`pilimit` max is 50 for non-bots). */
const PAGES_PER_CALL = 50;

interface PageImagesPage {
  pageid?: number;
  missing?: unknown;
  pageimage?: string;
  thumbnail?: { source: string; width: number; height: number };
}

/** Every stored image that is not already a thumbnail. Rows the adapter writes today carry
 *  `utm_content=thumbnail` / `thumbnail_unscaled` — except video stills (`.webm`/`.ogv` →
 *  `/thumb/…/1920px--Name.webm.jpg`), which the API hands back with no tag at all, so the
 *  `/thumb/` path form is the second tell. The pre-7.4c rows carry `utm_content=original`. */
let query = db
  .select({ id: item.id, sourceId: item.sourceId, imageUrl: item.imageUrl })
  .from(item)
  .where(
    and(
      eq(item.source, "wikipedia"),
      isNotNull(item.imageUrl),
      notLike(item.imageUrl, "%utm_content=thumbnail%"),
      notLike(item.imageUrl, "%/thumb/%"),
    ),
  )
  .orderBy(item.sourceId)
  .$dynamic();
if (limit) query = query.limit(limit);
const rows = await query;
console.log(`${rows.length} wikipedia row(s) still point at an original`);

type Outcome =
  | { kind: "rewrite"; newUrl: string }
  | { kind: "changed"; pageimage: string } // the article's lead image is a different file now
  | { kind: "no-image" } // the page exists but reports no lead image any more
  | { kind: "missing" }; // the page is gone from Wikipedia

const outcomes = new Map<string, Outcome>(); // item.id → outcome

for (let i = 0; i < rows.length; i += PAGES_PER_CALL) {
  const batch = rows.slice(i, i + PAGES_PER_CALL);
  const ids = batch.map((r) => r.sourceId);
  const res = (await fetchJson(
    `${WIKI_API}?action=query&format=json&prop=pageimages&piprop=thumbnail|name` +
      `&pithumbsize=${LEAD_IMAGE_WIDTH}&pilimit=${PAGES_PER_CALL}&pageids=${ids.join("|")}`,
    { delayMs: 120 },
  )) as { query?: { pages?: Record<string, PageImagesPage> } };
  const pages = res.query?.pages ?? {};

  for (const row of batch) {
    const page = pages[row.sourceId];
    const stored = leadImageFileName(row.imageUrl!);
    let outcome: Outcome;
    if (!page || page.missing !== undefined) outcome = { kind: "missing" };
    else if (!page.pageimage || !page.thumbnail) outcome = { kind: "no-image" };
    else if (page.pageimage !== stored)
      outcome = { kind: "changed", pageimage: page.pageimage };
    else outcome = { kind: "rewrite", newUrl: page.thumbnail.source };
    outcomes.set(row.id, outcome);
  }
  process.stdout.write(
    `  asked ${Math.min(i + PAGES_PER_CALL, rows.length)}/${rows.length}\r`,
  );
}
process.stdout.write("\n");

const byKind = new Map<Outcome["kind"], number>();
for (const o of outcomes.values())
  byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + 1);
for (const kind of ["rewrite", "changed", "no-image", "missing"] as const)
  console.log(`  ${kind.padEnd(10)} ${byKind.get(kind) ?? 0}`);

// One readable example per outcome, so a dry run is a proof and not just a count.
const shown = new Set<Outcome["kind"]>();
for (const row of rows) {
  const o = outcomes.get(row.id)!;
  if (shown.has(o.kind)) continue;
  shown.add(o.kind);
  console.log(`\n  ${o.kind} — wikipedia/${row.sourceId} (${row.id}):`);
  console.log(`    - ${row.imageUrl}`);
  if (o.kind === "rewrite") console.log(`    + ${o.newUrl}`);
  if (o.kind === "changed")
    console.log(
      `    ! lead image is now ${o.pageimage} — licence unchecked, row kept`,
    );
}

const rewrites = rows.flatMap((r) => {
  const o = outcomes.get(r.id)!;
  return o.kind === "rewrite" ? [{ id: r.id, newUrl: o.newUrl }] : [];
});

if (!confirm) {
  console.log(
    `\nDry run — nothing written. Re-run with --confirm to rewrite ${rewrites.length} row(s).`,
  );
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (const r of rewrites) {
    await tx.update(item).set({ imageUrl: r.newUrl }).where(eq(item.id, r.id));
  }
});
console.log(`\nRewrote ${rewrites.length} row(s).`);
process.exit(0);
