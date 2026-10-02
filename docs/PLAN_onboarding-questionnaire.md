# Onboarding as a questionnaire

## Context

Ben's verdict on onboarding (09-28, 09-29, 10-02): the four facet stages and the umbrella groups are
"completely broken" — groups are vague and too wide, **Place** makes no sense as a stage, **Look**
should be closer to *vibe*, and none of it knows about **writing**. The 09-28 interview design
(`docs/DESIGN_onboarding-interview.md`) was paused on 09-29 for exactly this.

What replaces it: **about ten skippable questions that feel like getting to know someone**, whose
answers are mapped to today's topics. The reader never sees a group name or a facet. It ends on a
reveal — "Here's where we'll start" — where every chosen topic can be switched off or set to
a little / some / a lot. After sign-up, `/profile/topics` is that same list plus a search box.

Ben's decisions this session:

| Question | Decision |
|---|---|
| Format | Mixed, picture-led: "this picture or that one?" face-offs plus a few word questions |
| Tuning page | Levels list + search; no group chips, no facet sections; "Retake the questions" link |
| Writing | The "how much reading" answer sets a **per-person** writing amount |
| Stored data | Log answers **and** offer optional demographics — a trial, "see how it feels" |
| Open questions | Two point-blank free-text questions ("What do you like to look at on the internet?", "What do you read or watch?"); **one small model call maps the words to existing topics**. Reverses 09-28's "no LLM in v1". They replace a separate suggestion box and double as tester topic suggestions (the current vocabulary is biased to Ben's own interests) |

Groups and facets **stay in the code** as internal vocabulary (answers and personas name them);
`topic-groups.ts`, its 12/8/8/6 test and `personas.ts` are untouched apart from Task 1.

**Execution note:** this plan is written to be run cold in a cheaper session, **in the worktree
`~/Dev/ambit-questionnaire`** (branch `feat/onboarding-questionnaire`, off `main` at `3a3c662`) —
`~/Dev/ambit` is held by the judge-on-VM-202 session on `feat/judge-vm202`; do not switch its
branch. Ben's `propaganda-and-persuasion` → `propaganda-and-advertising` rename is an
**uncommitted edit in that other checkout**, so Task 1 makes the same one-line rename here
(`topic-groups.ts:172`, id and label) together with June's persona. The worktree needs its own
`bun install` and a copy of `.env`. TDD throughout; comment generously (the repo is a teaching tool).

## 1. What comes over from `feat/onboarding-foundation`

Fork point `e3c8e1c`; main is 83 commits ahead, but of the branch's source files main has since
changed only `persona-seed.ts`. So **port by file**, not by cherry-picking the API commit.

| Piece | How |
|---|---|
| Levels leaf (`LEVELS`, `weightOf`, `levelOf`, `pickWeight`) | `git checkout feat/onboarding-foundation -- src/server/config/topic-levels.ts src/server/config/topic-levels.test.ts` |
| Toast as `role="status"` | `git cherry-pick -x 99fbe42` |
| Weighted API (`mine` → `{topicId, weight}`, `setMine({picks})`, `setWeight`, `setUserTopics(userId, picks)`; `topics.weights` retired) | checkout from the branch: `src/server/db/topics.ts`, `src/server/api/routers/topics.ts`, `src/server/db/topics.integration.test.ts`, `src/server/api/routers/routers.test.ts`, `routers.integration.test.ts`, `src/components/settings/settings-screen.tsx` + test, `src/app/profile/topics/page.tsx` |
| `src/server/services/persona-seed.ts` | **hand edit only** — in `syncPicks`, pass `{topicId, weight: 1.0}` objects. A checkout would delete `syncPersonaTopics` |
| Old onboarding/topics screens | hand-apply `git show f41d309 -- <file>` hunks so they stay green until Tasks 15–16 rewrite them |
| `TopicLevels` | checkout `src/components/topics/topic-levels.tsx` + test, then make it **flat** (no facet eyebrows, sorted by label) |
| Queued-write fix | copy `WRITE_SCOPE`, `settle()` and both mutations from the branch's `topics-screen.tsx` into the rewrite; adapt `topics-screen.queue.test.tsx` |
| e2e waits | hand-copy `waitForSetMine` / `waitForSetWeight` from `52f0956` |

**Left behind:** the 75-group cut (`7cd4c41`), `GroupPicker` and `picks.ts` (`c75e887`, `1981aaf`),
Pick → Start onboarding (`2d00843`, `a6ac90a`), the branch's docs commits.

## 2. Data model (migration `0011`, via `bun run db:generate`)

- **`user`** — four nullable columns, read through `src/server/db/users.ts` (Better Auth is never told):
  `writing_amount` (`none | little | some | lot`; null = default), `age_range`, `location`, `gender`.
- **`interview_answer`** — `id`, `user_id` (cascade), `run_id`, `question_id`, `answer text[]`
  (option keys, or `["skip"]` / `["either"]` / `["neither"]`; for a free-text question, the topic
  ids the model returned), `text` (nullable; the reader's own words, ≤500 chars), `bank_version`,
  `asked_at`. Ben reads the `text` column for topic suggestions — there is no separate table.
- New leaf `src/server/config/reading-amount.ts`: `none 0 · little 0.0625 · some 0.125 · lot 0.25`.
  The level is stored, not the share, so retuning needs no data migration.

Both new foreign keys **must cascade** — `scripts/e2e-clean.ts` and integration `afterAll`s delete users directly.

**tRPC**
- `onboarding.complete` (new router, registered in `api/root.ts`) — one mutation, one transaction:
  `picks` (3–24, validated against `listTopics()`), `writingAmount` (nullable), `answers`,
  `bankVersion`, optional `about {ageRange, location, gender}`. Answers may carry `text`.
  Abandoning the flow writes nothing, so `hasCompletedOnboarding` stays honest.
- `onboarding.interpret` (protected mutation) — input `{texts: {questionId, text ≤500}[]}` (max 3);
  returns `{questionId, topicIds: string[]}[]`. New `src/server/services/interview-interpret.ts`:
  one OpenRouter call through the same client/model the curator uses (`services/curator.ts` —
  reuse its request helper and its fail-fast on 401/402, do not write a second client), prompt =
  the pickable topic list (`id: label`) + the reader's words, asking for JSON `{topics: [≤6 ids]}`
  per text. Ids not in `listTopics()` are dropped. **Any failure, an 8 s timeout, or no
  `OPENROUTER_API_KEY` (CI) returns empty lists** — the flow never blocks on it. Writes nothing.
  The reader's text is data, never instructions: it goes in a delimited block and the output is
  only ever filtered ids.
- Extract `replaceUserTopicsTx(tx, userId, picks, mode)` from `setUserTopics`: `"keep"` is today's
  behaviour; onboarding uses `"overwrite"` so a retake writes exactly what the reveal showed.
- `user.readingAmount` / `user.setReadingAmount`.
- Retake needs no procedure: `/onboarding?retake=1` (the page skips its "already onboarded" redirect).

## 3. The engine — `src/lib/interview/` (pure, each module with a test)

- A `"text"` question has no options. Its interpreted topic ids enter `score.ts` as one effect
  (`TEXT_SCORE 1.5`, split by √n like any other), so a named favourite lands at "some" or above.
- `types.ts` — `Question {id, kind: "pair"|"choice"|"multi"|"amount"|"text", prompt, options}`;
  `Option {key, label, effects: {topics?, groups?, score}[], face?: {topic, pick?}, reading?}`.
- `config.ts` — `MIN_PICKS 3`, `MAX_PICKS 12`, `GROUP_CAP 3`, `EITHER_FACTOR 0.75`,
  `NEITHER_FACTOR -0.5`, `SOME_FROM 0.6`, `LOT_FROM 1.5`.
- `targets.ts` — an effect's topics + flattened group members, intersected with `topics.list`.
- `askable.ts` — an answer with no listed topic is hidden; a pair with a dead side, or a choice
  with fewer than two live answers, is skipped. This is what makes CI's sixteen-topic database work.
- `score.ts` — each effect gives each of its *n* targets `score / √n`, so a twelve-topic group
  answer doesn't swamp a single-topic one. Either = both × 0.75; Neither = both × −0.5.
- `picks.ts` — positive scores, ranked; at most 3 per group and 12 in all; level from the score;
  fewer than 3 → top up from `STARTER_TOPICS`. Plus `readingAmountFrom(answers)`.
- `path.ts` — `answersToward(bank, listed, wanted)`, the pure mirror of the e2e helper.
- `bank.ts` — `BANK_VERSION`, `QUESTIONS`, `STARTER_TOPICS`; `bank.test.ts` pins: ids exist,
  one `amount` question, ≥3 questions askable on the sixteen originals, and a path that yields
  astronomy + botany + music on **both** database shapes.

### The bank, v1 (Ben edits this file freely; the copy is a draft)

Faces are the picture on each card; word questions use chips.

| # | id | Kind | Prompt | Answers → what they add |
|---|---|---|---|---|
| 0a | `look-at` | text | What do you like to look at on the internet? | free text → model → topics |
| 0b | `read-watch` | text | What do you read or watch? Authors, magazines, a favourite film — anything. | free text → model → topics |
| 1 | `go-tomorrow` | multi (≤2) | Where would you go tomorrow, if you could go anywhere? | A city at night → `cities-and-streets`, `night`, `neon` · The desert → `desert`, `sand`, `geology`, `landscapes` · The open sea → `the-ocean`, `water` · Deep woods → `trees`, `mushrooms`, `nature`, `plants` · Orbit → `space-and-science-fiction` · A museum's back rooms → `natural-history`, `ancient-history`, `sculpture` |
| 2 | `space-or-garden` | pair | This one, or that one? | `space-and-science-fiction` (face `astronomy`) / `plants-and-fungi` (face `botany`) |
| 3 | `animal-or-machine` | pair | 〃 | `animals-group` / `machines-and-technology` |
| 4 | `painted-or-photographed` | pair | 〃 | `painting-and-drawing`, `painterly` / `photography-group` |
| 5 | `abstract-or-figure` | pair | 〃 | `abstract-and-pattern` / `portraits`, `portraiture`, `body` |
| 6 | `made-or-printed` | pair | 〃 | `craft-and-materials` / `posters-print-and-type` |
| 7 | `vibe` | multi (≤2) | What should it feel like? | Quiet → `melancholy`, `black-and-white`, `still-life` · Strange → `surreal-and-dreamlike`, `eerie` · Bright → `colourful`, `whimsical` · Dark → `moody`, `horror`, `death` · Exact → `scientific-and-technical-drawing`, `geometric` · Old → `period-styles`, `engraving`, `ancient-history` |
| 8 | `evening` | multi (≤2) | What do you lose an evening to? | Music → `music`, `sound`, `album-art` · Films → `film`, `cinematic`, `animation` · Books → `books`, `literature`, `poetry` · Games → `games`, `retro-gaming`, `toys` · Food → `food` · Clothes → `fashion`, `shoes`, `jewelry` |
| 9 | `unsettle` | choice | Do you like pictures that unsettle you a little? | Yes → `eerie`, `horror`, `monster`, `surreal` · Sometimes → `eerie`, `surreal` at half · Not really → those four at −0.5 |
| 10 | `reading-kind` | multi | What do you like to read? | An essay that takes a position → `consciousness`, `emotions`, `literature` · Strange true things → `natural-history`, `science`, `ancient-history` · Writing about pictures → `painting`, `photography`, `film` · Old documents, forgotten things → `books`, `engraving`, `cartography` (all at 0.5; the answer is also logged against the four writing kinds) |
| 11 | `reading-amount` | amount | How much reading do you want mixed in? | None · A little · Some · A lot → `writing_amount` |

Thirteen questions in all (inside Ben's 4–15), every one skippable. The two text questions open
the flow, under one line: *"Say as much or as little as you like. We use it to choose where to
start."* `onboarding.interpret` is called once, on leaving the last question, behind a short
"Putting it together…" beat; the reveal renders whether or not it answered.

Then the optional **About you** step, then the reveal. Place is question 1; Look is question 7.

## 4. Screens

- **Faces** — new `src/server/services/question-faces.ts`: for each picture answer, a hand `pick`
  `(source, sourceId)` if set, else the top score-≥9 image in the face topic (two per topic so a
  pair never shows one picture twice); memoised ten minutes, never memoising an empty result.
  `src` through `src/lib/image-src.ts` + `?w=960`. A missing or failed face renders a text card —
  the normal path on CI. Optional `/dev/faces` (dev-gated) prints each face and its paste-able pick.
- **`src/app/onboarding/page.tsx`** — reads `?retake=1`; passes topics, faces, retake.
- **`src/components/onboarding/`** — `onboarding-screen.tsx` (rewritten: intro → questions → about → reveal;
  state is the answers array, Back pops), `question-step.tsx`, `face-card.tsx`, `about-step.tsx`,
  `reveal-step.tsx`. Option buttons carry `data-topics`, the step `data-question-id` (for e2e).
  - **About you:** age-range chips, "Roughly where are you? A city or country is plenty", gender
    as free text. One plain line — *"All optional. We use this only to
    understand who Ambit is for; it never changes your feed and is never shared."* — with Skip as
    prominent as Continue.
  - **Reveal:** flat `TopicLevels` over a local draft; "Start exploring" needs three; on retake,
    "This replaces your current topics" and a Cancel link.
- **`src/components/profile/topics-screen.tsx`** — rewritten: search box (label match over
  `topics.list` minus current picks, ≤8 results, "Add …"), flat `TopicLevels` (level → `setWeight`,
  off → `setMine`, floor of one), "Retake the questions" link. Reuse the branch's write queue.
- **Settings** — a "Reading" row in "Your feed" opening `reading-sheet.tsx` (modelled on
  `accent-sheet.tsx`, a `Segmented` of the four amounts).

## 5. Feed — `src/server/services/feed.ts`

- New pure `resolveWriting(amount, overrides, debugEnabled) → {share?, picturesOnly}`.
- `getFeedPage` (~lines 1003–1046): read `getUserWritingAmount` alongside the weights for a
  signed-in user; knobs = defaults, then the user's share, then debug overrides (so `/dev/feed`
  still wins); signed-out explore is untouched.
- **"None" is not `writingShare: 0`** — at 0 the engine lets articles back into the ordinary pools
  (pinned by an existing test). "None" sets `picturesOnly`, forcing ordinary pools to `type: "image"`.

## 6. Tasks

| # | Task | Done when |
|---|---|---|
| 1 | Fix June's persona (`personas.ts:154` → `propaganda-and-advertising`); commit with Ben's rename | personas + topic-groups tests green |
| 2 | Port levels leaf + toast | their tests green |
| 3 | Port the weighted API (table in §1) | `bun run check` green |
| 4 | Schema, migration 0011, `reading-amount.ts` | migrate applies |
| 5 | `db/users.ts` reading functions + two `user` procedures | router tests green |
| 6 | Feed: `resolveWriting` + `getFeedPage` (add the `db/users` mock to `feed.test.ts`) | feed tests green, incl. none / lot / null / debug-override |
| 7 | Engine: types, config, targets, askable, score | unit green |
| 8 | Engine: picks, path | unit green |
| 9 | `bank.ts` (§3 table) + invariants | bank test green on both shapes |
| 10 | Faces: `topFacesForTopics` in `db/items.ts`, `question-faces.ts` | unit + integration green |
| 11 | `replaceUserTopicsTx`, `db/onboarding.ts`, `onboarding` router, appRouter shape test | integration green (round trip, rollback, cascade) |
| 11b | `interview-interpret.ts` + `onboarding.interpret` (tests mock the OpenRouter call: ids filtered to the list, failure / timeout / no key → empty, text never reaches the output) | unit + router tests green |
| 12 | Flat `TopicLevels` | test green |
| 13 | `face-card`, `question-step` | component tests green |
| 14 | `about-step`, `reveal-step` | component tests green |
| 15 | `OnboardingScreen` + page (retake) | screen test green |
| 16 | `/profile/topics` rewrite + queue test | tests green |
| 17 | Settings Reading row + sheet | tests green |
| 18 | e2e: `completeOnboarding(page, topics = ["astronomy","botany","music"])` driven by `data-topics`; new `e2e/onboarding.spec.ts` (skip-everything → starters; retake; Reading "None" → no writing tile); update `settings.spec.ts` | `bun run e2e:prod` **and** the CI-shape run green |
| 19 | `/dev/faces` | renders under `FEED_DEBUG` |
| 20 | Docs: SPEC §3.2/§5/§7/§8.1/§9; CLAUDE.md (groups + facets are internal); BUILD_PLAN 8.4; supersession headers on the three onboarding docs; the personas header's "demographics are never stored" note; `log.md`; Ambit memory | `bun run check` green |

## 7. Verification

- `bun run check` (unit + lint + types) after every task.
- CI shape, per CLAUDE.md: `postgres:17-alpine` on a free port, `db:migrate && db:seed && build &&
  E2E_PROD=1 bunx playwright test --workers 1`; then `bun run e2e:prod` against the real corpus.
- By hand on the dev server (clear port 3000 first): a fresh sign-up through every question on a
  phone width and at 1440; skip everything → starter reveal; Reading "None" → a feed with no
  writing cards, "A lot" → about three per page; `/profile/topics` search-add, level change,
  reload; "Retake the questions" round trip.
- Free text by hand, with the real key: "Stalker, Borges, old science diagrams" should put
  something like `soviet` / `cinematic` / `literature` / `scientific-illustration` in the reveal;
  with the key unset the reveal still renders from the other answers. e2e skips both text questions.
- Database check after one run: `user_topic` weights match the reveal; `interview_answer` rows
  share one `run_id`, the two text rows carrying the words and the mapped ids; user columns set
  only when given.

## 8. Things Ben should know going in

- **Demographics reverse a recorded rule** (personas design, 09-10: "never stored"). They are a
  trial: optional, unused by the feed, and removable by dropping three columns. There is no edit
  or clear control yet — a small follow-up on `/profile/edit` if they stay.
- **The free-text answers go to OpenRouter** (the curator's provider) and are stored. The SPEC's
  privacy note and the line under the questions must say so plainly. Cost is a fraction of a cent
  per sign-up. A name the vocabulary has no home for maps to nothing — those are the rows to read
  when growing the topic list.
- **Retake overwrites** save-learned weights and drops topics not in the new reveal; the screen says so.
- **The reading-kind answer only steers topics in v1** (and is logged). A real per-kind preference
  is a separate change.
- **Level thresholds are untuned** — a single group answer lands three topics at "a little". Tune
  `SOME_FROM` / `LOT_FROM` after walking the bank a few times.
- **Faces want a hand pass** — the auto-pick is the top-scored picture per topic; `/dev/faces` is
  where Ben swaps any that misrepresent an answer.
- Not in this plan: re-cutting the groups, tag aliases, new topics from tester suggestions
  (the logged free text just collects them), a full LLM conversation.
