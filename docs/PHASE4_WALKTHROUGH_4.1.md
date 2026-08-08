# Phase 4.1 walkthrough — feed algorithm

> Companion to the Phase 4 plan (`.superpowers/sdd/PHASE4_PLAN/task-1-brief.md`). Executed
> 08-08-26, cold pickup in a new session after Phase 3 (all five source adapters + curation +
> ingestion). TDD throughout: `random.test.ts`/`feed.test.ts` were written against the ported
> algorithm's expected behavior, run to a failing state, then made to pass.

## What shipped

- **`src/server/services/random.ts`** — the deterministic-randomness seam every 4.1 test hangs
  off: `hashSeed` (xmur3-style string hash), `mulberry32` (seeded PRNG, `[0, 1)`), and
  `weightedPick` (ported near-verbatim from `phase0/feed.template.html:235-241`, now taking an
  injected `rng` instead of calling `Math.random()` directly). Same seed → same sequence is what
  lets a cursor "freeze" a page on refetch (SPEC §7).
- **`src/server/services/feed.ts`** — the composition engine (SPEC §9), ported near-verbatim from
  the prototype's `pickCore`/`pickDrift`/`pickJump`/`composePage`:
  - `pickCore`/`pickDrift`/`pickJump` are pure, exported functions — DRIFT walks positive-sim
    neighbours only (temperature-softmax), falls back to the start topic when a row has no
    positive bridge, and takes a second hop with probability `hop2` that's rejected if it would
    land back on the start topic. JUMP draws uniformly from the bottom half of a row.
  - `composePage` is the pure, DB-free guard loop (tier draw → topic pick → item pick, diversity
    constraints, `pageSize * 40` guard budget) — takes `{ weights, graph, pools, rng, knobs }` all
    injected, which is what makes it fully unit-testable without Postgres.
  - `coldStartWeights()` — the SPEC §9 cold-start fallback (uniform weight 1 across all 16 topics)
    for a user with no `user_topic` rows yet.
  - `encodeCursor`/`decodeCursor` — the base64url JSON cursor codec (SPEC §7), throwing on
    malformed or unknown-version input.
  - `getFeedPage` — the async orchestration shell around all of the above: decodes/synthesizes the
    cursor, resolves user weights, computes the reachable-topic superset and fetches every pool in
    one batched call, runs `composePage`, marks served items seen, and encodes the next cursor.
    See "Design decisions" below for the reachable-topic and mark-seen-at-serve specifics.
- **`src/server/db/schema.ts`** — `seenItem` table (SPEC §5.4b) + generated migration
  (`drizzle/0001_kind_crusher_hogan.sql`).
- **`src/server/db/feed.ts`** — rewritten from the 4.2-era stub into the real repository:
  `getTopicPools` (one `SELECT` across every topic id, `NOT EXISTS`-based seen exclusion with a
  strict `served_at < anchor`, `excludeIds` for the previous page's own items, riding
  `idx_item_topic_score`) and `markSeen` (batch insert, `onConflictDoNothing` so a cursor refetch
  is a no-op, not an error).
- **`src/server/db/topics.ts`** — `getUserTopicWeights(userId)` is real; `listTopics`/
  `setUserTopics` stay Phase 4.2 stubs, untouched.
- **`src/server/db/items.ts`** — `getItemById` implemented (trivial `SELECT ... WHERE id = ...`);
  unblocks both the probe script and Phase 4.2's `items.byId`.
- **`src/env.js`** — optional `FEED_DEBUG` server var. Left unset, `services/feed.ts` falls back to
  `env.NODE_ENV === "development"` — dev affordances (debug overlay data, knob overrides) are on
  by default in development, off elsewhere, without forcing every deployment to set the var
  explicitly.
- **`scripts/probe-feed.ts`** + `"probe:feed"` script — `probe-adapter.ts`'s sibling: prints each
  page as a table (tier / topic / source / score / title / drift path) plus a per-run summary
  (tier-mix %, topic spread, source-adjacency violation count). `--user <email>` or `--uniform`
  (idempotently upserts a dedicated throwaway probe user with zero `user_topic` rows, exercising
  the cold-start path against real data without touching a real account).
- Tests: `random.test.ts` (10), `feed.test.ts` (22, pure/fixture-based), `feed.integration.test.ts`
  (5, real Postgres via `docker compose`, self-skips without `DATABASE_URL`) — 37 new, 130 total
  across the whole suite.

## Design decisions made while executing (beyond what the brief spelled out verbatim)

### 1. How `getFeedPage` decides which topics' pools to fetch

The brief's "slot plan first, pools second" line doesn't fully specify *how* the plan phase
decides which topics are worth fetching before `composePage` runs (composePage itself has to stay
pure/synchronous, so it can't fetch pools lazily mid-guard-loop the way the prototype did, reading
straight from an in-memory `items` object).

The implemented approach is a pure, RNG-free graph traversal — `reachableTopics()` in
`services/feed.ts`: start from the user's own weighted topics, then union in every topic named in
those topics' graph rows (one hop — covers JUMP and DRIFT's first hop), then union in *those*
topics' rows too (a second hop — covers DRIFT's optional second hop). That's a safe superset of
everywhere any tier's guard-loop iteration could land, computed once, with no RNG involved (so it
can't desynchronize the "real" `rng` instance `composePage` uses). `getTopicPools` is then called
exactly once for that superset.

In practice, against the real 16-topic graph (each row lists essentially every other topic), this
superset is "all 16 topics" for almost any non-empty `weights` — which is fine; fetching all 16
topics' pools in one indexed query is cheap. The two-hop traversal keeps the logic correct for
sparser graphs too (unit tests use deliberately sparse fixture graphs), and if `composePage` ever
did land on a topic outside the superset (a same-run graph edit, a pathological fixture), it just
sees a missing pool for that slot and treats it as the existing soft "pool empty, retry" case —
never a crash. This doesn't change the *statistics* of which topic gets chosen (that's still
entirely `composePage`'s rng-driven decision) — it only decides which pools are worth the round
trip.

### 2. `FEED_DEBUG` default and where it's read

`env.js` keeps `FEED_DEBUG` as a plain optional boolean rather than baking the
"development-defaults-on" behavior into the Zod schema itself, because that default depends on
`NODE_ENV`, which is a separate field. `services/feed.ts`'s `getFeedPage` computes
`env.FEED_DEBUG ?? env.NODE_ENV === "development"` once, dynamically importing `~/env` inside the
function body — not at module scope — for the same CI-has-no-env-vars reason `db/items.ts`'s
`drawFromTopic` dynamically imports `./client`: a static import would crash `feed.test.ts` (which
only imports the pure `composePage`/`pickCore`/etc.) the moment `bun run test` runs with no env
vars set at all.

### 3. Integration test fixture: why every "page" is 3 cards, not `pageSize` (12)

`feed.integration.test.ts`'s fixture puts all 30 throwaway items under one topic. The default
`topicCap` is 3 (SPEC §9.3), so `composePage` caps at 3 cards from that single topic per page
regardless of `pageSize` — every further guard-loop iteration keeps hitting the same topic, keeps
hitting the cap, and `continue`s until the guard budget runs out. That's real, intended behavior
(not a test workaround), and it conveniently makes exhaustion reachable in a small, fast fixture:
30 items ÷ 3 per page = exactly 10 pages before an 11th comes back empty. The walkthrough test file
documents this in its header comment so it doesn't read as a bug on a future re-read.

A related subtlety: the five `it` blocks share one `userId` and one 30-item pool (set up once in
`beforeAll`), so an `afterEach` clears that user's `seen_item` rows between tests — otherwise
earlier tests' `markSeen` calls would shrink the pool available to later tests, and a test
asserting "all 30 items eventually serve" would see fewer than 30 just from cross-test pollution,
not from any real bug.

## `bun run probe:feed` — live verification against the dev DB

`bun run probe:feed --uniform --pages 6` (cold-start path — the throwaway probe user has zero
`user_topic` rows, so every draw uses `coldStartWeights()`):

```
tier mix: CORE 38% · DRIFT 39% · JUMP 24%  (target 40/35/25)
topic spread: 16 distinct topics across 72 cards
source-adjacency violations: 0 (should be ~0)
```

Tier mix converges toward the 40/35/25 target as the sample grows (a single 12-card page reads
noisier — 50/17/33 on one run — which is expected at that sample size). All 16 topics appear
across six pages; zero source-adjacency violations. Spot-checked several DRIFT/JUMP rows by eye
(e.g. `zoology → ancient-history → mythology`, `poetry → cartography`) — the drift paths read as
genuine museum-wing doorways, not noise, consistent with the Phase 0.5 reference feel.

Knob overrides were also live-verified: `--knob tierJump=100 --knob tierCore=0 --knob
tierDrift=0` produced a page that's 100% JUMP cards, confirming overrides reach `composePage`
end-to-end (and that `FEED_DEBUG` defaults truthy when running the script directly in an
unset-`NODE_ENV` shell, per `env.js`'s `NODE_ENV` default of `"development"`).

## Verification

- `bun run check` (typecheck → lint → format:check → test) — green. 130 tests total (93 prior +
  37 new), including the 5 DB-backed integration tests (local Postgres via `docker compose` was
  available for this run).
- `bun run probe:feed --uniform --pages 6` against the real dev DB — see above.

## Findings for later tasks

- **Phase 4.2's `feed.page` procedure** is a thin wrapper: decode/re-encode nothing extra, just
  call `getFeedPage(ctx.session.user.id, input.cursor)` and pass through `{ cards, nextCursor }` —
  the brief's decision to return `cards` (not bare `Item[]`) means the tRPC output type is already
  `FeedPage` as exported here, no reshaping needed.
- **`tasteKeywords`** is threaded through `composePage`'s options and `pickItem`'s weighting today
  but `getFeedPage` always passes `[]` (decision 6) — Phase 6.1 is the one that has to plumb a
  real user taste-keyword list in from wherever saves end up recording them.
- **The reachable-topics heuristic (design decision 1 above)** is worth revisiting if the topic
  graph ever grows sparse in a specific corner (a topic with very few positive-sim neighbours) —
  right now, with a dense 16-topic graph, it's effectively "fetch all 16," which hides whether the
  two-hop bound is doing real work. The unit tests exercise sparse fixture graphs directly so the
  traversal logic itself is covered independent of the real graph's density.

## Next

Task 2 (4.2: tRPC surface) — `topics.list`, `topics.setMine`, `feed.page`, `items.byId`,
`saves.toggle`, `saves.list` routers per SPEC §7, built on `createTRPCContext`'s Phase-2 session
plumbing and this task's `getFeedPage`/`getItemById`.
