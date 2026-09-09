# Feed pool sampling — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-08-26 evening by Fable 5.1, after Ben chose the *plain sample* over a tilted
one. **For:** a cold session on a cheaper model.

**Goal:** `getTopicPools` returns a deterministic per-topic **sample** of eligible items instead
of every eligible item, so a feed page costs O(topics × K) rows instead of O(corpus) — ~6,000
rows instead of 133,698 at today's 122,458-item corpus — with the engine, the knobs and SPEC §7's
"same cursor → same page" promise untouched.

**Architecture:** One query, as now, but with two window functions ranking rows inside each
topic by `md5(id || sampleKey)` — the exact mechanism `getWildPool` already uses — and an outer
filter keeping the first `TOPIC_POOL_SAMPLE` (60) per topic and the first
`TOPIC_POOL_PER_SOURCE` (20) per (topic, source). `sampleKey` is the cursor's `${seed}:${page}`,
already built in `getFeedPage` for the wild pool; it becomes a required option so no caller can
ever fetch the whole corpus by accident. `composePage`, `pickItem`, `weightedPick` receive the
same `Map<topicId, PoolItem[]>` they receive today.

**Tech Stack:** Bun, Drizzle ORM 0.45 over postgres.js, Postgres 17, Vitest (integration tests
self-skip without `DATABASE_URL`).

**Spec:** `docs/DESIGN_feed-pool-sampling.md` — read it first; every number below comes from it.

## Global Constraints

- **`TOPIC_POOL_SAMPLE = 60`**, **`TOPIC_POOL_PER_SOURCE = 20`** — module constants beside
  `WILD_POOL_SIZE` in `src/server/db/feed.ts`, not `FeedKnobs` (knobs are compose-side and
  zod-mirrored in `routers/feed.ts`; these are fetch-side).
- **`sampleKey` is required** on `getTopicPools`' options. Every caller passes one. There is no
  "unsampled" mode.
- **Determinism is the invariant.** Same `topicIds` + same options + same `sampleKey` → identical
  rows in identical order. The outer query ends `ORDER BY topic_id, id`.
- **Every topic id in `topicIds` is a key in the returned Map**, even with zero rows (an empty
  array, never a missing key) — `composePage` depends on it.
- **`eligibilityConditions` is not touched.** The sample is applied *on top of* eligibility, so a
  topic pool and the wild pool still refuse the same things.
- **Measure before and after on the same machine in the same hour.** `bench:feed` and
  `probe:feed` numbers from different hours mean nothing (the bench's own header says so). Record
  both sets in `log.md`.
- **Tests are non-negotiable** (SPEC §12). `bun run check` green before the final commit. The
  five DB-backed integration suites run locally against the dev database
  (`describe.skipIf(!process.env.DATABASE_URL)`); they must be run, not skipped.
- **Commits:** conventional prefixes; end every message with the two attribution lines from the
  session's system reminder (`Co-Authored-By:` and `Claude-Session:`).
- **Comment generously** — Ben is a returning webdev and the repo teaches. A paragraph above the
  thing saying *why*, in the house voice of the surrounding file.
- **Branch:** `feat/feed-pool-sampling` off `main`. Plain branch, no worktree.

---

## File map

| File | Responsibility |
|---|---|
| `scripts/probe-feed.ts` | gains a score summary (mean, p10, share ≥ 9) — the instrument for the trade-off |
| `src/server/db/feed.ts` | `getTopicPools` samples; two new constants; rewritten header comment |
| `src/server/db/feed.integration.test.ts` | new `describe`: caps, determinism, empty-key contract |
| `src/server/services/feed.ts` | `getFeedPage` passes `sampleKey` |
| `scripts/bench-feed.ts`, `src/server/db/items.integration.test.ts`, `src/server/api/routers/routers.integration.test.ts` | pass `sampleKey` (required option) |
| `SPEC.md` §9, `CLAUDE.md`, `docs/DESIGN_feed-pool-sampling.md`, `log.md` | the record |

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
cd /Users/ben/Dev/ambit
git status -sb            # must be clean
git checkout -b feat/feed-pool-sampling
```

---

### Task 1: The instrument, and the baseline

The design's one trade-off — served cards may regress slightly toward the mean score — is
decided by measurement, so the measurement has to exist *before* the change and be taken on the
unchanged code. `probe:feed` prints every card's score but no aggregate; this adds one.

**Files:**
- Modify: `scripts/probe-feed.ts` (the summary block after the page loop, ~line 137)

**Interfaces:**
- Produces: three new summary lines on `bun run probe:feed`: `score mean`, `score p10`,
  `share ≥ 9`.

- [ ] **Step 1: Collect scores in the page loop**

In `scripts/probe-feed.ts`, next to `const topicCounts = new Map<string, number>();` add:

```ts
// Every served card's curation score, for the summary. The pool-sampling change (09-08-26,
// docs/DESIGN_feed-pool-sampling.md) draws from a sample of each topic rather than the whole
// pool, and the one thing that could show is a drift of served scores toward the mean — this
// is what says whether it did.
const scores: number[] = [];
```

Inside `for (const card of page.cards) {`, after `tierCounts[card.tier]++;`, add:

```ts
    scores.push(card.item.curationScore);
```

- [ ] **Step 2: Print the summary**

In the summary block, after the `source-adjacency violations` line, add:

```ts
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  const p10 = sorted[Math.floor(sorted.length * 0.1)]!;
  const topShare = sorted.filter((x) => x >= 9).length / sorted.length;
  console.log(
    `score mean: ${mean.toFixed(2)} · p10: ${p10} · share ≥ 9: ${(topShare * 100).toFixed(0)}%`,
  );
```

- [ ] **Step 3: Run it, and record the baseline**

Run, in this order, on the **unchanged** `getTopicPools`:

```bash
bun run bench:feed --user benjamin.reilly@gmail.com --pages 12
bun run probe:feed --user benjamin.reilly@gmail.com --pages 25 | tail -8
```

Expected shape (numbers will differ — the corpus grows nightly):

```
getFeedPage   p50 ~150–220 ms   p95 ~220–300 ms
getTopicPools rows ~130,000    payload ~22 MB
score mean: 8.xx · p10: 7 · share ≥ 9: xx%
```

Paste both outputs verbatim into a scratch file — `.cache/pool-sampling-before.txt` — they go
into `log.md` in Task 4. **Note the time of day.** Both scripts spend `seen_item` rows for the
user they run as (a page served is a page spent); that is fine for this account and is why the
"after" run in Task 4 uses the same user and page counts.

- [ ] **Step 4: Typecheck and commit**

```bash
bun run typecheck
git add scripts/probe-feed.ts
git commit -m "feat(probe): score mean / p10 / share≥9 in the feed probe's summary"
```

---

### Task 2: `getTopicPools` samples per topic

**Files:**
- Modify: `src/server/db/feed.ts` (`getTopicPools`, ~lines 42–117; constants beside
  `WILD_POOL_SIZE` ~line 165; `getWildPool`'s comment ~line 172)
- Modify: `src/server/db/feed.integration.test.ts` (new `describe` at the end of the file)
- Modify: `src/server/services/feed.ts` (`getFeedPage`, the `Promise.all` ~line 665)
- Modify: `scripts/bench-feed.ts` (~line 100), `src/server/db/items.integration.test.ts`
  (~line 348), `src/server/api/routers/routers.integration.test.ts` (~lines 1097–1098)

**Interfaces:**
- Produces: `getTopicPools(topicIds: string[], opts: { userId; anchor; scoreFloor; excludeIds;
  sampleKey: string }): Promise<Map<string, PoolItem[]>>` — `sampleKey` new and required;
  `TOPIC_POOL_SAMPLE = 60`, `TOPIC_POOL_PER_SOURCE = 20` exported.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/server/db/feed.integration.test.ts` (it already imports `inArray`, `nanoid`,
`getTopicPools`, and the vitest globals; add `TOPIC_POOL_PER_SOURCE, TOPIC_POOL_SAMPLE` to the
`./feed` import):

```ts
// The topic pools sample (09-08-26, docs/DESIGN_feed-pool-sampling.md). Every property here is
// SQL — two window functions and an md5 ordering — so a mocked test would be checking a mock.
// What matters: no topic returns more than TOPIC_POOL_SAMPLE rows, no (topic, source) more than
// TOPIC_POOL_PER_SOURCE, the sample is a pure function of `sampleKey` (SPEC §7's cursor promise
// rides on it), and a topic with nothing eligible is still a key with an empty array.
describe.skipIf(!process.env.DATABASE_URL)(
  "getTopicPools sampling (integration)",
  () => {
    const topicId = `test-sample-topic-${nanoid(8)}`;
    const emptyTopicId = `test-sample-empty-${nanoid(8)}`;
    const userId = `test-sample-user-${nanoid(8)}`;
    const prefix = `test-sample-${nanoid(8)}-`;
    // Four sources × 30 rows = 120 eligible. The per-source cap (20) binds first → 80, then
    // the per-topic cap (60) binds → 60. Both caps are therefore exercised by one seed.
    const SOURCES = ["met", "aic", "cma", "wellcome"] as const;
    const PER_SOURCE = 30;

    const base = () => ({
      userId,
      anchor: new Date(),
      scoreFloor: 1,
      excludeIds: [] as string[],
    });

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      await db.insert(topic).values([
        {
          id: topicId,
          label: "Test sample topic",
          seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
        },
        {
          id: emptyTopicId,
          label: "Test sample empty topic",
          seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
        },
      ]);
      await db.insert(user).values({
        id: userId,
        name: "Test sample user",
        email: `${userId}@example.com`,
        emailVerified: false,
      });
      await db.insert(item).values(
        SOURCES.flatMap((source, s) =>
          Array.from({ length: PER_SOURCE }, (_, i) => ({
            source,
            sourceId: `${prefix}${s}-${i}`,
            type: "image" as const,
            title: `Sample item ${source} ${i}`,
            sourceUrl: `https://example.com/${prefix}${s}-${i}`,
            imageUrl: `https://example.com/${prefix}${s}-${i}.jpg`,
            topicId,
            curationScore: 9,
            aestheticTags: [],
          })),
        ),
      );
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      const rows = await db.query.item.findMany({
        where: (t, { like }) => like(t.sourceId, `${prefix}%`),
        columns: { id: true },
      });
      if (rows.length > 0) {
        await db.delete(item).where(
          inArray(
            item.id,
            rows.map((r) => r.id),
          ),
        );
      }
      await db.delete(user).where(inArray(user.id, [userId]));
      await db.delete(topic).where(inArray(topic.id, [topicId, emptyTopicId]));
    });

    it("caps a topic at TOPIC_POOL_SAMPLE and each source within it at TOPIC_POOL_PER_SOURCE", async () => {
      const pools = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:0",
      });
      const pool = pools.get(topicId)!;
      expect(pool).toHaveLength(TOPIC_POOL_SAMPLE);

      const bySource = new Map<string, number>();
      for (const row of pool) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
      for (const source of SOURCES) {
        expect(bySource.get(source) ?? 0).toBeLessThanOrEqual(TOPIC_POOL_PER_SOURCE);
      }
      // 60 from four sources capped at 20 each: no source can be shut out, so all four appear.
      expect(bySource.size).toBe(SOURCES.length);
    });

    it("is a pure function of sampleKey — same key, same rows, same order", async () => {
      const a = await getTopicPools([topicId], { ...base(), sampleKey: "sample-test:1" });
      const b = await getTopicPools([topicId], { ...base(), sampleKey: "sample-test:1" });
      expect(b.get(topicId)!.map((r) => r.id)).toEqual(a.get(topicId)!.map((r) => r.id));

      const c = await getTopicPools([topicId], { ...base(), sampleKey: "sample-test:2" });
      // 60 of 120 under a different hash: the two sets differing is what "the next page gets
      // fresh candidates" means, and identical sets would be a broken hash, not luck.
      expect(new Set(c.get(topicId)!.map((r) => r.id))).not.toEqual(
        new Set(a.get(topicId)!.map((r) => r.id)),
      );
    });

    it("keeps every requested topic as a key, an empty array for one with nothing eligible", async () => {
      const pools = await getTopicPools([topicId, emptyTopicId], {
        ...base(),
        sampleKey: "sample-test:3",
      });
      expect(pools.has(emptyTopicId)).toBe(true);
      expect(pools.get(emptyTopicId)).toEqual([]);
      expect(pools.get(topicId)!.length).toBeGreaterThan(0);
    });

    it("still refuses what eligibility refuses — a seen row never enters the sample", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const first = await getTopicPools([topicId], { ...base(), sampleKey: "sample-test:4" });
      const victim = first.get(topicId)![0]!.id;
      const before = new Date(Date.now() - 60_000);
      await db.insert(seenItem).values({ userId, itemId: victim, servedAt: before });
      try {
        const after = await getTopicPools([topicId], {
          ...base(),
          anchor: new Date(),
          sampleKey: "sample-test:4",
        });
        expect(after.get(topicId)!.map((r) => r.id)).not.toContain(victim);
        // Still a full sample: the cap applies after eligibility, so one exclusion is backfilled.
        expect(after.get(topicId)).toHaveLength(TOPIC_POOL_SAMPLE);
      } finally {
        await db.delete(seenItem).where(inArray(seenItem.userId, [userId]));
      }
    });
  },
);
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run vitest run src/server/db/feed.integration.test.ts`
Expected: FAIL — `TOPIC_POOL_SAMPLE` is not exported, and the first test would get 120 rows.
(If it reports *skipped*, `DATABASE_URL` is not set in `.env` — stop; these tests must run.)

- [ ] **Step 3: The constants and the query**

In `src/server/db/feed.ts`, add `lte` to the `drizzle-orm` import list (it already has `sql`).

Beside `export const WILD_POOL_SIZE = 200;` add:

```ts
/**
 * How many eligible rows one page's draws see per topic, and per (topic, source) within that
 * (09-08-26, docs/DESIGN_feed-pool-sampling.md). Before this, `getTopicPools` returned *every*
 * eligible row in every reachable topic — and `reachableTopics` (services/feed.ts) reaches
 * 101 of 104 topics from three picks, so every page dragged the whole corpus out of Postgres:
 * 133,698 rows / 22.4 MB at 122,458 items, and the dev server materialising that per request
 * grew to 2.6 GB in eight page loads. Sixty is generous: a page draws at most twelve cards and
 * rarely hits one topic more than four times, and `pickItem` still has room to reject most of a
 * sample for `sourceCap` / `lastSource` and find a card.
 *
 * The per-source cap is the diversity rule applied where it is cheapest. A blog-captured topic
 * (`illustration` is ~17,500 items, most from one blog) would otherwise fill its sixty with one
 * source and hand `pickItem` a sample `sourceCap` empties after three; twenty per source means
 * a topic's minority sources are always candidates. Not `FeedKnobs`: those are compose-side.
 */
export const TOPIC_POOL_SAMPLE = 60;
export const TOPIC_POOL_PER_SOURCE = 20;
```

Replace the body of `getTopicPools` (keep the signature's shape, add `sampleKey`):

```ts
export async function getTopicPools(
  topicIds: string[],
  opts: {
    userId: string;
    anchor: Date;
    scoreFloor: number;
    excludeIds: string[];
    /** `${seed}:${page}` from the cursor — what makes the sample a pure function of the page. */
    sampleKey: string;
  },
): Promise<Map<string, PoolItem[]>> {
  const pools = new Map<string, PoolItem[]>();
  for (const topicId of topicIds) pools.set(topicId, []);
  if (topicIds.length === 0) return pools;

  const { db } = await import("./client");

  // Rank every eligible row inside its topic (and inside its (topic, source)) by a hash of its
  // id and the page's key. `md5(id || key)` rather than `random()` for the same reason as
  // `getWildPool`: SPEC §7 promises a refetched cursor returns the same page, and a random()
  // sample would give a different one each time. The eligibility clauses are the shared
  // `eligibilityConditions`, applied *inside* the ranking, so a row that eligibility refuses is
  // never counted toward a cap — an exclusion is backfilled, not a hole in the sample.
  const ranked = db
    .select({
      id: item.id,
      topicId: item.topicId,
      source: item.source,
      curationScore: item.curationScore,
      aestheticTags: item.aestheticTags,
      n: sql<number>`row_number() over (partition by ${item.topicId} order by md5(${item.id} || ${opts.sampleKey}))`.as(
        "n",
      ),
      nSrc: sql<number>`row_number() over (partition by ${item.topicId}, ${item.source} order by md5(${item.id} || ${opts.sampleKey}))`.as(
        "n_src",
      ),
    })
    .from(item)
    .where(and(inArray(item.topicId, topicIds), ...eligibilityConditions(db, opts)))
    .as("ranked");

  // `ORDER BY topic_id, id` is load-bearing, not cosmetic: `composePage`'s `weightedPick` walks
  // each pool's array in order, so the stable-page promise also depends on the *order* being
  // the same every time — and Postgres guarantees none without an explicit ORDER BY.
  const rows = await db
    .select({
      id: ranked.id,
      topicId: ranked.topicId,
      source: ranked.source,
      curationScore: ranked.curationScore,
      aestheticTags: ranked.aestheticTags,
    })
    .from(ranked)
    .where(
      and(
        lte(ranked.n, TOPIC_POOL_SAMPLE),
        lte(ranked.nSrc, TOPIC_POOL_PER_SOURCE),
      ),
    )
    .orderBy(asc(ranked.topicId), asc(ranked.id));

  for (const row of rows) {
    // Unreachable in practice — the `inArray(topicId, …)` above cannot match a NULL — but the
    // projection is typed `string | null` because the column is, and a `!` here would hide the
    // day this ever changes.
    if (row.topicId === null) continue;
    pools.get(row.topicId)?.push({ ...row, topicId: row.topicId });
  }
  return pools;
}
```

- [ ] **Step 4: Rewrite the header comment above `getTopicPools`**

Replace the whole `/** … */` block above the function (the one beginning "One SELECT per page,
not one per topic") with:

```ts
/**
 * One SELECT per page, not one per topic (SPEC §9's "slot plan first, pools second" — see
 * services/feed.ts's `getFeedPage`): for every id in `topicIds`, a deterministic **sample** of
 * the items above `scoreFloor` that this user hasn't been served before `anchor`
 * (`seen_item.served_at < anchor` — a strict `<`, deliberately not `<=`; see schema.ts's comment
 * on `seenItem.servedAt` for why), excluding `excludeIds` (the previous page's own item ids — a
 * separate guard because they share `anchor` exactly). Rides `idx_item_topic_score` for the
 * `IN (...) AND curationScore >=` half of the filter.
 *
 * Returns a Map keyed by every id in `topicIds` (even ones with zero eligible items — an empty
 * array, not a missing key) so services/feed.ts's `composePage` can do a plain `.get(topicId)`
 * without a null-vs-missing distinction to worry about.
 *
 * **A sample, not the pool** (09-08-26, docs/DESIGN_feed-pool-sampling.md). This used to return
 * every eligible row — a projection of five columns (Phase 7.3), which was the right fix when
 * the corpus was 9,848 rows and the weight was the `body` column. At 122,458 rows the *count* is
 * the cost: `reachableTopics` reaches 101 of 104 topics from three picks, so a page fetched
 * 133,698 rows / 22.4 MB and the process paid for materialising them (2.6 GB of dev-server RSS
 * in eight loads; a one-row insert stalling 1.7 s behind a compose). Now each topic contributes
 * at most `TOPIC_POOL_SAMPLE` rows, at most `TOPIC_POOL_PER_SOURCE` per source, chosen by
 * `md5(id || sampleKey)` — the same cursor-keyed hash `getWildPool` has used since 09-06-26 —
 * so a page costs O(topics × 60) whatever the corpus does. Postgres still scans every eligible
 * row to rank it (md5 over ~130k rows is milliseconds); what stops crossing the wire is the
 * other 95 %.
 *
 * The one thing this changes for the reader: `pickItem`'s curated-weighted draw runs over the
 * sample rather than the whole pool, so a top-scored item in a topic of thousands has to be in
 * the sixty first. `bun run probe:feed`'s score summary is what says whether that shows; the
 * design doc has the escalation (a score-tilted sample) if it does.
 *
 * The ~12 winners are re-fetched whole afterwards, by id, in one query (`getItemsByIds` →
 * `getFeedPage`) — twelve full rows instead of six thousand.
 */
```

- [ ] **Step 5: Point the wild pool's comment at the new state**

In `getWildPool`'s comment, the bullet beginning "not the whole set, because loading every
un-homed row per request is exactly the 9,848-rows-and-35.8-MB-per-page problem Phase 7.3
fixed in getTopicPools above" — change its tail to:

```
 *  - not the whole set, because loading every un-homed row per request is exactly the
 *    whole-corpus-per-page problem `getTopicPools` had until 09-08-26 (it now samples the same
 *    way — see its header), and a walk of a tagless picture blog can add tens of thousands of
 *    un-homed rows in one night;
```

- [ ] **Step 6: Every caller passes a `sampleKey`**

`src/server/services/feed.ts`, in `getFeedPage`'s `Promise.all` — hoist the key and pass it to
both pools:

```ts
  // Two pools, one round trip, one key. `sampleKey` is the cursor's own `${seed}:${page}`, which
  // is what makes both samples reproduce byte-for-byte on a refetch (db/feed.ts). At
  // `tierWild: 0` the WILD tier can never be drawn, so its query is skipped entirely.
  const sampleKey = `${seed}:${page}`;
  const [pools, wildPool] = await Promise.all([
    getTopicPools(distinctTopics, { ...eligibility, sampleKey }),
    knobs.tierWild > 0
      ? getWildPool({ ...eligibility, sampleKey })
      : Promise.resolve([]),
  ]);
```

(Delete the old five-line comment above the `Promise.all` — this one replaces it.)

`scripts/bench-feed.ts` ~line 100 — add `sampleKey: "bench:0",` to the options object.

`src/server/db/feed.integration.test.ts` ~line 82 (the existing suspended-source test) — add
`sampleKey: "pools-test:0",` to the options.

`src/server/db/items.integration.test.ts` ~line 348 — add `sampleKey: "items-integration:0",`.

`src/server/api/routers/routers.integration.test.ts` ~line 1093 — add
`sampleKey: "routers-test:0",` to the shared `opts` object.

- [ ] **Step 7: Run the tests that touch this, then typecheck**

```bash
bun run vitest run src/server/db/feed.integration.test.ts src/server/db/items.integration.test.ts src/server/services/feed.integration.test.ts src/server/api/routers/routers.integration.test.ts src/server/services/feed.test.ts
bun run typecheck
```

Expected: PASS, and typecheck clean. `services/feed.integration.test.ts`'s cursor-stability
test is the SPEC §7 guarantee and must pass **unchanged** — if it fails, the sample is not
deterministic; check that both `row_number()` windows order by the same `md5(...)` expression
and that the outer `ORDER BY` is present. `feed.test.ts` (the pure engine) mocks `getTopicPools`
by implementation, not by exact arguments, so it needs no edit.

- [ ] **Step 8: Commit**

```bash
git add src/server/db/feed.ts src/server/db/feed.integration.test.ts src/server/services/feed.ts scripts/bench-feed.ts src/server/db/items.integration.test.ts src/server/api/routers/routers.integration.test.ts
git commit -m "feat(feed): getTopicPools samples 60 per topic, 20 per source — O(topics), not O(corpus)"
```

---

### Task 3: The after — bench, probe, and the dev-server test

**Files:** none modified; this task produces numbers for Task 4.

- [ ] **Step 1: Bench and probe, same user, same page counts as Task 1**

```bash
bun run bench:feed --user benjamin.reilly@gmail.com --pages 12
bun run probe:feed --user benjamin.reilly@gmail.com --pages 25 | tail -8
```

Expected: `getTopicPools` rows in the low thousands (≤ 101 × 60), payload well under 1 MB;
`getFeedPage` p50 lower than the baseline. Paste both outputs into
`.cache/pool-sampling-after.txt`.

- [ ] **Step 2: Judge the score summary**

Compare `score mean`, `p10` and `share ≥ 9` against `.cache/pool-sampling-before.txt`. Both runs
spend different pages of the same account, so expect noise of a few hundredths on the mean.
**If `share ≥ 9` drops by more than ~5 points or `p10` drops by a whole point, stop and report** —
that is the design's trade-off showing, and its escalation (a score-tilted sample) is Ben's
decision, not this plan's. Otherwise record the numbers and continue.

- [ ] **Step 3: The dev-server test**

```bash
lsof -ti:3000 | xargs kill 2>/dev/null; sleep 2
bun run dev &
sleep 8
```

Then load `/feed` eight times signed in (the browser is fine; a fresh `bun run invite <email>`
+ sign-up if there is no local account). Read the server's `feed.page took … ms` lines and the
process's RSS:

```bash
ps -o rss= -p $(lsof -ti:3000 | head -1) | awk '{printf "%.0f MB\n", $1/1024}'
```

Expected: `feed.page` no longer alternating into multi-second loads, and RSS growing by far less
than the ~300 MB per load the design measured. Note both. Stop the dev server afterwards.

---

### Task 4: The record

**Files:**
- Modify: `SPEC.md` §9 (the "Item pick" bullet, ~line 498)
- Modify: `CLAUDE.md` (the paragraph beginning "**7.3's feed-performance win has been outrun…**")
- Modify: `docs/DESIGN_feed-pool-sampling.md` (the `**Status:**` line)
- Modify: `log.md` (today's entry)

- [ ] **Step 1: SPEC §9**

In the "Item pick" bullet, after the sentence ending "that was the 0.4 failure.", add:

```
   > **Sampled pools (09-08-26).** The draw runs over a deterministic per-topic *sample* of the
   > eligible pool — 60 per topic, 20 per (topic, source), keyed by `md5(id || '<seed>:<page>')`
   > exactly as the WILD pool is — not over every eligible row. The weight formula is unchanged
   > and still applied in `pickItem`; only the candidate set is bounded. Design and measurements
   > in `docs/DESIGN_feed-pool-sampling.md`.
```

- [ ] **Step 2: `CLAUDE.md`**

Replace the paragraph beginning "**7.3's feed-performance win has been outrun by corpus
growth…**" (it ends "…not a current fact.") with:

```
**Feed pools are sampled as of 09-08-26** (`docs/DESIGN_feed-pool-sampling.md`, plan
`docs/PLAN_feed-pool-sampling.md`): `getTopicPools` returns at most 60 rows per topic and 20 per
(topic, source), chosen by the same cursor-keyed `md5` the WILD pool uses, so a page costs
O(topics × 60) rows whatever the corpus does. Before this, `reachableTopics` (two graph hops from
the user's picks) reached 101 of 104 topics and every page pulled the whole corpus —
133,698 rows / 22.4 MB at 122,458 items; the query itself was only ~175 ms, but the dev server
materialising it grew to 2.6 GB in eight page loads and stalled unrelated requests for seconds.
`bun run bench:feed` and `bun run probe:feed`'s score summary are the before/after. The 22 ms in
the 7.3 sentence above was measured against 9,848 rows.
```

- [ ] **Step 3: The design doc's status line**

Change `**Status:** proposal. Ben decides; an executable plan follows the decision.` to
`**Status:** shipped 09-08-26 as the plain sample (Ben's call); plan `docs/PLAN_feed-pool-sampling.md`.`

- [ ] **Step 4: `log.md`**

Extend today's `### [[09-08-26 Tue]]` entry with a block after the Fable corroboration block:

```
---

**Feed pool sampling shipped** (`feat/feed-pool-sampling`). The plain sample, per Ben's call.

**Shipped:** `getTopicPools` returns ≤ 60 rows per topic and ≤ 20 per (topic, source), ranked
by `md5(id || sampleKey)` in two window functions inside the one existing query; `sampleKey` is
now a required option and `getFeedPage` passes the cursor's `${seed}:${page}` to both pools.
Engine untouched. Four integration tests: both caps bind, same key → same rows in the same
order, different key → different set, a topic with nothing eligible is still an empty-array key,
and a seen row is backfilled rather than leaving a hole. `probe:feed` gained a score summary.

**Measured (same machine, same user, <paste the time window>):**
- before — `<paste .cache/pool-sampling-before.txt>`
- after — `<paste .cache/pool-sampling-after.txt>`
- dev server, eight loads — `<feed.page timings; RSS before/after>`

**Decisions:** plain sample, not tilted — measure first (Ben, 09-08 evening). `<state whether
the score summary moved, and by how much>`

**Open / next:** merge is Ben's call. Production draws from the same corpus, so this goes out
with the next deploy.
```

Fill the four `<…>` slots from Task 1 Step 3 and Task 3 — they are the only placeholders in
this plan and they exist because the numbers do not exist until the tasks run. End with the
session-spend line per `CLAUDE.md`'s recipe; omit it if the script exits non-zero.

- [ ] **Step 5: Full check, and commit**

```bash
bun run check
git add SPEC.md CLAUDE.md docs/DESIGN_feed-pool-sampling.md log.md
git commit -m "docs: feed pool sampling — SPEC §9, CLAUDE.md, design status, log with before/after"
```

Expected: typecheck, lint, format and the unit suite all green (the five DB-backed suites run
locally because `.env` has `DATABASE_URL`).

Then stop. Merging `feat/feed-pool-sampling` into `main` is Ben's call.

---

## Self-review

- **Spec coverage.** Design §"The proposal" → Task 2 (query, constants, caps, determinism,
  outer order, engine untouched, key threaded). §"The one trade-off" → Task 1 (instrument +
  baseline) and Task 3 Step 2 (judgement with a stop condition). §"Tests the plan would carry" →
  Task 2 Step 1 (all four properties), Task 2 Step 7 (cursor-stability unchanged), Task 3
  (bench before/after, dev-server repeat). §"Why it matters" → Task 4's SPEC/CLAUDE.md wording.
- **Types.** `sampleKey: string` required in Task 2's signature; every caller in Step 6 passes a
  string literal or the hoisted `sampleKey`. `TOPIC_POOL_SAMPLE` / `TOPIC_POOL_PER_SOURCE` are
  exported in Step 3 and imported by the tests in Step 1. `lte` is added to the import in Step 3
  and used in the outer `where`. `ranked.n` / `ranked.nSrc` are the `.as("n")` / `.as("n_src")`
  aliases and are never selected in the outer query, so postgres.js's bigint-as-string never
  reaches JS.
- **Known soft spots for the executor.** (a) The query shape in Task 2 Step 3 — `sql<number>`
  window columns aliased with `.as()`, a `.as("ranked")` subquery, `lte(ranked.n, …)` in the
  outer `where` — was smoke-tested read-only against the dev database on 09-08-26 under Drizzle
  0.45: it compiles, runs (152 rows for three topics in 148 ms), binds both caps, and returns
  byte-identical rows on a second call. Copy it as written. (b) The determinism test's "different key → different set" asserts on 60-of-120; the
  probability of two md5 orderings agreeing on the same sixty is nil, not small. (c) The four
  `sampleKey` call-site edits are what typecheck enforces; if it reports a fifth caller, it was
  added after this plan — give it a literal key and move on.
