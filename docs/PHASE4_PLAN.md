# Phase 4 — Feed engine & API: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 4 (steps 4.1–4.2), same format as
> [`PHASE3_PLAN.md`](PHASE3_PLAN.md). Written 08-08-26. Check BUILD_PLAN boxes as each step's
> *Done =* line is met. Assumes Phase 3 complete (five adapters, curator, `drawFromTopic`,
> populated dev DB via `bun run ingest`).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan task-by-task.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** written in a Fable session with docs
> verification done (findings inlined below); the executing session works cold from this file.
> When live docs contradict this plan, re-verify against docs before trusting either.

**Goal:** `getFeedPage()` — the tiered topic-drift engine (SPEC §9), ported from the validated
reference implementation `phase0/feed.template.html` — plus the full tRPC surface (SPEC §7):
session-aware context, `protectedProcedure`, rate limiting, and the six procedures. Ends with a
real feed servable over HTTP and a CLI bench to eyeball it before any UI exists.

**Architecture:** The engine is a pure, dependency-injected composition core
(`server/services/feed.ts`: tier draw → topic pick → item pick under diversity constraints, all
driven by a **seeded** RNG) over thin DB repositories (`server/db/feed.ts` pool/seen queries,
`server/db/topics.ts` user weights). One pool query per page, in-memory draws — not one
`drawFromTopic` call per slot (12+ queries/page would blow the §NFR <300 ms budget).
`server/api/trpc.ts` gains session context + `protectedProcedure`; routers stay thin over the
repos.

**Tech stack:** no new dependencies. Seeded PRNG is ~10 lines inline (mulberry32 + a string
hash); everything else is already installed.

## Decisions settled during planning (record in SPEC as noted)

1. **`seen_item` table, retention = forever** (Ben, 08-08-26). SPEC §5 had no home for §9's
   seen-tracking (the prototype used localStorage). New table: `seen_item(user_id, item_id,
   served_at, PK(user_id, item_id))` — served ⇒ seen ⇒ never re-served to that user. A
   decay/reset affordance is Phase 9 material if ever needed. → Task 1 adds §5.4b + migration.
2. **Cursor = constant-size `{v, seed, page, anchor, prev[]}`** (base64url JSON). `seed` +
   `page` key the deterministic RNG; `anchor` (timestamp captured *before* the page's seen-rows
   are inserted) + `prev` (the immediately-previous page's item ids only) make the exclusion set
   reproducible, so refetching a cursor returns the identical page even though serving marked its
   items seen. Exclusion = `seen_item.served_at < anchor` ∪ `prev` ∪ picked-so-far-this-page.
   ~400 chars — fine over tRPC's default GET transport (verified: `methodOverride: "POST"`
   exists as an escape hatch if ever needed). → Task 1 records in SPEC §7/§9.
3. **`feed.page` returns `cards`, not bare `Item[]`** — each card is `{item, tier, topicId,
   driftPath?, debug?}`. The drift path is *product*, not debug: Phase 5.4's serendipity
   connective rows ("{From} → {To}") need it. `debug` (why-string, sims, score) is gated by the
   dev flag. → Task 2 updates the SPEC §7 table.
4. **Dev flag = `FEED_DEBUG` server env var** (optional, `env.js`), on by default in
   development: gates both the `debug` payload and whether `feed.page` honors knob overrides in
   its input. Works in a deployed instance by setting the var (SPEC §9: knobs stay through all
   of development).
5. **Cold start = uniform weight 1 over all 16 topics** when a user has no `user_topic` rows —
   the feed degrades gracefully instead of erroring (BUILD_PLAN 4.1's "cold start" test case).
   Onboarding redirect is Phase 5.3's job.
6. **Taste keywords deferred to 6.1** (where the save→reweight loop lands). The engine plumbs
   `tasteKeywords` through to `drawWeight` but passes `[]` for now.
7. **Rate limiting = in-memory sliding window** (per user id, else per IP), a pure class so it's
   unit-testable. Single-instance assumption (Coolify) noted in a comment; fine for MVP.
8. **The t3 starter `post` router is deleted** in Task 2 when the real routers land.

## Docs findings (verified 08-08-26 — do not re-derive, but re-check if anything looks off)

- **Better Auth 1.6.x:** `auth.api.getSession({ headers })` is current. Returns
  `{ session, user }` when a valid session exists, **`null`** when absent (check the whole
  result for null before destructuring). Calling once per request in `createTRPCContext` is the
  documented pattern; pass the *actual* incoming `Headers` object.
- **tRPC v11 protected procedure idiom:** middleware via `t.procedure.use()`, throw
  `new TRPCError({ code: "UNAUTHORIZED" })` when `ctx.session` is null, and narrow by returning
  `next({ ctx: { session: ctx.session, user: ctx.user } })` — downstream resolvers see them
  non-nullable.
- **Transport:** `httpBatchStreamLink` sends queries via GET; batching URL cap guidance is
  ~2083 chars (`maxURLLength`). Our cursor is ~400 chars → GET is fine.

## Global constraints (unchanged from Phase 3 — the short version)

- **Runtime:** Bun. Tests `bun run test`; full gate `bun run check` must pass before every PR.
- **Branch/PR per BUILD_PLAN step, merged to main before the next. Never push main directly**
  (CI only runs on PRs). Branches: `phase-4.1-feed-engine`, `phase-4.2-trpc-surface`.
- **Teaching comments:** comment generously in the established style (see `src/server/db/items.ts`)
  — what each piece is *for*, and which SPEC/prototype line it implements.
- **Integration tests self-skip without `DATABASE_URL`** (`describe.skipIf`) and create their own
  throwaway rows with `nanoid`-suffixed ids, cleaned up in `afterAll` — copy the pattern in
  `src/server/db/items.integration.test.ts` exactly (incl. the dynamic `import("./client")`
  inside hooks, never at module scope — CI's test step has no env vars at all).
- **Docs updates ride with each task's PR:** BUILD_PLAN checkbox, `docs/PHASE4_WALKTHROUGH_4.x.md`
  (style of `docs/PHASE3_WALKTHROUGH_3.3.md`), SPEC edits noted per task, `log.md` entry (incl.
  session-spend line via `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>`;
  never estimate; omit on non-zero exit).

## Reference files (read before the task that uses them)

| File | What it holds |
|---|---|
| `phase0/feed.template.html` lines ~196–346 | **The algorithm.** `weightedPick`, `pickCore`, `pickDrift`, `pickJump`, `poolFor`, `pickItem`, `composePage` — port these near-verbatim. Knob defaults at line ~219. |
| `SPEC.md` §9 | The spec the port must satisfy (tier semantics, constraints-are-soft, seen tracking, card shaping) |
| `src/server/db/items.ts` | `drawWeight()` — **reuse, don't reimplement** (exported for exactly this); comment style |
| `src/server/config/topic-graph.json` | Graph shape: `{ graph: { [topicId]: [{topic, sim}, ...] } }`, rows sorted desc by sim |
| `src/server/config/topics.ts` | The 16 topic ids/labels (already seeded in DB) |
| `src/server/api/trpc.ts` | Context factory + procedure plumbing Task 2 extends (its Phase-2 comment describes exactly what to add) |
| `src/lib/auth.ts` | The `auth` instance for `auth.api.getSession` |
| `src/server/db/{feed,topics,saves}.ts` | Typed stubs Task 1/2 replace — keep their exported names |
| `docs/PHASE3_WALKTHROUGH_3.3.md` | Walkthrough-doc style to match |

**Porting notes (prototype → server), so the executing session doesn't trip:**
- The prototype comment on `pickDrift` says "softmax over the row's top half" — **the code (and
  SPEC §9) filter to positive-sim neighbours, not the top half**. Follow the code: `row.filter(n
  => n.sim > 0)`, weight `exp(sim / temp)`.
- DRIFT with no positive bridge stays on the start topic (≡ SPEC's "fall back to CORE").
- Second hop (p≈0.5) is rejected if it lands back on the start topic.
- JUMP = uniform over `row.slice(floor(row.length / 2))` — the bottom half, not the antipode.
- Guard loop: `pageSize * 40` attempts, then return whatever was composed (constraints are soft:
  relax rather than starve).
- Source-adjacency is enforced the prototype's way: filter the pool to `source !== lastSource`,
  but only if that leaves a non-empty pool.

---

### Task 1 — 4.1 Feed algorithm (branch `phase-4.1-feed-engine`)

**Files:**
- Modify: `src/server/db/schema.ts` (add `seenItem` table) + new migration via `bun run db:generate`
- Create: `src/server/services/random.ts` — seeded RNG + shared `weightedPick`
- Create: `src/server/services/feed.ts` — cursor codec, knobs, tier/topic pickers, `composePage`, `getFeedPage`
- Rewrite: `src/server/db/feed.ts` — stub becomes the pool/seen repository (drop the `getFeedPage` stub; it moves to services)
- Modify: `src/server/db/topics.ts` — add `getUserTopicWeights(userId)` (leave the 4.2 stubs)
- Modify: `src/server/db/items.ts` — implement `getItemById` (trivial; unblocks the probe + 4.2)
- Modify: `src/env.js` — optional `FEED_DEBUG` server var
- Create: `scripts/probe-feed.ts` + `"probe:feed"` script in `package.json`
- Tests: `src/server/services/random.test.ts`, `src/server/services/feed.test.ts`,
  `src/server/services/feed.integration.test.ts`
- Docs: SPEC §5 (seen_item), §7 (cursor), §9 (mark-seen-at-serve + cursor design note);
  BUILD_PLAN check 4.1; `docs/PHASE4_WALKTHROUGH_4.1.md`; `log.md`

**Schema addition** (SPEC §5.4b):

```ts
export const seenItem = pgTable(
  "seen_item",
  {
    userId: text("user_id").notNull().references(() => user.id),
    itemId: text("item_id").notNull().references(() => item.id),
    // Set explicitly from the app clock (not defaultNow()) so the cursor's `anchor` — captured
    // on the same clock just before insert — can use a strict `<` comparison safely.
    servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] })],
  // No extra user_id index: the composite PK's btree already serves user-scoped lookups.
);
```

**Interfaces (later work depends on these exact names):**

```ts
// services/random.ts — deterministic randomness, the property every 4.1 test hangs off
export function hashSeed(s: string): number;                 // string → uint32 (xmur3-style)
export function mulberry32(seed: number): () => number;      // seeded PRNG, [0,1)
export function weightedPick<T>(entries: [T, number][], rng: () => number): T | null;

// services/feed.ts
export interface FeedKnobs { tierCore: number; tierDrift: number; tierJump: number;
  scoreFloor: number; scorePower: number; tagBoost: number; temp: number; hop2: number;
  topicCap: number; pageSize: number }
export const DEFAULT_KNOBS: FeedKnobs; // 40/35/25, 4, 1.5, 0.5, 0.15, 0.5, 3, 12 — prototype line ~219
export type Tier = "CORE" | "DRIFT" | "JUMP";
export interface FeedCard { item: Item; tier: Tier; topicId: string;
  driftPath?: string[];                       // topic ids walked (DRIFT/JUMP); powers 5.4's connective rows
  debug?: { why: string; curationScore: number } } // FEED_DEBUG only
export interface FeedPage { cards: FeedCard[]; nextCursor?: string }
export function encodeCursor(c: FeedCursor): string;   // base64url JSON, v: 1
export function decodeCursor(s: string): FeedCursor;   // throws on bad/unknown-version input
export async function getFeedPage(userId: string, cursor?: string,
  knobOverrides?: Partial<FeedKnobs>): Promise<FeedPage>;
// plus exported pure pickCore/pickDrift/pickJump/composePage taking injected
// { weights, graph, pools, rng, knobs } — the DB-free unit-test surface.

// db/feed.ts — the repository under the engine
export async function getTopicPools(topicIds: string[], opts: { userId: string; anchor: Date;
  scoreFloor: number; excludeIds: string[] }): Promise<Map<string, Item[]>>;
  // one SELECT: topic_id IN (...) AND curation_score >= floor
  //   AND NOT EXISTS (seen_item WHERE user+item AND served_at < anchor)
  //   AND id NOT IN (excludeIds, when non-empty)  — rides idx_item_topic_score
export async function markSeen(userId: string, itemIds: string[], servedAt: Date): Promise<void>;
  // batch insert, onConflictDoNothing (refetch of a cursor re-marks the same items — must not throw)

// db/topics.ts
export async function getUserTopicWeights(userId: string): Promise<Map<string, number>>;
```

**`getFeedPage` orchestration (the part that isn't in the prototype):**
1. Decode cursor (absent → `{seed: random uint32, page: 0, anchor: now, prev: []}`).
   `rng = mulberry32(hashSeed(`${seed}:${page}`))` — every draw on this page uses it.
2. Load user weights (cold start → uniform over all 16). Merge knob overrides only when
   `FEED_DEBUG` is on.
3. **Slot plan first, pools second:** run the tier/topic picks (pure, in-memory) collecting
   wanted topics under the per-page topic cap, then ONE `getTopicPools` call for the distinct
   topics, then the item draws with `drawWeight` + `weightedPick` honoring source-adjacency and
   in-page exclusion. Slots whose topic pool is empty re-enter the guard loop (soft constraints).
   *Note the two-phase split changes nothing statistically vs the prototype's interleaved loop —
   topic choice never depended on pool contents except via the empty-pool retry, which is kept.*
4. Capture `servedAt = new Date()` **before** `markSeen`; `nextCursor = {v:1, seed, page+1,
   anchor: servedAt, prev: thisPageItemIds}` — constant-size by construction (decision 2).
5. 0 cards → `{cards: [], nextCursor: undefined}` (exhaustion; the UI banner is Phase 5's).

**`scripts/probe-feed.ts`** (the pre-UI feel bench, `probe-adapter.ts`'s sibling): args
`--user <email>` (real weights) or `--uniform`, `--pages N`, `--knob key=val...`. Prints each
page as a table (tier / topic / source / score / title / drift path) plus per-run summaries:
tier-mix %, topic spread, source-adjacency violations (should be ~0). Runs against the dev DB.

**Tests (the highest-value suite in the app — BUILD_PLAN calls this out):**
- *random.test.ts*: same seed → same sequence; `weightedPick` respects weights (seeded, statistical) and returns null on empty/zero-weight input.
- *feed.test.ts* (pure, injected fixtures, seeded rng — no DB):
  tier-mix ≈ 40/35/25 over many pages; DRIFT walks positive bridges only; no-positive-bridge → stays home; second hop fires ≈ `hop2` and never lands back on start; JUMP draws only from the bottom half; topic cap respected; no adjacent same source when avoidable (and relaxes when not); seen/prev/in-page exclusion; cursor round-trip incl. bad-input throw; **same cursor + same pools → identical page**; cold-start uniform weights; exhaustion returns empty page.
- *feed.integration.test.ts* (skipIf no `DATABASE_URL`, throwaway user/topic/items):
  `getFeedPage` composes from real rows; serving marks `seen_item`; page 2 excludes page 1; refetching page 1's cursor returns the identical page *after* its items were marked seen; exhaustion end-to-end.

*Done =* `getFeedPage()` returns sensibly mixed pages against the populated dev DB (probe-feed
eyeballed); test suite covers every case above; `bun run check` green; BUILD_PLAN 4.1 checked.

---

### Task 2 — 4.2 tRPC surface (branch `phase-4.2-trpc-surface`)

**Files:**
- Modify: `src/server/api/trpc.ts` — session context, `protectedProcedure`, rate-limit middleware
- Create: `src/server/services/rate-limit.ts` — pure sliding-window limiter class
- Create: `src/server/api/routers/{topics,feed,items,saves}.ts`
- Modify: `src/server/api/root.ts` — wire the four routers; **delete `routers/post.ts`** (grep
  `api.post` first to confirm nothing references it — the homepage demo was trimmed in 1.2)
- Rewrite: `src/server/db/saves.ts` + finish `src/server/db/topics.ts` stubs
- Tests: `src/server/services/rate-limit.test.ts`, `src/server/api/routers/routers.test.ts`
  (createCaller, mocked ctx), `src/server/api/routers/routers.integration.test.ts`
- Docs: SPEC §7 (feed.page output shape + rate-limit note); BUILD_PLAN check 4.2;
  `docs/PHASE4_WALKTHROUGH_4.2.md`; `log.md`

**Context + procedures** (`trpc.ts` — its own Phase-2 comment already describes this):
`createTRPCContext` calls `auth.api.getSession({ headers: opts.headers })` (returns
`{session, user} | null` — see docs findings) and spreads `session`/`user` (null when absent)
into the context. `protectedProcedure = publicProcedure.use(...)` throws `UNAUTHORIZED` on null
session and narrows via `next({ ctx: { session, user } })`. Rate-limit middleware keys on
`user?.id ?? x-forwarded-for`; applied to all procedures (public ones included — `items.byId`
backs an unauthenticated page). Generous defaults (e.g. 120 req/min) — this is abuse cover, not
throttling.

**Procedures (SPEC §7 table, updated output for feed.page):**

| Procedure | Type | Auth | Impl |
|---|---|---|---|
| `topics.list` | query | protected | `listTopics()` — all 16 rows |
| `topics.setMine` | mutation | protected | `setUserTopics(userId, topicIds)`: zod `string[].min(1)`, validate ids against DB topics (`BAD_REQUEST` otherwise); transaction: delete rows not in list, insert new at weight 1, **retained topics keep their learned weight** |
| `feed.page` | query | protected | `{cursor?: string, knobs?: Partial<FeedKnobs>}` (knobs zod-bounded, honored only under `FEED_DEBUG`) → `getFeedPage(...)`; `decodeCursor` throw → `BAD_REQUEST` |
| `items.byId` | query | **public** | `getItemById` (implemented in Task 1); `NOT_FOUND` on miss |
| `saves.toggle` | mutation | protected | insert-or-delete `saved_item` → `{saved: boolean}`; verify the item exists (`NOT_FOUND`) |
| `saves.list` | query | protected | join `saved_item → item`, `saved_at` desc |

Repos stay user-scoped by signature (`userId` first arg — SPEC §11's authz rule; the stubs
already model this).

**Tests:**
- *rate-limit.test.ts*: pure class w/ injected clock — allows under limit, blocks over, window slides, keys isolated.
- *routers.test.ts* (createCaller + mock ctx, no DB where possible): null-session ctx → every protected procedure throws `UNAUTHORIZED`; `items.byId` resolves without a session; zod rejects malformed input; knobs ignored when `FEED_DEBUG` off.
- *routers.integration.test.ts* (skipIf, throwaway user via direct `user`-table insert): `topics.setMine` round-trip — set, re-set with overlap, retained topic keeps a hand-bumped weight; `saves.toggle` on→off + `saves.list` ordering; `feed.page` end-to-end through the caller: page 1 → cursor → page 2 disjoint.

*Done =* all six procedures callable; auth enforcement verified (unauth'd `feed.page` fails,
`items.byId` succeeds — the BUILD_PLAN line, covered by tests + a manual `curl` against `bun run
dev` recorded in the walkthrough); `bun run check` green; BUILD_PLAN 4.2 checked. **Phase 4
complete — first shippable moment arrives with 5.4.**

---

## Verification approach

- `bun run check` green per task; PR per branch; CI green before merge.
- Integration suites against compose Postgres (`docker compose up -d`) — they self-skip in CI.
- **Feel check before calling 4.1 done:** `bun run probe:feed --uniform --pages 5` against the
  populated dev DB — tier mix near 40/35/25, drift paths read as real bridges, no starved
  topics, no adjacent same-source rows.
- After 4.2: manual curl — `items.byId` without a cookie succeeds; `feed.page` without a cookie
  → 401-shaped tRPC error; with a real session cookie (sign in via the 2.2 flow) → a page of
  cards.
