# Phase 6.1 — Feed learns from saves: detailed execution plan

**Status: ready to execute.** Written to be executed cold, by a session that has not read the
research behind it. **Where it says "verified", the claim was checked against the repo at plan time
(08-22/23-26, `main` @ 28df2d8), not inherited.** If the repo has moved since, re-verify line
numbers before editing — the *shapes* described here are the contract, not the line numbers.

**Prerequisites (Ben):** none. No new services, no new env vars, no migration. Local Postgres up
(`docker compose up -d`) so integration tests actually run rather than self-skip.

**No mid-phase stop.** All four ⚖️ decisions were taken with Ben at plan time (below). Execute
straight through.

**What this phase is:** the save→feed learning loop. Today saving an item has **zero** side effects
beyond the `saved_item` upsert, every `user_topic.weight` in the database is exactly `1.0`, and
`getFeedPage` passes the literal `tasteKeywords: []` TODO. 6.1 makes a save (a) bump its topic's
weight, visibly, and (b) feed the item's `aesthetic_tags` into the item-draw boost — closing the
loop SPEC §9 calls "Personalisation = topics, not items."

**Source of truth:** SPEC §9's "Personalisation" paragraph names the behavior;
`phase0/feed.template.html:398-402` is the reference implementation and **its defaults are the
shipped defaults** (SPEC §9's standing rule). Where this plan and either disagree, this plan wins —
it carries the decisions taken with Ben on top of them.

**Done bar** (BUILD_PLAN 6.1): weight adjustment covered by unit + integration tests; a burst of
saves in one domain measurably (but not overwhelmingly) shifts composition, asserted by a seeded
distribution test; the save toast says which topic is now drifting; `bun run check` green at every
commit; walkthrough doc + SPEC/BUILD_PLAN/log updates landed; branch merged back to `main`.

## Reference reading before you start (~10 minutes)

- `SPEC.md` §9, the "Personalisation = topics, not items" paragraph (~line 399) — the behavior
  being shipped, and the xikipedia lesson: an invisible feedback loop reads as random, so the UI
  must *say* it reweighted.
- `phase0/feed.template.html:385-405` — the reference implementation: `min(3, (w ?? 0) + 0.5)`,
  last-24 rolling keywords, and the two toast copy variants.
- `src/server/services/feed.ts` — the engine. Load-bearing: `getFeedPage` (~483), the weights read
  + `coldStartWeights` fallback (~504), `composePage` (~353), `DEFAULT_KNOBS` (~53), and the
  `tasteKeywords: []` TODO (~526) this phase deletes.
- `src/server/api/routers/saves.ts` `saveToCollection` (~51-75) — the hook point; it already
  fetches the item, so `topicId` is free.
- `src/server/services/feed.test.ts:213-277` — the seeded-distribution test pattern T3 clones,
  including the two hard-won rules in its comment block (fat pools + assert-the-page-filled; 8
  fixed seeds pooled into one sample).
- `docs/PHASE6_WALKTHROUGH_6.2.md` — the walkthrough shape T5 reproduces.

## Decisions locked with Ben 08-22-26 (do not relitigate)

1. **Bump = phase0 defaults, saved topic only.** A *new* save does
   `weight = LEAST(3.0, weight + 0.5)` on the saved item's topic. An absent `user_topic` row is
   created at `1.0 + 0.5 = 1.5` (cold default plus the bump). Row creation **is** the entire
   "inferred related topics" mechanism — **no graph-neighbor spillover**. Verified rationale:
   DRIFT/JUMP already spread a raised weight structurally (weighted draws pick the *start* of
   graph walks, and `reachableTopics` widens the fetched pools two hops out from every weighted
   topic), so an explicit propagation rule would be a new mechanism the SPEC never wrote.
2. **Unsave does not decrement**, and **moving an item between collections does not re-bump**.
   Weights record demonstrated interest; unsave is collection housekeeping. The unsave path is
   untouched (it never fetches the item today, and stays that way).
3. **Taste keywords are derived, never stored.** At feed time: the last-24 unique
   `aesthetic_tags` across the user's most recent saved items, recency-ordered,
   case-insensitively deduped keeping the first-seen form. No schema migration, nothing to decay,
   and unsave self-heals the list. (phase0 stored a rolling profile; the app derives instead —
   deliberate divergence, same observable behavior.)
4. **Visibility = one combined toast.** `saveToCollection`'s return grows a `drift` field; the
   toast becomes `Saved to Art · Now drifting toward Cartography` (row created) /
   `Saved to Art · Drifting a little more toward Cartography` (row existed). Copy diverges from
   phase0's "Now **also** drifting toward" — ship the decision's wording, record the divergence in
   the walkthrough. **Do NOT invalidate `feed.page` after a save** — weights and keywords are read
   per request, so the next page fetch picks them up naturally; invalidating would reshuffle a
   feed mid-scroll.

## House rules that apply throughout (verified)

- **Repos are pure SQL, routers orchestrate** (stated in `src/server/db/feed.ts`'s header). The
  weight bump is a `db/topics.ts` function *called from* the saves router — never a side effect
  buried inside `setItemCollection` (`db/collections.ts` must not learn about personalization).
- Every `src/server/db/*` function uses the dynamic `const { db } = await import("./client")`
  pattern so envless CI can import the module. Follow it in new functions.
- `bun run check` (typecheck + lint + format + vitest) green at every commit. Integration tests
  self-skip without `DATABASE_URL` — run them for real locally.
- Conventional commits; end commit messages with the repo's Claude co-author trailer convention
  (see `git log`).
- Plain branch off `main` — `feat/6.1-feed-learns-from-saves` — merged back with a merge commit at
  the end (house habit, cf. `28df2d8`). No worktrees.
- The distribution-test rules from the 5.4 de-flaking (`feed.test.ts:213-233` comment): pools fat
  enough that the page always fills **and assert that it filled**, seeded rng only, 8 fixed seeds
  pooled into one sample before asserting shares.
- A red `gallery.spec.ts:193` or a red Postgres-touching integration test under machine load is
  **not evidence about this branch** — see CLAUDE.md's Local dev environment notes before
  debugging either.

## Tasks

Dependency map: T1 → T2 → T3 (T3 needs T1's exported `WEIGHT_CAP`) → T4 (needs T1's return shape)
→ T5 (docs). Strictly sequential is simplest and fine.

### T1 — Weight bump on new save

**Verified at plan time:** `saveToCollection` (`src/server/api/routers/saves.ts:51-75`) fetches
the item first (NOT_FOUND guard), then the collection (ownership guard), then one call —
`setItemCollection(...)` (`src/server/db/collections.ts:138`, an `insert().onConflictDoUpdate()`
returning `void`) — and returns `{ collectionName } as const`. `isItemSaved`
(`src/server/db/saves.ts:35-46`) exists and is currently called by **no router** (its doc comment
still references the removed `saves.toggle`) — it is the ready-made new-save-vs-move check.
`user_topic` (`src/server/db/schema.ts:201-214`) is `weight real NOT NULL DEFAULT 1.0`, PK
`(user_id, topic_id)` — no migration needed. `setUserTopics` (`db/topics.ts:41-75`) already uses
`onConflictDoNothing` precisely so a kept topic retains its learned weight — needs no change.
`item.topic_id` is FK'd to `topic`, so a label lookup always finds a row for a real item.

**Steps:**

1. In `src/server/db/topics.ts` add (with house-style doc comments):

   ```ts
   export const WEIGHT_BUMP = 0.5; // per new save — phase0/feed.template.html:398 defaults
   export const WEIGHT_CAP = 3.0; // vs. the 1.0 default; NOT related to DEFAULT_KNOBS.topicCap

   export async function bumpTopicWeight(
     userId: string,
     topicId: string,
     opts: { bump?: number; cap?: number } = {},
   ): Promise<{ isNew: boolean; weight: number }> {
     const bump = opts.bump ?? WEIGHT_BUMP;
     const cap = opts.cap ?? WEIGHT_CAP;
     const { db } = await import("./client");
     const [row] = await db
       .insert(userTopic)
       .values({ userId, topicId, weight: 1.0 + bump })
       .onConflictDoUpdate({
         target: [userTopic.userId, userTopic.topicId],
         set: { weight: sql`LEAST(${cap}, ${userTopic.weight} + ${bump})` },
       })
       .returning({
         weight: userTopic.weight,
         // xmax = 0 on a freshly inserted row, non-zero when ON CONFLICT updated an
         // existing one — new-vs-existing in one atomic statement, no read-then-write race.
         isNew: sql<boolean>`(xmax = 0)`,
       });
     return row!;
   }
   ```

   Needs `sql` added to the file's `drizzle-orm` import. **Fallback** if Drizzle's types fight the
   `xmax` expression: a select-then-branch inside `db.transaction`, keeping the insert branch as
   `onConflictDoUpdate` so a race degrades to a capped double bump rather than an error. Prefer
   the single statement. Note in a comment: `LEAST` also clamps a hand-set super-cap weight
   *down* on the next bump — production can't reach >3.0, only test fixtures can (see T1 step 5).
   These constants are deliberately **not** `FeedKnobs`: knobs are compose-side and zod-mirrored
   in `routers/feed.ts`; bump/cap are save-side write constants.

2. Also in `db/topics.ts`: `getTopicLabel(topicId: string): Promise<string | undefined>` — one-row
   select of `topic.label`. (The toast needs the human label; the static `TOPICS` config can't be
   used because integration-fixture topics exist only in the table.)

3. In `saveToCollection`, replace the final two lines with:

   ```ts
   const wasSaved = await isItemSaved(ctx.user.id, input.itemId);
   await setItemCollection(ctx.user.id, input.itemId, input.collectionId);
   if (wasSaved) {
     return { collectionName: collection.name, drift: null } as const;
   }
   const bumped = await bumpTopicWeight(ctx.user.id, item.topicId);
   const topicLabel = (await getTopicLabel(item.topicId)) ?? item.topicId;
   return {
     collectionName: collection.name,
     drift: { topicLabel, isNew: bumped.isNew },
   } as const;
   ```

   Comment the accepted race: two concurrent first-saves of the same item can double-bump; the
   client's in-flight guard makes it rare and the cap bounds it. Update the router's doc comment
   (it currently promises only the collection name).

4. **Fix the two integration assertions this breaks** (verified strict `toEqual`):
   `routers.integration.test.ts:224` — that save is a *new* save by `userId`, whose topicA row
   already exists from the earlier topics block, so expect
   `{ collectionName: "Articles", drift: { topicLabel: <topicA label>, isNew: false } }`;
   `:255` is a move of the same item, so `{ collectionName: "Art", drift: null }`.

5. **New integration tests** — new `describe("6.1 — a save teaches the feed")` in
   `routers.integration.test.ts`, driven as **`otherUserId`** (who has no `user_topic` rows, so
   the row-creation path is exercised — and so the fixture at ~line 176 that hand-sets `userId`'s
   topicA weight to 7.0 can't contaminate the arithmetic). Add two fixture items **in topicA** in
   the file's `beforeAll` (the existing `afterAll` item sweep deletes by topicA, so they get
   cleaned for free): `itemThree` with `aestheticTags: ["etching", "botanical plate"]`,
   `itemFour` with `["botanical plate", "sepia"]`. **Widen the `userTopic` cleanup (~line 130)
   from `eq(userTopic.userId, userId)` to cover both user ids** — otherwise the new rows leak
   between runs. Tests (use `toBeCloseTo` — the column is `real`/float4):
   - `a first save creates the topic row at default + bump and reports it as new` — save
     `itemThree` via the caller; response `drift.isNew === true`; `getUserTopicWeights(otherUserId)`
     has topicA ≈ 1.5.
   - `moving a saved item to another collection does not re-bump` — re-file `itemThree` to
     another collection; `drift === null`; weight still ≈ 1.5.
   - `repeated saves cap the weight at 3.0` — call `bumpTopicWeight(otherUserId, topicA)`
     directly three times (direct db-fn calls are established precedent in this file); weights
     step 2.0 → 2.5 → 3.0; a fourth call stays 3.0 with `isNew: false`.
   - `unsave leaves the learned weight untouched` — `saves.unsave` `itemThree`; weight unchanged.

**Commit:** `feat(saves): a new save bumps its topic's weight, capped at 3.0`

### T2 — Derived taste keywords, wired into the feed

**Verified at plan time:** the literal TODO sits in `getFeedPage`
(`src/server/services/feed.ts:526`): `tasteKeywords: [], // Phase 6.1 wires the user's actual
taste keywords through here`. `pickItem` (~293-324) lowercases both sides and `drawWeight`
(`src/server/db/items.ts:84`) already multiplies `(1 + tagBoost × sharedTags)` — nothing
downstream of the array changes. `db/saves.ts` is the reads-home for `saved_item` (its header says
so) and `getSavedItems` shows the `savedItem ⋈ item ORDER BY saved_at DESC` join to copy.
Importing `db/saves` from `services/feed.ts` creates no cycle (saves.ts imports only schema + the
`Item` type). Colocated pure-fn tests in db files are precedent (`db/items.test.ts`).

**Steps:**

1. In `src/server/db/saves.ts`:
   - Pure, exported `deriveTasteKeywords(tagLists: string[][], cap: number): string[]` — flatten
     in given order (most-recent save's tags first, each item's stored tag order preserved),
     dedupe case-insensitively keeping the first-seen form (matches `pickItem`'s lowercase
     comparison), cap.
   - `getTasteKeywords(userId: string, opts: { cap?: number; scanLimit?: number } = {})` —
     defaults `cap: 24` (phase0's window), `scanLimit: 30` rows; select **only**
     `item.aestheticTags` via the `getSavedItems` join shape, `orderBy(desc(savedItem.savedAt))`,
     `.limit(scanLimit)`, feed through `deriveTasteKeywords`. Comment: one extra small query per
     feed page, deliberate — derived, never stored, so there is nothing to migrate or decay.
2. In `getFeedPage`: fetch weights and keywords in parallel —
   `const [rawWeights, tasteKeywords] = await Promise.all([getUserTopicWeights(userId), getTasteKeywords(userId)])`
   — pass `tasteKeywords` into `composePage`, delete the TODO comment.
3. New `src/server/db/saves.test.ts` (pure, no DB): flattens in recency order · dedupes
   case-insensitively keeping first-seen form · caps at the requested size (and default 24) ·
   returns `[]` for an empty history.
4. Integration (extend T1's describe): save `itemFour` as `otherUserId` with the file's
   established 5 ms `setTimeout` between saves so `saved_at` ordering is unambiguous (precedent
   ~line 226), then `taste keywords derive from the most recent saves, deduped in recency order` —
   `getTasteKeywords(otherUserId)` equals `["botanical plate", "sepia", "etching"]`.

**Commit:** `feat(feed): derive taste keywords from the reader's recent saves`

### T3 — Distribution tests: composition shifts, no filter bubble

**Verified at plan time:** the template is `feed.test.ts:234-277` ("mixes tiers at roughly the
configured ratio") with its rules commented at 213-233. The anti-bubble mechanisms are structural:
`topicCap: 3` per 12-card page and DRIFT+JUMP = 60% of slots using weights only to pick walk
*starts* (`DEFAULT_KNOBS`, `feed.ts:53-64`).

**Steps** — new `describe("composePage — learned weights (6.1)")` in
`src/server/services/feed.test.ts`, importing `WEIGHT_CAP` from `~/server/db/topics` so the tests
pin the real constant:

1. `a topic at the weight cap draws measurably more of the page, but never a majority` — same
   4-topic dense-graph fixture as the tier-mix test; run the same 8 fixed seeds
   (`mulberry32(hashSeed(\`learned-mix:${seed}\`))`) twice: uniform weights (all 1) vs
   `a: WEIGHT_CAP`, rest 1; knobs `{ ...DEFAULT_KNOBS, topicCap: 1000, pageSize: 1000 }`; fresh
   400-item pools per seed; `expect(cards).toHaveLength(pageSize)` every run. Pool each condition
   into its 8000-draw sample, then assert:
   - `boostedShareA > uniformShareA + 0.05` (the "measurably shifts" clause);
   - `boostedShareA < 0.5` (the "not overwhelmingly" clause — DRIFT/JUMP keep the majority
     weight-independent even at the cap);
   - sanity: `uniformShareA` within `0.25 ± 0.03`.
2. `under shipped knobs the per-page topic cap bounds even a capped-weight topic` — weights
   `a: WEIGHT_CAP` among 4, plain `DEFAULT_KNOBS` (pageSize 12, topicCap 3); compose one page per
   seed; assert every page filled and
   `cards.filter(c => c.topicId === "a").length <= DEFAULT_KNOBS.topicCap` — a fully-learned
   topic can never exceed a quarter of a shipped page.

(No pure bump-math unit test exists to write: the arithmetic is SQL, asserted at
1.5/2.0/2.5/3.0 in T1's integration tests.)

**Commit:** `test(feed): learned weights shift composition measurably without a filter bubble`

### T4 — Visibility: the combined save toast

**Verified at plan time:** two mutation call sites exist — `save-to-collection-sheet.tsx:57-74`
and `item-sheet.tsx:61-77` (the feed's long-press sheet; the feed e2e save goes through *this*
one). Four toast builders use `` `Saved to ${collection.name}` ``: `feed-screen.tsx:290`,
`item-shell.tsx:121`, `gallery-screen.tsx:359`, `app/dev/tokens/page.tsx:722`.
`sheets.test.tsx:36-47` hand-types the mocked `onSuccess` result as `{ collectionName: string }` —
this **fails typecheck** (not just tests) once components read `result.drift`, so it must change
in this same commit. TS lets `onSaved` callbacks ignore a newly added parameter, so widening the
prop is non-breaking. Pure-helper-plus-test in `src/lib/` is precedent (`source-label.ts`).
**e2e toast assertions survive as-is** — `e2e/item.spec.ts:318` is substring matching,
`e2e/feed.spec.ts:203` is the prefix regex `/^Saved to /`, `gallery.spec.ts` asserts no toast
text — verify by running, don't edit preemptively.

**Steps:**

1. New `src/lib/save-toast.ts`:
   `export type SaveDrift = { topicLabel: string; isNew: boolean } | null;` and
   `saveToastText(collectionName: string, drift: SaveDrift): string` →
   `Saved to ${name}` when drift is null, else
   `` `Saved to ${name} · ${drift.isNew ? "Now drifting toward" : "Drifting a little more toward"} ${drift.topicLabel}` ``.
   Colocated `save-toast.test.ts`: three cases (null / new / existing).
2. Widen `onSaved` in both `SaveToCollectionSheetProps` and `ItemSheetProps` to
   `(collection: { id: string; name: string }, drift: SaveDrift) => void`; pass `result.drift`
   through from both `onSuccess` handlers (the tRPC output type carries it automatically). Keep
   each sheet's existing invalidations **exactly** — `saves.collections/list/count` (+
   `saves.forItem` where present), and **no `feed.page`**.
3. Update the four call sites to `setToast(saveToastText(collection.name, drift))` (dev/tokens
   uses its `onToast`).
4. `sheets.test.tsx`: extend the mocked result type with `drift`, update existing `onSuccess`
   invocations, add `passes the drift through to onSaved` driving
   `onSuccess({ collectionName: "Art", drift: { topicLabel: "Cartography", isNew: true } }, ...)`.
5. Run the save-touching e2e specs once (`e2e/feed.spec.ts`, `e2e/item.spec.ts`) to confirm the
   longer toast still matches; only edit assertions if reality disagrees.

**Commit:** `feat(saves): combined toast says which topic the feed is now drifting toward`

### T5 — Docs

**Verified at plan time:** BUILD_PLAN 6.1 (`docs/BUILD_PLAN.md:258`) cites **"SPEC §3.3b" — a
phantom**; SPEC has §3.3 (Feed) and §3.4 (Save & share), no §3.3b. The 6.1 material lives across
§3.3/§3.4/§9. SPEC §9's personalisation paragraph (~line 399) still describes phase0 behavior.

**Steps:**

1. `SPEC.md` §9: rewrite the "Personalisation = topics, not items" paragraph to the shipped truth
   — a **new** save does `LEAST(3.0, weight + 0.5)` on the saved item's topic
   (`WEIGHT_BUMP`/`WEIGHT_CAP` in `db/topics.ts`), creating the row at 1.5 when absent (that
   creation is the only related-topic inference; no graph spillover); moves don't re-bump; unsave
   doesn't decrement; taste keywords are derived at feed time (last-24 unique tags over most
   recent saves), never stored; visibility is the combined save toast. Give §3.3's "related
   topics inferred from saved items" and §3.4's "Saves feed back into related-topic weighting"
   one-line pointers to §9.
2. `docs/BUILD_PLAN.md` 6.1: check the box, fix "§3.3b" → "§3.3/§3.4/§9", append the italic
   done-bar annotation naming the tests.
3. New `docs/PHASE6_WALKTHROUGH_6.1.md` in the 6.2 walkthrough's shape (executed date, branch,
   status, per-task evidence, "where the plan and reality disagreed"). Must record: the copy
   divergence from phase0 ("also"); and the two **documented-not-mechanized** edge cases —
   (a) an authed never-onboarded user can save from the public `/i/`//`/g/` pages, creating a
   single-row weights map (bounded: CORE is 40% of slots, topicCap 3/page, DRIFT/JUMP wander) and
   flipping `hasCompletedOnboarding` so `/onboarding` skips the picker for them forever —
   acceptable for an invite-gated app whose sign-up lands on onboarding, build nothing;
   (b) `LEAST` clamps a hand-set super-cap fixture weight down on its next bump (the integration
   fixture sets 7.0 — why T1's tests run as `otherUserId`).
4. `log.md`: narrative entry per CLAUDE.md's format, with the session-spend line from the shared
   script (omit on non-zero exit — never estimate).

**Commit:** `docs: close out 6.1 — feed learns from saves (SPEC §9, BUILD_PLAN, walkthrough, log)`

Then merge `feat/6.1-feed-learns-from-saves` back to `main` (merge commit) and push.

## Verification

- `bun run check` green at every commit; integration suites run with `DATABASE_URL` present
  (local Postgres up), not skipped.
- One run of `e2e/feed.spec.ts` + `e2e/item.spec.ts` after T4 (see the CLAUDE.md flakiness notes
  before believing any red).
- Manual, with `FEED_DEBUG`: save a handful of items in one topic, then fetch fresh feed pages —
  the debug `why` labels should visibly tilt toward that topic within the tier structure, and the
  combined toast should have named it.

## Out of scope (resist)

- **No decay, no normalization, no unsave decrement** — locked decisions.
- **No graph-neighbor spillover** — row creation is the inference mechanism.
- **No schema migration** — taste keywords are derived; `user_topic` is untouched.
- **No `feed.page` invalidation after saves** — per-request reads already deliver the learning.
- **No changes to `wander.ts` / `gallery-rail.ts`** — both walk the topic graph deliberately
  weight-blind; making them learn is a different (undecided) feature.
- **No onboarding-flag rework** for the never-onboarded-saver edge case — document, don't build.
- **No item-level NN personalisation** — dead since Phase 0.4, stays dead.

If one of these starts to look needed, **stop and re-plan** (that's hidden complexity, not a
detail).
