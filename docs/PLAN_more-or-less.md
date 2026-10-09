# More or less — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-08-26 by Fable 5.1 (planning session), base `main` at `6ec8640`; **Part 2's
verdicts filled 10-09-26** from Ben's Claude Design export (base is now `main` at `67907c0`).
Branch `feat/more-or-less` — a plain branch in `~/Dev/ambit`, never a worktree.

**Goal:** the "More of this" / "Less of this" pair of `docs/DESIGN_more-or-less.md`: a feedback
table and a cool table, a transactional write with exact undo, cools applied to drift/jump
landings under one knob, the shelf on Saved, "Showing less of" on Profile → Topics, the dev
readout, and the pair on every save surface.

**Two parts, both executable now.** **Part 1 (Tasks 1–9)** is data, engine, API, toasts, the
Saved shelf, the Topics section, the dev panel, and their tests. **Part 2 (Tasks 10–14)** is the
surfaces. Ben's Claude Design session answered the brief on 10-09-26 and the export is checked in
at **`docs/design_handoff_more_or_less/`** — its `README.md` is the authority for every look in
this plan, and `Ambit - More or Less 1a Screens.dc.html` is the spec (open it in a browser with
`support.js` beside it; frames P1–P3 phone, D1/D2B/D3B desktop). Where the README and a frame
conflict, the frame wins (the redesign's convention). Each Part 2 task's `VERDICT:` line is filled
from it; details marked _(explorations)_ come from `reference/Ambit - More or Less
(explorations).dc.html`, which the README calls "not yet locked" — build them as drawn and Task 14
lists each for Ben's look. Commit Part 1 before Part 2; do not push or merge.

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
  (check the journal entry lands in `drizzle/meta/_journal.json`). **Number clash:**
  `docs/PLAN_usage.md` (10-09, uncommitted) also claims `0015` for `usage_event`. Whichever lands
  first is 0015 and the other is 0016 — `db:generate` numbers from the journal, so read the name it
  produced and use that everywhere this plan says 0015.
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

**Files:** Create `src/lib/feedback-toast.ts` + `feedback-toast.test.ts` (the seven toast strings
of DESIGN D5 **and `feedbackNoteText`** — the mono line under a marked pair, three strings —
modelled on `save-toast.ts` / `.test.ts`). The `Toast` component already sets Geist Mono caps, so
the strings are written in sentence case and the CSS does the uppercasing the frames show.

- [ ] Test → FAIL → implement → PASS. Commit: `feat(lib): feedbackToastText`.

---

### Task 6: Saved — the "More of this" shelf

**Files:**

- Modify: `src/components/saved/collection-chips.tsx` — a `Chip size="sm"` **straight after
  "All"**: an 11 px `Plus` (`strokeWidth={2.6}`) then "More of this", **no count** (the drawing
  has none); `selected` when `?shelf=more`. After it, before the collection chips, a vertical
  hairline divider (`aria-hidden`, `border-hairline border-l border-ink/22 my-1 mx-0.5
  self-stretch`). _(explorations — the Saved frame of the reference page.)_
- Modify: `src/components/saved/saved-screen.tsx` — read `shelf` from `useSearchParams`; when
  `more`, the wall renders `api.feedback.list` through the same `SavedTile`s; the badge calls
  `feedback.clear` with the same optimistic filter + "Undone" toast the unsave path uses (L63–81).
  The title block's count stays `saves.count`.
- Modify: `src/components/saved/saved-tile.tsx` — a `badge: "unsave" | "unmore"` prop; the
  `unmore` badge is the same 30 px glass square with a 14 px `Plus` (`strokeWidth={2.4}`) in
  `text-ink` — **not green, not inverted** — `aria-label="Undo More of this"`. _(explorations.)_
  `Plus` gains a `strokeWidth` prop in Task 10; if Task 6 runs first, add it here (default 1.5).
- Test: `saved-screen.test.tsx` / `collection-chips.test.tsx` (existing files or beside them).
- Then `e2e/saved.spec.ts`: set "more" on a seeded item via a direct `feedback.set` call (through
  the UI once Task 10 exists; until then, via the tRPC endpoint with the test's session cookie, the
  way other specs seed state) → `/saved?shelf=more` shows it → badge → "Undone" → gone.

- [ ] Tests → FAIL → implement → PASS → `bun run e2e:prod e2e/saved.spec.ts`. Commit:
      `feat(saved): the More-of-this shelf`.

---

### Task 7: Profile → Topics — "Showing less of"

**Files:**

- Modify: `src/components/profile/topics-screen.tsx` — between the "Your topics" section and the
  "Want to start over?" line, when `api.topics.cools` is non-empty _(explorations — the Topics
  frame)_: a `section` `mt-[30px]`; header row `flex justify-between border-ink/14 border-b pb-2`
  with `Eyebrow as="h2"` "Showing less of" left and the count (mono, same size) right; rows
  `flex items-baseline justify-between border-ink/10 border-b py-[13px]`, the label 15 px
  `text-ink/78`, a `TextLink bracket` button at 14 px reading "Warm up" (renders `[Warm up..]`);
  under the rows a helper `text-ink/55 mt-[10px] text-[13px] leading-[1.45]`: `Cooled by "Less of
  this". The feed won't drift or jump to these until you warm them up.` Optimistic removal
  (`onMutate` patches `topics.cools`), `hub.toast("Warmed up ‹label›")`; hidden when empty.
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

## Part 2 — the surfaces, per the handoff

> Every look below is the handoff's (`docs/design_handoff_more_or_less/README.md`; the frames in
> `Ambit - More or Less 1a Screens.dc.html`). `VERDICT:` lines are filled. _(explorations)_ marks a
> detail from `reference/…(explorations).dc.html` that the README calls not yet locked — build it
> as drawn; Task 14 lists each for Ben's look. **Nothing in Part 2 touches the pill, the rail or
> the Share disc** — the toolbars are unchanged (README decision 1). Colour notes: the frames'
> `rgba(255,255,255,.32)` borders etc. are the ink alpha ladder (`border-ink/32`); `#0E0E0E` on
> `#F2F2F2` is `bg-ink text-on-accent` (how a selected `Chip` is drawn); `#8A8A8A` / `#9A9A9A`
> mono is `text-ink/55`; `#BDBDBD` is `text-ink/78`.

### Task 10: The pair itself — `MoreOrLess`, the glyphs, the note line

The one component every surface but the sheet rows and the strip squares renders.

**VERDICT:** a worded pair, order **Less → More** (left → right), square, **on the page, never on
glass**. Three sizes:

| `size`    | button | label | glyph | icon–label gap | grid                                  | gap   |
| --------- | ------ | ----- | ----- | -------------- | ------------------------------------- | ----- |
| `phone`   | 48 px  | 15 px | 16 px | 9 px           | `1fr 1fr`, full content width         | 8 px  |
| `desktop` | 48 px  | 16 px | 16 px | 10 px          | `220px 220px`, fixed, left-aligned    | 10 px |
| `reader`  | 52 px  | 16 px | 16 px | 10 px          | `1fr 1fr`, the full 720 reader width  | 10 px |

States (the README's table): **rest** transparent, 1 px `border-ink/32`, `text-ink` label and
glyph; **hover** `bg-ink/6`, `border-ink/60`, `text-ink-hi`, plus the 2 px inset bottom accent
underline (`shadow-[inset_0_-2px_0_var(--color-accent)]` — the accent's existing hovered-control
job), 120 ms ease; **focus-visible** = the global green ring (nothing added); **pressed**
`active:scale-[0.97]` over 90 ms; **on** `bg-ink border-ink text-on-accent`, fill swap 120 ms;
**on + hover** `bg-ink-hi` + the underline. `aria-pressed` on each button; tapping the on button
clears. Glyphs: Less `M6 13h14`, More `M13 6v14M6 13h14` on the 26 grid, stroke 2, round caps.

**Note line while on** (under the pair): mono 10.5 px uppercase `text-ink/55`, leading 1.5,
`mt-[10px]`, text from `feedbackNoteText` (DESIGN D5).

**Files:**

- Create: `src/components/feedback/more-or-less.tsx` (client). Props
  `{ itemId, topicId, topicLabel, size, authed, onToast, onRequireAuth, className? }`. Reads
  `api.feedback.mine` (`enabled: authed`); `feedback.set` / `feedback.clear` **optimistic against
  `feedback.mine`** with the strip's `onMutate` cancel / set / `onError` rollback / `onSettled`
  invalidate shape; toast through `feedbackToastText` / `UNDONE_TOAST`; on settle also invalidate
  `feedback.list`, `topics.cools`, `topics.mine`. Signed out: no query, both buttons call
  `onRequireAuth`. Markup: `<div role="group" aria-label="More or less of this">` → two
  `<button type="button" aria-pressed>` → the note `<p>` while on. Teaching comments: the
  optimistic shape, why `aria-pressed` and not `aria-checked`.
- Modify: `src/components/icons/index.tsx` — `Minus` (26 grid, `M6 13h14`, round caps) beside
  `Plus` (L654); both take `strokeWidth?` (default 1.5 so `Plus`'s one existing use is unchanged;
  the pair passes 2, the strip 2.2, the Saved badge 2.4, the chip 2.6). `Plus`'s path
  (`M13 5.5v15M5.5 13h15`) is the design's glyph half a pixel longer per arm — reuse it rather than
  ship two pluses.
- Modify: `src/lib/feedback-toast.ts` — `feedbackNoteText` if Task 5 didn't add it.
- Test: `more-or-less.test.tsx` (order, both `aria-pressed` states, clear path, rollback restores
  `feedback.mine`, signed-out → `onRequireAuth` and no query, note text per verdict and with a null
  topic), `icons.test.tsx` (`Minus` renders, `strokeWidth` forwarded).

- [ ] Tests → FAIL → implement → PASS. Commit: `feat(ui): MoreOrLess — the Less-of-this /
      More-of-this pair`.

---

### Task 11: The item screen — pictures (phone, desktop single, spread) + keys

**VERDICT:** _"the pair follows the thing it's about."_ No rail buttons, no pill change, no disc.

- **Phone single (P2):** the first row under the picture — `padding: 18px 22px 0`, `size="phone"`;
  the title 30 px below the pair. Today the `Column` is `pt-[28px]` and `ItemFacts`'s `<h1>` is
  `mt-[8px]` (36 px picture → title); now `Column pt-[18px]` → pair → an `mt-[22px]` wrapper →
  `ItemFacts` (its `mt-[8px]` makes the 30).
- **Desktop single (D2B):** inside `ItemFactsWide`'s third (`2fr`) column, `mt-[22px]` under the
  28 px summary — the frame calls that text "the title"; in the app the 28 px text in that column
  is the summary, and the title is column two's italic `<h1>` — and above the bracket link-out
  (which keeps its `mt-5`). No summary → the pair leads the column. `size="desktop"`,
  `220px 220px`. **Match this one exactly** (the README says it matters most).
- **Desktop spread (D3B):** **one pair per figure**, `mt-6` under each 40 px title, above the
  maker block (which keeps its own `mt-6`). Keyed on the figure's item; state is per figure.
- **Phone magazine (P3):** no such view exists — the spread is `desktop && layout === "spread"` —
  so there is nothing to build; DESIGN D6 records the frame for when one does.
- **A "less" does not advance the rail.** DESIGN D6's `advance(1)` is dropped: P3 shows the marked
  picture staying put, and the inverted button, the note and the toast are the acknowledgement.
- **Keys** (pictures only): `+` / `=` → more, `-` → less, both toggling, in the `onKey`
  `useEffectEvent` (`item-screen.tsx` L533–552) beside `M`. Articles get no keys in this cut.

**Files:**

- Modify: `src/components/item/item-facts.tsx` — `ItemFacts` and `ItemFactsSpread` take
  `feedback?: (item: RailItem) => React.ReactNode`, a **render slot**: `ItemFactsWide` places it
  after the summary `<p>` (before the link-out), `ItemFactsSpread` after each `<Title>`; the
  column layout does not place it (the phone pair sits above `ItemFacts`, in the screen). Comment
  why a slot: three layouts share one placement rule, and this file stays pure (no tRPC, no state).
- Modify: `src/components/item/item-screen.tsx` — `const feedbackFor = (item: RailItem) =>
  <MoreOrLess key={item.id} itemId={item.id} topicId={item.topicId} topicLabel={item.topicLabel}
  size="desktop" authed={authed} onToast={setToast} onRequireAuth={() => auth.openAuth("signup")} />`
  passed to both wide layouts; the phone stack renders `size="phone"` for `current` directly in
  the `Column` before `ItemFacts` (inside the same `Rise delayMs={50}`); the keys; and
  `SaveToCollectionSheet` gets `topicId={current.topicId}` (the save router already takes it —
  the slot-topic rule for Save, DESIGN D2's last paragraph).
- Test: `item-facts.test.tsx` (slot position in `wide` and `spread`; absent in `column`),
  `item-screen.test.tsx` (phone pair rendered above the facts, `+`/`-` call `feedback.set`, a
  "less" leaves `index` alone, `topicId` reaches the save sheet), `e2e/item.spec.ts` (phone: scroll
  the pair into view, tap "More of this" → toast `/^More of this/`, the button `aria-pressed=true`;
  tap again → "Undone"), `e2e/desktop.spec.ts` (D2B: the pair inside the Information section after
  the summary; Magazine view: two `role="group"` pairs). The 250 ms mouse-summon throttle still
  applies to anything that wakes the chrome (`toPass`).

- [ ] Tests → FAIL → implement → PASS → e2e both projects. Commit: `feat(item): the pair under the
      picture, under the title, per figure; keys + / -`.

---

### Task 12: The item screen — articles (`FinishedRow`)

**VERDICT:** at the **end of the text, after the source link**, under a "Finished" label, above
"Where Ambit would wander next"; never mid-text. Phone and desktop (P1 / D1):

- Phone: block `mt-[34px] border-ink/14 border-t pt-[14px]`; one mono 10.5 px `text-ink/55` line
  `Finished · 4 min read` (`Finished` alone when `readingMinutes` is null); pair `mt-[12px]`
  `size="phone"`; the note line.
- Desktop (`md` and up): block `mt-12` (48 px) `border-ink/16 border-t pt-[14px]`; the label is two
  mono 11 px spans in `flex justify-between` — `Finished` left, `4 min read` right; pair `mt-4`
  `size="reader"` (52 px); the note.
- `WanderNext` below keeps its own `mt-[44px]` (the frames show 40 / 56; the README ranks the
  article's spacing below the picture screens' — accepted tolerance, say so in a comment).

**Files:**

- Create: `src/components/item/finished-row.tsx` (client):
  `{ itemId, topicId, topicLabel, readingMinutes }` → the label + `MoreOrLess`. It takes toast and
  auth from **`useItemShell()`**, a small context `ItemShell` now provides
  (`{ authed, toast(text), requireAuth() }`): the row is rendered by the **server** page between
  `ReaderItemBody` and `WanderNext`, so no prop from the shell can reach it, and a second `Toast`
  on one screen would be wrong. Teaching comment: context as "props across a server boundary".
- Modify: `src/components/item/item-shell.tsx` — the provider (`setToast`, `auth.openAuth`,
  `authed`); `src/app/i/[itemId]/page.tsx` — `topicLabelsFor([item.topicId])` for the article
  branch too, then `<Rise delayMs={90}><FinishedRow … /></Rise>` between the body's `Rise` and
  `WanderNext`'s.
- Test: `finished-row.test.tsx` (label with and without minutes; tap → the context's toast;
  signed out → `requireAuth`), `item-shell.test.tsx` (the context reaches a child),
  `e2e/item.spec.ts` article: scroll to "Finished" → "Less of this" → toast `/^Less of this/`.

- [ ] Tests → FAIL → implement → PASS → e2e. Commit: `feat(item): Finished · N min read, with the
      pair, at the end of an article`.

---

### Task 13: The feed — tile sheet rows, hover strip, the veil

**VERDICT:**

- **Sheet** _(explorations)_: two rows **after Share**, in order **Less of this** (−) then **More
  of this** (+), the Share row's anatomy (`item-sheet.tsx` L157–165: 18 px glyph at stroke 2,
  15 px label, `ink/8` hairline, 13 px vertical padding). **Marked row:** the glyph at 16 px inside
  a 24 px `bg-ink` square in `text-on-accent` ink (stroke 2.2), and a trailing mono 10.5 px
  `text-ink/55` "On · tap to undo"; hover → the trailing text reads "Undo" in `text-ink`. Tapping a
  marked row clears. The sheet closes; the feed's toast rises.
- **Strip** _(explorations)_: the squares right-aligned in order **−, +, bookmark**, 32 px, 6 px
  gaps; the chip `max-w-[50%]`. Square states: rest = the strip's glass; hover `bg-bg/48
  border-ink/30 text-ink-hi`; pressed `active:scale-[0.94]`; **marked** `bg-ink text-on-accent`,
  no glass border, keyline `shadow-[0_0_0_0.5px_rgba(14,14,14,0.45),0_2px_8px_rgba(0,0,0,0.25)]`;
  marked + hover `bg-ink-hi` + the accent underline. Glyphs 15 px at stroke 2.2. Optimistic against
  `feedback.mine` exactly as the bookmark is against `saves.ids` (`tile-actions.tsx` L61–84);
  `onPointerDown={stop}` like every strip control.
  - **Deferred, not built, on Ben's list:** the explorations' "a marked square stays visible after
    hover ends, like a saved bookmark" — today's strip is hover-only, bookmark included, so that is
    a strip decision, not a More/Less one; and the "mono label after 400 ms" on a square — no
    tooltip primitive exists, `aria-label` carries the name.
- **The veil** _(explorations; replaces DESIGN D6's "remove the tile")_: a rendered card whose id is
  in `feedback.mine.less` is **veiled in place** — the masonry must not move — by a sibling overlay
  in the `group/tile relative` wrapper (the Saved badge's pattern: a sibling, so its clicks never
  reach the tile's press handlers): `bg-bg/82`, mono 11 px `text-ink/78` "Less of this" over a
  14 px `TextLink bracket` button "Undo" (renders `[Undo..]`) → `feedback.clear` → the veil lifts,
  toast "Undone". The card is `seen_item` now, so the next load skips it. Phone and desktop alike:
  the veil lives in the grid, not in the strip.

**Files:** `src/components/sheets/item-sheet.tsx` (the two rows; an `onFeedback(verdict)` prop;
`marked: Verdict | null` from the screen), `src/components/feed/tile-actions.tsx` (two squares),
a new `src/components/feed/tile-veil.tsx` mounted by the card wrapper (`FeedGrid` — find the
`group/tile relative` wrapper the strip already uses), `src/components/feed/feed-screen.tsx`
(`api.feedback.mine` → `lessIds` / the sheet's `marked`; `onFeedback` → `feedback.set` → toast
via `feedbackToastText`; `onUndo` → `feedback.clear` → "Undone"). Tests: `item-sheet.test.tsx`
(rows, order, marked trailing text, clear), `tile-actions.test.tsx` (order, marked classes,
rollback restores `feedback.mine`), `tile-veil.test.tsx`; `e2e/feed.spec.ts` long-press → "More of
this" → toast `/^More of this/`; long-press → "Less of this" → `[Undo..]` on that tile and the
grid's height unchanged → Undo → the veil gone; `e2e/desktop.spec.ts` strip `−` / `+` beside the
existing strip test (L175–235).

- [ ] Tests → FAIL → implement → PASS → e2e both projects. Commit: `feat(feed): More/Less on the
      tile sheet and the hover strip; a Less veils the tile in place`.

---

### Task 14: Close — docs, SPEC, log, Ben's look

- [ ] `SPEC.md` §3 (the pair per screen and where it sits), §10 (one line: "a marked More/Less
      control is inverted ink — the accent's seven jobs are unchanged; the pair uses two of them,
      the hover underline and the ring"), §12 (the new tests).
- [ ] `docs/DESIGN_more-or-less.md` **Status** → built. (`docs/BRIEF_more-or-less.md` already
      carries its **Answered** note.)
- [ ] `CLAUDE.md` bullet → Part 2 shipped, naming `docs/design_handoff_more_or_less/`; `log.md`
      extends the day (second spend line).
- [ ] `bun run check`, `bun run e2e:prod`, the CI-shape run. **Do not push or merge.**
- [ ] **Ben's look** (numbered, for 402 / 1440 / the tailnet phone):
      1. Phone picture: one short scroll → the pair under the picture → More → the toast names
         the topic, the button inverts, the note appears → `/saved?shelf=more` shows it.
      2. Desktop picture: the pair under the 28 px summary in the Information section's third
         column, 220 + 220; Magazine view: one pair per figure under each title; `+` / `-` keys.
      3. Article, both widths: "Finished · N min read" after the source link, the pair, then
         "Where Ambit would wander next".
      4. Feed: long-press → Less → the tile veils in place and nothing moves → `[Undo..]`; on the
         desktop the strip reads − + bookmark with the chip at 50 %.
      5. Saved: the "More of this" chip with its + and the hairline; Topics: "Showing less of"
         with the count and `[Warm up..]`.
      6. `/dev/feed` → Your topics moves; `coolStrength 0` → the old page for the same cursor
         (Restart feed between).
      7. Nothing green that wasn't green before.
      8. _(explorations, deferred — two decisions)_ Should a marked strip square stay visible after
         hover ends? Want the 400 ms mono label on strip squares?

## Self-review

**Spec coverage.** D1 → Task 1; D2 → Task 2; D3 → Task 4 + 8; D4 → Task 3; D5 → Task 5; D6 →
Tasks 6, 7, 10–13 (D6 itself is rewritten to the handoff); D7 → every task's test step plus Task 9's CI-shape run. The brief's §4 question
is answered 1a (Tasks 11–12); its §5 items are Tasks 6, 7, 10 and 13.

**Type consistency.** `FeedbackEffect` (Task 2) is what the router (Task 3) maps to
`{ verdict, drift }`; `FeedbackDrift` (Task 5) has the save toast's shape so the strip and sheet
can reuse their toast plumbing; `SavedItemRow` is shared by `saves.list` and `feedback.list`
(Task 2 extracts the projection) so `SavedTile` needs no second type.

**Review focus** → 1: Task 2's "less on unpicked" test; 2: Task 4's `toEqual` test; 3: Task 2's
flip test; 4: Task 2's clipped-reversal test; 5: Task 3's retake + `setMine` tests; 6: Task 11's
rollback test; 7: Task 14's look item 5 and the absence of any new `text-accent` / `bg-accent` in
the diff (`git diff main --stat -- src | grep -c accent` should be 0 for added lines).
