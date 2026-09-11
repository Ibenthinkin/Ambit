#!/usr/bin/env bun
// Cut 2a, step two: apply Ben's verdict from docs/topic-proposals.md.
//
//   bun run promote:topics              # dry run — prints exactly what it would do
//   bun run promote:topics --confirm    # writes
//   bun run promote:topics --file docs/topic-proposals-round2.md --confirm   # a later round's file
//
// For each ticked candidate this does three things, and the third is the one that makes the
// backlog visible:
//   1. INSERT the topic row at tier `grown` with empty seed queries (a promoted topic is
//      vocabulary for classifying walk sources, not a query to send five museum APIs).
//   2. INSERT an `item_topic` row, origin `tag`, for EVERY item carrying that tag — homed or not,
//      and in EITHER tag column (the source's own `tags` or the curator's `aesthetic_tags`, since
//      09-06-26; see `carriesTag` below). Membership is additive and never retracted (Cut 1).
//   3. SET `item.topic_id` to the new topic ONLY where it is currently NULL. `topic_id` is the
//      *display* topic; an item already displaying under `mythology` keeps doing so and merely
//      gains a membership. Because the feed still reads `topic_id` (Cut 2b moves it onto the
//      join), this third step is precisely what turns an invisible item into a drawable one.
//
// Note on order: an un-homed item carrying two ticked tags takes the FIRST as its display topic,
// because step 3 only ever fills a NULL. The proposal file is ranked by un-homed count, so that
// first one is the more broadly-attested of the two — which is the right tie-break, and it is
// deterministic given the same file.
//
// **The dry run OVER-COUNTS, and 09-06-26 made it worse.** Each candidate is measured against the
// untouched database, so an item carrying three ticked tags is counted three times in the
// "become visible" column — the write's own number, printed at the end of a --confirm run, is the
// honest one. Since this now matches `aesthetic_tags` as well as `tags` (T3), an item can carry a
// candidate in two vocabularies and more items carry more candidates, so the gap between the dry
// run's total and the real one is wider than it was in Cut 2a. Read the dry run as "which
// candidates have evidence", never as "how much backlog this clears".
import { readFile } from "node:fs/promises";

import type { TopicFacet } from "~/server/db/schema";
import { topicIdFor } from "~/server/services/topic-mining";

const confirm = process.argv.includes("--confirm");
const fileArg = process.argv.indexOf("--file");
const file =
  fileArg > -1 ? process.argv[fileArg + 1]! : "docs/topic-proposals.md";

// A ticked line looks like:
//   - [x] `sculpture` — **Sculpture** <!-- tag: sculpture --> <!-- facet: medium --> · 738 un-homed / …
// The facet comment is new (09-10-26); a verdict written before it has none, and is refused
// below exactly like a `?` — a promoted topic without a facet is invisible in every picker.
const LINE =
  /^- \[x\]\s+`([^`]+)`\s+—\s+\*\*(.+?)\*\*\s+<!--\s*tag:\s*(.+?)\s*-->(?:\s*<!--\s*facet:\s*(.+?)\s*-->)?/;

const doc = await readFile(file, "utf8");
const picks = doc
  .split("\n")
  .map((l) => LINE.exec(l))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ id: m[1]!, label: m[2]!, tag: m[3]!, facet: m[4] }));

if (picks.length === 0) {
  console.error(`No ticked candidates in ${file} — nothing to promote.`);
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

// No facet, no promotion. `?` is what mine:topics writes; a verdict that predates the facet
// slot has nothing at all. Either way the fix is in the file, not here.
const { FACETS } = await import("~/server/config/topic-facets");
for (const p of picks) {
  if (!p.facet || !(FACETS as readonly string[]).includes(p.facet)) {
    console.error(
      `\`${p.id}\` has no facet (found "${p.facet ?? ""}") — set <!-- facet: subject | medium | look | place --> on its line.`,
    );
    process.exit(1);
  }
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

/** "Does this item carry that tag, in EITHER vocabulary?" — the source's own `tags` or the
 *  curator's `aesthetic_tags` (09-06-26, docs/PLAN_caption-less-and-wild.md T3). Both are text[]
 *  and `@>` asks "does this array contain that element"; both are GIN-indexed. Mining proposes
 *  from the union of the two columns, so promotion has to apply to the union or a ticked
 *  candidate would rescue a fraction of the items it was proposed on the strength of. */
const carriesTag = (tag: string) =>
  sql`(${item.tags} @> ARRAY[${tag}]::text[] OR ${item.aestheticTags} @> ARRAY[${tag}]::text[])`;

for (const p of picks) {
  const carrying = await db
    .select({ id: item.id, topicId: item.topicId })
    .from(item)
    .where(carriesTag(p.tag));
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
    .values({
      id: p.id,
      label: p.label,
      seedQueries: {},
      tier: "grown",
      facet: p.facet as TopicFacet,
    })
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
    .where(and(isNull(item.topicId), carriesTag(p.tag)));
}

console.log(
  `\n${totalMemberships} membership(s), ${totalDisplay} item(s) gain a display topic` +
    (confirm ? "" : " — re-run with --confirm to write"),
);
if (confirm) {
  // The DB row is ahead of the map until this is pasted in, and an unpasted facet survives
  // exactly until someone runs `db:seed` against a fresh database.
  console.log(
    "\nAdd to src/server/config/topic-facets.ts (the map is the authority; the DB row is just ahead of it until you do):",
  );
  for (const p of picks) console.log(`  ${p.facet}: "${p.id}",`);
}
process.exit(0);
