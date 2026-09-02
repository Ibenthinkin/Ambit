# Topic vocabulary growth — Cut 1 Implementation Plan

> **Execution state:** Task 7 done — 2b42005. The executing session updates this line per task
> (`Task N done — <commit>`), so a cold resume knows where it is without reading git.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-02-26 by a planning session (Fable) that read every file this plan touches and
**trialled the schema edit** to capture the exact typecheck worklist (Task 2/3 list the 15 errors
by file and line — they are real, not predicted). **For:** a cold session on a cheaper model.

**Goal:** Stop ingest destroying good walk-source items for lack of a topic — store them with
their tags, let the curator name *every* honest topic (or none), and record topic membership in a
new join table — without moving the feed, the topic graph, or onboarding.

**Architecture:** `item.topic_id` becomes nullable and is redefined as the *display* topic; a new
`item_topic (item_id, topic_id, origin)` table holds membership, backfilled in the same migration
with one row per existing item. The curator's classify mode returns an **array** of topic ids
(possibly empty) and old cache entries are **read forward**, so nothing is re-billed. The ingest
walk lane inserts every curated item, writes one membership row per topic, and prints a tag
histogram over the un-homed items — the evidence Cut 2's promotion will run on. The feed keeps
reading `topic_id`; SQL `NULL` never matches `inArray`/`eq`, so un-homed items are invisible to it
with no guard.

**Tech Stack:** Next.js 16 / Bun / TypeScript (strict, `noUncheckedIndexedAccess`) / Drizzle ORM
0.45 + drizzle-kit 0.31 over Postgres 17 / Vitest (+ jsdom) / OpenRouter
(`google/gemini-2.5-flash-lite`) for curation.

**Spec:** `docs/DESIGN_topic-vocabulary-growth.md` — the approved design. **Read it first (15
minutes).** This plan argues from it and does not restate its evidence. §3's four decisions are
settled; §14's three open questions are decided below.

## Global Constraints

- **Cut 1 scope is §3 D4 of the design, exactly.** Untouched, and a red flag if they appear in a
  diff: `src/server/services/feed.ts`'s *algorithm* (only the `FeedCard`/`ComposedCard` types
  change, Task 3), `src/server/config/topic-graph.json`, `src/app/onboarding/`, the sixteen
  `TOPICS` entries, `topicCap`. `src/server/config/topics.test.ts`'s "holds exactly the 16
  graph-validated topics" **must still pass at the end.**
- **No re-billing.** `PROMPT_VERSION` stays `1`. The `classify|` cache namespace is reused. Old
  cache entries are read forward (Task 5). A test pins this. Do not "fix" it.
- **`CURATOR_PROMPT` is a product artifact** — its text is not edited. `CLASSIFY_PROMPT` is built
  by slicing it and only the appended block changes.
- **Membership is additive.** Every `item_topic` write is `INSERT … ON CONFLICT DO NOTHING`.
  Nothing automated ever deletes a membership row. `upsertItem` still never rewrites `topicId` on
  conflict.
- **No embeddings, no vectors, no clustering.** Not in Cut 1, not in this plan.
- **Never silence a null-topic type error with `!` or `as`.** Each one is a decision about what
  "no topic" means at that point; Tasks 2–3 give the decision for every site.
- **The `SourceAdapter` / `CorpusWalkAdapter` contracts** (`sources/types.ts`) are a cross-service
  agreement. This plan changes neither; only a doc comment there mentions `topicId`.
- **Repo conventions:** comment generously (the codebase teaches — Ben is a returning webdev);
  conventional-commit subjects; every task ends with `bunx eslint <files> && bunx prettier --check
  <files>` green and, where the task says so, `bun run typecheck` and `bun run test` green. Plain
  branch `feat/topic-vocabulary-cut1` off `main`, merged back `--no-ff`. No worktrees.
- **Two sessions may share this checkout** (log.md 09-02). Run `git branch --show-current && git
  status` immediately before every `git add`; stage by name; never `git add -A`; if `git status`
  shows edits you did not make, stop and say so.
- **Test folklore (CLAUDE.md):** DB-backed suites self-skip without `DATABASE_URL`; run them with
  `docker compose up -d`. A red Postgres-touching test on a busy machine is usually load, not
  code. After any `bun add`, clear `node_modules/.vite` before trusting a red run.
- **Do not** use the Agent tool, workflows, or deep research unless Ben asks.

---

## 0. Decisions this plan takes (design §14, plus four the code forced)

Recorded so the executor does not re-decide them by accident. Ben can veto any before Task 1.

| # | Question | Decision |
|---|---|---|
| Q1 | `origin` for backfilled rows | `'curator'` when `source IN ('doorofperception','thingsorganizedneatly','mossandfog','thisiscolossal','streetartnews')`, else `'seed'`. The list is **frozen in the SQL** — a migration records what was true when it ran, it does not read config. `streetartnews` is included because its trial branch wrote 87 classified rows to the *local* DB on 09-02; production has none, which is fine. doorofperception's 318 production rows were classified (Phase 6.3), so `'curator'` is right for them. |
| Q2 | Cap on the classify array | **In the prompt, not the parser:** "usually one or two, never more than three". The parser filters to known ids and dedupes; it does not truncate, so an over-filing model is visible rather than hidden. |
| Q3 | `--dry-run` un-homed histogram | Computed in memory from the curated items; no DB access needed. Prints under `--dry-run` exactly as under a real run. |
| D-a | `--skip-llm` on the walk lane | **Writes no walk rows**, as before. A walk item under `--skip-llm` has neither a score nor a topic decision, and a score-5 un-homed row would block its real curation forever (the existing-row skip). The summary says so. (The search lane's score-5 rows under `--skip-llm` are unchanged — they at least carry a real seed topic.) |
| D-b | The display topic for a multi-topic walk item | `topics[0]` — the prompt asks for best fit first. Cut 2 retires the column. |
| D-c | `FeedCard.topicId` | Becomes `string \| null` **at the client boundary only**: the saved screen dresses saved items as CORE cards to reuse the masonry, and a saved un-homed item has no topic. `ComposedCard` (the engine's own type) pins it back to `string` — `composePage` always serves a card under a real topic. |
| D-d | Un-homed items in the gallery rail | `drawImageAnywhere` (the rail's **wildcard** draw) has no topic filter, so an un-homed *image* can surface in a wildcard slot — the one place they are reachable without a link. **Left as is, deliberately:** it is curated-weighted like every draw, and ignoring the graph is the wildcard's job. An un-homed *anchor* (opened by link or reached that way) gets an **all-wildcard rail** — no home topic, no walk. Recorded in SPEC §9 (Task 9). |
| D-e | Saving an un-homed item | The save is recorded; nothing is bumped; the toast reads just "Saved to X" (`drift: null`, the same shape a move between collections already produces). |
| D-f | `getWanderNext` on an un-homed item | Returns `[]` — no topic, no drift copy to write. The `/i/` page already renders nothing for an empty teaser (an exhausted corpus does the same). |
| D-g | Search-lane `collidedWith` topics | **Not** written as extra `seed` memberships in Cut 1. A losing claim is a lower-ranked query hit, not a verified honest home. A Cut 2 candidate. |

---

## Before you start

```bash
cd ~/Dev/ambit && git checkout main && git pull
git branch --show-current && git status          # must be main, clean
git checkout -b feat/topic-vocabulary-cut1
lsof -ti:3000 || echo "port 3000 free"
docker compose up -d
bun run check          # must be green before the first edit — if not, stop and report
```

Record the baseline the migration test needs (Task 1 compares against these):

```bash
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select count(*)::int as items, count(*) filter (where topic_id is null)::int as null_topics from item`);
console.log(await sql`select source, count(*)::int from item group by source order by 1`);
await sql.end()'
```

Expected: `null_topics` is `0` (today the column is NOT NULL). Paste both results into
`docs/WALKTHROUGH_topic-vocabulary-cut1.md` under a `## Baseline` heading — create the file now
with just that section; Task 8 fills the rest.

**Threads in flight you must not disturb:** `feat/wp-rest-streetartnews` (unmerged; its verdict
waits on this cut — design §13) and `docs/plan-pdr` (a paused plan that rewrites the same walk lane;
it re-reads *after* this merges). Touch neither branch.

**File map**

| File | Change |
|---|---|
| `src/server/db/schema.ts` | `item.topicId` nullable; new `itemTopic` table + `ItemTopicOrigin` |
| `drizzle/0004_item_topic.sql` (+ `meta/`) | generated DDL **plus the hand-appended backfill** |
| `src/server/db/feed.ts` | `PoolItem.topicId` stays `string`; null rows skipped with a comment |
| `src/server/api/routers/saves.ts` | un-homed save → `drift: null` |
| `src/server/services/wander.ts` | un-homed → `[]` |
| `src/server/services/gallery-rail.ts` | `RailStep` discriminated union; `RailItem.topicId` nullable; all-wildcard rail |
| `src/server/services/feed.ts` | `FeedCard.topicId: string \| null`; `ComposedCard.topicId: string` |
| `src/components/feed/masonry.ts` | type-predicate `qualifiesForBecause` |
| `src/components/gallery/gallery-details-sheet.tsx` | Topic row omitted when null |
| `scripts/probe-feed.ts` | null-safe column |
| `src/server/db/items.ts` | `addItemTopics()`; additivity comment |
| `src/server/services/curator.ts` | multi-label prompt, parser, cache read-forward, D4 reversal note, exported cache helpers |
| `src/server/services/ingest-plan.ts` | `topicHistogram` over arrays; new `tagHistogram` |
| `scripts/ingest.ts` | walk lane stores everything; membership writes; summary |
| `scripts/walk-stats.ts` | reads `topics` |
| tests | `curator.test.ts`, `ingest-plan.test.ts`, `wander.test.ts`, `gallery-rail.test.ts`, `masonry.test.ts`, `items.integration.test.ts`, `routers.integration.test.ts`, `gallery-screen.test.tsx` |
| docs | `SPEC.md`, `CLAUDE.md`, `docs/PHASE6_DESIGN_6.3.md`, `docs/source-candidates.md`, `docs/HANDOFF_sources-round2.md`, `docs/DESIGN_topic-vocabulary-growth.md`, `docs/WALKTHROUGH_topic-vocabulary-cut1.md` (new), `log.md` |

---

### Task 1: Schema + migration + backfill

**Files:**
- Modify: `src/server/db/schema.ts:185-187` (the `topicId` column), append after the `item` table (line 212)
- Create (generated): `drizzle/0004_item_topic.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` entry
- Modify: `docs/WALKTHROUGH_topic-vocabulary-cut1.md` (counts)

**Interfaces:**
- Produces: `itemTopic` (Drizzle table, columns `itemId`, `topicId`, `origin`), `type ItemTopicOrigin = "seed" | "curator" | "tag"`. `item.topicId` inferred as `string | null` from here on.

**This task ends with `bun run typecheck` RED (15 errors) by design.** Tasks 2 and 3 clear them. Do not start fixing them here; do not commit anything but the schema, the migration, and the walkthrough note.

- [ ] **Step 1: Make `item.topic_id` nullable**

In `src/server/db/schema.ts`, replace lines 185–187:

```ts
    topicId: text("topic_id")
      .notNull()
      .references(() => topic.id), // which topic's seed query surfaced this item — the feed's unit of drift
```

with:

```ts
    // The item's DISPLAY topic — nullable since Cut 1 of the vocabulary-growth design (09-2026,
    // docs/DESIGN_topic-vocabulary-growth.md §5). For a search-shaped source it is still the topic
    // whose seed query surfaced the item; for a walk source it is the first honest topic the
    // curator named; for a walk item no current topic fits it is NULL ("un-homed"). Full
    // membership — an item can honestly belong to several topics — lives in `item_topic` below.
    //
    // The feed still draws on THIS column until Cut 2 moves it onto the join (db/feed.ts
    // `getTopicPools`, db/items.ts `drawFromTopic`). Both filter with `inArray`/`eq`, and SQL NULL
    // matches neither, so an un-homed item is invisible to every feed draw with no guard at all.
    // It stays reachable by direct link (`/i/[itemId]`) and by the gallery's wildcard slots.
    topicId: text("topic_id").references(() => topic.id),
```

- [ ] **Step 2: Add the `item_topic` table**

Append after the closing `);` of the `item` table (after line 212), before `export const userTopic`:

```ts
/** How an `item_topic` row came to exist — the fact Cut 2's promotion audits on. Deliberately no
 *  `confidence` column: an LLM's self-reported confidence is uncalibrated, and Phase 0's lesson was
 *  to stop trusting similarity numbers. Weighting, if ever wanted, derives from this plus
 *  `curation_score`, both of which are real. */
export type ItemTopicOrigin =
  /** A search source's seed query surfaced the item under this topic (the museum path). */
  | "seed"
  /** The curator's classify mode named it (walk sources). */
  | "curator"
  /** A Cut 2 promotion backfilled it from tag overlap. Unused until then. */
  | "tag";

/**
 * Topic membership, many-to-many (Cut 1, design §5). One row per (item, topic) an item honestly
 * belongs to. **Membership is additive**: every writer uses `ON CONFLICT DO NOTHING`, and no
 * automated process ever deletes a row — adding a topic can only widen an item's reach, removing
 * one silently takes it out of feeds. Removal is a deliberate, human-triggered act that Cut 1
 * does not build.
 *
 * `onDelete: "cascade"` on `item_id` because `--prune` and `bun run retire` delete items, and a
 * membership without its item is meaningless. **No cascade on `topic_id`**: deleting a topic
 * while items still reference it should fail loudly.
 */
export const itemTopic = pgTable(
  "item_topic",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topic.id),
    origin: text("origin").$type<ItemTopicOrigin>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.topicId] }),
    // Cut 2's promotion and "everything in topic X" both read by topic; the PK serves by item.
    index("idx_item_topic_topic").on(table.topicId),
  ],
);
```

- [ ] **Step 3: Generate the migration**

```bash
bunx drizzle-kit generate --name=item_topic
```

Expected: `drizzle/0004_item_topic.sql` created, `drizzle/meta/0004_snapshot.json` created, `_journal.json` gains an `idx: 4` entry. Open the SQL. It should contain (statement order may differ):

```sql
CREATE TABLE "item_topic" (
	"item_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "item_topic_item_id_topic_id_pk" PRIMARY KEY("item_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "item" ALTER COLUMN "topic_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "item_topic" ADD CONSTRAINT "item_topic_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_topic" ADD CONSTRAINT "item_topic_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_topic_topic" ON "item_topic" USING btree ("topic_id");
```

If it contains anything else (a dropped index, a changed column elsewhere), stop: the schema edit went wrong. `idx_item_topic_score` on `item` must **not** be dropped.

- [ ] **Step 4: Append the backfill to the SAME migration file**

Production's boot path runs `drizzle-kit migrate` and nothing else (Dockerfile, Phase 8.1 T2), so the data step must ride in the migration. `migrate` splits the file on `--> statement-breakpoint` and runs each piece in order; a data statement after the DDL is exactly what the docs' "custom SQL for data seeding" case is for. Append to the end of `drizzle/0004_item_topic.sql`:

```sql
--> statement-breakpoint
-- Cut 1 backfill (docs/DESIGN_topic-vocabulary-growth.md §5): exactly one membership row per
-- existing item, taken from the column the feed has always read. `origin` records how that topic
-- was decided — a walk source's rows came from the curator's classify mode (Phase 6.3), every
-- other source's from the seed query that surfaced the item. The walk-source list is frozen
-- here on purpose: a migration is a record of what was true when it ran, not a reader of live
-- config. (streetartnews is present locally from its 09-02-26 trial branch; production has none.)
INSERT INTO "item_topic" ("item_id", "topic_id", "origin")
SELECT "id",
       "topic_id",
       CASE
         WHEN "source" IN ('doorofperception', 'thingsorganizedneatly', 'mossandfog', 'thisiscolossal', 'streetartnews')
           THEN 'curator'
         ELSE 'seed'
       END
FROM "item"
WHERE "topic_id" IS NOT NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Apply and verify the row counts**

```bash
bun run db:migrate
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select (select count(*)::int from item) as items, (select count(*)::int from item_topic) as memberships`);
console.log(await sql`select origin, count(*)::int from item_topic group by origin order by 1`);
console.log(await sql`select count(*)::int as missing from item i where i.topic_id is not null and not exists (select 1 from item_topic t where t.item_id = i.id and t.topic_id = i.topic_id)`);
console.log(await sql`select count(*)::int as stray from item_topic t where not exists (select 1 from item i where i.id = t.item_id)`);
await sql.end()'
```

Expected: `memberships == items` (the baseline count from "Before you start"); `missing == 0`; `stray == 0`; the `curator` count equals the sum of the walk sources' per-source counts from the baseline. Paste the output into the walkthrough under `## Task 1 — migration`. If `memberships != items`, do not continue — find out why before anything is built on the table.

- [ ] **Step 6: Confirm the typechecker's worklist**

```bash
bun run typecheck 2>&1 | grep "error TS" | sed 's/: error.*//'
```

Expected, exactly these 15 sites (they were captured by trialling this edit on 09-02-26):

```
src/app/g/[itemId]/page.tsx(59,5)
src/components/saved/saved-screen.tsx(94,11)
src/components/sheets/item-sheet.tsx(72,9)
src/components/sheets/save-to-collection-sheet.tsx(70,9)
src/server/api/routers/saves.ts(110,57)
src/server/api/routers/saves.ts(111,47)
src/server/db/feed.ts(126,37)
src/server/services/gallery-rail.ts(228,32)
src/server/services/gallery-rail.ts(294,34)
src/server/services/gallery-rail.ts(313,5)
src/server/services/wander.ts(109,39)
src/server/services/wander.ts(131,45)
src/server/services/wander.ts(132,38)
src/server/services/wander.ts(141,16)
src/server/services/wander.ts(141,46)
```

A different list means `main` moved since planning — still fine, but every extra site gets the same treatment as its nearest neighbour in Tasks 2–3, and you note it in the walkthrough.

- [ ] **Step 7: Commit**

```bash
bunx prettier --check src/server/db/schema.ts
git branch --show-current && git status
git add src/server/db/schema.ts drizzle/0004_item_topic.sql drizzle/meta/0004_snapshot.json drizzle/meta/_journal.json docs/WALKTHROUGH_topic-vocabulary-cut1.md
git commit -m "feat(db): item.topic_id nullable; item_topic membership table, backfilled one row per item (Cut 1)"
```

---

### Task 2: The server half of the null-topic worklist

**Files:**
- Modify: `src/server/db/feed.ts:31-34` (`PoolItem`), `:126` (the pool fill)
- Modify: `src/server/api/routers/saves.ts:107-115`
- Modify: `src/server/services/wander.ts:105-109`
- Modify: `src/server/services/gallery-rail.ts:61-66` (`RailStep`), `:69-81` (`RailItem`), `:228`, `:291-297`, `:301-315`
- Test: `src/server/services/wander.test.ts`, `src/server/services/gallery-rail.test.ts`, `src/server/api/routers/routers.integration.test.ts`

**Interfaces:**
- Produces: `RailItem.topicId: string | null`; `RailItem.debug?: { via: RailVia; topic: string | null }`; `RailStep` as a discriminated union (below). `PoolItem.topicId` stays `string`.

- [ ] **Step 1: `db/feed.ts` — the pool never holds a null**

Replace the `PoolItem` type (lines 31–34) with:

```ts
export type PoolItem = Pick<
  Item,
  "id" | "source" | "curationScore" | "aestheticTags"
> & {
  /** Never null here: `getTopicPools` filters with `inArray(item.topicId, …)`, which no NULL row
   *  matches, so an un-homed item (Cut 1) cannot enter a pool. The column is `string | null` on
   *  `Item`; this is the one place the narrowing is written down. */
  topicId: string;
};
```

Replace line 126 (`for (const row of rows) pools.get(row.topicId)?.push(row);`) with:

```ts
  for (const row of rows) {
    // Unreachable in practice — see PoolItem's comment — but the projection is typed
    // `string | null` because the column is, and a `!` here would hide the day this ever changes.
    if (row.topicId === null) continue;
    pools.get(row.topicId)?.push({ ...row, topicId: row.topicId });
  }
```

- [ ] **Step 2: `saves.ts` — an un-homed save bumps nothing**

Replace lines 107–115 (from the `// Accepted race` comment through the closing `as const;`) with:

```ts
      // An un-homed item — a walk post no current topic fits (Cut 1, design §5) — has no topic to
      // bump. The save itself is recorded above; the toast just reads "Saved to X", the same
      // `drift: null` shape a move between collections produces. Cut 2's promotion is what gives
      // such an item a topic, and from then on its saves bump like any other.
      if (item.topicId === null) {
        return { collectionName: collection.name, drift: null } as const;
      }
      // Accepted race: two concurrent first-saves of the same item can both see `wasSaved ===
      // false` and double-bump. The client's in-flight guard makes that rare, and WEIGHT_CAP
      // bounds the damage — not worth a serializable transaction.
      const bumped = await bumpTopicWeight(ctx.user.id, item.topicId);
      const topicLabel = (await getTopicLabel(item.topicId)) ?? item.topicId;
      return {
        collectionName: collection.name,
        drift: { topicLabel, isNew: bumped.isNew },
      } as const;
```

This also clears the two sheet errors (`item-sheet.tsx:72`, `save-to-collection-sheet.tsx:70`) — they were the inferred return type leaking `string | null` into `SaveDrift`.

- [ ] **Step 3: `saves.ts` integration test**

In `src/server/api/routers/routers.integration.test.ts`, inside the `describe("saves.collections + saveToCollection + list + unsave", …)` block, after the "saves into a collection…" test, add:

```ts
    it("saving an un-homed item records the save and reports no drift (Cut 1)", async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");
      // A walk post no topic fits: `topicId: null` is legal since Cut 1. Inserted here rather than
      // in beforeAll so the fixture's cleanup-by-topic never has to know about it.
      const [unhomed] = await db
        .insert(item)
        .values({
          source: "doorofperception",
          sourceId: `test-router-unhomed-${nanoid(8)}`,
          type: "image" as const,
          title: "Integration test un-homed item",
          summary: "A walk post that no current topic fits.",
          sourceUrl: "https://example.com/unhomed",
          imageUrl: "https://example.com/unhomed.jpg",
          topicId: null,
          curationScore: 8,
          aestheticTags: ["mural"],
        })
        .returning({ id: item.id });

      const caller = createCaller(authedContext(userId));
      const [, art] = await caller.saves.collections();
      const saved = await caller.saves.saveToCollection({
        itemId: unhomed!.id,
        collectionId: art!.id,
      });
      expect(saved).toEqual({ collectionName: "Art", drift: null });

      await caller.saves.unsave({ itemId: unhomed!.id });
      await db.delete(item).where(eq(item.id, unhomed!.id));
    });
```

If the file does not already import `eq` from `drizzle-orm`, add it to that import line.

- [ ] **Step 4: Run the two DB-backed suites**

```bash
bun run test src/server/api/routers/routers.integration.test.ts src/server/db/feed.integration.test.ts
```

Expected: PASS (they are DB-backed; `docker compose up -d` must be running).

- [ ] **Step 5: `wander.ts` — no topic, no walk**

After `if (!item) return [];` (line 106) add:

```ts
  // An un-homed item (Cut 1) has no topic to drift from, so there is no honest "a drift from X
  // into Y" to write. An empty teaser is what the item page already renders for an exhausted
  // corpus. Cut 2's promotion gives these items a neighbourhood; until then the page is the picture
  // and its link-out, which is the whole of what a direct link promised.
  if (item.topicId === null) return [];
```

Then `const from = item.topicId;` on the next line is narrowed to `string` and the four errors at 131–141 clear.

- [ ] **Step 6: `wander.test.ts`**

Find the `describe("getWanderNext", …)` block (it mocks `getItemById` and `drawFromTopic` — see the file header). Add:

```ts
  it("returns nothing for an un-homed item — no topic, no walk (Cut 1)", async () => {
    mockDrawFromTopic.mockClear();
    mockGetItemById.mockResolvedValue(makeItem({ id: "x", topicId: null }));
    expect(await getWanderNext("x", rng)).toEqual([]);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
  });
```

Run: `bun run test src/server/services/wander.test.ts` → PASS.

- [ ] **Step 7: `gallery-rail.ts` — an un-homed anchor gets an all-wildcard rail**

Replace `RailStep` (lines 61–66) with a discriminated union:

```ts
/**
 * One step of the walk, before any item has been drawn for it. A discriminated union on `via`:
 * a graph step always stands on a topic, while a wildcard step leaves the graph and merely
 * *remembers* where the walk stood — which is `null` for the one rail that never stood anywhere,
 * the all-wildcard rail an un-homed anchor gets (Cut 1: an item no topic fits has no walk to
 * start). Narrowing on `via` is what lets `drawForStep` use `step.topic` as a string after the
 * wildcard branch returns.
 */
export type RailStep =
  | { via: "stay" | "drift" | "jump"; topic: string }
  | { via: "wildcard"; topic: string | null };
```

In `RailItem` (lines 69–81) change two lines:

```ts
  /** The display topic (Cut 1: nullable — an un-homed picture opened by link, or drawn by a
   *  wildcard slot, has none). The details sheet omits its Topic row rather than inventing one. */
  topicId: string | null;
  /** Only populated when the server's debug flag is on (see `getGalleryRail`). */
  debug?: { via: RailVia; topic: string | null };
```

In `getGalleryRail`, replace line 228 (`const steps = pickRailTopics(anchor.topicId, TOPIC_GRAPH, rng, count, knobs);`) with:

```ts
  // An un-homed anchor (Cut 1) has no topic to walk from. Rather than invent a start, every slot
  // is a wildcard: the rail still goes somewhere, and `debug.via` says honestly how.
  const steps: RailStep[] =
    anchor.topicId === null
      ? Array.from(
          { length: count },
          (): RailStep => ({ via: "wildcard", topic: null }),
        )
      : pickRailTopics(anchor.topicId, TOPIC_GRAPH, rng, count, knobs);
```

In `drawForStep`, replace lines 291–297 (the "Second link" block) with:

```ts
  // Second link: the anchor's own topic. "More from here" is always a true statement, and it's the
  // link the e2e corpus (one or two topics, a handful of items) actually exercises. Skipped for an
  // un-homed anchor, which has no "here".
  if (anchor.topicId !== null && step.topic !== anchor.topicId) {
    const home = await fromTopic(anchor.topicId);
    if (home) return home;
  }
```

`toRailItem` (line 313, `topicId: row.topicId`) now compiles as-is because `RailItem.topicId` is nullable. Check `pickRailTopics`'s pushes still typecheck: every `steps.push({ topic: current, via: … })` has `current: string`, which satisfies both union arms.

- [ ] **Step 8: `gallery-rail.test.ts`**

Inside the `describe("getGalleryRail", …)` block add:

```ts
  it("gives an un-homed anchor an all-wildcard rail — no topic, no walk (Cut 1)", async () => {
    mockEnv.FEED_DEBUG = true;
    mockDrawFromTopic.mockClear();
    mockGetItemById.mockResolvedValue({
      id: "anchor",
      type: "image",
      topicId: null,
    } as unknown as Item);
    let n = 0;
    mockDrawImageAnywhere.mockImplementation(async () => [
      { id: `w${n++}`, title: "wild", source: "met", topicId: null } as unknown as Item,
    ]);

    const rows = await getGalleryRail("anchor", {
      count: 3,
      rng: mulberry32(hashSeed("unhomed")),
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.debug)).toEqual([
      { via: "wildcard", topic: null },
      { via: "wildcard", topic: null },
      { via: "wildcard", topic: null },
    ]);
    expect(mockDrawFromTopic).not.toHaveBeenCalled();
  });
```

If the file's existing tests reset `mockEnv.FEED_DEBUG` in a `beforeEach`, keep that; otherwise set it back to `undefined` at the end of this test.

Run: `bun run test src/server/services/gallery-rail.test.ts` → PASS.

- [ ] **Step 9: Typecheck — only the client half should remain**

```bash
bun run typecheck 2>&1 | grep "error TS" | sed 's/: error.*//'
```

Expected exactly two, both Task 3's:

```
src/components/gallery/gallery-details-sheet.tsx(109,…)   ← new: topicLabel(item.topicId) now receives string | null
src/components/saved/saved-screen.tsx(94,11)
```

`g/[itemId]/page.tsx(59,5)` clears by itself once `RailItem.topicId` is nullable; if it is still listed, re-check Step 7.

- [ ] **Step 10: Commit**

```bash
bunx eslint src/server/db/feed.ts src/server/api/routers/saves.ts src/server/services/wander.ts src/server/services/gallery-rail.ts src/server/services/wander.test.ts src/server/services/gallery-rail.test.ts src/server/api/routers/routers.integration.test.ts && bunx prettier --check src/server/db/feed.ts src/server/api/routers/saves.ts src/server/services/wander.ts src/server/services/gallery-rail.ts src/server/services/wander.test.ts src/server/services/gallery-rail.test.ts src/server/api/routers/routers.integration.test.ts
git branch --show-current && git status
git add src/server/db/feed.ts src/server/api/routers/saves.ts src/server/services/wander.ts src/server/services/gallery-rail.ts src/server/services/wander.test.ts src/server/services/gallery-rail.test.ts src/server/api/routers/routers.integration.test.ts
git commit -m "feat(server): what a null topic means — pools skip it, saves bump nothing, wander returns [], the rail goes wildcard"
```

---

### Task 3: The client half — `FeedCard`, masonry, the gallery sheet

**Files:**
- Modify: `src/server/services/feed.ts:74-76` (`ComposedCard`), `:87-90` (`FeedCard`)
- Modify: `src/components/feed/masonry.ts:43-46` (`qualifiesForBecause`), `:75-86` (the Because branch)
- Modify: `src/components/gallery/gallery-details-sheet.tsx:109`, and the Debug row a few lines below it
- Modify: `scripts/probe-feed.ts:102,109`
- Test: `src/components/feed/masonry.test.ts`, `src/components/gallery/gallery-screen.test.tsx`

**Interfaces:**
- Produces: `FeedCard.topicId: string | null`; `ComposedCard.topicId: string`.

- [ ] **Step 1: `feed.ts` types**

Replace `ComposedCard` (lines 74–76) with:

```ts
export interface ComposedCard extends Omit<FeedCard, "item" | "topicId"> {
  item: PoolItem;
  /** Always a real topic here: `composePage` serves every card from a topic pool. The client-side
   *  `FeedCard` widens this to `string | null` (see there); the engine never does. */
  topicId: string;
}
```

In `FeedCard` (line 90), replace `  topicId: string;` with:

```ts
  /**
   * The topic this card was served under. `null` only when a screen *dresses* an item as a card
   * without serving it — `saved-screen.tsx` does that to reuse the masonry, and a saved item can
   * be un-homed (Cut 1). The feed itself never produces a null here (`ComposedCard` pins it), and
   * the only reader of this field for layout is the Because tile, which only a JUMP produces.
   */
  topicId: string | null;
```

- [ ] **Step 2: `masonry.ts` — narrow, don't guess**

Replace `qualifiesForBecause` (lines 43–46) with a type predicate:

```ts
/**
 * A JUMP whose walk actually has a from→to pair to name. See `buildTiles`. Written as a type
 * predicate so the caller gets `driftPath` and `topicId` narrowed for free — a JUMP always has
 * both, and saying so in the type is what lets the Because branch below read them without `!`.
 */
function qualifiesForBecause(
  card: FeedCard,
): card is FeedCard & { topicId: string; driftPath: [string, ...string[]] } {
  return (
    card.tier === "JUMP" &&
    card.topicId !== null &&
    (card.driftPath?.length ?? 0) >= 2
  );
}
```

In `buildTiles`, the branch currently reads:

```ts
      if (card === becauseCard) {
        const from = card.driftPath![0]!;
        tiles.push({
          kind: "because",
          key: `because-${card.item.id}`,
          // …comment…
          from: topicLabels[from] ?? from,
          to: topicLabels[card.topicId] ?? card.topicId,
        });
      }
```

Change it to read from the narrowed `becauseCard` and drop both `!`s:

```ts
      if (becauseCard && card === becauseCard) {
        const from = becauseCard.driftPath[0];
        tiles.push({
          kind: "because",
          key: `because-${becauseCard.item.id}`,
          // Fall back to the raw topic id rather than dropping the tile: an id that isn't in
          // TOPICS means config and corpus have drifted apart, and showing "ancient-history" is
          // both readable and a visible signal that something needs fixing.
          from: topicLabels[from] ?? from,
          to: topicLabels[becauseCard.topicId] ?? becauseCard.topicId,
        });
      }
```

- [ ] **Step 3: `masonry.test.ts`**

The file's `card()` helper sets `topicId: opts.topicId ?? "botany"`. Widen its option type to `topicId?: string | null` and its two uses to `opts.topicId === undefined ? "botany" : opts.topicId`. Then add, in the `buildTiles` describe:

```ts
  it("lays out a CORE card with no topic (a saved un-homed item) and synthesizes no Because tile", () => {
    const tiles = buildTiles([{ cards: [card("u", { topicId: null })] }], {});
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ kind: "image", card: { topicId: null } });
  });
```

Run: `bun run test src/components/feed/masonry.test.ts` → PASS.

- [ ] **Step 4: `gallery-details-sheet.tsx` — omit the row, per the file's own rule**

Line 109 reads `<Fact label="Topic">{topicLabel(item.topicId)}</Fact>`. Replace with:

```tsx
          {/* Omitted entirely when null, like every other fact here: an un-homed picture (Cut 1)
              has no topic yet, and a blank row would read as broken rather than as true. */}
          {item.topicId !== null ? (
            <Fact label="Topic">{topicLabel(item.topicId)}</Fact>
          ) : null}
```

A few lines below, the Debug row renders `item.debug.topic`. Wherever it interpolates it, use `{item.debug.topic ?? "—"}` (React would render `null` as nothing, but the dash keeps the `via · topic` line readable for an all-wildcard rail).

- [ ] **Step 5: `gallery-screen.test.tsx`**

The file's `railItem()` fixture sets `topicId: "botany"`. Add one test in the main describe:

```tsx
  it("renders an un-homed entry item and its details sheet omits the Topic row (Cut 1)", () => {
    renderScreen({ entryItem: railItem("entry", { topicId: null }) });
    // The caption still shows the title; nothing threw on the null.
    expect(screen.getAllByText("Plate entry").length).toBeGreaterThan(0);

    // Same interaction as "tapping the title block opens details directly" above.
    tap(); // bring the chrome up so the block is on screen
    fireEvent.click(screen.getByTestId("gallery-title-block"));
    expect(screen.getByTestId("bottom-sheet-panel")).toBeInTheDocument();

    // The facts table lists Source (always) and omits Topic (null) — the file's own rule.
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.queryByText("Topic")).toBeNull();
  });
```

Place it inside the same `describe` as the "tapping the title block" test so `tap()` and `renderScreen()` are in scope. Run: `bun run test src/components/gallery/gallery-screen.test.tsx` → PASS.

- [ ] **Step 6: `scripts/probe-feed.ts`**

Line 102: `topicCounts.set(card.topicId, …)` → `const t = card.topicId ?? "(none)"; topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);`. Line 109: `card.topicId.padEnd(16)` → `(card.topicId ?? "(none)").padEnd(16)`. (The feed never serves a null; this keeps the script honest about the type.)

- [ ] **Step 7: Typecheck green, full test run**

```bash
bun run typecheck      # expected: no output, exit 0
bun run test           # expected: all green (~35 s). topics.test.ts "holds exactly the 16" included.
```

`saved-screen.tsx:94` clears by itself: the saved screen's `topicId: item.topicId` is now exactly `FeedCard`'s type — no edit needed there, which is the point of D-c.

- [ ] **Step 8: Commit**

```bash
bunx eslint src/server/services/feed.ts src/components/feed/masonry.ts src/components/feed/masonry.test.ts src/components/gallery/gallery-details-sheet.tsx src/components/gallery/gallery-screen.test.tsx scripts/probe-feed.ts && bunx prettier --check src/server/services/feed.ts src/components/feed/masonry.ts src/components/feed/masonry.test.ts src/components/gallery/gallery-details-sheet.tsx src/components/gallery/gallery-screen.test.tsx scripts/probe-feed.ts
git branch --show-current && git status
git add src/server/services/feed.ts src/components/feed/masonry.ts src/components/feed/masonry.test.ts src/components/gallery/gallery-details-sheet.tsx src/components/gallery/gallery-screen.test.tsx scripts/probe-feed.ts
git commit -m "feat(ui): a card or rail cell may carry no topic — masonry narrows, the sheet omits the row (typecheck green)"
```

---

### Task 4: `addItemTopics` — the additive membership writer

**Files:**
- Modify: `src/server/db/items.ts:4` (imports), `:7` (schema import), `:12-25` (upsertItem doc), append after `upsertItem` (after line 60)
- Test: `src/server/db/items.integration.test.ts`

**Interfaces:**
- Produces: `addItemTopics(itemId: string, topicIds: readonly string[], origin: ItemTopicOrigin): Promise<number>` — returns the number of rows actually inserted (0 on a full conflict). Re-exports `ItemTopicOrigin`.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/server/db/items.integration.test.ts`:

```ts
describe.skipIf(!process.env.DATABASE_URL)("addItemTopics (integration)", () => {
  const topicA = `test-membership-a-${nanoid(8)}`;
  const topicB = `test-membership-b-${nanoid(8)}`;
  const sourceId = `test-membership-${nanoid(8)}`;
  let itemId: string;

  beforeAll(async () => {
    const { db } = await import("./client");
    await db.insert(topic).values(
      [topicA, topicB].map((id) => ({
        id,
        label: `Test membership ${id}`,
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      })),
    );
    // An un-homed row: legal since Cut 1, and the shape the walk lane writes before it adds
    // memberships.
    const [row] = await db
      .insert(item)
      .values({
        source: "doorofperception",
        sourceId,
        type: "image" as const,
        title: "Integration test membership item",
        summary: "A summary long enough to be unremarkable.",
        sourceUrl: `https://example.com/${sourceId}`,
        topicId: null,
        curationScore: 8,
        aestheticTags: [],
      })
      .returning({ id: item.id });
    itemId = row!.id;
  });

  afterAll(async () => {
    const { db } = await import("./client");
    // item_topic rows go with the item (ON DELETE CASCADE) — that cascade is itself under test
    // in the last case below.
    await db.delete(item).where(eq(item.id, itemId));
    await db.delete(topic).where(inArray(topic.id, [topicA, topicB]));
  });

  it("inserts one row per distinct topic and reports how many landed", async () => {
    const n = await addItemTopics(itemId, [topicA, topicB, topicA], "curator");
    expect(n).toBe(2);
    const { db } = await import("./client");
    const rows = await db
      .select()
      .from(itemTopic)
      .where(eq(itemTopic.itemId, itemId));
    expect(rows.map((r) => [r.topicId, r.origin]).sort()).toEqual([
      [topicA, "curator"],
      [topicB, "curator"],
    ]);
  });

  it("is additive: a repeat write inserts nothing and never rewrites origin", async () => {
    const n = await addItemTopics(itemId, [topicA], "tag");
    expect(n).toBe(0);
    const { db } = await import("./client");
    const [row] = await db
      .select({ origin: itemTopic.origin })
      .from(itemTopic)
      .where(and(eq(itemTopic.itemId, itemId), eq(itemTopic.topicId, topicA)));
    expect(row?.origin).toBe("curator"); // the first writer's fact stands
  });

  it("does nothing for an empty list (no invalid empty INSERT)", async () => {
    expect(await addItemTopics(itemId, [], "seed")).toBe(0);
  });

  it("an un-homed item is never drawn: drawFromTopic and getTopicPools both skip it", async () => {
    // Membership rows exist for topicA now, but the FEED reads item.topic_id (still null) until
    // Cut 2 — design §5's "invisible with no guard at all", pinned here so Cut 2 has to flip this
    // test on purpose.
    const drawn = await drawFromTopic(topicA, {
      scoreFloor: 1,
      excludeIds: [],
      limit: 50,
    });
    expect(drawn.some((r) => r.id === itemId)).toBe(false);

    const { getTopicPools } = await import("./feed");
    const pools = await getTopicPools([topicA], {
      userId: `nobody-${nanoid(6)}`,
      anchor: new Date(),
      scoreFloor: 1,
      excludeIds: [],
    });
    expect(pools.get(topicA)?.some((r) => r.id === itemId)).toBe(false);
  });

  it("membership rows cascade away with the item", async () => {
    const { db } = await import("./client");
    await db.delete(item).where(eq(item.id, itemId));
    const rows = await db
      .select()
      .from(itemTopic)
      .where(eq(itemTopic.itemId, itemId));
    expect(rows).toHaveLength(0);
  });
});
```

Add to the file's imports: `addItemTopics` from `./items`, `itemTopic` from `./schema`. `and`, `eq`, `inArray` are already imported.

- [ ] **Step 2: Run to verify failure**

```bash
bun run test src/server/db/items.integration.test.ts
```

Expected: FAIL — `addItemTopics` is not exported / `itemTopic` import resolves but the function does not exist.

- [ ] **Step 3: Implement**

In `src/server/db/items.ts`, change the schema import (line 7) to `import { item, itemTopic, type ItemTopicOrigin } from "./schema";` and add `export type { ItemTopicOrigin } from "./schema";` beside the other type exports. Append after `upsertItem` (after line 60):

```ts
/**
 * Record that `itemId` belongs to each of `topicIds` (Cut 1, design §5). **Additive, always**:
 * `ON CONFLICT DO NOTHING` on the (item_id, topic_id) primary key, so a repeat write is a no-op
 * and — the property that matters — an existing row's `origin` is never rewritten. Adding a topic
 * can only widen an item's reach; nothing automated ever narrows it. This inherits `upsertItem`'s
 * reason for not touching `topicId` on conflict, with a sharper rule.
 *
 * Returns how many rows were actually inserted — the ingest summary's "memberships written",
 * and `0` when every pair already existed. Deduplicates the input (the curator may repeat itself)
 * and short-circuits on an empty list, because `VALUES ()` with no rows is invalid SQL.
 */
export async function addItemTopics(
  itemId: string,
  topicIds: readonly string[],
  origin: ItemTopicOrigin,
): Promise<number> {
  const unique = [...new Set(topicIds)];
  if (unique.length === 0) return 0;

  // Dynamic import — see upsertItem's comment above for why "./client" is never imported at
  // module scope in this file.
  const { db } = await import("./client");
  const rows = await db
    .insert(itemTopic)
    .values(unique.map((topicId) => ({ itemId, topicId, origin })))
    .onConflictDoNothing()
    .returning({ topicId: itemTopic.topicId });
  return rows.length;
}
```

In `upsertItem`'s doc comment (lines 19–20), extend the `topicId` bullet:

```ts
 *   - `topicId` — reassigning an existing item's topic on a later ingest run would reshuffle which
 *     users' feeds it can appear in, out from under them, for no product reason. Since Cut 1 it is
 *     the *display* topic and may be null; membership lives in `item_topic`, written by
 *     `addItemTopics` below under the same never-retract rule.
```

- [ ] **Step 4: Run to verify pass**

```bash
bun run test src/server/db/items.integration.test.ts
```

Expected: PASS, including the pre-existing `drawFromTopic`/`upsertItem` blocks. (The `upsertItem` block's comment at line 159–162 says "item.topic_id is a NOT NULL FK" — update that comment to "a FK (nullable since Cut 1)"; the test's logic is unchanged.)

- [ ] **Step 5: Commit**

```bash
bunx eslint src/server/db/items.ts src/server/db/items.integration.test.ts && bunx prettier --check src/server/db/items.ts src/server/db/items.integration.test.ts
git branch --show-current && git status
git add src/server/db/items.ts src/server/db/items.integration.test.ts
git commit -m "feat(db): addItemTopics — additive item_topic writer, never retracts, never rewrites origin"
```

---

### Task 5: Curator — multi-label classify, cache read forward, D4 reversal note

**Files:**
- Modify: `src/server/services/curator.ts:55-80` (comment, `CLASSIFY_PROMPT`, `CuratedItem`), `:188-235` (`parseCuratorResponse`), `:242-254` (cache dir + key), `:269-299` (cache read), `:363-374` (write), `:422-443` (`curateItems` worker)
- Test: `src/server/services/curator.test.ts`

**Interfaces:**
- Produces: `CuratedItem.topics: string[]` (replaces `topicId`); `parseCuratorResponse(...) → { score, tags, topics: string[] }`; exported `CURATION_CACHE_DIR: string` and `curationCacheKey(item: Pick<NormalizedItem, "source" | "sourceId">, classify: boolean): string`. `PROMPT_VERSION` unchanged at `1`.

- [ ] **Step 1: Write the failing tests**

In `src/server/services/curator.test.ts`:

(a) Add imports: `import { mkdir, rm, writeFile } from "node:fs/promises"; import path from "node:path";` and add `CURATION_CACHE_DIR`, `curationCacheKey`, `PROMPT_VERSION` to the `./curator` import.

(b) Update existing expectations — every `topicId: null` in an expected object becomes `topics: []`; in "parseCuratorResponse — classify mode": the known-id case expects `topics: ["botany"]`, the invented-id case expects `.topics` to equal `[]`, the null/missing/outside-mode case expects `[]` for all three; in "curateItems classify mode" the mocked completion content becomes `'{"score": 7, "tags": ["a"], "topics": ["botany"]}'`, `expect(out?.topicId).toBe("botany")` becomes `expect(out?.topics).toEqual(["botany"])`, and `expect(out?.topicId).toBeNull()` becomes `expect(out?.topics).toEqual([])`.

(c) In `describe("CLASSIFY_PROMPT")`, replace the reply-line regex:

```ts
    expect(CLASSIFY_PROMPT).toMatch(
      /"topics": \[<topic ids, best fit first, or empty>\]\}$/,
    );
    // The cap is in the prompt, not the parser (design §14 Q2).
    expect(CLASSIFY_PROMPT).toContain("never more than three");
```

(d) Add to `describe("parseCuratorResponse — classify mode")`:

```ts
  it("returns every KNOWN id in the array, deduplicated, in the model's order", () => {
    expect(
      parseCuratorResponse(
        '{"score": 9, "tags": [], "topics": ["zoology", "psychedelia", "botany", "zoology"]}',
        { topicIds: ids },
      ).topics,
    ).toEqual(["zoology", "botany"]);
  });

  it("treats an empty array as a legal, non-error answer — the honest refusal", () => {
    const out = parseCuratorResponse('{"score": 9, "tags": ["a"], "topics": []}', {
      topicIds: ids,
    });
    expect(out.topics).toEqual([]);
    expect(out.score).toBe(9); // a refusal costs the item nothing
  });

  it("reads a legacy single \"topic\" key as a one-element list", () => {
    expect(
      parseCuratorResponse('{"score": 8, "tags": [], "topic": "botany"}', {
        topicIds: ids,
      }).topics,
    ).toEqual(["botany"]);
  });
```

(e) Add a new describe:

```ts
// The property that makes Cut 1 free: a walk item scored under Phase 6.3's single-topic prompt is
// NOT re-billed. Its cache entry is read forward — `topicId: "botany"` → `topics: ["botany"]`,
// `topicId: null` → `topics: []`. `fetch` is stubbed to THROW so a cache miss fails loudly.
describe("curateItems reads pre-Cut-1 cache entries forward, with no LLM call", () => {
  const files: string[] = [];
  async function seedCache(item: NormalizedItem, body: unknown) {
    const file = path.join(
      CURATION_CACHE_DIR,
      `${curationCacheKey(item, true)}.json`,
    );
    await mkdir(CURATION_CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(body));
    files.push(file);
  }
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", () => {
      throw new Error("a cache hit must not call the LLM");
    });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await Promise.all(files.splice(0).map((f) => rm(f, { force: true })));
  });

  it("a cached single topic becomes a one-element array", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-a`,
    });
    await seedCache(it, { score: 7, tags: ["a"], topicId: "botany" });
    const [out] = await curateItems([it], { classify: true });
    expect(out).toMatchObject({ curationScore: 7, topics: ["botany"] });
  });

  it("a cached null topic becomes an empty array — stored un-homed, not dropped", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-b`,
    });
    await seedCache(it, { score: 9, tags: ["mural"], topicId: null });
    const [out] = await curateItems([it], { classify: true });
    expect(out).toMatchObject({ curationScore: 9, topics: [] });
  });

  it("a Cut 1 entry round-trips its array", async () => {
    const it = makeItem({
      source: "doorofperception",
      sourceId: `cache-fwd-${Date.now()}-c`,
    });
    await seedCache(it, { score: 8, tags: [], topics: ["botany", "zoology"] });
    const [out] = await curateItems([it], { classify: true });
    expect(out?.topics).toEqual(["botany", "zoology"]);
  });

  it("PROMPT_VERSION is still 1 — bumping it would re-bill every walk item for nothing", () => {
    expect(PROMPT_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test src/server/services/curator.test.ts
```

Expected: FAIL — `curationCacheKey` not exported, `topics` undefined, prompt regex mismatch.

- [ ] **Step 3: Implement — the comment and the prompt**

Replace the doc comment above `CLASSIFY_PROMPT` (lines 55–65) with:

```ts
/**
 * Phase 6.3's classify mode: the SAME rubric with a topic block appended. Used only for
 * corpus-walk items (blogs), which arrive with no topic because no seed query surfaced them; the
 * museum path never sees this prompt, so its scores and cache are untouched. Built by slicing
 * rather than editing CURATOR_PROMPT, because that string is a product artifact carrying Ben's
 * taste calibration (SPEC §15) and is not implementation detail to be reworded.
 *
 * **D4, revised (Cut 1, 09-2026 — docs/DESIGN_topic-vocabulary-growth.md §4).** 6.3's D4 read:
 * "'or null' is the important clause: a post with no honest home among the sixteen is dropped by
 * ingest, never force-fitted — topic_id is the feed's unit of drift, and a psychedelia post filed
 * under botany teaches the drift graph something false." Half of that survives and is
 * strengthened, half reverses. *Never force-fitted* stands, and is now cheaper: the answer is an
 * ARRAY of honest homes, possibly empty, so refusing a topic costs the item nothing. *Dropped by
 * ingest* is gone: the item is stored with zero topic rows, its tags intact, and Cut 2's
 * promotion is what gives it a home. Walk sources ingest their whole corpus; the vocabulary grows
 * to fit them, never the reverse.
 */
```

Replace `CLASSIFY_PROMPT` (lines 66–71) with:

```ts
export const CLASSIFY_PROMPT =
  CURATOR_PROMPT.slice(0, CURATOR_PROMPT.lastIndexOf("Reply with ONLY")) +
  `Also list which of these topics are an honest home for this item — a topic a reader who chose it would be glad to find this in. Best fit first. Usually one or two, never more than three; an empty list is a correct answer. Never force a fit: if none of them is honest, answer [].
${TOPICS.map((t) => `  ${t.id} — ${t.label}`).join("\n")}

Reply with ONLY a JSON object: {"score": <1-10>, "tags": ["...", "..."], "topics": [<topic ids, best fit first, or empty>]}`;
```

Replace `CuratedItem` (lines 73–80) with:

```ts
export type CuratedItem = NormalizedItem & {
  curationScore: number;
  aestheticTags: string[];
  /** Cut 1: the classify mode's answer for corpus-walk items — every honest topic, best fit
   *  first, possibly none. Ingest stores the item either way: `topics[0] ?? null` becomes the
   *  display `topic_id`, every entry becomes an `item_topic` row, and an empty list is counted as
   *  un-homed. Always `[]` outside classify mode — a search-shaped item's topic comes from the
   *  seed query that surfaced it. */
  topics: string[];
};
```

- [ ] **Step 4: Implement — the parser**

Replace `parseCuratorResponse`'s signature return type and the `topicId` block (lines 195–235) so the function reads:

```ts
export function parseCuratorResponse(
  content: string,
  opts?: { topicIds?: ReadonlySet<string> },
): {
  score: number;
  tags: string[];
  topics: string[];
} {
  const parsed: unknown = JSON.parse(content);
  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};

  const rawScore = Number(record.score);
  if (!Number.isFinite(rawScore) || rawScore <= 0) {
    throw new Error(
      `bad curator score: ${JSON.stringify(parsed).slice(0, 100)}`,
    );
  }
  const score = Math.min(10, Math.max(1, Math.round(rawScore)));

  const tags = (Array.isArray(record.tags) ? record.tags : [])
    .filter(
      (t: unknown): t is string => typeof t === "string" && t.trim().length > 0,
    )
    .map((t: string) => t.trim().toLowerCase())
    .slice(0, 4);

  // Classify mode only (Cut 1: an ARRAY — the model may name several honest homes, or none). Two
  // defences, both cheap: only ids in `topicIds` survive, because the model is capable of
  // inventing "psychedelia" and a foreign-key error deep into an ingest run is the worst place to
  // learn that; and duplicates collapse. A legacy single `"topic"` key is read as a one-element
  // list so an old-style answer still lands. The PROMPT caps the list at three, not this parser:
  // truncating here would hide a model that over-files, and the whole point is honesty.
  const known = opts?.topicIds;
  const rawTopics: unknown[] = Array.isArray(record.topics)
    ? record.topics
    : typeof record.topic === "string"
      ? [record.topic]
      : [];
  const topics = known
    ? [
        ...new Set(
          rawTopics.filter(
            (t): t is string => typeof t === "string" && known.has(t),
          ),
        ),
      ]
    : [];

  return { score, tags, topics };
}
```

- [ ] **Step 5: Implement — the cache, read forward**

Replace lines 242–254 (`CACHE_DIR` and `cacheKey`) with exported versions:

```ts
/** Cache dir at the repo root (not under src/), same cache-aside pattern as phase0's scripts — a
 *  second ingest run of an item already scored bills zero tokens. Resolved from process.cwd()
 *  rather than import.meta.url because this module is imported by scripts/ingest.ts and by tests;
 *  cwd is always the repo root for `bun run` invocations either way. Exported for the read-forward
 *  test in curator.test.ts, which seeds a pre-Cut-1 entry by hand. */
export const CURATION_CACHE_DIR = path.join(process.cwd(), ".cache", "curation");

/**
 * The cache key: `model | promptVersion | mode | source:sourceId`. The default-mode key is
 * byte-identical to Phase 3's so no museum item is ever re-billed; classify mode has its own
 * namespace because its answer carries one more field.
 *
 * **Deliberately NOT keyed on the topic list.** That would be a bug if classification had to be
 * re-run whenever the vocabulary changed — but under design §3 D3 it does not: tag backfill (Cut
 * 2) is what widens old items, for free. Items curated before Cut 1 keep their single topic until
 * a promotion reaches them. That is correct and intended, not a migration gap.
 */
export function curationCacheKey(
  item: Pick<NormalizedItem, "source" | "sourceId">,
  classify: boolean,
): string {
  const mode = classify ? "classify|" : "";
  return createHash("sha256")
    .update(
      `${CURATOR_MODEL}|v${PROMPT_VERSION}|${mode}${item.source}:${item.sourceId}`,
    )
    .digest("hex")
    .slice(0, 32);
}
```

In `scoreItem`: the return type's `topicId: string | null` becomes `topics: string[]`; `cacheFile` becomes `path.join(CURATION_CACHE_DIR, \`${curationCacheKey(item, classify)}.json\`)`; replace the cache-read block (lines 283–295) with:

```ts
      const cached = JSON.parse(await readFile(cacheFile, "utf-8")) as {
        score: number;
        tags: string[];
        /** Phase 6.3 entries (pre-Cut-1): one topic or null. Read forward, never invalidated. */
        topicId?: string | null;
        /** Cut 1 entries: the array. */
        topics?: string[];
      };
      return {
        score: cached.score,
        tags: cached.tags,
        // `topicId: "botany"` → ["botany"]; `topicId: null` → []. This one line is why Cut 1
        // re-bills zero items — see curationCacheKey's comment before "fixing" it.
        topics: cached.topics ?? (cached.topicId ? [cached.topicId] : []),
        tokens: 0,
        imageFetchFailed: false,
      };
```

The write path (`await writeFile(cacheFile, JSON.stringify(result));`) needs no change — `result` now carries `topics`. Replace `mkdir(CACHE_DIR, …)` with `mkdir(CURATION_CACHE_DIR, …)`.

In `curateItems`' worker: destructure `topics` instead of `topicId`, set `topics` on the success object, and `topics: []` on the failure object. Update the `classify?` option's doc: "switches to CLASSIFY_PROMPT and fills `topics`".

- [ ] **Step 6: Run to verify pass**

```bash
bun run test src/server/services/curator.test.ts
bun run typecheck
```

Expected: curator tests PASS. **Typecheck will be red in `scripts/ingest.ts` and `scripts/walk-stats.ts`** (they read `topicId` off `CuratedItem`) — Task 7 fixes both; do not touch them here. Anything red *outside* those two files is yours to fix now.

- [ ] **Step 7: Commit**

```bash
bunx eslint src/server/services/curator.ts src/server/services/curator.test.ts && bunx prettier --check src/server/services/curator.ts src/server/services/curator.test.ts
git branch --show-current && git status
git add src/server/services/curator.ts src/server/services/curator.test.ts
git commit -m "feat(curator): classify names every honest topic or none; old cache entries read forward, nothing re-billed (D4 revised)"
```

---

### Task 6: Pure ingest helpers — `topicHistogram` over arrays, new `tagHistogram`

**Files:**
- Modify: `src/server/services/ingest-plan.ts:1-17` (header), `:87-103` (`topicHistogram`), append `tagHistogram`
- Test: `src/server/services/ingest-plan.test.ts:128-139`

**Interfaces:**
- Produces: `topicHistogram(items: { topics: readonly string[] }[]): { byTopic: Record<string, number>; unhomed: number }`; `tagHistogram(items: { tags: readonly string[]; aestheticTags: readonly string[] }[], top?: number): { tag: string; n: number }[]`.

- [ ] **Step 1: Write the failing tests**

Replace the `describe("topicHistogram")` block with:

```ts
describe("topicHistogram", () => {
  it("counts memberships per topic — an item under two topics counts in both — and the un-homed separately", () => {
    const h = topicHistogram([
      { topics: ["botany", "zoology"] },
      { topics: ["botany"] },
      { topics: [] },
    ]);
    expect(h.byTopic).toEqual({ botany: 2, zoology: 1 });
    expect(h.unhomed).toBe(1);
  });
});

describe("tagHistogram", () => {
  // Cut 1's promotion evidence (design §7): what the un-homed items are ABOUT, from both tag
  // fields. `aesthetic_tags` matter because blog tags are unreliable — two of streetartnews' three
  // newest posts had none — while the curator writes 2-4 descriptors on every item.
  it("counts each tag once per item across both fields, case-insensitively, most common first", () => {
    const h = tagHistogram([
      { tags: ["Mural", "Ghent"], aestheticTags: ["mural", "silhouette art"] },
      { tags: [], aestheticTags: ["monochromatic", "mural"] },
      { tags: ["street art"], aestheticTags: [] },
    ]);
    expect(h).toEqual([
      { tag: "mural", n: 2 },
      { tag: "ghent", n: 1 },
      { tag: "monochromatic", n: 1 },
      { tag: "silhouette art", n: 1 },
      { tag: "street art", n: 1 },
    ]);
  });

  it("truncates to `top`", () => {
    const items = ["a", "b", "c"].map((t) => ({ tags: [t], aestheticTags: [] }));
    expect(tagHistogram(items, 2)).toHaveLength(2);
  });

  it("is empty for no items", () => {
    expect(tagHistogram([])).toEqual([]);
  });
});
```

Add `tagHistogram` to the import from `./ingest-plan`.

- [ ] **Step 2: Run to verify failure**

`bun run test src/server/services/ingest-plan.test.ts` → FAIL (`unhomed` undefined; `tagHistogram` not exported).

- [ ] **Step 3: Implement**

Replace `topicHistogram` (lines 89–103) with:

```ts
/** The per-topic yield of a classified batch, counted as MEMBERSHIPS (Cut 1: an item may name
 *  several topics and counts once under each), with the un-homed bucket kept separate. Printed by
 *  ingest under `--dry-run` and real runs alike; `--dry-run` on a walker is how a blog is sampled
 *  before a verdict (docs/source-candidates.md, trial loop). */
export function topicHistogram(items: { topics: readonly string[] }[]): {
  byTopic: Record<string, number>;
  unhomed: number;
} {
  const byTopic: Record<string, number> = {};
  let unhomed = 0;
  for (const it of items) {
    if (it.topics.length === 0) unhomed++;
    for (const t of it.topics) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }
  return { byTopic, unhomed };
}

/**
 * What a set of items is *about*, from both tag fields — the line in the ingest summary that turns
 * "stored un-homed: 63" from the end of a thought into the start of one (design §7). Each tag
 * counts once per item however many fields carry it, compared lowercase; most common first, ties
 * alphabetical so the output is stable across runs. Cut 2's promotion reads this by eye first
 * and by query later.
 */
export function tagHistogram(
  items: { tags: readonly string[]; aestheticTags: readonly string[] }[],
  top = 12,
): { tag: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const perItem = new Set(
      [...it.tags, ...it.aestheticTags]
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0),
    );
    for (const t of perItem) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
    .slice(0, top);
}
```

Update the file header's lines 6–7 (`topic_id` is single-valued and NOT NULL`) to: "`item.topic_id` — the *display* topic, nullable since Cut 1 — is single-valued, and a search-shaped item gets exactly one seed topic: the winning claim. (Membership beyond that lives in `item_topic`; a losing claim is a lower-ranked query hit, not a verified home, and Cut 1 does not write it — design §3 D2, plan decision D-g.)"

- [ ] **Step 4: Run to verify pass, commit**

```bash
bun run test src/server/services/ingest-plan.test.ts
bunx eslint src/server/services/ingest-plan.ts src/server/services/ingest-plan.test.ts && bunx prettier --check src/server/services/ingest-plan.ts src/server/services/ingest-plan.test.ts
git branch --show-current && git status
git add src/server/services/ingest-plan.ts src/server/services/ingest-plan.test.ts
git commit -m "feat(ingest-plan): topicHistogram counts memberships; tagHistogram is the un-homed promotion evidence"
```

---

### Task 7: Ingest — store everything, write memberships, print the evidence

**Files:**
- Modify: `scripts/ingest.ts:14-21` (header), `:33-43` (usage), `:47` (imports), `:455-460` (`neutral`), `:471-502` (both write loops), `:541-559` (`printSummary` call), `:566-703` (`printSummary`)
- Modify: `scripts/walk-stats.ts:70-72`, `:106-121`

**Interfaces:**
- Consumes: `addItemTopics` (Task 4), `CuratedItem.topics` (Task 5), `topicHistogram`/`tagHistogram` (Task 6).

There is no unit test for `scripts/ingest.ts` (it is orchestration; its decisions live in `ingest-plan.ts`, tested in Task 6). The verification is Step 6's dry run, which is **free** — every doorofperception item is in the curation cache.

- [ ] **Step 1: Header and usage**

Replace header lines 14–21 (the step 3 / 3b text) with:

```
 *   3. The SAME object often answers more than one topic's seed queries (a Wellcome anatomical
 *      plate can satisfy both "anatomy" and "art" searches). A search item gets exactly one seed
 *      topic — resolveCollisions() (server/services/ingest-plan.ts) picks the highest-ranked claim,
 *      order-independently (SPEC §15) — written to `item.topic_id` (the display topic) and as one
 *      `origin='seed'` row in `item_topic`.
 *   3b. (Phase 6.3 / Cut 1) Corpus-WALK sources — blogs — have no seed cells. Each is walked to
 *       exhaustion (processWalker), its items skip collision resolution (nothing to collide on),
 *       and they join the search winners at step 4 below. The curator's classify mode names EVERY
 *       honest topic for each — possibly none. **Every curated walk item is stored** (the
 *       vocabulary-growth principle, docs/DESIGN_topic-vocabulary-growth.md): the first topic
 *       becomes the display `topic_id`, each topic an `origin='curator'` membership row, and an
 *       item with none is stored un-homed — counted, its tags printed, never dropped and never
 *       force-fitted. Un-homed items are invisible to the feed until Cut 2 promotes a topic for them.
```

In the usage block, change the `--dry-run` walker line's comment to `# walk + classify, print the topic + un-homed tag histograms, write nothing (bills only for uncached items)`, and add under `--skip-llm`: `# (walk sources: nothing written — an unscored, unclassified walk row would block its real curation forever)`.

- [ ] **Step 2: Imports and `neutral`**

Line 47: `import { addItemTopics, upsertItem } from "~/server/db/items";`. Line 50–54: add `tagHistogram` to the `ingest-plan` import. In `neutral` (line 455–460), `topicId: null` → `topics: []`.

- [ ] **Step 3: The two write loops**

Replace lines 471–502 (from `// Step 6: upsert.` through the end of the walk loop) with:

```ts
  // Step 6: upsert. Under --dry-run this loop still computes exactly what WOULD be written (so
  // the summary reflects reality) but never calls upsertItem — the "no DB writes" guarantee.
  // Every write is two statements: the row, then its memberships (additive — db/items.ts).
  let inserted = 0;
  let membershipsWritten = 0;
  const insertedByTopic = new Map<string, number>();
  for (const curatedItem of curatedSearch) {
    const winner = winnerByKey.get(
      `${curatedItem.source}:${curatedItem.sourceId}`,
    );
    if (!winner) continue; // unreachable in practice — every curated item came from winnerByKey's own keys
    if (!dryRun) {
      const row = await upsertItem({ ...curatedItem, topicId: winner.topicId });
      membershipsWritten += await addItemTopics(row.id, [winner.topicId], "seed");
    }
    inserted++;
    insertedByTopic.set(
      winner.topicId,
      (insertedByTopic.get(winner.topicId) ?? 0) + 1,
    );
  }

  // Walk items (Cut 1): every curated item is stored. The first topic the curator listed is the
  // display topic; every topic it listed is a membership; an item it listed none for is stored
  // un-homed and characterised below — that tag histogram is what Cut 2's promotion runs on.
  //
  // Under --skip-llm nothing is written for the walk lane: such an item has neither a real score
  // nor a topic decision, and a score-5 un-homed row would be skipped as "already in DB" by every
  // later real run — blocking its curation forever. (The search lane's score-5 rows under
  // --skip-llm at least carry a real seed topic; the asymmetry is deliberate and pre-dates Cut 1.)
  let unhomed = 0;
  let walkUnwritten = 0;
  const unhomedItems: CuratedItem[] = [];
  for (const curatedItem of curatedWalk) {
    if (skipLlm) {
      walkUnwritten++;
      continue;
    }
    const primary = curatedItem.topics[0] ?? null;
    if (!dryRun) {
      const row = await upsertItem({ ...curatedItem, topicId: primary });
      membershipsWritten += await addItemTopics(
        row.id,
        curatedItem.topics,
        "curator",
      );
    }
    inserted++;
    if (primary === null) {
      unhomed++;
      unhomedItems.push(curatedItem);
    }
    for (const t of curatedItem.topics) {
      insertedByTopic.set(t, (insertedByTopic.get(t) ?? 0) + 1);
    }
  }
  const unhomedTags = tagHistogram(unhomedItems);
```

- [ ] **Step 4: The summary**

In the `printSummary` call (lines 541–559), replace `noTopic,` with:

```ts
    membershipsWritten,
    unhomed,
    unhomedTags,
    walkUnwritten,
```

In `printSummary`'s argument type, replace `noTopic: number;` with:

```ts
  /** Cut 1: item_topic rows actually inserted this run (0 under --dry-run). */
  membershipsWritten: number;
  /** Cut 1: walk items stored with no topic — counted, never dropped — and what they are about. */
  unhomed: number;
  unhomedTags: { tag: string; n: number }[];
  /** Walk items NOT written because --skip-llm could neither score nor classify them. */
  walkUnwritten: number;
```

and `histogram`'s type to `{ byTopic: Record<string, number>; unhomed: number }`. Destructure the four new names in place of `noTopic`.

In the walk-sources block, replace the `classification` print (lines 665–675) with:

```ts
    console.log(
      `\nclassification (memberships — an item filed under two topics counts in both)${skipLlm ? " — --skip-llm: nothing classified, nothing written for walk sources" : ""}:`,
    );
    for (const [topicId, n] of Object.entries(histogram.byTopic).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${topicId.padEnd(24)} ${n}`);
    }
    console.log(
      `  ${"(un-homed — stored)".padEnd(24)} ${histogram.unhomed}`,
    );
```

In "Pipeline totals", replace `console.log(\`no-topic dropped (walk):  ${noTopic}\`);` with:

```ts
  console.log(
    `${dryRun ? "would store" : "stored"} un-homed (walk): ${unhomed}`,
  );
  if (unhomedTags.length > 0) {
    // The promotion evidence (design §7): what the items no topic fits are ABOUT. Read this before
    // a source verdict, and before proposing a topic.
    console.log(
      `  top tags among them:    ${unhomedTags.map(({ tag, n }) => `${tag} ${n}`).join(" · ")}`,
    );
  }
  if (walkUnwritten > 0) {
    console.log(
      `walk items not written:   ${walkUnwritten} (--skip-llm cannot score or classify them)`,
    );
  }
```

After the `inserted` line add:

```ts
  console.log(
    `memberships written:      ${dryRun ? "0 (--dry-run)" : membershipsWritten}`,
  );
```

Change the per-topic table's heading to `Per-topic ${dryRun ? "would-insert" : "inserted"} (memberships)`.

- [ ] **Step 5: `scripts/walk-stats.ts`**

Lines 71–72:

```ts
const classified = curated.filter((c) => c.topics.length > 0);
const unhomed = curated.filter((c) => c.topics.length === 0);
```

Rename every later `refused` to `unhomed` and the printed word `refused` to `un-homed`. Lines 106–109:

```ts
const topics = new Map<string, number>();
for (const c of classified)
  for (const t of c.topics) topics.set(t, (topics.get(t) ?? 0) + 1);
```

Line 119: `${c.topics.join("+") || "(un-homed)"}`. The "would insert X of offered" line: since Cut 1 stores everything curated, change it to `stored ${pct(curated.length, offered.length)} of offered · un-homed ${pct(unhomed.length, curated.length)} of stored`. Add after the topics line:

```ts
console.log(
  `  un-homed tags: ` +
    tagHistogram(unhomed, 10)
      .map(({ tag, n }) => `${tag} ${n}`)
      .join(" · "),
);
```

with `tagHistogram` imported from `~/server/services/ingest-plan`. Update the header comment's sentence about "classified / refused" accordingly.

- [ ] **Step 6: Verify — typecheck, then the free dry run**

```bash
bun run typecheck      # green
bun run test           # green
bun run ingest --source doorofperception --dry-run
```

Expected: the ~318 existing rows are skipped ("already in DB"); the ~70 posts 6.3 dropped are curated **from cache** (`curating:` lines fly by, token cost 0 — if it visibly bills, stop: the cache read-forward is broken); the summary shows `would store un-homed (walk): ~70` with a `top tags among them:` line, and `(un-homed — stored)` in the classification block. Paste the summary into the walkthrough under `## Task 7 — dry run`.

- [ ] **Step 7: Commit**

```bash
bunx eslint scripts/ingest.ts scripts/walk-stats.ts && bunx prettier --check scripts/ingest.ts scripts/walk-stats.ts
git branch --show-current && git status
git add scripts/ingest.ts scripts/walk-stats.ts docs/WALKTHROUGH_topic-vocabulary-cut1.md
git commit -m "feat(ingest): the walk lane stores every curated item; memberships written; un-homed counted with their tag histogram"
```

---

### Task 8: The first real run, and eyeballing an un-homed item

**Files:**
- Modify: `docs/WALKTHROUGH_topic-vocabulary-cut1.md`

This is the design's §5 "how the executor should sanity-check the first run". doorofperception is the right subject: small, on production already, fully cached.

- [ ] **Step 1: Run it for real**

```bash
bun run ingest --source doorofperception
```

Expected: `stored un-homed (walk): ~70` and `memberships written: 0` — the 318 rows already in the DB are skipped before curation and write nothing, and every post 6.3 dropped was dropped *because* its cached answer was null, which now reads forward as an empty list. (A handful may differ if the blog has published since 6.3; those are billed and may land with a topic.) Then:

```bash
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select count(*)::int as unhomed from item where topic_id is null`);
console.log(await sql`select id, type, title, tags, aesthetic_tags, curation_score from item where topic_id is null order by curation_score desc limit 5`);
console.log(await sql`select count(*)::int as missing from item i where i.topic_id is not null and not exists (select 1 from item_topic t where t.item_id = i.id and t.topic_id = i.topic_id)`);
await sql.end()'
```

Expected: `unhomed` ≈ the summary's number; `missing` still `0`. Paste into the walkthrough under `## Task 8 — first real run`.

- [ ] **Step 2: Open one by link**

```bash
lsof -ti:3000 || echo free
bun run dev
```

Open `http://localhost:3000/i/<id>` for the top-scoring un-homed id from Step 1 (and `/g/<id>` if it is an image). Expected: the page renders, the wander teaser is simply absent, the gallery opens on an all-wildcard rail, the details sheet has no Topic row, saving it toasts "Saved to <collection>" with no drift copy. Check the terminal for zero server errors. Note what you saw in the walkthrough in two lines.

- [ ] **Step 3: Confirm the feed did not move**

```bash
bun run probe:feed --uniform --pages 3 2>&1 | tail -45
```

Expected: no `(none)` in any card's topic column, and no doorofperception id from Step 1's list among the cards. Then the guard suite: `bun run test src/server/db/items.integration.test.ts` (the "never drawn" case) → PASS.

- [ ] **Step 4: Commit the walkthrough**

```bash
git branch --show-current && git status
git add docs/WALKTHROUGH_topic-vocabulary-cut1.md
git commit -m "docs(walkthrough): Cut 1 first real run — doorofperception's un-homed posts stored and eyeballed"
```

**Not in this task, and Ben's call:** the big re-walks — `bun run ingest --source thisiscolossal` (≈2,657 un-homed expected) and `--source thingsorganizedneatly` (≈829). Free on tokens (cache), but a full colossal walk is hundreds of pages. Offer them after the merge; do not start them unasked.

---

### Task 9: Documents

**Files:**
- Modify: `SPEC.md` (§1 note, §5.1, new §5.1a, §5.6, §6.2, §6.4, §9), `CLAUDE.md:106-118`, `docs/PHASE6_DESIGN_6.3.md:38` and §6, `docs/source-candidates.md:21`, `docs/HANDOFF_sources-round2.md` §0, `docs/DESIGN_topic-vocabulary-growth.md:5-6`, `log.md`

Use today's real date wherever `<date>` appears (MM-DD-YY, the repo's style).

- [ ] **Step 1: `SPEC.md`**

§1 "Core principle" — replace the blockquote (the three lines beginning `> **Decided 09-02-26, NOT YET BUILT.**`) with:

```markdown
> **Decided 09-02-26. Cut 1 (schema + curator + ingest) shipped <date>** — design
> `docs/DESIGN_topic-vocabulary-growth.md`, plan `docs/PLAN_topic-vocabulary-cut1.md`. The feed,
> the topic graph and onboarding still operate on the sixteen topics and still read
> `item.topic_id`; an un-homed item is stored, and reachable by direct link and the gallery's
> wildcard slots only, until Cut 2's promotion path gives it a topic.
```

§5.1 — in the SQL block, replace the `topic_id` line with:

```
  topic_id       TEXT REFERENCES topic(id),  -- nullable (Cut 1): the DISPLAY topic; NULL = un-homed walk item
```

and the `topic_id` row of the table with:

```
| `topic_id` | the item's **display** topic — the seed query that surfaced a museum item, or the first honest topic the curator named for a walk item; `NULL` for an un-homed walk item (Cut 1). Full membership is `item_topic` (§5.1a). The feed draws on this column until Cut 2 moves it onto the join; `NULL` matches neither `inArray` nor `eq`, so un-homed items are invisible to it with no guard. |
```

Insert a new section after §5.1's table:

```markdown
### 5.1a `item_topic` (Cut 1, 09-2026)
Topic membership, many-to-many. One row per (item, topic) the item honestly belongs to.

```sql
CREATE TABLE item_topic (
  item_id   TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  topic_id  TEXT NOT NULL REFERENCES topic(id),
  origin    TEXT NOT NULL,          -- 'seed' | 'curator' | 'tag'
  PRIMARY KEY (item_id, topic_id)
);
```

| Field | Notes |
|---|---|
| `origin` | how membership was decided: `seed` — a search source's seed query surfaced it under this topic; `curator` — classify mode named it; `tag` — a Cut 2 promotion backfilled it from tag overlap. No `confidence` column, deliberately: an LLM's self-reported confidence is uncalibrated; weighting, if wanted, derives from `origin` + `curation_score`. |
| additivity | **Membership is additive.** Every write is `INSERT … ON CONFLICT DO NOTHING` (`addItemTopics`, `db/items.ts`); no automated process deletes a row. Removal is human-triggered and not yet built. |
| cascade | `ON DELETE CASCADE` on `item_id` (`--prune`, `bun run retire`); **none** on `topic_id` — deleting a referenced topic fails loudly. |
| backfill | migration `0004_item_topic` wrote exactly one row per pre-existing item from `item.topic_id`, `origin` = `curator` for walk sources, `seed` otherwise. |
```

§5.6 — add `CREATE INDEX idx_item_topic_topic ON item_topic(topic_id); -- Cut 2's promotion reads by topic`.

§6.2 — replace the paragraph beginning `**Classify mode (walk sources) is changing**` with:

```markdown
**Classify mode (walk sources) — Cut 1, <date>.** Returns an **array** of honest topics, best fit first, "usually one or two, never more than three", possibly **empty**; only ids in `TOPIC_IDS` survive parsing. Nothing is dropped for subject fit — ingest stores every curated walk item (§6.4). No item was re-billed: `PROMPT_VERSION` stayed at 1, the `classify|` cache namespace was reused, and a Phase 6.3 entry reads forward (`topicId: "botany"` → `["botany"]`, `null` → `[]`); items curated before Cut 1 keep their single topic until a Cut 2 promotion widens them. The cache key is deliberately not a function of the topic list. `docs/DESIGN_topic-vocabulary-growth.md` §6.
```

§6.4 — in the "Two lanes since 6.3" bullet, replace the clause `and a null topic is dropped and counted (`topicHistogram`), never force-fit` with:

```
and — Cut 1 — **every curated walk item is stored**: `topics[0]` becomes the display `topic_id`, every topic an `origin='curator'` `item_topic` row, and an item the curator named no topic for is stored un-homed, counted, and characterised by a tag histogram over its `tags` + `aesthetic_tags` (`tagHistogram`) — the evidence Cut 2's promotion runs on. Search items get one `origin='seed'` row. `--skip-llm` writes no walk rows (an unscored, unclassified row would block its real curation forever).
```

§9 — after item 2 ("Item pick"), add:

```markdown
   > **Cut 1 note (<date>).** The item pick and `getTopicPools` still read `item.topic_id`, not `item_topic` — moving the feed onto the join is Cut 2, with its own `bench:feed` run. Consequences until then: an **un-homed** item (`topic_id IS NULL`) never enters a pool and is never drawn; saving one bumps no topic (the toast reads only "Saved to X"); its `/i/` page has no wander teaser and its `/g/` rail is all-wildcard. The gallery's wildcard draw (`drawImageAnywhere`) has no topic filter, so an un-homed *image* can surface in a wildcard slot — deliberate: it is curated-weighted like every draw, and ignoring the graph is the wildcard's job.
```

- [ ] **Step 2: `CLAUDE.md`**

Replace the bullet beginning `- **The vocabulary grows to fit the corpus** — a **core principle**, decided 09-02-26, **not yet built**` (through its last sentence `don't read the principle as describing current behaviour.`) with:

```markdown
- **The vocabulary grows to fit the corpus** — a **core principle**, decided 09-02-26; **Cut 1
  shipped <date>** (design: `docs/DESIGN_topic-vocabulary-growth.md`; plan
  `docs/PLAN_topic-vocabulary-cut1.md`). **Walk sources ingest their whole corpus; the topic
  vocabulary grows to fit them, never the reverse.** A blog is designated because the *blog* was
  judged worth having, so every post that clears the structural floor and the curator's quality
  bar is stored whether or not a topic fits it; its source tags and aesthetic tags are always kept,
  and are what new topics get proposed from. **Search-shaped sources are the exception and stay
  bound to the topic list** — a search source needs a query and topics are where queries come
  from. Short form: **topics are the vocabulary Ambit *asks* with; tags are the vocabulary the
  world *answers* in.** "Everything" means everything that clears *quality*, never a relaxation of
  the floor. This reversed half of 6.3's D4 ("never force-fitted" stays; "no honest home → dropped"
  went). **What Cut 1 built:** `item.topic_id` is nullable and means the *display* topic;
  `item_topic (item_id, topic_id, origin)` holds membership, additive, never retracted by code;
  classify returns an array (possibly empty) and nothing was re-billed; the ingest summary prints
  the un-homed count **and their tag histogram** — read that line before any source verdict. **What
  it did not:** the feed still reads `topic_id`, so un-homed items are invisible to it until Cut 2
  (promotion + moving the feed onto the join); the ~3,500 items 6.3 dropped come back with a
  re-walk of each blog, free from the curation cache.
```

- [ ] **Step 3: `docs/PHASE6_DESIGN_6.3.md`**

In the decisions table (line 38), append to D4's decision cell:

```
**Reversed in part <date>** (`docs/DESIGN_topic-vocabulary-growth.md` §4, Cut 1): *never force-fitted* stands and got cheaper — classify returns an **array** of honest topics, possibly empty; *null → dropped* is gone — an un-homed item is **stored** with zero topic rows and its tags intact.
```

In §6, after the "Classification as a curator mode" paragraph, add:

```markdown
> **Revised <date> (Cut 1).** `topic` became `topics: string[]`, "null" became "an empty list", and the drop became a store. `CuratedItem.topics`, `item_topic`, and the un-homed tag histogram replaced the sentence "a null is dropped, counted, and printed" — see the vocabulary-growth design §6–§7. The measurement run (`--dry-run`) still exists and now also prints what the un-homed items are about.
```

- [ ] **Step 4: `docs/source-candidates.md`**

Append to trial-loop step 3 (line 21):

```
_(Cut 1, <date>: for a **walk** source, also read what its **un-homed** items are about — the ingest summary's `top tags among them` line, or `bun run stats:walk`'s `un-homed tags`. Under the vocabulary-growth principle those are the source's contribution to the topic vocabulary, not waste; a high un-homed share with a coherent tag cluster is evidence **for** a new topic, not against the source.)_
```

- [ ] **Step 5: `docs/HANDOFF_sources-round2.md`**

At the top of §0, add:

```
> **<date>:** Cut 1 of the vocabulary-growth design has merged. streetartnews' 42% "refusal" is now 63 *stored* items with a tag histogram; take its verdict on re-read evidence (`bun run ingest --source streetartnews --dry-run` on its branch after rebasing onto main), per the design's §13.
```

- [ ] **Step 6: `docs/DESIGN_topic-vocabulary-growth.md`**

Lines 5–6: replace `**Status:** **design approved by Ben, nothing built.**` with:

```
**Status:** **Cut 1 built <date>** — plan `docs/PLAN_topic-vocabulary-cut1.md`, walkthrough `docs/WALKTHROUGH_topic-vocabulary-cut1.md`; Cuts 2–3 (§11) unbuilt.
```

(the rest of the sentence, "Four structural decisions taken (§3), each…", stays).

- [ ] **Step 7: `log.md`**

Per CLAUDE.md's format: if today already has an entry, extend it; otherwise add `### [[<MM-DD-YY ddd>]] — Cut 1: the vocabulary grows to fit the corpus` under the right month. **Shipped:** the schema + backfill (counts from the walkthrough), the classify array + read-forward (zero re-bills), the ingest change, the un-homed count and top tags from the doorofperception run. **Decisions:** the table in this plan's §0, one line each. **Open / next:** the big re-walks, streetartnews verdict, the PDR plan re-read, Cut 2. End with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>` — omit the line if the script exits non-zero.

- [ ] **Step 8: Commit**

```bash
bunx prettier --check SPEC.md CLAUDE.md docs/PHASE6_DESIGN_6.3.md docs/source-candidates.md docs/HANDOFF_sources-round2.md docs/DESIGN_topic-vocabulary-growth.md log.md 2>/dev/null || true   # prettier's glob doesn't cover .md; harmless
git branch --show-current && git status
git add SPEC.md CLAUDE.md docs/PHASE6_DESIGN_6.3.md docs/source-candidates.md docs/HANDOFF_sources-round2.md docs/DESIGN_topic-vocabulary-growth.md log.md
git commit -m "docs: Cut 1 shipped — SPEC §5.1a item_topic, D4 reversal note, the trial loop reads un-homed tags"
```

---

### Task 10: Finish the branch

- [ ] **Step 1: The full gate**

```bash
bun run check          # typecheck + lint + format + test — all green
bun run e2e            # optional but recommended; gallery.spec:193 is known-flaky under accumulation (CLAUDE.md)
```

- [ ] **Step 2: Merge**

```bash
git branch --show-current && git status     # feat/topic-vocabulary-cut1, clean
git checkout main && git pull
git merge --no-ff feat/topic-vocabulary-cut1 -m "Merge branch 'feat/topic-vocabulary-cut1' — the vocabulary grows to fit the corpus, Cut 1"
git push
```

Update this file's **Execution state** line to `all tasks done — merged <sha>` in the merge (or a follow-up docs commit).

- [ ] **Step 3: Hand back to Ben**

Report: the walkthrough's numbers (memberships == items, un-homed count, top tags), that zero items were re-billed, and three offers — the two big re-walks, the streetartnews verdict on re-read evidence, and the PDR plan's re-read. **Production picks the migration up on the next deploy** (Dockerfile: migrate → seed → start); the nightly ingest will then store un-homed items from doorofperception and, once deployed, the two kept blogs. Coolify's task status is not evidence (CLAUDE.md) — the un-homed count in the database is.

---

## Self-review against the design (done at planning time)

| Design section | Where |
|---|---|
| §1 principle into SPEC/CLAUDE.md | already landed 09-02 (`c73e8eb`); Task 9 flips "not yet built" |
| §4 D4 reversal note in 6.3 design + curator comment | Task 5 Step 3, Task 9 Step 3 |
| §4 no embeddings | Global Constraints |
| §5 table, cascade, origin, no confidence | Task 1 Step 2 |
| §5 `topic_id` survives, nullable, display topic | Task 1 Step 1 |
| §5 backfill one row per item, origin by source | Task 1 Steps 4–5, §0 Q1 |
| §5 un-homed invisible with no guard | Task 4 test "never drawn"; Task 2 Step 1 comment |
| §5 reachable by direct link | Task 8 Step 2 |
| §5 additivity rule | Task 4 |
| §6 prompt, array, parse filter | Task 5 |
| §6 cache NOT invalidated, PROMPT_VERSION stays | Task 5 Step 5 + test |
| §7 walk lane stores, counts un-homed | Task 7 Step 3 |
| §7 summary tag histogram from both fields, under `--dry-run` | Task 6, Task 7 Steps 4 & 6 |
| §7 header comment rewritten in the same commit | Task 7 Step 1 |
| §8 untouched files; `topics.test.ts` green | Global Constraints, Task 3 Step 7 |
| §8 typechecker is the worklist, no `!`/`as` | Tasks 1 Step 6, 2, 3 |
| §9 migration row counts | Task 1 Step 5 |
| §9 curator unit + cache tests | Task 5 |
| §9 ingest inverts the drop | Task 7 (no unit test exists for the script; Task 6 tests the decisions, Task 7 Step 6 verifies the run) |
| §9 feed never returns an un-homed item | Task 4 test (at the pool/draw layer — `composePage` cannot see un-homed items because pools exclude them) |
| §9 UI null-topic | Task 3 Steps 3, 5 |
| §9 `source-invariants.test.ts`, `topics.test.ts` green | Task 3 Step 7, Task 10 |
| §10 migration in generated file; production boot path | Task 1 Step 4 |
| §10 re-walk after | Task 8 (doorofperception), the big two offered |
| §12 PDR / streetartnews collision | Before you start; Task 9 Step 5; Task 10 Step 3 |
| §13 trial loop's new question | Task 9 Step 4 |
| §14 Q1–Q3 | §0 |
| §15 files table | File map (adds `gallery-rail.ts`, `wander.ts`, `saves.ts`, `feed.ts` types, `masonry.ts`, `probe-feed.ts`, `walk-stats.ts` — all forced by the typechecker or by `CuratedItem`'s shape) |

**Out of scope, restated:** promotion, tag-frequency mining, `topic_edge`, graph rebuild, moving the feed onto `item_topic`, dropping `item.topic_id`, onboarding for many topics, `topicCap` redesign, `collidedWith` as seed memberships (D-g), a membership-removal tool. Cut 2 and Cut 3 in the design's §11.
