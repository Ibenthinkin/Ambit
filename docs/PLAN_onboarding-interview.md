# Onboarding v2, plan 2 of 2 — the interview: bank, generated questions, chooser, faces, the Refine phase and `/interview`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-28-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `88f62e0`, **assuming plan 1 (`PLAN_onboarding-foundation.md`) is merged**: this
plan uses its `Level`/`weightOf`/`levelOf` leaf, `Picks`, `GroupPicker`, `TopicLevels`, the
weighted `topics.setMine`/`topics.mine`, and the onboarding screen's `PHASES`. **For:** a cold
session on a cheaper model, on a plain branch `feat/onboarding-interview` off `main`.

**Goal:** between Pick and Start, a short adaptive interview — authored yes/no and picture-pair
questions, plus offers and face-offs generated from the topic graph — seeds weights and brings in
adjacent topics; its answers are logged; a reader can ask for more questions later from
`/profile/topics`. No LLM.

**Architecture:** a pure engine in `src/lib/interview/` (types, apply, question generation, the
chooser) over three config leaves (`interview.ts` constants, `interview-bank.ts` questions,
`topic-faces.ts` hand picks); the server adds `neighbours` to `topics.list`, an `interview` router
(`faces`, `answers`, `complete`) and one table (`interview_answer`, migration 0010); one client
component (`InterviewScreen`) hosted twice — the onboarding Refine phase and the `/interview`
route. One write at the end of either host.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query v5, Drizzle over Postgres
17, Tailwind v4, Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_onboarding-interview.md` §4, §4a, §5, §6 (Decisions 1, 2, 3, 6, 8). Read it
first; the plan is the how.

## Global constraints

- Everything in plan 1's Global constraints, verbatim.
- `src/lib/interview/*` imports **nothing** from `~/server/db`, `~/server/services/feed` or any
  module that reads `~/env`; only the config leaves (`topic-levels`, `interview`,
  `interview-bank`, `topic-groups`, `topic-facets`) and `~/server/services/random`'s `hashSeed`
  (pure). It runs in the browser.
- The graph file never ships to the client. The only graph data a client sees is
  `topics.list[].neighbours` (five per topic).
- The interview never removes a topic and never writes a weight below `weightOf("little")` or
  above `weightOf("lot")` — `WEIGHT_CAP` (3.0) is the save nudge's, not the interview's.
- Every tunable number lives in `src/server/config/interview.ts`. No literals in the engine.
- A question id is stable: the same picks and the same bank produce the same id, on every
  device, in every session. That is what makes "never twice" and the log work.
- Every `<img>` of an item goes through `imageSrc(id, imageUrl)` from `~/lib/image-src`.

## Review focus

1. A pair whose two topics resolve to the **same** picture (an item in both memberships): the
   cards must differ — take B's second face, or fall back to B's label card. → Task 7.
2. A reader on `/interview` who has already answered every askable question: the screen must end
   at once with "Nothing more to ask right now", not render an empty question. → Task 8.
3. A bank question naming a topic this database lacks (CI's sixteen): it must be unaskable,
   never render a blank card, and its effects must touch only listed topics. → Tasks 2 and 4.
4. `interview.complete` with an answer insert that fails (a `questionId` over the column's
   sanity length, say): the `user_topic` write rolls back too — one transaction. → Task 6.
5. An adjacent offer for a neighbour that a **bank** answer already brought in during this
   session: not offered again (it is present now), and a topic offered and declined ("no") is not
   re-offered from a different picked topic in the same session. → Task 4.

---

## Task 1 — Docs first, constants leaf

**Files:** create `src/server/config/interview.ts`, `src/server/config/interview.test.ts`.

- [ ] Branch: `git checkout -b feat/onboarding-interview main` (after plan 1 is merged; verify
      `src/server/config/topic-levels.ts` exists).
- [ ] The leaf (no imports, like `topic-levels.ts`):
      ```ts
      export const INTERVIEW_BUDGET = 10;      // questions per session (D3)
      export const SCORE_FLOOR = 0.4;          // below this the chooser stops early
      export const NEIGHBOURS_PER_TOPIC = 5;   // topics.list[].neighbours length
      export const COLD_BELOW = 3;             // "cold" = fewer present topics than this
      export const COLD_BOOST = 1.5;
      export const ADJ_SCALE = 3;              // §4 chooser table
      export const FACEOFF_SCALE = 2;
      export const BANK_SCALE = 2;
      export const FACE_SCORE_FLOOR = 8.5;     // corpus faces: curation_score at or above this
      export const FACES_PER_TOPIC = 2;
      ```
      Header comment: §4 "The chooser", and that these are the interview's knobs the way
      `feed-knobs.ts` holds the feed's — tuneable, not yet tuned.
- [ ] Test: every constant is a positive finite number; `SCORE_FLOOR < BANK_SCALE` (or the bank
      could never be asked); `FACES_PER_TOPIC >= 2` (a face-off needs two pictures).
- [ ] Commit: `feat(interview): the constants leaf`.

## Task 2 — The bank

**Files:** create `src/server/config/interview-bank.ts`, `src/server/config/interview-bank.test.ts`.

**Produces:**

```ts
export type BankApplies =
  | { cold: true }
  | { both: readonly [string, string] }   // both present
  | { any: readonly string[] };           // at least one present
export interface BankYesNo {
  key: string; kind: "yesno"; prompt: string;
  face?: string;                          // a topic id, ⊆ targets
  targets: readonly string[];
  applies: BankApplies; priority: 1 | 2 | 3 | 4 | 5;
}
export interface BankPair {
  key: string; kind: "pair"; prompt: string;
  faces: readonly [string, string];       // topic ids; faces[0] ⊆ a, faces[1] ⊆ b
  a: readonly string[]; b: readonly string[];
  applies: BankApplies; priority: 1 | 2 | 3 | 4 | 5;
}
export type BankQuestion = BankYesNo | BankPair;
export const INTERVIEW_BANK: readonly BankQuestion[];
```

- [ ] Test first:
      - Every `key` is unique; no key contains `:` (the id scheme reserves it).
      - Every target, face, `both` and `any` id is a key of `TOPIC_FACETS` (faceted, pickable).
      - A yes/no's `face` is in its `targets`; a pair's `faces[0]` is in `a` and `faces[1]` in `b`;
        `a` and `b` are disjoint.
      - `both` questions name two distinct topics.
      - **Against the sixteen originals** (`Object.keys(TOPICS)` from `~/server/config/topics`):
        with `askable(q, listed)` from Task 4, at least five bank questions are askable in a
        cold state (review focus 3 — a plan-2 executor writes this assertion in Task 4 and
        leaves a pointer here).
      - The bank has at least 25 questions and at least 8 `cold` pairs — the cold reader's
        opening deserves pictures.
- [ ] Run; fail. Transcribe §4a's table **verbatim** into `INTERVIEW_BANK` (keys, prompts,
      faces, targets, applies, priority). Header comment: §4 "The bank", how to add a question,
      that copy is placeholder in the app's voice, and that the test beside it is the guard.
- [ ] Green. Commit: `feat(interview): the question bank, 28 authored questions`.

## Task 3 — Neighbours on `topics.list`

**Files:** create `src/server/services/topic-neighbours.ts`,
`src/server/services/topic-neighbours.test.ts`; modify `src/server/api/routers/topics.ts`,
`src/server/api/routers/routers.integration.test.ts`, `src/app/onboarding/page.tsx`,
`src/components/topics/group-picker.tsx` (`PickerTopic` gains an optional field).

**Produces:**

```ts
// services/topic-neighbours.ts
export interface Neighbour { id: string; sim: number }
/** For each listed topic, its strongest `n` neighbours that are themselves in `listed`, sim > 0,
 *  in the graph row's order (descending sim). Reads the checked-in graph. */
export function neighboursFor(listed: readonly { id: string }[], n?: number): Map<string, Neighbour[]>;
// topics.list → (Topic & { neighbours: Neighbour[] })[]
// components/topics/group-picker.tsx
export interface PickerTopic { id: string; label: string; facet: TopicFacet; neighbours?: Neighbour[] }
```

- [ ] Test first, `topic-neighbours.test.ts` (pure; the real graph):
      - With the sixteen originals listed, `architecture`'s neighbours are all among the
        sixteen, at most five, descending `sim`, every `sim > 0`, and none is `architecture`.
      - With `["architecture", "photography"]` listed, architecture's list is exactly
        `[{ id: "photography", sim: 0.4905 }]` (its strongest neighbour in the full graph; read
        the value from the JSON in the test rather than hard-coding — assert it equals the
        graph row's entry).
      - A listed id absent from the graph (a fixture topic) maps to `[]` and does not throw.
      - `n = 2` returns two.
- [ ] Write it: `import topicGraphData from "~/server/config/topic-graph.json"`, the row type
      `{ topic: string; sim: number }[]` as `services/feed.ts` declares. Header: why this is a
      separate module (feed.ts drags the DB in; the router needs only rows), why five (§2 API),
      why the graph never ships.
- [ ] `routers/topics.ts` `list`: `const rows = await listTopics(); const nb = neighboursFor(rows, NEIGHBOURS_PER_TOPIC); return rows.map((t) => ({ ...t, neighbours: nb.get(t.id) ?? [] }));`.
      Integration test: `topics.list` rows carry `neighbours`, each neighbour id is itself in the
      returned list (faceted and listed), none exceeds five.
- [ ] `onboarding/page.tsx` passes `neighbours` through; `PickerTopic.neighbours?` added (the
      picker ignores it).
- [ ] Green. Commit: `feat(topics): list carries each topic's five faceted neighbours`.

## Task 4 — The engine: types, apply, question generation, chooser

**Files:** create `src/lib/interview/types.ts`, `src/lib/interview/apply.ts`,
`src/lib/interview/questions.ts`, `src/lib/interview/chooser.ts`, and tests `apply.test.ts`,
`questions.test.ts`, `chooser.test.ts` beside them.

**Produces:**

```ts
// types.ts — the client-safe home of every interview type. `Face` lives here (db/interview.ts
// imports the type from here, not the reverse); `Neighbour` is `import type` from
// services/topic-neighbours.ts (erased at build — the graph never bundles); `Picks` is
// `import type` from components/topics/picks.ts.
export interface Face { id: string; imageUrl: string; source?: string; sourceId?: string }
export type Answer = "yes" | "no" | "a" | "b" | "either" | "neither" | "skip";
export interface Move { topicId: string; move: "up" | "down" }
export interface Question {
  id: string; kind: "yesno" | "pair"; prompt: string;
  faces: string[];                                   // topic ids: [] | [t] | [a, b]
  effects: Partial<Record<Answer, Move[]>>;
}
export interface InterviewTopic { id: string; label: string; facet: TopicFacet; neighbours: Neighbour[] }
export interface DraftState {
  weights: Map<string, number>;
  before: Set<string>;
  touched: Set<string>;                              // moved by any answer this session
  asked: string[];
  answers: { questionId: string; answer: Answer }[];
  seed: number;
}
export function initialState(picks: Picks, seed: number, alreadyAsked?: readonly string[]): DraftState;
  // `alreadyAsked` = the log's ids (from /interview); they go into `asked` so they are never re-asked.

// apply.ts
export function applyAnswer(state: DraftState, q: Question, answer: Answer): DraftState;  // new object, input untouched

// questions.ts
export function askable(q: BankQuestion, listed: ReadonlySet<string>): boolean;          // §4a rule
export function fromBank(q: BankQuestion, listed: ReadonlySet<string>): Question;        // effects over listed targets only
export function adjacentOffers(state: DraftState, topics: readonly InterviewTopic[]): { q: Question; score: number }[];
export function faceOffs(state: DraftState, topics: readonly InterviewTopic[], hasFace: (id: string) => boolean): { q: Question; score: number }[];
export function bankCandidates(state: DraftState, topics: readonly InterviewTopic[], bank: readonly BankQuestion[]): { q: Question; score: number }[];

// chooser.ts
export function nextQuestion(state: DraftState, topics: readonly InterviewTopic[], bank: readonly BankQuestion[], hasFace: (id: string) => boolean): Question | null;
```

- [ ] Test first, `apply.test.ts` (every rule in §4 "Moves"):
      - `up` on an absent topic → present at `weightOf("some")`; on `some` → `lot`; on `lot` →
        stays `lot`; on `little` → `some`.
      - `down` on an absent topic → still absent (D2); on `lot` → `some`; on `some` → `little`;
        on `little` → stays `little`.
      - A yes/no's `yes` applies every `effects.yes` move; `no` every `effects.no`; a pair's
        `a`/`b`/`either`/`neither` likewise; `skip` moves nothing.
      - Every answer, including `skip`, appends to `asked` and `answers`; moved topics are added
        to `touched`; `before` is untouched; the input state object is not mutated (check its
        `asked.length` and `weights.size` after).
      - A weight above `weightOf("lot")` (a saved-from 3.0) moved `up` stays as it is; moved
        `down` becomes `weightOf("some")` (levels, not arithmetic).
- [ ] Test first, `questions.test.ts`:
      - `askable`: a yes/no with one listed target → true; with none → false; a pair with a
        listed target on each side → true; with one side empty → false (review focus 3).
      - `fromBank` on a yes/no with targets `[machines, technical-drawing]` and only `machines`
        listed: id `bank:engineering`, `effects.yes = [{ machines, up }]`, `effects.no =
        [{ machines, down }]`, `faces = ["technical-drawing"]` only if listed, else `[]`.
      - `fromBank` on a pair: `effects.a = [a-targets up, b-targets down]`, `b` the reverse,
        `either = [all up]`, `neither = [all down]`, faces the two ids.
      - `adjacentOffers`: topics `architecture` (present, `some`) with neighbours
        `[{ brutalist, 0.5 }, { photography, 0.4 }]`, `brutalist` absent, `photography` present →
        exactly one offer, id `adj:architecture:brutalist`, prompt
        `"You picked Architecture. Brutalist too?"`, faces `["brutalist"]`, `effects.yes =
        [{ brutalist, up }]`, `effects.no = []`, score `ADJ_SCALE × 0.5 / 0.5 = 3`. A neighbour
        with `sim ≤ 0` is never offered. Two present topics sharing an absent neighbour produce
        **one** offer, from the stronger edge (review focus 5). A neighbour in `touched` (brought
        in or declined by any earlier answer) is not offered; an id in `asked` is not offered.
      - `faceOffs`: `star-wars` and `star-trek` present at the same level, both with faces → one
        pair `pair:star-trek:star-wars` (ids sorted), score `FACEOFF_SCALE × (1 − |wa − wb| / 2)`
        = 2 at equal weights (1.0 and 1.2 are both `some` → `2 × 0.9`). Different levels → no
        face-off at all (same level is the precondition); two present topics in different groups
        → none; one without a face → none; already in `asked` → none.
      - `bankCandidates`: a cold question with two listed targets, both absent and untouched, in
        a state with no picks → score `BANK_SCALE × priority/5 × 1 × COLD_BOOST`; the same with
        three present topics → no boost; with one target present → freshness `0.5`; a `both`
        question whose two topics are present → score `BANK_SCALE × priority/5` (freshness 1 for
        sharpening questions); a `both` with one missing → not a candidate; an id in `asked` →
        not a candidate; an unaskable question → not a candidate.
- [ ] Test first, `chooser.test.ts` (the real bank, a topic fixture of the sixteen originals with
      neighbours from `neighboursFor`, `hasFace = () => true` unless stated):
      - Cold (no picks): the first question is a `bank:` question with `cold` and priority 5 that
        is askable against the sixteen (`bank:abstract-or-figurative` is not — `abstract` is not
        among the sixteen — so it is one of the priority-5 yes/nos askable there; assert the
        prefix and that `applies.cold` holds).
      - Picks `{ "star-wars": 1, "star-trek": 1 }` with a topic fixture that lists both (add
        them to the fixture for this case): the first question is `bank:star-wars-or-star-trek`
        (priority 5 both-present → 2.0, ties with a face-off at 2.0 → the seeded tie-break
        decides; assert it is **one of those two ids**, and that with `hasFace = () => false`
        it is the bank one).
      - The same question is never returned twice: loop `applyAnswer(…, "skip")` on each
        result until `null`; assert ids unique and the loop ends by `INTERVIEW_BUDGET` at the
        latest.
      - With `alreadyAsked` containing every bank key askable from the sixteen and no picks →
        `null` at once (review focus 2).
      - Determinism: two runs with the same seed and answers yield the same id sequence; a
        different seed may differ only where scores tie (assert equality of the sorted
        score-distinct prefix — simpler: assert the first question with seed 1 equals the first
        with seed 1 across two calls).
      - Stops when the best score is under `SCORE_FLOOR`: a state where every candidate's score
        is below it (construct with a bank of one priority-1 cold question, three present
        topics, one target present → `2 × 0.2 × 0.5 = 0.2`) → `null`.
- [ ] Run; fail. Write the four modules. `chooser.ts`: gather the three candidate lists, drop
      `asked` ids, sort by score desc then by `hashSeed(`${state.seed}:${q.id}`)` asc, return
      the head if `score >= SCORE_FLOOR` and `state.answers.length < INTERVIEW_BUDGET` (the
      budget counts this session's answers; `asked` also holds the log's ids and is only the
      never-twice set). Prompts: adjacent offer
      `You picked ${labelP}. ${labelN} too?`; face-off `Which of these?`. Labels from `topics`.
      Header comments cite §4 by paragraph. Freshness: for `cold` questions,
      untouched-and-absent listed targets / listed targets; for `both`/`any`, 1.
- [ ] Green. Commit: `feat(interview): the engine — apply, generated questions, the chooser`.

## Task 5 — Faces: config, resolver, `interview.faces`, `/dev/faces`

**Files:** create `src/server/config/topic-faces.ts`, `src/server/db/interview.ts`,
`src/server/db/interview.integration.test.ts`, `src/server/services/topic-faces.ts`,
`src/server/services/topic-faces.test.ts`, `src/server/api/routers/interview.ts`,
`src/app/dev/faces/page.tsx`, `src/components/dev/faces-bench.tsx`; modify
`src/server/api/root.ts`, `src/server/api/routers/routers.test.ts` (surface list).

**Produces:**

```ts
// config/topic-faces.ts
export interface FaceRef { source: string; sourceId: string }
export const TOPIC_FACES: Readonly<Record<string, readonly FaceRef[]>>;   // {} to start
// db/interview.ts  (Face is `lib/interview/types.ts`'s; `source`/`sourceId` set for the bench)
export async function listHandPickedFaces(refs: readonly (FaceRef & { topicId: string })[]): Promise<Map<string, Face[]>>;
export async function listCorpusFaces(topicIds: readonly string[], perTopic: number, scoreFloor: number): Promise<Map<string, Face[]>>;
// services/topic-faces.ts
export async function facesForTopics(topicIds: readonly string[]): Promise<Map<string, Face[]>>;  // hand picks first, corpus fills to FACES_PER_TOPIC; memoised 10 min
export function _resetFacesMemo(): void;   // tests
// routers/interview.ts
interview.faces  → { topicId: string; faces: Face[] }[]   (every listed faceted topic)
```

- [ ] `topic-faces.ts`: an empty map with a header — keyed by `(source, sourceId)` because an
      item's nanoid differs per database (§4 "Faces"); `/dev/faces` prints the line to paste;
      a ref whose item is absent here is skipped silently (CI, a fresh database).
- [ ] Test first, `interview.integration.test.ts` (`describe.skipIf(!process.env.DATABASE_URL)`,
      fixtures via `db/test-fixtures.ts`'s `insertHomedItems` — read it — under a unique test
      topic, cleaned in `afterAll`):
      - `listCorpusFaces([topic], 2, 8.5)`: with three image rows at scores 9.5 / 9 / 8 and one
        article at 9.8 → the two pictures ordered 9.5 then 9; the article never; a row with
        `imageWidth` set outranks an unmeasured one at the same score; an unknown topic → no entry.
      - `listHandPickedFaces([{ topicId, source, sourceId }])` → that item's `{ id, imageUrl }`;
        a ref with no row → no entry.
- [ ] `db/interview.ts`: `listCorpusFaces` as one window query, modelled on
      `db/collections.ts`'s `withCovers`:
      `row_number() over (partition by item_topic.topic_id order by (item.image_width is not null) desc, item.curation_score desc, item.id)`
      over `item_topic ⋈ item` where `topic_id in (…)`, `type = 'image'`, `image_url is not
      null`, `curation_score >= floor`, `source not in SUSPENDED_SOURCES`; outer `where n <=
      perTopic`. Group into the map. `listHandPickedFaces`: `select id, image_url, source,
      source_id from item where (source, source_id) in (…)` (build with `or(and(eq, eq)…)`),
      map back by ref.
- [ ] Test first, `topic-faces.test.ts` (mock `~/server/db/interview` with `vi.mock`): hand pick
      first, corpus fills to `FACES_PER_TOPIC`, no duplicates by id, a topic with neither → `[]`
      is **present** in the map (the client must be able to tell "asked, none" from "not
      asked"); a second call within the memo window does not hit the DB (`_resetFacesMemo`
      between tests). Copy `services/landing-pool.ts`'s memo shape.
- [ ] `routers/interview.ts`: `createTRPCRouter({ faces: protectedProcedure.query(async () => { const rows = await listTopics(); const map = await facesForTopics(rows.map(r => r.id)); return rows.map(r => ({ topicId: r.id, faces: map.get(r.id) ?? [] })); }) })`.
      Register `interview: interviewRouter` in `root.ts`. `routers.test.ts`: the surface list
      gains `"interview.faces"` (Tasks 6 adds two more; write the comment's history line once,
      here: "09-28-26 adds the `interview` router: `faces`, `answers`, `complete`"). Add the
      UNAUTHORIZED test.
- [ ] `/dev/faces`: `page.tsx` is a copy of `/dev/marks`'s gate (`notFound()` unless
      `feedDebugEnabled()`); it calls `listTopics()` and `facesForTopics()` server-side and
      renders `<FacesBench rows={…} />`: one row per topic — label, facet, the faces as 160 px
      `<img src={imageSrc(id, imageUrl)}>` tiles, and under each the paste line
      `` `${topicId}: [{ source: "…", sourceId: "…" }]` `` (`Face.source`/`sourceId`, set by both
      resolvers, are for this bench). Topics with no
      face are listed first, in red, so the gap is the first thing seen.
- [ ] Green. Commit: `feat(interview): faces — hand picks, corpus fallback, the dev bench`.

## Task 6 — The answer log: schema, migration, `complete`, `answers`

**Files:** modify `src/server/db/schema.ts`, `src/server/db/topics.ts` (split `setUserTopics`),
`src/server/db/interview.ts`, `src/server/db/interview.integration.test.ts`,
`src/server/api/routers/interview.ts`, `src/server/api/routers/routers.test.ts`,
`src/server/api/routers/routers.integration.test.ts`; create `drizzle/0010_interview_answer.sql`
via the generator.

**Produces:**

```ts
// schema.ts
export type InterviewAnswerValue = "yes" | "no" | "a" | "b" | "either" | "neither" | "skip";
export const interviewAnswer = pgTable("interview_answer", { id, userId, questionId, answer, askedAt }, [index on userId]);
// db/topics.ts
export async function setUserTopicsIn(tx: Tx, userId: string, picks: readonly TopicPick[]): Promise<void>;  // the body; setUserTopics wraps it in db.transaction
// db/interview.ts
export async function completeInterview(userId: string, picks: readonly TopicPick[], answers: readonly { questionId: string; answer: InterviewAnswerValue }[]): Promise<{ answers: number }>;
export async function listInterviewAnswers(userId: string): Promise<{ questionId: string; answer: InterviewAnswerValue; askedAt: Date }[]>;
// routers/interview.ts
interview.complete  input { picks: {topicId, weight}[] (min 1), answers: { questionId: string (1..200), answer: enum }[] } → { ok: true, answers: number }
interview.answers   → { questionId, answer, askedAt }[]
```

- [ ] Schema: the table exactly as §4 "Persistence", in the style of `ingestRun` (nanoid id,
      `timestamp("asked_at", { withTimezone: true }).notNull().defaultNow()`,
      `index("idx_interview_answer_user").on(table.userId)`, and
      `check("interview_answer_value", sql`${table.answer} in ('yes','no','a','b','either','neither','skip')`)`
      — the `$type` is compile-time only, and the log must refuse a value the engine does not
      know), with a header comment: a log, not state (D6); never demographics; retired questions
      keep their rows. Add a `relations` entry if the file declares them for `user`.
- [ ] `bun run db:generate --name interview_answer` → `drizzle/0010_interview_answer.sql`; read
      it; it must be one `CREATE TABLE` + one `CREATE INDEX` + the FK. `bun run db:migrate`
      locally.
- [ ] Test first, integration:
      - `completeInterview(user, [{ a, 2 }], [{ "bank:space", "yes" }, { "adj:a:b", "skip" }])`
        → `{ answers: 2 }`; `user_topic` holds `a` at 2; `listInterviewAnswers(user)` returns the
        two, oldest first, with `askedAt` set.
      - Atomicity (review focus 4): pass an `answer` outside the enum (`"maybe" as never`). The
        schema's **check constraint** (below) makes Postgres reject the insert; assert the call
        rejects and `user_topic` is unchanged from before it (the picks in the same call did not
        land).
      - A second `completeInterview` for the same user appends answers and replaces picks with
        the weight-preserving rule (a kept topic keeps its weight).
- [ ] `db/topics.ts`: extract the transaction body of `setUserTopics` into
      `setUserTopicsIn(tx, userId, picks)` (type `Tx` = the parameter type of the
      `db.transaction` callback — `Parameters<Parameters<typeof db.transaction>[0]>[0]`; export
      it from `db/client.ts` as `export type Tx`), and have `setUserTopics` call it inside
      `db.transaction`. Behaviour unchanged; existing tests prove it.
- [ ] `db/interview.ts`: `completeInterview` = `db.transaction(async (tx) => { await setUserTopicsIn(tx, userId, picks); if (answers.length) await tx.insert(interviewAnswer).values(answers.map(a => ({ userId, ...a }))); })`.
      `listInterviewAnswers`: `where userId order by askedAt asc, id asc`.
- [ ] Router: `complete` validates `picks` ids against `listTopics()` exactly as `topics.setMine`
      (extract that check into a small `assertPickable(ids)` helper in `routers/topics.ts` and
      export it; both routers use it), then `completeInterview`. `answers` → `listInterviewAnswers`.
      `routers.test.ts`: surface list to twenty-five; UNAUTHORIZED tests for both;
      `complete` with `picks: []` → BAD_REQUEST. `routers.integration.test.ts`: a round trip
      through the caller (`complete` → `answers` → `topics.mine`), and that a fresh reader's
      `hasCompletedOnboarding` flips true on `complete` (the gate is unchanged: rows in
      `user_topic`).
- [ ] Green (DB suites with `DATABASE_URL`). Commit: `feat(interview): the answer log —
      interview_answer, complete (one transaction), answers`.

## Task 7 — `InterviewScreen`

**Files:** create `src/components/interview/interview-screen.tsx`,
`src/components/interview/interview-screen.test.tsx`, `src/components/interview/face-card.tsx`,
`src/components/interview/face-card.test.tsx`.

**Produces:**

```ts
export interface FaceCardProps { topicLabel: string; face?: Face; emphasis?: boolean; onClick?: () => void; pressed?: boolean }
export function FaceCard(props: FaceCardProps): JSX.Element;    // picture (contain, fixed 4:5 box) with the label under it, or the label card

export interface InterviewScreenProps {
  topics: readonly InterviewTopic[];
  faces: ReadonlyMap<string, Face[]>;
  initialPicks: Picks;
  seed: number;                                   // hashSeed(userId) — the host computes it
  alreadyAsked?: readonly string[];               // the log's ids (/interview)
  /** Called with the final state on "skip to my summary" / "that's enough" or when nothing is left to ask. */
  onFinish: (state: DraftState) => void;
  /** Copy for the exit control: onboarding "Skip to my summary", /interview "That's enough". */
  exitLabel: string;
}
export function InterviewScreen(props: InterviewScreenProps): JSX.Element;
```

- [ ] Test first, `face-card.test.tsx`: with a face → an `<img>` whose `src` is
      `imageSrc(face.id, face.imageUrl)` (a `data:` URL passes through; an http URL becomes
      `/api/img/<id>`) and `alt` = the label; without a face → no `<img>`, the label as text, a
      `data-face="label"` attribute; `onClick` + `pressed` → a `button` with `aria-pressed`;
      without `onClick` → a `figure`. An `<img>` `onError` flips the card to the label variant
      (fire `error` on the img and assert `data-face="label"`).
- [ ] Test first, `interview-screen.test.tsx` (jsdom; `vi.mock` nothing — the engine is pure;
      fixture: the sixteen originals with neighbours from `neighboursFor`, the real bank, faces
      `new Map([["astronomy", [{ id: "i1", imageUrl: "data:image/gif;base64,R0lGOD" }]]])`):
      - Cold: renders a question (`role="heading"` level 2 with the prompt), the count
        `"1 of about 10"`, a `"Skip to my summary"` button (from `exitLabel`), and for a yes/no
        the buttons `Yes · No · Skip`; for a pair two cards each a button named
        `"This one: <label>"` plus `Either · Neither · Skip`.
      - Answering advances: after `Yes`, the count reads `"2 of about 10"` and the heading changed;
        the same id never reappears through ten answers (collect prompts+ids via a
        `data-question-id` attribute on the heading).
      - The exit button calls `onFinish` with a state whose `answers.length` equals the number
        answered and whose `weights` reflect them (answer `bank:space`… the first question's id
        is whatever the chooser picks; assert `Object.keys(effects)`-agnostically: after one `Yes`,
        `state.weights.size >= 1` and `state.touched.size >= 1`).
      - When `nextQuestion` returns `null` at mount (pass `alreadyAsked` = every askable id from
        a cold sixteen; compute in the test by looping the chooser) the screen renders
        `"Nothing more to ask right now."` and calls `onFinish` once, with zero answers (review
        focus 2).
      - After the budget (ten answers) the screen finishes on its own (`onFinish` called once).
      - Pair with both faces the same item id (fixture two topics → same `{ id: "i1" }`): the
        second card renders the topic's second face if any, else the label card — assert only one
        `<img>` with `i1` (review focus 1).
      - The `"Skip"` answer moves nothing but advances (`answers` grows with `answer: "skip"`).
- [ ] Run; fail. Write the screen: `useState<DraftState>(() => initialState(initialPicks, seed, alreadyAsked))`,
      `const q = useMemo(() => nextQuestion(state, topics, INTERVIEW_BANK, hasFace), [state])`
      where `hasFace = (id) => (faces.get(id)?.length ?? 0) > 0`; a `useEffect` that calls
      `onFinish(state)` once when `q === null` (guard with a ref so it fires once). Layout: the
      narrow `Column`; a `Rise key={q.id}` around the eyebrow (`Ambit · Setup · Refine` when
      hosted by onboarding — pass an `eyebrow` prop; `/interview` passes `Ambit · A few more
      questions`), the `h2` prompt with `data-question-id`, then one `FaceCard` (yes/no) or two in
      a `grid grid-cols-1 gap-4 md:grid-cols-2`; the fixed bottom bar (copy onboarding's) holds the
      answer buttons (`Button shape="pill"`, ghost for Skip) and the count line + the exit button
      (a text button). Tapping a card in a pair answers `a`/`b`. Header: §5, the two hosts, why
      the engine owns nothing about rendering and the screen owns nothing about scoring.
- [ ] Green. Commit: `feat(interview): InterviewScreen and FaceCard`.

## Task 8 — The hosts: onboarding's Refine phase and `/interview`

**Files:** modify `src/components/onboarding/onboarding-screen.tsx`,
`src/components/onboarding/onboarding-screen.test.tsx`, `src/app/onboarding/page.tsx`,
`src/components/profile/topics-screen.tsx`, `src/components/profile/topics-screen.test.tsx`,
`src/proxy.ts` (`AUTHED_PREFIXES` + `/interview`), `src/proxy.test.ts` if it pins the list;
create `src/app/interview/page.tsx`, `src/components/interview/interview-revisit.tsx`,
`src/components/interview/interview-revisit.test.tsx`.

- [ ] Test first, onboarding (extend plan 1's tests; the trpc mock now models
      `interview.complete` with `mutateAsync` instead of `topics.setMine`; props gain `faces`
      and `seed`; the fixture topics carry `neighbours: []` except astronomy → moon at 0.5):
      - `PHASES` is `Pick · Refine · Start`: after the fourth Next the current step is `"Refine"`
        and an interview question renders with `"Skip to my summary"`.
      - Skip → Start, with the picks as they were; Start writes via `interview.complete` with
        `answers: []`.
      - Pick Space, Refine: answer the first question `Yes` (or `Either`/`This one` if a pair —
        write a helper that presses the first positive answer available), Skip → Start: the
        summary shows at least the two Space rows, and any topic the answer brought in carries
        `"suggested"`; the write's `answers` has one entry with that question's id.
      - Nothing picked, every answer `Skip` through ten → Start is disabled with the floor hint
        (no picks were made), and Back from Start goes to **Place**, not into the interview (the
        interview is not re-entered by Back; its answers stand — document why: re-asking a logged
        question would be a second answer to the same id).
      - Nothing askable at all (`topics` with no neighbours and a bank of nothing — pass an empty
        bank through a `bank` prop defaulting to `INTERVIEW_BANK`): Refine finishes at once and
        the screen lands on Start without a flash of an empty question (assert Start's heading
        after the fourth Next).
- [ ] Onboarding screen: `PHASES = [pick, refine, start]`; stage `FACETS.length` is Refine,
      `FACETS.length + 1` is Start. Refine renders
      `<InterviewScreen topics faces initialPicks={picks} seed exitLabel="Skip to my summary" eyebrow="Ambit · Setup · Refine" onFinish={(s) => { setPicks(new Map(s.weights)); setSuggested(new Set([...s.weights.keys()].filter((id) => !s.before.has(id)))); setAnswers(s.answers); setStage(FACETS.length + 1); }} />`
      — **no** `Rise`/bar of its own around it (the screen brings both). Back from Start →
      `FACETS.length - 1`. Start passes `suggested` to `TopicLevels`. Submit:
      `interview.complete.mutateAsync({ picks: …, answers })`.
- [ ] `onboarding/page.tsx`: prefetch nothing new; compute
      `const faces = await facesForTopics(topics.map(t => t.id))` server-side and pass it as an
      array of `[topicId, Face[]]` entries (a `Map` does not serialise across the RSC boundary;
      the screen rebuilds it); `seed = hashSeed(session.user.id)`.
- [ ] Test first, `interview-revisit.test.tsx` (mock `api.topics.list`, `api.topics.mine`,
      `api.interview.answers`, `api.interview.faces`, `api.interview.complete`, `useRouter`):
      - Mounts `InterviewScreen` from `mine` with `alreadyAsked` = the log's ids and
        `exitLabel="That's enough"`.
      - After one positive answer and the exit: a summary headed `"What changed"` listing only
        moved or suggested topics (`TopicLevels` over a filtered `picks`), a `"Save"` button →
        `interview.complete` called with the full picks (moved and unmoved) and the answers, then
        `push("/profile/topics")`; a `"Cancel"` link → `push("/profile/topics")` with no write.
      - Nothing to ask: `"Nothing more to ask right now."` and only the `Cancel`/back link.
- [ ] `interview-revisit.tsx` (`"use client"`) as above; `app/interview/page.tsx`: session guard
      (`redirect("/")`), `hasCompletedOnboarding` false → `redirect("/onboarding")`, prefetch
      `topics.list`, `topics.mine`, `interview.answers`, `interview.faces`, render inside
      `HydrateClient`. Add `"/interview"` to `AUTHED_PREFIXES` (and its test if one enumerates
      the list — grep `proxy.test`).
- [ ] Topics page: under the `TopicLevels` block, `<Link href="/interview" className="text-accent …">Ask me a few more questions</Link>`;
      test: the link is present with that name and href.
- [ ] Green. `bun run check`. Commit: `feat(interview): the Refine phase in onboarding, and
      /interview from the topics page`.

## Task 9 — Playwright

**Files:** modify `e2e/support.ts` (`completeOnboarding`), create `e2e/interview.spec.ts`.

- [ ] `completeOnboarding`: after the fourth Next, the Refine phase — `const skip =
      page.getByRole("button", { name: "Skip to my summary" }); if (await skip.count()) await skip.click();`
      (nothing askable lands on Start by itself), then the Start assertions as in plan 1.
      Comment: why the helper skips (every other spec wants the picks it pressed and nothing the
      interview would add).
- [ ] `e2e/interview.spec.ts` (both projects; seed `seedFeedCorpus(conn, prefix, 40, ["astronomy", "botany", "music"])`
      in `beforeAll` so faces resolve from the pool and the feed has tiles; clean in `afterAll`):
      - **Cold interview seeds a feed.** Sign up (copy `auth.spec.ts`'s sign-up steps into a
        helper if `support.ts` lacks one), press no chips, Next ×4, expect a question heading and
        `"1 of about 10"`; answer positively three times with a helper
        `answerPositively(page)` that clicks the first of `Yes` / `Either` / `This one: …`
        present; expect `"4 of about 10"`; click `"Skip to my summary"`; expect the Start heading
        and at least one `role="group"` named `/ level$/` whose row shows `"suggested"`; click
        `"Start exploring"`; `/feed` with a tile.
      - **`/interview` adds a suggested topic.** Sign up, `completeOnboarding(page,
        ONBOARDING_GROUPS)`, go to `/profile/topics`, click `"Ask me a few more questions"`,
        `waitForURL("/interview")`, answer positively until a `"What changed"` heading appears
        or five answers are given then click `"That's enough"`; expect a row with `"suggested"`
        (if none — every positive answer only bumped present topics — accept a row with a level
        change instead: assert the summary has at least one group named `/ level$/`); click
        `"Save"`; `waitForURL("/profile/topics")`; expect the summary's row count to be at least
        the three from onboarding.
      - **A logged question is not asked again.** In the previous test, record the first
        question's `data-question-id` before answering. Then open `/interview` again with the
        same reader: either `"Nothing more to ask right now."` renders, or a question renders
        whose `data-question-id` differs from every id answered in that visit (record them all as
        the test answers).
- [ ] `bun run e2e:prod` green, then the CI shape (plan 1 Task 10's block — the fixtures and
      the sixteen-topic bank askability are what it proves).
- [ ] Commit: `test(e2e): the interview — cold seeding, /interview, never twice`.

## Task 10 — Docs, log, gates

- [ ] `SPEC.md` §5: the `interview_answer` table; §7: the `interview` router (three procedures)
      and `topics.list`'s `neighbours`; §8.1 onboarding: Pick · Refine · Start.
- [ ] `docs/DESIGN_onboarding-interview.md`: a dated "Built" line at the top of §4 and §5 naming
      the branch, and any number that moved from the table (none, unless tuning happened).
- [ ] `CLAUDE.md`: extend plan 1's bullet — the interview is built; the engine's home; the
      `interview_answer` log; `/dev/faces`; that the graph never ships and `topics.list` carries
      five neighbours; one trap worth recording if met (a face that is the same item on both
      sides of a pair; a bank question unaskable on CI).
- [ ] `docs/BUILD_PLAN.md` 8.4: ✅ built (both plans), deployed when Ben deploys; note the
      migration 0010 runs at boot.
- [ ] `log.md`: extend the 09-28 entry or add the day's — **Shipped / Decisions / Open** (tuning
      the chooser's constants from real answers; the LLM door; "never show me"; hand-picking
      faces on `/dev/faces`) — and the spend line (`python3 ~/.claude/scripts/session-spend.py
      --session <uuid>`; omit on non-zero exit).
- [ ] Gates: `bun run check`, `bun run test` (with `DATABASE_URL`), `bun run e2e:prod`, the CI
      shape. All green before the push.
- [ ] Push the branch. Ben looks on the phone and at 1440, and reads `/dev/faces` once, and
      decides on merge. Not deployed by this session.

## Verification, end to end

1. `bun run dev`, a fresh invite, sign up. Pick nothing; Next ×4. A question with a picture
   from the corpus (or a label card): "Do you like pictures that unsettle you a little?" or a
   pair. Answer honestly for ten, or skip out early. Start: the topics the answers brought in,
   each marked "suggested", at "some"; a `Yes` twice on the same territory shows "a lot".
2. Sign up again; pick "Space" whole and "Fandoms" whole. Refine: the Star Wars / Star Trek pair
   comes early; an offer like "You picked Astronomy. Space exploration too?" follows. The Space
   topic you preferred reads "a lot" on Start, the other "a little".
3. `/profile/topics` → "Ask me a few more questions": questions you have not seen; "That's
   enough" → "What changed" → Save → the rows are there. Open `/interview` again: the first
   question differs, or "Nothing more to ask right now."
4. `/dev/faces`: every topic's two faces; the red rows at the top are the ones to hand-pick.
   Paste one line into `topic-faces.ts`, reload after ten minutes (the memo) or restart: the
   hand pick leads.
5. Reduce Motion on: the question cards still rise (collapsed), nothing else moves.
