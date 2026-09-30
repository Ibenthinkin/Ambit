#!/usr/bin/env bun
/**
 * Delete stored Wikipedia rows that are disambiguation pages — the repair half of the 09-30-26
 * fix. The adapter now drops any page MediaWiki flags `disambiguation` (`isDisambiguation` in
 * wikipedia.ts), but ingest never revisits an existing (source, sourceId), so the rows that got
 * in before the fix stay until this runs. Production had eleven ("Sex", "Music Man",
 * "Modern poetry"…), every one scored 1 by the curator.
 *
 *   bun run repair:disambig            # report: which rows are disambiguation pages
 *   bun run repair:disambig --confirm  # delete them, one transaction
 *
 * **Why it asks the API instead of matching text.** "may refer to:" misses "Sex most commonly
 * refers to:" and "A money machine, or ATM, is…", both disambiguation pages, and it would catch
 * a real article that quotes the phrase. The page property is MediaWiki's own answer, and one
 * `prop=pageprops` call covers 50 pages, so ~4,000 rows is ~80 requests to `en.wikipedia.org`.
 * A page deleted on Wikipedia since ingest comes back `missing` and is left alone.
 *
 * Children first (seen_item and saved_item FK onto item and don't cascade; item_topic does), the
 * same as `bun run retire`. Safe to re-run: a second run finds nothing. Production runs it from
 * inside the container after the deploy that carries the adapter change:
 * `docker exec "$C" bun run repair:disambig --confirm`.
 */
import { eq, inArray } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item, savedItem, seenItem } from "~/server/db/schema";
import { fetchJson } from "~/server/services/sources/http";
import { isDisambiguation } from "~/server/services/sources/wikipedia";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const BATCH = 50; // the API's pageids cap for an ordinary client
const confirm = process.argv.includes("--confirm");

const rows = await db
  .select({ id: item.id, sourceId: item.sourceId, title: item.title })
  .from(item)
  .where(eq(item.source, "wikipedia"));
console.log(`${rows.length} wikipedia row(s) to check`);

const flagged: typeof rows = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = (await fetchJson(
    `${WIKI_API}?action=query&format=json&prop=pageprops&ppprop=disambiguation` +
      `&pageids=${batch.map((r) => r.sourceId).join("|")}`,
    { delayMs: 120 },
  )) as {
    query?: {
      pages?: Record<string, { pageprops?: { disambiguation?: string } }>;
    };
  };
  const pages = res.query?.pages ?? {};
  for (const r of batch) {
    const page = pages[r.sourceId];
    if (page && isDisambiguation(page)) flagged.push(r);
  }
}

for (const r of flagged) console.log(`  ${r.sourceId}\t${r.title}`);
const ids = flagged.map((r) => r.id);
const saved = ids.length
  ? await db
      .select({ n: savedItem.itemId })
      .from(savedItem)
      .where(inArray(savedItem.itemId, ids))
  : [];
console.log(
  `${flagged.length} disambiguation page(s); ${saved.length} saved_item row(s) would go with them`,
);

if (!confirm || ids.length === 0) {
  if (!confirm) console.log("dry run — pass --confirm to delete");
  process.exit(0);
}

await db.transaction(async (tx) => {
  await tx.delete(seenItem).where(inArray(seenItem.itemId, ids));
  await tx.delete(savedItem).where(inArray(savedItem.itemId, ids));
  await tx.delete(item).where(inArray(item.id, ids));
});
console.log(`deleted ${ids.length} item(s) and their seen/saved rows`);
process.exit(0);
