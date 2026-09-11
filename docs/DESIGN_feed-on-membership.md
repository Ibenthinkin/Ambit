# The feed on membership — design

**Written:** 09-11-26 by Fable 5.1, from the finding that opened the topic-mining round 2 (below).
**Status:** approved by Ben 09-11-26 ("approach 2, might as well go all the way"); plan
`docs/PLAN_feed-on-membership.md`. **Shipped 09-11-26 on `feat/feed-on-membership`** — not
merged: Ben reads `/feed` on the branch first (§6, "Feel"). Measured in §9, which is where one
acceptance line (§7, "not worse than before") is recorded as missed. This is the half of Cut 2b that moves the feed onto
`item_topic`. The other half — the `topic_edge` table — stays deferred, for the reason
`docs/DESIGN_topic-vocabulary-growth.md` §11 gives (it is a scale trigger at ~300 topics, and
nothing here changes that arithmetic).

## 1. Why now

Round 2 of topic mining was meant to give the pickers a richer vocabulary — Ben's desktop review
called every facet "far too limited". The mining lens Cut 2a built ranks a tag by how many
**un-homed** items it would rescue, and that lens is spent: the corpus is 99% homed.

| | |
|---|---|
| Items locally (09-11-26) | 164,423 |
| Un-homed (`topic_id IS NULL`) | 1,272 |
| Candidates by un-homed count, default floors | 10 |
| Candidates by **total** count, ≥300 items on ≥3 sources (`mine:topics --rank total`) | 267 |

The total-ranked list is the vocabulary Ben asked for (`spaceship` 4,409 items, `folk art`
1,775, `street photography` 752, …). But promoting any of it today gives the picker an empty
topic: `promote:topics` sets `item.topic_id` only where it is NULL, and the feed draws only on
`item.topic_id`. `spaceship` would have a display pool of **one** item. Every one of the 267 is
like that. So the vocabulary cannot grow until the feed draws from membership.

## 2. What the join changes — and it is not only the new topics

`item_topic` holds 459,499 rows over 163,148 items; 116,521 items carry exactly three
memberships. A topic's *membership* pool is very different from its *display* pool:

| topic | display (`topic_id`) | membership |
|---|---|---|
| `surreal` | 3,919 | 26,701 |
| `color` | 245 | 7,525 |
| `black-and-white` | 58 | 5,983 |
| `emotions` | 51 | 2,492 |
| `books` | 2,918 | 16,512 |
| `illustration` | 38,139 | 79,145 |

Two consequences to hold in mind. **An item can be drawn under any of its topics**, which is the
Cut 1 principle finally reaching the feed. And **the feel of `/feed` changes before a single
proposal is ticked** — a topic slot's candidates are everything the curator (or a source, or a
promotion) tagged with that topic, not the items whose first honest home it was. Topic *choice*
per slot is unchanged (tier draw → weights → graph walk); only which items fill the slot moves.
The memberships that could have made this ugly were already dealt with: `MAX_TOPICS` /
`trim:memberships` capped curator rows at three, and `repair:periods` emptied `19th-century` of
the Soviet 1980s.

## 3. Measured: the join alone is too slow, and round 2 makes it slower

`getTopicPools` today ranks every eligible `item` row in the reachable topics (~100 of 104 from
any three picks) by `md5(id || key)` inside two window functions. On the join the same shape
ranks every eligible *membership* row instead. Measured 09-11-26 on the Mac, other work running
(treat as ±30%):

| query | rows the windows rank | time |
|---|---|---|
| today, `item.topic_id`, 100 topics | 164k | ~150 ms |
| join, same two-stage sampling, 100 topics | 451k | ~400 ms (sort spills to disk at 4 MB `work_mem`; 64 MB saves ~40 ms, no more) |
| join, 34 topics | ~150k | ~190 ms |

SPEC §4's bar is p50 under 300 ms for the page. And the join's cost is proportional to
*memberships in reachable topics*, which round 2 grows twice: 267 promoted topics add roughly
300k `tag`-origin rows, and the reachable set becomes ~370 topics. Extrapolated, ~700 ms. A
narrower sort payload and `hashtextextended` instead of `md5` were tried and lost in the noise.

So the query cannot stay O(reachable vocabulary). **The engine fetches pools for ~100 topics and
draws from at most twelve.** That is the fat to cut, and cutting it makes the page cost a function
of page size rather than vocabulary size — which is the property the whole vocabulary-growth
principle needs from the feed.

## 4. The design, in four parts

### 4.1 Pools on the join

`getTopicPools` ranks `item_topic ⋈ item` instead of `item`. Everything else about it holds:
the two-stage sample (20 per (topic, source) **first**, then 60 per topic — the composition
argument in `db/feed.ts` is untouched and still applies, per membership row), `eligibilityConditions`
applied inside the ranking, `md5(item.id || sampleKey)` for cursor determinism, `ORDER BY
topic_id, id`, every requested topic a key in the returned Map.

`PoolItem.topicId` changes meaning: it is **the pool this row was fetched for**
(`item_topic.topic_id`), no longer the item's display topic. `composePage` already serves a
card under the *slot's* topic, so nothing downstream changes; the doc comment does.

`item.topic_id` is **not dropped**. It stays the display topic: the item page's facts row, the
save toast's "bumped Ceramics", the wander rail's neighbourhood, the Because tile's label
resolution. `getWildPool` is unchanged (`topic_id IS NULL`); "un-homed" and "no membership"
agree to within three rows, all of them test leftovers (`test-wild-topic-*`).

### 4.2 Two random streams

`composePage` draws tiers, topics and items from one `rng`. Because `pickItem` consumes it,
the *topic* sequence of a page cannot be known without the pools — which is why `getFeedPage`
fetches every reachable topic. The fix is to give the item draws their own stream:

- `rng` (existing option) becomes the **topic stream**: tier draws, `pickCore` / `pickDrift` /
  `pickJump`.
- `itemRng` (new, optional; defaults to `rng`) is the **item stream**: every `pickItem`,
  including WILD's.

With the default, `composePage` is byte-for-byte what it was — every existing unit test keeps
its meaning. `getFeedPage` passes two streams, `mulberry32(hashSeed(`${seed}:${page}`))` and
`mulberry32(hashSeed(`${seed}:${page}:items`))`. The property this buys: **the sequence of
(tier, topic) picks is a pure function of weights, graph, knobs and the topic stream** —
`topicCounts` (the cap) is the only state, and the cap check happens *after* the pick has
consumed the stream, so a capped or empty slot consumes exactly what a filled one does.

### 4.3 Plan, then fetch, then compose

`planTopics(weights, graph, knobs, topicRng, coreTopicIds, horizon)` runs the guard loop's
tier+topic half for `horizon` iterations, **assuming every draw succeeds** (so `topicCounts`
advances on every non-capped pick), and returns the distinct topic ids it landed on. WILD
iterations consume the tier draw and contribute nothing. `horizon = pageSize × 5` (60):
a page needs twelve successes, and the slack covers capped and empty slots.

`getFeedPage` then:

1. `planned = planTopics(…, mulberry32(hashSeed(`${seed}:${page}`)))` — a fresh stream with the
   same seed as the one `composePage` will be handed, so the plan's sequence *is* the compose's
   sequence, index for index, for as long as the compose's assumptions hold.
2. `pools = getTopicPools([...planned], …)` — ~30–45 topics instead of ~100 today, and instead
   of ~370 after round 2.
3. `composePage({ pools, rng: topicStream, itemRng: itemStream, … })`. A pick outside `planned`
   can only happen after iteration 60 (the compose diverges from the plan only when a draw
   fails, and then only by running *longer*); it finds no key in `pools`, which `pickItem`
   already treats as an empty pool.
4. **Fallback:** if the page composed short (`cards.length < knobs.pageSize`), fetch
   `reachableTopics(weights, graph)` — today's superset — and compose again with fresh streams.
   Same seed, so the fallback page is as deterministic as the fast one. This is the near-exhausted
   corpus's path and the empty-fixture CI database's path; a healthy reader never takes it.

Why not a second, incremental fetch of only the missing topics: it needs the compose to stop and
resume mid-loop, which turns a pure function into a state machine for a case that is measured in
pages per reader per corpus lifetime. The fallback re-fetch costs what today's every page costs.

### 4.4 No item twice on a page

An item with three memberships can be in three of the fetched pools. `composePage` splices a
drawn item out of *its* pool only. `pickItem` gains a `drawnIds: ReadonlySet<string>` filter,
applied first, alongside `cappedSources` — a hard filter, like the cap. (The WILD pool cannot
overlap a topic pool — un-homed rows have no membership — but the filter is applied there too,
because a rule with an exception is a bug waiting.)

## 5. What this does not do

- **No `topic_edge` table.** The graph stays `topic-graph.json`; `graph:rebuild` still writes it.
- **`item.topic_id` stays**, as above. Dropping it is a separate decision with a migration behind it.
- **`drawFromTopic` (`db/items.ts`) stays on the display topic.** Its callers are the wander
  teaser and the gallery rail — a picture's *neighbourhood*, for which the display topic is the
  honest anchor. Its header comment, which still calls it "the feed's item-pick step", is corrected.
- **Saves still bump the display topic.** A card served under `surreal` whose display topic is
  `illustration` bumps `illustration` when saved, because `saves.add` knows the item, not the
  slot. Recorded as a follow-up; the fix is a `topicId` on the save input, which is a client change.
- **No knob.** The horizon is a module constant; the fallback is not a switch.

## 6. Risks, named

- **Feel.** §2. Ben reads `/feed` and `/dev/feed`'s readouts after the merge and before ticking
  round 2. The original/grown/wild split is by slot topic and does not move; what moves is *which
  pictures* a grown look-topic shows.
- **Cursor continuity across the deploy.** A cursor minted before the deploy composes a different
  page after it (the streams and the pools both changed). SPEC §7's promise is within one build;
  a reader mid-scroll at deploy time sees a fresh page 2, not an error.
- **The plan's horizon is a bet** (60 iterations cover 48 failures). If a reader's picks are all
  tiny topics, the compose runs past 60, meets unfetched pools, composes short, and takes the
  fallback — correct, one extra round trip. `bench:feed` reports how often the fallback fired.
- **Postgres's plan for the join.** With ~40 topics the planner should walk
  `idx_item_topic_topic` and hash-join `item`; at 100 it seq-scans both. Verified with `EXPLAIN`
  in the plan's after-measurement, on a quiet machine.

## 7. Acceptance

- `bun run bench:feed` on a quiet machine, before and after, same hour: after's `getFeedPage`
  **p50 ≤ 300 ms** and not worse than before's; fallback count printed and ≤ 1 in 12 pages for a
  real account.
- `bun run probe:feed` after: twelve-card pages, tier mix within the usual tolerance, no source
  above `sourceCap`, and at least one card whose slot topic is not its display topic (the
  readout gains that column).
- All DB-backed suites green with membership-writing fixtures; `bun run e2e:prod` 51/51.
- A new integration test: an item whose only route to a topic is a membership row is drawn under
  that topic.

## 8. After it ships: round 2 itself

Ben ticks `docs/topic-proposals-round2.md` (facets filled in; period tags like `70s`, `1960s`
left unticked — period topics are tag-only, 09-07-26), then `bun run promote:topics --file
docs/topic-proposals-round2.md --confirm`, `bun run graph:rebuild --confirm`, and the same two in
the production container after the deploy (`.cache/promote-prod.sh` needs the `--file` flag added).
A promoted topic's pool is then its whole membership from the first page.

## 9. Measured after

Taken 09-11-26 on the Mac with nothing else running (no ingest, no dev server, no test run; `ps`
checked before each). The "same minutes" rows are the honest comparison: a throwaway checkout at
`6d6ad32` (pre-change) and the branch, run alternately per account so any drift in the machine
lands on both sides. 12 pages each, `bun run bench:feed --user <email>`.

| account | picks | before p50 / p95 | after p50 / p95 | planned topics / page | fallbacks |
|---|---|---|---|---|---|
| Ben's own (`benjamin.reilly@…`) | 3 | 163 / 183 ms | **176 / 271 ms** | 28 (22-31) | 0 of 12 |
| `persona-sam` | 6 | 159 / 166 ms | **225 / 259 ms** | 31 (26-37) | 0 of 12 |
| `ben-e2e` (cold start: the sixteen) | 0 | 162 / 167 ms | **250 / 274 ms** | 37 (32-40) | 0 of 12 |

Task 1's baseline on `ben-e2e`, an hour earlier, agrees: 164 / 206 ms before, 247 / 286 ms after.
`getTopicPools` across all 104 topics in one call — the ceiling, not a page's cost — went from
~157-160 ms / 4,918 rows / 0.8 MB to ~430-443 ms / 5,943 rows / 0.9 MB: memberships, as §3
predicted.

**Against §7:** p50 ≤ 300 ms — **met** on all three. Fallback ≤ 1 in 12 — **met** (0 in 36).
"Not worse than before" — **missed**: +13 ms p50 for Ben's own account, +66 and +88 ms for the
six-pick persona and the cold start, and p95 up ~90-100 ms throughout. Per the plan this is
recorded, not tuned.

**Why, from `EXPLAIN (ANALYZE, BUFFERS)`** (`.cache/explain-pools.ts`, one planned fetch):

- Ben's account, 24 planned topics: `Bitmap Index Scan on idx_item_topic_topic` (126k membership
  rows) → `Parallel Hash Join` against a **`Parallel Seq Scan on item`** → hash anti-join on
  `seen_item` → a sort of 124k rows that **spills** (`external merge`, ~3.8 MB per worker × 3) →
  131 ms execution.
- Cold start, 33 planned topics: the planner has already switched to **`Parallel Seq Scan on
  item_topic`** (180k rows); same join, spill ~5.5 MB × 3, 177 ms.

Two things the design did not predict. **The seq-scan flip comes at ~33 topics, not ~100** (§6
guessed 100); and `item` is hash-joined off a seq scan rather than looked up by primary key. Neither
is the cost: the sort feeding the window functions is. The planned topics are the *big* ones —
a reader's picks and their strongest graph neighbours are, by construction, the well-populated
topics — so 24-37 of them hold ~125k-180k memberships, about as many rows as the old query ranked
across all 104 display pools, now through a join and a disk sort. At today's vocabulary the plan
buys back roughly the 2.8× membership multiplier and no more.

What the plan *does* buy is the property §3 asked for: the page's cost follows the ~30-40 planned
topics, not the vocabulary. Round 2 would take the reachable set to ~370 topics; the every-reachable
shape on the join extrapolates to ~700 ms there, the planned shape stays at the same thirty-odd
topics. **Levers, if Ben wants the last 15-90 ms back (none taken here):** `SET LOCAL work_mem`
for this one query (§3 measured 64 MB at ~40 ms saved — it removes the spill); a covering index
`item_topic (topic_id, item_id)` so the join reads no heap; or a smaller per-source cap. The
horizon is not a lever — it changes how many topics a page may *need*, not what each costs.

**Probe** (`bun run probe:feed --user ben-e2e@example.com --pages 3`): twelve-card pages, tier mix
CORE 41 / DRIFT 38 / JUMP 22 against 40/35/25, no source above `sourceCap`, zero adjacency
violations, and **13 of 36 cards served under a topic other than their display topic** — the join
reaching the feed (`water` serving a `70sscifiart` illustration, `new-york` a Berenice Abbott filed
under `architecture`, `trees` a root-bench installation filed under `architecture`).
