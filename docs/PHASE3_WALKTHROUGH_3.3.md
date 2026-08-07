# Phase 3.3 walkthrough — curation service + `drawFromTopic`

> Companion to [`PHASE3_PLAN.md`](PHASE3_PLAN.md) Task 4. Executed 08-07-26, cold pickup in a new
> session after 3.1/3.2/3.2b (all five source adapters). TDD throughout: every function's tests
> were written and run to a failing state before its implementation.

## What shipped

- `src/server/services/curator.ts` — the taste layer (SPEC §6.2), ported from `phase0/curate.ts`:
  - `structuralFloor()` — the free, pure quality floor (dup-title / bare-title / thin-summary),
    unchanged in spirit from Phase 0.
  - `CURATOR_PROMPT` copied verbatim (it's a product artifact, not implementation detail) plus
    `CURATOR_MODEL` / `PROMPT_VERSION` as the cache key's two swappable halves.
  - `parseCuratorResponse()` split out as its own pure, unit-tested function — untrusted JSON in,
    a clamped score + ≤4 lowercase tags out, throws on an unusable score so the retry loop (not a
    silent bad cache write) is what handles it.
  - `curateItems()` — the concurrency-8 worker pool, cache-aside on disk (`.cache/curation/`,
    keyed `sha256(model|v<PROMPT_VERSION>|source:sourceId)`), image items judged from a downloaded
    base64 image (never the URL — museum servers bot-block provider-side fetchers), text-only
    fallback when the image can't be fetched, neutral score 5 on a judgment that fails all 4
    retries (an item is never silently dropped for a flaky LLM call).
- `src/server/db/items.ts` — `drawFromTopic()` is real:
  - `drawWeight(score, floor, power, sharedTags, boostPerTag)` exported standalone — the actual
    "taste" formula, pure and DB-free so it has a fast unit-test surface.
  - A hand-rolled weighted-sample-without-replacement (draw, remove, re-normalize) — pool sizes
    are topic-scoped hundreds of rows, so this is simple over cleverness.
  - `notInArray`'s empty-array footgun guarded (an empty `excludeIds` skips the clause instead of
    emitting invalid SQL).
- Tests: `curator.test.ts` (12), `items.test.ts` (4, pure `drawWeight` cases),
  `items.integration.test.ts` (5, real Postgres via `docker compose`, self-skips without
  `DATABASE_URL`) — 21 new, 85 total across the whole suite.
- `src/env.js`: `OPENROUTER_API_KEY` added, optional (only the ingest-time curator reads it, never
  a request path — `curateItems()` checks its own presence and throws a clear error at call time).
- `.gitignore`: `.cache/` (the curator's disk cache).
- `vitest.config.ts`: two infrastructure fixes, both below.

## Two build-time findings beyond the plan — both infrastructure, not curation logic

### 1. Vitest doesn't resolve the `~/*` tsconfig path alias on its own

Every adapter file so far (Phase 3.1/3.2/3.2b) used relative imports (`./sources/http`, etc.) —
convenient, but it meant nothing had yet exercised a test file that transitively imports a
`~/`-aliased module. `db/items.ts`'s `drawFromTopic()` needs `db/client.ts`, which imports
`~/env`; the moment `items.integration.test.ts` pulled that in, Vitest failed outright:
`Cannot find module '~/env'`. Next.js/`tsc` both read `tsconfig.json`'s `paths` automatically;
Vite's resolver doesn't. Fixed with an explicit `resolve.alias` in `vitest.config.ts` mirroring
the tsconfig mapping — a one-time fix that now covers every future test needing a `~/` import, not
just this one.

### 2. `bun run test` doesn't get Bun's automatic `.env` loading

`bun run dev`/`build`/`start` all force Bun's own runtime via `--bun` (per CLAUDE.md's documented
commands), which auto-loads `.env`. Vitest's own bin shebangs `#!/usr/bin/env node`, so
`bun run test` → `vitest run` actually executes under plain Node — no automatic `.env` load. The
practical effect: `items.integration.test.ts`'s `describe.skipIf(!process.env.DATABASE_URL)` saw
`DATABASE_URL` as unset even with `docker compose up -d` running and a real `.env` on disk, so
every integration test **silently self-skipped** — correctly, by design, but not what Step 6 of
the plan needed ("run integration tests against compose DB").

Considered forcing Vitest itself under Bun's runtime (`"test": "bun run --bun vitest run"`) since
that's the existing idiom — tried it, and it broke a different way: Bun's runtime resolves `zod`'s
package exports differently inside Vite's SSR transform pipeline, and `src/env.js`'s
`z.string()` call failed with `z.string is not a function`. Reverted. Instead, `vitest.config.ts`
now loads `.env` once itself via Node 24's built-in `process.loadEnvFile()`, wrapped in a
try/catch so it's a silent no-op in CI (no `.env` file there at all) rather than a crash — no new
dependency (`dotenv` isn't installed, and the plan is explicit that Task 4 adds none).

A third, related fix rides along with this: `drawFromTopic()` imports `db/client.ts`
**dynamically**, inside the function body, rather than at module scope. Without that, merely
*importing* `items.ts` — which `items.test.ts` does, just for the pure `drawWeight` tests — would
trigger `~/env`'s Zod validation. CI's `bun run test` step runs with **no env vars set at all**
(only the later `bun run build` step supplies `DATABASE_URL`/`BETTER_AUTH_SECRET`/
`BETTER_AUTH_URL`, per `.github/workflows/ci.yml`), so a static import there would fail the entire
test run before a single test executes — not a graceful skip, a hard crash unrelated to what that
test file is actually checking.

**Verified directly**, not just reasoned about: ran the full suite with a stripped environment
(`env -i PATH="$PATH" HOME="$HOME" bun run test`, i.e. no `.env`, no inherited vars at all — CI's
actual condition) — 85 passed, 5 correctly skipped, zero crashes. Then re-ran with `.env` restored
— all 85 pass, integration tests included.

## Live verification

- `scripts/curate-smoke.ts` (temporary, not committed — Step 7 of the plan): harvested 20
  Wikipedia + 20 Met items for "astronomy", ran `structuralFloor()` (40 → 34, 4 dup-title + 2
  bare-title) then `curateItems()` against the real OpenRouter API (~$0.01).
  - Score histogram was sensibly spread, not clustered at the top the way Phase 0.5's calibration
    note warned about: 2×1, 4×7, 6×1, 7×9, 8×10, 9×6.
  - Top 3 were genuinely striking museum objects — an astrolabe-motif bowl, an automaton clock
    depicting Urania (Muse of Astronomy), a Renaissance allegorical engraving — each with
    on-target aesthetic tags (`astrological chart`, `automaton`, `renaissance engraving`).
  - Bottom 3 were Wikipedia meta/list articles ("Patronage in astronomy", a journal name), exactly
    the catalog-filler judgment the persona prompt asks for.
  - Re-running immediately confirmed the disk cache works (34 files in `.cache/curation/` after
    the first run; a second live harvest pulled a slightly different set from the live search
    index, as expected, growing the cache to 37 rather than re-billing the original 34).
  - Script and `.cache/` deleted after verification — not part of the committed surface (only
    `scripts/ingest.ts`, Task 5, is the real caller of `curateItems()`).
- `bun run check` (typecheck → lint → format:check → unit tests) — green, 85 tests, both with and
  without `.env` present.

## Findings for later tasks

- **Task 5's ingestion job is the first real caller of `curateItems()` at corpus scale** — the
  40-item smoke run is a sanity check, not a throughput measurement. Worth watching cache-hit rate
  on a second full ingestion run (should approach 100% for unchanged items).
- **The dynamic-import-for-DB-client pattern established here** (`drawFromTopic`) is worth keeping
  in mind for any future pure-function-adjacent repository function — the same CI-has-no-env-vars
  constraint will recur.

## Next

Task 5 (3.4: ingestion job) — `scripts/ingest.ts` wires the five adapters, the collision-resolution
rule (highest-search-rank wins, settled in 3.1's planning), and this task's curation service
together into the idempotent job that actually populates the dev DB.
