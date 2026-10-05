# Onboarding v2, plan 1 of 2 — the re-cut, reader-facing levels, the two-level picker, the summary

> **Superseded 10-02-26.** Built on `feat/onboarding-foundation` (never merged). [`PLAN_onboarding-questionnaire.md`](PLAN_onboarding-questionnaire.md) ported four pieces of it by file — the levels leaf, the toast's `role="status"`, the weighted `topics` API and the write queue — and left the rest behind (the 75-group cut, `GroupPicker`, `picks.ts`, the Pick → Start onboarding). Kept as history; do not merge the branch.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-28-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `88f62e0`. **For:** a cold session on a cheaper model, on a plain branch
`feat/onboarding-foundation` off `main` (Ben's convention — no worktree, unless another session
holds the checkout).

**Goal:** onboarding becomes Pick → Start: four facet screens of honest, two-level group chips
with no floor, then a summary where every picked topic shows a level (_a little · some · a lot ·
off_) the reader can set; `/profile/topics` shows the same summary above the same picker and saves
every change at once. The interview (plan 2, `PLAN_onboarding-interview.md`) slots in between Pick
and Start later and changes nothing built here.

**Architecture:** one no-import leaf (`config/topic-levels.ts`) owns the three numbers and the
bands; pure pick functions (`components/topics/picks.ts`) own what a group or member tap writes;
two shared client components (`GroupPicker`, `TopicLevels`) are hosted by the onboarding screen
(draft state, one write) and the topics page (live state, a write per change). The server learns to
take a weight per pick (`setUserTopics`), to return weights (`topics.mine`), and to snap one
(`topics.setWeight`). No schema change, no migration.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query v5, Drizzle over Postgres
17, Tailwind v4, Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4. **No new dependencies.**

**Spec:** `docs/DESIGN_onboarding-interview.md` — read it first. This plan implements §1, §2 and §3
(Decisions 4, 5, 7, 9). §4 and §5 are plan 2, and so is the one §2 item nothing here needs yet:
`topics.list`'s `neighbours` (only the interview's generated questions read it).

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task, `bun run check`
  (typecheck + lint + format + unit) before each commit. Commit per task, message in the house
  style (`feat(onboarding): …`, `refactor(topics): …`).
- Comment generously: Ben is a returning webdev and the repo teaches. Cite the design's section
  numbers (§2, D4 …) in header comments, in the voice of the existing files.
- The three level numbers and two band edges exist in **one** place, `config/topic-levels.ts`.
  Nothing else writes `0.5`, `1.0`, `2.0`, `0.75` or `1.5` as a weight.
- `topics.setMine` keeps its weight-preserving replace: a kept row keeps its learned weight.
- Nothing about a group reaches the database: `setMine` receives topic ids and weights only.
- Off = the row removed. Never write a weight of 0.
- Copy is placeholder in the app's current voice (the copy pass owns the words); the strings in
  this plan are what the tests assert, so use them verbatim.
- Do not push until Task 11; do not merge. Ben looks on the phone and at 1440 first.

## Review focus

Inputs the spec implies but no task's tests would exercise unless listed here. Each line names
the task whose tests pin it.

1. A reader whose stored weight is exactly a band edge (0.75, 1.5) — `levelOf` must be
   deterministic at the edge and the summary must not flicker between two levels. → Task 2.
2. A saved-from weight above 2.0 (the nudge caps at 3.0) shown as "a lot", and a hand-set "a lot"
   afterwards snapping _down_ to 2.0 — the reader asked for "a lot", not for "keep 3.0". → Task 4.
3. A group whose only listed member is already present, tapped again: the group reads "on", so
   the tap must release it, not re-add it at a different weight. → Task 6.
4. `setWeight` for a topic the reader has no row for (a stale summary after a sign-in elsewhere):
   `NOT_FOUND`, and the client reverts the segmented control rather than showing the new level
   over a row that does not exist. → Tasks 4 and 9.
5. The Start button with nothing picked: disabled, and a click on it anyway must not call the
   mutation (defense in depth, as every CTA in this app). → Task 8.

---

## Task 1 — Docs first

- [ ] Branch: `git checkout -b feat/onboarding-foundation main`. Verify
      `docs/DESIGN_onboarding-interview.md` and this file are on it (committed on `main` by the
      design session).
- [ ] `docs/DESIGN_topic-facets-and-personas.md` §2a: add one paragraph at the end, dated
      09-28-26: the 34 groups were re-cut into 75 and the picker became two-level; pointer to
      `DESIGN_onboarding-interview.md` §1 and §3. Do not rewrite §2a; it is history.
- [ ] Commit: `docs(onboarding): point the facets design at the re-cut`.

## Task 2 — The levels leaf

**Files:** create `src/server/config/topic-levels.ts`, `src/server/config/topic-levels.test.ts`.

**Produces:**

```ts
export type Level = "little" | "some" | "lot";
export const LEVELS: readonly Level[];                    // ["little", "some", "lot"], display order
export const LEVEL_LABELS: Record<Level | "off", string>; // "a little" | "some" | "a lot" | "off"
export function weightOf(level: Level): number;           // 0.5 | 1.0 | 2.0
export function levelOf(weight: number): Level;           // bands at 0.75 and 1.5 (§2)
export function pickWeight(listedMembers: number): number; // 1 member → weightOf("lot"), else weightOf("some")
```

- [ ] Test first, `topic-levels.test.ts`:
      - `weightOf` returns 0.5 / 1.0 / 2.0.
      - `levelOf`: 0.5 → little; 0.74 → little; **0.75 → some** (edge belongs to the higher
        band); 1.0 → some; 1.49 → some; **1.5 → lot**; 2.0 → lot; 3.0 → lot; 7 → lot (a fixture
        super-cap value); 0 → little (never written, but never throws).
      - Round trip: for every level, `levelOf(weightOf(level)) === level`.
      - `pickWeight(1) === weightOf("lot")`; `pickWeight(2)` and `pickWeight(12)` equal
        `weightOf("some")`; `pickWeight(0)` equals `weightOf("some")` (a group with nothing listed
        writes nothing anyway; the function must not throw).
      - `LEVEL_LABELS` are exactly `"a little"`, `"some"`, `"a lot"`, `"off"`.
- [ ] Run it, watch it fail on the missing module.
- [ ] Write the leaf. **No imports** (the client bundles it, like `feed-knobs.ts` — copy that file's
      header rationale). Header comment: §2's table, why three words, why the bands are half-open
      upward, why `pickWeight` treats a singleton group as naming one thing (§2 "What a list pick
      writes"), and that `WEIGHT_BUMP`/`WEIGHT_CAP` in `db/topics.ts` are the save-side constants
      and stay there.
      ```ts
      const WEIGHT: Record<Level, number> = { little: 0.5, some: 1.0, lot: 2.0 };
      const LOT_FROM = 1.5;
      const SOME_FROM = 0.75;
      export function levelOf(weight: number): Level {
        if (weight >= LOT_FROM) return "lot";
        if (weight >= SOME_FROM) return "some";
        return "little";
      }
      export function pickWeight(listedMembers: number): number {
        return listedMembers === 1 ? WEIGHT.lot : WEIGHT.some;
      }
      ```
- [ ] Green. Commit: `feat(topics): the three reader-facing levels, in one leaf`.

## Task 3 — The re-cut

**Files:** modify `src/server/config/topic-groups.ts`, `src/server/config/topic-groups.test.ts`,
`e2e/support.ts` (`ONBOARDING_GROUPS` only), and the group-label constants at the top of
`src/components/onboarding/onboarding-screen.test.tsx` and
`src/components/profile/topics-screen.test.tsx`.

- [ ] Test first, `topic-groups.test.ts`: change the size assertion to
      `[36, 19, 14, 6]` and its title to "is the size the design recorded (09-28-26): 36 subject,
      19 medium, 14 look, 6 place". Update the two `groupsFor` expectations: with `astronomy`,
      `botany`, `ceramics`, `music` listed, the subject groups shown are `["Space", "Plants",
      "Music, sound & dance"]` and `subject[0].members` is `["astronomy"]`; with `textiles`,
      `ceramics`, `typography` listed, the medium groups are `["Graphic design & type",
      "Ceramics & glass", "Textiles"]` (config order: graphic-design-and-type comes before
      ceramics-and-glass, which comes before textiles-group) and the ceramics group's members
      are `["ceramics"]`. Add one test: every group with `-group` in its id has a natural slug
      that _is_ a topic id (`TOPIC_FACETS[id.replace(/-group$/, "")]` defined) — the suffix
      rule stays honest.
- [ ] Run; the size test fails.
- [ ] Replace `TOPIC_GROUPS` with the 75 groups of the design's §1 tables, **verbatim** (ids,
      labels, members, in the tables' order within each facet; Place unchanged). Rewrite the
      file's header: the 09-28 reasons (vague, lumping), the rules (§1 "Rules"), the singleton
      stance, and keep the two pinned rules and the "groups render from what the server lists"
      paragraph. `groupOf` and `groupsFor` are unchanged.
- [ ] `e2e/support.ts`: `ONBOARDING_GROUPS = ["Space", "Plants", "Music, sound & dance"]` and fix
      its comment (the three still hold astronomy, botany and music on CI).
- [ ] The two component tests: `SPACE = "Space"`, `PLANTS = "Plants"`, `CRAFT` → `CERAMICS =
      "Ceramics & glass"`, `SURREAL = "Surreal & psychedelic"` (rename every use). They will be
      rewritten in Tasks 8 and 9; this keeps `bun run test` green at this commit.
- [ ] `bun run test` green. Commit: `feat(topics): the re-cut — 75 honest groups`.

## Task 4 — The server: weights in, weights out, one snap

**Files:** modify `src/server/db/topics.ts`, `src/server/api/routers/topics.ts`,
`src/server/services/persona-seed.ts`, `src/server/api/routers/routers.test.ts`,
`src/server/api/routers/routers.integration.test.ts`; create nothing.

**Produces:**

```ts
// db/topics.ts
export interface TopicPick { topicId: string; weight: number }
export async function setUserTopics(userId: string, picks: readonly TopicPick[]): Promise<void>;
export async function getUserTopicPicks(userId: string): Promise<TopicPick[]>;
/** Sets one existing row's weight; false when the reader has no row for it. */
export async function setUserTopicWeight(userId: string, topicId: string, weight: number): Promise<boolean>;
// getUserTopicIds, getUserTopicWeights, hasCompletedOnboarding, bumpTopicWeight, resetUserTopicWeights: unchanged.

// routers/topics.ts
topics.list     // unchanged
topics.mine     // → TopicPick[]
topics.setMine  // input { picks: { topicId: string; weight: number }[] } (min 1), validates ids as today
topics.setWeight // input { topicId: string; level: "little" | "some" | "lot" } → { topicId, weight } | NOT_FOUND
topics.resetWeights // unchanged, dev-only
// topics.weights: deleted
```

- [ ] Test first, `routers.integration.test.ts` ("topics.list + topics.setMine round trip"):
      - Change every `setMine({ topicIds: [...] })` to `setMine({ picks: [{ topicId, weight: 1 }] })`
        (the unknown-id and unfaceted cases keep their assertions).
      - The "set, re-set with overlap" test: first write `topicA` at `2` and `topicB` at `1`; assert
        the rows carry exactly those weights (not "every weight is 1"); the hand-bump to 7 and the
        re-set keeping only `topicA` stay; assert 7 survives.
      - New: "setWeight snaps an existing row and refuses a missing one": after a `setMine` with
        `topicA` at 1, `caller.topics.setWeight({ topicId: topicA, level: "lot" })` resolves to
        `{ topicId: topicA, weight: 2 }` and the row reads 2; set the row to 3 by hand (the nudge's
        cap), `setWeight(..., "lot")` again → the row reads **2** (review focus 2);
        `setWeight({ topicId: topicB, level: "some" })` (no row) rejects with `code: "NOT_FOUND"`.
      - New: "mine returns weights": after that, `caller.topics.mine()` resolves to
        `[{ topicId: topicA, weight: 2 }]`.
- [ ] Test first, `routers.test.ts`: the exhaustive surface list drops `"topics.weights"` and adds
      `"topics.setWeight"` (still twenty-two; fix the comment's history line: "09-28-26 retires
      `topics.weights` — the product reads weights through `topics.mine` now — and adds
      `topics.setWeight`"). The `"topics.setMine rejects an empty topicIds array"` test becomes
      `setMine({ picks: [] })`; the UNAUTHORIZED test for `setMine` sends
      `{ picks: [{ topicId: "some-topic", weight: 1 }] }`; delete the `topics.weights` UNAUTHORIZED
      test and the two `topics.weights` cases in the dev-only describe (keep `resetWeights`'s two;
      rename the describe "topics.resetWeights is dev-only"; drop the
      `mockedGetUserTopicWeights` mock if nothing else uses it). Add
      `"topics.setWeight throws UNAUTHORIZED"`.
- [ ] Run both; fail on the input shape / missing procedure.
- [ ] `db/topics.ts`:
      - `setUserTopics(userId, picks)`: the delete uses `picks.map(p => p.topicId)`; the insert
        values are `picks.map(({ topicId, weight }) => ({ userId, topicId, weight }))`, still
        `onConflictDoNothing`. Update the doc comment: "a fresh row at the pick's weight
        (§2: `some` for a group member, `lot` for a single pick — decided by the client through
        `pickWeight`; this function trusts the number the way it trusts the id)".
      - `getUserTopicPicks`: `select({ topicId, weight }) … where userId`. Its comment replaces
        `getUserTopicIds`'s "a picker cares only about membership" stance: since 09-28-26 the
        product shows levels, so the picker reads weights on purpose; `getUserTopicIds` stays for
        the persona seed and the onboarding gate's neighbours.
      - `setUserTopicWeight`: `update(userTopic).set({ weight }).where(and(userId, topicId))
        .returning({ topicId })`; return `rows.length > 0`.
- [ ] `routers/topics.ts`: rewrite the header (the two pickers read levels now; the retired stance
      and why). `mine` → `getUserTopicPicks`. `setMine` input
      `z.object({ picks: z.array(z.object({ topicId: z.string(), weight: z.number().positive() })).min(1) })`,
      validate `picks.map(p => p.topicId)` against `listTopics()` exactly as today, then
      `setUserTopics(ctx.user.id, input.picks)`. `setWeight`: input
      `z.object({ topicId: z.string(), level: z.enum(["little", "some", "lot"]) })`;
      `const weight = weightOf(input.level)`; `if (!(await setUserTopicWeight(...)))` throw
      `TRPCError({ code: "NOT_FOUND", message: "No pick for topic <id>" })`; return
      `{ topicId, weight }`. Delete `weights`. Import `weightOf` from
      `~/server/config/topic-levels`.
- [ ] `persona-seed.ts` line 65: `setUserTopics(row.id, [...want].map((topicId) => ({ topicId, weight: 1.0 })))`
      and one comment line: personas are seeded flat (§2 does not apply to a fixture).
- [ ] `bun run test` green (the DB-backed suites need `DATABASE_URL`; run them). Commit:
      `feat(topics): setMine takes weights, mine returns them, setWeight snaps one`.

## Task 5 — Settings reads the new `mine`

**Files:** modify `src/components/settings/settings-screen.tsx` (line 101),
`src/components/settings/settings-screen.test.tsx` (the `mine` mock data, ~line 67 and every
`myTopicsData.current = [...]`).

- [ ] Test first: the mock's `myTopicsData.current` becomes `{ topicId, weight }[]` (weight 1
      everywhere); the "What you see" assertions are unchanged.
- [ ] Run; the value row renders "Nothing picked" (the ids no longer match) → fails.
- [ ] `formatTopicValue(topics.data ?? [], (myTopics.data ?? []).map((p) => p.topicId))`. One
      comment line: `topics.mine` carries weights since 09-28-26; this row only needs the ids.
- [ ] Green. Commit: `refactor(settings): read topic ids off the weighted mine`.

## Task 6 — Pure pick logic and `GroupPicker`

**Files:** create `src/components/topics/picks.ts`, `src/components/topics/picks.test.ts`,
`src/components/topics/group-picker.tsx`, `src/components/topics/group-picker.test.tsx`.

**Produces:**

```ts
// picks.ts — pure, no React
export type Picks = ReadonlyMap<string, number>;          // topicId → weight
export function toggleGroup(picks: Picks, members: readonly string[]): Map<string, number>;
export function toggleTopic(picks: Picks, topicId: string): Map<string, number>;
export function groupState(picks: Picks, members: readonly string[]): boolean | "mixed";

// group-picker.tsx
export interface PickerTopic { id: string; label: string; facet: TopicFacet }
export interface GroupPickerProps {
  facet: TopicFacet;
  topics: readonly PickerTopic[];   // topics.list rows, every facet; the picker filters
  picks: Picks;
  onChange: (next: Map<string, number>) => void;
}
export function GroupPicker(props: GroupPickerProps): JSX.Element;
```

- [ ] Test first, `picks.test.ts` (import `weightOf`/`pickWeight` from the leaf, never literals):
      - `toggleGroup` on a group none of whose members are present adds every member at
        `pickWeight(members.length)`: two members → both at `weightOf("some")`; one member → at
        `weightOf("lot")` (review focus 3's sibling).
      - `toggleGroup` on a mixed group adds only the absent members at `pickWeight(n)` and leaves
        the present member's weight (start `moon` at 2.0; after, `moon` is still 2.0 and
        `astronomy` is `some`).
      - `toggleGroup` on a full group removes every member and nothing else.
      - `toggleGroup` on a singleton group whose member is present removes it (review focus 3).
      - `toggleTopic` adds an absent topic at `weightOf("lot")`; removes a present one.
      - `groupState`: none → `false`; all → `true`; some → `"mixed"`; an empty member list →
        `false`.
      - Every function returns a **new** Map and never mutates its input (assert the input's size
        after the call).
- [ ] Run; fail. Write `picks.ts`. Header: §2 "What a list pick writes", and that this is the one
      place the group/member rule lives — both hosts call these, neither decides a weight.
- [ ] Test first, `group-picker.test.tsx` (`@vitest-environment jsdom`, the fixture from
      `onboarding-screen.test.tsx`: astronomy, moon, botany, ceramics, surreal, japan, with the
      Task 3 labels). Render `<GroupPicker facet="subject" topics={FIXTURE} picks={new Map()} onChange={spy} />`:
      - Shows two group chips, `["Space", "Plants"]`, in config order; nothing from other facets.
      - Space (two listed members) has a disclosure button named `"Show 2 topics in Space"` with
        `aria-expanded="false"`; Plants (one member) has **no** disclosure.
      - Clicking the Space chip calls `onChange` with a Map holding astronomy and moon at
        `weightOf("some")`.
      - With `picks = {astronomy: 1}`: the Space chip reads `"Space · 1 of 2"` and
        `aria-pressed="mixed"`; clicking it calls `onChange` with both present (the mixed group
        completes).
      - Clicking the disclosure: `aria-expanded="true"`, the name becomes `"Hide topics in Space"`,
        and a `role="group"` named `"Space topics"` appears with `["Astronomy", "Moon"]` as `sm`
        chips, Astronomy pressed. Clicking Moon calls `onChange` with moon at `weightOf("lot")`
        beside astronomy at 1. Clicking Astronomy calls `onChange` with astronomy absent.
      - Clicking the disclosure again hides the row; the Plants chip is unaffected throughout.
      - The Space chip is not pressed and shows no count when nothing is picked.
- [ ] Run; fail. Write `group-picker.tsx` (`"use client"`):
      - `const groups = groupsFor(facet, topics)`; a `useState<Set<string>>` of open group ids.
      - Per group: a `<div className="flex flex-col gap-[10px]">` holding a
        `<div className="inline-flex items-center gap-[6px]">` with the `Chip`
        (`selected={groupState(picks, members)}`, label with `· n of N` when mixed, exactly as
        `topics-screen.tsx` does today) and, when `members.length > 1`, a small round
        `<button type="button" aria-expanded aria-controls={`group-${group.id}-members`}
        aria-label={open ? `Hide topics in ${label}` : `Show ${n} topics in ${label}`}>` showing
        the count `n` (28 px disc, `border-hairline border-ink/12 text-ink/62 text-[12px]`,
        `bg-accent/10 border-accent` when open). Below it, when open, the member row
        `<div id=… role="group" aria-label={`${label} topics`} className="flex flex-wrap gap-[8px] pl-3">`
        of `Chip size="sm"` per member (`selected={picks.has(id)}`, `onClick={() =>
        onChange(toggleTopic(picks, id))}`).
      - The groups sit in `<div role="group" aria-label={`${FACET_LABELS[facet]} groups`}
        className="flex flex-wrap gap-[10px]">`.
      - Header comment: §3 "GroupPicker"; why the disclosure is a sibling button and not inside
        the chip (a button inside a button is invalid HTML and unreachable by AT); why a
        singleton has none; that disclosure state is local and a reload folds it.
      - Look up a member's label from `topics` (a `Map` built once per render).
- [ ] Green. Commit: `feat(topics): GroupPicker — two-level group chips over pure pick logic`.

## Task 7 — `TopicLevels`

**Files:** create `src/components/topics/topic-levels.tsx`,
`src/components/topics/topic-levels.test.tsx`.

**Produces:**

```ts
export interface TopicLevelsProps {
  topics: readonly PickerTopic[];      // for labels and facets
  picks: Picks;
  /** Topics the interview brought in (plan 2). Marked "suggested". */
  suggested?: ReadonlySet<string>;
  onLevel: (topicId: string, level: Level) => void;
  onOff: (topicId: string) => void;
}
export function TopicLevels(props: TopicLevelsProps): JSX.Element;
```

- [ ] Test first, `topic-levels.test.tsx` (jsdom; the same fixture):
      - With `picks = {astronomy: 1, ceramics: 2, surreal: 0.5}`: three rows, grouped under the
        facet eyebrows in `FACETS` order (`"Subject"`, `"Medium"`, `"Look"`; no `"Place"` eyebrow
        since nothing there is picked). Each row is a `role="group"` named `"<Label> level"`
        holding four `aria-pressed` buttons `["a little", "some", "a lot", "off"]`; Astronomy's
        pressed one is `"some"`, Ceramics's `"a lot"`, Surreal's `"a little"`.
      - Clicking `"a lot"` in the Astronomy group calls `onLevel("astronomy", "lot")` and nothing
        else; clicking `"off"` calls `onOff("astronomy")`; clicking the already-pressed `"some"`
        calls neither (the `Segmented` guard).
      - `suggested = {ceramics}`: the Ceramics row shows the text `"suggested"`; Astronomy's does
        not.
      - Empty `picks`: renders the text `"Nothing picked yet."` and no groups.
      - Rows within a facet are in label order (Astronomy before Moon when both picked).
- [ ] Run; fail. Write it. Use `Segmented` from `~/components/ui/segmented` with
      `options = [...LEVELS.map(l => ({ key: l, label: LEVEL_LABELS[l] })), { key: "off", label: LEVEL_LABELS.off }]`,
      `value = levelOf(weight)`, `onChange = (k) => k === "off" ? onOff(id) : onLevel(id, k)`.
      Row: `<div role="group" aria-label={`${label} level`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">`
      with the label (`text-ink text-[15px]`) and, when suggested, a
      `<span className="text-accent ml-2 font-sans text-[11px] font-semibold tracking-[1.2px] uppercase">suggested</span>`.
      Eyebrow per facet: the same `text-accent … uppercase` class as the onboarding stage
      eyebrow. Header comment: §3 "TopicLevels", the two hosts, why levels and not numbers
      (D4), why off is a segment and not a separate control.
- [ ] Green. Commit: `feat(topics): TopicLevels — the summary rows with a four-way level control`.

## Task 8 — Onboarding: Pick → Start

**Files:** modify `src/components/onboarding/onboarding-screen.tsx`,
`src/components/onboarding/onboarding-screen.test.tsx`, `src/app/onboarding/page.tsx`.

**Consumes:** `GroupPicker`, `TopicLevels`, `toggle*` via the picker, `topics.setMine({ picks })`.

- [ ] Test first — rewrite `onboarding-screen.test.tsx` (keep the mock shape: `setMine` with
      `mutateAsync`; `useRouter().replace`). Props are now `{ topics }` only (no `minPicks`).
      - Stage 1 shows the subject groups `["Space", "Plants"]`, the heading
        `"What are you drawn to?"`, no Back, and a `navigation` named `"Setup progress"` whose
        `aria-current="step"` element is labelled `"Pick"`.
      - Next walks Subject → Medium (`["Ceramics & glass"]`) → Look (`["Surreal & psychedelic"]`)
        → Place (`["Japan"]`) → **Start**: heading `"Here's where we'll start"`, the progress's
        current step labelled `"Start"`, a `"Start exploring"` button, and Back.
      - A stage with no picks can be passed (four Nexts reach Start).
      - Back from Start returns to Place with picks intact; Back from Medium returns to Subject
        with Space still pressed.
      - Start with nothing picked: `"Start exploring"` is disabled, the status reads
        `"Pick at least one topic to start."`, and clicking it anyway never calls `mutateAsync`
        (review focus 5).
      - Picking Space, then on Start: the summary shows Astronomy and Moon rows at `"some"`;
        setting Moon to `"a lot"` then Start → `mutateAsync` called once with
        `{ picks: [{ topicId: "astronomy", weight: 1 }, { topicId: "moon", weight: 2 }] }` (order
        by insertion; assert as a Set of pairs), then `replace("/feed")`.
      - Opening Space's disclosure on stage 1 and picking only Moon → on Start, Moon at `"a lot"`
        and no Astronomy row; the write is `[{ moon, 2 }]`.
      - Turning a topic off on Start removes its row; turning the last one off re-disables Start.
      - The count label reads `"Nothing picked yet"` / `"1 topic chosen"` / `"2 topics chosen"`
        (topics, not groups, since a member is a pick now).
      - A mutation error renders in `data-testid="onboarding-error"` and does not navigate.
      - Centres in the narrow column (`.md\:max-w-\[600px\]` present) — unchanged.
- [ ] Run; fail. Rewrite the screen:
      - State: `picks: Map<string, number>` (was a Set of group ids), `stage: 0..FACETS.length`
        where `stage === FACETS.length` is Start. `const PHASES = [{ key: "pick", label: "Pick" }, { key: "start", label: "Start" }] as const`
        with a comment that plan 2 inserts `Refine` between them; `phase = stage < FACETS.length ? "pick" : "start"`.
      - Pick stages render `<GroupPicker facet={facet} topics={topics} picks={picks} onChange={setPicks} />`
        inside the existing `Rise` + `px-6 pt-[22px] pb-[200px]` wrapper. The stage-0 body copy
        stays; other stages' copy stays.
      - Start renders the eyebrow `Ambit · Setup · Start`, h1 `"Here's where we'll start"`, body
        `"Turn anything off, or say how much of it you want. You can change all of this any time
        from your profile."`, then `<TopicLevels topics={topics} picks={picks}
        onLevel={(id, l) => setPicks(p => new Map(p).set(id, weightOf(l)))}
        onOff={(id) => setPicks(p => { const n = new Map(p); n.delete(id); return n; })} />`.
      - Progress `nav`: one dot per `PHASES` entry, `aria-current="step"` and `aria-label` on the
        current phase (was one per facet).
      - Bar: Back when `stage > 0`; Next when `stage < FACETS.length`; on Start, `"Start
        exploring"` with `disabled={picks.size === 0}`, the `aria-live` line showing
        `"Pick at least one topic to start."` when empty, else the count label.
      - `handleSubmit`: guard `submitting || picks.size === 0`; `mutateAsync({ picks: [...picks].map(([topicId, weight]) => ({ topicId, weight })) })`;
        `router.replace("/feed")`; the same catch.
      - Delete `flatten` and `minPicks`. Rewrite the header comment: the 09-28 design (§3
        "Onboarding phases"), no floor in Pick, floor of one at Start, why nothing is written
        before Start (the gate), and that `Refine` is plan 2's.
- [ ] `page.tsx`: drop `minPicks`; update the comment's "there is no re-pick UI" line (there is:
      `/profile/topics`).
- [ ] Green. `bun run check`. Commit: `feat(onboarding): Pick → Start — two-level groups, no floor,
      levels on the summary`.

## Task 9 — The topics page: summary above the picker, every change saved

**Files:** modify `src/components/profile/topics-screen.tsx`,
`src/components/profile/topics-screen.test.tsx`, `src/app/profile/topics/page.tsx`.

- [ ] Test first — rewrite `topics-screen.test.tsx`. The mock grows: `state.mine` is
      `{ topicId, weight }[]`; `setMine`'s `mutate` takes `{ picks }`; add
      `setWeight: { useMutation: (opts) => ({ mutate: (v) => { opts?.onMutate?.(v); setWeightMock(v) }, isPending: false }) }`;
      drop `weights`. Cases:
      - The intro line reads `"1 on. Changes save as you go."`; below it the summary
        (`TopicLevels`) shows an Astronomy row at `"some"`; then the four facet sections with
        their group chips (`"Space · 1 of 2"`, `"Plants"`, …) under the onboarding questions.
      - Tapping Plants calls `setMine` once with picks `{astronomy: 1, botany: weightOf("lot")}`
        (a singleton group is a single pick) and patches the cache so the Plants chip reads
        pressed and a Botany row appears in the summary.
      - Tapping the mixed Space chip completes it: picks `{astronomy: 1, moon: weightOf("some")}`.
      - With all of Space picked, tapping it removes both; with only astronomy picked and no
        other topic, tapping Space (or Astronomy inside the disclosure, or `"off"` on its row)
        is refused with the status `"Keep at least one topic."` and no mutation.
      - In the summary, clicking `"a lot"` on Astronomy calls `setWeight({ topicId: "astronomy",
        level: "lot" })` and the row's pressed segment becomes `"a lot"` at once (optimistic);
        `setMine` is not called. Clicking `"off"` on Botany (when two are picked) calls `setMine`
        with Botany absent.
      - `onError` on `setWeight` restores the previous level (drive the mock's `onError` and
        assert the pressed segment reverts — review focus 4).
      - Dev: `Reset weights` renders only with `dev`, calls the mutation; the product build
        shows no `· 1.5` suffix anywhere (grep the rendered chips).
      - Renders no title, no back link, no `<main>` — unchanged.
- [ ] Run; fail. Rewrite the screen:
      - `const picks = new Map((mine.data ?? []).map((p) => [p.topicId, p.weight]))`.
      - `setMine` mutation: same `scope`, `onMutate` patches `topics.mine` with `picks`
        (as `{ topicId, weight }[]`), same `onError`/`onSettled`.
      - `setWeight` mutation: the **same** `scope: { id: "topics.setMine" }` (both write
        `user_topic`; serialising them together keeps the last thing the reader did the last thing
        stored); `onMutate` patches the one row's weight to `weightOf(level)` in the `topics.mine`
        cache; `onError` restores the snapshot and sets the hint `"Couldn't save that — try
        again."`; `onSettled` invalidates `topics.mine`.
      - `commit(next: Map<string, number>)`: refuse when `next.size === 0` with the existing hint;
        else `setMine.mutate({ picks: [...next].map(([topicId, weight]) => ({ topicId, weight })) })`.
      - Above the sections: `<TopicLevels topics={all} picks={picks} onLevel={(id, level) => setWeight.mutate({ topicId: id, level })} onOff={(id) => { const n = new Map(picks); n.delete(id); commit(n); }} />`
        inside its own `Rise`, under a `"Your topics"` eyebrow.
      - Each facet section renders `<GroupPicker facet={f} topics={all} picks={picks} onChange={commit} />`
        in place of the group chips + "Show all" block. Delete `expanded`, `toggleExpanded`,
        `toggle`, `toggleGroup`, the `weights` query and `weightOf` map; keep the dev `Reset
        weights` block (its copy still true).
      - Rewrite the header comment: 09-28 (§3), the summary as the top of the page, `GroupPicker`
        shared with onboarding, both mutations serialised under one scope and why, and that the
        product renders levels now (D4) — the old "never renders a weight" line goes.
- [ ] `page.tsx`: delete the `dev`-gated `topics.weights` prefetch and its comment; keep `dev`
      for the Reset button.
- [ ] Green. `bun run check`. Commit: `feat(profile): the topics page — levels above the two-level
      picker, every change saved`.

## Task 10 — Playwright

**Files:** modify `e2e/support.ts` (`completeOnboarding`, a `waitForSetWeight`),
`e2e/settings.spec.ts` (the topics block, lines ~231-283), `e2e/auth.spec.ts` (one assertion).

- [ ] `completeOnboarding(page, labels)`: the loop still presses the labels across the four
      stages; then it clicks Next on **every** stage including the fourth (`for stage in 0..3:
      … await Next`), waits for the heading `"Here's where we'll start"`, asserts at least one
      `role="group"` named `/ level$/` is visible, then `"Start exploring"` → `/feed`. Update the
      comment (the summary phase, no floor, the labels are group labels from Task 3).
- [ ] `waitForSetWeight(page)`: a copy of `waitForSetMine` matching `topics.setWeight` for the
      write and the same `topics.mine` GET afterwards. (Generalise `waitForSetMine` into
      `waitForTopicsWrite(page, "topics.setMine" | "topics.setWeight")` and keep `waitForSetMine`
      as a one-line wrapper, so the existing callers do not change.)
- [ ] `settings.spec.ts`: the `/profile/topics` block:
      - Remove the two `"Show all"` clicks. `"Maps"` is now the **group chip** (its one member is
        cartography on every database) — click `getByRole("button", { name: "Maps", pressed: false, exact: true })`
        inside the Subject region, `waitForSetMine` around it, assert pressed.
      - Ceramics: the group is `"Ceramics & glass"` in the `"In what form?"` region; same
        pattern; after `page.reload()` assert `"Ceramics & glass"` pressed **without** any
        disclosure click.
      - New, before the reload: in the summary, `page.getByRole("group", { name: "Astronomy level" })`
        → click `"a lot"` with `waitForSetWeight` around it; after the reload assert that group's
        `"a lot"` button has `aria-pressed="true"`. (Astronomy is picked on both database shapes:
        `"Space"` is in `ONBOARDING_GROUPS`.)
      - The two "What you see" shape assertions stay as they are.
- [ ] `auth.spec.ts` sign-up test: no change beyond what `completeOnboarding` now asserts; run it.
- [ ] `bun run e2e:prod` green (both projects), then the CI shape once — the onboarding fixtures
      changed and CI's database is the sixteen originals:
      ```sh
      docker run -d --rm --name ambit-ci-pg -e POSTGRES_USER=ambit -e POSTGRES_PASSWORD=ambit \
        -e POSTGRES_DB=ambit -p 5433:5432 postgres:17-alpine
      export DATABASE_URL=postgres://ambit:ambit@localhost:5433/ambit
      bun run db:migrate && bun run db:seed && bun run build && E2E_PROD=1 bunx playwright test --workers 1
      docker stop ambit-ci-pg
      ```
      Clear port 3000 first (`lsof -ti:3000`).
- [ ] Commit: `test(e2e): onboarding's Start phase, group chips by the new names, a level survives
      a reload`.

## Task 11 — Docs, log, gates

- [ ] `SPEC.md` §7: `topics.mine` returns `{ topicId, weight }[]`; `topics.setMine` takes
      `picks`; add `topics.setWeight`; drop `topics.weights`. §3.2's "floor of three" → "no floor
      in Pick, one at Start".
- [ ] `CLAUDE.md`: one bullet under Architecture in the house style — **"Onboarding is Pick →
      Start over 75 honest groups, and the product shows levels — 09-28-26"** — naming the leaf,
      the two shared components, the pick rule, off = removed, and that the interview (plan 2)
      goes between. Replace the 09-25 "Open:" sentence about flat weights in the topic-groups
      bullet with a pointer to §2's decision.
- [ ] `docs/BUILD_PLAN.md` 8.4: a 🔶 line — reshaped 09-28-26 as `DESIGN_onboarding-interview.md`,
      no LLM in v1, plan 1 built on `feat/onboarding-foundation`, plan 2 next.
- [ ] `log.md`: a new 09-28 entry (or extend it if one exists) — **Shipped / Decisions / Open**
      (plan 2; Ben's verdict on the cut's grain) — and the spend line from
      `python3 ~/.claude/scripts/session-spend.py --session <uuid>` (omit if it exits non-zero).
- [ ] Gates: `bun run check`, `bun run test` (with `DATABASE_URL`), `bun run e2e:prod`, the CI
      shape from Task 10. All green before the push.
- [ ] Push the branch. Ben looks on the phone and at 1440 and decides on merge. Not deployed by
      this session.

## Verification, end to end

1. `bun run dev` (clear port 3000 first), sign up with a fresh invite (`bun run invite
   <email>`). Onboarding: four screens of group chips; a chip with a count disc opens its members;
   pick "Space" whole and, inside "Fashion", just "Jewelry". Next through to Start.
2. Start: the Space topics at "some", Jewelry at "a lot". Set "Moon" to "off", "Astronomy" to
   "a lot". "Start exploring" → a feed leaning to space and jewelry.
3. `/profile/topics`: the same rows at the top with the same levels; the group chips below with
   Space reading "· 5 of 6". Set Jewelry to "a little"; reload; it holds. Turn everything off
   but one; the last refuses with the hint.
4. On the real corpus, Ben's eye on the cut: every group reads as one idea; nothing is filed
   "for want of a better home". Anything wrong is a line in `topic-groups.ts`, not a redesign.
5. Reduce Motion on: the stages still rise (collapsed), nothing else animates.
