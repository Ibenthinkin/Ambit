# Plan: addressing the onboarding critique

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Only Cut 1 is executable cold today.** Cuts 2–5 are scoped and sequenced here but each waits on a decision in §0 that only Ben can make; a Fable session expands the chosen cut into cold-executable tasks once he has.

**Goal:** Work through every item in `docs/NOTES_onboarding-critique.md` (Ben's 10-05-26 walk of First Exhibition) without touching the mechanics he judged good — the steps, the playoff, the scoring, the reading default, the stored taste.

**Architecture:** Five cuts, each a plain branch off `main`, each shippable alone, Ben looking on phone + 1440 between them. Cut 1 is the structural trims that need no design decision and ships first. Cut 5 (accent + buttons, sitewide) is the only one that reaches beyond onboarding; everything else inherits its tokens, so it runs as soon as Ben has chosen the model. Copy is applied last so nothing is written twice.

**Tech stack:** Next.js 16 / React 19, Tailwind v4 tokens in `src/styles/globals.css`, Drizzle (`bun run db:generate`), Vitest + Testing Library, Playwright (`bun run e2e:prod`, plus the CI-shape run in CLAUDE.md).

**Spec:** `docs/NOTES_onboarding-critique.md` (the list), `docs/DESIGN_first-exhibition.md` (what is built and why), `docs/first-exhibition/study-design.md` + the prototype (what the reveal should recover; §4 of this plan is the gap list, read 10-05-26).

## Global constraints

- **No mechanics change.** `score.ts`, `picks.ts`, `show.ts`, `taste.ts`, `compass.ts`, `temperament.ts` keep their rules. `BANK_VERSION` stays 2 for wording fixes; it bumps only if a question's *meaning* changes (Cut 2's pass penalty would).
- **Below 768 px nothing gets smaller.** Every sizing change is `md:` and up; the phone layouts were not criticised except for corners and copy.
- **Every `<img>` of an item is `imageSrc()`** — the CSP blocks anything else.
- **The e2e helper steers by `data-topics`**, never by label (`e2e/support.ts` `answerQuestionnaire`; `lib/interview/path.ts` is its pure mirror). Copy can change freely; the attributes cannot.
- **`bun run check` green after every task; `bun run e2e:prod` and the CI-shape run before each cut merges.**
- **Comment generously** — the repo teaches Ben the stack (memory: repo-as-teaching-tool).
- Don't run `prettier --write` over `src/server` (it rewrites recorded fixtures).

## Review focus

Inputs no task's tests exercise that are most likely to bite:

1. **A reader on a bank without steps** (a test bank) after About you is removed — the progress line's `${answers.length + 1} of ${asked.length}` branch must still read right. *Pinned in Task 1.3.*
2. **A retake after Cut 1 deploys** — `onboarding.complete` no longer takes `about`; a stale tab from before the deploy sends it. Zod must *strip*, not reject. *Pinned in Task 1.2.*
3. **A wing picture that fails to load** after its caption is removed — the card must fall back to the text card *with* the label, or the reader faces a blank button. *Pinned in Task 1.5.*
4. **A wide column on the picture steps and a narrow one on the text steps** — the switch happens between questions; `Rise` must not jump horizontally. *Pinned in Task 1.7.*
5. **Reduced motion** on a swipe stack (Cut 2) — the prototype's `reduce ? 80 : 300` shortcut must survive the port; Ben's Macs run Reduce Motion on.

---

## 0. Decisions Ben makes (each names the cut it unblocks)

Recommendations are mine; the plan runs on them where it can and stops where it cannot.

| #   | Decision                                                                                                                                              | Recommendation                                                                                                                                                                                                                                                                                                                                                              | Unblocks |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1  | **The new accent.** One colour, or keep the four-way knob (`[data-accent]`, Settings → Appearance)?                                                    | One colour, knob retired (`ACCENTS` shrinks to one, the sheet goes, the e2e persistence test goes). Candidate to look at first: the prototype's Klein blue in its dark-mode form, `#8E9BFF` — close to the lavender `--color-focus-ring #a8aeff` the Lift already uses, so the app would have *one* blue. Ben picks the hex; a swatch page on `/dev/tokens` shows it live. | Cut 5    |
| D2  | **The button model** — shape and behaviour, everywhere.                                                                                               | The prototype's: square corners, hairline outline, small-caps/uppercase label, filled only for the one primary action; pressed = filled. Chips (Either/Neither, amounts, rather-not) follow the same rule as small outlined squares. Decide whether pills survive anywhere (the toolbars are pills by the handoff; I'd leave the pill/rail toolbars alone in this cut).     | Cut 5    |
| D3  | **How pictures are asked.** (a) swipe stack for Keep + widened grids elsewhere (the prototype's shape); (b) one scrolling feed with tap-to-keep for Keep; (c) bigger grids only. | **(a).** Wings and pairs are *comparisons* and need to be seen together; Keep is the one step that is a sequence, and the prototype already had the stack (drag, buttons, arrow keys, `Keep`/`Pass` stamps). A feed suits only Keep and would duplicate the real feed. With (a), decide **D3b:** does a pass score −0.5 on the picture's first tag (prototype) or nothing (design D4)? I'd take −0.5: a swipe is an explicit no. That is a meaning change → `BANK_VERSION = 3`. | Cut 2    |
| D4  | **Category names** — the twelve wings, especially "Body & mind".                                                                                       | After Cut 1 the wing label is no longer printed on the picture, so it survives only as the text fallback and in the reveal's subtitle and `noun`. Ben renames in `interview-wings.ts` via the copy deck (Cut 3). Suggested direction: nouns a reader would say — "Anatomy", "Living things", "Space", "Machines", "Cities", "People", "Myth & ritual", "Made things", "Food & home", "Stage & screen", "Land, sea & sky", "Creatures". | Cut 3    |
| D5  | **The two free-text questions** — keep two, merge to one, or drop.                                                                                    | Merge to one, late, optional, with a concrete prompt and placeholder examples instead of "on the internet". Ben writes it in the copy deck. `look-at` keeps its id; `read-watch` retires (logged v2 answers stay readable).                                                                                                                                                 | Cut 3    |
| D6  | **The reveal's name** — away from "First Exhibition", toward feed / blog / zine / something.                                                           | Make the frame one object (`FRAME` in `lib/interview/exhibition.ts`: eyebrow, adjective map, noun per wing) so the rename is one file. I'd wait for the word until the reveal is laid out again (Cut 4) and Ben sees it with its pictures; the nouns ("Bestiaries", "Weathers") are the exhibition conceit and change with it.                                              | Cut 4    |
| D7  | **"Reading mixed in" on the reveal** (prototype) as well as step 8?                                                                                    | No — one place to set it. The step stays (its preselect is mechanics Ben kept); the reveal shows the chosen level as a line, not a control.                                                                                                                                                                                                                                 | Cut 4    |
| D8  | **The prototype's "Collected" tray** (chips of what you've picked, along the bottom, during the questions).                                             | Not in this round. It is a fifth fixed element competing with the StepBar on a phone. Revisit after Cut 4 if the reveal feels like it comes from nowhere.                                                                                                                                                                                                                   | —        |
| D9  | **Drop the three `user` columns** (`age_range`, `location`, `gender`) with the About-you step, or leave them?                                          | Drop them (SPEC §5.3a names that as the trial's exit). Production had the step live for ~24 hours and twenty-three mostly-persona accounts; nothing there is worth a column. Migration 0014.                                                                                                                                                                                | Cut 1    |

Cut 1 proceeds on D9 = drop unless Ben says otherwise before it runs. Nothing else in Cut 1 depends on a decision.

---

## 1. Cut 1 — structural trims (branch `feat/onboarding-trims`, executable now)

What the critique asks for that needs no new design: remove About you; remove the destination coordinates; a plain Skip on the reading screens; square corners on every questionnaire card; no category caption over a wing picture; the intro's copy and Begin together; and the picture steps given the wide column on desktop so cards stop being 110–140 px.

### Task 1.1 — Remove the About-you step (UI)

**Files:**
- Delete: `src/components/onboarding/about-step.tsx`, `src/components/onboarding/about-step.test.tsx`
- Modify: `src/components/onboarding/onboarding-screen.tsx` (phase union, `about` state, `finishQuestions`, the `about` and `reveal` branches, `submit`), `src/components/onboarding/onboarding-screen.test.tsx` (the five "A little about you" assertions, lines ~94–354), `src/lib/interview/steps.ts` (`STEP_COUNT` 10 → 9; drop "About you" from `STEP_LABELS`), `src/lib/interview/bank.test.ts:193-204`
- Modify: `e2e/support.ts:426-480` (`about` locator and the "Skip About you" click), `e2e/onboarding.spec.ts:89` (comment)

**Interfaces:**
- Produces: `Phase = "intro" | "questions" | "interpreting" | "reveal"`; `RevealStep.onBack` returns to the last question (`back()`), not to About.

- [ ] **Step 1: Tests first.** In `onboarding-screen.test.tsx`, change every `await waitFor(() => expect(heading()).toBe("A little about you"))` to wait for the reveal heading `"Here’s where we’ll start"`; delete the "About you: Continue sends what was given" test; change `expect(sent().about).toBeUndefined()` cases to assert `sent()` has no `about` key at all (`expect("about" in sent()).toBe(false)`). In `bank.test.ts` "the ten steps" → "the nine steps": the expected step list becomes `Array.from({ length: STEP_COUNT }, (_, i) => i + 1)` and the comment about About you goes.
- [ ] **Step 2: Run** `bun run test -- onboarding-screen bank.test` → FAIL (heading still "A little about you"; STEP_COUNT still 10).
- [ ] **Step 3: Implement.** Delete `about-step.tsx` + test. In `onboarding-screen.tsx`: remove the `AboutStep` import, `about` state and `About` type; `Phase` loses `"about"`; `finishQuestions` ends with `setPhase("reveal")` in both branches; delete the `phase === "about"` block; `RevealStep`'s `onBack={back}` (which pops the last answer and shows it — the same Back every question has); `submit()` drops `about`. Progress label: `Step ${stepIndex + 1} of ${steps.length}` (no `+ 1`). `steps.ts`: `STEP_COUNT = 9`, remove `"About you"`, rewrite the header comment (the last step is now "Your words", a bank question like the others).
- [ ] **Step 4: Run** `bun run test -- onboarding-screen bank.test` → PASS.
- [ ] **Step 5: e2e helper.** In `support.ts` remove the `about` locator; the loop's exit becomes `const reveal = page.locator('[data-step="reveal"]'); … await step.or(reveal).first().waitFor(); if (await reveal.count()) break;` and the two lines that wait for About's heading and press its Skip go. Update the doc comment ("The optional About-you step is skipped" → gone). `path.ts` is unaffected (it never modelled About).
- [ ] **Step 6: Commit** `feat(onboarding): remove the About-you step`.

### Task 1.2 — Remove `about` from the API and drop the three columns (D9)

**Files:**
- Modify: `src/server/api/routers/onboarding.ts:126-131` (the `about` input), `src/server/db/onboarding.ts:33-37,65-67`, `src/server/db/schema.ts:67-69`, `src/server/api/routers/onboarding.integration.test.ts` (any `about` fixture)
- Create: `drizzle/0014_drop_about.sql` via `bun run db:generate` (expect `ALTER TABLE "user" DROP COLUMN "age_range"; … "location"; … "gender";`)
- Modify: `SPEC.md` §5.3a (three columns → gone; the trial's exit taken 10-05-26), §7's `onboarding.complete` row (`about?` removed)

- [ ] **Step 1: Test first.** In `onboarding.integration.test.ts` add: `it("strips an about object a stale client still sends", …)` calling `complete` with `about: { ageRange: "25–34", location: "x", gender: "y" }` and expecting success (Zod's default object mode strips unknown keys — this test pins that the schema is *not* `.strict()`). Remove any test that reads the columns back.
- [ ] **Step 2: Run** → FAIL only if something reads the columns; otherwise proceed (the strip test passes already — keep it, it is the Review Focus 2 guard).
- [ ] **Step 3: Implement.** Delete the `about` input and `aboutField` helper from the router; delete `about` from `db/onboarding.ts`'s run type and the `set` object; delete the three columns from `schema.ts`. Run `bun run db:generate`; inspect the SQL; `bun run db:migrate` locally.
- [ ] **Step 4: Run** `bun run check` → PASS. Grep: `grep -rn "ageRange\|age_range\|gender" src e2e` → only the migration folder.
- [ ] **Step 5: Commit** `feat(db): drop the About-you columns (migration 0014) — the trial's exit`.

### Task 1.3 — The progress line on a stepless bank

- [ ] **Step 1: Test.** In `onboarding-screen.test.tsx`, the existing test that uses a custom bank with no `STEP_OF` entries: assert the label reads `1 of N` where N is the asked count, and on the last question `N of N`. (Review Focus 1.)
- [ ] **Step 2: Run** → PASS or FAIL; if FAIL the `steps.length` branch leaked — fix in `onboarding-screen.tsx`'s label expression.
- [ ] **Step 3: Commit** with 1.1 if green, else `fix(onboarding): progress label on a bank without steps`.

### Task 1.4 — Remove the destination coordinates

**Files:**
- Modify: `src/lib/interview/types.ts:45-47` (`card?: { where; line }`), `src/lib/interview/bank.ts` (the `destinations` option mapping — drop `coord`), `src/components/onboarding/face-card.tsx:88-101` (the `card` branch — drop the `coord` span), `src/components/onboarding/face-card.test.tsx`, `src/server/config/interview-destinations.ts:26` (keep `coord` in the data as a comment-documented detail, or delete it; delete — nothing reads it).

- [ ] **Step 1: Test.** `face-card.test.tsx`: the destination card test asserts the coordinate string is *not* in the document.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** `bun run check` → PASS (typecheck catches every `coord` reader). **Step 5: Commit** `feat(onboarding): destination cards lose the coordinates`.

### Task 1.5 — Wing pictures stand alone (no caption), with the text fallback kept

**Files:**
- Modify: `src/components/onboarding/face-card.tsx` (new prop `caption?: boolean`, default `true`), `src/components/onboarding/question-step.tsx` (pass `caption={false}` for a `choice` whose options all have a face and no `writing` — the wings and the playoff; pairs keep their labels, see D4 note), `face-card.test.tsx`

**Interfaces:**
- Produces: `FaceCardProps.caption?: boolean` — "print the label over the picture". The accessible name is the label regardless (`aria-label` already is).

- [ ] **Step 1: Tests.** (a) `caption={false}` + `src` → the label text is not rendered visibly but `getByRole("button", { name: label })` still finds it. (b) `caption={false}` + `src` + image `onError` → the text card renders the label large (Review Focus 3).
- [ ] **Step 2: Run** → FAIL. **Step 3:** in the `showImage` branch render the scrim+label `<span>` only when `caption`; the `!showImage` branch is untouched. In `question-step.tsx`, `const quietFaces = question.kind === "choice" && allFaced && !question.options.some((o) => o.face?.writing);` and pass `caption={!quietFaces}`.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(onboarding): wing pictures carry no caption`.

### Task 1.6 — Square corners on every questionnaire card

**Files:**
- Modify: `src/components/onboarding/face-card.tsx:70` (`rounded-card` → nothing; the hairline border stays), `src/components/onboarding/exhibition-card.tsx:102` (`rounded-card` → nothing — the reveal's card is a frame around pictures-to-come in Cut 4; its meters' `rounded-full` stay until Cut 5 decides), `face-card.test.tsx`

- [ ] **Step 1: Test.** `expect(button.className).not.toMatch(/rounded/)` on a picture card, an article card, a destination card.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `style(onboarding): square corners on the cards, like every other picture in the app`.

### Task 1.7 — The intro's copy and Begin together; the picture steps wide on desktop

**Files:**
- Modify: `src/components/onboarding/onboarding-screen.tsx` (intro: Begin moves out of `StepBar` into the `Rise`d body, `mt-8`, left-aligned under the copy; the `<Column>` width becomes a function of the question on screen), `src/components/onboarding/question-step.tsx` (grid classes), `onboarding-screen.test.tsx`

**Interfaces:**
- Produces: `columnFor(q: Question | undefined, phase: Phase): "narrow" | "wide"` — pure, exported from `onboarding-screen.tsx` (or a tiny `lib/interview/layout.ts`), `wide` for any question that renders cards or a pair, and for the reveal; `narrow` for the intro, text, amount and chip questions.

- [ ] **Step 1: Tests.** `columnFor`: a `pair` → wide; a faced `choice` → wide; `destinations` (card options) → wide; `text` → narrow; `amount` → narrow; intro → narrow; reveal → wide. Screen test: the intro renders Begin inside the rising body (`within(main).getByRole("button", { name: "Begin" })` is not inside the fixed bar — assert its ancestor has no `fixed` class).
- [ ] **Step 2:** FAIL. **Step 3: Implement.** `<Column width={columnFor(current, phase)} …>`. Grids in `question-step.tsx` at `md:` — wings/playoff `md:grid-cols-4` (≈ 265 px a card at 1120), keep `md:grid-cols-5` (≈ 210 px; Cut 2 may replace this grid), pairs `md:max-w-[760px] mx-auto` on the 2-col grid (≈ 370 px a side, the prototype's `plates.two`), reading cards `md:grid-cols-2 md:max-w-[860px]`, destinations `md:grid-cols-3 xl:grid-cols-4`. The text and chip questions stay in the 600 column. Reason about Review Focus 4: both widths share `mx-auto`, so a change recentres rather than jumps; confirm by eye at 1440.
- [ ] **Step 4:** PASS. `bun run e2e:prod` (the `desktop` project exercises `/onboarding` through `completeOnboarding`). **Step 5: Commit** `feat(onboarding): the picture steps take the wide column; Begin sits under the intro copy`.

### Task 1.8 — Reading screens: a plain Skip

- [ ] `onboarding-screen.tsx` `forwardLabel`: delete the `face?.writing` branch. Test: a reading question unanswered → forward button named "Skip". `support.ts`'s regex already accepts Skip; drop "I’d rather look at pictures" from it. The `readingSkipped` count in the screen still reads `SKIP` keys — unchanged. Commit `feat(onboarding): the reading screens skip like every other`.

### Task 1.9 — Cut 1 close

- [ ] `bun run check`; `bun run e2e:prod`; the CI-shape run (CLAUDE.md's `docker run … postgres:17-alpine` recipe, `E2E_PROD=1 bunx playwright test --workers 1`).
- [ ] Docs: tick the matching boxes in `docs/NOTES_onboarding-critique.md`; SPEC §3.2 (the onboarding bullet: no About you, nine steps); CLAUDE.md's First Exhibition bullet (one clause: About you removed 10-xx-26); `log.md` entry with spend.
- [ ] Push the branch; **do not merge** — Ben looks on phone + 1440.

---

## 2. Cut 2 — how pictures are asked (branch `feat/keep-stack`; expands after D3)

On D3 = (a): port the prototype's rapid-fire stack to the Keep step.

- **Engine (pure, tested):** `Question.pass?: number` — the factor applied to the *first* effect of every option the reader did not keep, when the question was reached and answered (not skipped). `scoreAnswers` applies it; `path.ts` mirrors it; `askable` ignores it. `BANK_VERSION = 3` (D3b). Keep's options stay the ten pictures; the answer stays the kept keys, so the log shape is unchanged.
- **UI:** `components/onboarding/keep-stack.tsx` — a controlled stack over the question's options: top card draggable (`pointerdown/move/up`, 90 px threshold, `Keep`/`Pass` stamps as `data-lean`), two buttons under it, ←/→ keys, `NN / 10` counter; a decision reports `onChange({ keys }, done)` with `done` when the last card goes. Reduced motion: no fling, 80 ms advance (Review Focus 5; `useMediaQuery` after hydration as the landing does). Phone: card `min(340px, 78vw)`, 4/5.6; desktop: the same card centred in the wide column, ~440 px.
- **Back semantics:** Back from the question after it mid-stack returns to the first card with the kept set shown (the stack replays from `answer.keys`). Document it.
- **e2e:** `answerQuestionnaire`'s `multi` branch presses `[data-topics]` hits — the stack must render every option as a `[data-topics]` button (hidden cards included, `aria-hidden`), so the helper keeps working; verify with the CI-shape run.
- **Pairs, wings, reading, destinations:** grids as laid out in Task 1.7; this cut only replaces Keep.

On D3 = (c): no engine change; Task 1.7's grids are the whole cut, closed.

## 3. Cut 3 — the copy deck (branch `feat/onboarding-copy`; expands after D4, D5)

- **Task 3.1 (now, no decision needed):** generate `docs/COPY_onboarding.md` — one table of every reader-visible string in the questionnaire and the reveal: slot (file:symbol), current text, an empty "new" column. Sources: `bank.ts` (prompts, option labels, rather-not list, amount labels), `interview-wings.ts` (12 labels + 12 nouns), `interview-destinations.ts` (`where`, `name`, `line` for `BALANCED_TWELVE`), `steps.ts` `STEP_LABELS`, `onboarding-screen.tsx` (intro eyebrow/title/lede, "Putting it together…", forward labels), `question-step.tsx` ("Pick up to…", the free-text help and disclosure), `reveal-step.tsx` ("Here's where we'll start", the lede, "Keep at least three", "Start exploring"), `exhibition-card.tsx` (eyebrows, pole labels), `temperament.ts` (dimension labels + glosses), `reading-fallback.ts`. **Ben fills the column.** The file is the verdict, like `topic-proposals.md`.
- **Task 3.2:** apply the deck. Mechanical; one commit per file; `BANK_VERSION` unchanged unless D5 retires `read-watch` (then its `STEP_OF` entry goes too and bank.test's step list follows).
- **Task 3.3:** if D5 merges the free texts, `services/interview-interpret.ts` gets one prompt instead of two (its test fixture follows) and the SPEC §3.2 sentence about "two free-text questions" becomes one.

## 4. Cut 4 — the reveal restored (branch `feat/reveal-redo`; expands after D6, D7)

What the prototype's reveal has that `reveal-step.tsx` + `exhibition-card.tsx` do not (read from `renderReveal()` in the prototype, 10-05-26):

| Prototype                                                                                                                           | Built                                                         | Action                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two columns at ≥ 920 px**: the exhibition (left) beside the mix (right)                                                           | One 600 px column, card above list                            | `Column width="wide"` (Task 1.7 gives it); `md:grid-cols-[1.05fr_1fr]`                                                                                                                                                                                                                                                    |
| **The hang**: three of the reader's own pictures (last picks, then keeps, then a wing hero), matted, middle one raised                | None                                                          | `hang.ts` (pure: pick three face keys from the answers in that order) + render from the `faces` the screen already holds. **Store** `hang: itemId[]` in `TasteV1`→`v: 2` so `/profile/topics` can show it; server validates existence like `opened`. Client-computed, server-validated, as v1's rule says.                 |
| **Display title**: huge, noun on its own line in the accent                                                                           | 30 px, one line                                               | `text-[clamp(46px,8vw,100px)]`, noun `block text-accent`; Sora stays (design D9)                                                                                                                                                                                                                                          |
| **Subtitle as a sentence**: "Creatures, growing things and myth. Mostly photography and painting."                                   | "Creatures · Growing things · Photography"                    | `joinAnd` in `exhibition.ts`, tested                                                                                                                                                                                                                                                                                      |
| **Temperament** glosses printed under each bar, intro line ("Five dimensions that hold across music, film and books…")              | Gloss only as a `title` tooltip                               | Print the gloss; add the one-line intro from the copy deck                                                                                                                                                                                                                                                                |
| **Compass**: the active pole set in ink, the other grey; centre tick                                                                 | Both poles grey                                               | `on` class when `|value| > 0.15`, matching `compassSentence`'s threshold                                                                                                                                                                                                                                                  |
| **"You'd open"** summary sentence naming length *and kinds* ("You like a long read, and you went for essays and criticism."); a line when none were opened ("You'd rather look than read. We'll keep writing to a minimum.") | Length line only; nothing when none                           | `readingSummary(opened)` pure in `taste.ts` or `exhibition.ts`, tested                                                                                                                                                                                                                                                    |
| **"Kept out"**: the rather-not choices as chips with "Allow"                                                                           | Absent                                                        | Render from the `rather-not` answer; **Allow** edits that answer (the screen owns answers; `RevealStep` gets `onAllow(key)`) and the proposal recomputes. `RevealStep` reads `proposed` once on mount today — it must re-seed on an Allow without losing the reader's level edits (merge: keep edited rows, re-add new). |
| **"Reading mixed in"** segmented control                                                                                             | Asked at step 8                                               | D7: show the chosen level as a line ("Some writing mixed in"), not a control                                                                                                                                                                                                                                              |
| **Explore line**: "About one post in ten comes from outside this mix…"                                                               | "Ambit wanders sideways from here"                            | Copy deck; the honest number is the WILD/JUMP share — state it from `DEFAULT_KNOBS`, not a literal                                                                                                                                                                                                                         |
| **Actions**: "Open my feed" primary + "Start over"                                                                                   | Back + "Start exploring"                                      | Copy deck; "Start over" = `setAnswers([])`, `setPhase("intro")` — a new action on the screen                                                                                                                                                                                                                              |
| Dials grouped under facet headings (Subject / Medium / Look)                                                                          | Flat list                                                     | **Keep flat** — Ben's 10-02 verdict that facets mean nothing to a reader stands; the critique does not ask for headings                                                                                                                                                                                                   |
| "How this was scored" details, payload JSON, answer log                                                                              | —                                                             | Dev-only if at all (`/dev/feed`-style gate); not in this cut                                                                                                                                                                                                                                                              |
| Light wall, serif, mats                                                                                                              | Dark, Sora                                                    | Not coming over (design D9, the app is dark); the *mat* idea — a picture on a paper-coloured inset — is Cut 5's call                                                                                                                                                                                                         |

Plus D6: the frame object. `exhibition.ts` exports `FRAME = { eyebrow, adjectives, … }` and `interview-wings.ts`'s `noun` moves under it, so the rename is one file and one test.

## 5. Cut 5 — accent and buttons, sitewide (branch `feat/tokens-redo`; expands after D1, D2)

- **Accent:** `globals.css` `[data-accent]` block → the one new `--accent-raw`; `--color-on-accent` re-checked for contrast against it (AA on a filled button); `lib/accent.ts` `ACCENTS` to one entry (or the knob removed outright: `accent-sheet.tsx`, the Settings → Appearance row, `settings.spec.ts:313` persistence test, `layout.tsx`'s pre-paint script); `/dev/tokens` shows the swatch; `--color-focus-ring` reconciled (one blue or two, deliberately).
- **Buttons:** `ui/button.tsx` — `shape` gains `"square"` (or pill/rounded are removed per D2); default flips; `ui/chip.tsx` and `ui/segmented.tsx` follow the same model; `chip-pop` animation reviewed (a squash on a square reads differently). 18 files render `<Button>`, 5 render `<Chip>`; the toolbars (`pill-toolbar.tsx`, `rail-toolbar.tsx`) are **out** unless D2 says otherwise.
- **Corners elsewhere:** the handoff's `--radius-card 22px` on article cards and sheets is not in the critique; leave.
- **Proof:** `button.test.tsx`/`chip.test.tsx` pin the classes; `bun run e2e:prod` + CI-shape; a screenshot pass of every screen at 402 and 1440 for Ben (`/dev/tokens` first).

---

## 6. Order and gates

1. **Cut 1** now → Ben's look → merge → deploy (runs 0014).
2. **Task 3.1** (the copy deck) right after, so Ben can fill it while the rest is built.
3. **Cut 5** as soon as D1 + D2 are decided — every later screen inherits it.
4. **Cut 2** (D3) and **Cut 4** (D6, D7) in either order; both are onboarding-only.
5. **Task 3.2** last: apply the copy once the screens are final.

Out of scope, recorded elsewhere: bank v2's missing path to `the-ocean` and the "None" preselect (log 10-05, mechanics); the Nudity/weapons curator tags; the vocabulary rounds; the loader.
