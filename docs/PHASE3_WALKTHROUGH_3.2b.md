# Phase 3.2b walkthrough — CMA + Wellcome adapters

> Companion to [`PHASE3_PLAN.md`](PHASE3_PLAN.md) Task 3. Executed 08-07-26, same session as 3.1
> and 3.2, completing the five-adapter registry.

## What shipped

- `src/server/services/sources/cma.ts` — the Cleveland Museum of Art adapter. Friendliest API of
  the five: no key, one search call can cover a whole topic's quota (`limit` up to 1000), full
  records in the response.
- `src/server/services/sources/wellcome.ts` — the Wellcome Collection adapter. Per-item license
  heterogeneity means every hit's own `thumbnail.license.id` is re-checked against the open set
  (`cc-0`, `cc-by`, `pdm`), the same trust-nothing pattern as every other adapter's search filter.
- `src/server/services/sources/index.ts` — the complete five-adapter registry
  (`Record<SourceId, SourceAdapter<unknown>>`), which `scripts/probe-adapter.ts` now imports
  directly instead of wiring each adapter up by hand.
- `stripHtml()` added to `normalize.ts` (with its own unit tests) — a new shared helper, not
  anticipated in the plan.
- `__fixtures__/cma.json` (5 records) and `__fixtures__/wellcome.json` (4 records).
- 20 new unit tests (64 total across the whole `sources/` suite) — all passed on the first run
  after implementation, no debugging cycle needed (unlike 3.1's underscore bug and 3.2's fixture
  mislabel — the fixture-then-test-then-implement discipline is paying off).

## Two real findings beyond what the plan anticipated

### 1. CMA's `description` field carries raw HTML

Not mentioned anywhere in `phase0/NOTES.md` — the throwaway harvester stored `description` but
never rendered it anywhere, so nobody noticed. Live fixture-gathering for this task found real
examples: `<em>Erato, Muse of Lyrical Poetry</em> belongs to a cycle...` and, more dangerously,
`<br><br>` sitting directly between a period and the next word (`poetry.<br><br>Here, <em>Iupiter
</em>`). CLAUDE.md is explicit — "Never render unsanitized source HTML" — so this needed handling,
not just noting.

Added `stripHtml()` to `normalize.ts`: replaces each tag with a **space**, not nothing, specifically
because naive tag removal on the `<br><br>Here` case would jam `poetry.` and `Here` into one word
(`poetry.Here`). A dedicated unit test in `normalize.test.ts` guards exactly that failure mode.
Called before `toLede()` in `cmaSummary()`, so the resulting extra whitespace gets collapsed by
the existing whitespace-collapse step — no double work.

### 2. Wellcome's thumbnail-rewrite regex only covered half of live URL shapes

The plan ported phase0's regex verbatim (bracket form `!200,200` → `!800,800`, no-op otherwise).
While live-verifying, a quick survey across four searches (astronomy, anatomy, botany, machinery,
80 results total) found the **plain-width form** (`300,`, no `!`, empty height segment) is nearly
as common as the bracket form — 47 vs 33. Under the original regex, every one of those 47 stayed
stuck at whatever narrow default width the search API happened to return.

Checked whether widening was even safe first — AIC's IIIF server 403s a plain-width request wider
than the original (the `843,` trap from Phase 0), so blindly doing the same thing to Wellcome
without checking would repeat that mistake. Live-verified via `curl -I` and a file-size comparison
instead: Wellcome's `/full/800,/0/default.jpg` returns `200` and a genuinely larger file (222KB vs
47KB against the same source image at `/full/300,/0/`), not a re-served original. Safe to widen.
Extended the regex (`/\/full\/!?[0-9]*,[0-9]*\//`) to match both shapes and rewrite both to the
same `!800,800` fit-in-box target, so card sizing is consistent regardless of which shape a given
Wellcome record happened to arrive in. Re-verified against 5 fresh live search results afterward —
every image URL now carries `!800,800` regardless of its original shape.

## Live verification

- `bun run probe cma botany --limit 5` — 5/5 CC0 images, summaries visibly lead with prose
  description (the Phase 0.2 "subject before medium" fix, true at the source for CMA), no `<`
  characters visible in any summary.
- `bun run probe wellcome astronomy --limit 5` — 5/5 Public Domain Mark images, `astronomy` /
  `telescopes` / `celestial` etc. in tags.
- Standalone script confirmed `wellcomeImageUrl`'s fix against 5 fresh live results (all `!800,800`
  regardless of original shape) and re-ran the wikipedia/wellcome probes through the new shared
  registry to confirm nothing broke in the `probe-adapter.ts` refactor.
- `bun run check` (typecheck → lint → format:check → unit tests) — green, 64 tests.

## Findings for later tasks

- **AIC's absent-vs-false lesson (3.2) generalizes further here**: trust nothing about a field's
  *shape*, not just its presence or value — CMA's HTML-bearing description and Wellcome's two
  incompatible thumbnail-URL shapes are both "the docs didn't mention this" surprises the live
  probe step exists to catch. Task 5's ingestion job should expect more of these once it's running
  against the full corpus rather than five-item samples.
- **`stripHtml()` is now available for any future source** whose fields carry markup — worth
  checking if Smithsonian or Public Domain Review (Phase 6 backlog, SPEC §6.2) need it too.

## Next

Phase 3.1/3.2/3.2b (all five source adapters) are complete. Task 4 (3.3: curation service +
`drawFromTopic`) is next — the taste layer that turns these adapters' raw output into what the
feed actually draws from.
