# Topic facets, the four-stage picker, `/profile/topics`, and twenty personas — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Written:** 09-10-26 by Fable 5.1, from the design doc below and a read of every file named
here at `main` = `473deeb`. **For:** a cold session on a cheaper model, on a plain branch off
`main` (Ben's convention — no worktree).

**Goal:** every one of the 100 pickable topics can be switched on and off — in a four-stage
onboarding and on a new tabbed `/profile/topics` page — and twenty seeded personas can be signed
in as, on the Mac and in production.

**Architecture:** One nullable `facet` column on `topic`, assigned from a checked-in map that
`db:seed` applies on every boot (so production gets it with the deploy). `listTopics()` becomes
"every topic with a facet", which is the one change that makes both pickers and `setMine` see the
whole vocabulary. The tier `core` is renamed `original` by migration. Onboarding and the new page
are both chip grids over `topics.list` grouped client-side by facet. Personas are a config module
and a script that signs each one up through Better Auth's server API.

**Tech Stack:** Next.js 16.2 App Router, React 19, tRPC + React Query, Zod 3.25, Drizzle 0.45
over Postgres 17, Better Auth 1.6, Tailwind v4, Vitest 4 (+ jsdom), Playwright 1.62, Bun 1.4.
**No new dependencies.**

**Spec:** `docs/DESIGN_topic-facets-and-personas.md` — read it first; the facet map and the
persona table there are copied into code by Tasks 2 and 9. One deviation from it, decided while
writing this plan: **onboarding keeps its floor of three picks** (SPEC §3.2, the existing
`minPicks={3}` prop), counted across all four stages; the design doc said one. The page's floor
is one, as the doc says.

## Global Constraints

- **Branch off `main`, plain branch, no worktree.** Commit after every task with the message
  given; `git status -sb` must not read `[ahead N]` when the phase is declared done — push.
- **TDD every task**: write the test, run it and watch it fail for the right reason, then the
  code. `bun run vitest run <file>` runs one file; `bun run test` the suite; `bun run check` is
  typecheck + lint + format + tests and must be green before the final push (see the known-red
  note below).
- **Integration tests hit the local Postgres** in `.env`'s `DATABASE_URL`. Don't run two
  `bun run test` at once (CLAUDE.md's busy-machine note). If a DB-backed test that this plan did
  not touch goes red, check `main` before believing it — CLAUDE.md lists two known flakes.
- **Known red, not yours:** `source-invariants.test.ts` fails on one 70sscifiart row whose
  summary contains a literal `<details>`. It fails on `main` too (log 09-10). Ignore it.
- **Facet values are exactly** `"subject" | "medium" | "look" | "place"`. Nothing else, ever, in
  the column, the type, or the map.
- **The e2e suite is `bun run e2e:prod`** (production build; `bun run e2e` under `next dev` is
  known to be flaky at phone width). Playwright's `chromium` project is 402 × 874; `desktop` is
  1440 × 900.
- **Secrets never touch the repo, the plan, the log or a transcript.** `PERSONA_PASSWORD` is set
  in `.env` locally and in Coolify's environment for production. No default.
- **Comment generously.** Ben reads this repo to learn it; match the density of the files you
  edit (see `db/topics.ts` or `scripts/promote-topics.ts`).
- **`docs/` is excluded from the production image.** Nothing production needs may live there —
  the facet map and the personas are `src/server/config/*.ts` for that reason.

---

## File map

| file | task | responsibility |
|---|---|---|
| `src/server/db/schema.ts` | 1 | `facet` column, `TopicFacet`, `TopicTier = "original" \| "grown"` |
| `drizzle/0007_topic_facet.sql` (+ meta) | 1 | add column; `core` → `original`; default |
| `src/server/config/topic-facets.ts` (+ test) | 2 | `TOPIC_FACETS`, `FACETS`, `FACET_LABELS`, `ERA_TOPICS` |
| `scripts/seed-topics.ts` | 2 | applies facets and `tier: "original"` on every boot |
| `src/server/db/topics.ts` (+ tests) | 3, 8 | `listTopics` = faceted; `resetUserTopicWeights` |
| `src/server/api/routers/topics.ts` (+ tests) | 3, 8 | `list` carries facet; `weights`, `resetWeights` |
| `src/app/dev/feed/page.tsx`, `components/feed/feed-screen.tsx`, `components/feed/dev/feed-stats.ts`, `components/feed/dev/knob-panel.tsx` | 4 | rename `core` → `original` |
| `scripts/promote-topics.ts`, `src/server/services/topic-mining.ts` (+ test), `scripts/mine-topics.ts` | 5 | proposals carry a facet; promote refuses none |
| `src/app/onboarding/page.tsx`, `components/onboarding/onboarding-screen.tsx` (+ test) | 6 | four stages |
| `src/app/profile/topics/page.tsx`, `components/profile/topics-screen.tsx` (+ test), `components/profile/profile-screen.tsx`, `components/settings/settings-screen.tsx` (+ test), delete `components/settings/topics-sheet.tsx` | 7 | the page, the row, the link, the deletion |
| `src/server/config/personas.ts` (+ test), `scripts/seed-personas.ts` (+ integration test), `src/env.js`, `package.json`, `.env.example`, `.cache/seed-personas-prod.sh` | 9 | personas |
| `e2e/support.ts`, ten `e2e/*.spec.ts`, `e2e/settings.spec.ts` | 10 | `completeOnboarding` helper; new page flow |
| `CLAUDE.md`, `SPEC.md`, `log.md` | 11 | the words |

---

### Task 1: Schema and migration — `facet`, and `core` → `original`

**Files:**
- Modify: `src/server/db/schema.ts:160-172`
- Create: `drizzle/0007_topic_facet.sql` (via `db:generate`, then hand-extended)

**Interfaces:**
- Produces: `export type TopicFacet = "subject" | "medium" | "look" | "place"`;
  `export type TopicTier = "original" | "grown"`; column `topic.facet: text | null`.

- [ ] **Step 1: Edit the schema.** Replace lines 160–172 of `src/server/db/schema.ts` (the
  `TopicTier` type and the `topic` table) with:

```ts
/** `original` = the sixteen config-defined, query-seeded topics (`config/topics.ts`), whose
 *  tuned graph rows `graph:rebuild` preserves byte-for-byte; `grown` = promoted from the corpus's
 *  own tags by `promote:topics` (Cut 2a). Renamed from `core` 09-10-26: the sixteen were the
 *  first words anyone thought of, not a curated centre, and the word had started to imply one. */
export type TopicTier = "original" | "grown";

/** How the pickers group a topic (docs/DESIGN_topic-facets-and-personas.md §1). `null` means
 *  "not pickable": no one has classified it yet, or it is an era topic (`19th-century`), which
 *  is tag-only and would be an empty pool. Nullable on purpose — a default would file every
 *  future promotion under one facet silently. The authority is `config/topic-facets.ts`, applied
 *  by `db:seed` on every boot. */
export type TopicFacet = "subject" | "medium" | "look" | "place";

export const topic = pgTable("topic", {
  // Not a nanoid: topic ids are slugs Ambit assigns by hand (`ancient-history`, `the-ocean`, ...),
  // one per row in the checked-in topic-adjacency graph (server/config/topic-graph.json). They're
  // config, not user data — seed-topics.ts (Phase 2.3) supplies the id explicitly on insert.
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  seedQueries: jsonb("seed_queries").$type<SeedQueries>().notNull(),
  // Defaulted in SQL so a row inserted without one (test fixtures, mostly) is an original — the
  // conservative reading, since only `grown` rows get the rebuild's rescaled edges.
  tier: text("tier").$type<TopicTier>().notNull().default("original"),
  facet: text("facet").$type<TopicFacet>(),
});
```

- [ ] **Step 2: Generate the migration.**

Run: `bun run db:generate --name topic_facet`
Expected: a new `drizzle/0007_topic_facet.sql` containing exactly two statements — an
`ALTER TABLE "topic" ADD COLUMN "facet" text;` and an `ALTER COLUMN "tier" SET DEFAULT 'original'`
(drizzle emits the default change as a separate `ALTER TABLE … ALTER COLUMN … SET DEFAULT`). Open
it and read it. If drizzle named it differently, rename the file **and** its entry in
`drizzle/meta/_journal.json` to `0007_topic_facet`.

- [ ] **Step 3: Extend it with the data move.** Append to `drizzle/0007_topic_facet.sql`:

```sql
--> statement-breakpoint
-- 09-10-26: the tier `core` is renamed `original` (docs/DESIGN_topic-facets-and-personas.md,
-- decision 4). Data move, so drizzle could not generate it; the type and default above follow.
UPDATE "topic" SET "tier" = 'original' WHERE "tier" = 'core';
```

(`--> statement-breakpoint` is how drizzle separates statements in its migration files — copy it
exactly, including the `-->`.)

- [ ] **Step 4: Apply it locally.**

Run: `bun run db:migrate`
Expected: exit 0. Then verify:

```sh
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select tier, count(*)::int as n, count(facet)::int as faceted from topic group by tier`);
await sql.end()'
```

Expected: rows for `original` and `grown` only (no `core`), `faceted` 0 for both.

- [ ] **Step 5: Typecheck.**

Run: `bun run typecheck`
Expected: **fails** in `scripts/seed-topics.ts` (`tier: "core" as const` no longer satisfies
`TopicTier`) and `src/app/dev/feed/page.tsx` (`t.tier === "core"` compares against a value not
in the union). Those are Tasks 2 and 4. Nothing else should fail; if something does, it is a
`"core"` literal this plan missed — fix it to `"original"` in the same commit.

- [ ] **Step 6: Commit** (with the two known type errors — Task 2 fixes them next; keep the
  commits honest about order rather than squashing).

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(topics): facet column; tier core → original (migration 0007)"
```

---

### Task 2: The facet map, and `db:seed` applying it

**Files:**
- Create: `src/server/config/topic-facets.ts`
- Create: `src/server/config/topic-facets.test.ts`
- Modify: `scripts/seed-topics.ts`
- Modify: `src/server/db/topics.ts` (add `applyTopicFacets` — the seed script calls `main()`
  on import and cannot be imported by a test, the same reason `ingest.ts` can't, so the
  applying function lives in the repository module and the script is one call)
- Modify: `src/server/db/topics.integration.test.ts`

**Interfaces:**
- Produces:
  - `export const FACETS = ["subject", "medium", "look", "place"] as const satisfies readonly TopicFacet[]`
    — the display order everywhere.
  - `export const FACET_LABELS: Record<TopicFacet, string>` = Subject / Medium / Look / Place.
  - `export const ERA_TOPICS: ReadonlySet<string>` = `{"19th-century"}` — known-unfaceted.
  - `export const TOPIC_FACETS: Readonly<Record<string, TopicFacet>>` — the map.
  - `export function facetOf(topicId: string): TopicFacet | undefined`.
  - `export async function applyTopicFacets(): Promise<{ applied: number; unfaceted: string[] }>`
    in **`src/server/db/topics.ts`** (Task 3 owns that file's other changes; add this function
    here, it is small) — updates `topic.facet` for every map key present, returns the ids left
    with `facet IS NULL` that are not in `ERA_TOPICS`.

- [ ] **Step 1: Write the failing unit test** `src/server/config/topic-facets.test.ts`:

```ts
// The facet map is hand-assigned (docs/DESIGN_topic-facets-and-personas.md §1). These tests keep
// it honest in the directions a typo can break: a value outside the four, an original topic
// left out, an era topic let in. The other direction — every key is a real topic in the DB, and
// every non-era topic in the DB is a key — is topics.integration.test.ts's job, since only the
// database knows the grown tier.
import { describe, expect, it } from "vitest";

import { TOPICS } from "./topics";
import {
  ERA_TOPICS,
  FACETS,
  FACET_LABELS,
  TOPIC_FACETS,
  facetOf,
} from "./topic-facets";

describe("TOPIC_FACETS", () => {
  it("uses only the four facet values", () => {
    const allowed = new Set<string>(FACETS);
    for (const [id, facet] of Object.entries(TOPIC_FACETS)) {
      expect(allowed.has(facet), `${id}: ${facet}`).toBe(true);
    }
  });

  it("gives every original topic a facet", () => {
    for (const t of TOPICS) {
      expect(facetOf(t.id), t.id).toBeDefined();
    }
  });

  it("leaves era topics out", () => {
    for (const id of ERA_TOPICS) {
      expect(facetOf(id), id).toBeUndefined();
    }
  });

  it("has a label for every facet, in display order", () => {
    expect(FACETS).toEqual(["subject", "medium", "look", "place"]);
    expect(FACETS.map((f) => FACET_LABELS[f])).toEqual([
      "Subject",
      "Medium",
      "Look",
      "Place",
    ]);
  });

  it("has exactly 100 entries — the design doc's count; update both if the vocabulary grows", () => {
    expect(Object.keys(TOPIC_FACETS)).toHaveLength(100);
  });
});
```

- [ ] **Step 2: Run it — fails** with "Cannot find module './topic-facets'":
  `bun run vitest run src/server/config/topic-facets.test.ts`

- [ ] **Step 3: Write `src/server/config/topic-facets.ts`.** The map is the design doc's table,
  verbatim. Keep the grouping in the file (one block per facet) so a reader can scan it.

```ts
// The four facets the pickers group topics by, and every topic's assignment
// (docs/DESIGN_topic-facets-and-personas.md §1, 09-10-26). Hand-assigned, on purpose: a facet
// by graph neighbourhood would file `watercolor` under Botany because they co-occur, and a
// facet by tier would just be age. `db:seed` applies this map on every boot, which is what
// puts facets on production with nothing copied into the container.
//
// A topic missing from this map has `facet = NULL` in the database and is NOT pickable —
// `listTopics()` filters on the column. That is the honest state of a topic nobody has
// classified (a fresh promotion) and the intended state of an era topic (`19th-century`,
// tag-only since 09-07-26: no item displays under it, so picking it is an empty pool until
// Cut 2b moves the feed onto the membership join). `promote:topics` refuses to promote without
// a facet and prints the line to paste here.
//
// Judgement calls, recorded so they are not re-argued: `retrofuturism` is a look (it names a
// style; `science-fiction` names the subject). `light`, `fire`, `water`, `sand`, `snow` are
// subjects — what is pictured; `glass`, `metal`, `wood`, `paper`, `plastic`, `clay` are media —
// what it is made of (`clay` sits beside `ceramics`; both stay). `installation`, `land-art`,
// `murals`, `dioramas`, `miniature` are media in the "kind of work" sense. `still-life` and
// `portraits` are subjects in the genre sense. Known duplicates (`portraiture`/`portraits`,
// `botany`/`plants`/`flowers`, `zoology`/`animals`) are noted in the design doc and not merged
// here — merging is topic surgery on memberships and graph rows.
import type { TopicFacet } from "~/server/db/schema";

/** Display order — onboarding's stages, the page's tabs. */
export const FACETS = [
  "subject",
  "medium",
  "look",
  "place",
] as const satisfies readonly TopicFacet[];

export const FACET_LABELS: Record<TopicFacet, string> = {
  subject: "Subject",
  medium: "Medium",
  look: "Look",
  place: "Place",
};

/** Topics that are unfaceted by design, not by omission — `db:seed` does not warn about these. */
export const ERA_TOPICS: ReadonlySet<string> = new Set(["19th-century"]);

const subject = [
  // The thirteen originals that are subjects.
  "ancient-history", "architecture", "astronomy", "botany", "cartography", "geology",
  "machines", "music", "mythology", "poetry", "portraiture", "the-ocean", "zoology",
  // Grown.
  "activism", "advertising", "anatomy", "animals", "balloons", "birds", "body", "books",
  "cars", "cats", "clouds", "consciousness", "dance", "death", "emotions", "fashion", "film",
  "fire", "flowers", "food", "fruit", "furniture", "games", "insects", "jewelry", "kids",
  "landscapes", "light", "literature", "medicine", "mirrors", "nature", "plants", "portraits",
  "sand", "science", "science-fiction", "shoes", "snow", "sound", "still-life", "technology",
  "toys", "travel", "trees", "water", "weather",
];

const medium = [
  // The three originals that are media.
  "ceramics", "textiles", "typography",
  // Grown.
  "carving", "clay", "collage", "digital", "dioramas", "drawing", "embroidery",
  "found-objects", "glass", "illustration", "ink", "installation", "land-art", "metal",
  "miniature", "mixed-media", "murals", "painting", "paper", "photography", "plastic",
  "sculpture", "watercolor", "wood",
];

const look = [
  "abstract", "black-and-white", "color", "geometric", "optical-illusion", "pattern",
  "psychedelic", "retrofuturism", "surreal",
];

const place = ["chicago", "japan", "london", "new-york"];

function assign(ids: readonly string[], facet: TopicFacet) {
  return Object.fromEntries(ids.map((id) => [id, facet] as const));
}

export const TOPIC_FACETS: Readonly<Record<string, TopicFacet>> = {
  ...assign(subject, "subject"),
  ...assign(medium, "medium"),
  ...assign(look, "look"),
  ...assign(place, "place"),
};

export function facetOf(topicId: string): TopicFacet | undefined {
  return TOPIC_FACETS[topicId];
}
```

(Prettier will reflow the arrays to one id per line — let it; `bun run format:write` before
committing.)

- [ ] **Step 4: Run the unit test — passes.** If the count test fails, you mistyped an id or
  duplicated one across facets; `Object.keys` would then be short. Compare against the design
  doc's table.

- [ ] **Step 5: Write the failing integration test.** Add to
  `src/server/db/topics.integration.test.ts` a new `describe` (keep the file's existing imports
  and its `beforeAll` DB pattern):

```ts
describe("applyTopicFacets (integration)", () => {
  it("writes the map to every topic in the database and reports the unfaceted remainder", async () => {
    const { applyTopicFacets, listAllTopics } = await import("./topics");
    const result = await applyTopicFacets();

    const all = await listAllTopics();
    const byId = new Map(all.map((t) => [t.id, t]));
    // Every key that exists in this database carries its facet.
    for (const [id, facet] of Object.entries(TOPIC_FACETS)) {
      const row = byId.get(id);
      if (row) expect(row.facet, id).toBe(facet);
    }
    // `applied` counts the keys that were present, never the keys that were not.
    expect(result.applied).toBe(
      Object.keys(TOPIC_FACETS).filter((id) => byId.has(id)).length,
    );
    // The remainder is whatever real topic is unfaceted and not an era topic. On a fully
    // classified vocabulary it is only test fixtures, which all start `test-`.
    for (const id of result.unfaceted) {
      expect(ERA_TOPICS.has(id)).toBe(false);
      expect(byId.get(id)?.facet).toBeNull();
    }
  });
});
```

Add `import { ERA_TOPICS, TOPIC_FACETS } from "~/server/config/topic-facets";` at the top.

- [ ] **Step 6: Run it — fails** ("applyTopicFacets is not a function"):
  `bun run vitest run src/server/db/topics.integration.test.ts`

- [ ] **Step 7: Add `applyTopicFacets` to `src/server/db/topics.ts`** (below `listAllTopics`):

```ts
/**
 * Writes `config/topic-facets.ts` into the `facet` column — for every key that is a row here;
 * keys that are not (a fresh database has only the sixteen) are skipped without comment. Run by
 * `db:seed` on every boot, so a deploy is all it takes to facet production. Returns the ids
 * still unfaceted afterwards, minus the known era set, so the seed can warn about a promoted
 * topic nobody has classified — which would otherwise be invisible in every picker and say
 * nothing.
 */
export async function applyTopicFacets(): Promise<{
  applied: number;
  unfaceted: string[];
}> {
  const { db } = await import("./client");
  const { ERA_TOPICS, TOPIC_FACETS } = await import("~/server/config/topic-facets");
  const rows = await db.select({ id: topic.id }).from(topic);
  const present = new Set(rows.map((r) => r.id));

  let applied = 0;
  await db.transaction(async (tx) => {
    for (const [id, facet] of Object.entries(TOPIC_FACETS)) {
      if (!present.has(id)) continue;
      await tx.update(topic).set({ facet }).where(eq(topic.id, id));
      applied++;
    }
  });

  const still = await db
    .select({ id: topic.id })
    .from(topic)
    .where(isNull(topic.facet));
  return {
    applied,
    unfaceted: still.map((r) => r.id).filter((id) => !ERA_TOPICS.has(id)),
  };
}
```

Add `isNull` to the `drizzle-orm` import at the top of the file. (Hundred single-row updates
inside one transaction; it runs once per boot and takes well under a second. A `CASE` bulk
update would be faster and unreadable.)

- [ ] **Step 8: Run the integration test — passes.**

- [ ] **Step 9: Wire the seed script.** In `scripts/seed-topics.ts`: change `tier: "core" as const`
  to `tier: "original" as const` (and the comment above it: "The sixteen config-defined topics
  are the `original` tier by definition"). Then, after the orphan warnings loop and before the
  `unchanged` summary, add:

```ts
  // Facets (09-10-26): the map in config/topic-facets.ts is the authority; this is what puts it
  // on production at the next deploy. Grown topics are not in TOPICS, so the upsert above never
  // touches them — this pass does.
  const { applyTopicFacets } = await import("~/server/db/topics");
  const facets = await applyTopicFacets();
  console.log(`Facets applied to ${facets.applied} topics.`);
  for (const id of facets.unfaceted) {
    console.warn(
      `Warning: topic "${id}" has no facet — it is in the database but not in topic-facets.ts, so no picker will show it.`,
    );
  }
```

- [ ] **Step 10: Run the seed and verify.**

Run: `bun run db:seed`
Expected: "16 topics already up to date" (or a seed line), then `Facets applied to 100 topics.`,
then warnings only for `test-…` fixtures if any linger in the dev database. Then:

```sh
bun -e 'import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL!);
console.log(await sql`select facet, count(*)::int as n from topic group by facet order by facet`);
await sql.end()'
```

Expected: look 9, medium 27, place 4, subject 60, and `null` = 1 + any test fixtures.

- [ ] **Step 11: Typecheck** — `bun run typecheck` now fails only in `src/app/dev/feed/page.tsx`
  (Task 4).

- [ ] **Step 12: Commit.**

```bash
bun run format:write
git add src/server/config/topic-facets.ts src/server/config/topic-facets.test.ts src/server/db/topics.ts src/server/db/topics.integration.test.ts scripts/seed-topics.ts
git commit -m "feat(topics): the facet map, applied by db:seed on every boot"
```

---

### Task 3: `listTopics()` = every faceted topic; `setMine` accepts them

**Files:**
- Modify: `src/server/db/topics.ts:14-42` (`listTopics` + its comment)
- Modify: `src/server/db/topics.integration.test.ts` (the existing `listTopics` test at ~line 28)
- Modify: `src/server/api/routers/topics.ts:11-12` (comment only)
- Modify: `src/server/api/routers/routers.integration.test.ts:77-88` (fixtures) and the
  `topics.list + topics.setMine round trip` describe (~194)

**Interfaces:**
- Produces: `listTopics(): Promise<Topic[]>` now returns rows `WHERE facet IS NOT NULL ORDER BY
  label`; each `Topic` carries `facet: TopicFacet | null` (never null in this result).
  `topics.list` (tRPC) returns the same rows, unchanged shape plus `facet`.

- [ ] **Step 1: Rewrite the existing integration test.** In `topics.integration.test.ts`, the
  `describe` that inserts a `grownId` fixture and asserts `listTopics()` excludes it: change the
  fixture and the assertions so the test reads:

```ts
  it("listTopics returns faceted topics of either tier and hides unfaceted ones", async () => {
    const { db } = await import("./client");
    await db
      .insert(topic)
      .values([
        { id: grownId, label: "Test Grown", seedQueries: {}, tier: "grown", facet: "look" },
        { id: unfacetedId, label: "Test Unfaceted", seedQueries: {}, tier: "grown" },
      ])
      .onConflictDoNothing();

    const pickable = await listTopics();
    const ids = pickable.map((t) => t.id);
    expect(ids).toContain(grownId);
    expect(ids).not.toContain(unfacetedId);
    // Every row that comes back is faceted — that is the contract the pickers rely on.
    for (const t of pickable) expect(t.facet).not.toBeNull();
    // Still ordered by label (Cut 2a).
    expect(ids).toEqual([...pickable].sort((a, b) => a.label.localeCompare(b.label)).map((t) => t.id));

    const all = await listAllTopics();
    expect(all.map((t) => t.id)).toEqual(expect.arrayContaining([grownId, unfacetedId]));
  });
```

Declare `const unfacetedId = \`test-unfaceted-${nanoid(8)}\`;` beside `grownId` (match how
`grownId` is built in that file) and add it to the file's `afterAll` cleanup delete.

- [ ] **Step 2: Run — fails** (`grownId` is not in `listTopics()` yet):
  `bun run vitest run src/server/db/topics.integration.test.ts`

- [ ] **Step 3: Change `listTopics`.** Replace its body's `.where(eq(topic.tier, "core"))` with
  `.where(isNotNull(topic.facet))` (add `isNotNull` to the drizzle import) and replace the
  doc comment above it with:

```ts
/**
 * The topics a picker may offer — every topic with a facet, ordered by label (SPEC §3.2, and
 * `topics.list`). Since 09-10-26 that is the whole vocabulary minus the unclassified and the
 * era topics (`config/topic-facets.ts` says which and why), grouped client-side by `facet`:
 * onboarding shows one facet per stage, `/profile/topics` one per tab. Before this it was the
 * sixteen `core` rows only — Cut 2a's "a hundred-chip grid is a broken screen" — which was
 * right about the grid and wrong about the vocabulary; grouping is what fixed the grid.
 *
 * `topics.setMine` validates against this list, so what is pickable here is exactly what is
 * acceptable there. `listAllTopics` is for the graph, the mining and audits.
 */
```

Also update the file's header comment (lines 1–6): "CORE weights" → "ORIGINAL-tier weights" is
wrong — the feed's CORE *tier* is unrelated to the topic tier; leave the word CORE there (it
refers to the feed's CORE tier, SPEC §9.1) and instead add one line: "`listTopics` returns
every faceted topic as of 09-10-26 — see its comment."

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: Fix the router integration fixtures.** In `routers.integration.test.ts` at
  ~line 77, both fixture topics gain `facet: "subject"` (without it they are unfaceted and
  `list includes the fixture topics` would fail). Then add two tests to the
  `topics.list + topics.setMine round trip` describe:

```ts
    it("list carries each topic's facet", async () => {
      const caller = createCaller(authedContext(userId));
      const all = await caller.topics.list();
      const a = all.find((t) => t.id === topicA);
      expect(a?.facet).toBe("subject");
    });

    it("setMine accepts a grown, faceted topic and refuses an unfaceted one", async () => {
      const { db } = await import("~/server/db/client");
      const { topic } = await import("~/server/db/schema");
      const grown = `test-grown-${nanoid(8)}`;
      const era = `test-era-${nanoid(8)}`;
      await db.insert(topic).values([
        { id: grown, label: "Grown", seedQueries: {}, tier: "grown", facet: "look" },
        { id: era, label: "Era", seedQueries: {}, tier: "grown" },
      ]);
      try {
        const caller = createCaller(authedContext(userId));
        await expect(caller.topics.setMine({ topicIds: [topicA, grown] })).resolves.toEqual({ ok: true });
        await expect(caller.topics.setMine({ topicIds: [era] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      } finally {
        const { userTopic } = await import("~/server/db/schema");
        await db.delete(userTopic).where(inArray(userTopic.topicId, [grown, era]));
        await db.delete(topic).where(inArray(topic.id, [grown, era]));
      }
    });
```

Import `inArray` from `drizzle-orm` and `nanoid` from `nanoid` if the file doesn't already.

- [ ] **Step 6: Run — the first passes after Step 5's fixture change, the second passes**
  (`setMine` already validates against `listTopics()`, which now includes grown):
  `bun run vitest run src/server/api/routers/routers.integration.test.ts`
  If `setMine` with the grown id fails with BAD_REQUEST, `listTopics` is still filtering on
  tier — re-check Step 3.

- [ ] **Step 7: Router comment.** In `src/server/api/routers/topics.ts` change the `list`
  doc comment to: `/** Every pickable topic — faceted, ordered by label — for onboarding's stages and /profile/topics's tabs (SPEC §8.2). */`
  and, in `setMine`'s comment, "against the real topic catalog" → "against `listTopics()` — the
  pickable set, so an unfaceted or era id is refused here, not by the FK".

- [ ] **Step 8: Check every other fixture insert.** `grep -rn "insert(topic)" src e2e` lists
  the DB integration tests (`items.integration.test.ts`, `feed.integration.test.ts`) that insert
  topics without a facet. **Leave them.** Those fixtures are reached by id (the feed walks the
  graph and never lists topics), and an unfaceted fixture is exactly what keeps it out of any
  user's picker. Confirm by running `bun run test` once here; every DB-backed suite except the
  known-red invariants test should pass.

- [ ] **Step 9: Commit.**

```bash
git add src/server/db/topics.ts src/server/db/topics.integration.test.ts src/server/api/routers/topics.ts src/server/api/routers/routers.integration.test.ts
git commit -m "feat(topics): listTopics = every faceted topic, so setMine accepts the grown tier"
```

---

### Task 4: Rename the remaining `core` references

**Files:**
- Modify: `src/app/dev/feed/page.tsx:17-19`
- Modify: `src/components/feed/feed-screen.tsx:72-74, 238-244`
- Modify: `src/components/feed/feed-screen.test.tsx:484`
- Modify: `src/components/feed/dev/feed-stats.ts:13-15, 31, 36, 51, 64, 73` (+ its test if it names `core`)
- Modify: `src/components/feed/dev/knob-panel.tsx:82`
- Modify: `scripts/rebuild-topic-graph.ts` — comments that say "core" meaning the tier

**Interfaces:**
- Produces: `FeedScreen`'s `dev` prop is `{ originalTopicIds: string[] }`; `PageStats.original`
  replaces `PageStats.core`; the readout label reads `original / grown / wild`.

- [ ] **Step 1: Update the feed-screen test first.** Line 484: `const dev = { originalTopicIds: ["botany"] };`.
  Search the same file for `.core` and `"core"` in readout assertions (e.g. a text match on
  `core / grown / wild`) and change them to `original`. Run
  `bun run vitest run src/components/feed/feed-screen.test.tsx` — **fails** on the prop name.

- [ ] **Step 2: Rename in code.** `feed-stats.ts`: field `core` → `original` in `PageStats`,
  `emptyStats`, `pageStats` (parameter `coreIds` → `originalIds`), and the session totals; update
  the comment on line 15 to "belong to neither `original` nor `grown`". `feed-screen.tsx`: prop
  `coreTopicIds` → `originalTopicIds`, the memo `coreIds` → `originalIds`, and the doc comment:
  "The original-tier topic ids, from the DB via the /dev/feed shell — the readout's
  original-vs-grown test." `knob-panel.tsx:82`: `label="original / grown / wild"`.
  `feed-stats.test.ts` (if it exists — `ls src/components/feed/dev/`): rename fields.
  `src/app/dev/feed/page.tsx`:

```ts
  const originalTopicIds = topics
    .filter((t) => t.tier === "original")
    .map((t) => t.id);

  return <FeedScreen topicLabels={topicLabels} dev={{ originalTopicIds }} />;
```

and its comment above ("the core-tier ids for the readout's core/grown split") → original.

- [ ] **Step 3: `rebuild-topic-graph.ts`.** `grep -n "core" scripts/rebuild-topic-graph.ts`.
  The script reads its preserved set from `TOPICS` (config), not the tier, so no logic changes;
  every comment that says "core" for the tier becomes "original". Leave any "CORE" that means
  the feed tier (SPEC §9's CORE/DRIFT/JUMP/WILD).

- [ ] **Step 4: Typecheck, lint, tests.**

Run: `bun run typecheck && bun run lint && bun run vitest run src/components/feed`
Expected: clean. `grep -rn '"core"' src scripts --include='*.ts' --include='*.tsx'` should
now return nothing outside test fixtures' `tier` literals (there should be none) and the feed's
`"CORE"` tier constant.

- [ ] **Step 5: Commit.**

```bash
git add -A src scripts
git commit -m "refactor: the topic tier is 'original', not 'core' — dev readout, FeedScreen prop, comments"
```

---

### Task 5: Promotion learns facets

**Files:**
- Modify: `src/server/services/topic-mining.ts` (the proposal line writer, wherever
  `<!-- tag: … -->` is emitted — `grep -n "tag:" src/server/services/topic-mining.ts`)
- Modify: `src/server/services/topic-mining.test.ts` (same grep)
- Modify: `scripts/promote-topics.ts:38-40 (LINE), 121-122 (insert)`, plus the closing summary
- Modify: `docs/topic-proposals.md` header — one sentence

**Interfaces:**
- The proposal line format gains a second comment: `<!-- tag: sculpture --> <!-- facet: ? -->`.
  `mine:topics` writes `?`; Ben replaces it with one of the four when ticking. `promote:topics`
  refuses a ticked line whose facet is `?` or absent or not one of the four.
- Produces: `promote:topics --confirm` inserts `facet` on the new row and prints, at the end,
  the lines to paste into `topic-facets.ts`.

- [ ] **Step 1: Failing unit test for the line writer.** In `topic-mining.test.ts` find the test
  that asserts the emitted line contains `<!-- tag: `. Add beside it:

```ts
  it("emits a facet slot the verdict fills in — `?` until Ben says which", () => {
    const line = /* the same call the neighbouring test makes to render one proposal line */;
    expect(line).toMatch(/<!--\s*tag:\s*[^>]+-->\s*<!--\s*facet:\s*\?\s*-->/);
  });
```

Use the neighbouring test's exact call; the function name is whatever renders one line in that
module (`proposalLine`, `formatProposal` — read the file).

- [ ] **Step 2: Run — fails.** `bun run vitest run src/server/services/topic-mining.test.ts`

- [ ] **Step 3: Emit it.** In the line writer, after the `<!-- tag: ${tag} -->` fragment append
  ` <!-- facet: ? -->`. Comment: `// Facet (09-10-26): the verdict replaces \`?\` with subject | medium | look | place; promote:topics refuses \`?\`.`

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: `promote-topics.ts`.** Replace `LINE` with:

```ts
// A ticked line looks like:
//   - [x] `sculpture` — **Sculpture** <!-- tag: sculpture --> <!-- facet: medium --> · 738 un-homed / …
// The facet comment is new (09-10-26); a verdict written before it has none, and is refused
// below exactly like a `?` — a promoted topic without a facet is invisible in every picker.
const LINE =
  /^- \[x\]\s+`([^`]+)`\s+—\s+\*\*(.+?)\*\*\s+<!--\s*tag:\s*(.+?)\s*-->(?:\s*<!--\s*facet:\s*(.+?)\s*-->)?/;
```

and the picks mapping: `.map((m) => ({ id: m[1]!, label: m[2]!, tag: m[3]!, facet: m[4] }))`.
After the duplicate-id check add:

```ts
// No facet, no promotion. `?` is what mine:topics writes; a verdict that predates the facet
// slot has nothing at all. Either way the fix is in the file, not here.
const { FACETS } = await import("~/server/config/topic-facets");
for (const p of picks) {
  if (!p.facet || !(FACETS as readonly string[]).includes(p.facet)) {
    console.error(
      `\`${p.id}\` has no facet (found "${p.facet ?? ""}") — set <!-- facet: subject | medium | look | place --> on its line.`,
    );
    process.exit(1);
  }
}
```

Change the insert at ~line 122 to
`.values({ id: p.id, label: p.label, seedQueries: {}, tier: "grown", facet: p.facet as TopicFacet })`
(import the type from `~/server/db/schema`). At the very end of the confirm path, after the
existing graph-rebuild reminder, print:

```ts
console.log(
  "\nAdd to src/server/config/topic-facets.ts (the map is the authority; the DB row is just ahead of it until you do):",
);
for (const p of picks) console.log(`  ${p.facet}: "${p.id}",`);
```

- [ ] **Step 6: Dry-run it against the current verdict.**

Run: `bun run promote:topics` (no `--confirm`)
Expected: exits 1 with the "has no facet" message naming `sculpture` — the existing verdict
predates the slot. **That is correct**: those 83 are already promoted, and the map covers them.
Do not edit `docs/topic-proposals.md`'s ticks. Add one sentence to its "How to verdict this"
section: "Each ticked line also needs `<!-- facet: subject | medium | look | place -->`
(09-10-26); `promote:topics` refuses a line without one."

- [ ] **Step 7: Typecheck + lint + commit.**

```bash
bun run typecheck && bun run lint
git add src/server/services/topic-mining.ts src/server/services/topic-mining.test.ts scripts/promote-topics.ts docs/topic-proposals.md
git commit -m "feat(topics): proposals carry a facet; promote:topics refuses one without"
```

---

### Task 6: Onboarding in four stages

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/onboarding/onboarding-screen.tsx`
- Modify: `src/components/onboarding/onboarding-screen.test.tsx`

**Interfaces:**
- `OnboardingScreenProps` becomes
  `{ topics: { id: string; label: string; facet: TopicFacet }[]; minPicks: number }`.
  The page passes `await listTopics()` mapped to those three fields (server component; the
  dynamic-import-inside-`listTopics` pattern means nothing changes for CI).
- Stage copy (placeholder until sub-project 3): headings
  `["What do you want to see?", "Made how?", "What should it look like?", "Anywhere in particular?"]`,
  eyebrow `Ambit · Setup · 1 of 4`.
- Buttons, by accessible name: chips as today; **Back** (stages 2–4); **Next** (stages 1–3);
  on stage 4 the CTA keeps today's labels — `Pick N more` while below `minPicks`, then
  **Start exploring**. Progress: a `<nav aria-label="Setup progress">` with four dots,
  `aria-current="step"` on the active one.

- [ ] **Step 1: Rewrite the unit test file.** Replace the `FIXTURE_TOPICS` and every test with
  the set below (keep the mocks and `beforeEach`):

```tsx
const FIXTURE_TOPICS = [
  { id: "alpha", label: "Alpha", facet: "subject" as const },
  { id: "beta", label: "Beta", facet: "subject" as const },
  { id: "gamma", label: "Gamma", facet: "medium" as const },
  { id: "delta", label: "Delta", facet: "look" as const },
  { id: "epsilon", label: "Epsilon", facet: "place" as const },
];

function chips() {
  return screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
}
function next() { fireEvent.click(screen.getByRole("button", { name: "Next" })); }

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({ ok: true });
    replaceMock.mockReset();
  });

  it("stage 1 shows only the subject chips, in the order given, and no Back", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    expect(chips().map((b) => b.textContent)).toEqual(["Alpha", "Beta"]);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Setup progress" })).toBeTruthy();
    expect(screen.getByText("What do you want to see?")).toBeTruthy();
  });

  it("Next walks the four facets in order and the last stage shows the CTA", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Gamma"]);
    expect(screen.getByText("Made how?")).toBeTruthy();
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Delta"]);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Epsilon"]);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: /Pick 3 more|Start exploring/ })).toBeTruthy();
  });

  it("a stage with no picks can be passed", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    next(); next(); next();
    expect(screen.getByText("Anywhere in particular?")).toBeTruthy();
  });

  it("Back returns to the previous stage with its picks intact", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("the count is across every stage, and the CTA flips at minPicks", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    next(); next();
    expect(screen.getByText("3 interests chosen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start exploring" }).hasAttribute("disabled")).toBe(false);
  });

  it("below minPicks the CTA is disabled and setMine is never called", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next(); next(); next();
    const cta = screen.getByRole("button", { name: "Pick 2 more" });
    expect(cta.hasAttribute("disabled")).toBe(true);
    fireEvent.click(cta);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("a successful submit calls setMine once with the union of every stage's picks and navigates to /feed", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Delta" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(new Set(mutateAsyncMock.mock.calls[0]![0].topicIds)).toEqual(new Set(["alpha", "gamma", "delta"]));
  });

  it("a mutation error renders in the error slot and does not navigate", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(screen.getByTestId("onboarding-error")).toBeTruthy());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("centers in a narrow column above md", () => {
    /* keep the existing test's body verbatim — it only needs the new props */
  });
});
```

Remove the `TOPICS` import; the test no longer reads config.

- [ ] **Step 2: Run — fails** (no Next button, chips not filtered):
  `bun run vitest run src/components/onboarding/onboarding-screen.test.tsx`

- [ ] **Step 3: Rewrite the screen.** In `onboarding-screen.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import { FACETS, FACET_LABELS } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

export interface OnboardingScreenProps {
  /** `topics.list` (every faceted topic, label order) mapped down to what the grid needs. */
  topics: { id: string; label: string; facet: TopicFacet }[];
  /** Minimum picks — across all four stages — before the CTA flips to "Start exploring" (SPEC §3.2: 3). */
  minPicks: number;
}

/** Stage copy. Placeholder wording until sub-project 3 (the chrome redesign) writes it properly;
 *  the facet order is `FACETS` and is not a copy decision. */
const STAGE_HEADINGS: Record<TopicFacet, string> = {
  subject: "What do you want to see?",
  medium: "Made how?",
  look: "What should it look like?",
  place: "Anywhere in particular?",
};

export function OnboardingScreen({ topics, minPicks }: OnboardingScreenProps) {
  const router = useRouter();
  const { mutateAsync } = api.topics.setMine.useMutation();

  // One set for all four stages, so Back-and-unpick works and the final write is the union.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const facet = FACETS[stage]!;
  const isLast = stage === FACETS.length - 1;
  const stageTopics = topics.filter((t) => t.facet === facet);

  function toggle(topicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  const count = selected.size;
  const remaining = minPicks - count;
  const countLabel =
    count === 0
      ? "Nothing picked yet"
      : `${count} ${count === 1 ? "interest" : "interests"} chosen`;
  const ctaLabel = remaining > 0 ? `Pick ${remaining} more` : "Start exploring";

  async function handleSubmit() {
    if (submitting || count < minPicks) return;
    setError("");
    setSubmitting(true);
    try {
      await mutateAsync({ topicIds: [...selected] });
      router.replace("/feed");
    } catch {
      setError("Something went wrong saving your picks — try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-bg min-h-dvh">
      <Column width="narrow">
        {/* `key={stage}` re-mounts the header and grid per stage so <Rise> plays again — a stage
            change should feel like a new screen, not a chip list swapping under a static title. */}
        <Rise key={`h-${stage}`}>
          <div className="px-6 pt-16 pb-2">
            <p className="text-accent font-sans text-[11px] font-semibold tracking-[1.8px] uppercase">
              Ambit · Setup · {stage + 1} of {FACETS.length}
            </p>
            <h1 className="text-ink-hi mt-[14px] text-[34px] leading-[1.12] font-semibold tracking-[-0.4px]">
              {STAGE_HEADINGS[facet]}
            </h1>
            <p className="text-ink/62 mt-3 text-[16px] leading-[1.55]">
              {stage === 0
                ? "Choose as many as you like. Ambit starts here — then wanders sideways into things you'd never think to search for."
                : `${FACET_LABELS[facet]} — pick any, or none.`}
            </p>
          </div>
        </Rise>

        <Rise key={`g-${stage}`} delayMs={80}>
          <div
            role="group"
            aria-label={`${FACET_LABELS[facet]} topics`}
            className="flex flex-wrap gap-[10px] px-6 pt-[22px] pb-[200px]"
          >
            {stageTopics.map((topic) => (
              <Chip
                key={topic.id}
                selected={selected.has(topic.id)}
                onClick={() => toggle(topic.id)}
              >
                {topic.label}
              </Chip>
            ))}
          </div>
        </Rise>
      </Column>

      <div className="from-bg to-bg/0 fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-62% pt-5 pb-10">
        <Column width="narrow" className="px-6">
          {error && (
            <div
              role="alert"
              data-testid="onboarding-error"
              className="text-error mt-[11px] text-center font-sans text-[12.5px]"
            >
              {error}
            </div>
          )}
          {/* Four dots; the active one is the accent. `aria-current="step"` is the screen-reader
              equivalent of the colour. */}
          <nav aria-label="Setup progress" className="mb-3 flex justify-center gap-2">
            {FACETS.map((f, i) => (
              <span
                key={f}
                aria-current={i === stage ? "step" : undefined}
                aria-label={FACET_LABELS[f]}
                className={cn(
                  "block h-[6px] w-[6px] rounded-full transition-colors",
                  i === stage ? "bg-accent" : "bg-ink/20",
                )}
              />
            ))}
          </nav>
          <div className="flex items-center gap-[14px]">
            <p aria-live="polite" className="text-ink/55 flex-1 font-sans text-[12.5px]">
              {countLabel}
            </p>
            {stage > 0 && (
              <Button shape="pill" size="md" variant="ghost" onClick={() => setStage((s) => s - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                shape="pill"
                size="md"
                disabled={remaining > 0}
                aria-busy={submitting}
                onClick={handleSubmit}
                className={cn(submitting && "pointer-events-none opacity-80")}
              >
                {ctaLabel}
              </Button>
            ) : (
              <Button shape="pill" size="md" onClick={() => setStage((s) => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </Column>
      </div>
    </main>
  );
}
```

Check `Button`'s props in `src/components/ui/button.tsx` for the secondary style's actual
`variant` name (it may be `"ghost"`, `"secondary"` or `"outline"`); use whatever exists. Keep
the file's existing long comments about the fixed bar and the column padding — they explain
things this rewrite keeps.

- [ ] **Step 4: Run — passes.** Then `bun run vitest run src/components/onboarding`.

- [ ] **Step 5: The page.** `src/app/onboarding/page.tsx`: replace the `TOPICS` import with
  `import { hasCompletedOnboarding, listTopics } from "~/server/db/topics";` and render:

```tsx
  const topics = await listTopics();
  return (
    <OnboardingScreen
      topics={topics.map((t) => ({ id: t.id, label: t.label, facet: t.facet! }))}
      minPicks={3}
    />
  );
```

(`facet!` is safe: `listTopics` filters on `facet IS NOT NULL`; say so in a comment.)

- [ ] **Step 6: Look at it.** `bun run dev`, sign in as a fresh invited user (`bun run invite
  you+stage@example.org`, then sign up on the landing page) and walk the four stages on a phone
  width and at 1440. Nothing here is styled beyond the existing screen; you are checking that
  every facet's chips appear and the bar's buttons don't collide with the count label at 402 px.
  If Back + Next + label overflow, put the label above the buttons row (`flex-col`) rather than
  shrinking text.

- [ ] **Step 7: Commit.**

```bash
git add src/app/onboarding/page.tsx src/components/onboarding/
git commit -m "feat(onboarding): four stages, one facet each, over the whole vocabulary"
```

---

### Task 7: `/profile/topics` — four tabs, save on every toggle; the row; the link; the sheet goes

**Files:**
- Create: `src/app/profile/topics/page.tsx`
- Create: `src/components/profile/topics-screen.tsx`
- Create: `src/components/profile/topics-screen.test.tsx`
- Modify: `src/components/profile/profile-screen.tsx` (~150: above the Collections heading)
- Modify: `src/components/settings/settings-screen.tsx:41, 68, 82-83, 128, 241-246, 322-328`
- Modify: `src/components/settings/settings-screen.test.tsx` (the topics-sheet cases)
- Delete: `src/components/settings/topics-sheet.tsx` (and any `topics-sheet.test.tsx`)

**Interfaces:**
- Route `/profile/topics` (protected; unauthenticated → `/`).
- `TopicsScreen` props: none — it reads `api.topics.list` and `api.topics.mine`, and (Task 8)
  `api.topics.weights` when `dev` is true. Signature `TopicsScreen({ dev }: { dev: boolean })`;
  Task 7 passes `dev={false}` from the page and Task 8 wires the real value.
- Tabs: `<div role="tablist" aria-label="Facets">` with four `role="tab"` buttons named by
  `FACET_LABELS`, `aria-selected` on the active one; one `role="tabpanel"` showing that
  facet's chips (`Chip`, `aria-pressed`).
- Every toggle calls `topics.setMine({ topicIds })` with the new full set; `topics.mine` is
  optimistically updated and invalidated on settle. Unpicking the last pressed chip is refused
  with the hint text `Keep at least one topic.` (role="status").

- [ ] **Step 1: Write the failing test** `src/components/profile/topics-screen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopicsScreen } from "./topics-screen";

const { mutateMock, invalidateMock, state } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  invalidateMock: vi.fn(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    mine: [] as string[],
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      topics: {
        mine: {
          invalidate: invalidateMock,
          cancel: vi.fn(),
          getData: () => state.mine,
          setData: (_input: unknown, updater: unknown) => {
            state.mine = typeof updater === "function" ? (updater as (p: string[]) => string[])(state.mine) : (updater as string[]);
          },
        },
      },
    }),
    topics: {
      list: { useQuery: () => ({ data: state.topics }) },
      mine: { useQuery: () => ({ data: state.mine }) },
      weights: { useQuery: () => ({ data: [] }) },
      setMine: { useMutation: (opts?: { onMutate?: (v: { topicIds: string[] }) => unknown }) => ({
        mutate: (v: { topicIds: string[] }) => { opts?.onMutate?.(v); mutateMock(v); },
        isPending: false,
      }) },
      resetWeights: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

const TOPICS = [
  { id: "alpha", label: "Alpha", facet: "subject" },
  { id: "beta", label: "Beta", facet: "subject" },
  { id: "gamma", label: "Gamma", facet: "medium" },
  { id: "delta", label: "Delta", facet: "look" },
  { id: "epsilon", label: "Epsilon", facet: "place" },
];

function pressed() {
  return screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
}

describe("TopicsScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    invalidateMock.mockReset();
    state.topics = TOPICS;
    state.mine = ["alpha"];
  });

  it("shows four tabs in facet order with Subject selected, and that facet's chips", () => {
    render(<TopicsScreen dev={false} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Subject", "Medium", "Look", "Place"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gamma" })).toBeNull();
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("a tab click switches the panel", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("tab", { name: "Medium" }));
    expect(screen.getByRole("button", { name: "Gamma" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
  });

  it("toggling a chip on saves the new full set immediately", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(new Set(mutateMock.mock.calls[0]![0].topicIds)).toEqual(new Set(["alpha", "beta"]));
  });

  it("toggling a chip off saves the set without it", () => {
    state.mine = ["alpha", "beta"];
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(mutateMock.mock.calls[0]![0].topicIds).toEqual(["alpha"]);
  });

  it("refuses to unpick the last topic and says so", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Keep at least one topic.");
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("renders no weights and no reset when dev is false", () => {
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("button", { name: "Reset weights" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails** (module not found).
  `bun run vitest run src/components/profile/topics-screen.test.tsx`

- [ ] **Step 3: Write the screen** `src/components/profile/topics-screen.tsx`. Read
  `profile-screen.tsx` first for the header pattern (the back affordance, `Column`, `Rise`) and
  copy its header structure rather than inventing one.

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Chip } from "~/components/ui/chip";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { cn } from "~/lib/utils";
import { FACETS, FACET_LABELS } from "~/server/config/topic-facets";
import type { TopicFacet } from "~/server/db/schema";
import { api } from "~/trpc/react";

// /profile/topics (docs/DESIGN_topic-facets-and-personas.md §3): every pickable topic, one tab
// per facet, every toggle saved at once. This is the picker Ben feel-tests the feed with, so it
// is built to be flipped constantly: no Done button, no confirmation, an optimistic `topics.mine`
// so the chip answers before the server does. The write is `setMine` with the full set — the
// same procedure onboarding uses — so `setUserTopics`'s weight-preserving replace applies to
// every flip: a topic kept across the write keeps its learned weight.
//
// `dev` (Task 8): under FEED_DEBUG each pressed chip shows its learned weight and a Reset
// button sets them all back to 1.0. The product build never renders a weight.

export function TopicsScreen({ dev }: { dev: boolean }) {
  const router = useRouter();
  const utils = api.useUtils();
  const topics = api.topics.list.useQuery();
  const mine = api.topics.mine.useQuery();
  const [facet, setFacet] = React.useState<TopicFacet>(FACETS[0]);
  const [hint, setHint] = React.useState("");

  const setMine = api.topics.setMine.useMutation({
    // Optimistic: the chip flips now, `topics.mine` is patched to the set we sent, and settle
    // re-reads the truth. On error the patch is rolled back to the snapshot.
    onMutate: async ({ topicIds }) => {
      await utils.topics.mine.cancel();
      const previous = utils.topics.mine.getData();
      utils.topics.mine.setData(undefined, topicIds);
      setHint("");
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.topics.mine.setData(undefined, ctx.previous);
      setHint("Couldn't save that — try again.");
    },
    onSettled: () => void utils.topics.mine.invalidate(),
  });

  const picked = new Set(mine.data ?? []);
  const tabTopics = (topics.data ?? []).filter((t) => t.facet === facet);

  function toggle(topicId: string) {
    const next = new Set(picked);
    if (next.has(topicId)) {
      if (next.size === 1) {
        // The mutation's floor is one (`min(1)`); refusing here keeps the chip honest instead of
        // letting it flip and snap back on the server's BAD_REQUEST.
        setHint("Keep at least one topic.");
        return;
      }
      next.delete(topicId);
    } else {
      next.add(topicId);
    }
    setMine.mutate({ topicIds: [...next] });
  }

  return (
    <main className="bg-bg min-h-dvh">
      <Column width="narrow">
        <Rise>
          <div className="px-5 pt-14 pb-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-ink/60 font-sans text-[13px]"
            >
              ← Profile
            </button>
            <h1 className="text-ink-hi mt-3 text-[28px] leading-[1.15] font-semibold tracking-[-0.3px]">
              Topics
            </h1>
            <p className="text-ink/62 mt-2 text-[15px] leading-[1.5]">
              {picked.size} on. Changes save as you go.
            </p>
          </div>
        </Rise>

        {/* Tabs scroll sideways below md rather than wrapping — four labels fit at 402 px, but a
            fifth (era, one day) would not. */}
        <div
          role="tablist"
          aria-label="Facets"
          className="border-ink/10 mx-5 mt-4 flex gap-6 overflow-x-auto border-b"
        >
          {FACETS.map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={f === facet}
              onClick={() => setFacet(f)}
              className={cn(
                "-mb-px shrink-0 border-b-2 pb-3 font-sans text-[14px] transition-colors",
                f === facet
                  ? "border-accent text-ink-hi"
                  : "border-transparent text-ink/55",
              )}
            >
              {FACET_LABELS[f]}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          aria-label={`${FACET_LABELS[facet]} topics`}
          className="flex flex-wrap gap-[10px] px-5 pt-5 pb-[140px]"
        >
          {tabTopics.map((t) => (
            <Chip
              key={t.id}
              selected={picked.has(t.id)}
              onClick={() => toggle(t.id)}
            >
              {t.label}
            </Chip>
          ))}
        </div>

        <p role="status" aria-live="polite" className="text-ink/55 px-5 font-sans text-[12.5px]">
          {hint}
        </p>
      </Column>
    </main>
  );
}
```

- [ ] **Step 4: Run — passes.**

- [ ] **Step 5: The route.** `src/app/profile/topics/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TopicsScreen } from "~/components/profile/topics-screen";
import { auth } from "~/lib/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata = { title: "Topics · Ambit" };

export default async function ProfileTopicsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  void api.topics.list.prefetch();
  void api.topics.mine.prefetch();

  return (
    <HydrateClient>
      <TopicsScreen dev={false} />
    </HydrateClient>
  );
}
```

- [ ] **Step 6: The profile row.** In `profile-screen.tsx`, directly above the
  `<div className="flex items-baseline gap-[9px] px-5 pt-[34px]">` Collections heading, add a
  row that links to the page. Read `topics.mine` in the screen (`const myTopics =
  api.topics.mine.useQuery();`) and render:

```tsx
            <Link
              href="/profile/topics"
              className="border-hairline border-ink/10 mx-5 mt-6 flex h-[52px] items-center justify-between border-b"
            >
              <span className="text-ink text-[15px] font-medium">Topics</span>
              <span className="text-ink/40 text-[13px]">
                {myTopics.data ? `${myTopics.data.length} on ›` : "›"}
              </span>
            </Link>
```

(`import Link from "next/link";` — check the file for how it links elsewhere and match it.)
Add `void api.topics.mine.prefetch();` to `src/app/profile/page.tsx`. Add one test to
`profile-screen.test.tsx`: the row renders with the count from `topics.mine` and links to
`/profile/topics` (extend that file's `api` mock with `topics: { mine: { useQuery: () => ({ data: ["a","b"] }) } }`).

- [ ] **Step 7: Settings.** In `settings-screen.tsx`: remove the `TopicsSheet` import (41),
  `"topics"` from `OpenSheet` (68), the `<TopicsSheet …/>` block (322–328); change the row to
  navigate: `onClick={() => router.push("/profile/topics")}` (the screen already has a router —
  check; if not, `useRouter` from `next/navigation`). Keep `topicValue` and the two queries that
  feed it. Delete `src/components/settings/topics-sheet.tsx` (`git rm`). In
  `settings-screen.test.tsx`, delete the tests that open the sheet and pick chips (the ones
  around lines 250–290 that assert `aria-pressed` inside the sheet), and add:

```tsx
  it("the 'What you see' row navigates to /profile/topics", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("What you see"));
    expect(pushMock).toHaveBeenCalledWith("/profile/topics");
  });
```

wiring `pushMock` into that file's `next/navigation` mock the way `replaceMock` is done in the
onboarding test.

- [ ] **Step 8: Run the three component suites + typecheck + lint.**

Run: `bun run vitest run src/components/profile src/components/settings && bun run typecheck && bun run lint`
Expected: clean. `grep -rn "topics-sheet\|TopicsSheet" src` returns nothing.

- [ ] **Step 9: Look at it.** `bun run dev`, `/profile` → Topics → flip chips on each tab,
  reload, confirm they stuck. Then `/settings` → What you see → lands on the page.

- [ ] **Step 10: Commit.**

```bash
git add -A src/app/profile src/components/profile src/components/settings
git commit -m "feat(profile): /profile/topics — four tabs over every topic, saved on each toggle; settings sheet retired"
```

---

### Task 8: Dev-gated weights on the page

**Files:**
- Modify: `src/server/db/topics.ts` (add `resetUserTopicWeights`)
- Modify: `src/server/db/topics.integration.test.ts`
- Modify: `src/server/api/routers/topics.ts` (add `weights`, `resetWeights`)
- Modify: `src/server/api/routers/routers.test.ts` (gate-off cases)
- Modify: `src/app/profile/topics/page.tsx` (`dev={await feedDebugEnabled()}`)
- Modify: `src/components/profile/topics-screen.tsx` + test

**Interfaces:**
- `resetUserTopicWeights(userId: string): Promise<number>` — sets every `user_topic.weight`
  for the user to `1.0`, returns the row count.
- tRPC `topics.weights: protectedProcedure.query → { topicId: string; weight: number }[]`
  and `topics.resetWeights: protectedProcedure.mutation → { reset: number }`. Both throw
  `FORBIDDEN` with message `topics.<name> is a dev affordance (FEED_DEBUG is off)` when
  `feedDebugEnabled()` is false — copy `feed.forgetSince` (`routers/feed.ts:107-118`) exactly.

- [ ] **Step 1: DB test.** Add to `topics.integration.test.ts`:

```ts
  it("resetUserTopicWeights puts every weight back to 1.0 and reports how many", async () => {
    const { bumpTopicWeight, getUserTopicWeights, resetUserTopicWeights, setUserTopics } = await import("./topics");
    await setUserTopics(userId, [topicA, topicB]);
    await bumpTopicWeight(userId, topicA);
    expect((await getUserTopicWeights(userId)).get(topicA)).toBeCloseTo(1.5);
    expect(await resetUserTopicWeights(userId)).toBe(2);
    const after = await getUserTopicWeights(userId);
    expect(after.get(topicA)).toBe(1);
    expect(after.get(topicB)).toBe(1);
  });
```

(use that file's existing user and topic fixture ids.) Run — fails. Implement in `topics.ts`:

```ts
/** Dev affordance (09-10-26, `/profile/topics` under FEED_DEBUG): every learned weight back to
 *  the default, so a feel test can start from a flat prior. Returns the row count. */
export async function resetUserTopicWeights(userId: string): Promise<number> {
  const { db } = await import("./client");
  const rows = await db
    .update(userTopic)
    .set({ weight: 1.0 })
    .where(eq(userTopic.userId, userId))
    .returning({ topicId: userTopic.topicId });
  return rows.length;
}
```

Run — passes.

- [ ] **Step 2: Router unit tests.** In `routers.test.ts`, find how `feed.forgetSince`'s
  gate-off test is written (search `forgetSince`) and add two of the same shape for
  `topics.weights` and `topics.resetWeights` expecting `FORBIDDEN`, plus the existing
  UNAUTHORIZED pattern for both. Run — fails (procedures missing).

- [ ] **Step 3: Procedures.** In `routers/topics.ts` add (importing `feedDebugEnabled` from
  `~/server/services/feed-debug` and the two DB functions):

```ts
  /** Dev only: each picked topic's learned weight, for /profile/topics's readout. */
  weights: protectedProcedure.query(async ({ ctx }) => {
    if (!(await feedDebugEnabled())) {
      throw new TRPCError({ code: "FORBIDDEN", message: "topics.weights is a dev affordance (FEED_DEBUG is off)" });
    }
    const map = await getUserTopicWeights(ctx.user.id);
    return [...map].map(([topicId, weight]) => ({ topicId, weight }));
  }),

  /** Dev only: every weight back to 1.0. */
  resetWeights: protectedProcedure.mutation(async ({ ctx }) => {
    if (!(await feedDebugEnabled())) {
      throw new TRPCError({ code: "FORBIDDEN", message: "topics.resetWeights is a dev affordance (FEED_DEBUG is off)" });
    }
    const reset = await resetUserTopicWeights(ctx.user.id);
    return { reset } as const;
  }),
```

Run — passes.

- [ ] **Step 4: Screen.** Add to `topics-screen.test.tsx`:

```tsx
  it("under dev, pressed chips show their weight and Reset weights calls the mutation", () => {
    state.weights = [{ topicId: "alpha", weight: 1.5 }];
    render(<TopicsScreen dev />);
    expect(screen.getByRole("button", { name: "Alpha · 1.5" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset weights" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });
```

(add `weights: [] as { topicId: string; weight: number }[]` to `state`, make the `weights`
mock return `state.weights`, and hoist a `resetMock` into the `resetWeights` mutation mock.)
Run — fails. Then in `topics-screen.tsx`:

```tsx
  const weights = api.topics.weights.useQuery(undefined, { enabled: dev });
  const resetWeights = api.topics.resetWeights.useMutation({
    onSuccess: () => void utils.topics.weights.invalidate(),
  });
  const weightOf = new Map((weights.data ?? []).map((w) => [w.topicId, w.weight]));
```

and render the chip label as
`{dev && picked.has(t.id) && weightOf.has(t.id) ? `${t.label} · ${weightOf.get(t.id)!.toFixed(1)}` : t.label}`.
Below the tabpanel, when `dev`:

```tsx
        {dev && (
          <div className="px-5 pb-[140px]">
            <button
              type="button"
              onClick={() => resetWeights.mutate()}
              className="border-hairline rounded-pill border-ink/18 text-ink h-[40px] px-5 text-[13px]"
            >
              Reset weights
            </button>
            <p className="text-ink/45 mt-2 font-sans text-[12px]">
              Dev only (FEED_DEBUG). Saves nudge a topic's weight up by 0.5, capped at 3.0.
            </p>
          </div>
        )}
```

Run — passes. In `page.tsx`: `import { feedDebugEnabled } from "~/server/services/feed-debug";`
and `<TopicsScreen dev={await feedDebugEnabled()} />`; prefetch `topics.weights` only when dev.

- [ ] **Step 5: `bun run typecheck && bun run lint && bun run vitest run src/server/api src/components/profile`** — clean.

- [ ] **Step 6: Commit.**

```bash
git add src/server/db/topics.ts src/server/db/topics.integration.test.ts src/server/api/routers/topics.ts src/server/api/routers/routers.test.ts src/app/profile/topics/page.tsx src/components/profile/topics-screen.tsx src/components/profile/topics-screen.test.tsx
git commit -m "feat(profile): learned weights and Reset weights on /profile/topics, behind FEED_DEBUG"
```

---

### Task 9: Twenty personas and `seed:personas`

**Files:**
- Create: `src/server/config/personas.ts`
- Create: `src/server/config/personas.test.ts`
- Create: `src/server/services/persona-seed.ts` (the logic — testable) and
  `scripts/seed-personas.ts` (the entry — `main()` on import, like every script)
- Create: `src/server/services/persona-seed.integration.test.ts`
- Modify: `src/env.js` (`PERSONA_PASSWORD` optional), `.env.example`, `package.json`
- Create: `.cache/seed-personas-prod.sh` (gitignored; the standing convention)

**Interfaces:**
- `export interface Persona { slug: string; name: string; age: number; gender: string; location: string; profession: string; taste: string; topics: readonly string[] }`
- `export const PERSONAS: readonly Persona[]` — the design doc's table, verbatim.
- `export function personaEmail(slug: string): string` → `persona-${slug}@ambit.local`.
- `export async function seedPersonas(opts: { password: string }): Promise<{ created: string[]; updated: string[]; unchanged: string[] }>`.

- [ ] **Step 1: Unit test** `src/server/config/personas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { PERSONAS, personaEmail } from "./personas";
import { TOPIC_FACETS } from "./topic-facets";

describe("PERSONAS", () => {
  it("is twenty people with unique slugs", () => {
    expect(PERSONAS).toHaveLength(20);
    expect(new Set(PERSONAS.map((p) => p.slug)).size).toBe(20);
  });
  it("every pick is a faceted topic, and everyone has at least one", () => {
    for (const p of PERSONAS) {
      expect(p.topics.length, p.slug).toBeGreaterThan(0);
      for (const t of p.topics) expect(TOPIC_FACETS[t], `${p.slug}: ${t}`).toBeDefined();
    }
  });
  it("emails can never match the e2e cleaner's pattern", () => {
    for (const p of PERSONAS) expect(personaEmail(p.slug)).toMatch(/^persona-[a-z0-9-]+@ambit\.local$/);
  });
});
```

Run — fails. Write `personas.ts` with a header comment that says what these are (test
readers for feel-testing; demographics are documentation, never stored; the design doc has the
same table) and the twenty entries **copied from the design doc's table**, e.g.:

```ts
  {
    slug: "maren",
    name: "Maren Holt",
    age: 34,
    gender: "woman",
    location: "Copenhagen",
    profession: "Architect",
    taste: "Clean lines, concrete, cold light.",
    topics: ["architecture", "geometric", "black-and-white", "photography", "furniture"],
  },
```

…through `sam`. `personaEmail` as above. Run — passes.

- [ ] **Step 2: Integration test** `persona-seed.integration.test.ts`. Pattern after
  `topics.integration.test.ts` (DB via dynamic import, `afterAll` cleanup). It must clean up:
  the twenty users' `user_topic`, `session`, `account`, `user` and `invite` rows — copy the
  delete order from `scripts/e2e-clean.ts`, which retires users the same way. Then:

```ts
describe("seedPersonas (integration)", () => {
  const password = "correct horse battery staple";

  it("creates all twenty on first run, changes nothing on the second, and re-syncs an edited pick", async () => {
    const { seedPersonas } = await import("./persona-seed");
    const { PERSONAS, personaEmail } = await import("~/server/config/personas");
    const { getUserTopicIds } = await import("~/server/db/topics");
    const { db } = await import("~/server/db/client");
    const { user } = await import("~/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const first = await seedPersonas({ password });
    expect(first.created).toHaveLength(20);

    const second = await seedPersonas({ password });
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged).toHaveLength(20);

    // A persona's picks are exactly the fixture's.
    const [maren] = await db.select().from(user).where(eq(user.email, personaEmail("maren")));
    expect(new Set(await getUserTopicIds(maren!.id))).toEqual(new Set(PERSONAS.find((p) => p.slug === "maren")!.topics));

    // Edit one pick in memory and re-run: exactly that user is "updated".
    const edited = PERSONAS.map((p) => (p.slug === "maren" ? { ...p, topics: ["architecture"] } : p));
    const third = await seedPersonas({ password, personas: edited });
    expect(third.updated).toEqual(["maren"]);
    expect(await getUserTopicIds(maren!.id)).toEqual(["architecture"]);
  });

  it("signs in with the shared password", async () => {
    const { auth } = await import("~/lib/auth");
    const { personaEmail } = await import("~/server/config/personas");
    const res = await auth.api.signInEmail({ body: { email: personaEmail("dev"), password }, asResponse: true });
    expect(res.ok).toBe(true);
  });
});
```

(`seedPersonas` takes an optional `personas` override for exactly this test.) Run — fails.

- [ ] **Step 3: Write `src/server/services/persona-seed.ts`:**

```ts
// Seeds the twenty personas (config/personas.ts) as real accounts — on the Mac and, through
// `docker exec`, in production (docs/DESIGN_topic-facets-and-personas.md §4). Each one goes in
// the front door: an invite row first (lib/auth.ts's `before` hook reads it), then Better
// Auth's own server-side sign-up so the hooks run and the hash is the real one, then the same
// weight-preserving `setUserTopics` the pickers use. Idempotent: a persona who exists is left
// alone unless the fixture's picks differ from the rows, in which case exactly those change.
import { eq } from "drizzle-orm";

import { PERSONAS, personaEmail, type Persona } from "~/server/config/personas";
import { getUserTopicIds, setUserTopics } from "~/server/db/topics";

export async function seedPersonas(opts: {
  password: string;
  personas?: readonly Persona[];
}): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> {
  const personas = opts.personas ?? PERSONAS;
  const { db } = await import("~/server/db/client");
  const { invite, user } = await import("~/server/db/schema");
  const { auth } = await import("~/lib/auth");

  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const p of personas) {
    const email = personaEmail(p.slug);
    await db.insert(invite).values({ email }).onConflictDoNothing();

    let [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    let isNew = false;
    if (!row) {
      const res = await auth.api.signUpEmail({
        body: { email, password: opts.password, name: p.name },
        asResponse: true,
      });
      if (!res.ok) {
        throw new Error(`sign-up failed for ${p.slug}: ${res.status} ${await res.text()}`);
      }
      [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
      isNew = true;
    }
    if (!row) throw new Error(`no user row for ${p.slug} after sign-up`);

    const have = new Set(await getUserTopicIds(row.id));
    const want = new Set(p.topics);
    const same = have.size === want.size && [...want].every((t) => have.has(t));
    if (!same) await setUserTopics(row.id, [...want]);

    if (isNew) created.push(p.slug);
    else if (same) unchanged.push(p.slug);
    else updated.push(p.slug);
  }
  return { created, updated, unchanged };
}
```

Check `invite`'s columns in `schema.ts` (line ~403) — if it has a `createdBy` or other
`notNull` field without a default, supply it (read `scripts/invite.ts` for what it inserts and
match). Run the integration test — passes. If `signUpEmail` complains about a missing
`callbackURL` or origin header, pass `headers: new Headers({ origin: env.BETTER_AUTH_URL })`
in the call (`env` from `~/env`).

- [ ] **Step 4: The script** `scripts/seed-personas.ts`:

```ts
// `bun run seed:personas` — see services/persona-seed.ts. The password is PERSONA_PASSWORD from
// the environment (Mac: .env; production: Coolify's environment), never a default: twenty
// accounts with a guessable password on a public host is not a test fixture, it is a hole.
import { seedPersonas } from "~/server/services/persona-seed";

const password = process.env.PERSONA_PASSWORD;
if (!password || password.length < 12) {
  console.error("PERSONA_PASSWORD is unset or under 12 characters — refusing to seed.");
  process.exit(1);
}

const r = await seedPersonas({ password });
console.log(`personas: ${r.created.length} created, ${r.updated.length} updated, ${r.unchanged.length} unchanged.`);
if (r.created.length) console.log(`  created: ${r.created.join(", ")}`);
if (r.updated.length) console.log(`  updated: ${r.updated.join(", ")}`);
console.log("Sign in as persona-<slug>@ambit.local with the shared password.");
process.exit(0);
```

`package.json`: `"seed:personas": "bun run scripts/seed-personas.ts"`. `src/env.js`: add
`PERSONA_PASSWORD: z.string().min(12).optional(),` in the server block with a comment
("the shared password for the twenty seeded personas — scripts/seed-personas.ts; optional so
the app boots without it") and its `runtimeEnv` line. `.env.example`: `PERSONA_PASSWORD=`
with the same one-line comment. Set a real value in your `.env` (not in any file that is
committed) and run `bun run seed:personas` — expect 20 created (or, if the integration test
left them, 20 unchanged — the test cleans up, so created).

- [ ] **Step 5: Sign in as one.** `bun run dev`, landing page, `persona-theo@ambit.local`, the
  password. Expect `/feed` (onboarding is complete because the seed wrote picks). Look at the
  feed; then `/profile/topics` to see Theo's six chips pressed.

- [ ] **Step 6: The prod script** `.cache/seed-personas-prod.sh` (gitignored — do not add):

```sh
#!/bin/sh
# Seeds the twenty personas in production (docs/DESIGN_topic-facets-and-personas.md §4). Needs
# PERSONA_PASSWORD in the container's environment — set it in Coolify → Environment first, then
# Redeploy (env changes need a restart). Idempotent; re-run after editing config/personas.ts.
set -e
HOST=ben@192.168.1.202
C=$(ssh $HOST 'docker ps -q --filter publish=3000')
ssh $HOST "docker exec $C bun run seed:personas"
```

- [ ] **Step 7: `bun run typecheck && bun run lint && bun run vitest run src/server/config src/server/services/persona-seed.integration.test.ts`** — clean.

- [ ] **Step 8: Commit.**

```bash
git add src/server/config/personas.ts src/server/config/personas.test.ts src/server/services/persona-seed.ts src/server/services/persona-seed.integration.test.ts scripts/seed-personas.ts src/env.js .env.example package.json
git commit -m "feat: twenty personas, seeded through Better Auth by bun run seed:personas"
```

---

### Task 10: Playwright — the helper, the ten specs, the new page

**Files:**
- Modify: `e2e/support.ts` (add `completeOnboarding`)
- Modify: the ten specs that contain `Start exploring`: `auth`, `dev-feed`, `feed`, `gallery`,
  `desktop`, `pwa.prod`, `item`, `saved`, `settings`, `security`
- Modify: `e2e/settings.spec.ts` (the "real settings rows" test's topics section)

**Interfaces:**
- `export async function completeOnboarding(page: Page, labels: string[]): Promise<void>` —
  presses each label's chip on whichever stage it appears on, walking Next until the CTA, then
  clicks Start exploring and waits for `/feed`.

- [ ] **Step 1: The helper.** Add to `e2e/support.ts`:

```ts
/**
 * Walks the four-stage onboarding (09-10-26), pressing every chip in `labels` on whatever
 * stage it appears, then Start exploring. The stages are Subject / Medium / Look / Place; a
 * label that is on no stage fails the test by name rather than silently landing on /feed with
 * fewer picks — the specs' fixtures depend on exactly which topics the user has.
 */
export async function completeOnboarding(page: Page, labels: string[]) {
  await page.waitForURL("/onboarding");
  const remaining = new Set(labels);
  for (let stage = 0; stage < 4; stage++) {
    for (const label of [...remaining]) {
      const chip = page.getByRole("button", { name: label, pressed: false });
      if (await chip.count()) {
        await chip.click();
        remaining.delete(label);
      }
    }
    if (stage < 3) await page.getByRole("button", { name: "Next" }).click();
  }
  if (remaining.size) throw new Error(`onboarding: no chip for ${[...remaining].join(", ")}`);
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.waitForURL("/feed");
}
```

- [ ] **Step 2: Replace the ten sites.** In each spec, the block

```ts
    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");
```

becomes `await completeOnboarding(page, ["Astronomy", "Botany", "Music"]);` (some specs
pick different labels — keep each spec's own list; some don't `waitForURL("/feed")` right after
— the helper does, and that is fine). Import it from `./support`. `grep -n "Start exploring"
e2e/` must return only `support.ts` afterwards.

- [ ] **Step 3: The settings spec.** Replace the "What you see" section of the "real settings
  rows" test with:

```ts
    // "What you see" reads back the three topics picked during onboarding, and opens the page.
    await expect(page.getByText("Astronomy, Botany, Music")).toBeVisible({ timeout: 15_000 });
    await page.getByText("What you see").click();
    await page.waitForURL("/profile/topics");
    // "Maps" is the chip label for `cartography` (a subject). One toggle saves at once.
    await page.getByRole("tab", { name: "Subject" }).click();
    await page.getByRole("button", { name: "Maps", pressed: false }).click();
    await expect(page.getByRole("button", { name: "Maps", pressed: true })).toBeVisible();
    // A grown topic on another tab is pickable too — the whole point of the cut.
    await page.getByRole("tab", { name: "Look" }).click();
    await page.getByRole("button", { name: "Surreal", pressed: false }).click();
    await expect(page.getByRole("button", { name: "Surreal", pressed: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Surreal", pressed: true })).toBeVisible({ timeout: 15_000 });
    await goTo(page, "/settings");
    await expect(page.getByText("Astronomy, Botany, Maps +2")).toBeVisible({ timeout: 15_000 });
```

(The e2e database is seeded by `db:seed`, so `surreal` exists there with its facet; the
`desktop` project runs the same spec at 1440.)

- [ ] **Step 4: Run the suite.**

Run: `bun run e2e:prod`
Expected: all green in both projects (49 + whatever this plan added). A red
`gallery.spec:193` or a red cursor-stability test is CLAUDE.md's known flake, not this plan —
check `main` before chasing. `bun run e2e:clean --confirm` if the dev DB has accumulated e2e
users.

- [ ] **Step 5: Commit.**

```bash
git add e2e/
git commit -m "test(e2e): completeOnboarding walks the four stages; settings spec covers /profile/topics"
```

---

### Task 11: Words — CLAUDE.md, SPEC, log; push

**Files:**
- Modify: `CLAUDE.md` (the "vocabulary grows" bullet: one sentence on facets and the rename;
  the dev-knob bullet's "core/grown/wild" → "original/grown/wild")
- Modify: `SPEC.md` §3.2 (onboarding: four stages over every faceted topic, floor of three),
  §7 (`topics.list` carries `facet`; `topics.weights`/`resetWeights` dev-only), §9 wherever it
  says `core` tier
- Modify: `docs/DESIGN_topic-vocabulary-growth.md` and `docs/DESIGN_feed-pool-sampling.md`:
  one italic line at the top of each — "*`core` tier renamed `original` 09-10-26; read
  accordingly.*"
- Modify: `log.md` — the day's entry (see CLAUDE.md's format; the spend line comes from the
  script it names, never estimated)

- [ ] **Step 1: Make the edits above.** Keep each to the sentence needed; this plan's design doc
  is where the reasoning lives.

- [ ] **Step 2: Full check.**

Run: `bun run check`
Expected: green except the known-red invariants test (Global Constraints). If format:check
fails, `bun run format:write` and re-run.

- [ ] **Step 3: Commit and push.**

```bash
git add CLAUDE.md SPEC.md docs/ log.md
git commit -m "docs: facets, the original tier, /profile/topics and personas in CLAUDE.md, SPEC and the log"
git push origin main   # or the branch, then merge to main and push — Ben's call at the time
```

- [ ] **Step 4: Production.** After the deploy that carries this: `bun run db:seed` has already
  run on boot (facets applied, tier renamed by the migration) — verify with the Task 2 Step 10
  query run inside the container. Set `PERSONA_PASSWORD` in Coolify, Redeploy, then
  `sh .cache/seed-personas-prod.sh`. Sign in as one persona on the phone.

---

## Self-review against the spec

- §1 vocabulary: Tasks 1–5 (column, map, seed, list, rename, promotion). ✔
- §2 onboarding: Task 6, with the floor-of-three deviation stated in the header. ✔
- §3 page: Task 7 (tabs, save-on-toggle, floor of one, profile row, settings link, sheet
  deleted, `md` column) + Task 8 (dev weights, reset, both procedures gated by
  `feedDebugEnabled()`). ✔
- §4 personas: Task 9 (fixture, script, invite + signUpEmail + setUserTopics, `@ambit.local`,
  `PERSONA_PASSWORD`, prod script, no demographics stored). ✔
- §5 tests: every bullet has a task — facet map unit + integration (2, 3), seed (2), router
  (3, 8), onboarding (6), page (7, 8), settings (7), persona seed (9), Playwright (10). ✔
- Out of scope list: nothing here touches mining thresholds, merges, era, visuals, or
  demographics. ✔
- Names used across tasks: `TopicFacet`, `FACETS`, `FACET_LABELS`, `ERA_TOPICS`,
  `TOPIC_FACETS`, `facetOf`, `applyTopicFacets`, `listTopics`, `resetUserTopicWeights`,
  `topics.weights`, `topics.resetWeights`, `TopicsScreen({ dev })`, `originalTopicIds`,
  `PERSONAS`, `personaEmail`, `seedPersonas`, `completeOnboarding` — each defined once, in the
  task that introduces it, and used with the same signature after. ✔
