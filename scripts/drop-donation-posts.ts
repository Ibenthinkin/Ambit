#!/usr/bin/env bun
/**
 * Delete the donation posts stored before the structural floor dropped them (10-01-26).
 *
 *   bun run drop:donations            # report only: lists every row it would delete
 *   bun run drop:donations --confirm  # delete
 *
 * `isDonationPost` (services/curator.ts) now drops a blog's "support this page" banner before
 * any judge sees it, so no new one is stored. This removes the ones already in `item` — Ben:
 * "delete the 22 donation posts". It asks the same function the floor asks, so the two can never
 * disagree about what a donation post is; the SQL `ILIKE` is only a cheap pre-filter so the
 * whole corpus is not pulled into memory to find a couple of dozen rows.
 *
 * Children first, in one transaction: `seen_item` and `saved_item` both reference `item` and
 * neither cascades (`item_topic` does). A reader's save of a banner goes with the banner, and
 * the report says how many there are before anything is written. Idempotent — a second run finds
 * nothing. Runs on production inside the app container after a deploy, like the repair scripts.
 */
import { ilike, inArray, or } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item, savedItem, seenItem } from "~/server/db/schema";
import { isDonationPost } from "~/server/services/curator";

const confirm = process.argv.includes("--confirm");

// Keep in step with DONATION_LINK in curator.ts. A domain missing here only means a row is not
// pre-selected; the decision itself is always isDonationPost's.
const DOMAINS = ["ko-fi.com", "patreon.com", "buymeacoffee.com", "paypal.me"];

const candidates = await db
  .select({
    id: item.id,
    source: item.source,
    title: item.title,
    summary: item.summary,
    score: item.curationScore,
  })
  .from(item)
  .where(
    or(
      ...DOMAINS.flatMap((d) => [
        ilike(item.title, `%${d}%`),
        ilike(item.summary, `%${d}%`),
      ]),
    ),
  );

const doomed = candidates.filter((row) =>
  isDonationPost({ title: row.title, summary: row.summary ?? "" }),
);
const ids = doomed.map((row) => row.id);

console.log(
  `${candidates.length} row(s) mention a donation link; ${doomed.length} are donation posts:`,
);
for (const row of doomed) {
  console.log(
    `  ${row.source}  score ${row.score ?? "-"}  ${row.id}  ${row.title.slice(0, 70)}`,
  );
}

const saved = ids.length
  ? await db
      .select({ id: savedItem.itemId })
      .from(savedItem)
      .where(inArray(savedItem.itemId, ids))
  : [];
console.log(`${saved.length} saved_item row(s) would go with them`);

if (!confirm) {
  console.log("\nreport only — pass --confirm to delete");
  process.exit(0);
}

if (ids.length > 0) {
  await db.transaction(async (tx) => {
    await tx.delete(seenItem).where(inArray(seenItem.itemId, ids));
    await tx.delete(savedItem).where(inArray(savedItem.itemId, ids));
    await tx.delete(item).where(inArray(item.id, ids));
  });
}
console.log(`deleted ${ids.length} item(s) and their seen/saved rows`);
process.exit(0);
