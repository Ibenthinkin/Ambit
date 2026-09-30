# Handoff — writing as a first-class part of the feed (updated 09-30-26)

Read this before touching the writing code. It is self-contained; the design is
`docs/DESIGN_writing.md` (D1–D8), the plan `docs/PLAN_writing.md` (five phases), and `log.md`
09-28 / 09-29 have the narrative.

## ▶ Pick up here (09-30-26, afternoon): Phase 3 built on `feat/writing-share` — Ben looks, merge, deploy

**Phase 3 (writing slots) is merged to `main` (`34eb714`) and pushed; Ben saw the mix on `/dev/feed` and approved it. Not deployed yet.** The design and
measurements are in `docs/PLAN_writing.md` Phase 3's "Built" note and SPEC §9 step 2. Log 09-30
has the three findings. Next: Ben looks at `/dev/feed` → merge → deploy → Phase 4 (cards). Also
open: disambiguation pages in the Wikipedia adapter; `desktop.spec` spread test compares by `alt`
(flaky on the real corpus).

## Earlier 09-30-26: re-score done; disambiguation pages next, then Phase 3

**Ben's decision (09-30-26):** drop every "no news" provision. The 44 pieces the production dry
run would have demoted as news (albums, films, *2022 FIFA World Cup*, *Malaysia Airlines Flight
370*, *Modern poetry*, …) "are not really news, just contemporary concepts." **Ben curates the
sources and keeps news out that way; the curator does not police it.** The 44 keep their real
scores.

### Where production is right now
- **Deployed at `39657f6`** (merge of `feat/writing` into `main`; `main` = `origin/main`).
  Migration 0010 ran. **The deployed ingest still drops `news` pieces every night** (`splitNews`)
  until the change below ships.
- `backfill-wiki-prod.sh` **done** — 961 s, 0 errors, 2 skipped (no extract).
- `recurate-writing-prod.sh push` **done**. The per-file `LIBARCHIVE.xattr.com.apple.provenance`
  tar warnings are fixed in all four `.cache/` push scripts (`--no-xattrs` /
  `--warning=no-unknown-keyword`).
- `dry` **done** — `/app/.cache/recurate-writing-dry.log` in the container: pdr 318 rows
  7.93 → 8.56 · wikipedia 3,201 rows 5.23 → 6.91 · kinds essay 279 / curiosity 3,237 /
  criticism 3 · 44 news. **Every answer is in the production cache under prompt v2.**
- **`confirm` has NOT run.** Don't run it until step 3 — it would write the 44 at 1. (If it runs by
  mistake nothing is lost: re-running `confirm` after the fix rewrites them from the cache, free.)

### The work, in order
> **Step 1 done 09-30-26** on `fix/writing-no-news`, merged to `main`: `splitNews` and the
> ingest's `news-dropped` line are gone, `planWritingRescore` always writes the curator's score,
> `timeliness` left `CuratedItem` / `parseWritingResponse` (the parser ignores the field, so every
> cached answer still reads — a test pins it), calibration lost `ben-news` and news
> precision/recall and reads its table by header so the existing marked file still parses.
> `WRITING_PROMPT` is byte-identical (hash checked) and stays v2.
>
> **Steps 2–3 done 09-30-26:** deployed `d5edb29`, and `confirm` wrote 4,309 (pdr 318 @ 8.56,
> wikipedia 3,991 @ 7.05). **The re-score is finished.** Next: keep disambiguation pages out
> of the Wikipedia adapter (11 of the 12 rows at score 1 are disambiguation pages; see log
> 09-30), then Phase 3's gate.

1. **Remove the enforcement, not the prompt text**, so the cache survives. `WRITING_PROMPT` and
   `WRITING_PROMPT_VERSION = 2` stay **untouched** — changing the prompt changes the cache key,
   throws away the ~3,500 answers production already paid for, and re-opens calibration. Find every
   touchpoint: `grep -rn -iE "splitNews|timeliness|\bnews\b" src scripts | grep -v newsletter`.
   Known ones:
   - `splitNews` (ingest) — the nightly drop. Delete it.
   - `services/writing-rescore.ts` — `planWritingRescore`'s `news` flag and demote-to-1. The
     written score is always the curator's score.
   - `scripts/recurate-writing.ts` — the news list in the summary (~lines 126, 159, 179-182) and
     the header comment.
   - `services/curator.ts` — `CuratedItem.timeliness` / `parseWritingResponse`'s timeliness can go;
     the model will still send the field, so the parser must tolerate it. Update the
     `WRITING_PROMPT` doc comment's news-free paragraph: the verdict is **no longer acted on**.
   - `services/writing-calibration.ts` + the calibration file header — `ben-news`, news
     precision/recall. Drop them.
   - Tests pinning the drop/demotion (`curator-writing.test.ts`, writing-rescore and ingest tests):
     delete or invert; add one that a `news` answer is written at its own score.
   - `docs/DESIGN_writing.md` (D1 "news-free by taste") and `docs/PLAN_writing.md`: one dated line
     each recording the reversal; SPEC too if it mentions it.
   `bun run check` green → branch off `main` (`fix/writing-no-news`) → merge → push.
2. **Ben deploys.**
3. **Ben runs `sh .cache/recurate-writing-prod.sh confirm`** — free, all cached. Expect ~3,519
   written, pdr ≈ 8.56, wikipedia ≈ 6.91 or a hair higher.
4. **Optional, only if Ben wants it:** strip the timeliness block and "you are not a news service"
   from `WRITING_PROMPT` itself → `WRITING_PROMPT_VERSION = 3` → `writing:calibrate --rescore` +
   `--read` split by source → fresh production dry run (~$1). Not needed for step 3.

### A note from the dry run
The Wikipedia keyword search pulls pop culture — *Ocean Flame*, *Machine Vendetta*, *Portrait of a
Chameleon*, *Spy in the Ocean* come from phrases like "ocean", "machine", "portrait". Ben's lever is
`src/server/config/reading-phrases.ts`: that is where "Ben curates the sources" happens for
Wikipedia.

## Where things stood before 09-30 (history)

- `feat/writing` merged to `main` 09-29-26 (`39657f6`) and deployed; the branch is kept.
- **Phase 1 (the writing curator) — built.** Phase 2 (Wikipedia) — built. Phases 3–5 — not started.
- Calibration: Ben marked 34 of 40 (the six blanks are Loupe); prompt v2 agreed — below.

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

## Calibration — all marked, prompt v2 (09-29-26)

Ben finished marking (34 of 40; the six unmarked are Loupe). v1 on the full marks, split by source
(the re-score skips Loupe, so Wikipedia + PDR is the number that matters):

| flash-lite | v1 | **v2** |
|---|---|---|
| Wikipedia MAE | 1.23 | **1.00** |
| PDR MAE | 0.46 | **0.38** |
| Wikipedia + PDR MAE · Spearman | 0.85 · 0.46 | **0.69 · 0.54** |
| Wikipedia + PDR kind | 13/19 | **19/20** |

v2 (`WRITING_PROMPT_VERSION = 2`) is two changes. **The rubric stops calling short entries filler**
("stubs, bare definitions, dry reference entries" left the 1-3 band) and says short, specific
entries on obscure things score 7-8 on subject alone — Ben: "short articles are even better",
"puzzle pieces, shards of the world". Spikelet went 4 → 7; AEGIS (a one-minute stub) is still 4.
**Wikipedia's kind is fixed, not judged** (`SOURCE_KINDS` / `kindFor` in `config/writing.ts`):
Ben marked all 13 `curiosity`. Wikipedia's Spearman stays ≈ 0 because Ben's marks sit in 6-9; MAE
is the signal there. Loupe got worse (2.63) and is skipped by the re-score. **This is the
agreement** unless Ben says otherwise → step 4 below.

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

## Next steps as written 09-28 (done through the dry run; `confirm` is superseded by "Pick up here")

1. **Ben** marks the remaining **Wikipedia and PDR** pieces (~13); skip the Loupe ones.
2. ~~Exclude Loupe from the writing re-score~~ — **done 09-28-26**: a bare `recurate:writing`
   skips `loupe` (`--source loupe` still reaches it).
3. ~~One prompt rule~~ — **tried and dropped 09-28-26; the prompt stays at v1.** Per source,
   flash-lite v1 is already close to Ben on what the re-score touches: **Wikipedia MAE 0.67,
   PDR 0.29** (the overall 0.90 is Loupe's 1.71 dragging it). Two edits, each run against a
   scratch copy of the file:
   - *"a fragment scores 1-3"*: Wikipedia unchanged, PDR 0.14, but Loupe worse (2.14) — it took
     #13, a short Whole Earth clipping Ben scored 8, down to 2.
   - *"an encyclopedia entry is never an essay"*: fixed one Wikipedia kind of three, and Wikipedia's
     score MAE went 0.67 → 1.00 (#9 fell 7 → 5).
   At six marks a source one answer moves the mean, so this is noise-chasing until the other 13
   are marked. The live question is **kind** — flash-lite calls most Wikipedia curiosities
   `essay`; the `Source: wikipedia` line in the prompt input is the untried lever.
   **To re-test after a prompt change, use `bun run writing:calibrate --rescore`** (new): it
   re-scores exactly the pieces in the file, in order, keeping Ben's marks — a fresh `--sample`
   is ordered now too, but moves if an ingest changed the article set.
   **Once Ben's 13 are in:** `bun run writing:calibrate --read`, and split it by source (the
   report doesn't; the Loupe rows skew it). If Wikipedia + PDR hold near v1's numbers, that is
   the agreement.
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
