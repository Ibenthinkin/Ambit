# Phase 3.1 walkthrough — adapter contract + Wikipedia

> Companion to [`PHASE3_PLAN.md`](PHASE3_PLAN.md) Task 1. Executed 08-07-26 in the same session
> that wrote the plan (Ben switched to Sonnet 5 and asked for direct execution rather than the
> plan-then-execute-cheaper split used for Phase 2). Same TDD-per-step discipline as the prior
> phase walkthroughs.

## What shipped

- `src/server/services/sources/types.ts` — `SourceId`, `NormalizedItem`, `FetchOpts`,
  `SourceAdapter<Raw>` (SPEC §6.1). `search()`'s return order is load-bearing: the array index is
  the item's search rank, which the ingestion job's collision rule (3.4, "highest search rank
  wins") depends on.
- `src/server/services/sources/http.ts` — `fetchJson()`, the shared fetch-with-retry helper
  (1s→3s→9s backoff + jitter, 4 attempts), ported from `phase0/harvest.ts`'s `getJson` minus its
  on-disk cache. The cache isn't missed: the DB's skip-existing check in the real ingestion job
  (Task 5) is the actual "don't re-buy what you already have" layer now.
- `src/server/services/sources/normalize.ts` — `toLede()` (sentence-boundary-aware truncation) and
  `uniqueTags()`, ported verbatim in spirit from `phase0/harvest.ts`.
- `src/server/services/sources/wikipedia.ts` — the adapter. `search()` does three request shapes:
  1. Search (`list=search`) → filter out `List of…`/`Index of…`/disambiguation titles.
  2. Batched intro-detail (`exintro=1`, 20 pages/call — TextExtracts' cap) → drop stubs under
     200 chars, same floor phase0 used.
  3. Batched `imageinfo&iiprop=extmetadata` (≤10 `File:` titles/call) → resolve each lead image's
     license, keep the image only when free.

  `fetchBody()` is separate and NOT called from `search()` — full-article extracts are capped at
  **one page per request** (unlike the 20-page intro batch), so it's deliberately left for the
  ingestion job to call only on items that survive the structural floor + collision resolution,
  rather than paying for text nobody will curate.
- `scripts/probe-adapter.ts` (`bun run probe <source> <query> [--limit N]`) — the live-verification
  CLI the plan calls for once and every later adapter task reuses.
- `src/server/services/sources/__fixtures__/wikipedia.json` — 5 recorded/hand-edited cases: free
  image (public domain), free image (differently-shaped license string), no lead image, non-free
  lead image (hand-edited — the live sample of real articles didn't happen to produce one), and a
  full-body case.
- 33 unit tests across `normalize.test.ts` (9) and `wikipedia.test.ts` (11), plus the 13 pre-existing
  `topics.test.ts`/`utils.test.ts` cases — all green.

## Decisions this task recorded into SPEC (§6.1)

Both were settled during planning (`docs/PHASE3_PLAN.md`), landed here:

1. **Wikipedia image licenses are resolved at ingest**, not skipped. Batched `imageinfo` calls,
   free-license predicate `isFreeImageLicense()`, text-only fallback otherwise.
2. **All five v1 adapters land in Phase 3**, not three — noted against §6.1's adapter-phasing
   bullet; the actual CMA/Wellcome work is Task 3 (3.2b).

## A real bug the live probe caught

The first `bun run probe wikipedia astronomy --limit 5` run returned zero images across all 5
items — including "Sun," which unambiguously has a free-licensed lead image. Debugging with raw
`curl` found the cause: **MediaWiki normalizes `File:` title underscores to spaces in the
`imageinfo` response**, but the adapter's license lookup was still keyed on the raw underscored
`pageimage` value (`"The_Sun_in_white_light.jpg"`) it sent in the request. Every lookup silently
missed. Confirmed live:

```json
"normalized": [{ "from": "File:The_Sun_in_white_light.jpg", "to": "File:The Sun in white light.jpg" }]
```

Fixed by normalizing both the outbound request titles and the inbound lookup key through the same
`toFileTitle()` helper (`.replace(/_/g, " ")`). Re-running the probe against `astronomy` and
`typography` afterward showed images resolving correctly (3/5 and 4/5 items respectively carried a
free-licensed image). This is exactly the kind of thing fixtures alone wouldn't have caught — the
fixture file encodes the *correct* mapping by construction, so only a live call exposed the bug,
which is why the plan's Step 8 (live verification) is a hard requirement, not an optional
nice-to-have.

## Live verification

- `bun run probe wikipedia astronomy --limit 5` — clean items, 3/5 with resolved free images,
  ledes read as real prose, no crashes.
- `bun run probe wikipedia typography --limit 5` — 4/5 with images, tag counts look right,
  fast (0.8s).
- `fetchBody(50650)` (Astronomy) — 29,503-char full body returned, confirms the separate
  single-page body fetch works outside the batched intro-extract path.
- `bun run check` (typecheck → lint → format:check → unit tests) — green. Lint caught three real
  issues before this walkthrough was written (an `any` in the imageinfo response type, an `any` in
  `probe-adapter.ts`'s registry, and an unnecessary-vs-non-null-assertion style nit) — all fixed,
  not suppressed.

## Findings for later tasks

- **The underscore-normalization trap will recur** wherever a MediaWiki title round-trips through
  a request/response pair — worth remembering if Wikiquote or Wikisource land in Phase 6 (SPEC
  §6.2 backlog), since they're the same API family.
- **Full-body fetches are a real per-item cost** (one HTTP round-trip each) that Phase 0 never
  measured, because `phase0/harvest.ts` only ever fetched intro extracts. The ingestion job (Task
  5) should call `fetchBody()` only after the structural floor + collision resolution — never on
  every raw search hit — to avoid the N+1 cost ballooning across 16 topics × several queries each.
- `SourceAdapter<Raw>`'s method-bivariance let `probe-adapter.ts`'s registry type as
  `Record<string, SourceAdapter<unknown>>` without needing a `Record<string, SourceAdapter<any>>`
  escape hatch — worth keeping in mind for Task 3's registry (`sources/index.ts`), which is the
  same shape at a larger scale.

## Next

Task 2 (3.2: Met + AIC adapters) — same pattern, reusing `types.ts`/`http.ts`/`normalize.ts` and
registering both in `probe-adapter.ts`.
