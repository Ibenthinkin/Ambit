# Handoff: First Exhibition → the onboarding questionnaire (bank v2)

_10-04-26. From a Claude chat with Ben (project "Art Judging questions"). The spec is
`docs/DESIGN_first-exhibition.md`; the prototype to click through is
https://claude.ai/artifact/3viNDzd81skCuE1nSiwfhs (private to Ben)._

## Where this lands

The worktree **`~/Dev/ambit-questionnaire`**, branch **`feat/onboarding-questionnaire`**. The bank v1
questionnaire from `docs/PLAN_onboarding-questionnaire.md` is already built there (`src/lib/interview/`,
`src/components/onboarding/`). This package is bank v2 plus a few additions to the engine and the
reveal. **Don't work in `~/Dev/ambit`**; that checkout belongs to another session.

## What's in the package

Unzip at the worktree root. Every file is new; none overwrites an existing one.

| File                                           | What it is                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `docs/DESIGN_first-exhibition.md`              | The spec: the v1 → v2 table, each question, scoring, reveal, findings, open questions                               |
| `docs/HANDOFF_first-exhibition.md`             | This file                                                                                                           |
| `docs/first-exhibition/vocabulary-proposal.md` | 168 proposed topics to tick. **Ben's verdict file**, like `topic-proposals*.md`                                     |
| `docs/first-exhibition/faces.json`             | The prototype's 277 pictures: local item id, caption, wing, tags, role. Plus 16 pairs. **Ids only, no image files** |
| `docs/first-exhibition/reading-cards.json`     | The 16 example article cards: copy and scoring reference, fallback text on CI                                       |
| `src/server/config/interview-wings.ts`         | The twelve wings: topics, proposed topics, weight, title noun, face topic                                           |
| `src/server/config/interview-destinations.ts`  | 38 destinations (copy, axes, topics, temperament) and `BALANCED_TWELVE`                                             |
| `src/server/config/temperament.ts`             | Rentfrow's five dimensions and per-topic weights (a design proposal)                                                |
| `scripts/first-exhibition-faces.ts`            | Read-only. Resolves `faces.json`'s local ids to `(source, sourceId)` hand picks                                     |

The config files are data plus types, with no logic and no tests yet. They name proposed topic ids
on purpose: `targetsOf` drops anything that isn't listed, so they work on today's vocabulary and
on CI's sixteen topics.

## Before the first task

- Run `bun run check` once after unzipping. The config files and script were formatted with
  Prettier 3.8, and the config files type-check under `--strict`. The script has **not** been run
  against a database or type-checked against the repo's own types: it uses `db` and `item` from
  `~/server/db` the same way `scripts/vision-compare.ts` does.
- Add `"faces:first-exhibition": "bun run scripts/first-exhibition-faces.ts"` to `package.json` if
  wanted, then run it against the local database and keep its output for Task 4.
- **Never commit picture files**, because the repo is public. `faces.json` is ids and captions only.
- Ben should answer DESIGN §11 first, especially question 1 (text questions first or last), which
  decides the order in Task 3.

## Tasks (TDD; comment generously; `bun run check` after each)

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                               | Done when                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | Pure helpers: `src/lib/interview/temperament.ts` (DESIGN §6) and `compass.ts` (§4), each with a unit test over a tiny fixture                                                                                                                                                                                                                                                                                      | Tests green                                                   |
| 2   | Engine: `NEITHER` for `choice` (−0.5 × each option's first effect); `Option.face.writing?: { kind, nth }` in `types.ts`; `READ_SCORE` in `config.ts`; `scoreAnswers` uses `Answer.topicIds` at `READ_SCORE` for reading answers; `readingAmountFrom` derives the default from `read-*` (§5)                                                                                                                        | score / picks tests extended and green                        |
| 3   | `bank.ts` v2 (`BANK_VERSION = 2`), written from DESIGN §1–5: build wing options from `WINGS`, destination options from `BALANCED_TWELVE`, and the six pairs, `keep`, `read-1`/`read-2` and `rather-not` by hand. Keep `bank.test.ts`'s invariants: ids exist (proposed ids filtered first), one `amount` question, enough survives on sixteen topics, a path to astronomy + botany + music on both database shapes | bank and path tests green on both shapes                      |
| 4   | Faces: hand picks from the script's output into the bank's `face.pick`. Add the writing branch to `question-faces.ts` (kind, score ≥ 8, short or long by `nth`) plus `topFacesForTopics`' writing sibling in `db/items.ts`                                                                                                                                                                                         | unit + integration tests green; `/dev/faces` shows every face |
| 5   | UI: `question-step.tsx` renders face cards for `choice`/`multi` when every option has a face; an article-card variant of `face-card.tsx` (kind · minutes, title, dek); typeset destination cards; progress grouped into about ten steps                                                                                                                                                                            | component tests green                                         |
| 6   | Reveal: exhibition title, subtitle, temperament strip, travel compass, "You'd open" (DESIGN §9)                                                                                                                                                                                                                                                                                                                    | reveal tests green                                            |
| 7   | e2e: update `completeOnboarding` for bank v2 (the `data-topics` path still drives it); `bun run e2e:prod` **and** the CI-shape run (CLAUDE.md)                                                                                                                                                                                                                                                                     | both green                                                    |
| 8   | Docs: supersession note on `PLAN_onboarding-questionnaire.md` §3's bank table → this design; SPEC onboarding section; `log.md`                                                                                                                                                                                                                                                                                     | `bun run check` green                                         |

Out of this handoff (each is Ben's call): the vocabulary rounds (DESIGN §7), the two new facets,
the curator tags for nudity and weapons, the playoff question kind.

## Things to know going in

- **Proposed topics are inert until promoted.** A wing or destination that names mostly proposed
  topics (Sport & play, Celebrations, Faith & ritual) scores thinly today. That's expected, and it
  is the case for the vocabulary rounds.
- **The pictures came from two local caches** (`ambit-questionnaire` for k < 1000, `ambit` for
  k ≥ 1000). If the script can't find an id, that picture came from the other checkout's database.
  Pick a replacement on `/dev/faces`; don't chase the id.
- **Captions and tags in `faces.json` were assigned by eye**, not read from the database. Use them
  as labels for review, not as data.
- `~/Dev/ambit-questionnaire/.cache/onboarding-faces-export.tar` (17 MB) is a leftover from the
  prototype and safe to delete.
