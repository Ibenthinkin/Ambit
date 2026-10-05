# First Exhibition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the questionnaire's bank v1 with First Exhibition — eighteen picture-led questions in ten steps with a playoff round — and give the reveal an exhibition title, a temperament strip, a travel compass and a stored taste profile, with vocabulary round one (33 topics, two new facets) riding alongside.

**Architecture:** Everything topic-shaped stays pure and client-side in `src/lib/interview/` (a static bank of data; `scoreAnswers` → `picksFrom`; new pure modules for ranking, compass, temperament, title and the taste shape). The screen computes what the reveal shows and `onboarding.complete` stores it, validated, in one transaction — picks, answers and now a `user_taste` row. Hand-added topics live in a second config list seeded at tier `grown`; ingest already reads seed queries off the row.

**Tech Stack:** Next.js App Router, Bun, TypeScript, tRPC, Drizzle over Postgres, Tailwind v4, Vitest (+ jsdom + Testing Library), Playwright, zod.

**Spec:** `docs/DESIGN_first-exhibition.md` (read it first; this plan argues from it). The study it adapts is in `docs/first-exhibition-for-ambit/` until Task 0 moves it.

## Global Constraints

- **Base:** a fresh branch `feat/first-exhibition` off `main` **after** `feat/onboarding-questionnaire` (bank v1) has been merged by Ben. If `src/lib/interview/bank.ts` is not on `main`, stop and say so.
- **Work in `~/Dev/ambit-first-exhibition`** — a worktree already on `main` (set up 10-05-26; `~/Dev/ambit` holds `feat/tile-hover` for another session, and the study folder was moved into this worktree). Do not `git worktree add` another (CLAUDE.md: worktrees are fine when another session holds the checkout).
- `bun run check` (typecheck + lint + prettier + vitest) green after every task; comment generously — Ben is a returning webdev and the repo teaches (memory: repo-as-teaching-tool).
- TDD: write the failing test, run it, implement, run it, commit. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (plus the session line the harness supplies).
- **Never commit picture files.** The repo is public. `faces.json` is ids and captions only.
- **Proposed topic ids stay inert** until round one lists them: `targetsOf` already drops unlisted ids, so the bank, wings and destinations may name them.
- Copy: the reader never sees a topic id, a group, a facet or a wing id. Prompts and labels are Ben's to edit; keep them in the bank, not in components.
- The design's `Option.log` is named **`always`** in code (an option offered whether or not its topics are listed — the reading cards and "Nudity").
- One typeface: Sora (`font-sans`). No serif anywhere.
- The CI-shape database holds the sixteen originals only: `ancient-history architecture astronomy botany cartography ceramics geology machines music mythology poetry portraiture textiles the-ocean typography zoology`. Every question-shaped change must still let `answersToward` reach `astronomy`, `botany`, `music` there (`bank.test.ts`).
- Postgres-touching tests self-skip without `DATABASE_URL`; run them with the local `.env` present.

## Review Focus

1. **A `choice` with `show.top` where fewer than `top` options survive `askable`** (CI's sixteen topics leave the playoff with ~9 live wings, a fixture bank could leave 2) — `rankOptions` must return what exists, never pad, never throw. Pinned in Task 1.
2. **A reading card whose article has no picture** — the card renders as an article text card, the answer still carries the item's `topicIds`, and `taste.opened` still records it. Pinned in Tasks 10 and 12.
3. **A reader who answers the reading cards, then presses Back past them and changes a card** — `taste.opened` and the preselected reading amount must follow the *final* answers, not the first ones. Pinned in Task 13.
4. **`onboarding.complete` with a `taste` whose `opened[].itemId` does not exist in this database** (a stale tab after a corpus prune) — a clean `BAD_REQUEST`, nothing written. Pinned in Task 14.
5. **A hand-added topic with no items and no graph row** picked on the reveal — the feed must compose without error (drift stays put). Pinned in Task 8 by a feed unit test with a weights map holding an id absent from the graph.

---

### Task 0: Branch, and move the study into place

**Files:**
- Move from `docs/first-exhibition-for-ambit/`:
  - `src/server/config/interview-wings.ts` → `src/server/config/interview-wings.ts`
  - `src/server/config/interview-destinations.ts` → `src/server/config/interview-destinations.ts`
  - `src/server/config/temperament.ts` → `src/server/config/temperament.ts`
  - `scripts/first-exhibition-faces.ts` → `scripts/first-exhibition-faces.ts`
  - `docs/first-exhibition/faces.json`, `reading-cards.json`, `vocabulary-proposal.md` → `docs/first-exhibition/`
  - `docs/DESIGN_first-exhibition.md` (the study's) → `docs/first-exhibition/study-design.md`
  - `docs/HANDOFF_first-exhibition.md` → `docs/first-exhibition/study-handoff.md`
- Delete: `docs/first-exhibition-for-ambit/` (what remains: the duplicate root `DESIGN_first-exhibition.md`, `.DS_Store`)
- Modify: `package.json` (one script)

**Interfaces:**
- Produces: `WINGS: readonly Wing[]` (`{ id, label, noun, weight, topics, proposed, faceTopic }`), `DESTINATIONS`, `BALANCED_TWELVE: readonly string[]`, `DESTINATION_MAX = 3`, `Destination` (`{ id, name, where, coord, line, axes: {wild,old,still,far}, topics, temperament }`), `TemperamentWeights`, `TEMPERAMENT_DIMENSIONS`, `TemperamentDimension`, `DIRECT_TEMPERAMENT_FACTOR = 1.5`, `TOPIC_TEMPERAMENT`.

- [ ] **Step 1: Confirm the base**

Run: `git -C ~/Dev/ambit-first-exhibition log --oneline -1 main -- src/lib/interview/bank.ts`
Expected: one commit line (bank v1 is on main). If empty, stop: v1 is not merged.

- [ ] **Step 2: Branch**

```bash
cd ~/Dev/ambit-first-exhibition && git checkout main && git checkout -b feat/first-exhibition
# (no pull: local main is ahead of origin on purpose — v1 is merged here and not pushed)
```

- [ ] **Step 3: Move the package**

```bash
S=docs/first-exhibition-for-ambit
mkdir -p docs/first-exhibition
mv $S/src/server/config/interview-wings.ts src/server/config/
mv $S/src/server/config/interview-destinations.ts src/server/config/
mv $S/src/server/config/temperament.ts src/server/config/
mv $S/scripts/first-exhibition-faces.ts scripts/
mv $S/docs/first-exhibition/*.json $S/docs/first-exhibition/vocabulary-proposal.md docs/first-exhibition/
mv $S/docs/DESIGN_first-exhibition.md docs/first-exhibition/study-design.md
mv $S/docs/HANDOFF_first-exhibition.md docs/first-exhibition/study-handoff.md
rm -rf $S
```

- [ ] **Step 4: Register the script**

In `package.json` scripts, after `"faces:..."` if one exists else after `"promote:topics"`, add:

```json
"faces:first-exhibition": "bun run scripts/first-exhibition-faces.ts",
```

- [ ] **Step 5: Type-check the moved files against the repo**

Run: `bun run typecheck && bunx prettier --check src/server/config/interview-*.ts src/server/config/temperament.ts scripts/first-exhibition-faces.ts`
Expected: clean. If the script fails to type-check, fix its imports to match `scripts/vision-compare.ts` (`import { db } from "~/server/db/client"; import { item } from "~/server/db/schema";`).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(onboarding): bring the First Exhibition study into the repo

Wings, destinations and temperament configs, the faces script, and the study's
data and docs, in their homes. docs/DESIGN_first-exhibition.md is the adapted
design; the study's own spec is kept as history under docs/first-exhibition/.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Engine types, `READ_SCORE`, and `rankOptions` (the playoff's display rule)

**Files:**
- Modify: `src/lib/interview/types.ts`, `src/lib/interview/config.ts`, `src/lib/interview/faces.ts`
- Create: `src/lib/interview/show.ts`, `src/lib/interview/show.test.ts`

**Interfaces:**
- Produces: `Question.show?: { top: number }`; `Option.always?: true`; `Option.card?: { where; line; coord }`; `Option.face.writing?: { kind: WritingKind; nth: 0 | 1 }`; `READ_SCORE = 1.2`; `QuestionFace.src?: string` and `QuestionFace.writing?: { title: string; dek: string; minutes: number; kind: WritingKind; topicIds: string[] }`; `rankOptions(q, scores, listed): Option[]`; `shown(q, scores, listed): Question`.

- [ ] **Step 1: Extend the types**

In `src/lib/interview/types.ts`, add the import and change `Option` and `Question`:

```ts
import type { WritingKind } from "~/server/config/writing";
```

```ts
export interface Option {
  /** Stable within its question; what gets logged. Never "skip" / "either" / "neither". */
  key: string;
  /** What the reader reads. */
  label: string;
  effects: readonly Effect[];
  /** The picture on this answer's card: the best image in `topic`, unless `pick` names one by
   *  hand (services/question-faces.ts). Absent ⇒ a text card.
   *  `writing` makes the card an *article* card instead: the nth-best writing item of that kind
   *  (0 = a short one, 1 = a long one); `topic` is then unused but kept for the type's sake. */
  face?: {
    topic: string;
    pick?: { source: string; sourceId: string };
    writing?: { kind: WritingKind; nth: 0 | 1 };
  };
  /** A typeset card with no picture — the destinations: `where` in small caps, the label large,
   *  one `line`, `coord` at the foot. */
  card?: { where: string; line: string; coord: string };
  /** Offered whether or not any of its topics is listed, and logged like any answer. For an
   *  option whose point is the log (Nudity under "rather not") or whose scoring comes from the
   *  item shown rather than from `effects` (the reading cards). */
  always?: true;
  /** `amount` questions only: the level this answer stores. */
  reading?: ReadingAmount;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Empty for a `text` question. */
  options: readonly Option[];
  /** `multi` only: how many answers may be chosen. Absent ⇒ any number. */
  max?: number;
  /** Show only the `top` options, ranked by how the answers so far have already scored each
   *  option's own targets (show.ts). The playoff: twelve wings in the bank, the reader's four
   *  on screen. Scoring and filtering ignore it — an option's effects never change. */
  show?: { top: number };
}
```

In `src/lib/interview/config.ts`, after `TEXT_SCORE`:

```ts
/** A reading card's item: its topic memberships (and its kind's form topic) share this much.
 *  Opening a real article is a stronger signal than a tapped word, weaker than typing a name. */
export const READ_SCORE = 1.2;
```

In `src/lib/interview/faces.ts`:

```ts
import type { WritingKind } from "~/server/config/writing";

export interface QuestionFace {
  /** The item shown — `/dev/faces` prints it, and it is the `<img>`'s key. */
  itemId: string;
  /** What the `<img src>` is: the proxied 960 px rendition, or a `data:` URL verbatim. Absent
   *  for an article with no picture — the card is then an article text card. */
  src?: string;
  /** An article card's copy and what choosing it scores (services/question-faces.ts). */
  writing?: {
    title: string;
    /** The summary's first line. */
    dek: string;
    minutes: number;
    kind: WritingKind;
    /** The item's topic memberships — put on `Answer.topicIds` when the card is chosen. */
    topicIds: string[];
  };
}
```

Run: `bun run typecheck` — expected: clean (every change is optional).

- [ ] **Step 2: Write the failing test for `rankOptions`**

`src/lib/interview/show.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { rankOptions, shown } from "./show";
import type { Question } from "./types";

const q: Question = {
  id: "playoff",
  kind: "choice",
  prompt: "Which would you look at longer?",
  show: { top: 2 },
  options: [
    { key: "a", label: "A", effects: [{ topics: ["astronomy", "moon"], score: 1 }] },
    { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
    { key: "c", label: "C", effects: [{ topics: ["music", "sound", "dance"], score: 1 }] },
    { key: "d", label: "D", effects: [{ topics: ["unlisted-topic"], score: 1 }] },
  ],
};
const listed = new Set(["astronomy", "moon", "botany", "music", "sound", "dance"]);

describe("rankOptions", () => {
  it("ranks by the MEAN positive score over each option's listed targets, then shows the top N", () => {
    // a: (1 + 0) / 2 = 0.5 · b: 2 / 1 = 2 · c: (3 + 0 + 0) / 3 = 1 → b, c
    const scores = new Map([
      ["astronomy", 1],
      ["botany", 2],
      ["music", 3],
    ]);
    expect(rankOptions(q, scores, listed).map((o) => o.key)).toEqual(["b", "c"]);
  });

  it("ignores negative scores and breaks ties in bank order", () => {
    const scores = new Map([
      ["music", -5],
      ["botany", 0],
    ]);
    expect(rankOptions(q, scores, listed).map((o) => o.key)).toEqual(["a", "b"]);
  });

  it("returns what exists when fewer than `top` options survive — never pads, never throws", () => {
    const one: Question = { ...q, options: q.options.slice(0, 1) };
    expect(rankOptions(one, new Map(), listed).map((o) => o.key)).toEqual(["a"]);
    expect(rankOptions({ ...q, options: [] }, new Map(), listed)).toEqual([]);
  });

  it("an option with no listed target scores 0 and sorts by bank order among the zeros", () => {
    const scores = new Map([["botany", 1]]);
    const ranked = rankOptions({ ...q, show: { top: 4 } }, scores, listed);
    expect(ranked.map((o) => o.key)).toEqual(["b", "a", "c", "d"]);
  });

  it("leaves a question without `show` alone", () => {
    const plain = { ...q, show: undefined };
    expect(shown(plain, new Map([["botany", 9]]), listed)).toBe(plain);
    expect(rankOptions(plain, new Map(), listed).map((o) => o.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("`shown` is the question with only the ranked options", () => {
    const s = shown(q, new Map([["botany", 2]]), listed);
    expect(s.options.map((o) => o.key)).toEqual(["b", "a"]);
    expect(s.id).toBe("playoff");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bunx vitest run src/lib/interview/show.test.ts`
Expected: FAIL — cannot find module `./show`.

- [ ] **Step 4: Implement `show.ts`**

```ts
// The playoff's display rule (docs/DESIGN_first-exhibition.md §2). A question with `show.top`
// is an ordinary `choice` in the bank — all twelve wings, each with its own picture and its own
// effects — and the *screen* shows only the reader's top few, ranked by what the answers so far
// have already scored each option's targets. Nothing else looks at `show`: scoring and filtering
// see the whole question, an option's effects never change, and the logged answer is just a key.
//
// Mean, not sum: a wing with fourteen topics must not outrank one with five because its spread
// score lands on more rows. Negative scores count as zero — a wing the reader scored *down*
// should sort with the untouched ones, not below them, since the question is "which of your
// favourites", and ties keep bank order so the result is stable.
import { optionTargets } from "./targets";
import type { Option, Question } from "./types";

/** The mean positive score over an option's listed targets; 0 when it has none. */
function meanScore(
  option: Option,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): number {
  const targets = optionTargets(option, listed);
  if (targets.length === 0) return 0;
  let sum = 0;
  for (const id of targets) sum += Math.max(0, scores.get(id) ?? 0);
  return sum / targets.length;
}

/** The options to show, best first — all of them for a question without `show`. */
export function rankOptions(
  q: Question,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): Option[] {
  if (!q.show) return [...q.options];
  return q.options
    .map((option, index) => ({ option, index, mean: meanScore(option, scores, listed) }))
    .sort((a, b) => b.mean - a.mean || a.index - b.index)
    .slice(0, q.show.top)
    .map((x) => x.option);
}

/** The question as the screen should render it. Returns the same object when there is nothing
 *  to do, so React sees no change. */
export function shown(
  q: Question,
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): Question {
  if (!q.show) return q;
  return { ...q, options: rankOptions(q, scores, listed) };
}
```

- [ ] **Step 5: Run the test**

Run: `bunx vitest run src/lib/interview/show.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/interview && git commit -m "feat(interview): show.top — the playoff's display rule, plus the v2 option fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Scoring — "None of these" on a choice, reading cards score their item, `KIND_FORM`

**Files:**
- Modify: `src/lib/interview/score.ts`, `src/lib/interview/score.test.ts`, `src/lib/interview/fixtures.ts`, `src/server/config/writing.ts`

**Interfaces:**
- Consumes: `READ_SCORE`, `Option.face.writing`, `Answer.topicIds`.
- Produces: `KIND_FORM: Partial<Record<WritingKind, string>>` in `config/writing.ts`; `scoreAnswers` behaviour below.

- [ ] **Step 1: Add `KIND_FORM`**

At the end of `src/server/config/writing.ts`:

```ts
/**
 * The *form* topic each writing kind scores on the questionnaire (docs/DESIGN_first-exhibition.md
 * §5): opening an essay card says something about the reader's taste for essays as a form, not
 * only about the essay's subject. Form is a facet of its own since First Exhibition; these ids
 * are hand-added topics and are dropped by `targetsOf` until they are listed. `curiosity` has no
 * form of its own yet — an encyclopedia entry is a subject with no genre — so it is unmapped.
 * Ben edits this freely.
 */
export const KIND_FORM: Partial<Record<WritingKind, string>> = {
  essay: "essays",
  criticism: "criticism",
  archive: "letters-and-diaries",
};
```

- [ ] **Step 2: Extend the fixture bank**

In `src/lib/interview/fixtures.ts`, add two questions to `TEST_BANK` after `unsettle` and extend `WIDE`:

```ts
  {
    id: "rooms",
    kind: "choice",
    prompt: "Which would you look at longer?",
    options: [
      {
        key: "space",
        label: "Space",
        face: { topic: "astronomy" },
        effects: [
          { topics: ["astronomy", "moon"], score: 1 },
          { topics: ["astronomy"], score: 0.5 },
        ],
      },
      {
        key: "garden",
        label: "A garden",
        face: { topic: "botany" },
        effects: [
          { topics: ["botany", "plants"], score: 1 },
          { topics: ["botany"], score: 0.5 },
        ],
      },
    ],
  },
  {
    id: "rather-not",
    kind: "multi",
    prompt: "Anything you'd rather not see?",
    options: [
      {
        key: "horror",
        label: "Horror",
        effects: [{ topics: ["horror", "eerie"], score: -2 }],
      },
      // No topic marks nudity: offered and logged on `always`, scoring nothing.
      { key: "nudity", label: "Nudity", always: true, effects: [] },
    ],
  },
  {
    id: "read",
    kind: "choice",
    prompt: "Which would you open?",
    options: [
      {
        key: "essay",
        label: "Essay",
        always: true,
        face: { topic: "literature", writing: { kind: "essay", nth: 0 } },
        effects: [],
      },
      {
        key: "curiosity",
        label: "Curiosity",
        always: true,
        face: { topic: "literature", writing: { kind: "curiosity", nth: 0 } },
        effects: [],
      },
    ],
  },
```

Add `"essays"` to `WIDE` (so the form topic is listed in the wide shape and not in `NARROW`).

- [ ] **Step 3: Write the failing tests**

Append to `src/lib/interview/score.test.ts` inside `describe("scoreAnswers")`:

```ts
  it("None of these on a choice takes each option's FIRST effect down at -0.5 — not the face bonus", () => {
    const s = score([{ questionId: "rooms", keys: [NEITHER] }]);
    // First effects only: {astronomy, moon} and {botany, plants}, each -0.5 shared by √2.
    expect(s.get("astronomy")).toBeCloseTo(-0.5 / Math.sqrt(2));
    expect(s.get("moon")).toBeCloseTo(-0.5 / Math.sqrt(2));
    expect(s.get("botany")).toBeCloseTo(-0.5 / Math.sqrt(2));
    // The face bonus (second effect) is untouched: astronomy is not -0.5/√2 - 0.25.
    expect(s.get("astronomy")).not.toBeCloseTo(-0.5 / Math.sqrt(2) - 0.25);
  });

  it("an `always` option with no effects adds nothing when chosen", () => {
    expect(score([{ questionId: "rather-not", keys: ["nudity"] }]).size).toBe(0);
  });

  it("a reading card scores the item's memberships at READ_SCORE, plus its kind's form topic", () => {
    const s = score([
      { questionId: "read", keys: ["essay"], topicIds: ["astronomy", "music"] },
    ]);
    expect(s.get("astronomy")).toBeCloseTo(READ_SCORE / Math.sqrt(2));
    expect(s.get("music")).toBeCloseTo(READ_SCORE / Math.sqrt(2));
    // KIND_FORM.essay = "essays", listed in WIDE: its own effect, whole.
    expect(s.get("essays")).toBeCloseTo(READ_SCORE);
  });

  it("a reading card for a kind with no form, or on a database without the form topic, scores memberships only", () => {
    const curiosity = score([
      { questionId: "read", keys: ["curiosity"], topicIds: ["astronomy"] },
    ]);
    expect(curiosity.get("astronomy")).toBeCloseTo(READ_SCORE);
    expect(curiosity.size).toBe(1);
    const narrow = score(
      [{ questionId: "read", keys: ["essay"], topicIds: ["astronomy"] }],
      NARROW,
    );
    expect(narrow.has("essays")).toBe(false);
    expect(narrow.get("astronomy")).toBeCloseTo(READ_SCORE);
  });
```

Add `READ_SCORE` to the `./config` import at the top of the test.

- [ ] **Step 4: Run to see them fail**

Run: `bunx vitest run src/lib/interview/score.test.ts`
Expected: FAIL on the four new tests (NEITHER on a choice currently applies to *every* effect; reading adds nothing).

- [ ] **Step 5: Implement**

Replace the body of the `for (const a of answers)` loop in `src/lib/interview/score.ts`:

```ts
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || a.keys[0] === SKIP) continue;
    if (q.kind === "text") {
      apply(scores, { topics: a.topicIds ?? [], score: TEXT_SCORE }, 1, listed);
      continue;
    }

    // "None of these" on a choice (the wing screens, the playoff): each option's FIRST effect
    // goes down — the wing's subject spread, not its face bonus. On a pair, Neither still takes
    // every effect of both sides down, as v1 did.
    if (a.keys[0] === NEITHER && q.kind === "choice") {
      for (const o of q.options) {
        const first = o.effects[0];
        if (first) apply(scores, first, NEITHER_FACTOR, listed);
      }
      continue;
    }

    const whole =
      a.keys[0] === EITHER
        ? EITHER_FACTOR
        : a.keys[0] === NEITHER
          ? NEITHER_FACTOR
          : null;
    for (const o of q.options) {
      const factor = whole ?? (a.keys.includes(o.key) ? 1 : null);
      if (factor === null) continue;
      for (const e of o.effects) apply(scores, e, factor, listed);

      // A reading card scores the *item* it showed, not a fixed effect: the screen put the
      // item's topic memberships on `topicIds` when the card was chosen. Its kind's form topic
      // (config/writing.ts KIND_FORM) is a second, whole effect — dropped by targetsOf until the
      // Form facet's topics are listed.
      if (o.face?.writing && a.keys.includes(o.key)) {
        apply(scores, { topics: a.topicIds ?? [], score: READ_SCORE }, 1, listed);
        const form = KIND_FORM[o.face.writing.kind];
        if (form) apply(scores, { topics: [form], score: READ_SCORE }, 1, listed);
      }
    }
  }
```

Add to the imports: `READ_SCORE` from `./config` and `import { KIND_FORM } from "~/server/config/writing";`.

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run src/lib/interview`
Expected: PASS (all interview tests; the v1 pair Neither test still passes because pairs are untouched).

- [ ] **Step 7: Commit**

```bash
git add src/lib/interview src/server/config/writing.ts && git commit -m "feat(interview): None of these on a choice; reading cards score their item and its form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `askable` keeps `always` options; `answersToward` applies `show.top`

**Files:**
- Modify: `src/lib/interview/askable.ts`, `src/lib/interview/askable.test.ts`, `src/lib/interview/path.ts`, `src/lib/interview/path.test.ts`

**Interfaces:**
- Consumes: `Option.always`, `shown` (Task 1), `scoreAnswers`.
- Produces: unchanged signatures.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/interview/askable.test.ts` (it imports `askable`, `TEST_BANK`, `NARROW`, `WIDE` already; add what is missing):

```ts
  it("keeps an `always` option whether or not its topics are listed", () => {
    const ratherNot = askable(TEST_BANK, new Set(["horror"])).find((q) => q.id === "rather-not")!;
    // horror is listed; nudity has no topics and survives on `always` — two live answers, so asked.
    expect(ratherNot.options.map((o) => o.key)).toEqual(["horror", "nudity"]);
    // With nothing listed, a multi left with only its `always` option is still skipped (one answer is no choice).
    expect(askable(TEST_BANK, new Set()).find((q) => q.id === "rather-not")).toBeUndefined();
    const read = askable(TEST_BANK, new Set()).find((q) => q.id === "read");
    // Both reading cards are `always`, so the question is asked on an empty database.
    expect(read?.options.map((o) => o.key)).toEqual(["essay", "curiosity"]);
  });
```

Append to `src/lib/interview/path.test.ts`:

```ts
  it("applies show.top with the scores of the answers it has produced so far", () => {
    const bank: Question[] = [
      {
        id: "first",
        kind: "choice",
        prompt: "?",
        options: [
          { key: "a", label: "A", effects: [{ topics: ["astronomy"], score: 1 }] },
          { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
        ],
      },
      {
        id: "playoff",
        kind: "choice",
        prompt: "?",
        show: { top: 1 },
        options: [
          { key: "b", label: "B", effects: [{ topics: ["botany"], score: 1 }] },
          { key: "a", label: "A", effects: [{ topics: ["astronomy"], score: 1 }] },
        ],
      },
    ];
    const listed = new Set(["astronomy", "botany"]);
    // Wanting astronomy: "first" → a; then only the top ONE option is on screen, and because
    // astronomy already scored, that is "a" — so the playoff is answered, not skipped.
    expect(answersToward(bank, listed, ["astronomy"])).toEqual([
      { questionId: "first", keys: ["a"] },
      { questionId: "playoff", keys: ["a"] },
    ]);
    // Wanting botany: the playoff shows "b" (bank order wins the tie after "first" → b scores it).
    expect(answersToward(bank, listed, ["botany"])[1]).toEqual({
      questionId: "playoff",
      keys: ["b"],
    });
  });

  it("skips an `always` option that adds nothing wanted", () => {
    const answers = answersToward(TEST_BANK, WIDE, ["food"]);
    expect(answers.find((a) => a.questionId === "read")).toEqual({
      questionId: "read",
      keys: [SKIP],
    });
  });
```

Add imports as needed: `import type { Question } from "./types"; import { SKIP } from "./config"; import { TEST_BANK, WIDE } from "./fixtures";`.

- [ ] **Step 2: Run to see them fail**

Run: `bunx vitest run src/lib/interview/askable.test.ts src/lib/interview/path.test.ts`
Expected: FAIL — `nudity` dropped, `read` not asked on an empty set; the playoff test fails because `answersToward` maps questions independently and `show` is ignored.

- [ ] **Step 3: Implement `askable`**

In `src/lib/interview/askable.ts` replace the `live` line:

```ts
    // An `always` option is offered regardless — its point is the log, or its scoring comes from
    // the item it shows rather than from effects (the reading cards). Everything else must have
    // somewhere to land.
    const live = q.options.filter(
      (o) => o.always || optionTargets(o, listed).length > 0,
    );
```

Update the header comment's bullet list: "an answer none of whose topics are listed is hidden — unless it is `always`".

- [ ] **Step 4: Implement the sequential path**

Replace `answersToward`'s body in `src/lib/interview/path.ts`:

```ts
export function answersToward(
  bank: readonly Question[],
  listed: ReadonlySet<string>,
  wanted: readonly string[],
): Answer[] {
  const want = new Set(wanted);
  const skip = (q: Question): Answer => ({ questionId: q.id, keys: [SKIP] });
  const out: Answer[] = [];

  // Sequential, not a map: a `show.top` question's options depend on the answers before it,
  // exactly as the screen computes them (show.ts over the scores so far).
  for (const asked of askable(bank, listed)) {
    const q = shown(asked, scoreAnswers(bank, out, listed), listed);

    // Free text is the model's business and the reading amount isn't a topic: both skipped.
    if (q.kind === "text" || q.kind === "amount") {
      out.push(skip(q));
      continue;
    }

    // The answers that would *add* something wanted, in the order they're shown.
    const hits = q.options
      .filter((o) => optionAdds(o, listed).some((t) => want.has(t)))
      .map((o) => o.key);
    if (hits.length === 0) {
      out.push(skip(q));
      continue;
    }

    if (q.kind === "pair")
      out.push({ questionId: q.id, keys: hits.length > 1 ? [EITHER] : hits });
    else if (q.kind === "choice") out.push({ questionId: q.id, keys: [hits[0]!] });
    else out.push({ questionId: q.id, keys: hits.slice(0, q.max ?? hits.length) });
  }
  return out;
}
```

Add imports: `import { scoreAnswers } from "./score"; import { shown } from "./show";`.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run src/lib/interview`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/interview && git commit -m "feat(interview): always-offered options; the e2e path mirror applies show.top in sequence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `defaultReadingAmount` — the amount question's preselected default

**Files:**
- Modify: `src/lib/interview/picks.ts`, `src/lib/interview/picks.test.ts`

**Interfaces:**
- Produces: `defaultReadingAmount(opened: readonly { minutes: number }[], skipped: number): ReadingAmount | null`. `readingAmountFrom` is unchanged (the screen preselects the default *as the answer*, so the stored amount still comes from the amount question).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/interview/picks.test.ts`:

```ts
describe("defaultReadingAmount", () => {
  it("is null when no reading question was asked at all", () => {
    expect(defaultReadingAmount([], 0)).toBeNull();
  });
  it("pictures every time → none", () => {
    expect(defaultReadingAmount([], 2)).toBe("none");
  });
  it("one card opened → a little", () => {
    expect(defaultReadingAmount([{ minutes: 5 }], 1)).toBe("little");
  });
  it("two opened → some, or a lot when both ran 12 minutes or more", () => {
    expect(defaultReadingAmount([{ minutes: 5 }, { minutes: 14 }], 0)).toBe("some");
    expect(defaultReadingAmount([{ minutes: 12 }, { minutes: 20 }], 0)).toBe("lot");
  });
});
```

Add `defaultReadingAmount` to the `./picks` import.

- [ ] **Step 2: Run to see it fail**

Run: `bunx vitest run src/lib/interview/picks.test.ts` — expected: FAIL, not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/interview/picks.ts`:

```ts
/** A long read, for the reading default and the reveal's "You like a long read". */
export const LONG_READ_MINUTES = 12;

/**
 * What the `amount` question opens on when the reader has already said something about reading
 * by opening (or declining) the article cards (docs/DESIGN_first-exhibition.md §2): both
 * declined → none; one opened → a little; two → some, or a lot when both were long reads. Null
 * when no reading question was reached, so the question opens blank as it did in v1. The screen
 * preselects this as the amount question's draft; the reader can change it, and what is stored
 * is still the amount question's answer.
 */
export function defaultReadingAmount(
  opened: readonly { minutes: number }[],
  skipped: number,
): ReadingAmount | null {
  if (opened.length + skipped === 0) return null;
  if (opened.length === 0) return "none";
  if (opened.length === 1) return "little";
  return opened.every((o) => o.minutes >= LONG_READ_MINUTES) ? "lot" : "some";
}
```

- [ ] **Step 4: Run, then commit**

Run: `bunx vitest run src/lib/interview/picks.test.ts` — expected: PASS.

```bash
git add src/lib/interview/picks.ts src/lib/interview/picks.test.ts && git commit -m "feat(interview): the reading amount's default from the article cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `compass.ts` and `temperament.ts` (pure)

**Files:**
- Create: `src/lib/interview/compass.ts`, `compass.test.ts`, `src/lib/interview/temperament.ts`, `temperament.test.ts`

**Interfaces:**
- Consumes: `Destination.axes` shape (`{ wild, old, still, far }`), `TemperamentWeights`, `TEMPERAMENT_DIMENSIONS`, `TOPIC_TEMPERAMENT`, `DIRECT_TEMPERAMENT_FACTOR` (Task 0).
- Produces: `Axes`, `compassFrom(chosen: readonly Axes[]): Axes | null`, `compassSentence(axes: Axes, threshold = COMPASS_THRESHOLD): string`, `COMPASS_THRESHOLD = 0.15`; `Temperament = Record<TemperamentDimension, number>`, `temperamentFrom(scores, direct, table = TOPIC_TEMPERAMENT): Temperament`.

- [ ] **Step 1: Failing tests**

`src/lib/interview/compass.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { compassFrom, compassSentence } from "./compass";

describe("compassFrom", () => {
  it("is null with nothing chosen", () => {
    expect(compassFrom([])).toBeNull();
  });
  it("averages each axis", () => {
    expect(
      compassFrom([
        { wild: 1, old: 0.5, still: 0, far: -1 },
        { wild: 0, old: 0.5, still: 1, far: 0 },
      ]),
    ).toEqual({ wild: 0.5, old: 0.5, still: 0.5, far: -0.5 });
  });
});

describe("compassSentence", () => {
  it("names only the axes past the threshold, in order, joined with commas and 'and'", () => {
    expect(
      compassSentence({ wild: 0.6, old: 0.5, still: 0.4, far: 0.3 }),
    ).toBe(
      "You’d travel for wild places over cities, the old over the new, quiet over crowds and a long way from home.",
    );
    expect(compassSentence({ wild: -0.5, old: 0.1, still: -0.2, far: 0 })).toBe(
      "You’d travel for cities over wild places and crowds over quiet.",
    );
  });
  it("is empty when every axis is within the threshold", () => {
    expect(compassSentence({ wild: 0.1, old: -0.1, still: 0, far: 0.15 })).toBe("");
  });
  it("one axis reads as a plain sentence", () => {
    expect(compassSentence({ wild: 0, old: 0, still: 0, far: 0.9 })).toBe(
      "You’d travel for a long way from home.",
    );
  });
});
```

`src/lib/interview/temperament.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DIRECT_TEMPERAMENT_FACTOR } from "~/server/config/temperament";

import { temperamentFrom } from "./temperament";

const table = {
  astronomy: { cerebral: 1, thrilling: 0.5 },
  horror: { dark: 1 },
};

describe("temperamentFrom", () => {
  it("sums positive topic scores times the table's weights, then scales the largest to 1", () => {
    const t = temperamentFrom(
      new Map([
        ["astronomy", 2],
        ["horror", 1],
      ]),
      [],
      table,
    );
    // cerebral 2 · thrilling 1 · dark 1 → /2
    expect(t.cerebral).toBe(1);
    expect(t.thrilling).toBe(0.5);
    expect(t.dark).toBe(0.5);
    expect(t.communal).toBe(0);
    expect(t.aesthetic).toBe(0);
  });
  it("ignores negative scores and topics the table lacks", () => {
    const t = temperamentFrom(new Map([["horror", -3], ["unknown", 5]]), [], table);
    expect(Object.values(t).every((v) => v === 0)).toBe(true);
  });
  it("adds direct weights at DIRECT_TEMPERAMENT_FACTOR", () => {
    const t = temperamentFrom(new Map([["astronomy", 1]]), [{ communal: 1 }], table);
    // cerebral 1, thrilling 0.5, communal 1.5 → communal is the largest
    expect(t.communal).toBe(1);
    expect(t.cerebral).toBeCloseTo(1 / DIRECT_TEMPERAMENT_FACTOR);
  });
  it("is all zeros, not NaN, when nothing scored", () => {
    const t = temperamentFrom(new Map(), [], table);
    expect(Object.values(t)).toEqual([0, 0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bunx vitest run src/lib/interview/compass.test.ts src/lib/interview/temperament.test.ts` — expected: FAIL, modules missing.

- [ ] **Step 3: Implement `compass.ts`**

```ts
// The travel compass (docs/DESIGN_first-exhibition.md §4): "Where would you go next?" is not a
// place question — it reads *taste* off the places. Each destination carries four bipolar axes,
// wild (+) / built (−), old (+) / new (−), still (+) / lively (−), far (+) / near (−), each
// −1…1 (config/interview-destinations.ts), and the reveal shows their average as four bars and
// one sentence. Pure; nothing here is stored except as part of the taste (taste.ts).

export interface Axes {
  wild: number;
  old: number;
  still: number;
  far: number;
}

/** An axis closer to the centre than this says nothing worth a clause. */
export const COMPASS_THRESHOLD = 0.15;

/** The mean of the chosen destinations' axes; null when none was chosen ("Nowhere in particular"). */
export function compassFrom(chosen: readonly Axes[]): Axes | null {
  if (chosen.length === 0) return null;
  const sum = { wild: 0, old: 0, still: 0, far: 0 };
  for (const a of chosen) {
    sum.wild += a.wild;
    sum.old += a.old;
    sum.still += a.still;
    sum.far += a.far;
  }
  const n = chosen.length;
  return { wild: sum.wild / n, old: sum.old / n, still: sum.still / n, far: sum.far / n };
}

/** Each axis's clause for its positive and negative pole, in the order the sentence reads them. */
const CLAUSES: readonly [keyof Axes, string, string][] = [
  ["wild", "wild places over cities", "cities over wild places"],
  ["old", "the old over the new", "the new over the old"],
  ["still", "quiet over crowds", "crowds over quiet"],
  ["far", "a long way from home", "somewhere close to home"],
];

/** "You’d travel for wild places over cities, the old over the new and a long way from home." —
 *  only the axes past `threshold`; empty when none is. */
export function compassSentence(
  axes: Axes,
  threshold: number = COMPASS_THRESHOLD,
): string {
  const parts = CLAUSES.flatMap(([key, plus, minus]) => {
    const v = axes[key];
    if (Math.abs(v) <= threshold) return [];
    return [v > 0 ? plus : minus];
  });
  if (parts.length === 0) return "";
  const list =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `You’d travel for ${list}.`;
}
```

- [ ] **Step 4: Implement `temperament.ts`**

```ts
// The temperament strip (docs/DESIGN_first-exhibition.md §6): Rentfrow, Goldberg & Zilca's five
// entertainment dimensions — Communal, Aesthetic, Dark, Thrilling, Cerebral — read off the topic
// scores through a per-topic weight table (config/temperament.ts, a design proposal, not the
// paper's numbers), plus the destinations' and reading cards' own direct weights. Normalised so
// the strongest dimension is 1 and the strip reads 0…1. Pure.
import {
  DIRECT_TEMPERAMENT_FACTOR,
  TEMPERAMENT_DIMENSIONS,
  TOPIC_TEMPERAMENT,
  type TemperamentDimension,
} from "~/server/config/temperament";
import type { TemperamentWeights } from "~/server/config/interview-destinations";

export type Temperament = Record<TemperamentDimension, number>;

function zeros(): Temperament {
  const t = {} as Temperament;
  for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] = 0;
  return t;
}

/**
 *   dims[d] = Σ_topic max(0, score[topic]) × table[topic][d]
 *           + DIRECT_TEMPERAMENT_FACTOR × Σ direct[d]
 *   then every dim / the largest (all zeros stay zeros).
 */
export function temperamentFrom(
  scores: ReadonlyMap<string, number>,
  direct: readonly TemperamentWeights[],
  table: Readonly<Record<string, TemperamentWeights>> = TOPIC_TEMPERAMENT,
): Temperament {
  const t = zeros();
  for (const [topic, score] of scores) {
    if (score <= 0) continue;
    const w = table[topic];
    if (!w) continue;
    for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] += score * (w[d.id] ?? 0);
  }
  for (const w of direct)
    for (const d of TEMPERAMENT_DIMENSIONS)
      t[d.id] += DIRECT_TEMPERAMENT_FACTOR * (w[d.id] ?? 0);
  const max = Math.max(...TEMPERAMENT_DIMENSIONS.map((d) => t[d.id]));
  if (max > 0) for (const d of TEMPERAMENT_DIMENSIONS) t[d.id] /= max;
  return t;
}
```

- [ ] **Step 5: Run, then commit**

Run: `bunx vitest run src/lib/interview` — expected: PASS.

```bash
git add src/lib/interview && git commit -m "feat(interview): travel compass and temperament, pure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `exhibition.ts` (title, wings, mediums) and `taste.ts` (the stored shape)

**Files:**
- Create: `src/lib/interview/exhibition.ts`, `exhibition.test.ts`, `src/lib/interview/taste.ts`, `taste.test.ts`

**Interfaces:**
- Consumes: `WINGS`, `facetOf` (`~/server/config/topic-facets`), `Axes`, `compassFrom`, `temperamentFrom`, `DESTINATIONS`, `WRITING_KINDS`.
- Produces: `wingRanking(scores, listed): { id: string; score: number }[]`; `topByFacet(scores, listed, facet, n): string[]`; `exhibitionTitle(scores, listed): { adjective: string; noun: string }`; `LOOK_ADJECTIVES`, `MEDIUM_ADJECTIVES`, `TITLE_LOOK_FLOOR = 0.6`; `TasteV1`, `tasteSchema`, `OpenedCard = { itemId; title; kind; minutes }`, `buildTaste({ scores, listed, destinations, opened }): TasteV1`, `chosenDestinations(answers, questionId = "destinations"): Destination[]`.

- [ ] **Step 1: Failing tests**

`src/lib/interview/exhibition.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { exhibitionTitle, topByFacet, wingRanking } from "./exhibition";

const listed = new Set([
  "astronomy", "moon", "botany", "plants", "music", "minimal", "eerie",
  "photography", "engraving", "painting",
]);

describe("wingRanking", () => {
  it("ranks wings by the mean positive score over their listed topics, best first", () => {
    const r = wingRanking(new Map([["astronomy", 2], ["botany", 1]]), listed);
    expect(r[0]!.id).toBe("space");
    expect(r[1]!.id).toBe("growing");
    expect(r.find((w) => w.id === "stage")!.score).toBe(0);
  });
});

describe("topByFacet", () => {
  it("lists the top n listed topics of one facet, positive scores only", () => {
    const scores = new Map([["photography", 2], ["engraving", 1], ["painting", -1], ["astronomy", 9]]);
    expect(topByFacet(scores, listed, "medium", 2)).toEqual(["photography", "engraving"]);
  });
});

describe("exhibitionTitle", () => {
  it("takes the adjective from the top look over the floor and the noun from the top wing", () => {
    expect(exhibitionTitle(new Map([["minimal", 0.7], ["astronomy", 1]]), listed)).toEqual({
      adjective: "Quiet",
      noun: "Orbits",
    });
  });
  it("falls back to the top medium when no look clears the floor", () => {
    expect(exhibitionTitle(new Map([["minimal", 0.5], ["engraving", 1], ["botany", 2]]), listed)).toEqual({
      adjective: "Engraved",
      noun: "Gardens",
    });
  });
  it("is 'First Exhibition' with nothing scored, so a reader always has a title", () => {
    expect(exhibitionTitle(new Map(), listed)).toEqual({ adjective: "First", noun: "Exhibition" });
  });
  it("a look or medium with no adjective in the table does not block the fallbacks", () => {
    // `eerie` → Nocturnal is in the table; `painting` is too. Use an unlisted-table topic:
    const s = new Map([["pattern", 2], ["music", 1]]);
    expect(exhibitionTitle(s, new Set([...listed, "pattern"]))).toEqual({
      adjective: "First",
      noun: "Performances",
    });
  });
});
```

`src/lib/interview/taste.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildTaste, chosenDestinations, tasteSchema } from "./taste";

const listed = new Set(["astronomy", "moon", "botany", "minimal", "photography"]);

describe("buildTaste", () => {
  it("assembles the stored shape from the scores, destinations and opened cards", () => {
    const taste = buildTaste({
      scores: new Map([["astronomy", 2], ["minimal", 1], ["photography", 0.5]]),
      listed,
      destinations: chosenDestinations([{ questionId: "destinations", keys: ["kyoto", "iceland"] }]),
      opened: [
        { itemId: "i1", title: "On rain", kind: "essay", minutes: 14 },
        { itemId: "i2", title: "A tide table", kind: "archive", minutes: 4 },
      ],
    });
    expect(taste.v).toBe(1);
    expect(taste.title).toEqual({ adjective: "Quiet", noun: "Orbits" });
    expect(taste.wings[0]).toBe("space");
    expect(taste.mediums).toEqual(["photography"]);
    expect(taste.compass).not.toBeNull();
    expect(taste.compass!.old).toBeCloseTo((0.8 + 0.1) / 2);
    expect(taste.temperament.cerebral).toBe(1); // astronomy's weight is the strongest
    expect(taste.opened).toHaveLength(2);
    expect(taste.readingMinutes).toBe(9);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
  it("has a null compass and null reading minutes when nothing was chosen or opened", () => {
    const taste = buildTaste({ scores: new Map(), listed, destinations: [], opened: [] });
    expect(taste.compass).toBeNull();
    expect(taste.readingMinutes).toBeNull();
    expect(taste.opened).toEqual([]);
    expect(tasteSchema.safeParse(taste).success).toBe(true);
  });
});

describe("chosenDestinations", () => {
  it("reads the destinations answer's keys, ignoring unknown keys and a skip", () => {
    expect(chosenDestinations([{ questionId: "destinations", keys: ["kyoto", "nowhere"] }]).map((d) => d.id)).toEqual(["kyoto"]);
    expect(chosenDestinations([{ questionId: "destinations", keys: ["skip"] }])).toEqual([]);
    expect(chosenDestinations([])).toEqual([]);
  });
});

describe("tasteSchema", () => {
  it("rejects an unknown wing, a temperament value over 1 and more than two opened cards", () => {
    const ok = buildTaste({ scores: new Map(), listed, destinations: [], opened: [] });
    expect(tasteSchema.safeParse({ ...ok, wings: ["not-a-wing"] }).success).toBe(false);
    expect(tasteSchema.safeParse({ ...ok, temperament: { ...ok.temperament, dark: 1.5 } }).success).toBe(false);
    const card = { itemId: "x", title: "t", kind: "essay", minutes: 3 };
    expect(tasteSchema.safeParse({ ...ok, opened: [card, card, card] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bunx vitest run src/lib/interview/exhibition.test.ts src/lib/interview/taste.test.ts` — expected: FAIL, modules missing.

- [ ] **Step 3: Implement `exhibition.ts`**

```ts
// The exhibition title and subtitle (docs/DESIGN_first-exhibition.md §6): the reveal names the
// reader's first show — "Quiet Weathers" — from an adjective (the top *look* topic over a floor,
// else the top *medium*) and a noun (the top wing's). Wings are config/interview-wings.ts; a
// wing's score is the mean positive score over its listed topics, the same arithmetic as the
// playoff's ranking (show.ts), so the title agrees with the screen the reader just saw. Pure.
import { WINGS } from "~/server/config/interview-wings";
import { facetOf } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";

/** A look must score at least this to name the show; below it the medium speaks. */
export const TITLE_LOOK_FLOOR = 0.6;

/** Look topic → adjective. Ben edits freely; a look not here simply yields to the medium. */
export const LOOK_ADJECTIVES: Readonly<Record<string, string>> = {
  minimal: "Quiet",
  eerie: "Nocturnal",
  melancholy: "Nocturnal",
  neon: "Electric",
  color: "Chromatic",
  "black-and-white": "Monochrome",
  surreal: "Dreaming",
  psychedelic: "Dreaming",
  whimsical: "Whimsical",
  painterly: "Painted",
  "aerial-view": "Aerial",
  brutalist: "Concrete",
  retrofuturism: "Atomic",
  "art-deco": "Streamlined",
  "mid-century-modern": "Streamlined",
  cozy: "Hearthside",
  ornate: "Gilded",
  gothic: "Gothic",
};

/** Medium topic → adjective, the fallback. */
export const MEDIUM_ADJECTIVES: Readonly<Record<string, string>> = {
  photography: "Exposed",
  engraving: "Engraved",
  "scientific-illustration": "Measured",
  ceramics: "Glazed",
  textiles: "Woven",
  collage: "Assembled",
  painting: "Painted",
  drawing: "Drawn",
  illustration: "Illustrated",
};

function meanPositive(
  ids: readonly string[],
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): number {
  const live = ids.filter((id) => listed.has(id));
  if (live.length === 0) return 0;
  let sum = 0;
  for (const id of live) sum += Math.max(0, scores.get(id) ?? 0);
  return sum / live.length;
}

/** Every wing with its score, best first; ties keep config order. */
export function wingRanking(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): { id: string; score: number }[] {
  return WINGS.map((w, index) => ({
    id: w.id,
    index,
    score: meanPositive(w.topics, scores, listed),
  }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ id, score }) => ({ id, score }));
}

/** The top `n` listed topics of one facet with a positive score, best first (first-touched order
 *  breaks ties, as picks.ts does). */
export function topByFacet(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
  facet: TopicFacet,
  n: number,
): string[] {
  return [...scores.entries()]
    .filter(([id, s]) => s > 0 && listed.has(id) && facetOf(id) === facet)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

export function exhibitionTitle(
  scores: ReadonlyMap<string, number>,
  listed: ReadonlySet<string>,
): { adjective: string; noun: string } {
  let adjective: string | undefined;
  const look = topByFacet(scores, listed, "look", 1)[0];
  if (look && (scores.get(look) ?? 0) > TITLE_LOOK_FLOOR) adjective = LOOK_ADJECTIVES[look];
  if (!adjective) {
    const medium = topByFacet(scores, listed, "medium", 1)[0];
    if (medium) adjective = MEDIUM_ADJECTIVES[medium];
  }
  const [top] = wingRanking(scores, listed);
  const noun =
    top && top.score > 0 ? WINGS.find((w) => w.id === top.id)!.noun : "Exhibition";
  return { adjective: adjective ?? "First", noun };
}
```

Check `facetOf` exists in `topic-facets.ts` (it does: the facet test imports it). It returns `TopicFacet | undefined`.

- [ ] **Step 4: Implement `taste.ts`**

```ts
// The taste profile (docs/DESIGN_first-exhibition.md §4): what the reveal showed, in one JSON
// value — the title, the top wings and mediums, the temperament strip, the travel compass and
// the opened article cards. Computed here on the client over the local draft, exactly as the
// reveal renders it, sent with `onboarding.complete`, validated by `tasteSchema` on the server
// and stored in `user_taste`. A client-safe leaf: zod and config only, no React, no database.
//
// Why the screen computes it and the server validates rather than recomputes: v1's rule is that
// what is stored is what the reveal showed, and the opened cards' item ids exist nowhere but on
// the screen — the answer log holds the option key (`essay`), not the article that card happened
// to show that day.
import { z } from "zod";

import {
  DESTINATIONS,
  type Destination,
} from "~/server/config/interview-destinations";
import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KINDS, type WritingKind } from "~/server/config/writing";

import { compassFrom, type Axes } from "./compass";
import { SKIP } from "./config";
import { exhibitionTitle, topByFacet, wingRanking } from "./exhibition";
import { temperamentFrom, type Temperament } from "./temperament";
import type { Answer } from "./types";

/** An article card the reader opened — what "You’d open" shows again on the profile. */
export interface OpenedCard {
  itemId: string;
  title: string;
  kind: WritingKind;
  minutes: number;
}

export interface TasteV1 {
  v: 1;
  title: { adjective: string; noun: string };
  /** Top three wing ids (config/interview-wings.ts). */
  wings: string[];
  /** Top two medium topic ids. */
  mediums: string[];
  /** 0…1 each, the largest 1. */
  temperament: Temperament;
  /** Null when no destination was chosen. */
  compass: Axes | null;
  opened: OpenedCard[];
  /** Mean minutes of `opened`; null when none. */
  readingMinutes: number | null;
}

const unit = z.number().min(0).max(1);
const pole = z.number().min(-1).max(1);
const WING_IDS = WINGS.map((w) => w.id) as [string, ...string[]];

export const tasteSchema: z.ZodType<TasteV1> = z.object({
  v: z.literal(1),
  title: z.object({
    adjective: z.string().min(1).max(40),
    noun: z.string().min(1).max(40),
  }),
  wings: z.array(z.enum(WING_IDS)).max(3),
  mediums: z.array(z.string().min(1).max(64)).max(2),
  temperament: z.object(
    Object.fromEntries(TEMPERAMENT_DIMENSIONS.map((d) => [d.id, unit])) as Record<
      (typeof TEMPERAMENT_DIMENSIONS)[number]["id"],
      typeof unit
    >,
  ),
  compass: z
    .object({ wild: pole, old: pole, still: pole, far: pole })
    .nullable(),
  opened: z
    .array(
      z.object({
        itemId: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        kind: z.enum(WRITING_KINDS as unknown as [string, ...string[]]) as z.ZodType<WritingKind>,
        minutes: z.number().int().min(0).max(600),
      }),
    )
    .max(2),
  readingMinutes: z.number().min(0).max(600).nullable(),
});

/** The destinations the reader chose, from the logged answer; unknown keys and a skip are nothing. */
export function chosenDestinations(
  answers: readonly Answer[],
  questionId = "destinations",
): Destination[] {
  const a = answers.find((x) => x.questionId === questionId);
  if (!a || a.keys[0] === SKIP) return [];
  return a.keys.flatMap((k) => {
    const d = DESTINATIONS.find((x) => x.id === k);
    return d ? [d] : [];
  });
}

export function buildTaste(input: {
  scores: ReadonlyMap<string, number>;
  listed: ReadonlySet<string>;
  destinations: readonly Destination[];
  opened: readonly OpenedCard[];
}): TasteV1 {
  const { scores, listed, destinations, opened } = input;
  const minutes = opened.map((o) => o.minutes);
  return {
    v: 1,
    title: exhibitionTitle(scores, listed),
    wings: wingRanking(scores, listed)
      .filter((w) => w.score > 0)
      .slice(0, 3)
      .map((w) => w.id),
    mediums: topByFacet(scores, listed, "medium", 2),
    temperament: temperamentFrom(
      scores,
      destinations.map((d) => d.temperament),
    ),
    compass: compassFrom(destinations.map((d) => d.axes)),
    opened: [...opened],
    readingMinutes:
      minutes.length === 0
        ? null
        : minutes.reduce((a, b) => a + b, 0) / minutes.length,
  };
}
```

If the repo's zod is v4, `z.enum(WING_IDS)` accepts a `string[]` cast as a tuple; keep the cast. If `z.ZodType<TasteV1>` fails to type-check on the `temperament` object, drop the annotation and export `type TasteV1 = z.infer<typeof tasteSchema>` instead (then delete the interface).

- [ ] **Step 5: Run, then commit**

Run: `bunx vitest run src/lib/interview && bun run typecheck` — expected: PASS, clean.

```bash
git add src/lib/interview && git commit -m "feat(interview): the exhibition title and the taste profile's shape

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Two new facets — `tradition` and `form`

**Files:**
- Modify: `src/server/db/schema.ts` (`TopicFacet`), `src/server/config/topic-facets.ts` (`FACETS`, `FACET_LABELS`, `FACET_PROMPTS`), `src/server/config/topic-facets.test.ts`

**Interfaces:**
- Produces: `TopicFacet = "subject" | "medium" | "look" | "place" | "tradition" | "form"`; `FACETS` in that order.

- [ ] **Step 1: Change the test first**

In `src/server/config/topic-facets.test.ts`:
- rename the first test to `"uses only the six facet values"` (body unchanged);
- change the display-order test to:

```ts
    expect(FACETS).toEqual(["subject", "medium", "look", "place", "tradition", "form"]);
    expect(FACETS.map((f) => FACET_LABELS[f])).toEqual([
      "Subject", "Medium", "Look", "Place", "Tradition", "Form",
    ]);
```

Run: `bunx vitest run src/server/config/topic-facets.test.ts` — expected: FAIL on the order test.

- [ ] **Step 2: Implement**

`src/server/db/schema.ts`:

```ts
export type TopicFacet =
  | "subject"
  | "medium"
  | "look"
  | "place"
  // First Exhibition (10-04-26, docs/DESIGN_first-exhibition.md §5): where and when a way of
  // making comes from (ukiyo-e, medieval), and kinds of writing (essays, letters & diaries).
  | "tradition"
  | "form";
```

`src/server/config/topic-facets.ts`:

```ts
export const FACETS = [
  "subject",
  "medium",
  "look",
  "place",
  "tradition",
  "form",
] as const satisfies readonly TopicFacet[];

export const FACET_LABELS: Record<TopicFacet, string> = {
  subject: "Subject",
  medium: "Medium",
  look: "Look",
  place: "Place",
  tradition: "Tradition",
  form: "Form",
};

export const FACET_PROMPTS: Record<TopicFacet, string> = {
  subject: "What are you drawn to?",
  medium: "In what form?",
  look: "What should it feel like?",
  place: "Anywhere in particular?",
  tradition: "Where and when does the making come from?",
  form: "What kind of writing?",
};
```

Update the file header's "four facets" to "six facets" and note that onboarding no longer reads facets (it is a questionnaire); the prompts are kept for `/profile/topics`'s history and any future section headings.

- [ ] **Step 3: Run the whole check, then commit**

Run: `bun run check` — expected: green (no code switches exhaustively on `TopicFacet` other than these maps; if `tsc` names one, add the two keys there too).

```bash
git add -A && git commit -m "feat(topics): two facets more — tradition and form

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Vocabulary round one — `hand-topics.ts`, seeding at tier `grown`, facets, groups, personas

**Files:**
- Create: `src/server/config/hand-topics.ts`, `src/server/config/hand-topics.test.ts`
- Modify: `scripts/seed-topics.ts`, `src/server/config/topic-facets.ts` (33 entries), `src/server/config/topic-facets.test.ts` (count), `src/server/config/topic-groups.ts`, `src/server/config/topic-groups.test.ts` (sizes), `src/server/config/personas.ts`, `src/server/services/feed.test.ts` (one test), `docs/first-exhibition/vocabulary-proposal.md` (group comments)

**Interfaces:**
- Produces: `HAND_TOPICS: readonly HandTopic[]` (`{ id, label, seedQueries: SeedQueries }`), `isHandTopic(id)`; the 33 round-one ids as `topic` rows with facets and groups; new groups `sport-and-play`, `celebrations`, `faith-and-ritual` (subject), `calligraphy-and-manuscripts` (medium), `world-traditions`, `old-masters`, `nineteenth-century` (tradition), `minimal-and-quiet`, `ornate-and-opulent`, `cozy-and-homely`, `delicate-and-intricate` (look), `essays-and-ideas`, `life-writing` (form).

- [ ] **Step 1: Failing config test**

`src/server/config/hand-topics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { HAND_TOPICS } from "./hand-topics";
import { TOPIC_FACETS } from "./topic-facets";
import { groupOf } from "./topic-groups";
import { TOPICS, V1_SOURCES } from "./topics";

describe("HAND_TOPICS (First Exhibition round one)", () => {
  it("has slug ids, unique, and none that is an original", () => {
    const ids = HAND_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const originals = new Set(TOPICS.map((t) => t.id));
    expect(ids.filter((id) => originals.has(id))).toEqual([]);
  });

  it("gives every hand topic a facet and a group — the pickable contract", () => {
    for (const t of HAND_TOPICS) {
      expect(TOPIC_FACETS[t.id], t.id).toBeDefined();
      expect(groupOf(t.id), t.id).toBeDefined();
    }
  });

  it("gives every hand topic a cell for every v1 source (an empty cell is legal: looks and forms are not searched for)", () => {
    for (const t of HAND_TOPICS)
      for (const s of V1_SOURCES)
        expect(Array.isArray(t.seedQueries[s]), `${t.id}/${s}`).toBe(true);
  });

  it("is round one's thirty-three", () => {
    expect(HAND_TOPICS).toHaveLength(33);
  });
});
```

Run: `bunx vitest run src/server/config/hand-topics.test.ts` — expected: FAIL, module missing.

- [ ] **Step 2: Create `hand-topics.ts`**

```ts
// Hand-added topics (docs/DESIGN_first-exhibition.md §5) — vocabulary that was *not* mined from
// the corpus's own tags, so it cannot go through `promote:topics`: round one of the First
// Exhibition proposal (docs/first-exhibition/vocabulary-proposal.md; Ben's ticks are the verdict,
// this file is the result). The sixteen in topics.ts are the graph's tuned set and stay sixteen;
// these are seeded by `db:seed` at tier `grown`, like a promoted topic, with the seed queries
// the search-shaped museums will be asked. Ingest reads the queries off the row, so nothing in
// scripts/ingest.ts changes; `graph:rebuild` gives them edges once items arrive.
//
// Facet and group live where they do for every topic — topic-facets.ts and topic-groups.ts — and
// hand-topics.test.ts refuses an entry here that is missing from either.
//
// **Looks and forms carry no queries.** A museum search for "cozy" or "essays" is not honest;
// those topics are homed by the curator's tags and, for forms, by the writing curator later.
import { V1_SOURCES, type SeedQueries } from "./topics";

export interface HandTopic {
  id: string;
  label: string;
  seedQueries: SeedQueries;
}

/** The same query for every v1 source — a first guess; per-source cells can be edited in place. */
function cells(query: string, over: Partial<SeedQueries> = {}): SeedQueries {
  const base = Object.fromEntries(V1_SOURCES.map((s) => [s, [query]])) as SeedQueries;
  return { ...base, ...over };
}
/** No search anywhere: tag- or classify-homed only. */
function noCells(): SeedQueries {
  return Object.fromEntries(V1_SOURCES.map((s) => [s, []])) as SeedQueries;
}

export const HAND_TOPICS: readonly HandTopic[] = [
  // ── Subject ──────────────────────────────────────────────────────────────────────────────
  { id: "gardens", label: "Gardens", seedQueries: cells("garden") },
  { id: "mountains", label: "Mountains", seedQueries: cells("mountains") },
  { id: "ships", label: "Ships", seedQueries: cells("ship") },
  { id: "interiors", label: "Interiors", seedQueries: cells("interior") },
  { id: "ruins", label: "Ruins", seedQueries: cells("ruins") },
  { id: "sport", label: "Sport", seedQueries: cells("sport", { wellcome: ["athletes"] }) },
  { id: "festivals", label: "Festivals", seedQueries: cells("festival") },
  { id: "costume", label: "Costume", seedQueries: cells("costume") },
  { id: "folklore", label: "Folklore", seedQueries: cells("folklore") },
  { id: "masks", label: "Masks", seedQueries: cells("mask") },
  { id: "religious-art", label: "Religious art", seedQueries: cells("religious") },
  {
    id: "sacred-architecture",
    label: "Sacred architecture",
    seedQueries: cells("temple", {
      wellcome: ["church"],
      archive: ["temple, church or mosque — sacred architecture"],
    }),
  },
  { id: "theatre", label: "Theatre", seedQueries: cells("theater", { wellcome: ["theatre"] }) },
  {
    id: "musical-instruments",
    label: "Musical instruments",
    seedQueries: cells("musical instrument"),
  },
  // ── Medium ───────────────────────────────────────────────────────────────────────────────
  { id: "woodcut", label: "Woodcut", seedQueries: cells("woodcut") },
  { id: "etching", label: "Etching", seedQueries: cells("etching") },
  { id: "stained-glass", label: "Stained glass", seedQueries: cells("stained glass") },
  { id: "tapestry", label: "Tapestry", seedQueries: cells("tapestry") },
  {
    id: "illuminated-manuscripts",
    label: "Illuminated manuscripts",
    seedQueries: cells("illuminated manuscript"),
  },
  {
    id: "nature-photography",
    label: "Nature photography",
    seedQueries: cells("nature photograph"),
  },
  // ── Tradition ────────────────────────────────────────────────────────────────────────────
  { id: "ukiyo-e", label: "Ukiyo-e", seedQueries: cells("ukiyo-e") },
  { id: "islamic-art", label: "Islamic art", seedQueries: cells("islamic") },
  { id: "medieval", label: "Medieval", seedQueries: cells("medieval") },
  { id: "renaissance", label: "Renaissance", seedQueries: cells("renaissance") },
  { id: "impressionism", label: "Impressionism", seedQueries: cells("impressionism") },
  // ── Look (no queries) ────────────────────────────────────────────────────────────────────
  { id: "minimal", label: "Minimal", seedQueries: noCells() },
  { id: "ornate", label: "Ornate", seedQueries: noCells() },
  { id: "nostalgic", label: "Nostalgic", seedQueries: noCells() },
  { id: "cozy", label: "Cozy", seedQueries: noCells() },
  { id: "delicate", label: "Delicate", seedQueries: noCells() },
  // ── Form (no queries) ────────────────────────────────────────────────────────────────────
  { id: "essays", label: "Essays", seedQueries: noCells() },
  { id: "criticism", label: "Criticism", seedQueries: noCells() },
  { id: "letters-and-diaries", label: "Letters & diaries", seedQueries: noCells() },
];

const HAND_IDS: ReadonlySet<string> = new Set(HAND_TOPICS.map((t) => t.id));
export function isHandTopic(id: string): boolean {
  return HAND_IDS.has(id);
}
```

- [ ] **Step 3: File the 33 into the facet map and the groups**

In `src/server/config/topic-facets.ts`, append to the relevant arrays (the file builds `TOPIC_FACETS` from per-facet arrays — follow its shape; if it is a flat object, add `id: "facet"` lines):
- subject: `gardens mountains ships interiors ruins sport festivals costume folklore masks religious-art sacred-architecture theatre musical-instruments`
- medium: `woodcut etching stained-glass tapestry illuminated-manuscripts nature-photography`
- look: `minimal ornate nostalgic cozy delicate`
- new `tradition` array: `ukiyo-e islamic-art medieval renaissance impressionism`
- new `form` array: `essays criticism letters-and-diaries`

Change the count test to `has exactly 192 entries — 159 … plus First Exhibition round one (10-04-26)`.

In `src/server/config/topic-groups.ts`, add members to existing groups and new groups (keep the `group(id, label, facet, topics)` helper):
- `plants-and-fungi` += `gardens`; `land-sea-and-sky` += `mountains`; `machines-and-technology` += `ships`; `cities-and-streets` += `interiors`, `ruins`; `everyday-things` += `costume`; `myth-story-and-the-strange` += `folklore`, `masks`; `music-film-and-performance` += `theatre`, `musical-instruments`;
- new subject groups: `group("sport-and-play", "Sport & play", "subject", ["sport"])`, `group("celebrations", "Celebrations", "subject", ["festivals"])`, `group("faith-and-ritual", "Faith & ritual", "subject", ["religious-art", "sacred-architecture"])`;
- `posters-print-and-type` += `woodcut`, `etching`; `craft-and-materials` += `stained-glass`, `tapestry`; `photography-group` += `nature-photography`; new `group("calligraphy-and-manuscripts", "Calligraphy & manuscripts", "medium", ["illuminated-manuscripts"])`;
- new tradition section: `group("world-traditions", "World traditions", "tradition", ["ukiyo-e", "islamic-art"])`, `group("old-masters", "Old masters", "tradition", ["medieval", "renaissance"])`, `group("nineteenth-century", "The nineteenth century", "tradition", ["impressionism"])`;
- new look groups: `group("minimal-and-quiet", "Minimal & quiet", "look", ["minimal"])`, `group("ornate-and-opulent", "Ornate & opulent", "look", ["ornate"])`, `group("cozy-and-homely", "Cozy & homely", "look", ["nostalgic", "cozy"])`, `group("delicate-and-intricate", "Delicate & intricate", "look", ["delicate"])`;
- new form section: `group("essays-and-ideas", "Essays & ideas", "form", ["essays", "criticism"])`, `group("life-writing", "Life writing", "form", ["letters-and-diaries"])`.

Change the size test to:

```ts
  it("is the size the designs recorded (09-25-26 + First Exhibition 10-04-26): 15 subject, 9 medium, 12 look, 6 place, 3 tradition, 2 form", () => {
    const count = (f: string) => TOPIC_GROUPS.filter((g) => g.facet === f).length;
    expect(["subject", "medium", "look", "place", "tradition", "form"].map(count)).toEqual([15, 9, 12, 6, 3, 2]);
  });
```

Then correct `docs/first-exhibition/vocabulary-proposal.md`: for each of the 33 ticked lines, set `<!-- group: … -->` to the group id used above (the proposal's "existing group" ids were not the repo's — design §5).

- [ ] **Step 4: Give every new group a persona**

`src/server/config/personas.test.ts` fails on "every group is held by at least one persona". Run it, read the list, and add each new group to one persona's `groups` whose `taste` text fits (do not remove anything; a persona's `topics` must not repeat a member of its own groups — the test checks). Suggested filing:
- `sport-and-play` → Sam Whitaker · `celebrations` → Greta Lindqvist · `faith-and-ritual` → Amira Haddad · `calligraphy-and-manuscripts` → June Park · `world-traditions` → Yuki Tanaka · `old-masters` → Theo Marchetti · `nineteenth-century` → Rosa Almeida · `minimal-and-quiet` → Maren Holt · `ornate-and-opulent` → Chloé Dubois · `cozy-and-homely` → Eli Nordström · `delicate-and-intricate` → Inès Bakker · `essays-and-ideas` → Noor El-Sayed · `life-writing` → Harold Finch.

Run: `bunx vitest run src/server/config` — expected: PASS (facets 192, groups sizes, personas, hand-topics).

- [ ] **Step 5: Seed hand topics at tier `grown`**

In `scripts/seed-topics.ts`:
- import `HAND_TOPICS` from `~/server/config/hand-topics`;
- after the originals' upsert, add a second upsert:

```ts
  // Hand-added topics (First Exhibition round one, docs/DESIGN_first-exhibition.md §5): seeded
  // like the sixteen, at tier `grown` — they are vocabulary, not the graph's tuned set. The
  // facets pass below gives them their facet; ingest reads their queries off the row.
  if (HAND_TOPICS.length > 0) {
    await db
      .insert(topic)
      .values(
        HAND_TOPICS.map((t) => ({
          id: t.id,
          label: t.label,
          seedQueries: t.seedQueries,
          tier: "grown" as const,
        })),
      )
      .onConflictDoUpdate({
        target: topic.id,
        set: {
          label: sql`excluded.label`,
          seedQueries: sql`excluded.seed_queries`,
          // Not `tier`: a hand topic later promoted or re-tiered keeps what it has.
        },
      });
  }
```

- extend the orphans filter: `!TOPICS.some(...) && !HAND_TOPICS.some((t) => t.id === row.id)`;
- extend the new/changed classification loop to cover `HAND_TOPICS` too and print `Seeded N topics (16 original + ${HAND_TOPICS.length} hand-added)`.

Run: `bun run db:seed` against the local database — expected: `… 33 new …` on the first run, "already up to date" on the second; `psql "$DATABASE_URL" -c "select id, tier, facet from topic where id in ('gardens','essays','ukiyo-e')"` shows `grown` and the facets.

- [ ] **Step 6: Pin the feed's tolerance of a graph-less topic (Review Focus 5)**

Append to `src/server/services/feed.test.ts` (it already tests `pickDrift`/`pickJump` with a fixture graph; follow its helpers):

```ts
  it("a picked topic with no graph row drifts and jumps to itself, never throws", () => {
    const weights = new Map([["gardens", 1]]);
    const rng = () => 0.5;
    const drift = pickDrift(weights, TOPIC_GRAPH, DEFAULT_KNOBS, rng);
    expect(drift?.topicId).toBe("gardens");
    expect(drift?.why).toContain("(no row)");
    const jump = pickJump(weights, TOPIC_GRAPH, rng);
    expect(jump?.topicId).toBe("gardens");
  });
```

Import whatever the file already imports for those (`pickDrift`, `pickJump`, `TOPIC_GRAPH`, `DEFAULT_KNOBS` from `./feed` / `./feed-knobs`). Run: `bunx vitest run src/server/services/feed.test.ts` — expected: PASS.

- [ ] **Step 7: Full check, commit**

Run: `bun run check` — expected: green.

```bash
git add -A && git commit -m "feat(topics): vocabulary round one — 33 hand-added topics seeded at tier grown, two facets filled

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Bank v2

**Files:**
- Modify: `src/lib/interview/bank.ts` (rewrite the question list), `src/lib/interview/bank.test.ts`
- Create: `src/lib/interview/steps.ts`

**Interfaces:**
- Consumes: `WINGS`, `BALANCED_TWELVE`, `DESTINATIONS`, `DESTINATION_MAX`, `Option.show/always/card/face.writing`.
- Produces: `BANK_VERSION = 2`, `QUESTIONS`, `STARTER_TOPICS` (unchanged), `PICKS: Record<string, { source: string; sourceId: string }>` (hand picks keyed by face role, filled in Task 11), `WING_SCREENS`, `STEP_OF: Record<string, number>`, `STEP_COUNT = 10`, `STEP_LABELS`, `stepsAsked(asked: readonly Question[]): number[]`.

- [ ] **Step 1: Change the tests first**

In `src/lib/interview/bank.test.ts`:
- "asks between four and fifteen questions" → `toBeGreaterThanOrEqual(10)` / `toBeLessThanOrEqual(20)`;
- in "names only topics and groups that exist", treat **proposed** ids as legal: build `const KNOWN = new Set([...WIDE, ...WINGS.flatMap((w) => w.proposed), ...DESTINATIONS.flatMap((d) => d.topics)])` and test against `KNOWN` instead of `WIDE` for `e.topics`; faces' `topic` still against `WIDE`;
- add to "shapes each kind correctly": `if (q.show) expect(q.kind, q.id).toBe("choice");` and `for (const o of q.options) if (o.face?.writing) expect(o.always, q.id).toBe(true);`
- add a `describe("steps")`:

```ts
describe("the ten steps", () => {
  it("files every question into exactly one step, numbered 1…STEP_COUNT with no gaps", () => {
    for (const q of QUESTIONS) expect(STEP_OF[q.id], q.id).toBeDefined();
    const used = [...new Set(QUESTIONS.map((q) => STEP_OF[q.id]!))].sort((a, b) => a - b);
    expect(used).toEqual(Array.from({ length: STEP_COUNT - 1 }, (_, i) => i + 1));
    // Step STEP_COUNT is About you, which is not a bank question.
    expect(STEP_LABELS).toHaveLength(STEP_COUNT);
  });
  it("stepsAsked lists the steps that survive, in order", () => {
    expect(stepsAsked(askable(QUESTIONS, NARROW))).toEqual(
      [...new Set(askable(QUESTIONS, NARROW).map((q) => STEP_OF[q.id]!))],
    );
  });
});
```

- add to the sixteen-topic describe: `it("asks the three wing screens, each with at least two live wings", …)` asserting `askable(QUESTIONS, NARROW).filter(q => q.id.startsWith("wings-")).length === 3` and each has `options.length >= 2`;
- keep the e2e path test as is (it now exercises the whole v2 bank including `show.top`).

Imports: `WINGS` from `~/server/config/interview-wings`, `DESTINATIONS` from `~/server/config/interview-destinations`, `STEP_COUNT, STEP_LABELS, STEP_OF, stepsAsked` from `./steps`.

Run: `bunx vitest run src/lib/interview/bank.test.ts` — expected: FAIL (no `./steps`, count too low).

- [ ] **Step 2: Write `steps.ts`**

```ts
// The progress indicator counts STEPS, not questions (docs/DESIGN_first-exhibition.md §1): three
// wing screens and the playoff are one step ("Rooms"), three hands pairs another, and so on.
// Keyed by question id so the bank can be reordered without touching this file's meaning.
// bank.test.ts pins that every question has a step and the steps are 1…STEP_COUNT-1 contiguous
// (the last step, About you, is a screen of its own, not a bank question).
import type { Question } from "./types";

export const STEP_COUNT = 10;

/** The step names, for a label beside the count if wanted. Index 0 is step 1. */
export const STEP_LABELS: readonly string[] = [
  "Rooms",
  "Hands",
  "Feeling",
  "Keep",
  "Reading",
  "Travel",
  "Rather not",
  "How much",
  "Your words",
  "About you",
];

export const STEP_OF: Readonly<Record<string, number>> = {
  "wings-1": 1,
  "wings-2": 1,
  "wings-3": 1,
  playoff: 1,
  "hands-mushrooms": 2,
  "hands-owls": 2,
  "hands-fish": 2,
  "feel-circles": 3,
  "feel-roads": 3,
  "feel-rooms": 3,
  keep: 4,
  "read-1": 5,
  "read-2": 5,
  destinations: 6,
  "rather-not": 7,
  amount: 8,
  "look-at": 9,
  "read-watch": 9,
};

/** The distinct steps the asked questions fall into, in order — a narrow database skips some. */
export function stepsAsked(asked: readonly Question[]): number[] {
  return [...new Set(asked.map((q) => STEP_OF[q.id]).filter((s): s is number => s !== undefined))];
}
```

- [ ] **Step 3: Rewrite `bank.ts`**

Keep the file's header comment (update "pair has exactly two options" → add the new rules: a `show` question is a `choice`; a writing face is `always`), the `topics`/`groups` helpers, `FACE_BONUS`, `STARTER_TOPICS`. Replace `BANK_VERSION` and `QUESTIONS`:

```ts
import {
  BALANCED_TWELVE,
  DESTINATIONS,
  DESTINATION_MAX,
} from "~/server/config/interview-destinations";
import { WINGS, type Wing } from "~/server/config/interview-wings";
import {
  READING_AMOUNTS,
  READING_LABELS,
} from "~/server/config/reading-amount";
import { WRITING_KINDS, WRITING_KIND_LABELS } from "~/server/config/writing";

import type { Effect, Option, Question } from "./types";

/** v2 — First Exhibition (10-04-26, docs/DESIGN_first-exhibition.md). v1 was the thirteen
 *  questions of docs/PLAN_onboarding-questionnaire.md §3. */
export const BANK_VERSION = 2;

/**
 * Hand-picked pictures, keyed by face role (`wing:<id>:door`, `wing:<id>:playoff`,
 * `pair:<id>:a|b`, `keep:<n>`). Filled from `bun run faces:first-exhibition` (Task 11 of the
 * plan); a missing key means "the face topic's best picture", which is what CI and a fresh
 * install get. `(source, sourceId)`, never an item id: the pair is the same in every database.
 */
export const PICKS: Readonly<Record<string, { source: string; sourceId: string }>> = {};

/** Which four wings each wing screen shows. Space, Growing and Stage are on different screens so
 *  the e2e path (astronomy + botany + music) can choose all three; a wing with no listed topic is
 *  hidden by `askable`, and a screen is asked while two or more survive. */
export const WING_SCREENS: readonly (readonly string[])[] = [
  ["space", "creatures", "cities", "body"],
  ["growing", "machines", "people", "everyday"],
  ["stage", "land", "myth", "made"],
];

function wingById(id: string): Wing {
  const w = WINGS.find((x) => x.id === id);
  if (!w) throw new Error(`bank: no wing "${id}"`);
  return w;
}

/** A wing as an answer: its subject spread (nature a little less), a bonus for the face topic. */
function wingOption(wing: Wing, pickRole: string): Option {
  return {
    key: wing.id,
    label: wing.label,
    face: { topic: wing.faceTopic, pick: PICKS[pickRole] },
    effects: [
      topics(wing.weight, ...wing.topics, ...wing.proposed),
      topics(FACE_BONUS, wing.faceTopic),
    ],
  };
}

const WING_PROMPT = "Which would you look at longer?";

/** Same subject, different hands — only the medium changes, so only medium topics score. */
function hands(
  id: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  return pairOf(id, "Same subject, different hands.", a, b, faceTopic);
}
/** Same subject, a different feeling — only the look changes. */
function feel(
  id: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  return pairOf(id, "Same subject, a different feeling.", a, b, faceTopic);
}
function pairOf(
  id: string,
  prompt: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  const side = (s: typeof a, role: "a" | "b"): Option => ({
    key: s.key,
    label: s.label,
    face: { topic: faceTopic, pick: PICKS[`pair:${id}:${role}`] },
    effects: [topics(1, ...s.topics)],
  });
  return { id, kind: "pair", prompt, options: [side(a, "a"), side(b, "b")] };
}

/** "Tap any you'd keep": ten pictures, each carrying the tags of what it shows. A kept picture
 *  adds; an untouched one says nothing (skipping isn't disliking). Eight wings and two looks. */
const KEEP: readonly { key: string; label: string; faceTopic: string; tags: string[] }[] = [
  { key: "creatures", label: "Creatures", faceTopic: "birds", tags: ["birds", "zoology"] },
  { key: "growing", label: "Growing things", faceTopic: "mushrooms", tags: ["mushrooms", "botany"] },
  { key: "land", label: "Land, sea & sky", faceTopic: "landscapes", tags: ["landscapes", "clouds"] },
  { key: "space", label: "Space", faceTopic: "astronomy", tags: ["astronomy", "moon"] },
  { key: "machines", label: "Machines", faceTopic: "machines", tags: ["machines", "technical-drawing"] },
  { key: "cities", label: "Cities", faceTopic: "architecture", tags: ["architecture", "urban-landscape"] },
  { key: "people", label: "People", faceTopic: "portraiture", tags: ["portraiture", "street-photography"] },
  { key: "myth", label: "Myth", faceTopic: "mythology", tags: ["mythology", "dragon"] },
  { key: "abstract", label: "Abstract", faceTopic: "abstract", tags: ["abstract", "geometric"] },
  { key: "eerie", label: "Eerie", faceTopic: "eerie", tags: ["eerie", "black-and-white"] },
];

/** "Which would you open?" — one real article per kind, short on the first screen, long on the second. */
function readQuestion(id: string, nth: 0 | 1): Question {
  return {
    id,
    kind: "choice",
    prompt: nth === 0 ? "Which would you open?" : "And one of these?",
    options: WRITING_KINDS.map((kind) => ({
      key: kind,
      label: WRITING_KIND_LABELS[kind],
      always: true,
      // `topic` is unused for a writing face; the service fills the card from the item.
      face: { topic: "literature", writing: { kind, nth } },
      effects: [],
    })),
  };
}

export const QUESTIONS: readonly Question[] = [
  // ── 1 · Rooms: three screens of four wings, then the playoff (show.ts). ─────────────────
  ...WING_SCREENS.map(
    (ids, i): Question => ({
      id: `wings-${i + 1}`,
      kind: "choice",
      prompt: WING_PROMPT,
      options: ids.map((id) => wingOption(wingById(id), `wing:${id}:door`)),
    }),
  ),
  {
    id: "playoff",
    kind: "choice",
    prompt: "One more. Which would you look at longer?",
    show: { top: 4 },
    options: WINGS.map((w) => wingOption(w, `wing:${w.id}:playoff`)),
  },

  // ── 2 · Hands: the subject stays, the medium changes. ───────────────────────────────────
  hands(
    "hands-mushrooms",
    { key: "photo", label: "Photograph", topics: ["nature-photography", "photography"] },
    { key: "plate", label: "Natural-history plate", topics: ["botanical-illustration", "scientific-illustration"] },
    "mushrooms",
  ),
  hands(
    "hands-owls",
    { key: "photo", label: "Photograph", topics: ["photography", "nature-photography"] },
    { key: "painting", label: "Painting", topics: ["painting", "painterly"] },
    "birds",
  ),
  hands(
    "hands-fish",
    { key: "plate", label: "Natural-history plate", topics: ["scientific-illustration"] },
    { key: "jewel", label: "Jewellery", topics: ["jewelry", "metal"] },
    "zoology",
  ),

  // ── 3 · Feeling: the subject stays, the look changes. ───────────────────────────────────
  feel(
    "feel-circles",
    { key: "bold", label: "Bold", topics: ["color", "geometric"] },
    { key: "soft", label: "Soft", topics: ["pastel-palette", "delicate"] },
    "geometric",
  ),
  feel(
    "feel-roads",
    { key: "night", label: "Night", topics: ["melancholy", "cinematic"] },
    { key: "day", label: "Day", topics: ["light", "nostalgic"] },
    "urban-landscape",
  ),
  feel(
    "feel-rooms",
    { key: "warm", label: "Warm", topics: ["mid-century-modern", "cozy"] },
    { key: "austere", label: "Austere", topics: ["brutalist", "minimal"] },
    "furniture",
  ),

  // ── 4 · Keep. ───────────────────────────────────────────────────────────────────────────
  {
    id: "keep",
    kind: "multi",
    prompt: "Tap any you’d keep.",
    options: KEEP.map((k, i) => ({
      key: k.key,
      label: k.label,
      face: { topic: k.faceTopic, pick: PICKS[`keep:${i + 1}`] },
      effects: [topics(1, ...k.tags)],
    })),
  },

  // ── 5 · Reading: article cards in Ambit's own format. ───────────────────────────────────
  readQuestion("read-1", 0),
  readQuestion("read-2", 1),

  // ── 6 · Travel: taste read off places, never a place topic. ─────────────────────────────
  {
    id: "destinations",
    kind: "multi",
    max: DESTINATION_MAX,
    prompt: "Where would you go next?",
    options: BALANCED_TWELVE.map((id) => {
      const d = DESTINATIONS.find((x) => x.id === id);
      if (!d) throw new Error(`bank: no destination "${id}"`);
      return {
        key: d.id,
        label: d.name,
        card: { where: d.where, line: d.line, coord: d.coord },
        effects: [topics(1.5, ...d.topics)],
      };
    }),
  },

  // ── 7 · Rather not: strong negatives, and a log for what has no topic yet. ──────────────
  {
    id: "rather-not",
    kind: "multi",
    prompt: "Anything you’d rather not see?",
    options: [
      { key: "horror", label: "Horror & gore", effects: [topics(-2, "horror", "monster", "halloween")] },
      { key: "death", label: "Death & skeletons", effects: [topics(-2, "death")] },
      { key: "anatomy", label: "Anatomy & medicine", effects: [topics(-2, "anatomy", "medicine", "body")] },
      { key: "insects", label: "Insects", effects: [topics(-2, "insects")] },
      // No topic or tag marks nudity yet (design §10) — offered and logged, nothing scored.
      { key: "nudity", label: "Nudity", always: true, effects: [] },
      { key: "weapons", label: "War & weapons", effects: [topics(-2, "military-history")] },
      { key: "propaganda", label: "Propaganda", effects: [topics(-2, "soviet-propaganda", "activism", "advertising")] },
      { key: "religious", label: "Religious imagery", effects: [topics(-2, "religious-art", "icons", "sacred-architecture")] },
      { key: "eerie", label: "Eerie & melancholy", effects: [topics(-2, "eerie", "melancholy")] },
    ],
  },

  // ── 8 · How much reading (the default is preselected from step 5). ──────────────────────
  {
    id: "amount",
    kind: "amount",
    prompt: "How much reading do you want mixed in?",
    options: READING_AMOUNTS.map((amount) => ({
      key: amount,
      label: READING_LABELS[amount],
      effects: [],
      reading: amount,
    })),
  },

  // ── 9 · Your words, last and optional. ──────────────────────────────────────────────────
  {
    id: "look-at",
    kind: "text",
    prompt: "What do you like to look at on the internet?",
    options: [],
  },
  {
    id: "read-watch",
    kind: "text",
    prompt: "What do you read or watch? Authors, magazines, a favourite film — anything.",
    options: [],
  },
];
```

Note `military-history` is a proposed id not in round one: the `weapons` option is hidden by `askable` until it is listed — as designed. `groups()` becomes unused; delete it (or keep it exported for Ben's edits — if kept, `eslint` may flag it; export it).

- [ ] **Step 4: Run the bank tests**

Run: `bunx vitest run src/lib/interview` — expected: PASS, including the e2e path on both shapes. If the NARROW path fails: on sixteen topics `wings-1` offers space/creatures/cities (body hidden), `wings-2` growing/machines/people, `wings-3` stage/land/myth — astronomy, botany and music are reachable; check `WING_SCREENS` was typed as above.

- [ ] **Step 5: Check and commit**

Run: `bun run check` — expected: green (`onboarding-screen.test.tsx` and `question-step.test.tsx` use `TEST_BANK`, not the real bank, so they still pass).

```bash
git add src/lib/interview && git commit -m "feat(interview): bank v2 — First Exhibition's eighteen questions in ten steps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Faces — the writing branch

**Files:**
- Modify: `src/server/db/items.ts`, `src/server/db/items.integration.test.ts`, `src/server/services/question-faces.ts`, `src/server/services/question-faces.test.ts`

**Interfaces:**
- Produces: `topWritingForKinds(kinds: readonly WritingKind[], perKind: number): Promise<WritingCandidate[]>` where `WritingCandidate = { kind: WritingKind; id: string; imageUrl: string | null; title: string; summary: string | null; readingMinutes: number | null; topicIds: string[] }`; `WRITING_FACE_FLOOR = 8`, `SHORT_READ_MAX = 6`, `LONG_READ_MIN = 12`; `getQuestionFaces` returns `QuestionFace.writing` for writing faces; `pickWriting(candidates, kind, nth, used): WritingCandidate | undefined` (exported, pure, tested).

- [ ] **Step 1: Failing unit test for the pure pick and the service**

Append to `src/server/services/question-faces.test.ts` (extend the `vi.mock` to include `topWritingForKinds: vi.fn()`; hoist it with the others):

```ts
describe("writing faces", () => {
  const cand = (id: string, kind: "essay" | "archive", minutes: number, imageUrl: string | null = null) => ({
    kind, id, imageUrl, title: `T ${id}`, summary: `First line of ${id}.\nSecond.`, readingMinutes: minutes, topicIds: ["literature", "books"],
  });

  it("pickWriting prefers a short piece for nth 0 and a long one for nth 1, never the same item twice", () => {
    const cs = [cand("a", "essay", 15), cand("b", "essay", 5), cand("c", "essay", 20)];
    const used = new Set<string>();
    const first = pickWriting(cs, "essay", 0, used)!;
    expect(first.id).toBe("b");
    used.add(first.id);
    const second = pickWriting(cs, "essay", 1, used)!;
    expect(second.id).toBe("a"); // best-scored long one (candidates arrive score-ordered)
    used.add(second.id);
    expect(pickWriting([cand("a", "essay", 15)], "essay", 0, used)).toBeUndefined();
  });

  it("falls back to the best unused candidate when none fits the length", () => {
    expect(pickWriting([cand("a", "essay", 9)], "essay", 0, new Set())!.id).toBe("a");
    expect(pickWriting([cand("a", "essay", 9)], "essay", 1, new Set())!.id).toBe("a");
  });

  it("a writing face carries the card copy, minutes, kind and memberships; src only when there is a picture", async () => {
    topFacesForTopics.mockResolvedValue([]);
    facePicks.mockResolvedValue([]);
    topWritingForKinds.mockResolvedValue([cand("e1", "essay", 4, "https://m.test/e1.jpg"), cand("r1", "archive", 3)]);
    const bank: Question[] = [{
      id: "read-1", kind: "choice", prompt: "?", options: [
        { key: "essay", label: "Essay", always: true, effects: [], face: { topic: "literature", writing: { kind: "essay", nth: 0 } } },
        { key: "archive", label: "Archive", always: true, effects: [], face: { topic: "literature", writing: { kind: "archive", nth: 0 } } },
      ],
    }];
    const faces = await getQuestionFaces(bank);
    expect(faces[faceKey("read-1", "essay")]).toEqual({
      itemId: "e1",
      src: "/api/img/e1?w=960",
      writing: { title: "T e1", dek: "First line of e1.", minutes: 4, kind: "essay", topicIds: ["literature", "books"] },
    });
    expect(faces[faceKey("read-1", "archive")]!.src).toBeUndefined();
    expect(faces[faceKey("read-1", "archive")]!.writing?.kind).toBe("archive");
  });

  it("a kind with no candidate is simply absent — the card renders as text", async () => {
    topFacesForTopics.mockResolvedValue([]);
    facePicks.mockResolvedValue([]);
    topWritingForKinds.mockResolvedValue([]);
    const faces = await getQuestionFaces([{
      id: "read-1", kind: "choice", prompt: "?", options: [
        { key: "essay", label: "Essay", always: true, effects: [], face: { topic: "literature", writing: { kind: "essay", nth: 0 } } },
      ],
    }]);
    expect(faces).toEqual({});
  });
});
```

Add `pickWriting` to the import from `./question-faces`. Check the file's `faceSrc` expectation: v1's tests use `/api/img/<id>?w=960`; match whatever `imageSrc` yields in the existing tests.

Run: `bunx vitest run src/server/services/question-faces.test.ts` — expected: FAIL.

- [ ] **Step 2: Implement `topWritingForKinds` in `db/items.ts`**

Append (imports `and`, `eq`, `gte`, `inArray`, `isNotNull`, `lte`, `sql`, `notInArray` already exist; add `WRITING_KINDS`/`WritingKind` type import from `~/server/config/writing`):

```ts
/** A writing item must score this to be a reading card — a lower bar than a picture face (9):
 *  the writing corpus is smaller and the card shows a headline, not the piece. */
export const WRITING_FACE_FLOOR = 8;

export interface WritingCandidate {
  kind: WritingKind;
  id: string;
  imageUrl: string | null;
  title: string;
  summary: string | null;
  readingMinutes: number | null;
  /** `item_topic` memberships — what choosing the card scores. */
  topicIds: string[];
}

/**
 * The best-scored articles of each writing kind, `perKind` each, with their topic memberships —
 * the pool the reading cards are drawn from (services/question-faces.ts picks a short and a long
 * one per kind). One ranked query, then one membership query over the winners.
 */
export async function topWritingForKinds(
  kinds: readonly WritingKind[],
  perKind: number,
): Promise<WritingCandidate[]> {
  if (kinds.length === 0) return [];
  const { db } = await import("./client");
  const conditions = [
    eq(item.type, "article"),
    inArray(item.kind, [...kinds]),
    gte(item.curationScore, WRITING_FACE_FLOOR),
  ];
  if (SUSPENDED_SOURCES.length > 0) conditions.push(notInArray(item.source, SUSPENDED_SOURCES));

  const ranked = db
    .select({
      kind: item.kind,
      id: item.id,
      imageUrl: item.imageUrl,
      title: item.title,
      summary: item.summary,
      readingMinutes: item.readingMinutes,
      n: sql<number>`row_number() over (partition by ${item.kind} order by ${item.curationScore} desc, ${item.id})`.as("n"),
    })
    .from(item)
    .where(and(...conditions))
    .as("ranked");
  const rows = await db
    .select({
      kind: ranked.kind, id: ranked.id, imageUrl: ranked.imageUrl,
      title: ranked.title, summary: ranked.summary, readingMinutes: ranked.readingMinutes,
    })
    .from(ranked)
    .where(lte(ranked.n, perKind))
    .orderBy(ranked.kind, ranked.n);
  if (rows.length === 0) return [];

  const memberships = await db
    .select({ itemId: itemTopic.itemId, topicId: itemTopic.topicId })
    .from(itemTopic)
    .where(inArray(itemTopic.itemId, rows.map((r) => r.id)));
  const byItem = new Map<string, string[]>();
  for (const m of memberships) (byItem.get(m.itemId) ?? byItem.set(m.itemId, []).get(m.itemId)!).push(m.topicId);

  return rows.map((r) => ({
    kind: r.kind as WritingKind,
    id: r.id,
    imageUrl: r.imageUrl,
    title: r.title,
    summary: r.summary,
    readingMinutes: r.readingMinutes,
    topicIds: byItem.get(r.id) ?? [],
  }));
}
```

- [ ] **Step 3: Integration test for it**

Append to `src/server/db/items.integration.test.ts` (follow its fixture helpers: it inserts items with a test topic and deletes them in `afterAll`; insert two `type: "article"` rows with `kind: "essay"`, scores 8.5 and 9, `readingMinutes` 4 and 15, and one membership each):

```ts
  it("topWritingForKinds ranks articles of a kind by score and carries their memberships", async () => {
    const rows = await topWritingForKinds(["essay"], 2);
    const mine = rows.filter((r) => fixtureIds.includes(r.id));
    expect(mine.map((r) => r.readingMinutes)).toEqual([15, 4]); // 9 before 8.5
    expect(mine[0]!.topicIds).toContain(fixtureTopicId);
  });
```

Use the file's own names for the fixture id list and topic id. Run: `bunx vitest run src/server/db/items.integration.test.ts` — expected: PASS (with `DATABASE_URL`).

- [ ] **Step 4: Implement the service branch**

In `src/server/services/question-faces.ts`:

```ts
import { topWritingForKinds, type WritingCandidate } from "~/server/db/items";
import type { WritingKind } from "~/server/config/writing";

/** How many articles to fetch per kind — enough to find a short and a long one. */
const PER_KIND = 6;
/** "Short" and "long" for the two reading screens (design §2). */
export const SHORT_READ_MAX = 6;
export const LONG_READ_MIN = 12;

/**
 * The article for one card: for `nth` 0 the best-scored *short* piece of the kind, for 1 the
 * best *long* one; when none fits the length, the best unused one. `used` keeps two cards from
 * showing the same article. Pure, so it is tested without a database.
 */
export function pickWriting(
  candidates: readonly WritingCandidate[],
  kind: WritingKind,
  nth: 0 | 1,
  used: ReadonlySet<string>,
): WritingCandidate | undefined {
  const pool = candidates.filter((c) => c.kind === kind && !used.has(c.id));
  const fits = (c: WritingCandidate) =>
    nth === 0
      ? (c.readingMinutes ?? Infinity) <= SHORT_READ_MAX
      : (c.readingMinutes ?? 0) >= LONG_READ_MIN;
  return pool.find(fits) ?? pool[0];
}

/** The summary's first line, for the card's dek. */
function dekOf(summary: string | null): string {
  return (summary ?? "").split("\n")[0]!.trim();
}
```

In `build()`: collect `const writingKinds = [...new Set(wanted.flatMap((w) => (w.face.writing ? [w.face.writing.kind] : [])))]`, fetch `topWritingForKinds(writingKinds, PER_KIND)` in the `Promise.all`, and in the bank-order loop, before the picture branch:

```ts
    if (face.writing) {
      const c = pickWriting(writing, face.writing.kind, face.writing.nth, used);
      if (!c) continue;
      used.add(c.id);
      faces[faceKey(q.id, o.key)] = {
        itemId: c.id,
        ...(c.imageUrl ? { src: faceSrc(c.id, c.imageUrl) } : {}),
        writing: {
          title: c.title,
          dek: dekOf(c.summary),
          minutes: c.readingMinutes ?? 0,
          kind: c.kind,
          topicIds: c.topicIds,
        },
      };
      continue;
    }
```

Update the header comment: a third source of faces, the writing branch.

- [ ] **Step 5: Run, check, commit**

Run: `bunx vitest run src/server/services/question-faces.test.ts && bun run check` — expected: PASS, green.

```bash
git add -A && git commit -m "feat(faces): reading cards are real writing items — short on the first screen, long on the second

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Hand picks and `/dev/faces`

**Files:**
- Modify: `src/lib/interview/bank.ts` (`PICKS`), `src/app/dev/faces/page.tsx`

- [ ] **Step 1: Resolve the study's pictures**

Run against the local database (both checkouts share `localhost:5432/ambit`, checked 10-05-26, so one run is the whole picture):

```bash
bun run faces:first-exhibition > .cache/faces-ambit.txt
```

Each line is `role  caption  { source: "…", sourceId: "…" }`. Roles in `faces.json`: `wing:<id>:door`, `wing:<id>:playoff`, `wing:<id>:spare`, `pair:<study-id>:a|b` (study ids are `medium-owls` → bank `hands-owls`, `medium-mushrooms` → `hands-mushrooms`, `medium-fish` → `hands-fish`, `look-circles` → `feel-circles`, `look-roads` → `feel-roads`, `look-rooms` → `feel-rooms`), `keep-or-pass` (198; pick ten by wing and tag to match `KEEP`'s order: creatures, growing, land, space, machines, cities, people, myth, then one abstract/geometric and one eerie/black-and-white).

- [ ] **Step 2: Fill `PICKS`**

In `bank.ts`, fill the object — one line per role, e.g.:

```ts
export const PICKS: Readonly<Record<string, { source: string; sourceId: string }>> = {
  "wing:creatures:door": { source: "pdr", sourceId: "…" },
  "wing:creatures:playoff": { source: "…", sourceId: "…" },
  // … twelve doors, twelve playoff seconds …
  "pair:hands-owls:a": { source: "…", sourceId: "…" },
  "pair:hands-owls:b": { source: "…", sourceId: "…" },
  // … six pairs …
  "keep:1": { source: "…", sourceId: "…" },
  // … ten keeps …
};
```

An id the scripts could not resolve: leave its key out and choose on `/dev/faces` in Step 4.

- [ ] **Step 3: `/dev/faces` shows article cards and keeps working for every faced option**

The page already iterates every option with a `face` (any kind). Two edits:
- for a `face.writing` option, render the current face's `writing.title`, `kind · minutes` and `itemId` instead of candidates (there is no hand pick for a writing face), with the line "article · automatic";
- the candidates grid header shows `q.id / o.key` already; add the role hint `PICKS key: wing:<id>:door` etc. by looking the option's `face.pick` up in `PICKS` (`Object.entries(PICKS).find(([, p]) => p === o.face.pick)?.[0]`).

- [ ] **Step 4: Look**

Run the dev server, open `/dev/faces`, and replace any pick that shows the gold-circle placeholder (design §7) or is missing, pasting the printed `pick:` line into `PICKS`. Restart (faces memoise for ten minutes) and confirm every wing door, playoff second, pair side and keep card has a picture.

- [ ] **Step 5: Check, commit**

Run: `bun run check` — expected: green.

```bash
git add -A && git commit -m "feat(faces): First Exhibition's hand picks — doors, playoff seconds, pairs, keeps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: The taste store — schema, migration, write, read

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/db/onboarding.ts`, `src/server/db/topics.ts`, `src/server/api/routers/onboarding.ts`, `src/server/api/routers/topics.ts`, `src/server/api/routers/onboarding.integration.test.ts`, `src/server/api/routers/routers.test.ts`
- Create: `drizzle/0013_user_taste.sql` (via `db:generate`, then renamed)

**Interfaces:**
- Consumes: `TasteV1`, `tasteSchema` (Task 6), `getItemsByIds`, `WINGS`.
- Produces: `userTaste` table; `OnboardingRun.taste?: TasteV1`; `getUserTaste(userId): Promise<TasteV1 | null>`; `onboarding.complete` input `taste?: TasteV1`; `topics.taste` query → `TasteV1 | null`.

- [ ] **Step 1: Failing integration tests**

In `src/server/api/routers/onboarding.integration.test.ts`, inside the describe, add a `taste` fixture and three tests:

```ts
    const taste = {
      v: 1 as const,
      title: { adjective: "Quiet", noun: "Weathers" },
      wings: ["land", "growing"],
      mediums: [a],
      temperament: { communal: 0.2, aesthetic: 1, dark: 0, thrilling: 0.1, cerebral: 0.5 },
      compass: { wild: 0.6, old: 0.2, still: 0.4, far: 0.1 },
      opened: [] as { itemId: string; title: string; kind: "essay"; minutes: number }[],
      readingMinutes: null,
    };

    it("stores the taste with the run, and a retake replaces it", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(input({ taste }));
      const stored = await caller.topics.taste();
      expect(stored?.title).toEqual({ adjective: "Quiet", noun: "Weathers" });
      const again = await caller.onboarding.complete(
        input({ taste: { ...taste, title: { adjective: "Gilded", noun: "Myths" } } }),
      );
      expect(again.runId).not.toBe(runId);
      expect((await caller.topics.taste())?.title.adjective).toBe("Gilded");
    });

    it("refuses a taste whose opened item does not exist, writing nothing", async () => {
      const caller = createCaller(authedContext(`test-onboarding-badtaste-${nanoid(6)}`)); // create this user in beforeAll like the others
      await expect(
        caller.onboarding.complete(
          input({ taste: { ...taste, opened: [{ itemId: "no-such-item", title: "x", kind: "essay", minutes: 3 }] } }),
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await caller.topics.taste()).toBeNull();
    });

    it("topics.taste is null for a reader who has none", async () => {
      const caller = createCaller(authedContext(`test-onboarding-notaste-${nanoid(6)}`));
      expect(await caller.topics.taste()).toBeNull();
    });
```

(Use a user that exists: the file creates its users in `beforeAll`; add the `notaste` id there the same way, and to the cleanup.) In `routers.test.ts`'s "protected procedures reject a null session" list, add `topics.taste`.

Run: `bunx vitest run src/server/api/routers/onboarding.integration.test.ts` — expected: FAIL (`taste` unknown input key; `topics.taste` missing).

- [ ] **Step 2: Schema and migration**

In `src/server/db/schema.ts`, after `interviewAnswer`:

```ts
// The taste profile (docs/DESIGN_first-exhibition.md §4): what the questionnaire's reveal showed
// — exhibition title, top wings and mediums, temperament, travel compass, opened cards — as one
// JSON value, one row per reader, replaced by every completed run. The answer log stays the
// source of truth; this is the derived view film and music will read later, versioned inside
// the JSON (`v`) so a new shape adds keys, not columns.
export const userTaste = pgTable("user_taste", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // The interview_answer run this was computed from.
  runId: text("run_id").notNull(),
  bankVersion: integer("bank_version").notNull(),
  taste: jsonb("taste").$type<TasteV1>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Add `import type { TasteV1 } from "~/lib/interview/taste";` and `jsonb` to the drizzle imports. Then:

```bash
bun run db:generate
# rename the generated file to drizzle/0013_user_taste.sql and change its "tag" in drizzle/meta/_journal.json to match
bun run db:migrate
```

Expected SQL: `CREATE TABLE "user_taste" (...)` with the five columns, the FK `ON DELETE cascade`.

- [ ] **Step 3: Write and read**

`src/server/db/onboarding.ts`: add `taste?: TasteV1` to `OnboardingRun` (doc: "what the reveal showed; absent on a v1 client") and inside the transaction, after the answers insert:

```ts
    if (run.taste) {
      await tx
        .insert(userTaste)
        .values({ userId, runId, bankVersion: run.bankVersion, taste: run.taste })
        .onConflictDoUpdate({
          target: userTaste.userId,
          set: {
            runId,
            bankVersion: run.bankVersion,
            taste: run.taste,
            createdAt: sql`now()`,
          },
        });
    }
```

`src/server/db/topics.ts`:

```ts
/** The reader's taste profile — null before a bank-v2 run (db/onboarding.ts writes it). */
export async function getUserTaste(userId: string): Promise<TasteV1 | null> {
  const { db } = await import("./client");
  const rows = await db.select({ taste: userTaste.taste }).from(userTaste).where(eq(userTaste.userId, userId)).limit(1);
  return rows[0]?.taste ?? null;
}
```

`routers/onboarding.ts`: add `taste: tasteSchema.optional()` to the input, and after the picks check:

```ts
      if (input.taste) {
        // The opened cards name items; a stale tab after a corpus prune must not store a dangling id.
        const ids = input.taste.opened.map((o) => o.itemId);
        const found = await getItemsByIds(ids);
        const gone = ids.filter((id) => !found.has(id));
        if (gone.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown item id(s): ${gone.join(", ")}` });
        }
        // Mediums must be pickable topics, like picks.
        const badMedium = input.taste.mediums.filter((id) => !validIds.has(id));
        if (badMedium.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown medium id(s): ${badMedium.join(", ")}` });
        }
      }
```

and pass `taste: input.taste` to `completeOnboarding`. `routers/topics.ts`: `taste: protectedProcedure.query(({ ctx }) => getUserTaste(ctx.user.id)),` with a doc comment.

- [ ] **Step 4: Run, check, commit**

Run: `bunx vitest run src/server/api && bun run check` — expected: PASS, green.

```bash
git add -A && git commit -m "feat(taste): user_taste — the reveal's profile stored with the run, read by topics.taste

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `QuestionStep` and `FaceCard` — face grids, None of these, article and destination cards, preselected amount

**Files:**
- Modify: `src/components/onboarding/face-card.tsx`, `face-card.test.tsx`, `question-step.tsx`, `question-step.test.tsx`

**Interfaces:**
- Produces: `FaceCardProps.writing?: { kind: WritingKind; minutes: number; title: string; dek: string }` and `FaceCardProps.card?: { where; line; coord }`; `QuestionStepProps` unchanged; `QuestionStep` reports `topicIds` on a writing answer; new `data-step-kind` attributes are not needed.

- [ ] **Step 1: Failing tests**

Append to `src/components/onboarding/question-step.test.tsx` (using `TEST_BANK`'s `rooms` and `read` from Task 2):

```ts
  describe("a choice whose options all have faces", () => {
    it("renders face cards in a grid, and None of these as the NEITHER answer", () => {
      const { onChange } = show("rooms", undefined, {
        "rooms/space": { itemId: "s1", src: "/api/img/s1?w=960" },
      });
      expect(screen.getByRole("button", { name: "Space" }).querySelector("img")).toHaveAttribute("src", "/api/img/s1?w=960");
      fireEvent.click(screen.getByRole("button", { name: "None of these" }));
      expect(onChange).toHaveBeenCalledWith({ questionId: "rooms", keys: [NEITHER] }, true);
    });
  });

  describe("a reading question", () => {
    it("renders article cards and puts the face's memberships on the answer", () => {
      const { onChange } = show("read", undefined, {
        "read/essay": {
          itemId: "e1",
          writing: { title: "The case for boring buildings", dek: "An architect argues.", minutes: 18, kind: "essay", topicIds: ["architecture"] },
        },
      });
      const card = screen.getByRole("button", { name: /The case for boring buildings/ });
      expect(card).toHaveTextContent("ESSAY · 18 MIN");
      fireEvent.click(card);
      expect(onChange).toHaveBeenCalledWith({ questionId: "read", keys: ["essay"], topicIds: ["architecture"] }, true);
      // No face for curiosity: a text card named by its kind, and no memberships.
      fireEvent.click(screen.getByRole("button", { name: "Curiosity" }));
      expect(onChange).toHaveBeenLastCalledWith({ questionId: "read", keys: ["curiosity"] }, true);
    });
    it("has no None of these — 'I’d rather look at pictures' is the Skip button, owned by the screen", () => {
      show("read");
      expect(screen.queryByRole("button", { name: "None of these" })).toBeNull();
    });
  });

  it("renders a destination as a typeset card", () => {
    const q: Question = {
      id: "destinations", kind: "multi", max: 3, prompt: "Where?",
      options: [{ key: "kyoto", label: "Kyoto in the rain", card: { where: "Japan", line: "Moss gardens.", coord: "35.01° N" }, effects: [{ topics: ["botany"], score: 1.5 }] }],
    };
    render(<QuestionStep question={q} listed={WIDE} faces={{}} answer={undefined} onChange={vi.fn()} />);
    const card = screen.getByRole("button", { name: "Kyoto in the rain" });
    expect(card).toHaveTextContent("Japan");
    expect(card).toHaveTextContent("Moss gardens.");
    expect(card).toHaveTextContent("35.01° N");
    expect(card).toHaveAttribute("data-topics", "botany");
  });
```

Import `Question` type. Run: `bunx vitest run src/components/onboarding/question-step.test.tsx` — expected: FAIL.

- [ ] **Step 2: `FaceCard` variants**

In `face-card.tsx`, extend the props and the render:

```ts
export interface FaceCardProps {
  label: string;
  src?: string;
  topics: readonly string[];
  selected: boolean;
  onClick: () => void;
  /** An article card: `KIND · N MIN`, the title, one line of summary, the picture if any. The
   *  accessible name is the title. */
  writing?: { kind: WritingKind; minutes: number; title: string; dek: string };
  /** A typeset card with no picture (the destinations). */
  card?: { where: string; line: string; coord: string };
}
```

Render, replacing the body of the `<button>`:

```tsx
      {card ? (
        <span className="flex h-full w-full flex-col p-4 text-left">
          <span className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">{card.where}</span>
          <span className="text-ink-hi mt-2 text-[20px] leading-[1.15] font-semibold">{label}</span>
          <span className="text-ink/70 mt-2 text-[14px] leading-[1.45]">{card.line}</span>
          <span className="text-ink/45 mt-auto pt-3 font-mono text-[11px]">{card.coord}</span>
        </span>
      ) : writing ? (
        <span className="flex h-full w-full flex-col text-left">
          {showImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="aspect-[4/3] w-full object-cover" />
          )}
          <span className="flex flex-col p-4">
            <span className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              {WRITING_KIND_LABELS[writing.kind]} · {writing.minutes} min
            </span>
            <span className="text-ink-hi mt-2 text-[17px] leading-[1.25] font-semibold">{writing.title}</span>
            {writing.dek && <span className="text-ink/62 mt-1 text-[13px] leading-[1.45]">{writing.dek}</span>}
          </span>
        </span>
      ) : showImage ? (
        /* the v1 picture card, unchanged */
      ) : (
        /* the v1 text card, unchanged */
      )}
```

with `aria-label={writing ? writing.title : label}`, and the class list gaining `(card || writing) ? "aspect-auto min-h-[180px]" : "aspect-[4/5]"` in place of the fixed `aspect-[4/5]`. The `ESSAY · 18 MIN` the test expects is the uppercase transform of this span's text. Prose summary of the branches: `card` → a text card: `<span class="small caps">{where}</span>`, `<span class="text-[20px] font-semibold">{label}</span>`, `<span class="text-[14px] text-ink/70">{line}</span>`, `<span class="mt-auto font-mono text-[11px] text-ink/45">{coord}</span>`, `aria-label={label}`; `writing` → `aria-label={writing.title}`, picture if `showImage` as a top band (`aspect-[4/3]`), then `<span className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">{WRITING_KIND_LABELS[writing.kind]} · {writing.minutes} min</span>`, the title at 17 px semibold, the dek at 13 px `text-ink/62`; else the existing picture/text card. Keep `aspect-[4/5]` for picture cards; the article and destination cards are `min-h-[180px]` with `aspect-auto`. Import `WRITING_KIND_LABELS`, `type WritingKind` from `~/server/config/writing`.

- [ ] **Step 3: `QuestionStep` grids**

In `question-step.tsx`:
- `const allFaced = question.options.length > 0 && question.options.every((o) => o.face);`
- `const anyCard = question.options.some((o) => o.card);`
- `only(key)` becomes:

```ts
  const only = (key: string) => {
    const w = faces[faceKey(question.id, key)]?.writing;
    onChange(
      w ? { questionId: question.id, keys: [key], topicIds: w.topicIds } : { questionId: question.id, keys: [key] },
      true,
    );
  };
```

- a new branch before the chip branch, for `(question.kind === "choice" || question.kind === "multi") && (allFaced || anyCard)`:

```tsx
        <div role="group" aria-labelledby={id} className="mt-6">
          {question.kind === "multi" && (
            <p className="text-ink/62 mb-4 text-[15px]">{question.max ? `Pick up to ${COUNT_WORDS[question.max] ?? question.max}.` : "Pick any."}</p>
          )}
          <div className={cn("grid gap-3", question.options.length > 4 ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-4")}>
            {question.options.map((o) => {
              const face = faces[faceKey(question.id, o.key)];
              return (
                <FaceCard
                  key={o.key}
                  label={o.label}
                  src={face?.src}
                  writing={face?.writing}
                  card={o.card}
                  topics={topicsOf(o)}
                  selected={keys.includes(o.key)}
                  onClick={() => (question.kind === "multi" ? toggle(o.key) : only(o.key))}
                />
              );
            })}
          </div>
          {/* None of these: a faced choice whose options carry effects (the wings, the playoff) —
              not the reading screens, whose decline is the Skip button. */}
          {question.kind === "choice" && allFaced && question.options.some((o) => o.effects.length > 0) && (
            <div className="mt-4 flex justify-center">
              <Chip size="sm" selected={keys[0] === NEITHER} onClick={() => only(NEITHER)}>None of these</Chip>
            </div>
          )}
        </div>
```

- the existing chip branch is now for `choice`/`multi`/`amount` **without** faces or cards. Import `cn`.

- [ ] **Step 4: Run, check, commit**

Run: `bunx vitest run src/components/onboarding && bun run check` — expected: PASS, green.

```bash
git add -A && git commit -m "feat(onboarding): face grids for choices, None of these, article and destination cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: `OnboardingScreen` — steps, show.top, the reading default, the taste

**Files:**
- Modify: `src/components/onboarding/onboarding-screen.tsx`, `onboarding-screen.test.tsx`

**Interfaces:**
- Consumes: `shown`, `STEP_OF`, `stepsAsked`, `STEP_COUNT`, `STEP_LABELS`, `defaultReadingAmount`, `buildTaste`, `chosenDestinations`, `OpenedCard`, `faces[*].writing`.
- Produces: `complete.mutateAsync({ …, taste })`; `RevealStep` receives `taste` (Task 15 renders it; until then pass it and ignore).

- [ ] **Step 1: Failing tests**

Append to `src/components/onboarding/onboarding-screen.test.tsx` (it renders the screen with `TEST_BANK` and mocked `api`; follow its helpers for walking questions):

```ts
  it("counts steps, not questions, and skips a step the database cannot ask", async () => {
    // TEST_BANK has no STEP_OF entries → every question is in no step; use a two-step bank.
    const bank: Question[] = [
      { ...TEST_BANK.find((q) => q.id === "rooms")!, id: "wings-1" },
      { ...TEST_BANK.find((q) => q.id === "read")!, id: "read-1" },
    ];
    renderScreen({ bank });
    begin();
    expect(screen.getByText(/^Step 1 of 3/)).toBeInTheDocument();
  });

  it("shows only the top options of a show.top question, ranked by the answers so far", async () => {
    const bank: Question[] = [
      TEST_BANK.find((q) => q.id === "rooms")!,
      { ...TEST_BANK.find((q) => q.id === "rooms")!, id: "playoff", show: { top: 1 }, options: TEST_BANK.find((q) => q.id === "rooms")!.options.filter((o) => o.effects.length > 0) },
    ];
    renderScreen({ bank });
    begin();
    fireEvent.click(screen.getByRole("button", { name: "A garden" }));
    // The playoff shows one option: the garden the reader just scored.
    expect(screen.getByRole("button", { name: "A garden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Space" })).toBeNull();
  });

  it("preselects the reading amount from the cards, and sends the taste with the opened cards (Review Focus 3: after Back and a change, the final answers win)", async () => {
    const bank: Question[] = [
      { ...TEST_BANK.find((q) => q.id === "read")!, id: "read-1" },
      TEST_BANK.find((q) => q.id === "reading-amount")!,
    ];
    const faces = {
      "read-1/essay": { itemId: "e1", writing: { title: "Long", dek: "", minutes: 14, kind: "essay" as const, topicIds: ["astronomy"] } },
      "read-1/curiosity": { itemId: "c1", writing: { title: "Short", dek: "", minutes: 3, kind: "curiosity" as const, topicIds: ["botany"] } },
    };
    renderScreen({ bank, faces });
    begin();
    fireEvent.click(screen.getByRole("button", { name: /Long/ }));
    // One card opened → "a little" preselected on the amount question, button reads Next.
    expect(screen.getByRole("button", { name: "A little" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Short/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await finishToReveal(); // the file's helper: skips About you
    fireEvent.click(screen.getByRole("button", { name: /Start exploring/ }));
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    const sent = completeMock.mock.calls[0]![0];
    expect(sent.taste.opened).toEqual([{ itemId: "c1", title: "Short", kind: "curiosity", minutes: 3 }]);
    expect(sent.writingAmount).toBe("little");
  });
```

Adapt the helper names (`renderScreen`, `begin`, `finishToReveal`, `completeMock`) to the file's own; if a helper does not exist, write it beside the others. Run: `bunx vitest run src/components/onboarding/onboarding-screen.test.tsx` — expected: FAIL.

- [ ] **Step 2: Implement**

In `onboarding-screen.tsx`:

```ts
import { shown } from "~/lib/interview/show";
import { STEP_COUNT, STEP_LABELS, STEP_OF, stepsAsked } from "~/lib/interview/steps";
import { defaultReadingAmount, picksFrom, readingAmountFrom, type Pick } from "~/lib/interview/picks";
import { buildTaste, chosenDestinations, type OpenedCard } from "~/lib/interview/taste";
import { faceKey, type QuestionFaces } from "~/lib/interview/faces";
```

- **Scores so far and the shown question:**

```ts
  const scoresSoFar = useMemo(() => scoreAnswers(bank, answers, listed), [bank, answers, listed]);
  const current = asked[answers.length];
  const onScreen = current ? shown(current, scoresSoFar, listed) : undefined;
```

Render `<QuestionStep question={onScreen} …>` (and key `<Rise>` on `onScreen.id`).

- **Opened cards**, derived from the answers and the faces:

```ts
  /** The article cards opened so far — from the answers, so Back-and-change is honoured. */
  const opened = useMemo((): OpenedCard[] => {
    return answers.flatMap((a) => {
      const q = bank.find((x) => x.id === a.questionId);
      const key = a.keys[0];
      if (!q || !key || key === SKIP) return [];
      const o = q.options.find((x) => x.key === key);
      const w = o?.face?.writing ? faces[faceKey(q.id, key)] : undefined;
      return w?.writing ? [{ itemId: w.itemId, title: w.writing.title, kind: w.writing.kind, minutes: w.writing.minutes }] : [];
    });
  }, [answers, bank, faces]);
  const readingSkipped = answers.filter((a) => {
    const q = bank.find((x) => x.id === a.questionId);
    return q?.options.some((o) => o.face?.writing) && a.keys[0] === SKIP;
  }).length;
```

- **Preselected amount:** where the draft is handed to `QuestionStep`, compute

```ts
  const amountDefault = current?.kind === "amount" ? defaultReadingAmount(opened, readingSkipped) : null;
  const shownDraft = draft ?? (amountDefault ? { questionId: current!.id, keys: [amountDefault] } : undefined);
```

and pass `answer={shownDraft}`, and in the Next/Skip button use `isAnswered(shownDraft)` and `advance(shownDraft)`.

- **Step indicator:** replace the `{answers.length + 1} of {asked.length}` line:

```tsx
  const steps = useMemo(() => stepsAsked(asked), [asked]);
  const stepNow = current ? STEP_OF[current.id] : undefined;
  const stepIndex = stepNow ? steps.indexOf(stepNow) : -1;
  // …
  {stepIndex >= 0 ? `Step ${stepIndex + 1} of ${steps.length + 1} · ${STEP_LABELS[stepNow! - 1]}` : `${answers.length + 1} of ${asked.length}`}
```

(`+ 1` for About you; a test bank with no `STEP_OF` entries keeps the v1 count.)

- **Taste:**

```ts
  const taste = useMemo(
    () => buildTaste({ scores: scoresSoFar, listed, destinations: chosenDestinations(answers), opened }),
    [scoresSoFar, listed, answers, opened],
  );
```

Pass `taste={taste}` to `RevealStep` (Task 15 adds the prop; add it to `RevealStepProps` now as `taste: TasteV1` and leave it unrendered until Task 15 — the test file's `show()` must pass one; use `buildTaste({ scores: new Map(), listed: new Set(), destinations: [], opened: [] })`). In `submit`, add `taste` to `complete.mutateAsync({ … })`.

- **Skip button copy:** `Next` when answered; else `I’d rather look at pictures` on a reading question (`onScreen.options.some((o) => o.face?.writing)`), `Nowhere in particular` on `destinations` (`onScreen.id === "destinations"`), `Skip` otherwise. Put the rule in one small function `forwardLabel(q, answered)` beside `isAnswered`. The e2e helper is updated in Task 16 to accept all four.

- [ ] **Step 3: Run, check, commit**

Run: `bunx vitest run src/components/onboarding && bun run check` — expected: PASS, green.

```bash
git add -A && git commit -m "feat(onboarding): ten steps, the playoff on screen, the reading default, the taste sent with the run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: The reveal — `ExhibitionCard` on the reveal and on `/profile/topics`

**Files:**
- Create: `src/components/onboarding/exhibition-card.tsx`, `exhibition-card.test.tsx`
- Modify: `src/components/onboarding/reveal-step.tsx`, `reveal-step.test.tsx`, `src/components/profile/topics-screen.tsx`, `topics-screen.test.tsx`

**Interfaces:**
- Produces: `ExhibitionCard({ taste, topicLabels }: { taste: TasteV1; topicLabels: ReadonlyMap<string, string> })`.

- [ ] **Step 1: Failing tests**

`src/components/onboarding/exhibition-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TasteV1 } from "~/lib/interview/taste";

import { ExhibitionCard } from "./exhibition-card";

const labels = new Map([["photography", "Photography"], ["engraving", "Engraving"]]);
const taste: TasteV1 = {
  v: 1,
  title: { adjective: "Quiet", noun: "Weathers" },
  wings: ["land", "growing", "creatures"],
  mediums: ["photography", "engraving"],
  temperament: { communal: 0.2, aesthetic: 1, dark: 0.1, thrilling: 0.3, cerebral: 0.6 },
  compass: { wild: 0.6, old: 0.5, still: 0.4, far: 0.3 },
  opened: [
    { itemId: "a", title: "The case for boring buildings", kind: "essay", minutes: 18 },
    { itemId: "b", title: "A tide table", kind: "archive", minutes: 12 },
  ],
  readingMinutes: 15,
};

describe("ExhibitionCard", () => {
  it("names the show, the wings and mediums, and shows the strip, the compass and what you'd open", () => {
    render(<ExhibitionCard taste={taste} topicLabels={labels} />);
    expect(screen.getByRole("heading", { name: "Quiet Weathers" })).toBeInTheDocument();
    expect(screen.getByText("Land, sea & sky · Growing things · Creatures · Photography · Engraving")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Temperament" })).toHaveTextContent("Aesthetic");
    expect(screen.getByRole("meter", { name: "Aesthetic" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText(/You’d travel for wild places over cities/)).toBeInTheDocument();
    expect(screen.getByText("The case for boring buildings")).toBeInTheDocument();
    expect(screen.getByText("You like a long read.")).toBeInTheDocument();
  });
  it("omits the compass and the opened block when there is nothing to show", () => {
    render(<ExhibitionCard taste={{ ...taste, compass: null, opened: [], readingMinutes: null }} topicLabels={labels} />);
    expect(screen.queryByRole("group", { name: "Travel compass" })).toBeNull();
    expect(screen.queryByText(/You’d open/)).toBeNull();
  });
  it("says 'something short' for a short reader and nothing in between", () => {
    const { rerender } = render(<ExhibitionCard taste={{ ...taste, readingMinutes: 3 }} topicLabels={labels} />);
    expect(screen.getByText("You like something short.")).toBeInTheDocument();
    rerender(<ExhibitionCard taste={{ ...taste, readingMinutes: 9 }} topicLabels={labels} />);
    expect(screen.queryByText(/You like/)).toBeNull();
  });
});
```

In `reveal-step.test.tsx`, pass a `taste` in `show()` (the `buildTaste` empty one from Task 14 plus a title) and add: `it("shows the exhibition title above the list", () => { show({ taste: { …empty, title: { adjective: "Quiet", noun: "Weathers" } } }); expect(screen.getByRole("heading", { name: "Quiet Weathers" })).toBeInTheDocument(); })`.

In `topics-screen.test.tsx` (it mocks `api.topics.list/mine.useQuery`; add `taste.useQuery`): one test that with `taste.useQuery` returning the fixture the heading "Quiet Weathers" renders above "Your topics", and one that with `null` it does not.

Run: `bunx vitest run src/components` — expected: FAIL.

- [ ] **Step 2: Implement `ExhibitionCard`**

```tsx
"use client";

import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KIND_LABELS } from "~/server/config/writing";
import { compassSentence } from "~/lib/interview/compass";
import { LONG_READ_MINUTES } from "~/lib/interview/picks";
import type { TasteV1 } from "~/lib/interview/taste";

// The reveal's head (docs/DESIGN_first-exhibition.md §6) — the reader's first exhibition, named:
// title, subtitle, the temperament strip, the travel compass and "You’d open". Rendered above
// the levels list on the reveal and again on /profile/topics from the stored taste. Set in Sora
// like everything else (Ben: no serif). Pure presentation; every number arrives in `taste`.

/** "You like something short" at or under this mean; "a long read" at or over LONG_READ_MINUTES + 2. */
const SHORT_READER_MAX = 4;
const LONG_READER_MIN = LONG_READ_MINUTES + 2;

const EYEBROW = "text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase";

function Bar({ label, value, gloss }: { label: string; value: number; gloss?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3" title={gloss}>
      <span className="text-ink/82 w-[92px] shrink-0 text-[13px]">{label}</span>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="bg-ink/8 h-[6px] flex-1 overflow-hidden rounded-full">
        <div className="bg-accent h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A bipolar bar: −1 at the left pole, +1 at the right. */
function Pole({ left, right, value }: { left: string; right: string; value: number }) {
  const pct = Math.round(((value + 1) / 2) * 100);
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="text-ink/62 w-[52px] shrink-0 text-right">{left}</span>
      <div className="bg-ink/8 relative h-[6px] flex-1 rounded-full">
        <span className="bg-accent absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pct}%` }} />
      </div>
      <span className="text-ink/62 w-[52px] shrink-0">{right}</span>
    </div>
  );
}

export function ExhibitionCard({ taste, topicLabels }: { taste: TasteV1; topicLabels: ReadonlyMap<string, string> }) {
  const wingLabel = (id: string) => WINGS.find((w) => w.id === id)?.label ?? id;
  const subtitle = [...taste.wings.map(wingLabel), ...taste.mediums.map((id) => topicLabels.get(id) ?? id)].join(" · ");
  const sentence = taste.compass ? compassSentence(taste.compass) : "";
  const readerLine =
    taste.readingMinutes === null ? null
    : taste.readingMinutes >= LONG_READER_MIN ? "You like a long read."
    : taste.readingMinutes <= SHORT_READER_MAX ? "You like something short."
    : null;

  return (
    <section aria-label="Your first exhibition" className="border-hairline border-ink/12 rounded-card p-5">
      <p className={EYEBROW}>Your first exhibition</p>
      <h2 className="text-ink-hi mt-2 text-[30px] leading-[1.1] font-semibold tracking-[-0.4px]">
        {taste.title.adjective} {taste.title.noun}
      </h2>
      {subtitle && <p className="text-ink/62 mt-2 text-[14px] leading-[1.5]">{subtitle}</p>}

      <div role="group" aria-label="Temperament" className="mt-6 flex flex-col gap-2">
        <p className={EYEBROW}>Temperament</p>
        {TEMPERAMENT_DIMENSIONS.map((d) => <Bar key={d.id} label={d.label} gloss={d.gloss} value={taste.temperament[d.id]} />)}
      </div>

      {taste.compass && (
        <div role="group" aria-label="Travel compass" className="mt-6 flex flex-col gap-2">
          <p className={EYEBROW}>Travel compass</p>
          <Pole left="Built" right="Wild" value={taste.compass.wild} />
          <Pole left="New" right="Old" value={taste.compass.old} />
          <Pole left="Lively" right="Still" value={taste.compass.still} />
          <Pole left="Near" right="Far" value={taste.compass.far} />
          {sentence && <p className="text-ink/82 mt-1 text-[14px] leading-[1.5]">{sentence}</p>}
        </div>
      )}

      {taste.opened.length > 0 && (
        <div className="mt-6">
          <p className={EYEBROW}>You’d open</p>
          <ul className="mt-2 flex flex-col gap-2">
            {taste.opened.map((o) => (
              <li key={o.itemId} className="text-[14px] leading-[1.4]">
                <span className="text-ink/45 font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
                  {WRITING_KIND_LABELS[o.kind]} · {o.minutes} min
                </span>
                <br />
                <span className="text-ink-hi">{o.title}</span>
              </li>
            ))}
          </ul>
          {readerLine && <p className="text-ink/82 mt-2 text-[14px]">{readerLine}</p>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Mount it**

`reveal-step.tsx`: add `taste: TasteV1` to the props; render `<ExhibitionCard taste={taste} topicLabels={new Map(topics.map((t) => [t.id, t.label]))} />` **above** the `<h1>Here’s where we’ll start</h1>` inside `data-step="reveal"`, with `mb-8`.

`topics-screen.tsx`: `const taste = api.topics.taste.useQuery();` and, before the "Add a topic" section, `{taste.data && (<Rise><div className="px-5 pt-5"><ExhibitionCard taste={taste.data} topicLabels={new Map(all.map((t) => [t.id, t.label]))} /></div></Rise>)}`. Prefetch it in `src/app/profile/topics/page.tsx` beside `topics.mine`.

`onboarding-screen.tsx`: `await utils.invalidate()` already covers `topics.taste` after a retake.

- [ ] **Step 4: Run, check, commit**

Run: `bunx vitest run src/components && bun run check` — expected: PASS, green.

```bash
git add -A && git commit -m "feat(reveal): the exhibition card — title, temperament, travel compass, what you'd open — on the reveal and the profile

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: End to end — local corpus and CI shape

**Files:**
- Modify: `e2e/support.ts` (`answerQuestionnaire`), `e2e/onboarding.spec.ts`

- [ ] **Step 1: The helper accepts the three forward buttons**

In `answerQuestionnaire`, the "no hits" branch and the amount/text branch click `Skip`; with the reading default preselected the button reads `Next`, on a reading screen `I’d rather look at pictures`, on destinations `Nowhere in particular`. Replace both `getByRole("button", { name: "Skip", exact: true })` clicks inside the loop with:

```ts
      await page.getByRole("button", { name: /^(Skip|Next|I’d rather look at pictures|Nowhere in particular)$/ }).click();
```

(Leave the About-you `Skip` after the loop as is.) Add a comment: a preselected amount answers as `Next`.

- [ ] **Step 2: A spec for the reveal's head**

Append to `e2e/onboarding.spec.ts`:

```ts
test("the reveal names a first exhibition, and the profile shows it again", async ({ page }) => {
  await signUpFresh(page); // the file's own sign-up helper
  await answerQuestionnaire(page, ["astronomy", "botany", "music"]);
  const reveal = page.locator('[data-step="reveal"]');
  await expect(reveal.getByRole("heading", { level: 2 })).toHaveText(/\S+ \S+/);
  await expect(reveal.getByRole("group", { name: "Temperament" })).toBeVisible();
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.waitForURL("/feed");
  await page.goto("/profile/topics");
  await expect(page.getByRole("region", { name: "Your first exhibition" })).toBeVisible();
});
```

- [ ] **Step 3: Run locally against the real corpus**

Run: `lsof -ti:3000 | xargs -r kill; bun run e2e:prod` — expected: all green (phone + desktop projects). A red `cursor-stability` in the Vitest suites is the known un-homed-fixture race (CLAUDE.md), not this branch.

- [ ] **Step 4: Run in CI's shape**

```bash
docker run -d --rm --name ambit-ci-pg -e POSTGRES_USER=ambit -e POSTGRES_PASSWORD=ambit -e POSTGRES_DB=ambit -p 5433:5432 postgres:17-alpine
export DATABASE_URL=postgres://ambit:ambit@localhost:5433/ambit
bun run db:migrate && bun run db:seed && bun run build && E2E_PROD=1 bunx playwright test --workers 1
docker stop ambit-ci-pg
```

Expected: green. The sixteen-topic database asks the three wing screens, the playoff (with the live wings), the pairs whose faces exist, the reading screens as text cards, the amount, the words; `completeOnboarding` reaches astronomy + botany + music.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(e2e): the questionnaire's forward buttons and the exhibition card, both database shapes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Docs and the log

**Files:**
- Modify: `SPEC.md` (§3.2, §5.3a, §7's `onboarding.complete`/`topics.taste` rows, §8.2's `/onboarding` and `/profile/topics` entries), `CLAUDE.md` (one Architecture bullet), `docs/PLAN_onboarding-questionnaire.md` (§3 supersession note), `docs/DESIGN_first-exhibition.md` (status line), `log.md`

- [ ] **Step 1: SPEC**

§3.2: the questionnaire is **First Exhibition** (10-04-26): eighteen picture-led questions in ten steps — three wing screens and a playoff, six same-subject pairs, a ten-picture keep grid, two article-card reading screens, twelve destinations, "rather not", the reading amount, two optional free-text questions last — then About you and the reveal, which now names the reader's first exhibition over a temperament strip and a travel compass. §5.3a: add the `user_taste` table block (copy the SQL from Task 12's migration) and a line that the answer log is the source of truth and the taste is the stored view. §7: `onboarding.complete` input gains `taste?`; new row `topics.taste · query · — · TasteV1 | null`. §8.2: `/onboarding` and `/profile/topics` paragraphs gain one sentence each.

- [ ] **Step 2: CLAUDE.md**

Add an Architecture bullet after "A signed-out visit is dealt a persona":

> **Onboarding is First Exhibition — 10-04-26** (design `docs/DESIGN_first-exhibition.md`, plan `docs/PLAN_first-exhibition.md`; the study it adapts is `docs/first-exhibition/`). Bank v2: eighteen picture-led questions in ten steps; the playoff is a `show.top` display rule on a static `choice` (`lib/interview/show.ts`), not a question kind; reading cards are real articles (`question-faces.ts`'s writing branch) and score the item's memberships plus its kind's form topic (`KIND_FORM`); the reveal's title/temperament/compass are pure (`exhibition.ts`, `temperament.ts`, `compass.ts`) and stored as `user_taste.taste` jsonb, client-computed and server-validated (v1's rule: what is stored is what the reveal showed). Two new facets, `tradition` and `form`; **hand-added topics live in `config/hand-topics.ts`** (`TOPICS` is pinned to the sixteen) and are seeded at tier `grown` — ingest reads their queries off the row, and they have no graph edges until `graph:rebuild` runs after items arrive (drift stays put meanwhile).

- [ ] **Step 3: Supersession and status**

Top of `docs/PLAN_onboarding-questionnaire.md` §3's bank table: `> **Superseded 10-04-26** by bank v2 — \`docs/DESIGN_first-exhibition.md\` §1.` Top of `docs/DESIGN_first-exhibition.md`: a status line `**Built 10-xx-26 on \`feat/first-exhibition\`** (plan: \`docs/PLAN_first-exhibition.md\`).`

- [ ] **Step 4: `log.md`**

A day entry (newest on top, under the month) with `**Shipped:**` (the tasks), `**Decisions:**` (Ben's ten, briefly), `**Findings:**` (the proposal's group ids; `TOPICS` pinned; the three forward-button names the e2e helper now accepts; anything the picks pass turned up), `**Open / next:**` (Ben's phone + 1440 look; merge; deploy runs migration 0013 + `db:seed`; after two ingests `graph:rebuild --confirm`; vocabulary round two; the loader sub-project; the real "never show me this" filter). End with the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>`, or omit it if the script exits non-zero.

- [ ] **Step 5: Final check and commit**

Run: `bun run check` — expected: green.

```bash
git add -A && git commit -m "docs: First Exhibition — SPEC, CLAUDE.md, supersession note, log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then: push the branch and hand it to Ben for the phone and 1440 look. Do not merge; do not deploy.
