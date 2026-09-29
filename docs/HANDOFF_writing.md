# Handoff — writing as a first-class part of the feed (09-28-26)

Read this before touching `feat/writing`. It is self-contained; the design is
`docs/DESIGN_writing.md` (D1–D8), the plan `docs/PLAN_writing.md` (five phases), and `log.md`
09-28 has the narrative.

## Where things stand

- **Branch `feat/writing`**, ~19 commits ahead of `origin/feat/writing`, **not pushed** (Ben's
  instruction: commit, don't push), **not merged, not deployed**. Branched from `main` at
  `61ed491`. `bun run check` green at the last commit (1,642 tests).
- **Phase 1 (the writing curator) — built.** Phase 2 (Wikipedia) — built. Phases 3–5 — not started.
- **Calibration in progress.** Ben marked 20 of the 40 pieces in `docs/writing-calibration.md`
  (7 Loupe, 7 PDR, 6 Wikipedia). His marks are committed with this handoff.
- `docs/source-candidates.md` has Ben's raw Tumblr notes, **deliberately uncommitted** — leave it.

## What was built

**Phase 1 — the writing curator** (`src/server/services/curator.ts`)
- `type = 'article'` goes to `WRITING_PROMPT` (a long-reads editor persona), images to the
  untouched `CURATOR_PROMPT`. Dispatch is in `curateItems`' worker (`scoreWriting` beside
  `scoreItem`); the OpenRouter call is one shared `callCurator`.
- The writing curator reads up to 8,000 chars of `body ?? summary` with the apparatus stripped
  (`writingText` in `config/writing.ts`, which reuses `parseReaderBlocks`), sends no image,
  **always classifies**, and returns score, tags, `kind` (essay/curiosity/criticism/archive),
  `timeliness` (timeless/dated/news), topics. `news` is dropped at ingest (`splitNews`) and
  demoted to 1 at re-score; timeliness is not stored.
- Its own cache namespace, keyed on the model: `writingCacheKey(item, model)`; two image keys are
  pinned in `curator-writing.test.ts`. `WRITING_PROMPT_VERSION = 1`.
- `writingFloor` — `thin-text`, under 400 chars of prose (Ben: no poem exemption).
- Migration **0010** `item.kind` + `item.reading_minutes` (`readingMinutes` = body at 230 wpm,
  NULL without a body).
- `bun run recurate:writing` (dry run unless `--confirm`; `services/writing-rescore.ts`:
  memberships additive at `curator`, display topic only where NULL, news → 1).
  `bun run recurate` is now **images-only** (it would have half-written articles).
- `bun run writing:calibrate --sample 40 | --read` (`services/writing-calibration.ts`).

**Phase 2 — Wikipedia**
- Bodies at ingest: `sources/enrich.ts` runs after the structural floor, before the writing
  floor. A fetch that *throws* drops the item for the night (retried free tomorrow); "no extract"
  keeps it bodiless.
- `scripts/backfill-wikipedia-bodies.ts --only-missing [--offset N]` also writes
  `reading_minutes`.
- `sources/wikipedia-lists.ts`: `search("list:unusual|dyk|featured|good")`. Unusual = bolded row
  entries of the topical subpages; DYK = one day-seeded archive month, hook → summary (known
  templates expanded, else the lede); Featured/Good = one 500-page call from a day-seeded
  two-letter sort-key start. MediaWiki HTTP-200 error bodies throw (`wikiFetch`).
- `src/server/config/reading-phrases.ts` (**Ben edits it**) replaced the sixteen `wikipedia` seed
  cells; `wikipedia` left `V1_SOURCES`. Tied phrase → claim for its topic; untied phrase / list →
  the walk items' write path (`services/reading-plan.ts`: `planReadingQueries`, `mergeUnseeded`).
  `db:seed` now rewrites a row carrying a source key the config dropped.

## Calibration — what 20 marks say (`bun run writing:calibrate --read`)

| | flash-lite | flash |
|---|---|---|
| score MAE | **0.90** | 1.45 |
| Spearman | 0.64 | 0.63 |

- **flash-lite is the closer judge, and the cheaper one → use it** (it is `CURATOR_MODEL`, the default).
  flash under-scores Wikipedia Ben likes (Institute of Astronomy 8 vs 3, Dobruja 7 vs 4, Ocean
  gyre 7 vs 4).
- flash-lite's worst misses are **Loupe OCR fragments scored too high**. Ben's notes: "doesn't make
  sense exactly yet", "not really working with no context", "i think we should exclude the archive
  entries for now". Ben calls Loupe clippings `archive`; both models say curiosity/essay.
- flash-lite calls 3 of Ben's 8 curiosities `essay`.
- Not yet measured: **news** (nothing in the sample is news) and **criticism** (Ben marked none).

## Next steps, in order

1. **Ben** marks the remaining **Wikipedia and PDR** pieces (~13); skip the Loupe ones.
2. **Exclude Loupe from the writing re-score** — `recurate:writing` selects every article; add a
   Loupe exclusion (or `--source` runs of wikipedia + pdr only). Loupe is suspended on production
   anyway. Ledger it as Ben's decision (his note on #4).
3. **One prompt rule**: a fragment, OCR noise, or text that makes no sense without missing
   context scores 1–3. Bump `WRITING_PROMPT_VERSION` to 2, then
   `bun run writing:calibrate --sample 40` (same default seed → same pieces; Ben's marks carry over
   by item id) and `--read`. Optionally `--models google/gemini-2.5-flash-lite` alone.
   **Caveat:** the sample query has no `ORDER BY`, so "same pieces" is likely, not guaranteed —
   add `.orderBy(item.source, item.sourceId)` to `scripts/writing-calibrate.ts` first (deferred
   minor from the Phase 1 review).
4. If it agrees, decide with Ben: push `feat/writing`, merge, deploy. **Migration 0010 collides
   with `docs/PLAN_onboarding-interview.md`'s planned 0010** — whichever merges second regenerates.
5. **Production, after the deploy, in this order** (scripts in `.cache/`, gitignored; the agent
   may not write to the production DB, Ben runs them):
   1. `sh .cache/backfill-wiki-prod.sh` (bodies for the 3,191 bodiless rows, ~20 min; `check`
      shows counts)
   2. `sh .cache/recurate-writing-prod.sh push` (curation cache → volume), then `dry`, read its log
      (the news list), then `confirm`
6. **Phase 3** (1 card in 8 is writing) needs Ben's yes on its gate first: PDR essays and Loupe
   clippings become reachable only through writing slots, and `/explore` shows writing to
   strangers. Then Phase 4 (cards) and Phase 5 (publications as link cards).

## Deferred minors (from the two reviews — none blocks a deploy)

Phase 1: calibration query has no ORDER BY (step 3 above) · `walk-stats` blends both rubrics for
PDR · the prompt input says `Source: wikipedia` (a lever if Wikipedia kinds skew) · the calibration
table doesn't flag a fallback answer and `ben-kind` accepts only bare ids · a corrupt writing cache
file re-bills silently · a news piece demoted to 1 still gains memberships · `recurate:writing`
loads every body into memory.

Phase 2: ~2% of Unusual entries sit in attribute-prefixed cells the parser misses · early DYK
months write "That" capitalised · a late-alphabet sort-key start (Zu–Zz, ~1% of nights) starves
Featured/Good · `continue` never read on allpages/revisions · `feed.integration.test.ts` fixture
still writes a `wikipedia` cell · ingest's header comment and the walk histogram label are stale ·
DYK redirect back-mapping untested.

## Traps

- **The unit tests write real files into `.cache/curation`** under throwaway ids (the existing
  curator tests always have). Newest-file inspection there after a test run shows test entries.
- `bun run ingest --dry-run` still **bills the curator** for new items (cheap, cached thereafter).
- A red `feed.integration.test.ts` cursor-stability test is the known un-homed-fixture race
  (CLAUDE.md), not this branch.
- Scratch `.ts` files under `.superpowers/` are linted by `bun run check` — keep scratch as `.txt`.
