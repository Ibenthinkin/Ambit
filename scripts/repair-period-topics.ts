#!/usr/bin/env bun
/**
 * Repair the classifier's period-topic filings (09-07-26).
 *
 *   bun run repair:periods            # report only: per source, keep / remove / display moves
 *   bun run repair:periods --confirm  # write
 *
 * For every PERIOD_TOPICS entry (config/topics.ts — `19th-century` today), every curator-origin
 * `item_topic` row under it is kept only if the item's own title, summary or tags carry the
 * period (`periodEvidence`); otherwise the row is removed, and if that topic was the item's
 * display topic the display moves to the next honest membership or to NULL (un-homed → WILD).
 * Rules in services/period-repair.ts and its test; this file is the plumbing. Tag- and
 * seed-origin rows are never touched. Nothing calls the LLM; nothing is re-billed.
 *
 * The second dated exception to Cut 1's additivity rule, for the same reason as the first
 * (trim-memberships.ts): these rows are a measured model failure, not claims about items. Reads
 * the curation cache for display-topic succession only — an item with no cache entry still gets
 * its row removed (the evidence rule needs no cache), and its display falls to any remaining
 * membership. Runs on production inside the app container, like the nightly ingest.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { PERIOD_TOPICS, periodEvidence } from "~/server/config/topics";
import { db } from "~/server/db/client";
import { item, itemTopic } from "~/server/db/schema";
import {
  CURATION_CACHE_DIR,
  curationCacheKey,
} from "~/server/services/curator";
import { planPeriodRepair } from "~/server/services/period-repair";
import type { SourceId } from "~/server/services/sources";

const confirm = process.argv.includes("--confirm");

interface Change {
  itemId: string;
  periodTopic: string;
  newDisplay: string | null | undefined;
}
const changes: Change[] = [];
const stats = new Map<
  string,
  { kept: number; removed: number; displayMoved: number; displayNulled: number }
>();
const bump = (
  source: string,
  k: keyof NonNullable<ReturnType<typeof stats.get>>,
) => {
  const s = stats.get(source) ?? {
    kept: 0,
    removed: 0,
    displayMoved: 0,
    displayNulled: 0,
  };
  s[k]++;
  stats.set(source, s);
};

for (const periodTopic of Object.keys(PERIOD_TOPICS)) {
  const rows = await db
    .select({
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      summary: item.summary,
      tags: item.tags,
      topicId: item.topicId,
    })
    .from(itemTopic)
    .innerJoin(item, eq(item.id, itemTopic.itemId))
    .where(
      and(eq(itemTopic.topicId, periodTopic), eq(itemTopic.origin, "curator")),
    );
  console.log(
    `${periodTopic}: ${rows.length} curator-origin memberships to check`,
  );

  for (const row of rows) {
    const evidence = periodEvidence(periodTopic, row);
    if (evidence) {
      bump(row.source, "kept");
      continue;
    }
    const memberships = await db
      .select({ topicId: itemTopic.topicId, origin: itemTopic.origin })
      .from(itemTopic)
      .where(eq(itemTopic.itemId, row.id));
    let cachedOrder: string[] = [];
    try {
      const file = path.join(
        CURATION_CACHE_DIR,
        `${curationCacheKey({ source: row.source as SourceId, sourceId: row.sourceId }, true)}.json`,
      );
      cachedOrder =
        (JSON.parse(await readFile(file, "utf-8")) as { topics?: string[] })
          .topics ?? [];
    } catch {
      /* no cache entry — succession falls back to any remaining membership */
    }
    const plan = planPeriodRepair({
      periodTopic,
      memberships,
      cachedOrder,
      displayTopic: row.topicId,
      evidence,
    });
    if (!plan.remove) {
      bump(row.source, "kept");
      continue;
    }
    bump(row.source, "removed");
    if (plan.newDisplay === null) bump(row.source, "displayNulled");
    else if (plan.newDisplay !== undefined) bump(row.source, "displayMoved");
    changes.push({ itemId: row.id, periodTopic, newDisplay: plan.newDisplay });
  }
}

console.log(
  `\n${"source".padEnd(24)}${"kept".padEnd(8)}${"removed".padEnd(10)}${"display moved".padEnd(16)}display → null`,
);
for (const [source, s] of [...stats].sort(
  (a, b) => b[1].removed - a[1].removed,
)) {
  console.log(
    `${source.padEnd(24)}${String(s.kept).padEnd(8)}${String(s.removed).padEnd(10)}${String(s.displayMoved).padEnd(16)}${s.displayNulled}`,
  );
}
console.log(`\ntotal rows to remove: ${changes.length}`);

if (!confirm) {
  console.log("\ndry run — pass --confirm to write");
  process.exit(0);
}

let removed = 0;
await db.transaction(async (tx) => {
  for (const c of changes) {
    const gone = await tx
      .delete(itemTopic)
      .where(
        and(
          eq(itemTopic.itemId, c.itemId),
          eq(itemTopic.topicId, c.periodTopic),
          eq(itemTopic.origin, "curator"),
        ),
      )
      .returning({ itemId: itemTopic.itemId });
    removed += gone.length;
    if (c.newDisplay !== undefined) {
      await tx
        .update(item)
        .set({ topicId: c.newDisplay })
        .where(eq(item.id, c.itemId));
    }
  }
});
console.log(
  `removed ${removed} item_topic rows; display updated for ${changes.filter((c) => c.newDisplay !== undefined).length} items`,
);
process.exit(0);
