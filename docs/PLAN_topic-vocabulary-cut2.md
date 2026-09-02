# Topic vocabulary growth — Cut 2a: promotion, and making un-homed items reachable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-02-26 by a planning session (Opus 5), from `docs/DESIGN_topic-vocabulary-growth.md`
§11 plus a live measurement pass over the local corpus (§0 — every number below was queried, not
estimated). **For:** a cold session on a cheaper model.

**Goal:** Grow the topic vocabulary from 16 to ~50–100 by mining the corpus's own tags, so the
**3,741 un-homed items (16% of the corpus) that Cut 1 stored but the feed cannot see** become
reachable — without touching the feed engine, the drift feel Ben tuned in Phase 0.5, or the
onboarding chip grid.

**Architecture:** Four moves, in order. (1) `topic` gains a **`tier`** column so the onboarding
grid keeps showing a curated set while the vocabulary grows behind it. (2) `scripts/mine-topics.ts`
ranks tag candidates and writes a **proposal file Ben verdicts by hand**. (3)
`scripts/promote-topics.ts` reads the verdict and, for each kept tag, inserts a `topic` row, writes
`item_topic` rows with **`origin: "tag"`** for every item carrying that tag, and sets
`item.topic_id` **only on items that were un-homed** — which is what makes them visible while the
feed still reads `topic_id`. (4) `scripts/rebuild-topic-graph.ts` regenerates
`topic-graph.json` as a **hybrid**: the sixteen existing embedding rows are preserved byte-for-byte,
and only edges touching a new topic are computed from tag co-occurrence, rescaled to the embedding
graph's spread.

**Tech Stack:** Bun 1.4, TypeScript, Drizzle + `drizzle-kit generate`, Postgres 17, Vitest. No new
dependencies. No embeddings, no pgvector, no LLM call.

**Spec:** `docs/DESIGN_topic-vocabulary-growth.md` (§1–§2 for the principle, §11 for Cut 2's scope),
and `docs/PLAN_topic-vocabulary-cut1.md` / `docs/WALKTHROUGH_topic-vocabulary-cut1.md` for what Cut
1 already built and deliberately left.

---

## Scope: this is Cut 2**a**, and that is a deliberate split

The design's §11 lists five things under "Cut 2". This plan does three of them and **defers two**,
because the split falls on a clean line: everything here delivers the product value (the backlog
becomes visible) with **no change to `feed.ts`**, while the deferred half is a refactor with no
user-visible effect.

**In this plan (Cut 2a):** tag mining · the proposal list and Ben's verdict · the promotion backfill
· graph rows for new topics · the onboarding tier.

**Deferred to Cut 2b (write a separate plan):** the **`topic_edge` table** replacing
`topic-graph.json`, and **moving the feed onto the `item_topic` join** so an item can be drawn under
*any* of its topics rather than only its display topic, then dropping `item.topic_id`.

**Why the deferral is safe.** The design's reason for `topic_edge` is scale: 16 topics = 240 cells,
1,000 topics ≈ 1M cells and ~100 MB of JSON imported at module load in `feed.ts:16`. At the size
this plan produces the JSON is still small — **116 topics ≈ 13,340 entries ≈ 530 KB** — so the
checked-in artifact keeps working, and `rebuild-topic-graph.ts` (Task 5) is written so that Cut 2b
can point it at a table instead of a file without changing how it computes anything. Cut 2b becomes
necessary when the vocabulary passes roughly 300 topics; it is not necessary at 116.

**Why promotion alone makes items visible.** Cut 1 made `item.topic_id` the *display* topic and
`item_topic` the membership. An un-homed item has `topic_id NULL`, which matches neither `inArray`
nor `eq`, so the feed cannot see it. Setting `topic_id` on exactly those items — and never on an
item that already has one — makes them drawable immediately, with `feed.ts` untouched. Cut 2b then
generalises reachability from one topic per item to all of them.

---

## Global Constraints

- **Never retract a membership.** Cut 1's rule and it still holds: `item_topic` is additive.
  Promotion only ever INSERTs rows. Nothing in this plan deletes an `item_topic` row, and nothing
  clears an `item.topic_id` that is already set.
- **`origin` must be honest.** Every membership this plan writes is `origin: "tag"` — the third
  value in `ItemTopicOrigin`, added by Cut 1 for exactly this and unused until now. Never write
  `"seed"` or `"curator"` from a promotion.
- **The sixteen existing graph rows are not recomputed.** Ben tuned the drift feel against them in
  Phase 0.5. Task 5 preserves their `sim` values exactly and only *appends* neighbours.
- **Onboarding must not grow.** `topics.list` backs the onboarding chip grid; a 116-chip grid is a
  broken screen. `listTopics()` returns tier `core` only, from Task 1 onward.
- **Ben verdicts the topic list by hand.** The mining script proposes; it never inserts. A topic
  entering Ambit's vocabulary is a product decision, and the whole point of the proposal file is
  that a person reads it.
- **Every script that writes is `--dry-run` by default** and needs `--confirm` to touch a row —
  the convention `bun run e2e:clean` and `bun run renormalize` already use.
- **Shared checkout.** Other sessions work in `~/Dev/ambit`. Run `git branch --show-current && git
  status` immediately before every `git add`; stage by name; never `git add -A`. If the tree is on
  another branch or carries edits you did not make, **stop and say so**.
- Gates before every commit: `bunx eslint <files> && bunx prettier --check <files>`, plus
  `bun run typecheck` and `bun run test` at task ends (~35 s).
- Comment generously — this repo is Ben's teaching vehicle.

---

## 0. What the planning session measured (09-02-26) — read, don't redo

Every number here came from a query against the local corpus at `main` = `6e42058`. Re-measure only
if a step's expected output disagrees with what you see.

### 0.1 The backlog this plan exists to drain

```
source                 rows   un-homed
thisiscolossal         8737       2658
thingsorganizedneatly  1720        829
pdr                    1624        186
doorofperception        387         68
(all search sources)  12612          0
TOTAL                 23516       3741   = 16% of the corpus, stored but unreachable
```

Un-homed items are **not low quality** — PDR's average 7.88 against 8.39 for its homed rows. They
are items no existing topic honestly fits.

### 0.2 The candidate curve — why the verdict list is ~86 long

Candidates ranked by `un` (how many currently-invisible items carry the tag), filtered by how many
distinct sources use it:

```
  minUn   1src   2src   3src
      5    469    300    175
     10    242    177    114
     15    152    115     84
     20    113     86     68
     30     68     48     41
     40     47     36     31
     60     31     24     20
     100    15     11     10
```

And what each set actually rescues from the 3,741:

```
  minUn>= 40 minSrc>=2:    36 topics  rescues 2614 / 3741  (70%)
  minUn>= 20 minSrc>=2:    86 topics  rescues 2847 / 3741  (76%)   ← this plan's default
  minUn>= 15 minSrc>=2:   115 topics  rescues 2931 / 3741  (78%)
  minUn>= 10 minSrc>=2:   177 topics  rescues 3014 / 3741  (81%)
  minUn>= 10 minSrc>=1:   242 topics  rescues 3451 / 3741  (92%)   ← but see junk, below
  minUn>=  5 minSrc>=2:   300 topics  rescues 3080 / 3741  (82%)
```

**Sharp diminishing returns.** 36 topics get 70%; another 50 topics buy 6 more points. Ben chose
"mine broadly and verdict the list", so the default threshold is `minUn>=20, minSrc>=2` → **86
candidates, 76%**. The knobs are flags, so a different call is one argument away.

### 0.3 The top candidates, as measured

```
   738  sculpture      4 src        197  paper          2 src
   416  installation   2 src        180  humor          1 src
   352  video          2 src        179  wood           2 src
   344  submission     1 src  JUNK  178  street art     1 src
   310  painting       4 src        162  light          4 src
   243  food           3 src        132  landscapes     2 src
```

**`sculpture` at 738 across four sources is the single clearest missing topic in the corpus.**

### 0.4 The axis question, and why it turned out not to be one

An earlier session flagged a risk that promoting `sculpture`/`painting` would grow the vocabulary
along a *medium* axis while the sixteen are a *subject* axis. **Checking the actual sixteen
retired that concern:** `ceramics`, `textiles`, `typography`, `cartography` and `portraiture` are
already media or forms. The sixteen were always mixed. The real test is not subject-vs-medium but
**"does this name a kind of thing a person could be curious about"** — which `sculpture`,
`painting` and `food` pass and `20th century` fails. That is the instruction on the verdict file.

### 0.5 Junk, and why `minSrc>=2` is not sufficient on its own

Single-source tags with `un>=30` — one blog's house vocabulary:

```
submission(344) · humor(180) · street art(178) · public art(114) · stop motion(88) ·
multiples(76) · short film(72) · sponsor(52) · art history(47) · 20th century(46) ·
book art(44) · site-specific(38) · gifs(37) · climate crisis(36) · science & medicine(34) ·
origami(34) · images(33) · interactive(32) · kinetic(31) · timelapse(30)
```

Two facts here shape the design:
- **`submission` (344) and `sponsor` (52) are administrative**, not content. They need a stopword
  list; no threshold excludes them, because they are genuinely frequent.
- **`minSrc>=2` also rejects good topics.** `street art` (178) and `public art` (114) are real, and
  `street art` becomes two-source now that `streetartnews` has landed (merged `6e42058`). So the
  rule is **`minSrc>=2` OR present in an explicit allow-list**, and single-source candidates are
  still *shown* in the proposal file, in a separate section, so Ben can rescue them.

### 0.6 The graph: co-occurrence validated against the shipped embedding graph

Tag-co-occurrence similarity (IDF-weighted cosine over each topic's tag profile, mean-centred per
row) was computed for the existing sixteen and compared to `topic-graph.json`:

- **mean Spearman ρ = 0.502**, **top-3 neighbour overlap 24/48 = 50%**.
- Strong rows: `astronomy` 3/3 ρ=0.81 · `the-ocean` ρ=0.80 · `cartography` ρ=0.76 · `poetry` ρ=0.76.
- Weak rows: `botany` ρ=−0.24 · `architecture` ρ=0.24 · `typography` ρ=0.26 · `music` 0/3.

**Read:** co-occurrence is real signal, well above chance, but **not** a drop-in replacement. Hence
the hybrid — Ben's call, 09-02-26.

**And the trap that comes with it:** the two scales differ by ~4×.

```
embedding      sim range  -0.3842 .. 0.3483   (168 of 240 negative)
co-occurrence  sim range  -0.0332 .. 0.0931   (141 of 240 negative)
```

`pickDrift` softmaxes over positive neighbours with a temperature knob. **Feeding it a 4× flatter
distribution makes drift near-uniform** — a silent regression nobody would see in a test. Task 5
therefore rescales every co-occurrence row to the embedding graph's per-row standard deviation
before writing it. This is the single most important detail in this plan.

---

## 1. Decisions

**Ben's (09-02-26):**
1. **Mine broadly and verdict the list** — a long ranked proposal (50–100), not a hand-picked handful.
2. **Hybrid graph** — the sixteen embedding rows stay exactly as tuned; co-occurrence supplies only
   the edges touching new topics.

**The planner's, under those — flip before executing, not during:**
- **Cut 2 splits into 2a and 2b** (see Scope above). This plan is 2a.
- **Promotion sets `topic_id` only where it is NULL.** An item that already displays under
  `mythology` keeps displaying there and merely *gains* a membership.
- **`topic.tier`** is `"core" | "grown"`, not a boolean, because Cut 3's "curated top tier of
  chips" will want a third value and a boolean would have to be migrated again.
- **New topics get `seedQueries: {}`.** They are vocabulary for classifying walk sources, not
  queries for search sources — a search source needs a query, and inventing one per promoted topic
  would put unreviewed queries in front of five museum APIs. Ingest already reads
  `seedQueries[sourceId] ?? []`.
- **The proposal file is Markdown with a checkbox per candidate**, not JSON — Ben reads it in an
  editor and the diff is the verdict.
- **A promoted topic's label is title-cased from the tag**, and Ben may overwrite it in the
  proposal file; the promote script reads the label back from that file.

---

## 2. File map

| path | responsibility |
|---|---|
| `src/server/db/schema.ts` — modify (Task 1) | `topic.tier` column + `TopicTier` type |
| `drizzle/0005_topic_tier.sql` — **generated** (Task 1) | the migration, with the backfill setting the sixteen to `core` |
| `src/server/db/topics.ts` — modify (Task 1) | `listTopics()` filters to `core`; new `listAllTopics()` |
| `src/server/db/topics.test.ts` — modify (Task 1) | both reads |
| `scripts/seed-topics.ts` — modify (Task 1) | seeds the sixteen as `core` |
| `src/server/services/topic-mining.ts` — **create** (Task 2) | the pure ranking logic — the unit-test surface |
| `src/server/services/topic-mining.test.ts` — **create** (Task 2) | fixture tests for it |
| `scripts/mine-topics.ts` — **create** (Task 3) | reads the corpus, writes `docs/topic-proposals.md` |
| `scripts/promote-topics.ts` — **create** (Task 4) | reads the verdict, inserts topics + memberships |
| `scripts/rebuild-topic-graph.ts` — **create** (Task 5) | the hybrid graph rebuild |
| `src/server/config/topic-graph.json` — regenerated (Task 6) | the artifact, now covering every topic |
| `SPEC.md` §5.2, §9 · `CLAUDE.md` · `log.md` — modify (Task 7) | the contract and the narrative |

---

### Task 1: `topic.tier`, and protecting the onboarding grid

The vocabulary is about to grow 6×. `topics.list` backs the onboarding chip grid, so this must land
**before** any topic is inserted, or the first promotion breaks that screen.

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/db/topics.ts`, `src/server/db/topics.test.ts`, `scripts/seed-topics.ts`
- Create (generated): `drizzle/0005_topic_tier.sql`

**Interfaces:**
- Produces: `TopicTier = "core" | "grown"`; `topic.tier` column; `listTopics(): Promise<Topic[]>`
  (core only, unchanged signature); `listAllTopics(): Promise<Topic[]>`.

- [ ] **Step 1: Branch**

```bash
git branch --show-current && git status --short   # expect main, clean
git checkout -b feat/topic-vocab-cut2
```

- [ ] **Step 2: Write the failing test** — append inside `describe("listTopics")` in `src/server/db/topics.test.ts`:

```ts
  it("returns only core topics — the onboarding grid must not grow with the vocabulary", async () => {
    // Cut 2a grows the vocabulary from 16 to ~100. The chip grid is a curated tier, not a dump of
    // everything the corpus knows about; `listAllTopics` is what wants the whole set.
    const core = await listTopics();
    expect(core.every((t) => t.tier === "core")).toBe(true);
    const all = await listAllTopics();
    expect(all.length).toBeGreaterThanOrEqual(core.length);
  });
```

- [ ] **Step 3: Run it, watch it fail**

Run: `bunx vitest run src/server/db/topics.test.ts`
Expected: FAIL — `listAllTopics is not a function`.

- [ ] **Step 4: Add the column** — in `src/server/db/schema.ts`, above `export const topic`:

```ts
/** Which tier of the vocabulary a topic belongs to (Cut 2a, 09-02-26).
 *
 *  `core` — the sixteen Ambit shipped with. These are the onboarding chip grid, and they are the
 *  rows whose adjacency was tuned by hand in Phase 0.5.
 *  `grown` — promoted from corpus tags by scripts/promote-topics.ts. Real topics the feed draws
 *  from through DRIFT and JUMP, deliberately NOT offered as onboarding chips: a hundred-chip grid
 *  is a broken screen, and Cut 3 is where onboarding learns to scale (DESIGN §11).
 *
 *  A string union rather than a boolean because Cut 3 wants a third value (a curated middle tier),
 *  and a boolean would have to be migrated again to get one. */
export type TopicTier = "core" | "grown";
```

and inside the table:

```ts
  seedQueries: jsonb("seed_queries").$type<SeedQueries>().notNull(),
  // Defaulted in SQL so the migration backfills every existing row to `core` — which is exactly
  // right, since every row that exists when this lands IS one of the sixteen.
  tier: text("tier").$type<TopicTier>().notNull().default("core"),
```

- [ ] **Step 5: Generate the migration**

Run: `bunx drizzle-kit generate --name topic_tier`
Expected: `drizzle/0005_topic_tier.sql` containing an `ALTER TABLE "topic" ADD COLUMN "tier" text DEFAULT 'core' NOT NULL;`. Open it and confirm that is what it says — if drizzle-kit emits a nullable column plus a separate update, that is also fine, but the column must end up `NOT NULL DEFAULT 'core'`.

- [ ] **Step 6: Apply it and confirm the sixteen are core**

```bash
bun run db:migrate
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select tier, count(*)::int n from topic group by 1`); await sql.end()'
```

Expected: one row, `tier: "core"`, `n: 18` (the sixteen plus the two `test-feed-topic-*` rows the e2e suite leaves behind — harmless, and they are already excluded wherever it matters by id prefix).

- [ ] **Step 7: Split the two reads** — in `src/server/db/topics.ts`, replace the body of `listTopics` and add its sibling:

```ts
/**
 * The topics the onboarding chip grid offers — the `core` tier only.
 *
 * **This deliberately does not return every topic.** Cut 2a (09-02-26) grew the vocabulary from
 * sixteen to roughly a hundred by mining the corpus's own tags, and a hundred-chip onboarding grid
 * is a broken screen. The grown tier is still fully live in the feed: DRIFT and JUMP reach it
 * through the adjacency graph, and a promoted topic's items are drawn exactly like any other's.
 * What the grown tier is not is a thing we ask a new user to pick from. See
 * docs/DESIGN_topic-vocabulary-growth.md §11 — onboarding at scale is Cut 3's problem.
 */
export async function listTopics(): Promise<Topic[]> {
  const { db } = await import("./client");
  return db.select().from(topic).where(eq(topic.tier, "core")).orderBy(topic.label);
}

/** Every topic, both tiers — for the graph rebuild, the mining report, and anything auditing the
 *  whole vocabulary. Never wire this to the onboarding grid; that is what listTopics is for. */
export async function listAllTopics(): Promise<Topic[]> {
  const { db } = await import("./client");
  return db.select().from(topic).orderBy(topic.label);
}
```

Add `listAllTopics` to the test file's import.

- [ ] **Step 8: Seed the sixteen as core** — in `scripts/seed-topics.ts`, add `tier: "core"` to the
  inserted row and to the `set` clause of the upsert, so a re-seed cannot silently demote a topic.

- [ ] **Step 9: Run the tests and the gates**

Run: `bunx vitest run src/server/db/topics.test.ts && bun run typecheck && bunx eslint src/server/db/schema.ts src/server/db/topics.ts src/server/db/topics.test.ts scripts/seed-topics.ts && bunx prettier --check src/server/db/schema.ts src/server/db/topics.ts src/server/db/topics.test.ts scripts/seed-topics.ts`
Expected: PASS, clean.

Run: `bun run test`
Expected: all green. A red Postgres-backed test on a busy machine is not your change (CLAUDE.md).

- [ ] **Step 10: Commit**

```bash
git branch --show-current && git status --short
git add src/server/db/schema.ts src/server/db/topics.ts src/server/db/topics.test.ts scripts/seed-topics.ts drizzle/
git commit -m "feat(topics): topic.tier — the vocabulary can grow without growing the onboarding grid"
```

---

### Task 2: The mining logic (pure, TDD)

**Files:**
- Create: `src/server/services/topic-mining.ts`, `src/server/services/topic-mining.test.ts`

**Interfaces:**
- Produces:
  - `interface TagStat { tag: string; total: number; unhomed: number; sources: string[] }`
  - `interface MiningOpts { minUnhomed: number; minSources: number; allow: string[]; stopwords: string[] }`
  - `DEFAULT_MINING: MiningOpts`
  - `tallyTags(items: { tags: string[]; source: string; homed: boolean }[]): TagStat[]`
  - `rankCandidates(stats: TagStat[], existing: string[], opts?: MiningOpts): { promoted: TagStat[]; singleSource: TagStat[] }`
  - `topicIdFor(tag: string): string`, `topicLabelFor(tag: string): string`

- [ ] **Step 1: Write the failing tests** — create `src/server/services/topic-mining.test.ts`:

```ts
// Cut 2a's ranking, as a pure function over tag statistics — no DB, no I/O. scripts/mine-topics.ts
// is the thin shell that reads the corpus and prints the report; everything worth pinning is here.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINING,
  rankCandidates,
  tallyTags,
  topicIdFor,
  topicLabelFor,
  type TagStat,
} from "./topic-mining";

const item = (source: string, homed: boolean, ...tags: string[]) => ({ source, homed, tags });

describe("tallyTags", () => {
  it("counts total and un-homed separately and remembers which sources used a tag", () => {
    const stats = tallyTags([
      item("pdr", true, "sculpture", "bronze"),
      item("pdr", false, "sculpture"),
      item("thisiscolossal", false, "sculpture"),
    ]);
    const s = stats.find((x) => x.tag === "sculpture")!;
    expect(s.total).toBe(3);
    expect(s.unhomed).toBe(2);
    expect(s.sources.sort()).toEqual(["pdr", "thisiscolossal"]);
    expect(stats.find((x) => x.tag === "bronze")!.unhomed).toBe(0);
  });
});

describe("rankCandidates", () => {
  const stats: TagStat[] = [
    { tag: "sculpture", total: 900, unhomed: 738, sources: ["pdr", "thisiscolossal", "met", "aic"] },
    { tag: "submission", total: 344, unhomed: 344, sources: ["thisiscolossal"] },
    { tag: "street art", total: 200, unhomed: 178, sources: ["thisiscolossal"] },
    { tag: "mythology", total: 500, unhomed: 40, sources: ["pdr", "met"] },
    { tag: "rare", total: 8, unhomed: 6, sources: ["pdr", "met"] },
  ];

  it("promotes a multi-source tag that clears the un-homed floor", () => {
    const { promoted } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).toContain("sculpture");
  });

  it("drops an administrative stopword however frequent it is", () => {
    const { promoted, singleSource } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("submission");
    expect(singleSource.map((p) => p.tag)).not.toContain("submission");
  });

  it("never proposes a tag that is already a topic", () => {
    const { promoted } = rankCandidates(stats, ["mythology"], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("mythology");
  });

  it("sets a single-source tag aside rather than dropping it, so it can be rescued by hand", () => {
    const { promoted, singleSource } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("street art");
    expect(singleSource.map((p) => p.tag)).toContain("street art");
  });

  it("promotes a single-source tag that is explicitly allowed", () => {
    const { promoted } = rankCandidates(stats, [], { ...DEFAULT_MINING, allow: ["street art"] });
    expect(promoted.map((p) => p.tag)).toContain("street art");
  });

  it("drops anything under the un-homed floor, and ranks by un-homed descending", () => {
    const { promoted } = rankCandidates(stats, [], DEFAULT_MINING);
    expect(promoted.map((p) => p.tag)).not.toContain("rare");
    const un = promoted.map((p) => p.unhomed);
    expect([...un].sort((a, b) => b - a)).toEqual(un);
  });
});

describe("topicIdFor / topicLabelFor", () => {
  it("slugifies a tag into an id and title-cases it into a label", () => {
    expect(topicIdFor("street art")).toBe("street-art");
    expect(topicIdFor("Found Objects")).toBe("found-objects");
    expect(topicIdFor("art & illustration")).toBe("art-illustration");
    expect(topicLabelFor("street art")).toBe("Street Art");
    expect(topicLabelFor("art & illustration")).toBe("Art & Illustration");
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `bunx vitest run src/server/services/topic-mining.test.ts`
Expected: FAIL — `Cannot find module './topic-mining'`.

- [ ] **Step 3: Implement** — create `src/server/services/topic-mining.ts`:

```ts
// Cut 2a's tag mining (docs/PLAN_topic-vocabulary-cut2.md; the principle is
// docs/DESIGN_topic-vocabulary-growth.md §1). Pure functions over tag statistics: the corpus read
// and the report live in scripts/mine-topics.ts, so everything here is unit-testable without a DB.
//
// **What this is for.** Cut 1 stores a walk item even when none of the sixteen topics fits it, with
// `topic_id` NULL — 3,741 items, 16% of the corpus, invisible to the feed. Those items' own tags
// are the evidence for what the vocabulary is missing. This ranks that evidence; a person decides.
//
// **Why it never inserts anything.** A topic entering Ambit's vocabulary is a product decision, and
// tag frequency is a proposal, not a verdict. The script writes a Markdown file with a checkbox per
// candidate and Ben's edit to that file IS the decision (scripts/promote-topics.ts reads it back).

/** One tag's evidence: how often it appears at all, how often on an item the feed cannot see, and
 *  which sources use it. `unhomed` is the ranking signal — it is literally "how many invisible
 *  items would this topic rescue". */
export interface TagStat {
  tag: string;
  total: number;
  unhomed: number;
  sources: string[];
}

export interface MiningOpts {
  /** Floor on `unhomed`. See the plan's §0.2 curve: 40 → 36 topics / 70% of the backlog, 20 → 86
   *  topics / 76%. Sharp diminishing returns past this. */
  minUnhomed: number;
  /** How many distinct sources must use a tag before it is a *shared* vocabulary rather than one
   *  blog's house style. 2,658 of the 3,741 un-homed items are Colossal's, so unfiltered mining
   *  would elect Colossal's vocabulary as Ambit's. */
  minSources: number;
  /** Tags that bypass `minSources` — real topics that happen to live on one source today
   *  (`street art` was single-source until streetartnews landed). */
  allow: string[];
  /** Tags that are never topics however frequent: administrative blog vocabulary. `submission`
   *  (344 un-homed items) and `sponsor` (52) are the ones the corpus actually contains — no
   *  threshold excludes them, because they are genuinely common. */
  stopwords: string[];
}

export const DEFAULT_MINING: MiningOpts = {
  minUnhomed: 20,
  minSources: 2,
  allow: [],
  stopwords: [
    "submission",
    "submissions",
    "sponsor",
    "sponsored",
    "images",
    "image",
    "photo",
    "photos",
    "video", // the *medium* of a post, not what it is about — see plan §0.4's test
    "art",
    "design",
    "misc",
    "miscellaneous",
    "uncategorized",
    "other",
    "featured",
    "news",
    "update",
    "updates",
  ],
};

export function tallyTags(
  items: { tags: string[]; source: string; homed: boolean }[],
): TagStat[] {
  const acc = new Map<string, { total: number; unhomed: number; sources: Set<string> }>();
  for (const it of items) {
    for (const tag of it.tags) {
      const e = acc.get(tag) ?? { total: 0, unhomed: 0, sources: new Set<string>() };
      e.total++;
      if (!it.homed) e.unhomed++;
      e.sources.add(it.source);
      acc.set(tag, e);
    }
  }
  return [...acc].map(([tag, e]) => ({
    tag,
    total: e.total,
    unhomed: e.unhomed,
    sources: [...e.sources].sort(),
  }));
}

/**
 * Split the tag statistics into what to propose and what to set aside.
 *
 * `promoted` clears every rule. `singleSource` clears everything *except* `minSources` — kept
 * visible rather than dropped, because that filter's job is junk and it catches real topics too
 * (`street art`, 178 un-homed items, one source). Ben rescues one by moving it in the proposal
 * file, or permanently by adding it to `allow`.
 */
export function rankCandidates(
  stats: TagStat[],
  existing: string[],
  opts: MiningOpts = DEFAULT_MINING,
): { promoted: TagStat[]; singleSource: TagStat[] } {
  const taken = new Set(existing.map((e) => e.toLowerCase()));
  const stop = new Set(opts.stopwords.map((s) => s.toLowerCase()));
  const allow = new Set(opts.allow.map((s) => s.toLowerCase()));
  const byUnhomed = (a: TagStat, b: TagStat) => b.unhomed - a.unhomed;

  const eligible = stats.filter(
    (s) =>
      !stop.has(s.tag.toLowerCase()) &&
      !taken.has(s.tag.toLowerCase()) &&
      !taken.has(topicIdFor(s.tag)) &&
      s.unhomed >= opts.minUnhomed,
  );
  return {
    promoted: eligible
      .filter((s) => s.sources.length >= opts.minSources || allow.has(s.tag.toLowerCase()))
      .sort(byUnhomed),
    singleSource: eligible
      .filter((s) => s.sources.length < opts.minSources && !allow.has(s.tag.toLowerCase()))
      .sort(byUnhomed),
  };
}

/** A tag as a topic id: the same slug shape the sixteen use (`ancient-history`, `the-ocean`). */
export function topicIdFor(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A tag as a topic label. Title Case, with `&` preserved because several real candidates carry
 *  it (`art & illustration`). Ben may overwrite any label in the proposal file. */
export function topicLabelFor(tag: string): string {
  return tag
    .split(/\s+/)
    .map((w) => (w === "&" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run src/server/services/topic-mining.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Gates and commit**

Run: `bun run typecheck && bunx eslint src/server/services/topic-mining.ts src/server/services/topic-mining.test.ts && bunx prettier --write src/server/services/topic-mining.ts src/server/services/topic-mining.test.ts`

```bash
git add src/server/services/topic-mining.ts src/server/services/topic-mining.test.ts
git commit -m "feat(topics): tag-mining ranking — the pure half of Cut 2a's promotion"
```

---

### Task 3: `scripts/mine-topics.ts` — the proposal file

**Files:**
- Create: `scripts/mine-topics.ts`; adds a `mine:topics` script to `package.json`

**Interfaces:**
- Consumes: `tallyTags`, `rankCandidates`, `topicIdFor`, `topicLabelFor`, `DEFAULT_MINING`, `listAllTopics`.
- Produces: `docs/topic-proposals.md` — the file Ben verdicts, and Task 4's input.

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env bun
// Cut 2a, step one: read the corpus, rank its tags, and write the proposal file Ben verdicts.
// WRITES NOTHING TO THE DATABASE — it only reads `item` and `topic`, and writes one Markdown file.
//
//   bun run mine:topics                          # defaults: minUnhomed 20, minSources 2
//   bun run mine:topics --min-unhomed 40         # the conservative set (36 topics, 70% of backlog)
//   bun run mine:topics --allow "street art,public art"
//
// The output is Markdown with a `- [ ]` per candidate. Ben ticks the ones to promote, edits any
// label he dislikes, and scripts/promote-topics.ts reads the ticked lines back. The file is the
// interface between a frequency count and a product decision, which is why it is prose a person
// can read rather than JSON a script can parse conveniently.
import { writeFile } from "node:fs/promises";

import { listAllTopics } from "~/server/db/topics";
import {
  DEFAULT_MINING,
  rankCandidates,
  tallyTags,
  topicIdFor,
  topicLabelFor,
  type TagStat,
} from "~/server/services/topic-mining";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : undefined;
};
const list = (name: string) =>
  (flag(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const opts = {
  ...DEFAULT_MINING,
  minUnhomed: Number(flag("min-unhomed") ?? DEFAULT_MINING.minUnhomed),
  minSources: Number(flag("min-sources") ?? DEFAULT_MINING.minSources),
  allow: list("allow"),
};

const { db } = await import("~/server/db/client");
const { item } = await import("~/server/db/schema");
const rows = await db
  .select({ tags: item.tags, source: item.source, topicId: item.topicId })
  .from(item);

const stats = tallyTags(
  rows.map((r) => ({
    tags: r.tags ?? [],
    source: r.source,
    homed: r.topicId !== null,
  })),
);
const existing = (await listAllTopics()).map((t) => t.id);
const { promoted, singleSource } = rankCandidates(stats, existing, opts);

const unhomedTotal = rows.filter((r) => r.topicId === null).length;
const keep = new Set(promoted.map((p) => p.tag));
const rescued = rows.filter(
  (r) => r.topicId === null && (r.tags ?? []).some((t) => keep.has(t)),
).length;

const row = (s: TagStat) =>
  `- [ ] \`${topicIdFor(s.tag)}\` — **${topicLabelFor(s.tag)}** ` +
  `<!-- tag: ${s.tag} --> · ${s.unhomed} un-homed / ${s.total} total · ` +
  `${s.sources.length} sources (${s.sources.join(", ")})`;

const doc = `# Topic proposals — Cut 2a

**Generated:** ${new Date().toISOString().slice(0, 10)} by \`bun run mine:topics\`
(minUnhomed ${opts.minUnhomed}, minSources ${opts.minSources}${opts.allow.length ? `, allow: ${opts.allow.join(", ")}` : ""}).
**Do not hand-edit the \`<!-- tag: … -->\` comments** — \`bun run promote:topics\` reads them.

## How to verdict this

Tick \`- [x]\` for every candidate that should become a topic. Leave \`- [ ]\` to reject.
Edit the **bold label** freely; it is what the chip and the credit line will say.
Move a line from *Single-source* up into *Candidates* to rescue it.

**The test is not subject-vs-medium.** Ambit's original sixteen already mix them — \`ceramics\`,
\`textiles\`, \`typography\`, \`cartography\` and \`portraiture\` are media or forms. The test is
**"does this name a kind of thing a person could be curious about?"** — which \`sculpture\`,
\`painting\` and \`food\` pass, and \`20th century\` fails.

**Corpus:** ${rows.length} items, ${unhomedTotal} un-homed (${Math.round((unhomedTotal / rows.length) * 100)}%).
**If every candidate below is accepted:** ${promoted.length} new topics, rescuing ${rescued} of ${unhomedTotal} un-homed items (${Math.round((rescued / unhomedTotal) * 100)}%).

## Candidates (${promoted.length})

${promoted.map(row).join("\n")}

## Single-source (${singleSource.length}) — rejected by the multi-source rule, shown so you can rescue one

These clear the un-homed floor but appear on only one source, so they may be one blog's house
vocabulary rather than shared language. Some are real (\`street art\`, \`public art\`); move any of
those up into Candidates, or pass \`--allow\` to make it permanent.

${singleSource.map(row).join("\n")}
`;

await writeFile("docs/topic-proposals.md", doc);
console.log(
  `wrote docs/topic-proposals.md — ${promoted.length} candidates, ${singleSource.length} single-source, ` +
    `${rescued}/${unhomedTotal} un-homed rescued if all accepted`,
);
process.exit(0);
```

- [ ] **Step 2: Add the package script** — in `package.json`, beside `stats:walk`:

```json
    "mine:topics": "bun run scripts/mine-topics.ts",
```

- [ ] **Step 3: Run it**

Run: `bun run mine:topics`
Expected: `wrote docs/topic-proposals.md — 86 candidates, …` (the exact count depends on the corpus at the time; the plan measured 86 at `minUnhomed 20, minSources 2` on 09-02-26). Open the file: `sculpture` is first with ~738 un-homed across 4 sources, `submission` appears nowhere (stopword), `street art` is under *Single-source*.

- [ ] **Step 4: Gates and commit** (the generated proposal file is committed too — it is the artifact Ben edits)

Run: `bun run typecheck && bunx eslint scripts/mine-topics.ts && bunx prettier --write scripts/mine-topics.ts`

```bash
git add scripts/mine-topics.ts package.json docs/topic-proposals.md
git commit -m "feat(scripts): mine:topics — rank the corpus's tags into a proposal file"
```

- [ ] **Step 5: STOP. Ben verdicts `docs/topic-proposals.md`.**

Report: the candidate count, the rescue percentage, the top ten candidates with their numbers, and
the single-source list. Ask him to tick the file. **Do not promote anything until he has.** If he
wants a different threshold, re-run with `--min-unhomed` / `--allow` and regenerate.

---

### Task 4: `scripts/promote-topics.ts` — apply the verdict

**Files:**
- Create: `scripts/promote-topics.ts`; adds `promote:topics` to `package.json`

**Interfaces:**
- Consumes: `docs/topic-proposals.md` (ticked), `topicIdFor`.
- Produces: `topic` rows at tier `grown`; `item_topic` rows at `origin: "tag"`; `item.topic_id` set
  where it was NULL.

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env bun
// Cut 2a, step two: apply Ben's verdict from docs/topic-proposals.md.
//
//   bun run promote:topics              # dry run — prints exactly what it would do
//   bun run promote:topics --confirm    # writes
//
// For each ticked candidate this does three things, and the third is the one that makes the
// backlog visible:
//   1. INSERT the topic row at tier `grown` with empty seed queries (a promoted topic is
//      vocabulary for classifying walk sources, not a query to send five museum APIs).
//   2. INSERT an `item_topic` row, origin `tag`, for EVERY item carrying that tag — homed or not.
//      Membership is additive and never retracted (Cut 1's rule).
//   3. SET `item.topic_id` to the new topic ONLY where it is currently NULL. `topic_id` is the
//      *display* topic; an item already displaying under `mythology` keeps doing so and merely
//      gains a membership. Because the feed still reads `topic_id` (Cut 2b moves it onto the
//      join), this third step is precisely what turns an invisible item into a drawable one.
import { readFile } from "node:fs/promises";

import { topicIdFor } from "~/server/services/topic-mining";

const confirm = process.argv.includes("--confirm");

// A ticked line looks like:
//   - [x] `sculpture` — **Sculpture** <!-- tag: sculpture --> · 738 un-homed / …
const LINE = /^- \[x\]\s+`([^`]+)`\s+—\s+\*\*(.+?)\*\*\s+<!--\s*tag:\s*(.+?)\s*-->/;

const doc = await readFile("docs/topic-proposals.md", "utf8");
const picks = doc
  .split("\n")
  .map((l) => LINE.exec(l))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ id: m[1]!, label: m[2]!, tag: m[3]! }));

if (picks.length === 0) {
  console.error("No ticked candidates in docs/topic-proposals.md — nothing to promote.");
  console.error('Tick a line by changing "- [ ]" to "- [x]".');
  process.exit(1);
}
// A hand-edited label is welcome; a hand-edited id is a mistake waiting to happen.
for (const p of picks) {
  if (p.id !== topicIdFor(p.tag)) {
    console.error(`id/tag mismatch: \`${p.id}\` is not the slug of "${p.tag}" — fix the file.`);
    process.exit(1);
  }
}

const { db } = await import("~/server/db/client");
const { item, itemTopic, topic } = await import("~/server/db/schema");
const { and, eq, isNull, sql } = await import("drizzle-orm");

console.log(`${picks.length} topic(s) ticked${confirm ? "" : " — DRY RUN, no writes"}\n`);
let totalMemberships = 0;
let totalDisplay = 0;

for (const p of picks) {
  // `tags` is a text[]; `@>` asks "does this array contain that element".
  const carrying = await db
    .select({ id: item.id, topicId: item.topicId })
    .from(item)
    .where(sql`${item.tags} @> ARRAY[${p.tag}]::text[]`);
  const unhomed = carrying.filter((r) => r.topicId === null);
  totalMemberships += carrying.length;
  totalDisplay += unhomed.length;
  console.log(
    `  ${p.id.padEnd(28)} ${String(carrying.length).padStart(5)} memberships · ` +
      `${String(unhomed.length).padStart(5)} become visible`,
  );
  if (!confirm) continue;

  await db
    .insert(topic)
    .values({ id: p.id, label: p.label, seedQueries: {}, tier: "grown" })
    .onConflictDoNothing();
  if (carrying.length > 0) {
    // Chunked: a single insert of tens of thousands of rows can exceed the parameter limit.
    for (let i = 0; i < carrying.length; i += 1000) {
      await db
        .insert(itemTopic)
        .values(
          carrying
            .slice(i, i + 1000)
            .map((r) => ({ itemId: r.id, topicId: p.id, origin: "tag" as const })),
        )
        .onConflictDoNothing();
    }
  }
  await db
    .update(item)
    .set({ topicId: p.id })
    .where(and(isNull(item.topicId), sql`${item.tags} @> ARRAY[${p.tag}]::text[]`));
}

console.log(
  `\n${totalMemberships} membership(s), ${totalDisplay} item(s) gain a display topic` +
    (confirm ? "" : " — re-run with --confirm to write"),
);
process.exit(0);
```

- [ ] **Step 2: Add the package script**

```json
    "promote:topics": "bun run scripts/promote-topics.ts",
```

- [ ] **Step 3: Dry run**

Run: `bun run promote:topics`
Expected: one line per ticked topic with its membership and visibility counts, then a total, then
`re-run with --confirm to write`. **Sanity-check the totals before continuing:** `totalDisplay`
should be close to the rescue figure the proposal file predicted. If it is zero, no line is ticked.

- [ ] **Step 4: Gates and commit** (the script only — the write happens in Task 6)

Run: `bun run typecheck && bunx eslint scripts/promote-topics.ts && bunx prettier --write scripts/promote-topics.ts && bun run test`

```bash
git add scripts/promote-topics.ts package.json
git commit -m "feat(scripts): promote:topics — apply the verdict, additively, dry-run by default"
```

---

### Task 5: `scripts/rebuild-topic-graph.ts` — the hybrid graph

Every topic the feed can land on needs a row in `topic-graph.json`, or DRIFT and JUMP have nowhere
to go. This regenerates the artifact: **the sixteen existing rows keep their tuned `sim` values
exactly**, and only edges touching a new topic are computed — from tag co-occurrence, rescaled.

**Files:**
- Create: `scripts/rebuild-topic-graph.ts`; adds `graph:rebuild` to `package.json`
- Create: `scripts/rebuild-topic-graph.test.ts` — the rescaling is the part that must be right

**Interfaces:**
- Produces: `cooccurrenceSims(profiles): Record<string, Record<string, number>>`,
  `rescaleTo(row, targetStdDev): …`, and a rewritten `src/server/config/topic-graph.json`.

- [ ] **Step 1: Write the failing test** — create `scripts/rebuild-topic-graph.test.ts`:

```ts
// The rescaling is the whole reason this file has a test. Co-occurrence similarities came out ~4x
// flatter than the embedding graph's (plan §0.6: -0.033..0.093 against -0.384..0.348), and
// pickDrift softmaxes over them with a temperature knob — so writing raw co-occurrence values into
// the graph would quietly flatten DRIFT into a near-uniform pick and nobody would see it fail.
import { describe, expect, it } from "vitest";

import { rescaleTo, stdDev } from "./rebuild-topic-graph";

describe("rescaleTo", () => {
  it("stretches a flat row to the target spread while preserving order and centre", () => {
    const flat = [
      { topic: "a", sim: 0.02 },
      { topic: "b", sim: 0.0 },
      { topic: "c", sim: -0.02 },
    ];
    const out = rescaleTo(flat, 0.2);
    expect(out.map((n) => n.topic)).toEqual(["a", "b", "c"]); // order preserved
    expect(stdDev(out.map((n) => n.sim))).toBeCloseTo(0.2, 3);
    expect(out[1]!.sim).toBeCloseTo(0, 6); // the centre stays at zero
    expect(out[0]!.sim).toBeGreaterThan(0);
    expect(out[2]!.sim).toBeLessThan(0);
  });

  it("leaves an all-equal row alone rather than dividing by zero", () => {
    const flat = [
      { topic: "a", sim: 0.05 },
      { topic: "b", sim: 0.05 },
    ];
    expect(rescaleTo(flat, 0.2).every((n) => Number.isFinite(n.sim))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `bunx vitest run scripts/rebuild-topic-graph.test.ts`
Expected: FAIL — `Cannot find module './rebuild-topic-graph'`.

- [ ] **Step 3: Write the script**

```ts
#!/usr/bin/env bun
// Cut 2a, step three: regenerate src/server/config/topic-graph.json so every topic — the original
// sixteen and everything promoted — has an adjacency row.
//
//   bun run graph:rebuild              # dry run: prints the diff shape, writes nothing
//   bun run graph:rebuild --confirm    # rewrites the artifact
//
// **This is a HYBRID, by Ben's decision (09-02-26), and the reason is measured.** Tag co-occurrence
// was validated against the shipped embedding graph on the sixteen topics that already have one:
// mean Spearman rho 0.502, top-3 neighbour overlap 50%. Real signal, but not a drop-in replacement
// — and the sixteen rows encode a drift feel Ben tuned by hand in Phase 0.5. So:
//
//   * an edge between two ORIGINAL topics keeps its embedding `sim`, untouched;
//   * an edge touching a PROMOTED topic is computed from tag co-occurrence;
//   * every co-occurrence row is RESCALED to the embedding graph's per-row spread, because the raw
//     values are ~4x flatter (-0.033..0.093 vs -0.384..0.348) and pickDrift's softmax would turn
//     that into a near-uniform draw. This is the subtlest thing in Cut 2a.
//
// Cut 2b replaces the JSON with a `topic_edge` table; the computation below is unchanged by that
// move, only the sink is.
import { writeFile } from "node:fs/promises";

import graphData from "~/server/config/topic-graph.json";
import { listAllTopics } from "~/server/db/topics";

export interface Neighbor {
  topic: string;
  sim: number;
}

export function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Centre a row on zero and scale it to `target` standard deviation, preserving order. An
 *  all-equal row has no spread to scale, so it is returned centred and flat rather than NaN. */
export function rescaleTo(row: Neighbor[], target: number): Neighbor[] {
  const sims = row.map((n) => n.sim);
  const mean = sims.reduce((a, b) => a + b, 0) / (sims.length || 1);
  const sd = stdDev(sims);
  const k = sd === 0 ? 0 : target / sd;
  return row.map((n) => ({ topic: n.topic, sim: +((n.sim - mean) * k).toFixed(4) }));
}

/** IDF-weighted cosine over each topic's tag profile. IDF matters because a tag on every topic
 *  (`art`) says nothing about which two are close, while a tag on three says a great deal. */
export function cooccurrenceSims(
  profiles: Map<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const ids = [...profiles.keys()];
  const df = new Map<string, number>();
  for (const m of profiles.values())
    for (const tag of m.keys()) df.set(tag, (df.get(tag) ?? 0) + 1);

  const vecs = new Map<string, Map<string, number>>();
  for (const [id, m] of profiles) {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [tag, n] of m) {
      const w = Math.log(1 + n) * Math.log(ids.length / (df.get(tag) ?? 1));
      if (w > 0) {
        v.set(tag, w);
        norm += w * w;
      }
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    vecs.set(id, v);
  }
  const out = new Map<string, Map<string, number>>();
  for (const a of ids) {
    const row = new Map<string, number>();
    for (const b of ids) {
      if (a === b) continue;
      let s = 0;
      for (const [k, w] of vecs.get(a)!) {
        const o = vecs.get(b)!.get(k);
        if (o) s += w * o;
      }
      row.set(b, s);
    }
    out.set(a, row);
  }
  return out;
}

// ── the shell ────────────────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const confirm = process.argv.includes("--confirm");
  const embedded = graphData.graph as Record<string, Neighbor[]>;
  const original = new Set(Object.keys(embedded));

  const { db } = await import("~/server/db/client");
  const { item, itemTopic } = await import("~/server/db/schema");
  const { eq } = await import("drizzle-orm");

  const topics = (await listAllTopics()).filter((t) => !t.id.startsWith("test-feed-topic"));
  // Each topic's tag profile, from every item that is a member of it.
  const rows = await db
    .select({ topicId: itemTopic.topicId, tags: item.tags })
    .from(itemTopic)
    .innerJoin(item, eq(item.id, itemTopic.itemId));
  const profiles = new Map<string, Map<string, number>>();
  for (const t of topics) profiles.set(t.id, new Map());
  for (const r of rows) {
    const m = profiles.get(r.topicId);
    if (!m) continue;
    for (const tag of r.tags ?? []) m.set(tag, (m.get(tag) ?? 0) + 1);
  }

  const cooc = cooccurrenceSims(profiles);
  // The spread to match: the mean per-row standard deviation of the tuned embedding rows.
  const target =
    Object.values(embedded).reduce((a, row) => a + stdDev(row.map((n) => n.sim)), 0) /
    Object.keys(embedded).length;
  console.log(`target per-row sim spread (from the embedding graph): ${target.toFixed(4)}`);

  const graph: Record<string, Neighbor[]> = {};
  for (const t of topics) {
    const isOriginal = original.has(t.id);
    // Rescale this topic's co-occurrence row ONCE, then read the values we need out of it, so a
    // new topic's edges are on the same scale whichever row they are read from.
    const scaled = new Map(
      rescaleTo(
        [...(cooc.get(t.id) ?? new Map<string, number>())].map(([topic, sim]) => ({ topic, sim })),
        target,
      ).map((n) => [n.topic, n.sim]),
    );
    const kept = isOriginal ? new Map(embedded[t.id]!.map((n) => [n.topic, n.sim])) : new Map();
    graph[t.id] = topics
      .filter((o) => o.id !== t.id)
      .map((o) => ({
        // An edge between two originals keeps its tuned value; anything touching a promoted
        // topic comes from the rescaled co-occurrence.
        topic: o.id,
        sim:
          isOriginal && original.has(o.id)
            ? (kept.get(o.id) ?? 0)
            : (scaled.get(o.id) ?? 0),
      }))
      .sort((a, b) => b.sim - a.sim);
  }

  const preserved = [...original].every(
    (a) =>
      embedded[a]!.every((n) => {
        if (!original.has(n.topic)) return true;
        return graph[a]!.find((m) => m.topic === n.topic)?.sim === n.sim;
      }),
  );
  console.log(`original 16x16 sims preserved exactly: ${preserved}`);
  if (!preserved) {
    console.error("REFUSING TO WRITE — a tuned edge changed. Investigate before continuing.");
    process.exit(1);
  }
  console.log(`${topics.length} topics · ${topics.length * (topics.length - 1)} edges`);

  if (!confirm) {
    console.log("dry run — re-run with --confirm to write");
    process.exit(0);
  }
  await writeFile(
    "src/server/config/topic-graph.json",
    JSON.stringify(
      {
        ...graphData,
        recipe:
          "Hybrid (Cut 2a, 09-02-26): the original sixteen keep their Phase 0 embedding sims; " +
          "every edge touching a promoted topic is IDF-weighted tag co-occurrence, rescaled per " +
          "row to the embedding graph's mean spread. See scripts/rebuild-topic-graph.ts.",
        rebuiltAt: new Date().toISOString(),
        graph,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("wrote src/server/config/topic-graph.json");
  process.exit(0);
}
```

- [ ] **Step 4: Add the package script**

```json
    "graph:rebuild": "bun run scripts/rebuild-topic-graph.ts",
```

- [ ] **Step 5: Run the tests and the gates**

Run: `bunx vitest run scripts/rebuild-topic-graph.test.ts`
Expected: PASS, 2 tests.

Run: `bun run typecheck && bunx eslint scripts/rebuild-topic-graph.ts scripts/rebuild-topic-graph.test.ts && bunx prettier --write scripts/rebuild-topic-graph.ts scripts/rebuild-topic-graph.test.ts`

- [ ] **Step 6: Commit**

```bash
git add scripts/rebuild-topic-graph.ts scripts/rebuild-topic-graph.test.ts package.json
git commit -m "feat(scripts): graph:rebuild — hybrid adjacency, tuned rows preserved, co-occurrence rescaled"
```

---

### Task 6: Run it for real

Everything above is machinery. This is the one task that changes data, and it runs **after** Ben has
ticked the proposal file (Task 3 step 5).

- [ ] **Step 1: Re-confirm the verdict file is ticked**

```bash
grep -c '^- \[x\]' docs/topic-proposals.md
```
Expected: the number Ben intended. If it is 0, stop — he has not verdicted yet.

- [ ] **Step 2: Promote, dry run first**

```bash
bun run promote:topics             # read every line of this
bun run promote:topics --confirm
```

- [ ] **Step 3: Verify the write did exactly what it claimed**

```bash
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log("topics by tier:", await sql`select tier, count(*)::int n from topic group by 1`);
console.log("memberships by origin:", await sql`select origin, count(*)::int n from item_topic group by 1`);
console.log("still un-homed:", await sql`select count(*)::int n from item where topic_id is null`);
await sql.end()'
```

Expected: a `grown` tier matching the ticked count; an `origin: "tag"` bucket that did not exist
before; and **`still un-homed` down from 3,741 by roughly the rescue figure the proposal predicted**.
`seed` and `curator` counts must be **unchanged** — promotion never rewrites them.

- [ ] **Step 4: Rebuild the graph**

```bash
bun run graph:rebuild              # confirm "original 16x16 sims preserved exactly: true"
bun run graph:rebuild --confirm
```

If that line ever says `false`, the script refuses to write. Do not work around it — a tuned edge
changing means the hybrid logic is wrong.

- [ ] **Step 5: Prove the feed can now reach a promoted topic**

```bash
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
const r = await sql`select i.id, i.title, i.topic_id from item i join topic t on t.id = i.topic_id
  where t.tier = ${"grown"} order by i.curation_score desc limit 5`;
for (const x of r) console.log(x.topic_id, "·", x.title);
await sql.end()'
```

Expected: five real items now displaying under promoted topics. Open one at
`http://localhost:3000/i/<id>` (clear port 3000 first — CLAUDE.md) and confirm it renders.

- [ ] **Step 6: The onboarding grid did not grow**

```bash
bun -e 'import { listTopics, listAllTopics } from "~/server/db/topics";
console.log("onboarding chips:", (await listTopics()).length, "· whole vocabulary:", (await listAllTopics()).length)'
```

Expected: chips still 16 (plus any `test-feed-topic-*` rows), vocabulary much larger. **This is the
check that says Cut 2a did not break onboarding.**

- [ ] **Step 7: Full suite, then commit the regenerated artifact**

Run: `bun run test && bun run typecheck`
Expected: green. `feed.test.ts` exercises `TOPIC_GRAPH`; a failure here means the rebuild produced
a shape the feed cannot read.

```bash
git add src/server/config/topic-graph.json docs/topic-proposals.md
git commit -m "feat(topics): promote N topics from corpus tags — the un-homed backlog becomes reachable"
```

---

### Task 7: Docs

- [ ] **Step 1: `SPEC.md` §5.2** — note that `topic` carries a `tier`, that `core` is the onboarding
  grid and `grown` is mined vocabulary, and that `topic-graph.json` is now hybrid (with the two-line
  reason). §9: note that DRIFT/JUMP reach grown topics while CORE weights only ever name core ones,
  because a user picks chips from `listTopics()`.
- [ ] **Step 2: `CLAUDE.md`** — one sentence in the vocabulary-growth bullet: Cut 2a shipped, the
  vocabulary is N topics, the backlog is down from 3,741 to M, Cut 2b (the `topic_edge` table and
  moving the feed onto the join) remains.
- [ ] **Step 3: `docs/DESIGN_topic-vocabulary-growth.md` §11** — mark the three delivered items and
  restate the two deferred ones as Cut 2b's scope.
- [ ] **Step 4: `log.md`** — a block in today's entry (**Shipped / Findings / Decisions / Open**),
  ending with the spend line from `python3 ~/.claude/scripts/session-spend.py --session <uuid>`.
  **Never estimate it**; omit the line entirely if the script exits non-zero.
- [ ] **Step 5: Merge**

```bash
git branch --show-current && git status --short   # clean, and no other session's edits
git checkout main && git merge --no-ff feat/topic-vocab-cut2 \
  -m "Merge branch 'feat/topic-vocab-cut2' — Cut 2a: the vocabulary grows, the backlog becomes reachable"
```

---

## Verification (the done bar)

- `bun run test` and `bun run typecheck` green.
- `listTopics()` returns only `core`; the onboarding grid is unchanged in the browser.
- `item_topic` has an `origin: "tag"` bucket, and the `seed`/`curator` counts are **identical** to
  what they were before promotion.
- `select count(*) from item where topic_id is null` is materially lower than 3,741, and no item
  that had a `topic_id` before has a different one after.
- `graph:rebuild` reports `original 16x16 sims preserved exactly: true`, and every topic in `topic`
  has a row in `topic-graph.json`.
- A promoted topic's item renders at `/i/<id>` and the feed draws it.
- `git log --oneline main..feat/topic-vocab-cut2` shows six commits.

## Self-review (done by the planner, 09-02-26)

- **Spec coverage.** DESIGN §11's Cut 2 list has five items: tag-frequency mining (Tasks 2–3), the
  proposed-topic list for Ben to verdict (Task 3), the SQL backfill (Task 4), the `topic_edge` table
  (**deferred to 2b, argued in Scope**) and moving the feed onto `item_topic` + dropping `topic_id`
  (**deferred to 2b**). The graph rebuild job (Task 5) is listed in §11 under `topic_edge` and is
  delivered here against the JSON artifact instead, which is the only part of the deferral that
  changes a sink rather than a schedule.
- **One requirement the design did not list, found while planning:** `topics.list` backs the
  onboarding chip grid and returns every topic, so promotion would have put ~100 chips on that
  screen. Task 1 exists entirely for that and must land first.
- **Placeholders:** none — every script is complete, and every threshold, count and similarity
  figure in §0 was measured against the corpus rather than estimated.
- **Type consistency:** `TagStat`, `MiningOpts`, `tallyTags`, `rankCandidates`, `topicIdFor`,
  `topicLabelFor`, `Neighbor`, `stdDev`, `rescaleTo`, `cooccurrenceSims`, `listAllTopics` and
  `TopicTier` are named identically everywhere they appear across Tasks 1–6.
- **The riskiest step is Task 5's rescaling**, which is why it is the only script with its own unit
  test and the only one that refuses to write when its invariant fails.
