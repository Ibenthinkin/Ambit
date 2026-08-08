# Phase 3.4 walkthrough — ingestion job (Phase 3 complete)

> Companion to [`PHASE3_PLAN.md`](PHASE3_PLAN.md) Task 5. Executed 08-07-26, cold pickup in a new
> session after 3.1/3.2/3.2b/3.3 (all five source adapters + the curation service). TDD for the
> pure logic (`resolveCollisions`); the orchestration script itself (`scripts/ingest.ts`) is thin
> and verified live rather than unit-tested, per the plan's file split.

## What shipped

- `src/server/services/ingest-plan.ts` — `resolveCollisions()`, the pure, testable core of SPEC
  §15's settled collision rule: group claims by `(source, sourceId)`, the winner is the lowest
  `rank` (highest search rank), ties break on the alphabetically-smallest `topicId`. Output is
  sorted by claim key rather than left in input order — that's what actually makes the function
  order-independent, the one property the whole design exists to guarantee (phase0's harvester
  picked a winner by scan order and silently starved whichever topic came first — SPEC §15).
- `src/server/services/ingest-plan.test.ts` — 6 tests: rank-wins, alphabetical tiebreak,
  order-independence (reversed input → identical winners, the property itself), no-collision
  passthrough, three-way collision counted once per source (not once per losing claim), and
  multiple independent collision groups resolved correctly together.
- `src/server/db/items.ts` — `upsertItem()` is real: insert, or on `(source, sourceId)` conflict,
  refresh content fields (title/summary/body/imageUrl/sourceUrl/attribution/license/tags/fetchedAt)
  while leaving `id`/`topicId`/`curationScore`/`aestheticTags` untouched — those were either
  assigned once (id) or paid for (a curator LLM call), and re-running ingestion should never
  silently reassign or re-bill them.
- `src/server/db/items.integration.test.ts` extended with an `upsertItem (integration)` block: a
  first insert, then a second call with the same `(source, sourceId)` but a **different** title,
  summary, topicId, and curationScore — asserts the row id is stable, title/summary update, and
  topicId/curationScore/aestheticTags are all preserved from the first call, not the second.
- `scripts/ingest.ts` — the orchestration script (SPEC §6.4, §13): reads topics from the DB (not
  `topics.ts` directly — the DB is the seeded source of truth), runs all five adapters in parallel
  (serial within each source, respecting each adapter's own politeness delay), collects `Claim`s,
  resolves collisions, skips anything already in the DB, runs `structuralFloor()` →
  `curateItems()` (or a free neutral-5 stand-in under `--skip-llm`), and `upsertItem`s the
  survivors. Prints a structured summary table (per-source searched/offered/errors/collisions,
  pipeline totals, per-topic inserted counts, elapsed time). Flags: `--source`, `--topic`,
  `--quota` (default 150, the target items per (topic, source) cell — split evenly across a
  multi-query cell), `--skip-llm`, `--dry-run`.
- `package.json`: `"ingest": "bun run scripts/ingest.ts"`.
- `SPEC.md` §15: multi-topic collisions moved from Open to **Settled by Phase 3.4**; a new Open
  bullet added for the live-search-nondeterminism finding below.
- `docs/BUILD_PLAN.md`: 3.4 checked, its stale "fetch, normalize, embed, upsertItem" wording fixed
  (no embedding happens at ingest — cut with the 0.4 pivot), Phase 3 heading's stale "embeddings"
  word dropped, Phase 3 marked complete.

## Live verification

### Structural dry run — free, no writes

`bun run ingest --quota 10 --skip-llm --dry-run`: all five sources searched across all sixteen
topics, zero search errors, real collisions surfaced (AIC 12, CMA 3 — AIC's relevance-ranked
search over its whole corpus overlapping heavily across topics is exactly the phase0 finding SPEC
§15 documents), structural floor dropped ~20% (160/782), and the would-insert count spread evenly
across all sixteen topics (31–45 each) with zero errors.

### Small live run — real curation (~$0.15)

`bun run ingest --quota 10`: 622 items inserted, curator progress logged in 10% increments, score
histogram skewed 7–9 as SPEC §15's calibration-drift note predicts (1×2, 2×8, 4×96, 6×11, 7×130,
8×217, 9×158), five sources all represented (103–154 each), zero errors.

### The idempotency gate

Ran the same command (`bun run ingest --quota 10`) two more times immediately:

| run | already in DB | new inserted | DB total after |
|---|---|---|---|
| 1 | 0 | 622 | 622 |
| 2 | 583 | 37 | 659 |
| 3 | 613 | 19 | 678 |

Not the literal "0 inserted" the plan predicted — investigated rather than assumed a bug (see
finding below) — but every property that actually matters checked out:

- **No duplication or data loss**: DB totals increment by exactly the reported "inserted" count
  each time (622 → 659 → 678), confirmed via `select count(*) from item`.
- **No re-scoring of existing items**: items already in the DB are filtered out by the
  `existingKeys` skip-existing check *before* `structuralFloor`/`curateItems` ever see them — a
  curator call is never re-billed for an item ingestion has already seen, exactly SPEC §6.4's
  "curation cache means re-runs only pay for genuinely new items" — verified directly here, not
  just by the disk-cache mechanism 3.3 already tested.
- **No topic starvation**: `select topic_id, count(*) from item group by 1 order by 2` shows a
  healthy 34–49 items per topic across all sixteen, astronomy included — a direct, real-data
  contrast with phase0's harvester, which starved astronomy to 4 of 419 usable AIC finds under its
  last-topic-wins dedupe (SPEC §15's original collision writeup).

### Finding: live search APIs aren't perfectly deterministic across separate calls

Investigated the non-zero re-run inserts rather than accepting them as a black box. A direct probe
— the same adapter, the same query, `limit: 10`, called twice in immediate succession, no ingestion
pipeline involved — confirmed the root cause is external, not a bug in `resolveCollisions` or
`upsertItem`:

```
wikipedia: identical=false
  run1: [..., "48364", "4428044", ..., "237122"]
  run2: [..., "45486742", "54044", ..., "315927"]
aic/cma/met/wellcome: identical=true (in this probe)
```

Wikipedia's `list=search` (CirrusSearch/Elasticsearch-backed) returned three genuinely different
page ids at the same rank positions across two back-to-back identical requests — not reordering,
different objects entirely. This is a known characteristic of Elasticsearch-backed relevance
search under tied scores and non-deterministic shard-level tiebreaking, not something ingestion
code can control. **3.3's walkthrough independently hit the same phenomenon** during its curator
smoke test ("a second live harvest pulled a slightly different set from the live search index, as
expected, growing the cache to 37 rather than re-billing the original 34") — this is a second,
larger-scale confirmation of the same live-API property, not a new or surprising one.

Ingestion has no HTTP response cache by design (SPEC's deliberate deviation from phase0 — the DB's
skip-existing check does that job for anything already *discovered*), so it has no way to make a
live search deterministic across separate calls. The practical effect is a small, convergent
trickle of genuinely new items on an immediate re-run (622 → +37 → +19) rather than an exact zero
— convergent because each run absorbs more of the boundary items into "already in DB," not because
anything is unbounded or duplicating. Recorded in SPEC §15 as a live-API characteristic to expect,
not a defect to fix.

### Full populate

`bun run ingest` (default quota 150, ~64 minutes, dominated by the Met's 400ms politeness delay)
— the real dev-DB population run:

- **7,825 items inserted, zero errors.** The summary reported only 662 "already in DB," short of
  the 678 the three earlier verification runs actually left behind — the missing 16 simply weren't
  rediscovered by *this* run's searches (the same live-API variance documented above cuts both
  ways: it can surface new items on a re-run, or fail to re-surface old ones), not lost data.
  `select count(*) from item` settles it directly: **8,503**, exactly 678 + 7,825 — every
  previously-inserted item is still there.
- **Collisions, visible per source**: aic 273, cma 130, wellcome 64, met 30, wikipedia 10 — AIC's
  dominance matches SPEC §15's original finding (its `/artworks/search` ranks over the *entire*
  132k-object corpus rather than filtering, so results overlap heavily across topics).
- **Structural floor dropped 1,734** (dup-title 1,265, bare-title 258, thin-summary 211) — 1,265
  duplicate-title drops out of 9,559 pre-floor candidates (~13%) is in the same range as phase0's
  finding that duplicated titles are a real, recurring museum-catalog pathology, not a fluke.
- **Per-topic distribution — no starved topics**: astronomy finished at **457** items (the exact
  contrast SPEC §15 asks for: phase0's last-topic-wins dedupe starved it to 4 of 419 usable AIC
  finds; the real collision rule leaves it healthy and in-range with every other topic).

  astronomy 457 · machines 459 · ceramics 459 · cartography 469 · textiles 475 · typography 478 ·
  geology 489 · poetry 515 · portraiture 556 · botany 573 · music 573 · the-ocean 589 ·
  architecture 598 · zoology 600 · mythology 605 · ancient-history 608

- **Final corpus (all runs combined), across the whole DB**:
  - **8,503 items** total.
  - By source: wikipedia 2,170, wellcome 1,952, cma 1,528, met 1,515, aic 1,338.
  - By curation score: mostly 7–9 as SPEC §15's calibration note predicts (7: 2,263, 8: 3,231,
    9: 1,563), a smaller filler tail (1: 58, 2: 115, 4: 1,107, 6: 158), and a near-empty 5/10 (the
    two ends the persona prompt rarely lands on for real museum/encyclopedia content).
  - 7,664 items (90%) carry an image; 839 (10%) are text-only — mostly Wikipedia articles whose
    lead image failed the per-file license check (SPEC §6.1), plus a handful of adapters' image-
    fetch misses.

## Findings for later tasks

- **Phase 4.1's feed algorithm now has a real corpus to tune against** — see the full-populate
  stats above for exact size/distribution.
- **Curator calibration** (SPEC §15's existing open item) can now be spot-checked against a
  corpus this size rather than the 3.3 smoke test's 40 items.
- If a future ingestion run needs closer-to-deterministic re-runs (e.g. for a reproducible test
  fixture), the fix is the same one phase0 used and this design deliberately dropped: an on-disk
  HTTP response cache keyed on the request URL, separate from the DB's skip-existing check.

## Next

Phase 3 is complete — all five source adapters, the curation service, `drawFromTopic`, and the
idempotent ingestion job are shipped and the dev DB is populated. Phase 4 (feed algorithm) can
build against a real corpus.
