#!/usr/bin/env bun
// Cut 2a, step two: apply Ben's verdict from docs/topic-proposals.md.
//
//   bun run promote:topics              # dry run — prints exactly what it would do
//   bun run promote:topics --confirm    # writes
//
// For each ticked candidate this does three things, and the third is the one that makes the
// backlog visible:
//   1. INSERT the topic row at tier `grown` with empty seed queries (a promoted topic is
//      vocabulary for classifying walk sources, not a query to send five museum APIs).
//   2. INSERT an `item_topic` row, origin `tag`, for EVERY item carrying that tag — homed or not.
//      Membership is additive and never retracted (Cut 1's rule).
//   3. SET `item.topic_id` to the new topic ONLY where it is currently NULL. `topic_id` is the
//      *display* topic; an item already displaying under `mythology` keeps doing so and merely
//      gains a membership. Because the feed still reads `topic_id` (Cut 2b moves it onto the
//      join), this third step is precisely what turns an invisible item into a drawable one.
//
// Note on order: an un-homed item carrying two ticked tags takes the FIRST as its display topic,
// because step 3 only ever fills a NULL. The proposal file is ranked by un-homed count, so that
// first one is the more broadly-attested of the two — which is the right tie-break, and it is
// deterministic given the same file.
import { readFile } from "node:fs/promises";

import { topicIdFor } from "~/server/services/topic-mining";

const confirm = process.argv.includes("--confirm");

// A ticked line looks like:
//   - [x] `sculpture` — **Sculpture** <!-- tag: sculpture --> · 738 un-homed / …
const LINE =
  /^- \[x\]\s+`([^`]+)`\s+—\s+\*\*(.+?)\*\*\s+<!--\s*tag:\s*(.+?)\s*-->/;

const doc = await readFile("docs/topic-proposals.md", "utf8");
const picks = doc
  .split("\n")
  .map((l) => LINE.exec(l))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ id: m[1]!, label: m[2]!, tag: m[3]! }));

if (picks.length === 0) {
  console.error(
    "No ticked candidates in docs/topic-proposals.md — nothing to promote.",
  );
  console.error('Tick a line by changing "- [ ]" to "- [x]".');
  process.exit(1);
}
// A hand-edited label is welcome; a hand-edited id is a mistake waiting to happen.
for (const p of picks) {
  if (p.id !== topicIdFor(p.tag)) {
    console.error(
      `id/tag mismatch: \`${p.id}\` is not the slug of "${p.tag}" — fix the file.`,
    );
    process.exit(1);
  }
}
// Two ticked lines resolving to one topic id would insert once and then silently promote the
// second tag's items under the first one's label. Caught here rather than discovered in the feed.
const seen = new Set<string>();
for (const p of picks) {
  if (seen.has(p.id)) {
    console.error(
      `duplicate topic id \`${p.id}\` in the verdict — fix the file.`,
    );
    process.exit(1);
  }
  seen.add(p.id);
}

const { db } = await import("~/server/db/client");
const { item, itemTopic, topic } = await import("~/server/db/schema");
const { and, isNull, sql } = await import("drizzle-orm");

// A ticked id that already exists is almost always a mistake (a re-run against an edited file, or
// a tag whose slug collides with one of the sixteen). Report it rather than silently no-op'ing:
// `onConflictDoNothing` on the topic insert would keep the OLD label and tier.
const existingIds = new Set(
  (await db.select({ id: topic.id }).from(topic)).map((r) => r.id),
);

console.log(
  `${picks.length} topic(s) ticked${confirm ? "" : " — DRY RUN, no writes"}\n`,
);
let totalMemberships = 0;
let totalDisplay = 0;

for (const p of picks) {
  // `tags` is a text[]; `@>` asks "does this array contain that element".
  const carrying = await db
    .select({ id: item.id, topicId: item.topicId })
    .from(item)
    .where(sql`${item.tags} @> ARRAY[${p.tag}]::text[]`);
  const unhomed = carrying.filter((r) => r.topicId === null);
  totalMemberships += carrying.length;
  totalDisplay += unhomed.length;
  console.log(
    `  ${p.id.padEnd(28)} ${String(carrying.length).padStart(5)} memberships · ` +
      `${String(unhomed.length).padStart(5)} become visible` +
      (existingIds.has(p.id)
        ? "  [topic row already exists — label unchanged]"
        : ""),
  );
  if (!confirm) continue;

  await db
    .insert(topic)
    .values({ id: p.id, label: p.label, seedQueries: {}, tier: "grown" })
    .onConflictDoNothing();
  if (carrying.length > 0) {
    // Chunked: a single insert of tens of thousands of rows can exceed the parameter limit.
    for (let i = 0; i < carrying.length; i += 1000) {
      await db
        .insert(itemTopic)
        .values(
          carrying.slice(i, i + 1000).map((r) => ({
            itemId: r.id,
            topicId: p.id,
            origin: "tag" as const,
          })),
        )
        .onConflictDoNothing();
    }
  }
  await db
    .update(item)
    .set({ topicId: p.id })
    .where(
      and(isNull(item.topicId), sql`${item.tags} @> ARRAY[${p.tag}]::text[]`),
    );
}

console.log(
  `\n${totalMemberships} membership(s), ${totalDisplay} item(s) gain a display topic` +
    (confirm ? "" : " — re-run with --confirm to write"),
);
process.exit(0);
