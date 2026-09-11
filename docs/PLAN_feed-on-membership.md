# The feed on membership — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-11-26 by Fable 5.1 after Ben approved approach 2 ("might as well go all the
way"). **For:** a cold session on a cheaper model. Base commit `15b4c97` on `main`, plus the
uncommitted work Task 0 commits.

**Goal:** the feed's three topic tiers draw from `item_topic` membership instead of
`item.topic_id`, and a page fetches pools only for the topics its slot draws will land on, so a
promoted topic has its whole membership as its pool from the first page and the page's cost is a
function of page size, not vocabulary size.

**Architecture:** `getTopicPools` ranks `item_topic ⋈ item` with the existing two-stage sample.
`composePage` gets a second random stream for item draws (`itemRng`), which makes its (tier, topic)
sequence a pure function of the topic stream; `planTopics` replays that sequence without pools to
learn which topics a page needs, `getFeedPage` fetches those, composes, and falls back to the
full reachable fetch only if the page came out short. `pickItem` refuses an item already drawn
this page, because an item now sits in up to three pools.

**Tech Stack:** Bun, Drizzle ORM over postgres.js, Postgres 17, Vitest (integration suites
self-skip without `DATABASE_URL`), Playwright (`bun run e2e:prod`).

**Spec:** `docs/DESIGN_feed-on-membership.md` — read it first. Every number and every "why"
below is argued there.

## Global Constraints

- **Determinism is the invariant.** Same cursor → same page. Both random streams derive from the
  cursor seed: topic stream `mulberry32(hashSeed(`${seed}:${page}`))`, item stream
  `mulberry32(hashSeed(`${seed}:${page}:items`))`. `getTopicPools`' sample stays keyed by
  `md5(item.id || sampleKey)` and ends `ORDER BY topic_id, id`.
- **`composePage` with no `itemRng` is byte-for-byte what it was.** Every existing unit test in
  `feed.test.ts` keeps its meaning without edits (Task 4's changes to it are additions).
- **`PoolItem.topicId` means "the pool this row was fetched for"** from Task 3 on. It is never
  read as the display topic anywhere in the engine.
- **`item.topic_id` is not dropped, not renamed, not touched.** `getWildPool`, `drawFromTopic`,
  saves, the item page and the rail keep reading it.
- **`eligibilityConditions` is not touched.** Applied inside the join's ranking, as now.
- **`PLAN_HORIZON_PAGES = 5`** (horizon = `knobs.pageSize × 5`), a module constant in
  `services/feed.ts`. Not a knob.
- **Every requested topic id is a key in `getTopicPools`' Map**, even with zero rows.
- **Measure before and after on a quiet machine in the same hour.** Check `ps` for another
  ingest or dev server first; the design doc's numbers were taken with other work running and say so.
- **Tests are non-negotiable** (SPEC §12). `bun run check` green bar the one known-red row
  (the `<details>` caption invariant, log 09-10) before the final commit; the DB-backed suites
  must *run* locally (`DATABASE_URL` set), not skip.
- **Commits:** conventional prefixes; end every message with the two attribution lines from the
  session's system reminder (`Co-Authored-By:` and `Claude-Session:`).
- **Comment generously** — Ben is a returning webdev and the repo teaches. A paragraph above the
  thing saying *why*, in the house voice of the surrounding file.
- **Branch:** `feat/feed-on-membership` off `main`. Plain branch, no worktree.

---

## File map

| File | Responsibility |
|---|---|
| `src/server/db/test-fixtures.ts` | **new** — `insertHomedItems(db, rows, origin)`: the one fixture writer that inserts items *and* their membership rows |
| `src/server/db/feed.integration.test.ts`, `src/server/services/feed.integration.test.ts`, `src/server/api/routers/routers.integration.test.ts`, `src/server/db/items.integration.test.ts`, `e2e/support.ts` | fixtures write memberships |
| `src/server/db/feed.ts` | `getTopicPools` on the join; header + `PoolItem.topicId` doc rewritten |
| `src/server/services/feed.ts` | `pickSlot`, `planTopics`, `PLAN_HORIZON_PAGES`, `itemRng`, `drawnIds`, `getFeedPage` plan → fetch → compose → fallback, `FeedPage.debug` |
| `src/server/services/feed.test.ts` | new unit tests: dedupe across pools, plan ⊇ served, planned fetch ≡ full fetch, fallback |
| `scripts/bench-feed.ts`, `scripts/probe-feed.ts` | readouts: planned topics, fallback count, slot-vs-display column |
| `src/server/db/items.ts` | `drawFromTopic` header comment corrected |
| `.cache/promote-prod.sh` | `--file` |
| `SPEC.md`, `CLAUDE.md`, `docs/DESIGN_topic-vocabulary-growth.md` §11, `docs/DESIGN_feed-on-membership.md`, `log.md` | the record |

---

### Task 0: Branch

The 09-11 session committed round 2's inputs on `main` before handing off: `--out`/`--rank`/
`--min-total` on `scripts/mine-topics.ts`, `--file` on `scripts/promote-topics.ts`,
`docs/topic-proposals-round2.md` (267 candidates, unticked), this plan, its design doc, and the
day's `log.md` entry.

- [ ] **Step 1: Confirm the starting state and branch**

```bash
cd /Users/ben/Dev/ambit
git status --short
git log --oneline -3
```

Expected: a clean tree, and the two most recent commits are the "docs: the feed on membership"
and "chore(topics): round-2 proposals" ones. Anything uncommitted: stop and ask.

```bash
git checkout -b feat/feed-on-membership
```

---

### Task 1: The baseline

**Files:** none changed. Output goes to `.cache/bench-before.txt` (gitignored).

- [ ] **Step 1: Check the machine is quiet**

```bash
ps aux | grep -E "bun run (ingest|img:warm|dev)|next dev" | grep -v grep
```

Expected: no lines. If an ingest is running, wait for it; the numbers mean nothing otherwise.

- [ ] **Step 2: Bench and probe, before**

```bash
bun run bench:feed --pages 12 2>&1 | tee .cache/bench-before.txt
bun run probe:feed --pages 3 2>&1 | tail -30 | tee -a .cache/bench-before.txt
```

Record `getFeedPage` p50/p95 and the `getTopicPools` payload line. These are the "before" in
Task 6 and in `log.md`.

---

### Task 2: Fixtures write membership

Every DB-backed suite seeds items with a `topicId` and no `item_topic` row. After Task 3 such an
item is in no pool. This task makes the fixtures honest **before** the query changes, so the
suites stay green through Task 3 and a red test there means the query, not the fixture.

**Files:**
- Create: `src/server/db/test-fixtures.ts`
- Modify: `src/server/db/feed.integration.test.ts` (both `insert(item)` calls),
  `src/server/services/feed.integration.test.ts:77`, `src/server/api/routers/routers.integration.test.ts:108` and `:792`,
  `src/server/db/items.integration.test.ts:36`, `e2e/support.ts:210-233`

**Interfaces:**
- Produces: `insertHomedItems(db, rows, origin = "seed"): Promise<Item[]>`.

- [ ] **Step 1: The helper**

```ts
// src/server/db/test-fixtures.ts
// Fixture writer for the DB-backed suites (09-11-26, docs/PLAN_feed-on-membership.md T2).
//
// Since the feed moved onto `item_topic` an item with a `topicId` and no membership row is in no
// pool at all — the display topic is what the item PAGE shows, membership is what the FEED draws.
// Every real writer (ingest's `upsertItem` + `addItemTopics`, `promote:topics`) writes both;
// the suites used to write only the column, which was fine while the feed read only the column.
// One helper so no fixture can drift back to that. Not for production code: the ingest has its
// own writers with their own conflict rules (items.ts).
//
// `db` is passed in rather than imported: CI's unit-test step runs with no env at all, and a
// static import of ./client (which reads `~/env`) would crash the run before a test executes.
import { item, itemTopic, type ItemTopicOrigin } from "./schema";
import type { Item } from "./items";

type Db = Awaited<typeof import("./client")>["db"];
type NewItem = typeof item.$inferInsert;

/**
 * Insert `rows` and, for each one with a non-null `topicId`, an `item_topic` row for that topic.
 * Returns the full inserted rows (what `.returning()` gives), in insertion order, so callers that
 * destructure ids or rows keep working.
 */
export async function insertHomedItems(
  db: Db,
  rows: NewItem[],
  origin: ItemTopicOrigin = "seed",
): Promise<Item[]> {
  if (rows.length === 0) return [];
  const inserted = await db.insert(item).values(rows).returning();
  const memberships = inserted
    .filter((r): r is Item & { topicId: string } => r.topicId !== null)
    .map((r) => ({ itemId: r.id, topicId: r.topicId, origin }));
  if (memberships.length > 0) {
    await db.insert(itemTopic).values(memberships).onConflictDoNothing();
  }
  return inserted;
}
```

- [ ] **Step 2: Use it in the four suites**

In each file, replace the fixture's `db.insert(item).values(<rows>)` with
`insertHomedItems(db, <rows>)`, importing `{ insertHomedItems } from "~/server/db/test-fixtures"`
(or `"./test-fixtures"` inside `db/`). The row literals do not change. Specifically:

- `src/server/db/feed.integration.test.ts`: the suspended-source fixture (`["met", "doorofperception", ...SUSPENDED_SOURCES].map(...)`) and the sampling fixture (`SOURCES.flatMap(...)`).
- `src/server/services/feed.integration.test.ts:77`: the 30-item fixture. Leave the un-homed row at `:216` alone — `topicId: null`, no membership, that is its point.
- `src/server/api/routers/routers.integration.test.ts:108`: `const [itemOne, itemTwo, s3, s4, s5] = await insertHomedItems(db, [...])` — the helper returns full rows, so the destructuring holds. Same at `:792` (`const [one, two] = ...`). Leave the un-homed row at `:370` alone.
- `src/server/db/items.integration.test.ts:36`: the scored fixture. Leave `:276` alone (`topicId: null`, the membership tests build their own rows).

Teardown needs no change: every suite deletes `item` rows before `topic` rows, and `item_topic`
cascades on `item_id`.

- [ ] **Step 3: The e2e seeder**

```ts
// e2e/support.ts — replace the body of seedFeedCorpus
export async function seedFeedCorpus(
  conn: Connection,
  prefix: string,
  count: number,
  topics: readonly string[],
): Promise<void> {
  // Since 09-11-26 the feed draws on `item_topic`, so a seeded item needs a membership row or it
  // is in no pool. The display topic is still set (the item page reads it). Same shape as
  // src/server/db/test-fixtures.ts, written out here because e2e runs against the built app and
  // does not import the server's test helpers.
  const inserted = await conn.db
    .insert(conn.item)
    .values(
      Array.from({ length: count }, (_, i) => ({
        source: "e2e",
        sourceId: `${prefix}${i}`,
        // Roughly a third articles, so both tile components get exercised. The per-branch
        // `as const` is load-bearing: nothing gives this object literal a contextual type, so
        // without them TypeScript widens `type` to `string` and the insert stops matching the
        // column's narrowed union.
        type: i % 3 === 0 ? ("article" as const) : ("image" as const),
        title: `E2E fixture ${prefix}${i}`,
        summary: `A lede for fixture ${i}, long enough to occupy a couple of lines.`,
        imageUrl: PIXEL,
        sourceUrl: `https://example.test/${prefix}${i}`,
        topicId: topics[i % topics.length]!,
        // Comfortably above the engine's default `scoreFloor` of 4, so these are drawable.
        curationScore: 9,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: conn.item.id, topicId: conn.item.topicId });
  if (inserted.length === 0) return; // every row already existed — a re-run; memberships too
  await conn.db
    .insert(conn.itemTopic)
    .values(
      inserted.map((r) => ({ itemId: r.id, topicId: r.topicId!, origin: "seed" as const })),
    )
    .onConflictDoNothing();
}
```

`conn.itemTopic` exists already: `connect()` spreads the whole schema module.

- [ ] **Step 4: Run the suites — still green on the old query**

```bash
bun run test src/server/db/feed.integration.test.ts src/server/services/feed.integration.test.ts src/server/api/routers/routers.integration.test.ts src/server/db/items.integration.test.ts
```

Expected: all pass. (The cursor-stability test in `services/feed.integration.test.ts` has a
documented 1-in-10 cross-suite flake when run alongside the others — CLAUDE.md — re-run that file
alone before believing a red.)

- [ ] **Step 5: Commit**

```bash
git add src/server/db/test-fixtures.ts src/server/db/feed.integration.test.ts src/server/services/feed.integration.test.ts src/server/api/routers/routers.integration.test.ts src/server/db/items.integration.test.ts e2e/support.ts
git commit -m "test: fixtures write item_topic membership alongside the display topic"
```

---

### Task 3: `getTopicPools` on the join

**Files:**
- Modify: `src/server/db/feed.ts:35-45` (`PoolItem.topicId` doc), `:47-75` (header), `:100-118` (stage one), imports
- Test: `src/server/db/feed.integration.test.ts` — a new `describe` beside the sampling one

**Interfaces:**
- Consumes: `insertHomedItems` (Task 2), `itemTopic` from `./schema`.
- Produces: `getTopicPools` with the same signature; rows now come from membership, and
  `PoolItem.topicId` is the membership's topic.

- [ ] **Step 1: The failing test**

Add to `src/server/db/feed.integration.test.ts`, inside the top-level `describe.skipIf`, after
the sampling `describe`:

```ts
  describe("getTopicPools draws on membership (09-11-26)", () => {
    const prefix = `test-membership-${nanoid(8)}-`;
    const displayTopic = `test-display-${nanoid(8)}`;
    const memberTopic = `test-member-${nanoid(8)}`;
    const userId = `test-membership-user-${nanoid(8)}`;
    let itemId: string;
    const opts = () => ({
      userId,
      anchor: new Date(),
      scoreFloor: 4,
      excludeIds: [],
      sampleKey: "membership:0",
    });

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { itemTopic, topic, user } = await import("~/server/db/schema");
      const { insertHomedItems } = await import("~/server/db/test-fixtures");
      await db.insert(topic).values(
        [displayTopic, memberTopic].map((id) => ({
          id,
          label: id,
          seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
        })),
      );
      await db.insert(user).values({
        id: userId,
        name: "Test membership user",
        email: `${userId}@example.com`,
        emailVerified: false,
      });
      // One item whose DISPLAY topic is A and which is ALSO a member of B. Before 09-11-26 it was
      // drawable under A only; the point of the join is that B can draw it too.
      const [row] = await insertHomedItems(db, [
        {
          source: "met",
          sourceId: `${prefix}0`,
          type: "image" as const,
          title: "A picture with two homes",
          sourceUrl: `https://example.com/${prefix}0`,
          imageUrl: `https://example.com/${prefix}0.jpg`,
          topicId: displayTopic,
          curationScore: 9,
          aestheticTags: [],
        },
      ]);
      itemId = row!.id;
      await db
        .insert(itemTopic)
        .values({ itemId, topicId: memberTopic, origin: "tag" });
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      await db.delete(item).where(eq(item.id, itemId)); // cascades to item_topic
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(topic).where(inArray(topic.id, [displayTopic, memberTopic]));
    });

    it("draws an item under a topic it is a member of, not only its display topic", async () => {
      const pools = await getTopicPools([memberTopic], opts());
      const pool = pools.get(memberTopic)!;
      expect(pool.map((r) => r.id)).toEqual([itemId]);
      // The pool's own topic, not the item's display topic.
      expect(pool[0]!.topicId).toBe(memberTopic);
    });

    it("puts an item with two memberships in both pools when both are asked for", async () => {
      const pools = await getTopicPools([displayTopic, memberTopic], opts());
      expect(pools.get(displayTopic)!.map((r) => r.id)).toEqual([itemId]);
      expect(pools.get(memberTopic)!.map((r) => r.id)).toEqual([itemId]);
    });
  });
```

`eq` and `inArray` are already imported in that file; check `nanoid` is too (it is, the other
suites use it).

- [ ] **Step 2: Run it — expect the first test red**

```bash
bun run test src/server/db/feed.integration.test.ts -t "membership"
```

Expected: "draws an item under a topic it is a member of" FAILS (`[]` received — `topic_id` is
`displayTopic`, so the member pool is empty). The second fails the same way on the member half.

- [ ] **Step 3: Move stage one onto the join**

In `src/server/db/feed.ts`:

Import `itemTopic` beside `item`:

```ts
import { item, itemTopic, seenItem } from "./schema";
```

Replace the `PoolItem.topicId` doc (`:39-44`):

```ts
  /** **The pool this row was fetched for** — `item_topic.topic_id`, since 09-11-26 — not the
   *  item's display topic. An item with three memberships can come back in three pools on one
   *  page (which is why `pickItem` refuses an id already drawn this page). Null ONLY for a row
   *  from `getWildPool`: an un-homed item has no membership row at all, so a topic pool still
   *  cannot contain one. Downstream, `composePage` turns a null here into exactly one thing: a
   *  WILD card. */
  topicId: string | null;
```

Replace the stage-one query (`:100-118`) with:

```ts
  // Stage one: every membership row in the requested topics whose ITEM is eligible, ranked
  // inside its own (topic, source) by a hash of the item's id and the page's key; keep that
  // source's first `TOPIC_POOL_PER_SOURCE`. `md5(id || key)` rather than `random()` for the same
  // reason as `getWildPool`: SPEC §7 promises a refetched cursor returns the same page, and a
  // `random()` sample would give a different one each time. The eligibility clauses are the
  // shared `eligibilityConditions`, applied *inside* the ranking, so a row eligibility refuses is
  // never counted toward a cap — an exclusion is backfilled, not a hole in the sample.
  //
  // **From `item_topic`, not `item` (09-11-26, docs/DESIGN_feed-on-membership.md).** Until then
  // this ranked `item` rows by their display `topic_id`, so an item could only ever be drawn
  // under its first honest home. Membership is the whole of what an item belongs to — the
  // curator's three topics, a promotion's tag match, a seed query — and a topic's pool is now
  // exactly its members: `surreal` went from 3,919 drawable items to 26,701 on the day this
  // landed, and a topic promoted from a tag has its full membership as its pool from the first
  // page rather than the handful of un-homed items `promote:topics` could give a display topic
  // to. The row count the windows rank is memberships (~2.8 rows per item), which is why
  // `getFeedPage` now asks for the topics a page will *use* rather than every reachable one.
  const perSource = db
    .select({
      id: item.id,
      topicId: itemTopic.topicId,
      source: item.source,
      curationScore: item.curationScore,
      aestheticTags: item.aestheticTags,
      nSrc: sql<number>`row_number() over (partition by ${itemTopic.topicId}, ${item.source} order by md5(${item.id} || ${opts.sampleKey}))`.as(
        "n_src",
      ),
    })
    .from(itemTopic)
    .innerJoin(item, eq(item.id, itemTopic.itemId))
    .where(
      and(
        inArray(itemTopic.topicId, topicIds),
        ...eligibilityConditions(db, opts),
      ),
    )
    .as("per_source");
```

Stage two and the final select are unchanged (they read `perSource.topicId` / `survivors.topicId`,
which is now the membership's topic). Delete the "Unreachable in practice — the `inArray(topicId, …)`
above cannot match a NULL" comment on the `if (row.topicId === null) continue;` line and replace it
with:

```ts
    // `item_topic.topic_id` is NOT NULL, so this never fires; the projection is typed
    // `string | null` because `PoolItem` is shared with the wild pool, and a `!` here would hide
    // the day the type changes.
```

Rewrite the function's header comment (`:47-75`) so its first sentence is: *"One SELECT per page,
not one per topic: for every id in `topicIds`, a deterministic **sample** of the eligible
**memberships** of that topic — `item_topic` rows joined to their item — …"* and keep the rest
(the anchor `<`, `excludeIds`, the Map contract, the sampling paragraph) as it is. Replace
"Rides `idx_item_topic_score` for the `IN (...) AND curationScore >=` half of the filter" with
"Walks `idx_item_topic_topic` for the `IN (...)` half and joins `item` by primary key for the rest;
at a few dozen topics the planner does exactly that (Task 6's `EXPLAIN`), at a hundred it
seq-scans both — which is the other reason `getFeedPage` asks for few".

- [ ] **Step 4: Run the file — green, including the sampling and suspended-source suites**

```bash
bun run test src/server/db/feed.integration.test.ts
```

Expected: all pass. The sampling suite's caps hold per membership row, and its fixture writes
one membership per item, so the counts are unchanged.

- [ ] **Step 5: Run the other three DB suites and the unit tests**

```bash
bun run test src/server/services/feed.integration.test.ts src/server/api/routers/routers.integration.test.ts src/server/db/items.integration.test.ts src/server/services/feed.test.ts
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/feed.ts src/server/db/feed.integration.test.ts
git commit -m "feat(feed): getTopicPools draws on item_topic membership, not the display topic"
```

---

### Task 4: `composePage` — two streams, a slot picker, a plan, and no item twice

**Files:**
- Modify: `src/server/services/feed.ts:352-395` (`pickItem`), `:395-560` (`ComposePageOpts`, `composePage`), and new exports beside `pickJump`
- Test: `src/server/services/feed.test.ts` — new tests inside `describe("composePage")` and a new `describe("planTopics")`

**Interfaces:**
- Produces:
  - `export interface SlotPick { tier: Tier; pick: TopicPick | null }`
  - `export function pickSlot(weights: Map<string, number>, graph: TopicGraph, knobs: FeedKnobs, rng: () => number, coreTopicIds: ReadonlySet<string>): SlotPick | null`
  - `export const PLAN_HORIZON_PAGES = 5`
  - `export function planTopics(opts: { weights: Map<string, number>; graph: TopicGraph; knobs: FeedKnobs; rng: () => number; coreTopicIds?: ReadonlySet<string>; horizon?: number }): Set<string>`
  - `ComposePageOpts.itemRng?: () => number`
  - `pickItem(..., cappedSources, drawnIds: ReadonlySet<string>)` (internal)

- [ ] **Step 1: The failing tests**

Add inside `describe("composePage", …)` in `src/server/services/feed.test.ts`, after the
"never repeats an item within the same page" test:

```ts
  it("never draws an item twice on a page when it sits in two pools (09-11-26)", () => {
    // The same five items are members of BOTH topics — what the membership join hands the
    // engine when an item carries two of the page's topics. Before drawnIds, splicing a drawn
    // item out of ITS pool left it drawable from the other.
    const shared = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `shared-${i}`, topicId: "a" }),
    );
    const weights = new Map([
      ["a", 1],
      ["b", 1],
    ]);
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, pageSize: 10, tierWild: 0 };
    const cards = composePage({
      weights,
      graph: {},
      pools: new Map([
        ["a", shared],
        ["b", shared.map((it) => ({ ...it, topicId: "b" }))],
      ]),
      rng: mulberry32(hashSeed("twice:1")),
      knobs,
    });
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((c) => c.item.id)).size).toBe(5);
  });

  it("with itemRng omitted composes exactly what it composed before (the single-stream default)", () => {
    const pools = new Map([
      ["only", Array.from({ length: 60 }, () => makeItem({ topicId: "only" }))],
    ]);
    const knobs: FeedKnobs = { ...baseKnobs, topicCap: 100, tierWild: 0 };
    const a = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      knobs,
    });
    const b = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      itemRng: mulberry32(hashSeed("single:1")), // a second stream with the SAME seed — not the same stream
      knobs,
    });
    // Different: the second call's topic draws no longer share a stream with its item draws.
    expect(b.map((c) => c.item.id)).not.toEqual(a.map((c) => c.item.id));
    // But each is reproducible on its own terms.
    const a2 = composePage({
      weights: new Map([["only", 1]]),
      graph: {},
      pools,
      rng: mulberry32(hashSeed("single:1")),
      knobs,
    });
    expect(a2.map((c) => c.item.id)).toEqual(a.map((c) => c.item.id));
  });
```

(The WILD describe has its own `oneTopic()` helper, but it is scoped inside that block — hence the
inline fixture.)

Then a new top-level `describe`:

```ts
describe("planTopics (09-11-26)", () => {
  // A dense little graph: every topic a neighbour of every other, so DRIFT and JUMP have
  // somewhere to go and the plan is not trivially the weights' keys.
  const TOPIC_IDS = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const graph: TopicGraph = Object.fromEntries(
    TOPIC_IDS.map((from) => [
      from,
      TOPIC_IDS.filter((t) => t !== from).map((topic, j) => ({
        topic,
        sim: 0.9 - j * 0.15, // a head of positive bridges and a tail of negative ones
      })),
    ]),
  );
  const weights = new Map(TOPIC_IDS.slice(0, 3).map((id) => [id, 1]));
  const fullPools = () =>
    new Map(
      TOPIC_IDS.map((id) => [
        id,
        Array.from({ length: 60 }, () => makeItem({ topicId: id })),
      ]),
    );
  const knobs: FeedKnobs = { ...DEFAULT_KNOBS, tierWild: 0 };
  const core = new Set(TOPIC_IDS);

  it("covers every topic composePage serves, for the same topic stream (200 seeds)", () => {
    for (let seed = 0; seed < 200; seed++) {
      const planned = planTopics({
        weights,
        graph,
        knobs,
        rng: mulberry32(hashSeed(`plan:${seed}`)),
        coreTopicIds: core,
      });
      const cards = composePage({
        weights,
        graph,
        pools: fullPools(),
        rng: mulberry32(hashSeed(`plan:${seed}`)),
        itemRng: mulberry32(hashSeed(`plan:${seed}:items`)),
        knobs,
        coreTopicIds: core,
      });
      for (const card of cards) {
        expect(planned.has(card.topicId!)).toBe(true);
      }
    }
  });

  it("a page composed from only the planned pools is identical to one composed from every pool", () => {
    for (let seed = 0; seed < 50; seed++) {
      const planned = planTopics({
        weights,
        graph,
        knobs,
        rng: mulberry32(hashSeed(`same:${seed}`)),
        coreTopicIds: core,
      });
      const all = fullPools();
      const only = new Map([...all].filter(([id]) => planned.has(id)));
      const compose = (pools: Map<string, PoolItem[]>) =>
        composePage({
          weights,
          graph,
          pools,
          rng: mulberry32(hashSeed(`same:${seed}`)),
          itemRng: mulberry32(hashSeed(`same:${seed}:items`)),
          knobs,
          coreTopicIds: core,
        });
      expect(compose(only).map((c) => [c.topicId, c.item.id])).toEqual(
        compose(all).map((c) => [c.topicId, c.item.id]),
      );
    }
  });

  it("returns at most horizon topics and nothing outside the graph's reach", () => {
    const planned = planTopics({
      weights,
      graph,
      knobs,
      rng: mulberry32(hashSeed("bound")),
      coreTopicIds: core,
      horizon: 7,
    });
    expect(planned.size).toBeLessThanOrEqual(7);
    for (const id of planned) expect(TOPIC_IDS).toContain(id);
  });
});
```

Import `planTopics` and the `PoolItem` type at the top of the test file alongside `composePage`
(`PoolItem` from `~/server/db/feed`; the file already mocks that module's functions — a `type`
import is unaffected by `vi.mock`). `TopicGraph` is exported from `services/feed.ts` already.

- [ ] **Step 2: Run — expect red**

```bash
bun run test src/server/services/feed.test.ts -t "twice on a page|itemRng omitted|planTopics"
```

Expected: "never draws an item twice … two pools" FAILS (6–10 cards, duplicates); the others fail
on `planTopics is not a function` / unknown `itemRng`.

- [ ] **Step 3: `pickItem` refuses drawn ids**

In `src/server/services/feed.ts`, change `pickItem`'s signature and its first filter:

```ts
function pickItem(
  pool: PoolItem[] | undefined,
  lastSource: string | null,
  knobs: Pick<FeedKnobs, "scoreFloor" | "scorePower" | "tagBoost">,
  tasteKeywords: string[],
  rng: () => number,
  /** Sources that have already hit `sourceCap` on this page. A HARD filter, unlike `lastSource`:
   *  if nothing else is left in the pool the slot is skipped, never relaxed — that is the cap
   *  doing its job. Filtering here rather than rejecting after the draw is what lets a topic's
   *  minority sources win the slot once the majority is capped. */
  cappedSources: ReadonlySet<string> = EMPTY_SOURCES,
  /** Items already drawn on this page. Since the pools come from membership (09-11-26) one item
   *  can sit in up to three of them, and `composePage` only splices a draw out of the pool it
   *  drew from. Hard filter, like the cap. Applied to the WILD pool too, though an un-homed row
   *  has no membership and cannot overlap — a rule with one exception is a bug waiting. */
  drawnIds: ReadonlySet<string> = EMPTY_IDS,
): PoolItem | null {
  if (!pool || pool.length === 0) return null;

  let candidates = pool;
  if (drawnIds.size > 0) {
    candidates = candidates.filter((it) => !drawnIds.has(it.id));
    if (candidates.length === 0) return null;
  }
  if (cappedSources.size > 0) {
    candidates = candidates.filter((it) => !cappedSources.has(it.source));
    if (candidates.length === 0) return null;
  }
```

and beside `EMPTY_SOURCES`:

```ts
const EMPTY_IDS: ReadonlySet<string> = new Set();
```

- [ ] **Step 4: `pickSlot` — the tier+topic half of one guard iteration**

Add after `pickJump`:

```ts
/** One guard-loop iteration's tier draw and topic pick, with the item draw left out. */
export interface SlotPick {
  tier: Tier;
  /** Null for WILD (no topic behind it) and for a topic tier that found nothing to pick (an
   *  empty weights map). */
  pick: TopicPick | null;
}

/**
 * The first half of one iteration of `composePage`'s guard loop: draw a tier, then a topic for
 * it. Factored out (09-11-26) so `planTopics` can replay exactly this sequence without pools —
 * which only works because this consumes `rng` identically whether or not the slot then fills.
 * Every rng call a slot makes before its item draw happens in here, and nothing in here depends
 * on what earlier slots drew.
 */
export function pickSlot(
  weights: Map<string, number>,
  graph: TopicGraph,
  knobs: FeedKnobs,
  rng: () => number,
  coreTopicIds: ReadonlySet<string>,
): SlotPick | null {
  const tier = weightedPick<Tier>(
    [
      ["CORE", knobs.tierCore],
      ["DRIFT", knobs.tierDrift],
      ["JUMP", knobs.tierJump],
      ["WILD", knobs.tierWild],
    ],
    rng,
  );
  if (!tier) return null; // all tier weights <= 0 — degenerate knobs; the caller's guard bounds the retry
  if (tier === "WILD") return { tier, pick: null };
  const pick =
    tier === "CORE"
      ? pickCore(weights, rng)
      : tier === "DRIFT"
        ? pickDrift(weights, graph, knobs, rng, coreTopicIds)
        : pickJump(weights, graph, rng);
  return { tier, pick };
}

/**
 * How far ahead `planTopics` looks, in pages: horizon = pageSize × this. A page needs `pageSize`
 * successful draws; the rest is slack for the slots that fail (a capped topic, an empty pool).
 * Five is generous — 48 failures in a 12-card page — and cheap, because a plan iteration is a
 * few weighted picks with no I/O. Past the horizon `composePage` meets pools it never fetched,
 * composes short, and `getFeedPage` takes the full-fetch fallback; `bench:feed` counts how often.
 */
export const PLAN_HORIZON_PAGES = 5;

/**
 * Which topics a page will draw from — computed **without pools** (09-11-26,
 * docs/DESIGN_feed-on-membership.md §4.3). Replays `composePage`'s guard loop through
 * `pickSlot` for `horizon` iterations, assuming every draw succeeds (so the topic cap advances
 * on every uncapped pick, exactly as it does in the real loop when the pool is not empty), and
 * returns every topic it landed on.
 *
 * Why this is exact and not a guess: `composePage`, handed a topic stream seeded the same way
 * and a *separate* `itemRng`, consumes the topic stream identically per iteration whether the
 * slot fills or not — the cap check comes after the pick — so its iteration i lands on the same
 * topic this one did. The two can only differ in *how many* iterations the real loop needs,
 * which is what the horizon's slack is for. A capped pick is not added on that iteration, but
 * it was added on the pick that first counted it, so nothing the real loop can land on inside
 * the horizon is missing from the set.
 *
 * This is what lets `getFeedPage` fetch ~40 pools rather than every reachable one (~100 of 104
 * from any three picks, and ~370 once the round-2 vocabulary lands) — the page's cost becomes a
 * function of page size rather than of vocabulary size, which is the property the whole
 * "vocabulary grows to fit the corpus" principle needs from the feed.
 */
export function planTopics(opts: {
  weights: Map<string, number>;
  graph: TopicGraph;
  knobs: FeedKnobs;
  rng: () => number;
  coreTopicIds?: ReadonlySet<string>;
  horizon?: number;
}): Set<string> {
  const {
    weights,
    graph,
    knobs,
    rng,
    coreTopicIds = CORE_TOPIC_IDS,
    horizon = knobs.pageSize * PLAN_HORIZON_PAGES,
  } = opts;
  const planned = new Set<string>();
  const topicCounts = new Map<string, number>();
  for (let i = 0; i < horizon; i++) {
    const slot = pickSlot(weights, graph, knobs, rng, coreTopicIds);
    if (!slot || slot.tier === "WILD" || !slot.pick) continue;
    const { topicId } = slot.pick;
    if ((topicCounts.get(topicId) ?? 0) >= knobs.topicCap) continue;
    topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
    planned.add(topicId);
  }
  return planned;
}
```

- [ ] **Step 5: `composePage` — `itemRng`, `drawnIds`, and `pickSlot`**

Add to `ComposePageOpts` after `rng`:

```ts
  /**
   * The stream the ITEM draws use (09-11-26). `rng` is then the topic stream only — tiers and
   * topics — which is what makes a page's topic sequence a pure function of weights, graph,
   * knobs and `rng`, and what lets `planTopics` know a page's topics before any pool is
   * fetched. Defaults to `rng`, in which case this function is byte-for-byte the single-stream
   * engine it was before, and every test written against that keeps its meaning.
   */
  itemRng?: () => number;
```

In `composePage`'s destructuring add `itemRng = rng,`. After `const cappedSources = new Set<string>();`
add:

```ts
  // Every id drawn on this page, across all pools. The pools come from membership now, so one
  // item can be in three of them; splicing it out of the pool it was drawn from is not enough.
  const drawnIds = new Set<string>();
```

Replace the tier draw and the WILD/topic pick blocks in the guard loop — from `const tierName = weightedPick<Tier>(` through `if (!pick) continue; // no topics to draw from at all` — with:

```ts
    const slot = pickSlot(weights, graph, knobs, rng, coreTopicIds);
    if (!slot) continue; // all tier weights <= 0 — degenerate knobs; guard bounds the retry
    const tierName = slot.tier;

    // WILD short-circuits the topic step entirely: there is no topic to pick, no graph to walk,
    // no driftPath to record, and topicCap — which bounds how much of a page one TOPIC may be —
    // has nothing to count. Its only personalization is the taste boost, turned up to
    // wildTagBoost because in this slot it is the sole signal (knobs, D1).
    if (tierName === "WILD") {
      const drawn = pickItem(
        workingWild,
        lastSource,
        { ...knobs, tagBoost: knobs.wildTagBoost },
        tasteKeywords,
        itemRng,
        cappedSources,
        drawnIds,
      );
      if (!drawn) continue; // nothing un-homed left to show — soft, like every other constraint
      workingWild.splice(
        workingWild.findIndex((it) => it.id === drawn.id),
        1,
      );
      drawnIds.add(drawn.id);
      lastSource = drawn.source;
      countSource(drawn.source);
      cards.push({
        item: drawn,
        tier: "WILD",
        topicId: null,
        ...(debug
          ? {
              debug: {
                why: `WILD · un-homed (${workingWild.length} left in sample)`,
                curationScore: drawn.curationScore,
              },
            }
          : {}),
      });
      continue;
    }

    const pick = slot.pick;
    if (!pick) continue; // no topics to draw from at all (e.g. an empty weights map)
```

Then in the topic draw below it, pass `itemRng` and `drawnIds` to `pickItem` and record the draw:

```ts
    const drawn = pickItem(
      working.get(topicId),
      lastSource,
      knobs,
      tasteKeywords,
      itemRng,
      cappedSources,
      drawnIds,
    );
    if (!drawn) continue; // this topic's pool is empty/exhausted — soft constraint, try again

    const remaining = working.get(topicId)!.filter((it) => it.id !== drawn.id);
    working.set(topicId, remaining);
    drawnIds.add(drawn.id);
```

Update the "Working copies of each topic's pool" comment above `working` to end: *"…this covers
*within* it — together with `drawnIds` below, since 09-11-26, because an item can be in several pools)."*

- [ ] **Step 6: Run the whole unit file — green, old tests untouched**

```bash
bun run test src/server/services/feed.test.ts
```

Expected: every test passes, including the pre-existing distribution tests (the single-stream
default means they draw exactly as before). If "mixes tiers at roughly the configured ratio"
moves, something in Step 5 changed rng consumption order — compare against the original block.

- [ ] **Step 7: Commit**

```bash
git add src/server/services/feed.ts src/server/services/feed.test.ts
git commit -m "feat(feed): two random streams, pickSlot, planTopics, and no item twice across pools"
```

---

### Task 5: `getFeedPage` plans, fetches, composes, falls back

**Files:**
- Modify: `src/server/services/feed.ts:130-135` (`FeedPage`), `:600-716` (`getFeedPage` doc + body)
- Test: `src/server/services/feed.test.ts` — a new `describe("getFeedPage — planned fetch")`

**Interfaces:**
- Consumes: `planTopics`, `reachableTopics`, `getTopicPools`, `getWildPool`.
- Produces: `FeedPage.debug?: { plannedTopics: number; fallback: boolean }` — present only when
  `feedDebugEnabled()` is true (same gate as card `debug`).

- [ ] **Step 1: The failing tests**

Add after the "FEED_DEBUG knob gating" describe in `src/server/services/feed.test.ts`:

```ts
describe("getFeedPage — planned fetch (09-11-26)", () => {
  // Five picks, not three: at `topicCap: 3` a page can hold at most 3 × topics cards from its
  // topic tiers, and with the WILD pool empty that has to reach `pageSize` (12) or every test
  // here would take the fallback for the wrong reason.
  const PICKED = ["p0", "p1", "p2", "p3", "p4"];
  // Twelve-per-topic pools for every topic the mock is asked about.
  const poolsFor = (topicIds: string[], size = 12) =>
    new Map(
      topicIds.map((topicId) => [
        topicId,
        Array.from({ length: size }, (_, i) =>
          makeItem({ id: `${topicId}-${i}`, topicId, curationScore: 7 }),
        ),
      ]),
    );

  beforeEach(() => {
    mockEnv.FEED_DEBUG = true;
    mockEnv.NODE_ENV = "test";
    mockGetUserTopicWeights
      .mockReset()
      .mockResolvedValue(new Map(PICKED.map((id) => [id, 1])));
    mockGetTasteKeywords.mockReset().mockResolvedValue([]);
    mockGetWildPool.mockReset().mockResolvedValue([]);
    mockGetTopicPools
      .mockReset()
      .mockImplementation(async (topicIds: string[]) => poolsFor(topicIds));
    mockMarkSeen.mockReset().mockResolvedValue(undefined);
    mockGetItemsByIds.mockClear();
  });

  it("fetches pools for the planned topics only, and reports how many", async () => {
    const page = await getFeedPage("user-plan");
    expect(mockGetTopicPools).toHaveBeenCalledTimes(1);
    const asked: string[] = mockGetTopicPools.mock.calls[0]![0];
    // These ids have no row in the real TOPIC_GRAPH, so DRIFT and JUMP both "stay on the start
    // topic" and the plan is exactly the picks — which makes the fetched set checkable to the
    // element. (Against the real graph the same three-to-five picks reach ~100 topics; the
    // plan asks for ~40. `bench:feed` prints that number.)
    expect([...asked].sort()).toEqual([...PICKED].sort());
    expect(page.cards).toHaveLength(DEFAULT_KNOBS.pageSize);
    expect(page.debug).toEqual({ plannedTopics: asked.length, fallback: false });
  });

  it("falls back to the reachable superset when the planned pools compose short", async () => {
    // First call: every planned pool is empty. Second call: pools for whatever is asked.
    mockGetTopicPools
      .mockReset()
      .mockImplementationOnce(async (topicIds: string[]) => poolsFor(topicIds, 0))
      .mockImplementation(async (topicIds: string[]) => poolsFor(topicIds));
    const page = await getFeedPage("user-fallback");
    expect(mockGetTopicPools).toHaveBeenCalledTimes(2);
    const first: string[] = mockGetTopicPools.mock.calls[0]![0];
    const second: string[] = mockGetTopicPools.mock.calls[1]![0];
    expect(second.length).toBeGreaterThanOrEqual(first.length);
    for (const id of PICKED) expect(second).toContain(id);
    expect(page.cards).toHaveLength(DEFAULT_KNOBS.pageSize);
    expect(page.debug?.fallback).toBe(true);
  });

  it("same cursor ⇒ same page, through the plan (SPEC §7)", async () => {
    const first = await getFeedPage("user-stable");
    const second = await getFeedPage("user-stable", first.nextCursor);
    const again = await getFeedPage("user-stable", first.nextCursor);
    expect(again.cards.map((c) => c.item.id)).toEqual(
      second.cards.map((c) => c.item.id),
    );
  });

  it("carries no debug field when the gate is off", async () => {
    mockEnv.FEED_DEBUG = false;
    mockEnv.NODE_ENV = "production";
    const page = await getFeedPage("user-quiet");
    expect(page.debug).toBeUndefined();
  });
});
```

Note the weights use ids (`p0`…) that are not in the real `TOPIC_GRAPH`, so CORE draws them and
DRIFT/JUMP fall back to the start topic ("no row") — the plan is small and the test is about the
mechanics, not the graph.

- [ ] **Step 2: Run — expect red**

```bash
bun run test src/server/services/feed.test.ts -t "planned fetch"
```

Expected: the first test fails on `page.debug` being undefined (and `asked.length` may equal the
reachable count); the fallback test fails on `toHaveBeenCalledTimes(2)`.

- [ ] **Step 3: `FeedPage.debug`**

```ts
export interface FeedPage {
  cards: FeedCard[];
  nextCursor?: string;
  /** Only when the dev gate is on (`feedDebugEnabled()`), like every card's `debug`: how many
   *  topic pools the page asked for, and whether the planned fetch composed short and the full
   *  reachable fetch had to be made (09-11-26). `bench:feed` and `probe:feed` read it. */
  debug?: { plannedTopics: number; fallback: boolean };
}
```

- [ ] **Step 4: The orchestration**

In `getFeedPage`, replace from `const rng = mulberry32(hashSeed(`${seed}:${page}`));` through the
`const composed = composePage({ … });` call with:

```ts
  // Two streams from one seed (09-11-26): the topic stream drives tiers and topics, the item
  // stream drives item draws. Fresh instances each time they are handed out — `planTopics` and
  // `composePage` must each start from the stream's beginning, and so must a fallback compose.
  const topicStream = () => mulberry32(hashSeed(`${seed}:${page}`));
  const itemStream = () => mulberry32(hashSeed(`${seed}:${page}:items`));
```

(keep the `debugEnabled`, weights/taste, `knobs`, `graph` lines as they are) and then, in place of
`const distinctTopics = …` through `const composed = composePage({…});`:

```ts
  const eligibility = {
    userId,
    anchor,
    scoreFloor: knobs.scoreFloor,
    excludeIds: prev,
  };
  // One key for both pools: the cursor's own `${seed}:${page}`, which is what makes both samples
  // reproduce byte-for-byte on a refetch (db/feed.ts). At `tierWild: 0` the WILD tier can never
  // be drawn, so its query is skipped entirely.
  const sampleKey = `${seed}:${page}`;
  const wildPool =
    knobs.tierWild > 0 ? await getWildPool({ ...eligibility, sampleKey }) : [];

  const compose = async (topicIds: string[]) => {
    const pools = await getTopicPools(topicIds, { ...eligibility, sampleKey });
    return composePage({
      weights,
      graph,
      pools,
      wildPool,
      rng: topicStream(),
      itemRng: itemStream(),
      knobs,
      tasteKeywords,
      debug: debugEnabled,
    });
  };

  // **Plan, then fetch, then compose** (docs/DESIGN_feed-on-membership.md §4.3). The plan replays
  // the compose's own topic sequence without pools, so the page fetches the ~40 topics it will
  // draw from rather than every topic it *could* reach (~100 of 104 from three picks). Pools come
  // from membership now, which made the every-reachable fetch ~2.8× dearer overnight and would
  // make it grow with every promoted topic; this makes the page's cost a function of page size.
  const planned = [...planTopics({ weights, graph, knobs, rng: topicStream() })];
  let composed = await compose(planned);
  let fallback = false;
  // A short page means the compose ran past the plan's horizon into pools it never fetched — a
  // reader whose picks are all tiny topics, a near-exhausted corpus, CI's empty database. Fetch
  // the superset every page used to fetch and compose again from the streams' beginning; same
  // seed, so the fallback page is as deterministic as the fast one. A healthy reader never
  // takes this path; `bench:feed` counts how often it fires.
  if (composed.length < knobs.pageSize) {
    fallback = true;
    composed = await compose([...reachableTopics(weights, graph)]);
  }
```

`Promise.all` for the two pools is gone; the wild pool is fetched once, ahead, and reused by the
fallback. At the end of the function attach the readout:

```ts
  return {
    cards,
    nextCursor,
    ...(debugEnabled
      ? { debug: { plannedTopics: planned.length, fallback } }
      : {}),
  };
```

Update the function's header comment: point 1 gains the two streams ("`rng` → a topic stream
and an item stream, both from `${seed}:${page}`; see `planTopics`"), and point 3 becomes:
*"Plan first, pools second (09-11-26): `planTopics` replays the compose's topic sequence to learn
which pools the page needs, `getTopicPools` fetches exactly those, and only a short page falls
back to the `reachableTopics` superset every page used to fetch."* Rewrite `reachableTopics`'
own doc comment so its first line reads *"Every topic id `composePage`'s guard loop could possibly
land on — the fallback fetch's set since 09-11-26, and every page's set before that."*

- [ ] **Step 5: Run the unit file and the service integration suite**

```bash
bun run test src/server/services/feed.test.ts
bun run test src/server/services/feed.integration.test.ts
```

Expected: green. The integration suite's 30-item single-topic fixture takes the fallback on its
last pages (the plan's one topic empties) — that is the fallback working, and its exhaustion test
still ends in `nextCursor: undefined`.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/feed.ts src/server/services/feed.test.ts
git commit -m "feat(feed): plan the page's topics, fetch those pools, fall back to the reachable set only when short"
```

---

### Task 6: The after — bench, probe, EXPLAIN, e2e

**Files:**
- Modify: `scripts/bench-feed.ts` (fallback count + planned-topics readout), `scripts/probe-feed.ts:100-131` (a `display` column)

- [ ] **Step 1: bench readouts**

In `scripts/bench-feed.ts`, inside the page loop after `timings.push(…)`:

```ts
  if (page.debug) {
    plannedTopics.push(page.debug.plannedTopics);
    if (page.debug.fallback) fallbacks++;
  }
```

declare `const plannedTopics: number[] = []; let fallbacks = 0;` beside `timings`, and after the
`max` line print:

```ts
if (plannedTopics.length > 0) {
  const avg = plannedTopics.reduce((a, b) => a + b, 0) / plannedTopics.length;
  console.log(`  planned ${avg.toFixed(0)} topics/page (min ${Math.min(...plannedTopics)}, max ${Math.max(...plannedTopics)})`);
  console.log(`  fallback ${fallbacks} of ${timings.length} pages`);
} else {
  console.log("  (no plan readout — FEED_DEBUG is off)");
}
```

Leave measurement 2 (`getTopicPools` across every topic) as it is: it is still the honest "what
would the whole vocabulary cost" number, and the after-number for it *rises* (memberships) —
which is the point of the plan readout beside it.

- [ ] **Step 2: probe column**

In `scripts/probe-feed.ts`, add a column between `topic` and `source` — header `"display".padEnd(16)`,
value `(card.item.topicId ?? "(none)").padEnd(16)` — and count `slotIsNotDisplay++` when
`card.topicId !== null && card.item.topicId !== card.topicId`; print it in the summary as
`cards served under a topic other than their display topic: N of M`. Replace the comment
"The feed never serves an un-homed card (pools exclude them…)" with: *"A topic card's `topicId` is
the SLOT's topic; since 09-11-26 the pools come from membership, so it can differ from the
item's display topic — the `display` column beside it shows when."*

- [ ] **Step 3: Bench and probe, after — same quiet-machine check as Task 1**

```bash
ps aux | grep -E "bun run (ingest|img:warm|dev)|next dev" | grep -v grep
bun run bench:feed --pages 12 2>&1 | tee .cache/bench-after.txt
bun run probe:feed --pages 3 2>&1 | tail -40 | tee -a .cache/bench-after.txt
```

Acceptance (design §7): `getFeedPage` **p50 ≤ 300 ms** and not worse than Task 1's; fallback
≤ 1 of 12; probe pages full, no source above `sourceCap`, and the new summary line > 0. If p50 is
over the bar, run once more before concluding anything; if it is still over, record the number
and stop — that is a finding for Ben, not a reason to tune the horizon.

- [ ] **Step 4: EXPLAIN the planned fetch**

Write `.cache/explain-pools.ts` (gitignored):

```ts
import { sql } from "drizzle-orm";
const { db } = await import("/Users/ben/Dev/ambit/src/server/db/client");
const { getUserTopicWeights } = await import("/Users/ben/Dev/ambit/src/server/db/topics");
const { planTopics, TOPIC_GRAPH, DEFAULT_KNOBS } = await import("/Users/ben/Dev/ambit/src/server/services/feed");
const { mulberry32, hashSeed } = await import("/Users/ben/Dev/ambit/src/server/services/random");
const { SUSPENDED_SOURCES } = await import("/Users/ben/Dev/ambit/src/server/config/suspended-sources");
const userId = process.argv[2]!;
const weights = await getUserTopicWeights(userId);
const topics = [...planTopics({ weights, graph: TOPIC_GRAPH, knobs: DEFAULT_KNOBS, rng: mulberry32(hashSeed("explain:0")) })];
console.log(`${topics.length} planned topics`);
const rows: any = await db.execute(sql`explain (analyze, buffers) with per_source as (
  select it.topic_id, i.id, i.source, row_number() over (partition by it.topic_id, i.source order by md5(i.id || 'explain:0')) as n_src
  from item_topic it join item i on i.id = it.item_id
  where it.topic_id in ${topics} and i.curation_score >= 4 and i.source not in ${SUSPENDED_SOURCES}
    and not exists (select 1 from seen_item s where s.item_id = i.id and s.user_id = ${userId} and s.served_at < now())
), survivors as (select *, row_number() over (partition by topic_id order by md5(id || 'explain:0')) as n from per_source where n_src <= 20)
select * from survivors where n <= 60`);
for (const r of Array.isArray(rows) ? rows : rows.rows) console.log(r["QUERY PLAN"]);
process.exit(0);
```

Run with Ben's user id (`bun run .cache/explain-pools.ts <userId>`; the id is in `bench:feed`'s
first line or `select id from "user" where email = …`). Expected: an `Index Scan` or
`Bitmap Heap Scan` on `idx_item_topic_topic`, and `Execution Time` in the same range as the
bench's pool timing. A `Seq Scan on item_topic` with ~40 topics is a finding — record it in the
log with the plan, do not add an index in this branch.

- [ ] **Step 5: Full checks**

```bash
bun run check
bun run e2e:prod
```

Expected: `check` green bar the known `<details>` row; e2e 51/51. The desktop and phone feed
specs seed through `seedFeedCorpus`, which now writes memberships (Task 2).

- [ ] **Step 6: Commit**

```bash
git add scripts/bench-feed.ts scripts/probe-feed.ts
git commit -m "chore(feed): bench reports planned topics and fallbacks; probe shows slot vs display topic"
```

---

### Task 7: The record

**Files:**
- Modify: `src/server/db/items.ts:184-188`, `.cache/promote-prod.sh`, `SPEC.md:145`, `:517-519`, §9.2 note, `CLAUDE.md` (three phrases), `docs/DESIGN_topic-vocabulary-growth.md:486-500`, `docs/DESIGN_feed-on-membership.md` (status line + measured numbers), `log.md`

- [ ] **Step 1: `drawFromTopic`'s header**

Replace the first sentence of the comment above `drawFromTopic` in `src/server/db/items.ts`:

```ts
/**
 * A weighted-random draw of unseen items whose DISPLAY topic is `topicId`, above `scoreFloor` —
 * weight = drawWeight(...) above. This was the feed's item-pick step (SPEC §9.2) until Phase 7.3
 * moved the feed onto batched pools (db/feed.ts `getTopicPools`), and since 09-11-26 those pools
 * come from `item_topic` membership while this still reads `item.topic_id`: its callers are the
 * wander teaser and the gallery rail, for which a picture's *display* topic is the honest anchor
 * of its neighbourhood. Never similarity-ranked (SPEC §9 — that was the Phase 0.4 failure the
 * whole tiered-topic-drift design replaced).
 */
```

- [ ] **Step 2: `promote-prod.sh` learns `--file`**

In `.cache/promote-prod.sh` (untracked, Ben's), change the tar line's file and the promote line:

```sh
FILE=${1:-docs/topic-proposals.md}
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -cf - "$FILE" \
  | ssh $HOST "docker cp - $C:/app/"
ssh $HOST "docker exec $C sh -c 'grep -c \"^- \\[x\\]\" /app/$FILE'" | sed 's/^/ticked candidates: /'
ssh $HOST "docker exec $C bun run promote:topics --file $FILE --confirm" 2>&1 | tail -30
```

so `sh .cache/promote-prod.sh docs/topic-proposals-round2.md` is round 2's production step.

- [ ] **Step 3: SPEC**

- `SPEC.md:145` (the `topic_id` row): replace "The feed's three TOPIC tiers draw on this column
  until Cut 2b moves them onto the join; `NULL` matches neither `inArray` nor `eq`, so un-homed
  items are invisible to them with no guard." with "**Since 09-11-26 the feed's three TOPIC tiers
  draw on `item_topic` (§5.1a), not this column** — an item is drawable under any topic it is a
  member of, and this column is what the item page, the save toast and the wander rail show. An
  un-homed item has no membership row, so it reaches no topic pool."
- `SPEC.md:517` (Cut 2a note): append "**Done 09-11-26** — `docs/DESIGN_feed-on-membership.md`;
  the `topic_edge` half of Cut 2b stays deferred."
- `SPEC.md:519` (Cut 1 note): change "The item pick and `getTopicPools` still read `item.topic_id`"
  to "`getTopicPools` reads `item_topic` since 09-11-26 (the rail's `drawFromTopic` still reads
  `item.topic_id`)"; the consequences listed for an un-homed item still hold as written.
- §9.2's "Sampled pools" note: add a sibling note:

  > **Pools from membership, fetched to plan (09-11-26).** The sample ranks `item_topic` rows
  > joined to their item, so a topic's pool is its whole membership. And a page fetches pools
  > only for the topics its slot draws will land on: `composePage` draws tiers/topics from one
  > random stream and items from another, so `planTopics` can replay the topic sequence without
  > pools; a page that composes short falls back to the two-hop reachable superset. `pickItem`
  > refuses an id already drawn this page, since one item can be in three pools. Design and
  > measurements in `docs/DESIGN_feed-on-membership.md`.

- §7 (cursor): add one sentence where "same cursor → same page" is promised: "Within one build;
  a deploy that changes the streams or the pools composes a fresh page for a pre-deploy cursor."

- [ ] **Step 4: CLAUDE.md**

Three edits, each a phrase:

- Cut 1 bullet: "the feed still reads `topic_id`, so un-homed items are invisible to it until
  Cut 2 (promotion + moving the feed onto the join)" → "un-homed items reach the feed only as
  WILD cards; **the feed draws on `item_topic` since 09-11-26** (`docs/DESIGN_feed-on-membership.md`)".
- Cut 2a bullet: "(the `topic_edge` table + moving the feed onto the join; not urgent until ~300
  topics)" → "(the `topic_edge` table; the join move shipped 09-11-26, not urgent until ~300 topics)".
- Facets bullet: "an era topic (`19th-century`) whose pool would be empty until Cut 2b" → "an era
  topic (`19th-century`), tag-only by decision".
- Add one bullet after the feed-pool-sampling one:

  > - **The feed draws on membership and fetches to plan — 09-11-26** (design
  >   `docs/DESIGN_feed-on-membership.md`, plan `docs/PLAN_feed-on-membership.md`).
  >   `getTopicPools` samples `item_topic ⋈ item`, so a topic's pool is its whole membership
  >   (`surreal` 3,919 → 26,701 drawable) and a promoted topic is full from its first page.
  >   `composePage` takes a topic stream (`rng`) and an item stream (`itemRng`, default `rng`);
  >   `planTopics` replays the topic sequence without pools and `getFeedPage` fetches ~40 pools
  >   instead of ~100 reachable, falling back to the reachable set only when a page composes
  >   short (`FeedPage.debug` under `FEED_DEBUG` says so; `bench:feed` counts it). `pickItem`
  >   refuses an id already drawn this page. `PoolItem.topicId` is the *pool's* topic; the
  >   display topic (`item.topic_id`) still drives the item page, saves and the rail. Fixtures
  >   must write membership — `db/test-fixtures.ts`'s `insertHomedItems`, and `seedFeedCorpus`
  >   does — or a seeded item is in no pool. **Round 2 of the vocabulary is unblocked:**
  >   `docs/topic-proposals-round2.md` (267 candidates ranked by total, `mine:topics --rank total`),
  >   `promote:topics --file`, and `sh .cache/promote-prod.sh docs/topic-proposals-round2.md`.

- [ ] **Step 5: The two design docs**

- `docs/DESIGN_topic-vocabulary-growth.md:486-500`: after the 09-07 blockquote add:

  > **09-11-26 — the join half shipped after all, for a different reason.** Round 2 of mining
  > found the un-homed lens spent (1,272 of 164k) and the picker needing a vocabulary that only
  > total-frequency mining gives — and a topic promoted that way has a display pool of a handful.
  > The feed now draws on `item_topic` (`docs/DESIGN_feed-on-membership.md`), with the page
  > fetching only its planned topics so the cost stopped scaling with the vocabulary. The
  > `topic_edge` half stays scale-triggered as above.

- `docs/DESIGN_feed-on-membership.md`: change the status line to "**shipped <date>** on
  `feat/feed-on-membership`" and add a "## 9. Measured after" section with Task 1's and Task 6's
  bench lines (p50/p95, planned topics/page, fallbacks, the all-topics pool payload before and
  after) and the `EXPLAIN` verdict.

- [ ] **Step 6: `log.md`**

Extend the 09-11 entry (create `### [[09-11-26 Fri]] — …` under `## 2026-09` if the session that
wrote the plan has not) with `**Shipped:**` (the four parts, one line each), `**Findings:**` (the
before/after numbers; anything the EXPLAIN or the bench said that the design did not predict;
what `/feed` looks like now for Ben's account — the probe's slot≠display count), and
`**Open / next:**` (Ben's feel read on `/feed`; tick round 2; saves bump the display topic — the
follow-up in design §5). End with the session-spend line per CLAUDE.md's instructions (run the
script; omit the line if it exits non-zero).

- [ ] **Step 7: Commit, then hand back**

```bash
bun run check
git add -A
git commit -m "docs: the feed on membership — SPEC, CLAUDE.md, the record"
git log --oneline main..HEAD
```

Do not merge. Ben reads `/feed` and `/dev/feed` on this branch first (design §6, "Feel"), then
merges, deploys, and ticks round 2.

---

## Self-review

**Spec coverage.** §4.1 → Task 3. §4.2 → Task 4 (`itemRng`, default `rng`). §4.3 → Task 4
(`pickSlot`, `planTopics`, `PLAN_HORIZON_PAGES`) + Task 5 (orchestration, fallback, `debug`).
§4.4 → Task 4 (`drawnIds`, WILD included). §5's "stays" list → nothing touches `getWildPool`,
`drawFromTopic` (comment only, Task 7), saves, or the graph. §6 fallback frequency → Task 6
readout. §7 acceptance → Tasks 3 (membership test), 6 (bench, probe, e2e). §8 → Task 7's
`promote-prod.sh` and CLAUDE.md line. Fixtures (design §7, "membership-writing fixtures") → Task 2.

**Placeholders.** None: every code step carries its code; the doc steps quote the sentences.

**Type consistency.** `pickSlot(weights, graph, knobs, rng, coreTopicIds)` is called with the
same five arguments in `composePage` and `planTopics`; `planTopics` takes an options object and
returns `Set<string>` in Tasks 4, 5, 6; `pickItem`'s seventh parameter is `drawnIds` in every call;
`FeedPage.debug` has the two fields `plannedTopics: number` and `fallback: boolean` in Tasks 5 and 6;
`insertHomedItems(db, rows, origin?)` returns `Item[]` and is destructured that way in Task 2 and
called with one row in Task 3.
