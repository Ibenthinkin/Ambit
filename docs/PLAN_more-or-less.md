# More or less — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-08-26 by Fable 5.1 (planning session), base `main` at `6ec8640`, branch
`feat/more-or-less` — a plain branch in `~/Dev/ambit`, never a worktree.

**Goal:** the "More of this" / "Less of this" pair of `docs/DESIGN_more-or-less.md`: a feedback
table and a cool table, a transactional write with exact undo, cools applied to drift/jump
landings under one knob, the shelf on Saved, "Showing less of" on Profile → Topics, the dev
readout, and the pair on every save surface.

**Two parts.** **Part 1 (Tasks 1–9) depends on nothing from Claude Design** — data, engine, API,
toasts, Saved chip, Topics section, dev panel, and the tests for all of it. Execute it now.
**Part 2 (Tasks 10–14) is the surfaces** and waits on Ben's instructions back from the Claude
Design session (`docs/BRIEF_more-or-less.md`); each of those tasks has a **`VERDICT:`** slot to
fill from his message before starting it. Commit Part 1 before Part 2; do not push or merge.

**Spec:** `docs/DESIGN_more-or-less.md` (D1–D7). Read it first; this plan does not repeat the
reasoning.

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task;
  `bunx prettier --write <files>` then `bun run check` (typecheck + lint + prettier + tests)
  before each commit. Commit per task, `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- **Teaching comments** (Ben is a returning webdev): explain the idiom where one appears —
  `SELECT … FOR UPDATE`, `xmax = 0`, an upsert's `RETURNING`, `useSyncExternalStore`, the
  optimistic `onMutate` / rollback shape, a softmax.
- Design-system guards that will fail a careless change: `src/no-rounded.test.ts` (no
  `rounded-*` outside its allow-list), `src/no-dangerous-html.test.ts`, no `font-semibold`,
  every `<img>` of an item through `lib/image-src.ts`, green only for SPEC §10's seven jobs.
- `bun run e2e:prod`, never `bun run e2e` (the dev overlay eats phone-width clicks); `lsof -ti:3000`
  first. After Task 4 (the engine moved) the suite also runs in **CI's shape** (CLAUDE.md's
  recipe). Fixtures must write `item_topic` rows (`writeMemberships`).
- `services/feed.integration.test.ts`'s cursor-stability test fails ~1 in 10 locally on a
  foreign-key error from a parallel suite's un-homed fixture; it is not evidence about this branch
  (CLAUDE.md explains).

## Review focus

1. A "less" on a topic the reader never picked must leave `user_topic` untouched (Task 2).
2. `coolStrength: 0` must reproduce today's page byte for byte for the same cursor (Task 4).
3. A flip (more → less on one item) must net to exactly one "less" effect (Task 2).
4. `clear` after the cap or floor clipped a step must reverse only what was applied (Task 2).
5. A retake clears cools; `setMine` and `setWeight` do not (Task 3).
6. The strip's optimistic rollback restores `feedback.mine` on error (Task 11).
7. No new green anywhere; marked = inverted ink (Tasks 10–13).

---

## Part 1 — needs nothing from Claude Design

### Task 1: Branch, schema, migration, constants

**Files:**

- Modify: `src/server/db/schema.ts` (after `seenItem`, ~L441): `itemFeedback`, `userTopicCool`
  per DESIGN D1, with doc comments.
- Modify: `src/server/db/topics.ts` (~L262–271): `MORE_STEP`, `LESS_STEP`, `WEIGHT_FLOOR`,
  `COOL_STEP`, `COOL_FLOOR` beside `WEIGHT_BUMP` / `WEIGHT_CAP`, same teaching comment style.
- Create: `drizzle/0015_more_or_less.sql` via `bun run db:generate --name more_or_less`
  (check the journal entry lands in `drizzle/meta/_journal.json`).
- Test: `src/server/db/schema.test.ts` if one exists, else a `topics.test.ts` assertion that the
  constants satisfy `0 < WEIGHT_FLOOR < 1 < WEIGHT_CAP`, `0 < COOL_FLOOR < COOL_STEP < 1`.

**Steps:**

- [ ] `git checkout -b feat/more-or-less` from `main`.
- [ ] Write the constants test; run `bunx vitest run src/server/db/topics.test.ts` → FAIL.
- [ ] Add the two tables and the constants. `bun run db:generate --name more_or_less`; read the
      SQL — two `CREATE TABLE`, FKs, one index; no change to `user_topic`.
- [ ] `bun run db:migrate` against the local database; the test → PASS.
- [ ] Check and commit: `feat(db): item_feedback + user_topic_cool, the more-or-less steps`.

---

### Task 2: `db/feedback.ts` — the transactional write with exact undo

**Files:**

- Create: `src/server/db/feedback.ts` — DESIGN D2's signatures: `setFeedback`, `clearFeedback`,
  `getFeedbackIds`, `getMoreItems`, `getUserTopicCools`, `warmTopic`, `clearUserCools`.
- Test: `src/server/db/feedback.integration.test.ts` (fixtures via `db/test-fixtures.ts`'s
  `insertHomedItems`; follow `topics.integration.test.ts`'s setup/teardown).
- Reuse: `isItemInTopic` (`db/items.ts` L129), `getSavedItems`'s projection (`db/saves.ts`) for
  `getMoreItems` — extract the shared select into a helper rather than copying it.

**Interfaces:** Consumes `userTopic`, `userTopicCool`, `itemFeedback`, `seenItem`, the constants.
Produces `FeedbackEffect`.

**Steps:**

- [ ] Write the tests, one `it` per row of DESIGN D7's first bullet, plus: `setFeedback` twice with
      the same verdict is a no-op returning the stored effect; a "more" on a new topic yields
      `isNewPick: true` and weight `1.25`; four "less" reach `COOL_FLOOR` and a fifth applies
      `coolApplied: 1`; `clear` after the floor reverses by the clipped amount only. Run → FAIL.
- [ ] Implement `setFeedback` as one `db.transaction` in D2's order (lock → reverse a flip → weight
      → cool → seen → row). Compute `weightApplied` from old/new read inside the transaction (a
      `SELECT … FOR UPDATE` on `user_topic`, then `UPDATE`; for the insert path old = 1.0). Comment
      why old is 1.0 for a new row (the same baseline `bumpTopicWeight` assumes).
- [ ] Implement `clearFeedback` (reverse, clamp, delete at cool 1), `warmTopic`, `clearUserCools`,
      the reads. Run → PASS.
- [ ] Check and commit: `feat(db): setFeedback / clearFeedback with exact reversal`.

---

### Task 3: The routers — `feedback.*`, `topics.cools` / `warm`, the retake, taste keywords

**Files:**

- Create: `src/server/api/routers/feedback.ts`; register in `src/server/api/root.ts`.
- Modify: `src/server/api/routers/topics.ts` — `cools`, `warm`.
- Modify: `src/server/db/onboarding.ts` (~L101) — `clearUserCools(tx, userId)` after
  `replaceUserTopicsTx(…, "overwrite")`.
- Modify: `src/server/db/saves.ts` `getTasteKeywords` (L163–181) — union `item_feedback` rows with
  `verdict = 'more'`, ordered by `created_at`/`saved_at` desc, same `scanLimit`/`cap`.
- Modify: `SPEC.md` §7 table (the six rows of DESIGN D4), §5 (the two tables), §9 (a "More or
  less" paragraph after "Personalisation = topics, not items").
- Test: `src/server/api/routers/routers.integration.test.ts` (new `describe("feedback")`),
  `routers.test.ts` (UNAUTHORIZED), `db/saves.test.ts` (`deriveTasteKeywords` is unchanged; the
  union is covered in the integration suite).

**Steps:**

- [ ] Tests first (DESIGN D7's third bullet). The slot-topic test mirrors `routers.integration`
      L479–504 for saves. Run → FAIL.
- [ ] Implement; `feedback.set` resolves the topic with the save rule verbatim (lift the four lines
      from `saves.ts` L120–124 into a shared `resolveSlotTopic(item, topicId?)` in `db/items.ts`
      and use it in both routers). `drift.topicLabel` via `getTopicLabel`.
- [ ] Run → PASS. SPEC edits. Check and commit: `feat(api): feedback router, topics.cools/warm,
      retake clears cools, "more" feeds taste keywords`.

---

### Task 4: The engine — cools on drift and jump landings, `coolStrength`

**Files:**

- Modify: `src/server/services/feed-knobs.ts` — `coolStrength: number` (JSDoc with the date and
  this design), `DEFAULT_KNOBS.coolStrength: 1`.
- Modify: `src/server/api/routers/feed.ts` `feedKnobsSchema` — `coolStrength: z.number().min(0).max(3)`.
- Modify: `src/server/services/feed.ts` — `composePage` / `planTopics` take
  `cools: ReadonlyMap<string, number>` (default `new Map()`); `hop()` (L302–327) multiplies by
  `coolOf(t) ** knobs.coolStrength`; `pickJump` (L380–403) draws its destination with
  `weightedPick` over the same factor; `getFeedPage` reads `getUserTopicCools(userId)` in the
  `Promise.all` (L1044–1058) and passes it. `FeedPage.debug` (under `FEED_DEBUG`) gains
  `cooled: number` — how many of the page's cards landed on a cooled topic.
- Modify: `src/components/feed/dev/use-dev-knobs.ts` — a `KNOB_SPECS` entry (section "Taste",
  0–2, step 0.1, note "0 ignores Less-of-this cools").
- Test: `src/server/services/feed.test.ts` (DESIGN D7's second bullet — the byte-for-byte test
  composes twice with the same seeded rng: once with no cools, once with cools and
  `coolStrength: 0`, and `expect(a).toEqual(b)`), `routers.test.ts` knob forwarding.

**Steps:**

- [ ] Tests → FAIL. Implement. `planTopics` must replay identically to `composePage` — it takes the
      same `cools` (it is how the pools are chosen; a cooled destination that `composePage` lands
      on must have had its pool fetched).
- [ ] `bun run bench:feed` before and after; note the p50 in the commit body (expect no movement —
      one indexed read).
- [ ] Run → PASS. Check and commit: `feat(feed): Less-of-this cools weigh drift and jump landings
      (coolStrength)`.

---

### Task 5: The toasts — `lib/feedback-toast.ts`

**Files:** Create `src/lib/feedback-toast.ts` + `feedback-toast.test.ts` (the seven strings of
DESIGN D5, modelled on `save-toast.ts` / `.test.ts`).

- [ ] Test → FAIL → implement → PASS. Commit: `feat(lib): feedbackToastText`.

---

### Task 6: Saved — the "More of this" shelf

**Files:**

- Modify: `src/components/saved/collection-chips.tsx` — a chip "More of this" after the collection
  chips, `selected` when `?shelf=more`, count from `feedback.list`'s length (or a `feedback.count`
  if the chips need it before the list loads — follow how `saves.count` is used).
- Modify: `src/components/saved/saved-screen.tsx` — read `shelf` from `useSearchParams`; when
  `more`, the wall renders `api.feedback.list` through the same `SavedTile`s; the badge calls
  `feedback.clear` with the same optimistic filter + "Undone" toast the unsave path uses (L63–81).
  The title block's count stays `saves.count`.
- Modify: `src/components/saved/saved-tile.tsx` — a `badge: "unsave" | "unmore"` prop; the
  `unmore` badge draws `Plus` (a 13–14 px `+`) in place of the filled bookmark, `aria-label="Undo
  More of this"`. **Look is provisional until Task 13's verdict**; keep it to the glyph swap.
- Test: `saved-screen.test.tsx` / `collection-chips.test.tsx` (existing files or beside them).
- Then `e2e/saved.spec.ts`: set "more" on a seeded item via a direct `feedback.set` call (through
  the UI once Task 10 exists; until then, via the tRPC endpoint with the test's session cookie, the
  way other specs seed state) → `/saved?shelf=more` shows it → badge → "Undone" → gone.

- [ ] Tests → FAIL → implement → PASS → `bun run e2e:prod e2e/saved.spec.ts`. Commit:
      `feat(saved): the More-of-this shelf`.

---

### Task 7: Profile → Topics — "Showing less of"

**Files:**

- Modify: `src/components/profile/topics-screen.tsx` — under the grouped `TopicLevels`, when
  `api.topics.cools` is non-empty: an `Eyebrow as="h2"` "Showing less of", rows
  `border-ink/8 … border-b py-3` with the label at 15 px and a text-link button "Warm up" (the
  tertiary link style, `button.tsx`'s), optimistic removal (`onMutate` patches `topics.cools`),
  `hub.toast("Warmed up ‹label›")`.
- Test: `topics-screen.test.tsx`; `e2e/profile.spec.ts` (or the spec that covers `/profile/topics`)
  — seed a cool via `feedback.set` "less", see the section, Warm up, gone.

- [ ] Tests → FAIL → implement → PASS → e2e. Commit: `feat(profile): "Showing less of" with Warm up`.

---

### Task 8: `/dev/feed` — the "Your topics" readout

**Files:** `src/components/feed/dev/knob-panel.tsx` (a `YourTopics` block under Session: twelve
rows "label · weight · cool" from `api.topics.mine` + `api.topics.cools` + `topicLabels`; the
weight shown as the raw number — this is the dev panel, the one place a weight may be a number),
`feed-screen.tsx` (pass the queries only when `isDev`), the panel's test.

- [ ] Tests → FAIL → implement → PASS. Commit: `feat(dev): Your topics readout on /dev/feed`.

---

### Task 9: Part 1 close — docs, log, the CI-shape run

- [ ] `bun run check` green. `bun run e2e:prod` at `main`'s count plus the new tests.
- [ ] The CI-shape run (CLAUDE.md's recipe, fresh `postgres:17-alpine` on 5433) — the engine moved.
- [ ] `CLAUDE.md`: an Architecture bullet "**More or less — 10-08-26**" (design, plan, branch, what
      spans files: the two tables, the write's exact undo, cools on landings under `coolStrength`,
      "more" in taste keywords, Part 2 pending Claude Design). `SPEC.md` §13 unaffected.
- [ ] `log.md` 10-08-26 entry: **Planned** (this plan, the brief), **Shipped** (Part 1), **Open /
      next** (Ben's Claude Design session → Part 2), the session-spend line from
      `python3 ~/.claude/scripts/session-spend.py --session <uuid>` (omit on non-zero exit).
- [ ] Commit: `docs: more-or-less Part 1 — CLAUDE.md, log`. **Do not push or merge.** Tell Ben
      Part 1 is built and Part 2 waits on his verdict.

---

## Part 2 — the surfaces, after Ben's verdict from Claude Design

> Each task below starts with a `VERDICT:` line. Fill it from Ben's message (geometry, states,
> order, glyph paths) before writing the first test. If the verdict renames anything, update
> DESIGN D6 and `feedback-toast.ts` in the same task. If the verdict adds a surface not listed
> here (brief §4 D), add a task for it in this file before building.

### Task 10: The tile sheet rows

**VERDICT:** _(row order relative to Share; marked-row treatment; glyph size)_

**Files:** `src/components/sheets/item-sheet.tsx` (two rows with the Share row's anatomy, L157–165;
marked state per verdict; tapping a marked row → `feedback.clear`), `src/components/icons/index.tsx`
(`Minus`, same grid as `Plus` L654; both exported), `feed-screen.tsx` (`onFeedback` → toast via
`feedbackToastText`; on "less", drop the card from the rendered pages). Tests: `item-sheet.test.tsx`,
`icons.test.tsx`; `e2e/feed.spec.ts` long-press → "More of this" → `/^More of this/`; long-press →
"Less of this" → the tile is gone.

- [ ] Tests → FAIL → implement → PASS → e2e. Commit: `feat(feed): More/Less rows on the tile sheet`.

### Task 11: The hover strip

**VERDICT:** _(order of −, +, bookmark; chip max-width; marked state on glass)_

**Files:** `src/components/feed/tile-actions.tsx` — two squares, optimistic against
`api.feedback.mine` with the bookmark's `onMutate`/`onError`/`onSettled` shape (L61–84); chip
`max-w-[50%]` or per verdict. Tests: `tile-actions.test.tsx` (rollback on error);
`e2e/desktop.spec.ts` beside the strip test (L175–235): hover → `+` → toast → the square inverted.

- [ ] Tests → FAIL → implement → PASS → e2e. Commit: `feat(feed): More/Less on the hover strip`.

### Task 12: The item screen — rail, phone placement, keys

**VERDICT:** _(rail order; the phone answer A/B/C/D with geometry; marked state)_

**Files:** `src/components/ui/rail-toolbar.tsx` (two `RailButton`s with `pressed`, via a new
`feedback` prop or the `extra` slot — per verdict), `src/components/item/item-screen.tsx` (the
`feedback.set` mutation keyed on `current.id` with `topicId: current.topicId`; pass `topicId` to
`SaveToCollectionSheet` too; `+`/`=`/`−` in the `onKey` `useEffectEvent` L533–552; "less" calls
`advance(1)` when a next page exists; the phone control per verdict — if A, a row component in
`item-facts.tsx`'s phone stack; if B, `pill-toolbar.tsx` changes and `no-rounded.test.ts`'s
allow-list is unchanged; if C, a `RailDisc`-like 56 px disc in the pill grid's `col-start-1` plus
a two-row `BottomSheet`). `item-shell.tsx` (articles) gets the same pair through `Toolbar`.
Tests: `item-screen.test.tsx`, `rail-toolbar.test.tsx`, `pill-toolbar.test.tsx` as touched;
`e2e/item.spec.ts` (phone) and `desktop.spec.ts` (rail) — remember the 250 ms mouse-summon
throttle (`toPass`).

- [ ] Tests → FAIL → implement → PASS → e2e both projects. Commit: `feat(item): More/Less in the
      chrome, keys + / −`.

### Task 13: Saved badge and Topics section — final look

**VERDICT:** _(badge glyph/state; "Showing less of" row treatment)_

**Files:** `saved-tile.tsx`, `topics-screen.tsx` — restyle Tasks 6–7's provisional look to the
export. Tests already exist; update assertions.

- [ ] Commit: `style(saved,profile): More-of-this badge and Showing-less-of per the export`.

### Task 14: Close — docs, SPEC §10, log, Ben's look

- [ ] `SPEC.md` §3 (the surfaces per screen), §10 (one line: "a marked More/Less control is
      inverted ink — the accent's seven jobs are unchanged"), §12 (the new tests).
- [ ] `docs/DESIGN_more-or-less.md` **Status** line → built; D6 updated with the verdict.
- [ ] `docs/BRIEF_more-or-less.md` gets the `> **Answered.**` blockquote the redesign's brief has.
- [ ] `CLAUDE.md` bullet → Part 2 shipped; `log.md` extends the day (second spend line).
- [ ] `bun run check`, `bun run e2e:prod`, the CI-shape run. **Do not push or merge.**
- [ ] **Ben's look** (numbered, for his device pass at 402 / 1440 / the tailnet phone):
      1. Long-press a tile → More of this → toast names the topic → `/saved?shelf=more` shows it.
      2. Less of this on a drift card → the tile leaves → `/profile/topics` shows the topic under
         "Showing less of" → Warm up removes it.
      3. On the item screen: + / − keys on desktop; the phone control where the verdict put it.
      4. `/dev/feed` → Your topics shows the weight and cool moving; `coolStrength 0` → the same
         page as before for the same cursor (Restart feed between).
      5. Nothing green that wasn't green before.

## Self-review

**Spec coverage.** D1 → Task 1; D2 → Task 2; D3 → Task 4 + 8; D4 → Task 3; D5 → Task 5; D6 →
Tasks 6, 7, 10–13; D7 → every task's test step plus Task 9's CI-shape run. The brief's §4 question
lands in Task 12's VERDICT; its §5 items in Tasks 10, 11, 13.

**Type consistency.** `FeedbackEffect` (Task 2) is what the router (Task 3) maps to
`{ verdict, drift }`; `FeedbackDrift` (Task 5) has the save toast's shape so the strip and sheet
can reuse their toast plumbing; `SavedItemRow` is shared by `saves.list` and `feedback.list`
(Task 2 extracts the projection) so `SavedTile` needs no second type.

**Review focus** → 1: Task 2's "less on unpicked" test; 2: Task 4's `toEqual` test; 3: Task 2's
flip test; 4: Task 2's clipped-reversal test; 5: Task 3's retake + `setMine` tests; 6: Task 11's
rollback test; 7: Task 14's look item 5 and the absence of any new `text-accent` / `bg-accent` in
the diff (`git diff main --stat -- src | grep -c accent` should be 0 for added lines).
