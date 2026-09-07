#!/usr/bin/env bun
/**
 * Apply MAX_TOPICS to `item_topic` rows written before it existed (09-07-26).
 *
 *   bun run trim:memberships            # report only: per source, how many items and rows
 *   bun run trim:memberships --confirm  # delete
 *
 * THE ONE DATED EXCEPTION to Cut 1's additivity rule ("membership is never retracted by code",
 * docs/DESIGN_topic-vocabulary-growth.md §5). Between 09-06 and 09-07-26 the classifier, handed
 * all 99 topics, sometimes listed the vocabulary straight back — 89 sovietpostcards items landed
 * 20+ memberships, nine landed all 99 — and the parser stored every id it recognised. Those rows
 * are a model failure, not a claim about the item; curator.ts's MAX_TOPICS now stops it at the
 * parser, and this script applies the same cap retroactively, by the same evidence: the cached
 * answer's own best-fit-first order. Rules and edge cases are in services/membership-trim.ts and
 * its test; this file is the plumbing — find the over-filed items, read their cache entries,
 * plan, delete. Nothing here calls the LLM and nothing is re-billed.
 *
 * Runs wherever the curation cache lives: locally at `.cache/curation`, and on production inside
 * the app container (`docker exec`, like the nightly ingest), where the volume mounts the same
 * path. An item whose cache entry is missing is reported and left alone — no order, no choice.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db/client";
import { item, itemTopic } from "~/server/db/schema";
import {
  CURATION_CACHE_DIR,
  curationCacheKey,
  MAX_TOPICS,
} from "~/server/services/curator";
import { planMembershipTrim } from "~/server/services/membership-trim";
import type { SourceId } from "~/server/services/sources";

const confirm = process.argv.includes("--confirm");

// Every item with more than MAX_TOPICS curator-origin memberships. Seed and tag rows are not
// counted because the planner never touches them.
const over = await db
  .select({
    id: item.id,
    source: item.source,
    sourceId: item.sourceId,
    topicId: item.topicId,
    n: sql<number>`count(*)::int`,
  })
  .from(itemTopic)
  .innerJoin(item, eq(item.id, itemTopic.itemId))
  .where(eq(itemTopic.origin, "curator"))
  .groupBy(item.id, item.source, item.sourceId, item.topicId)
  .having(sql`count(*) > ${MAX_TOPICS}`);

console.log(
  `${over.length} items carry more than ${MAX_TOPICS} curator memberships`,
);

const perSource = new Map<
  string,
  { items: number; rows: number; noCache: number }
>();
const bump = (source: string, k: "items" | "rows" | "noCache", by = 1) => {
  const s = perSource.get(source) ?? { items: 0, rows: 0, noCache: 0 };
  s[k] += by;
  perSource.set(source, s);
};

let removals: { itemId: string; topicIds: string[] }[] = [];
for (const row of over) {
  const memberships = await db
    .select({ topicId: itemTopic.topicId, origin: itemTopic.origin })
    .from(itemTopic)
    .where(eq(itemTopic.itemId, row.id));

  let cachedOrder: string[] | null = null;
  try {
    const file = path.join(
      CURATION_CACHE_DIR,
      `${curationCacheKey({ source: row.source as SourceId, sourceId: row.sourceId }, true)}.json`,
    );
    const cached = JSON.parse(await readFile(file, "utf-8")) as {
      topics?: string[];
    };
    cachedOrder = cached.topics ?? null;
  } catch {
    cachedOrder = null;
  }
  if (cachedOrder === null) {
    bump(row.source, "noCache");
    continue;
  }

  const plan = planMembershipTrim({
    memberships,
    cachedOrder,
    displayTopic: row.topicId,
  });
  if (plan.remove.length === 0) continue;
  bump(row.source, "items");
  bump(row.source, "rows", plan.remove.length);
  removals.push({ itemId: row.id, topicIds: plan.remove });
}

console.log(
  `\n${"source".padEnd(24)}${"items".padEnd(8)}${"rows to remove".padEnd(16)}no cache (left alone)`,
);
for (const [source, s] of [...perSource].sort(
  (a, b) => b[1].rows - a[1].rows,
)) {
  console.log(
    `${source.padEnd(24)}${String(s.items).padEnd(8)}${String(s.rows).padEnd(16)}${s.noCache}`,
  );
}
const totalRows = removals.reduce((a, r) => a + r.topicIds.length, 0);
console.log(`\ntotal: ${removals.length} items, ${totalRows} rows`);

if (!confirm) {
  console.log("\ndry run — pass --confirm to delete");
  process.exit(0);
}

let deleted = 0;
await db.transaction(async (tx) => {
  for (const r of removals) {
    const gone = await tx
      .delete(itemTopic)
      .where(
        and(
          eq(itemTopic.itemId, r.itemId),
          eq(itemTopic.origin, "curator"),
          inArray(itemTopic.topicId, r.topicIds),
        ),
      )
      .returning({ topicId: itemTopic.topicId });
    deleted += gone.length;
  }
});
console.log(`deleted ${deleted} item_topic rows`);
removals = [];
process.exit(0);
