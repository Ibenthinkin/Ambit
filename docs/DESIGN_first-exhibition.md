# Design: First Exhibition — bank v2, the taste store, and vocabulary round one

_10-04-26. Designed with Ben in this session from the study he brought over from a Claude chat
("Art Judging questions"), which lives in `docs/first-exhibition-for-ambit/` until the plan's first
task moves it into place. This document is the authoritative adaptation of that study to the repo.
Where the two differ, this one wins; the study's own spec is kept as history at
`docs/first-exhibition/study-design.md` (and its handoff beside it) once moved._

**Builds on:** the questionnaire (bank v1) on `feat/onboarding-questionnaire`
(`docs/PLAN_onboarding-questionnaire.md`; engine `src/lib/interview/`, screens
`src/components/onboarding/`). **Sequencing, Ben's call:** he reviews and merges v1 first; First
Exhibition is then a fresh branch off `main`. Nothing here is built on the unmerged v1 branch.

## 0. Decisions (Ben, 10-04-26)

1. **Merge v1 first, then v2 off `main`.** Smaller diffs; v1's e2e proves the engine before v2
   changes it.
2. **The two free-text questions come last and are optional.** The "rabbit hole" bonus of the
   prototype. Pictures first, so the reader has a vocabulary for what they like.
3. **"Rather not see" ships as scores only.** Strong negatives plus a logged answer. No feed filter
   and no curator tags for nudity or weapons in this cut.
4. **Keep is a tap grid**, not a swipe stack. An untouched picture scores nothing.
5. **The playoff is in v2** — a fourth wing screen re-asking the reader's top four areas with
   fresh pictures. Built as a display rule on a static question (§2), not a new question kind.
6. **Vocabulary round one rides with v2.** Ben ticks about 30 topics in the verdict file; the
   hand-add path is designed here (§5). The rest of the 168 wait.
7. **Both new facets, Tradition and Form, are added now**, ahead of round one.
8. **A taste profile is stored** — `user_taste`, one jsonb (§4). The profile's Topics tab shows the
   reveal's new parts too.
9. **The exhibition title is set in Sora**, the app's one typeface. Ben likes everything else about
   the new reveal; the prototype's serif does not come over.
10. **The loader animation (`docs/LoaderAnimation/`) is a separate, app-wide sub-project** (§11).
    Not read, not built here.

The study's own decisions stand underneath these: picture-led and quiet, place is not a question,
Rentfrow's five temperament dimensions are kept, reading is asked with article cards in Ambit's
own format, pictures are fixed hand picks, and an LLM call for the free text is fine.

## 1. The bank, v2

Eighteen questions, in this order, grouped on the progress indicator into **ten steps**. The
indicator counts steps, not questions (the prototype's `Question 05` covered three pairs).

| Step             | Questions                                              | Kind                                                                                  |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1 Rooms          | `wings-1`, `wings-2`, `wings-3`, then `playoff`         | `choice` of four pictures; `playoff` shows the top four of twelve (§2)                |
| 2 Hands          | `hands-mushrooms`, `hands-owls`, `hands-fish`           | `pair` — same subject, the _medium_ changes; effects name medium topics only           |
| 3 Feeling        | `feel-circles`, `feel-roads`, `feel-rooms`              | `pair` — same subject, the _look_ changes; effects name look topics only               |
| 4 Keep           | `keep`                                                 | `multi`, ten pictures, no `max`; a kept picture adds `topics(1, …tags)`                |
| 5 Reading        | `read-1`, `read-2`                                     | `choice` of four article cards + "I'd rather look at pictures" (`SKIP`)                |
| 6 Travel         | `destinations`                                         | `multi`, `max` 3, twelve typeset cards; "Nowhere in particular" allowed                |
| 7 Rather not     | `rather-not`                                           | `multi`, nine words, each `topics(-2, …)`                                              |
| 8 How much       | `amount`                                               | the existing question; its default comes from the reading answers (§2)                 |
| 9 Your words     | `look-at`, `read-watch`                                | `text`, skippable                                                                      |
| 10 About you     | the existing optional step                             |                                                                                        |

Then the reveal (§6). `BANK_VERSION = 2`. Retired: `go-tomorrow`, `space-or-garden`,
`animal-or-machine`, `abstract-or-figure`, `painted-or-photographed`, `made-or-printed`, `vibe`,
`evening`, `unsettle`, `reading-kind`. Logged v1 answers stay readable (they carry their version).

**Wings** (`src/server/config/interview-wings.ts`, from the study): twelve subject bundles —
Creatures · Growing things · Land, sea & sky · Space & tomorrow · Machines & how things work ·
Cities & buildings · People & daily life · Myth, ritual & the ancient world · Body & mind · Things
people make · Food & the everyday · Stage, screen & sound. Each wing option is
`{ key: wing.id, label, face: { topic: wing.faceTopic, pick }, effects: [topics(wing.weight,
…wing.topics), topics(FACE_BONUS, wing.faceTopic)] }`. Nature counts for less (`weight` 0.7 for
Land, sea & sky; 0.8 for Growing things and Creatures — Vessel et al. 2018: people agree about
landscapes, disagree about art). A wing is picker-side only: the feed, weights, groups and
personas never see one. `wing.proposed` ids are in the config and dropped by `targetsOf` until
listed, so one bank serves production and CI's sixteen.

**Pairs:** the study's six, verbatim (hands: mushrooms photograph vs plate, owls photograph vs
painting, fish plate vs jewellery; feel: circles bold vs soft, roads night vs day, rooms warm vs
austere). Either/neither and their factors unchanged.

**Rather-not options and the topics each scores down** (real ids; the study left these to the
build): Horror & gore → `horror`, `monster`, `halloween`; Death & skeletons → `death`; Anatomy &
medicine → `anatomy`, `medicine`, `body`; Insects → `insects`; Nudity → _(no topic; logged only)_;
War & weapons → `military-history` (round one; nothing until listed); Propaganda →
`soviet-propaganda`, `activism`, `advertising`; Religious imagery → `religious-art`, `icons`,
`sacred-architecture` (round one); Eerie & melancholy → `eerie`, `melancholy`. An option none of
whose topics is listed is hidden by `askable` as usual; **Nudity is the exception** — it has no
topic, so it would never be shown. Give it a `log: true` flag on the option (§2) so it is offered
and logged with no effect, which is the whole point of asking.

## 2. Engine changes (`src/lib/interview/`, pure, each with a test)

- **`Question.show?: { top: number }`** — the playoff. The question is an ordinary `choice` with
  all twelve wings as options, each with its own second hand-picked picture and the same effects
  as its wing. The screen ranks the options by the **mean positive score** the answers so far have
  given each option's live targets (`optionTargets`), ties in bank order, and shows the first
  `top`. Mean, not sum: a wing with fourteen topics must not outrank one with five because its
  spread score lands on more rows. `scoreAnswers` and `askable` ignore `show`; an option's effects
  never change, so the logged answer is just a wing key. `answersToward` (path.ts) applies the same
  rule, scoring the answers it has produced so far, so `bank.test.ts` can still prove a path to
  astronomy + botany + music on both database shapes — and e2e's `answerQuestionnaire` keeps
  steering by `data-topics` on whatever is rendered. One pure function, `rankOptions(q, scores,
  listed)`, in a new `show.ts`; `askable` is unchanged because the hiding of dead options still
  happens first and `show.top` is applied to what survives.
- **"None of these" on `choice`.** The existing `NEITHER` sentinel generalised: `−0.5 ×` (the
  existing `NEITHER_FACTOR`) applied to each option's _first_ effect only (the wing's subject
  spread, not its face bonus). `question-step.tsx` renders the button for a `choice` whose options
  all have faces (wings, playoff) — not for the reading screens, which have `SKIP` as "I'd rather
  look at pictures".
- **`Option.log?: true`** — an option with no effects that is still offered and logged (Nudity).
  `askable`'s "an answer none of whose topics are listed is hidden" exempts it.
- **`Option.face.writing?: { kind: WritingKind; nth: 0 | 1 }`.** The faces service (§7) picks the
  `nth`-best article of that kind (`type = 'article'`, `kind`, `curation_score ≥ 8`; `nth 0`
  prefers `reading_minutes ≤ 6`, `nth 1` prefers `≥ 12`) and returns, beyond the picture, the
  item's title, first summary line, minutes, kind and **topic memberships**. `QuestionFace` grows
  optional `writing?: { title, dek, minutes, kind, topicIds }`.
- **Reading answers score the item.** When a `read-*` option is chosen, the screen puts the face's
  `topicIds` on `Answer.topicIds` (the same field `text` answers use). `scoreAnswers` applies them
  at a new **`READ_SCORE = 1.2`** when `q.id` names a reading question — concretely, when the chosen
  option has `face.writing`. It also adds the kind's **form topic** (`KIND_FORM` in
  `config/writing.ts`, §5) at the same score, dropped until listed.
- **`Option.card?: { where: string; line: string; coord: string }`** — the typeset destination
  card's extra copy. Options come from `BALANCED_TWELVE`; effects `topics(1.5, …destination.topics)`.
- **`readingAmountFrom`** — when the `amount` question was skipped or never reached, derive the
  level from the reading answers: two cards opened → `some`, or `lot` if both ran ≥ 12 minutes;
  one → `little`; "pictures" twice → `none`; nothing answered → null (today's behaviour). The
  `amount` question is shown with that default **preselected**, and the reader can change it; a
  preselected answer is submitted as answered, not skipped.
- **New pure modules:** `compass.ts` (average the chosen destinations' `axes`; the sentence from
  axes with |value| > 0.15), `temperament.ts` (the study's formula:
  `Σ_topic max(0, score) × TOPIC_TEMPERAMENT[topic][d] + DIRECT_TEMPERAMENT_FACTOR × Σ direct`,
  then divide by the largest), `exhibition.ts` (title + subtitle, §6), and `taste.ts` (the stored
  shape and its zod schema, §4). Each exports functions over plain maps and arrays; none imports
  React or the database.

## 3. Screens (`src/components/onboarding/`)

- **`QuestionStep`** renders `FaceCard`s for any `choice` or `multi` whose options all have a
  `face` — today only `pair` does. Grid: 2×2 on a phone, four across from `md`. The keep grid of
  ten: two columns on a phone, five across from `md`. `show.top` is applied here (and nowhere
  else) by calling `rankOptions` with the scores of the answers so far — the screen already holds
  them for the reveal.
- **An article variant of `FaceCard`** (`face.writing` present): `KIND · N MIN` in small caps, the
  title, one line of summary, the item's picture when it has one. Text card when the database has
  no such item (CI). `docs/first-exhibition/reading-cards.json`'s sixteen headlines are the
  fallback copy for the text card so the screen never shows a bare kind name.
- **A typeset destination card** (`option.card` present, no face): `where` in small caps, `label`
  large, `line`, `coord` at the foot. No picture, by design.
- **`StepBar`** and the intro are unchanged. The progress indicator maps question → step through a
  `STEP_OF: Record<questionId, step>` beside the bank, pinned by the bank test (every question in
  exactly one step; steps numbered 1…10 contiguous).
- **"None of these"** appears beside Skip for faced `choice` questions; **Either/Neither** stay as
  they are on pairs.

## 4. The taste store

**Table `user_taste`** (migration `0013`, via `bun run db:generate`; 0012 is v1's):

```
user_taste
  user_id       TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  run_id        TEXT NOT NULL,          -- the interview_answer run this was computed from
  bank_version  INTEGER NOT NULL,
  taste         JSONB NOT NULL,         -- TasteV1, below
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
```

One row per reader. `onboarding.complete` **upserts** it in the same transaction as the picks and
the answer log, so a retake replaces it exactly as it replaces the picks.

**Shape** — `lib/interview/taste.ts`, a client-safe leaf exporting the type and its zod schema:

```ts
interface TasteV1 {
  v: 1;
  title: { adjective: string; noun: string };   // "Quiet", "Weathers"
  wings: string[];                               // top three wing ids
  mediums: string[];                             // top two medium topic ids
  temperament: Record<TemperamentDimension, number>; // 0…1, largest is 1
  compass: { wild: number; old: number; still: number; far: number } | null; // null: no destination chosen
  opened: { itemId: string; kind: WritingKind; minutes: number }[]; // 0–2
  readingMinutes: number | null;                 // mean of `opened`
}
```

**Who computes it.** The screen, over its local draft, exactly as the reveal shows it;
`onboarding.complete` takes `taste` alongside `picks`. This follows v1's rule — _what is stored is
what the reveal showed_ — and it is the only way the opened cards' item ids reach the server: the
answer log holds option keys (`essay`), not the item a card happened to show that day. The server
**validates, not recomputes**: the zod schema bounds every number and string, `opened[].itemId`
must exist (`inArray` over `item.id`), `wings` must be wing ids and `mediums` listed topic ids.
(This is one deliberate deviation from an earlier working note that said the server recomputes.)

**Reads.** `topics.taste`: a `protectedProcedure` query → `TasteV1 | null`. The Profile Topics
tab (§6) and, later, film and music read it. A later shape adds keys and bumps `v`; the column
does not change.

## 5. Vocabulary round one and the two new facets

**Facets.** `TopicFacet` becomes `"subject" | "medium" | "look" | "place" | "tradition" | "form"`
in `schema.ts`'s `$type`, `FACETS`, `FACET_LABELS` (Tradition, Form), `FACET_PROMPTS` ("Where and
when does the making come from?", "What kind of writing?" — internal now; onboarding no longer
reads facets), `topic-facets.test.ts` ("uses only the four facet values" → six; the entry count),
and `topic-groups.test.ts` (the 12/8/8/6 size assertion gains two numbers). `place` stays a facet;
onboarding simply no longer asks about it. `/profile/topics` is the levels list on v1 and needs
nothing.

**A second config list: `src/server/config/hand-topics.ts`.** The sixteen in `topics.ts` are
pinned by `topics.test.ts` as the graph's tuned set ("holds exactly the 16 graph-validated
topics", "TOPICS is exactly the set the feed treats as core") and seeded at tier `original`, so
hand-added topics cannot join them. `HAND_TOPICS: readonly HandTopic[]` holds
`{ id, label, seedQueries }` with a cell per V1 source (`met`, `aic`, `cma`, `wellcome`, `archive`;
trial-source cells optional, as for any topic). `db:seed` upserts these rows at **tier `grown`**
after the sixteen, with the same changed/unchanged summary. Facet and group go where they go for
every topic: a line in `topic-facets.ts`, a member in `topic-groups.ts`. **Ingest needs no
change:** `scripts/ingest.ts` reads each topic's seed queries off its row
(`t.seedQueries[sourceId]`), so the museums start answering on the next search run. The walk
sources start homing items too, because the classify prompt lists every topic.

**The proposal's group ids are not the repo's.** `docs/first-exhibition/vocabulary-proposal.md`
names "existing" groups that do not exist (`fashion-group`, `food-group`, `ancient-world`,
`printmaking`, `sculpture-group`, `ceramics-and-glass`, `textiles-group`, `mind-and-feeling`,
`home-and-objects`, `books-and-words`, `humor-group`, `music-sound-and-dance`,
`film-and-animation`, `world-traditions`). The real groups are in `topic-groups.ts`
(`everyday-things`, `myth-story-and-the-strange`, `posters-print-and-type`, `craft-and-materials`,
`body-and-mind`, `music-film-and-performance`, `collage-and-mixed-media`…). Round one files each
ticked topic into a **real** group, creating a new group only where the proposal's is genuinely
new (e.g. `gardens`, `sport-and-play`, `faith-and-ritual`, `old-masters`). The executing session
records each filing in the verdict file's `<!-- group: -->` comment so the file ends up true.

**Round one — the pre-ticked proposal** (about 30; Ben edits the ticks in the verdict file; the
ticked lines become code in the plan, nothing reads the file at runtime). Chosen for the thin wings
the study names, for what the faces and destinations already reference, and for queries a museum
can answer honestly:

- _Subject (14):_ `gardens`, `mountains`, `ships`, `interiors`, `ruins`, `sport`, `festivals`,
  `costume`, `folklore`, `masks`, `religious-art`, `sacred-architecture`, `theatre`,
  `musical-instruments`.
- _Medium (6):_ `woodcut`, `etching`, `stained-glass`, `tapestry`, `illuminated-manuscripts`,
  `nature-photography` (a hands-pair face).
- _Tradition (5):_ `ukiyo-e`, `islamic-art`, `medieval`, `renaissance`, `impressionism`.
- _Look (5):_ `minimal`, `ornate`, `nostalgic`, `cozy`, `delicate` (the last three are feel-pair
  faces; `minimal` and `ornate` are title adjectives).
- _Form (3):_ `essays`, `criticism`, `letters-and-diaries`.

**Form topics and `KIND_FORM`.** The Form facet is the proposal's (essays, criticism, memoir,
letters & diaries, travel writing, nature writing…), not the four writing kinds. Reading answers
score the chosen card's kind through `KIND_FORM: Partial<Record<WritingKind, string>>` in
`config/writing.ts` — first guess: `essay → essays`, `criticism → criticism`,
`archive → letters-and-diaries`, `curiosity` unmapped. Form topics have **no museum seed cells**
(empty cells are legal for a `grown` row; `topics.test.ts`'s "every v1 source a cell" rule pins
`TOPICS`, not `HAND_TOPICS`); they are homed by the writing curator in a later cut and are, for
now, vocabulary the questionnaire can score and the reveal can list.

**The graph.** A new topic has no row in `topic-graph.json` until `graph:rebuild --confirm` runs
after items arrive, and the feed already handles that honestly: `hop` finds no positive bridge and
drift and jump stay on the start topic (`DRIFT · gardens (no row)`). Production order, recorded
in §9: deploy, let two search ingests run, then rebuild and commit the artifact. The rebuild's
preserved set is `TOPICS`, untouched by this.

## 6. The reveal

Above the levels list in `reveal-step.tsx`, in this order:

1. **Exhibition title** — `adjective + noun`, set in Sora (the existing `text-ink-hi` display
   style at 30 px, `font-semibold`; no serif). The adjective comes from the top look topic if its
   score > 0.6, else from the top medium, by the study's two word tables (minimal → Quiet, eerie
   or melancholy → Nocturnal, neon → Electric, color → Chromatic, black-and-white → Monochrome,
   surreal or psychedelic → Dreaming, whimsical → Whimsical, painterly → Painted, aerial-view →
   Aerial, brutalist → Concrete, retrofuturism → Atomic, art-deco or mid-century-modern →
   Streamlined, cozy → Hearthside, ornate → Gilded, gothic → Gothic; photography → Exposed,
   engraving → Engraved, scientific-illustration → Measured, ceramics → Glazed, textiles → Woven,
   collage → Assembled, painting → Painted, drawing → Drawn, illustration → Illustrated). The
   noun is the top wing's `noun`. No adjective matches → "First", so a reader always has a title.
2. **Subtitle** — the top three wings and the top two mediums, as labels.
3. **Temperament strip** — five bars, labelled and glossed (`TEMPERAMENT_DIMENSIONS`).
4. **Travel compass** — four bipolar bars (wild/built, old/new, still/lively, far/near) and the
   sentence. Omitted entirely when no destination was chosen.
5. **"You'd open"** — the two cards, with "You like a long read" (mean ≥ 14 min) or "You like
   something short" (≤ 4). Omitted when no card was opened.

Then "Here's where we'll start" and the `TopicLevels` list as today. Proposed topics never appear
as rows: the reveal lists `topics.list` only. The same block, as one component
(`ExhibitionCard`), sits above the list on **`/profile/topics`**, read from `topics.taste`; a
retake replaces it. A reader with no row (signed up on v1) sees the list alone.

## 7. Faces

- The study's 277 pictures are in `docs/first-exhibition/faces.json` as **local** item ids with
  captions, wing, tags and roles (`wing:<id>:door`, `pair:<id>:a|b`, `keep-or-pass`, `card:<id>`).
  `scripts/first-exhibition-faces.ts` (read-only; add `"faces:first-exhibition"` to
  `package.json`) resolves them to `(source, sourceId)` hand picks for `Option.face.pick`. Run it
  against the local database the caches were filled from (two: `~/Dev/ambit-questionnaire` for
  k < 1000, `~/Dev/ambit` for k ≥ 1000). An id it cannot find gets a replacement chosen on
  `/dev/faces`; don't chase the id.
- Fixed hand picks: twelve wing doors, twelve playoff seconds, six pairs (twelve pictures), ten
  keep pictures. Reading faces are live items (§2). `question-faces.ts` keeps its "an earlier
  answer took this picture" rule and its ten-minute memo; the writing branch adds
  `topWritingForKinds(kinds, nth)` beside `topFacesForTopics` in `db/items.ts`.
- **Avoid the gold-circle mark.** 46 of 421 cached files in the questionnaire checkout's
  `.cache/img` were the same placeholder, probably what the image route stores when a fetch
  fails. Hand picks are checked by eye on `/dev/faces`; `topFacesForTopics` and the writing
  branch are unaffected because they draw from the database, not the cache — but if a face shows
  the mark, replace the pick.
- **Never commit picture files.** The repo is public and some pictures come from designated blogs
  under the link-card posture. `faces.json` is ids and captions only.

## 8. Testing

- Unit: `show.test.ts` (ranking, ties, dead options), `score.test.ts` (NEITHER on choice, `log`
  options, READ_SCORE with and without a form topic), `picks.test.ts` (`readingAmountFrom`
  defaults), `compass.test.ts`, `temperament.test.ts`, `exhibition.test.ts`, `taste.test.ts`
  (schema accepts the screen's output, rejects an unknown wing), `bank.test.ts` (ids exist with
  proposed ids filtered first; exactly one `amount`; every question in one step; enough survives
  on sixteen topics; a path to astronomy + botany + music on both shapes — with `show.top`
  applied).
- Components: `question-step` (face grids for choice/multi, None of these, the article and
  destination cards, preselected amount), `reveal-step` and `ExhibitionCard` (each block present
  and absent), `topics-screen` (the card above the list, none without a row).
- Integration: `question-faces` writing branch; `onboarding.complete` writes `user_taste` and
  rejects an unknown item id; `topics.taste`.
- e2e: `completeOnboarding` is still driven by `data-topics`; a `choice` may now show "None of
  these". `bun run e2e:prod` **and** the CI-shape run (CLAUDE.md's `docker run … postgres:17-alpine`
  recipe) — the fixture-only database is where a bank that leans on corpus variety starves.
- `bun run check` after every task.

## 9. Production order

1. Ben merges v1, deploys, and the questionnaire runs on production once.
2. Merge First Exhibition; deploy. Boot runs migration 0013 and `db:seed`, which creates the
   round-one rows with their facets and seed cells.
3. Two search ingests (the Monday pictures run on VM 202) fill the new topics.
4. `bun run graph:rebuild --confirm` in the container (or locally against a dump), commit the
   artifact, deploy. Until then the new topics draw as "no row".
5. Read the reveal on the twenty personas (`seed:personas`) and the beta accounts' first
   exhibitions before any tuning of `DEFAULT`s in `config.ts`.

## 10. Findings worth knowing (the study's, kept, plus this session's)

- **The corpus mirrors the designated blogs.** In a random sample of 480 cached pictures, retro
  sci-fi, Soviet material and erotic illustration dominated. The questions can only offer what
  the corpus can serve, which is why §5 rides with the bank.
- **Nudity and weapons can't be filtered.** No topic or curator tag marks them. "Rather not see"
  logs the wish; a real filter needs a curator tag (add `nudity` / `weapons` to the rubric's tag
  guidance, like `grotesque` and `gore`) and a per-user exclusion the feed honours.
- **Ingest reads seed queries from the row, not the config**, which is what makes a seeded hand
  topic enough (§5).
- **The feed tolerates a graph-less topic** by staying put (§5), so a new topic is safe before the
  rebuild — just inert for drift.
- **Four of the study's config files and its script type-check but have never run** against the
  repo; `first-exhibition-faces.ts` uses `db` and `item` from `~/server/db` like
  `scripts/vision-compare.ts` does.

## 11. Out of this design

- **The loader animation** (`docs/LoaderAnimation/`: `ambit-loader.js`, tokens, a demo). Ben wants
  it app-wide: one loading state for Ambit, of which the questionnaire's "interpreting" moment is
  one site. It gets its own design and plan; this design leaves the "interpreting" phase as v1
  built it.
- The real "never show me this" filter and the nudity/weapons curator tags.
- Vocabulary rounds two onward (the remaining ~135 proposals), and the Form topics' homing by the
  writing curator.
- Rotating the destinations (38 are in the config; `BALANCED_TWELVE` is fixed) and refreshing the
  fixed pictures.
- Storing the free-text suggestions as topic proposals (they are logged; mining them is a later
  tool).

## 12. Files, for the plan

New: `src/lib/interview/{show,compass,temperament,exhibition,taste}.ts` + tests;
`src/server/config/{interview-wings,interview-destinations,temperament,hand-topics}.ts`;
`src/components/onboarding/exhibition-card.tsx` (+ test); `scripts/first-exhibition-faces.ts`;
`docs/first-exhibition/{faces.json,reading-cards.json,vocabulary-proposal.md,study-design.md,study-handoff.md}`;
migration `0013_user_taste.sql`.

Changed: `lib/interview/{types,config,bank,score,picks,path,askable,faces}.ts`;
`components/onboarding/{question-step,face-card,reveal-step,onboarding-screen}.tsx`;
`components/profile/topics-screen.tsx`; `server/services/question-faces.ts`; `server/db/{schema,items,onboarding,topics}.ts`;
`server/api/routers/{onboarding,topics}.ts`; `server/config/{topic-facets,topic-groups,writing}.ts` + tests;
`scripts/seed-topics.ts`; `e2e/support.ts`; `package.json`; `SPEC.md` §3.2/§5.3a/§7; `CLAUDE.md`;
`docs/PLAN_onboarding-questionnaire.md` (supersession note on §3's bank table); `log.md`.
