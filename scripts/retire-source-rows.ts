#!/usr/bin/env bun
/**
 * Delete a source's rows from `item` by sourceId list — Phase 6.3's half of D2 (docs/
 * PHASE6_DESIGN_6.3.md §9): once ambit-archive stops serving doorofperception, the archive rows
 * Ambit already holds for those images are miscredited ("Personal archive", no post link) and
 * must go. Precise by id, so saves on the archive's OTHER items survive.
 *
 *   bun run retire --source archive --ids <file>            # report only
 *   bun run retire --source archive --ids <file> --confirm  # delete
 *
 * Children first (seen_item, saved_item both FK onto item; neither cascades), in one transaction.
 * `--confirm` is required to write; without it this prints what it WOULD delete and exits 0.
 */
import { readFileSync } from "node:fs";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item, savedItem, seenItem } from "~/server/db/schema";
import { ALL_SOURCE_IDS } from "~/server/services/sources";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 ? args[i + 1] : undefined;
};
const source = flag("source");
const idsPath = flag("ids");
const confirm = args.includes("--confirm");

if (!source || !(ALL_SOURCE_IDS as string[]).includes(source) || !idsPath) {
  console.error(
    "usage: bun run retire --source <source> --ids <file> [--confirm]",
  );
  console.error(`known sources: ${ALL_SOURCE_IDS.join(", ")}`);
  process.exit(1);
}

const sourceIds = readFileSync(idsPath, "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
console.log(`${sourceIds.length} sourceId(s) read from ${idsPath}`);

// Chunked: `inArray` with 11k params is fine for Postgres but not for readability of a failure.
const CHUNK = 1000;
const ids: string[] = [];
for (let i = 0; i < sourceIds.length; i += CHUNK) {
  const rows = await db
    .select({ id: item.id })
    .from(item)
    .where(
      and(
        eq(item.source, source),
        inArray(item.sourceId, sourceIds.slice(i, i + CHUNK)),
      ),
    );
  ids.push(...rows.map((r) => r.id));
}
const savedRows = ids.length
  ? await db
      .select({ n: savedItem.itemId })
      .from(savedItem)
      .where(inArray(savedItem.itemId, ids))
  : [];
console.log(
  `${ids.length} matching item row(s) for source "${source}"; ${savedRows.length} saved_item row(s) would go with them`,
);

if (!confirm) {
  console.log("dry run — pass --confirm to delete");
  process.exit(0);
}

await db.transaction(async (tx) => {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    await tx.delete(seenItem).where(inArray(seenItem.itemId, slice));
    await tx.delete(savedItem).where(inArray(savedItem.itemId, slice));
    await tx.delete(item).where(inArray(item.id, slice));
  }
});
console.log(`deleted ${ids.length} item(s) and their seen/saved rows`);
process.exit(0);
