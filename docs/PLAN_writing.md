# Plan — writing as a first-class part of Ambit

Design and decisions D1–D8: `docs/DESIGN_writing.md`. Execute cold, one phase at a time, TDD per task, on `feat/writing` (branched from `main` at 61ed491). Each phase is shippable on its own; production steps are `.cache/*.sh` scripts for Ben to run (the agent may not write to the production database).

## Cross-cutting

- **Writing ≡ `type = 'article'`.** No new type value.
- **Link-card status stays source-derived** (a rights posture belongs to the source). Add `isLinkCardSource(s) = isBlogSource(s) || isPublicationSource(s)` in a new `src/server/config/publications.ts`. PDR stays its own case.
- **Migration 0010:**
  - `item.kind text` (TS union `WritingKind`; labels in a new `src/server/config/writing.ts`). NULL for images and for articles not yet re-scored.
  - `item.reading_minutes smallint`, nullable.
  - Partial index `ON item (curation_score) WHERE type = 'article'`.
- **Reading time** comes from a pure `readingMinutes(text)` at ~230 wpm. It strips trailing `== References / See also / External links / Notes / Further reading ==` first. With only a dek it returns NULL, and the badge reads `READ`.

## Phase 1: the writing curator

- **`src/server/services/curator.ts`**:
  - Add `WRITING_PROMPT`, a product artifact like `CURATOR_PROMPT`. **Leave `CURATOR_PROMPT` untouched.** It gets its own `WRITING_PROMPT_VERSION`.
  - The persona is an editor of a long-reads and curiosities newsletter. The rubric rewards spark, voice and staying power. It says outright that longform contemporary journalism is welcome, and that a piece whose reason to exist is a recent event is `news`.
  - **Input:** source label, title, the first 8 tags, the summary, `Length: ~N words`, and `Text:` holding the first ~8,000 characters of `body ?? curationText`, references stripped. No image is sent, which avoids Wikimedia's thumbnail-rendering throttle.
  - **Output:** `{score, tags[2-4], kind, timeliness: timeless|dated|news, topics[≤3]}`. A new `parseWritingResponse` reuses the clamping and `capTopics`. An unknown kind becomes null, and an unknown timeliness becomes `timeless`.
  - **Cache key:** `${model}|w${WRITING_PROMPT_VERSION}|writing|${source}:${sourceId}`. The image keys stay byte-identical.
  - `scoreItem` dispatches articles to `scoreWriting`. Writing always classifies, in both lanes.
  - `CuratedItem` gains optional `kind`, `timeliness` and `readingMinutes`.
- **`scripts/ingest.ts`**:
  - Pass `topics: classifyVocabulary` to the search-lane call too.
  - A writing item's memberships are its seed topic (`seed`) plus the curator's topics (`curator`).
  - **Drop `news`** items, and add a `news-dropped` count to the summary.
  - Add a new pure `writingFloor()` rule `thin-text`: text under 400 characters. It runs after enrichment, so poems survive.
- **Calibration** (`scripts/writing-calibrate.ts`):
  - `--sample 40` draws a sample stratified by source (wikipedia/pdr/loupe) and by old-score band. It writes `docs/writing-calibration.md`, one entry per piece: title, source, minutes, links, a 300-character excerpt, the model's score/kind/timeliness/tags/topics, and blanks `ben-score / ben-kind / ben-news / note`.
  - `--read` reports score mean absolute error and Spearman correlation, a kind confusion matrix, news precision and recall, and the five worst disagreements.
  - Run it with both `gemini-2.5-flash-lite` and `gemini-2.5-flash`. The model is part of the cache key, so the comparison costs cents.
  - **Ben marks the file, and the prompt is iterated until it agrees. This is the gate before any re-score.**
- **Re-score** (`scripts/recurate-writing.ts`; `recurate.ts` only writes image scores):
  - Selects articles, with `--source`/`--limit`/`--offset`. Dry run by default; `--confirm` writes.
  - Writes score, tags, kind and `reading_minutes`. Memberships are added with origin `curator`, and `topic_id` is set only where NULL.
  - **`news` rows are demoted to score 1**, not deleted, and each one is listed in the output.
  - Ship `.cache/recurate-writing-prod.sh` for Ben to run on production.
- **Tests:**
  - `parseWritingResponse`
  - cache-key isolation
  - `readingMinutes`
  - `writingFloor`
  - dispatch by type in `curateItems` (mocked fetch)
  - integration: the re-score is additive and sets `topic_id` only where NULL.
- Add an SPEC §15 note: the "no text rubric" item is resolved, and PoetryDB's second parking reason is gone.

## Phase 2: Wikipedia

1. **Body at ingest.**
   - A new `src/server/services/sources/enrich.ts` (internal to ingest; no contract change). It maps `wikipedia` to `fetchBody(pageid)` from `sources/wikipedia.ts`.
   - Ingest runs it after skip-existing and the structural floor, and before `writingFloor` and curation. Only new survivors pay the one-request-per-page cost.
2. **Production backfill.**
   - Extend `scripts/backfill-wikipedia-bodies.ts` with `--only-missing`, `ORDER BY id` and `--offset`.
   - Ship `.cache/backfill-wiki-prod.sh` (~3,191 × 0.3 s ≈ 20 min).
   - **Production order: backfill, then run Phase 1's re-score.**
3. **List sourcing**, keeping the search shape and `source: 'wikipedia'`, with page ids as `sourceId` so `(source, source_id)` dedupe holds. `wikipedia.search(q)` recognizes a `list:` prefix:
   - `list:unusual`: `generator=links` on `Wikipedia:Unusual articles`.
   - `list:featured` / `list:good`: `generator=categorymembers` on `Category:Featured articles` / `Category:Good articles`. Verify during the probe that these hold articles, not talk pages.
   - `list:dyk`: `Wikipedia:Recent additions/YYYY/Month` wikitext, via a pure `parseDykHooks()` (bolded link targets). Use the hook as the `summary`.
   - Members are ordered by `md5(pageid‖date)` and the first `limit` taken, so each night draws a fresh slice. They then go through the existing batched detail and license steps.
4. **Reading-phrases file**: `src/server/config/reading-phrases.txt`, parsed by `reading-phrases.ts`:
   ```
   # topic-id | phrase | limit (optional)
   astronomy | history of the telescope
   | scientific hoaxes | 20          # untied: the curator homes it
   @list unusual 40
   @list dyk 40
   @list featured 30
   @list good 20
   ```
   - A test validates topic ids against `TOPICS` plus the `topic-facets.ts` keys and rejects `PERIOD_TOPICS`.
   - Remove `wikipedia` from `V1_SOURCES`/`SeedQueries` and delete its 16 cells in `config/topics.ts`. `db:seed` on boot rewrites `seed_queries`.
   - Seed the file with sharper phrases for the 16 originals, plus a starter set Ben edits.
   - **Tied phrases** make normal claims (collision resolution and `seed` membership as today).
   - **Untied phrases and `@list` entries** take the walk items' write path: curator topics become the display topic and memberships, and the item may be un-homed.
5. **Tests:**
   - fixture tests for the list parsers and `parseDykHooks`
   - the phrases parser, including rejection of an unknown topic
   - the unseeded path writes curator-origin memberships only
   - enrichment runs only on new rows.

## Phase 3: feed share

Ship this only after Phase 2's lists have run on production, or per-topic writing runs dry (~12 writing cards per reader per day).

- **Knobs** in `DEFAULT_KNOBS` (`services/feed-knobs.ts`), the zod schema in `routers/feed.ts`, `knob-panel.tsx` and `use-dev-knobs.ts`:
  - `writingShare: 0.125` (0–0.5).
  - `writingScoreFloor` (defaults to `scoreFloor`; calibration sets it).
- **Writing slots:**
  - `n = floor(12 × share)`, plus 1 with probability equal to the fractional part.
  - Positions come from a **third random stream** `${seed}:${page}:writing`: never index 0 and never adjacent to each other.
  - `planTopics` and the topic stream are untouched, so cursor determinism holds.
- **Pools** (`src/server/db/feed.ts`):
  - `getTopicPools` gains `opts.type`. Ordinary pools are `image` when share > 0.
  - A new `getWritingPools(planned)` runs the same two-stage sample with `type = 'article'`, 15 per topic and 6 per (topic, source), in parallel.
  - A new `getWritingWildPool` is an md5 sample of any article, un-homed included.
  - `getWildPool` becomes `image` when share > 0.
  - Add `type` to the `PoolItem` projection.
- **Filling a slot** (`services/feed.ts` `composePage`):
  1. Tier and topic as usual, from `writingPools[topic]`.
  2. Otherwise the union of the planned topics' writing pools.
  3. Otherwise the writing wild pool (tier WILD).
  4. Otherwise the slot becomes an ordinary card.
  - **A writing slot never makes a page short.**
  - `sourceCap` and `drawnIds` apply unchanged.
- **Readouts and measurement:**
  - `/dev/feed` shows writing per page and per session next to the original/grown/wild split.
  - `bench:feed` before and after (one more query per page; stay under SPEC's 300 ms).
- **Tests:**
  - 200 seeded pages land within ±1 of the target
  - each fallback level fires
  - `writingShare: 0` composes a byte-identical page
  - a slot with no writing still gives a full page
  - integration: `getWritingPools` returns only articles, within the caps
  - e2e: fixtures seed articles with `writeMemberships`. Run in **CI's shape** (fresh Postgres on :5433; recipe in CLAUDE.md).

## Phase 4: cards

- **`src/components/feed/masonry.ts`:**
  - A new tile kind `writing-picture` for articles with a usable `imageUrl`. Not usable means an SVG-derived Wikipedia lead image (`.svg.png`), which falls back to a text card.
  - The aspect is the real `image_width/height` snapped to the nearest `IMAGE_ASPECTS` entry, falling back to the ordinal.
  - `estHeight` = image height + title band + badge line.
- **Components:**
  - A new `src/components/feed/writing-tile.tsx` reuses ImageTile's press and image handling (**`lib/image-src.ts` `imageSrc` is mandatory; it's a CSP rule**). It shows a badge `KIND · N MIN` / `LONG READ` / `READ` and the title over a bottom scrim.
  - `article-card.tsx` gets the same label as its eyebrow.
  - A shared `writingLabel(item)` builds both.
  - `feed-grid.tsx` `renderTile`/`isCard` and `components/saved/saved-tile.tsx` handle the new kind.
  - The feed and saved tRPC outputs must carry `kind`, `readingMinutes` and the image dimensions.
- **Reader page:** `link-out-row.tsx` switches to `isLinkCardSource` and renders in the article branch of `src/app/i/[itemId]/page.tsx` under `ReaderItemBody`.
- **Tests:**
  - `buildTiles` routing and ordinal rhythm
  - `writingLabel`, including the NULL and LONG READ cases
  - both components render
  - e2e: find a writing tile.
- Check at phone width and at 1440 (`desktop` Playwright project).

## Phase 5: publications

- **`src/server/config/publications.ts`**:
  - `PublicationConfig { id, label, feedUrl, baseUrl, license, robotsCheckedOn, walkQuota, fullText: 'content-encoded'|'none', paged?: 'wp' }`.
  - The license string matches the blogs': "Rights retained by original authors — displayed with credit and link".
  - The ids join `WALK_SOURCES`, `SourceId`, the `walkers` map in `sources/index.ts`, and `SUSPENDED_SOURCES` until verdicted.
- **A new `src/server/services/sources/rss.ts`**: `rssWalker(pub): CorpusWalkAdapter`. **The contract is unchanged.**
  - A pure `parseFeed()` for RSS 2.0 and Atom.
  - Cursor = page number when `paged`.
  - Robots check, 500 ms spacing, `noRetryOn` 401/403.
  - Image from `media:content`, then `enclosure`, then the first `<img>`.
  - `summary` = the feed's own description through `htmlToText`, ≤600 characters. `type: 'article'`, `body: null`.
  - Where a candidate is WordPress, `wp-rest.ts` may be preferable. It would gain an `itemType: 'article'` option and put `content.rendered` into `curationText`; the probe decides per source.
- **`NormalizedItem.curationText?: string`** is optional and additive, like `curationImageUrl`. It is fed to the curator and `readingMinutes` and is **never stored**. **Record it in the Ambit-Admin log before building** (it touches the cross-service agreement).
- **`source-invariants.test.ts`**:
  - link-card sources have `body` NULL
  - publications are `type: 'article'`
  - license and attribution match the config
  - `sourceUrl` host = `baseUrl`
  - `curationText` never reaches `upsertItem`.
- **Verdict loop**, one publication at a time: `probe-walk`, then a 150-item sample walk. `stats:walk` gains the kind histogram, news/dated counts and reading-minute percentiles. Ben verdicts each in `docs/source-candidates.md`, then it is unsuspended.

## Risks

- **Flash-lite may be too weak for prose.** Calibration compares it with `gemini-2.5-flash`. Re-scoring all ~3.5k articles costs about $1 either way.
- **Wikipedia lead images are often poor pictures.** The SVG rule catches flags and logos, not dull photos. A later vision pass is possible.
- **Paywalled feeds (Paris Review, Noema)** truncate `content:encoded`, so their scores rest on thin text. The probe shows how thin.
- **Link-card reader pages will feel bare** (dek + link) until D8's reading work.

## Verification

- `bun run check` and `bun run test` green each phase.
- **Phase 1:** a calibration report that agrees with Ben's marks. A dry-run re-score diff on local shows Wikipedia's mean score rising and news demotions listed.
- **Phase 2:**
  - locally: an ingest with `--source wikipedia` prints new rows with bodies, plus a `news-dropped` line
  - on production: `select count(body) from item where source='wikipedia'` equals the row count after the backfill script
- **Phase 3:** `bun run probe:feed --uniform --pages 20` shows ~30 writing cards in 240 (was 4). `bench:feed` p50 stays under 300 ms. `bun run e2e:prod` plus the CI-shape run are green.
- **Phase 4:** eyeball `/feed` at phone and 1440 widths; e2e finds a writing tile.
- **Phase 5:** per-publication `stats:walk` shows kind, news and minutes. Invariant tests are green.
- Append a `log.md` entry at each commit checkpoint, with the session-spend line.
