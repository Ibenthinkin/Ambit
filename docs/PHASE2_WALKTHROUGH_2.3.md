# Phase 2.3 walkthrough — Topic seed data

A step-by-step account of BUILD_PLAN step 2.3 (the sixteen v1 topics as checked-in config, an
idempotent seed script, and the unit test that locks the topic-id contract). This closes
**Phase 2**. Planned and executed on 08-06-26 — the same day 2.2 shipped — with Ben planning on
Opus and executing on Sonnet, the plan-then-execute-cheaper workflow from 2.2. Plan file:
`~/.claude/plans/make-a-detailed-plan-witty-diffie.md`.

The interesting part of this step wasn't the code, which is small. It was discovering that the
Phase 0 warning the step was *built around* was mostly wrong.

## Getting oriented

1. Branched `phase-2.3-topic-seed-data` off `main` (conventional branch, per the standing
   preference).
2. Confirmed the shape of the work: the `topic` table already exists from migration
   `0000_open_jimmy_woo.sql` with exactly three columns (`id`, `label`, `seed_queries jsonb`) and
   was **empty**. `schema.ts:132-134` explicitly deferred the `seed_queries` *shape* to this step
   while settling the column itself in 2.1. **No migration was needed.**
3. Read the dependency chain that makes this step blocking: `item.topic_id` is
   `NOT NULL REFERENCES topic(id)`, so Phase 3.4 cannot ingest a single row until these sixteen
   exist.

## The investigation — a warning that didn't hold up

`phase0/NOTES.md:44-48` is emphatic:

> Abstract/design topics need object-vocabulary seed queries against museums (`type specimen`,
> `letterpress`, `broadside`) … **Budget real time for seed-query tuning in step 2.3** — one term
> per topic will not work across sources.

It names six weak topic×source cells in the curated corpus as evidence. The planning session set
out to fix all six, then measured them instead of trusting them — and found **three different
causes had been conflated under one label.**

### Cause 1 — the dedupe artifact (four of the six cells)

`phase0/harvest.ts:619` dedupes with a Map keyed on `source:sourceId`. Its own comment says
duplicate keys overwrite, so **the last topic in `TOPICS` order wins**. That's harmless if topics
return disjoint results. AIC does not: its `/artworks/search` is a **relevance ranking over the
entire 132,681-object corpus, not a filter** — `pagination.total` comes back as 132681 for
*every* query — and `harvest.ts` pages 600 candidates deep per topic, so the result sets overlap
enormously.

Measured live against the AIC API:

```
astronomy usable @600 deep:                        419
union of the 15 later-ordered topics:            3,311
astronomy ids also claimed by a later topic:       415
astronomy ids surviving last-wins dedupe:            4   ← items.json says exactly 4
```

Reproduced to the item. Astronomy is 1st in `TOPICS` order and Machines 3rd, so they lose nearly
every collision — and the raw AIC counts track list position almost monotonically (Astronomy 4,
Machines 1, … Portraiture 142, Geology 150). Adding seed queries for these cells would have been
fixing a phantom.

A second, independent confirmation was already sitting in the notes: `NOTES.md:209` records that
the earlier "AIC + typography returns 0 usable items" verdict from 0.2 was itself an artifact
(of not paging far enough), not a density floor.

### Cause 2 — the curation floor (two cells)

Comparing `items.json` (raw harvest) against `items.curated.json` per topic×source separated
"never fetched" from "fetched then cut":

| Cell | raw → curated | |
|---|---|---|
| Textiles / Met | 150 → **6** | 4% survival — a full quota harvested, then destroyed by `curate.ts` |
| Ceramics / Met | 150 → 57 | 38% |
| Machines / Met | 149 → 48 | 32% |
| Architecture / Met | 149 → 62 | 42% |

These are curation-floor outcomes (the Met's catalogue boilerplate and bare-noun titles hitting
the structural quality rules), not seed-query outcomes. Nothing 2.3 can do about them.

### Cause 3 — genuinely bad queries (four cells, all CMA and Met)

Only these were real, and each was verified against the live API before being changed:

| Source | Query | Hits |
|---|---|---|
| CMA | `typography` | **0** ← the one truly empty cell in the matrix |
| CMA | `calligraphy` / `letterpress` | 279 / 30 |
| CMA | `astronomy` → `celestial` / `moon` | 23 → 106 / 368 |
| CMA | `cartography` / `map` / `globe` / `atlas` | 17 / 35 / 41 / 5 |
| Met | `typography` | **39** — a real corpus limit |
| Met | `letterpress` / `calligraphy` / `broadside` | 1,044 / 2,665 / 256 |

`star` (193 CMA hits) and `printing type` (4,573 Met hits) were **rejected despite good counts**
as too broad — `star` matches decorative star motifs on quilts and ceramics far more often than
anything astronomical.

**Honest limitation, recorded in the plan and repeated here:** these are raw search totals, not
curated yield. They prove a query isn't *empty*; they don't prove its results survive the Phase
3.3 curation floor. Real yield is only measurable at 3.4.

So the "budget real time for tuning" warning was directionally right about *one* thing —
`typography` really is the problem child across three sources — and wrong about the scale.

## The code

### `src/server/config/topics.ts`

Sixteen entries, ordered alphabetically by id to match `topic-graph.json`'s key order so the two
can be diffed by eye. Queries ported verbatim from `phase0/harvest.ts:78-99` except the four
retuned cells, each carrying an inline comment with its measured counts.

The type question the schema left open (`schema.ts:135` declares
`type SeedQueries = Record<string, string[]>`, unexported) was settled by **narrowing in the
config only**:

```ts
export const V1_SOURCES = ["wikipedia", "met", "aic", "cma", "wellcome"] as const;
export type SeedQueries = Record<V1Source, string[]>;
```

`Record<V1Source, string[]>` is assignable to `Record<string, string[]>`, so **`schema.ts` was
not touched and no migration was generated**. The DB column stays deliberately open — Phase 6 adds
Smithsonian/NASA/etc., and `item.source` is already an open set by design (`schema.ts:154`) — while
the config gets real typo-checking across sixteen rows. Arrays rather than single strings because
that's what makes future tuning a config edit instead of a migration.

`cartography` keeps its **slug** (it's a graph key) but takes the handoff's **label** "Maps", per
the mapping settled 07-17-26.

### `scripts/seed-topics.ts` (`bun run db:seed`)

Follows `scripts/invite.ts` for shape (no env bootstrapping — `client.ts` imports `~/env` and Bun
auto-loads `.env`; explicit `process.exit(0)` because the postgres.js pool keeps the process
alive; top-level `.catch` with `exit(1)`), but deliberately **inverts its idempotency idiom**:

- `invite.ts` reads first and bails if the row exists — an invite is user data, re-running must
  never overwrite it.
- `seed-topics.ts` upserts with `onConflictDoUpdate` — topics are *config*, so editing
  `topics.ts` and re-seeding **should** push the change through.

Same goal (a second run is safe), opposite treatment of an existing row, because the two kinds of
data want opposite things. This is the **first `onConflict*` use in the repo**.

It classifies each entry as new/changed/unchanged *before* writing so the summary reports what
actually happened, and warns (never deletes) on DB rows absent from config — a stale topic is
almost certainly still referenced by `item.topic_id` or `user_topic.topic_id`.

### `src/server/config/topics.test.ts`

Ten assertions, the load-bearing one being **set equality between the config ids and
`topic-graph.json`'s keys**, plus a check that every neighbour row references only known topics.
The feed's DRIFT walk and JUMP draw both look topics up by id (SPEC §9), so a mismatch would
surface as a runtime feed bug rather than a test failure. Recomputing the graph in Phase 6 is
exactly the change that could break this silently.

Had to live under `src/` — `vitest.config.ts` has `include: ["src/**/*.test.ts"]`, so a test in
`scripts/` would never run. This also establishes the repo's first JSON import
(`resolveJsonModule` was already on but unused); it worked under Vitest with no fuss.

**The test was mutation-checked rather than assumed**: renaming `zoology` → `zoologyy` in config
failed exactly the two graph-contract assertions and left the other eleven green, then the revert
restored all thirteen. A guard that can't fail isn't a guard.

## Verification (the Done line)

```
bun run db:migrate      → no pending migrations, as expected (none added)
bun run db:seed         → "Seeded 16 topics: 16 new, 0 updated, 0 unchanged."
bun run db:seed         → "16 topics already up to date — nothing to do."
bun run check           → typecheck, lint, format, 13 tests — all green
```

In Postgres: 16 rows; 80 id×source key pairs (16 × 5, so no source is missing anywhere);
`cartography` labelled `Maps`; the retuned cells carrying 3, 3 and 2 queries.

Then the re-sync proof: edited `cartography`'s label to "Charts", re-seeded → `1 updated,
15 unchanged` and the DB read back `Charts`; reverted and re-seeded → back to `Maps`. That
confirms the upsert genuinely re-syncs config rather than silently no-opping.

## The bug the verification caught

The **second seed run reported "16 updated" instead of "16 unchanged"** — the definition of done
was "a second run is a no-op", so this was a real failure, not cosmetic.

Cause: change detection compared `JSON.stringify(row.seedQueries)` against the config object.
**JSONB is not a verbatim copy of the JSON it's given** — Postgres normalizes object key order
(shortest key first, then bytewise), so what went in as `{wikipedia, met, aic, cma, wellcome}`
came back as `{aic, cma, met, wellcome, wikipedia}` and the strings never matched.

```
the-ocean | {"aic": ["sea"], "cma": ["sea"], "met": ["ocean"], "wellcome": ["sea"], "wikipedia": ["ocean"]}
```

The stored *data* was correct throughout; only the reporting was wrong. Fixed with a
`seedQueriesEqual` helper that walks the fixed `V1_SOURCES` key list instead of stringifying.
Array order *inside* each source is meaningful and **is** preserved by JSONB, so it's still
compared positionally.

Worth remembering beyond this step: any future "has this JSONB column changed?" check in this
codebase has the same trap waiting.

## Notable judgment calls

- **Measured the Phase 0 warning instead of executing against it.** The step was scoped around
  fixing six weak cells; four turned out to be a harvester artifact and two a curation outcome.
  Acting on the note as written would have added seed queries that fixed nothing and quietly
  encoded a wrong diagnosis into config.
- **Rejected two high-count queries** (`star`, `printing type`) on judgment rather than taking the
  numbers at face value — hit count is not relevance.
- **Dropped the dead term entirely** from Typography/CMA rather than keeping `typography` in the
  array for appearances. It is measurably 0.
- **Did not solve the collision problem.** It's an ingestion-design decision that wants the real
  adapters in front of it, so it's recorded in SPEC §15 as a named Phase 3.4 open question with
  the reproduction numbers attached, and 2.3 stayed shippable.
- **Did not touch `schema.ts`.** Narrowing the type in config alone got the safety without a
  migration or a constraint on Phase 6.

## Forward consequence for 3.4

SPEC §5.1's `(source, source_id)` UNIQUE plus a single-valued `item.topic_id` means the real
ingestion hits **the identical collision**. Recorded in SPEC §15: whatever rule 3.4 picks
(first-wins / highest-search-rank-wins / an item carrying a topic set) must be order-independent,
and the ingestion log should surface collision counts so this can't recur invisibly.

Secondary caveat also recorded: `topic-graph.json` was built from `items.curated.json`, so the
**Astronomy and Machines centroids were computed from AIC-starved samples**. Both still had 350+
curated items across the other four sources and their bridges read as intellectually sound
(Astronomy → Cartography 0.1393, Mythology 0.0663), so it's a footnote to revisit after 3.4's real
ingestion — not a blocker.
