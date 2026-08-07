# Phase 3.2 walkthrough — Met + AIC adapters

> Companion to [`PHASE3_PLAN.md`](PHASE3_PLAN.md) Task 2. Executed 08-07-26, same session as 3.1,
> reusing its shared plumbing (`types.ts`, `http.ts`, `normalize.ts`) and its
> `scripts/probe-adapter.ts` live-verification CLI.

## What shipped

- `src/server/services/sources/met.ts` — the Met adapter. `search()` is a real N+1 shape: one
  search call returns bare object IDs, then one `GET /objects/<id>` per candidate at a 400ms
  politeness delay (`MET_DELAY_MS` — go faster and the Met starts silently 403ing). `isMetServable()`
  is exported separately from `toItem()` so later callers (the ingestion job, Task 5) can filter
  before paying for anything downstream — it exists because **the Met's own
  `isPublicDomain=true` search filter lies**: this task's live fixture-gathering re-confirmed the
  Phase 0 finding directly, finding real "machine"-search hits (`745853`, `490889`) that came back
  from a `hasImages=true&isPublicDomain=true` search yet have `isPublicDomain: false` on their own
  object record.
- `src/server/services/sources/aic.ts` — the AIC adapter. One search call returns full records (no
  N+1 pattern, unlike the Met), paginated at `AIC_PAGE_SIZE = 100` (AIC 403s "Invalid limit" above
  100 — undocumented hard cap, not a rate limit). `isAicServable()` is AIC's own equivalent check —
  different reason than the Met's (AIC's search has *no* public-domain filter at all, so every hit
  needs the check regardless), and this task found a sharper edge case than Phase 0 recorded:
  `is_public_domain` can be **entirely absent** from a record, not just `false` — the servability
  check treats "missing" as "no" (`Boolean(undefined && …)` is falsy, so this fell out for free,
  but the fixture explicitly hand-edits a record to have the key removed to prove it, rather than
  trusting the type system alone). `aicImageUrl()` is exported separately to unit-test the
  `!843,843` fit-in-box IIIF sizing (never the docs' plain `843,`, which 403s on any original
  narrower than 843px).
- Both registered in `scripts/probe-adapter.ts`.
- `__fixtures__/met.json` (5 records) and `__fixtures__/aic.json` (5 records), both recorded live
  against real "astronomy"/"machine" searches on 08-07-26.
- 11 new unit tests (44 total across the whole `sources/` suite).

## A real fixture surprise, caught before it became a bad test

While building the AIC fixture, an initial pass at labeling records assumed one hit
(`158950`, "Adler Planetarium and Astronomy Museum Addition") had `is_public_domain` entirely
absent from its raw record — based on a truncated debug print that happened to cut off right
before that field. The actual live data has it explicitly `false`, not absent. Caught by running
the test and seeing `expected true to be false` rather than the expected pass, which is exactly
what fixture-based testing is supposed to catch: a wrong assumption about live data shape gets
falsified immediately rather than baked into a passing-but-meaningless test. Fixed by hand-editing
that one fixture record to genuinely remove the key (documented inline via `_fixtureNote`), and
using a different real record (`200358`) for the "explicitly `false`" case — so both edge cases
stay covered by real API shapes wherever possible, and the one hand-edited case is clearly marked
as such (same pattern 3.1 used for Wikipedia's non-free-image case).

## Lint findings

`bun run lint` flagged 12 real `prefer-nullish-coalescing` errors across both adapters (`||` where
the left-hand type includes `undefined` and the project's ESLint config wants `??`). Verified each
swap was semantically safe before applying it: every flagged expression feeds into a later
`.filter(Boolean)` in the summary-construction pipeline, which treats `""` and `null`/`undefined`
identically — so switching `x || null` to `x ?? null` only changes the *intermediate* value (empty
string survives instead of becoming `null`), never the final output. `who || null` (a plain
`string`, never `undefined`) was correctly left alone — the lint rule doesn't fire on it because
`??` and `||` would be behaviorally identical there.

## Live verification

- `bun run probe aic typography --limit 5` — 5/5 items with images (CC0), tag counts 4–8, 1.2s.
- `bun run probe met astronomy --limit 5` — 5/5 items with images, summaries read exactly as Phase
  0 predicted (catalogue-fields-first: artist/date/medium before the subject-bearing tags, e.g.
  "ca. 1775. Oak and beech, carved and painted. Woodwork. European Sculpture..."), 2.9s — slower
  than every other adapter by design (the 400ms per-object delay is doing its job).
- `bun run check` (typecheck → lint → format:check → unit tests) — green, 44 tests.

## Findings for later tasks

- **The Met's N+1 shape makes it the throughput bottleneck of the five adapters.** Task 5's
  ingestion job should expect the Met to dominate wall-clock time on a full run — the plan's
  ~1–1.5h full-populate estimate is mostly Met object fetches, not the other four sources combined.
- **AIC's absent-vs-false distinction is worth remembering for CMA/Wellcome (Task 3)** — trust
  nothing about a field's presence, not just its value, when a source's docs describe a filter
  that isn't actually enforced consistently.

## Next

Task 3 (3.2b: CMA + Wellcome adapters) — completes the five-adapter registry
(`sources/index.ts`), which Task 5's ingestion job imports directly.
