# Plan — writing as a first-class part of Ambit

Design and decisions D1–D8: `docs/DESIGN_writing.md`. Execute cold, one phase at a time, TDD per task, on `feat/writing` (branched from `main` at 61ed491). Each phase is shippable on its own; production steps are `.cache/*.sh` scripts for Ben to run (the agent may not write to the production database).

## Cross-cutting

- **Writing ≡ `type = 'article'`.** No new type value.
- **Link-card status stays source-derived** (a rights posture belongs to the source). Add `isLinkCardSource(s) = isBlogSource(s) || isPublicationSource(s)` in a new `src/server/config/publications.ts`. PDR stays its own case.
- **Migration 0010:**
  - `item.kind text` (TS union `WritingKind`; labels in a new `src/server/config/writing.ts`). NULL for images and for articles not yet re-scored.
  - `item.reading_minutes smallint`, nullable.
  - **No new index.** `idx_item_type` already exists and `idx_item_unhomed_score` covers the writing wild pool; a partial index over ~3.5k article rows earns nothing. Add one only if `bench:feed` says so.
- **Reading time** comes from a pure `readingMinutes(text)` at ~230 wpm. It strips the trailing apparatus sections first (`== References / See also / External links / Notes / Further reading ==`) — **reuse `APPARATUS` from `src/lib/reader-blocks.ts:30`**, which already drops those sections at render time; `fetchBody` keeps the `== … ==` markers on purpose (`exsectionformat=wiki`). Don't write a second list. With only a dek it returns NULL, and the badge reads `READ`.
- **Names as they are in the code** (the plan was first written from memory): the image prompt's version constant is `PROMPT_VERSION` (`curator.ts:44`, test-pinned at 1 — leave it); the cache key is built and sha256'd by `curationCacheKey` (`curator.ts:427`); the parser is `parseCuratorResponse`, the clamp is `capTopics` (`:325`); `scoreItem` is private and `curateItems` (`:636`) is the public entry. Seed queries are **a JSONB column `topic.seed_queries`**, not a table.

## Phase 1: the writing curator

- **`src/server/services/curator.ts`**:
  - Add `WRITING_PROMPT`, a product artifact like `CURATOR_PROMPT`. **Leave `CURATOR_PROMPT` untouched.** It gets its own `WRITING_PROMPT_VERSION`.
  - The persona is an editor of a long-reads and curiosities newsletter. The rubric rewards spark, voice and staying power. It says outright that longform contemporary journalism is welcome, and that a piece whose reason to exist is a recent event is `news`.
  - **Input:** source label, title, the first 8 tags, the summary, `Length: ~N words`, and `Text:` holding the first ~8,000 characters of **`body ?? summary`** (Phase 5 adds `curationText` in front of `summary`; it does not exist yet), apparatus stripped with `APPARATUS`. No image is sent, which avoids Wikimedia's thumbnail-rendering throttle. Note that today's curator never reads `body` at all — `itemAsText` (`curator.ts:261`) sends `summary` only — so this is the first text path that does.
  - **Output:** `{score, tags[2-4], kind, timeliness: timeless|dated|news, topics[≤3]}`. A new `parseWritingResponse` reuses `parseCuratorResponse`'s clamping and `capTopics`. An unknown kind becomes null, and an unknown timeliness becomes `timeless`.
  - **Cache key:** the string `${CURATOR_MODEL}|w${WRITING_PROMPT_VERSION}|writing|${source}:${sourceId}` through the same sha256 as `curationCacheKey`. The image keys stay byte-identical (a test pins one).
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
- **Re-score** (`scripts/recurate-writing.ts`; `recurate.ts` only writes image scores, and writes by default with `--dry-run` — this script is the other way round, like the repair scripts):
  - Selects articles, with `--source`/`--limit`/`--offset`. Dry run by default; `--confirm` writes. Its row-to-`NormalizedItem` step must carry `body` (recurate's `rowToNormalized` does).
  - Writes score, tags, kind and `reading_minutes`. Memberships are added with origin `curator` (`addItemTopics` is `onConflictDoNothing`), and `topic_id` is set only where NULL — **the pattern is `scripts/promote-topics.ts:161`** (`isNull(item.topicId)` in the WHERE), not `repair:rehome`, which also rewrites a removed `from` topic.
  - **`news` rows are demoted to score 1**, not deleted, and each one is listed in the output.
  - Ship `.cache/recurate-writing-prod.sh` for Ben to run on production.
- **Tests:**
  - `parseWritingResponse`
  - cache-key isolation
  - `readingMinutes`
  - `writingFloor`
  - dispatch by type in `curateItems` (mocked fetch)
  - integration: the re-score is additive and sets `topic_id` only where NULL.
- SPEC: mark the "no text rubric" item resolved (§15, the 08-21-26 bullet) and strike PoetryDB's second parking reason (that lives in **§6**, the `poetrydb — parked, not cut` bullet, not §15). Open Library / Wikiquote / Wikisource are in `docs/source-candidates.md`, not SPEC.

## Phase 2: Wikipedia

1. **Body at ingest.**
   - A new `src/server/services/sources/enrich.ts` (internal to ingest; no contract change). It maps `wikipedia` to `fetchBody(pageid)` from `sources/wikipedia.ts`.
   - Ingest runs it after skip-existing and the structural floor, and before `writingFloor` and curation. Only new survivors pay the one-request-per-page cost.
   - Fix the comment at `wikipedia.ts:218`, which claims ingest already calls `fetchBody`; it never has (`git log -S fetchBody -- scripts/ingest.ts` is empty). This is the bug in the design's Context.
2. **Production backfill.**
   - Extend `scripts/backfill-wikipedia-bodies.ts` with `--only-missing`, `ORDER BY id` and `--offset`.
   - Ship `.cache/backfill-wiki-prod.sh` (~3,191 × 0.3 s ≈ 20 min).
   - **Production order: backfill, then run Phase 1's re-score.**
3. **List sourcing**, keeping the search shape and `source: 'wikipedia'`, with page ids as `sourceId` so `(source, source_id)` dedupe holds. `wikipedia.search(q)` recognizes a `list:` prefix:
   - `list:unusual`: `generator=links` with `gplnamespace=0` over **`Wikipedia:Unusual articles` and its subpages** (`list=prefixsearch` on `Wikipedia:Unusual articles/`) — the page has been a hub of subpages for years, and the parent alone holds a fraction of the entries.
   - `list:featured` / `list:good`: `generator=categorymembers` with `gcmnamespace=0&gcmtype=page` on `Category:Featured articles` / `Category:Good articles`. Verify during the probe that these hold articles, not talk pages.
   - `list:dyk`: `Wikipedia:Recent additions/YYYY/Month` wikitext, via a pure `parseDykHooks()` (bolded link targets). Use the hook as the `summary`.
   - Members are ordered by `md5(pageid‖date)` and the first `limit` taken, so each night draws a fresh slice. They then go through the existing batched detail and license steps (`search()` steps 2–3; 20 pageids per detail call, 10 files per license call).
   - **Known costs, accepted unless the probe says otherwise:** md5-ordering all of `Category:Good articles` (~40k) is ~80 list calls a night — a date-seeded `gcmstartsortkeyprefix` is the cheaper draw if that matters at 20/night; and skip-existing runs *after* `search()`, so a list draw pays detail+license fetches for pages already stored before ingest drops them.
4. **Reading-phrases module**: `src/server/config/reading-phrases.ts` — a typed `.ts` module like `blogs.ts` and `topic-facets.ts`, **not a `.txt` with a parser** (decided 09-28-26 on review: a `.ts` needs no parser, gets topic-id checking as a type, and is just as editable):
   ```ts
   export const READING_PHRASES: readonly ReadingPhrase[] = [
     { topic: "astronomy", phrase: "history of the telescope" },
     { phrase: "scientific hoaxes", limit: 20 },        // untied: the curator homes it
     { list: "unusual", limit: 40 },
     { list: "dyk", limit: 40 },
     { list: "featured", limit: 30 },
     { list: "good", limit: 20 },
   ];
   ```
   - `ReadingPhrase` is a union: `{ topic?: TopicId; phrase: string; limit?: number } | { list: "unusual" | "dyk" | "featured" | "good"; limit: number }`. `topic` is typed against `TOPICS` ids plus the `topic-facets.ts` keys; a test rejects `PERIOD_TOPICS` and pins that every tied topic exists in the DB's vocabulary (`isClassifiable`).
   - **Take `wikipedia` out of `V1_SOURCES` — and only that list.** Three things hang off it: `SeedQueries` is `Record<V1Source, string[]>` (`config/topics.ts:106`), so the 16 wikipedia cells go *with* the type change, not before it; `adapters: Record<SearchSourceId,…>` (`sources/index.ts:37`) still requires `wikipedia` in `SourceId` and in `adapters` — it stays a search-shaped source with a different query source; and `topics.test.ts:114` ("covers every v1 source for every topic") and `:138` (cells name only `SEED_SOURCES`) both follow from the list. `db:seed` upserts each original topic's whole `seed_queries` JSONB value (`seed-topics.ts:61`), so the cell disappears from the 16 rows on the next boot; grown topics' values are `{}` and untouched.
   - `processSource` (`ingest.ts:169`) reads `topic.seed_queries[sourceId]` per topic. For `wikipedia` it reads `READING_PHRASES` instead: tied phrases become claims for their topic, untied phrases and `@list` entries become walk-shaped items.
   - Seed the module with sharper phrases for the 16 originals, plus a starter set Ben edits.
   - **Tied phrases** make normal claims (collision resolution and `seed` membership as today).
   - **Untied phrases and `@list` entries** take the walk items' write path (`ingest.ts:542`, "Walk items (Cut 1)": `topicId: topics[0] ?? null`, memberships at origin `curator`), and the item may be un-homed. **Dedupe them against the tied winners' `source:sourceId` keys first** — a page found by both paths would otherwise be written twice in one run (harmless — upsert never overwrites and the second curation is a cache hit — but wrong in the counts).
5. **Tests:**
   - fixture tests for the list parsers and `parseDykHooks`
   - the phrases module: every tied topic is a real, classifiable topic; no period topic; limits positive
   - the unseeded path writes curator-origin memberships only
   - enrichment runs only on new rows.

## Phase 3: feed share

Ship this only after Phase 2's lists have run on production, or per-topic writing runs dry (~12 writing cards per reader per day).

- **Knobs** in `DEFAULT_KNOBS` (`services/feed-knobs.ts`), the zod schema in `routers/feed.ts`, `knob-panel.tsx` and `use-dev-knobs.ts`:
  - `writingShare: 0.125` (0–0.5).
  - `writingScoreFloor` (defaults to `scoreFloor`; calibration sets it).
- **Writing slots:**
  - `n = floor(knobs.pageSize × share)`, plus 1 with probability equal to the fractional part. **`pageSize` is a knob (6–24 in the slider), never the literal 12.**
  - Positions come from a **third random stream** `mulberry32(hashSeed(\`${seed}:${page}:writing\`))` (the existing idiom, `feed.ts:759`): never index 0 and never adjacent to each other.
  - **Positions are indices into the composed array.** `composePage` has no slot indices — cards append as draws succeed and a failed iteration consumes no position (`feed.ts:595`). So the writing positions are drawn up front, and a writing draw is attempted whenever `composed.length` equals the next one; if it falls through, the ordinary draw fills that index and the writing position is spent.
  - `planTopics` and the topic stream are untouched, so cursor determinism holds. (The planner never hears of writing slots; that is what keeps plan and compose from diverging.)
- **Pools** (`src/server/db/feed.ts`):
  - `getTopicPools` gains `opts.type` (optional, so `bench-feed.ts` and the five integration tests that call it are unchanged). Ordinary pools are `image` when share > 0. **Be explicit that this moves PDR's essays and Loupe's clippings — `type: 'article'` today, drawn in ordinary pools today — into the writing slots only.** Blogs are unaffected: every blog walker is `type: "image"` (`source-invariants.test.ts:62`). `feed.explore` runs the same engine for a null user, so signed-out visitors get writing slots too.
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
  - `/dev/feed` shows writing per page and per session next to the original/grown/wild split. **That split is client-side** — `PageStats` in `src/components/feed/dev/feed-stats.ts`, summed by `sumStats` in `knob-panel.tsx` — so the writing count is a new `PageStats` field counting `item.type === "article"`; `FeedPage.debug` (`{plannedTopics, fallback}` only) needs no change. The knob itself is one `KnobSpec` appended to `KNOB_SPECS` in `use-dev-knobs.ts` (both files live under `components/feed/dev/`).
  - `probe:feed` prints no type column: add a writing count to its summary, or the Verification line below can't be read off it. (Its tier-mix total also excludes WILD — leave that.)
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
  - A new tile kind `writing-picture` for articles with a usable `imageUrl`. Not usable means an SVG-derived Wikipedia lead image — test with `includes(".svg.png")`, **not `endsWith`**: Wikipedia thumbnails carry a `?utm_…` query string (fixture at `wikipedia.test.ts:147`) — which falls back to a text card. Also retire the stale comment at `masonry.ts:39` ("The DB stores no image dimensions"); migration 0009 added them.
  - The aspect is the real `image_width/height` snapped to the nearest `IMAGE_ASPECTS` entry, falling back to the ordinal.
  - `estHeight` = image height + title band + badge line.
- **Components:**
  - A new `src/components/feed/writing-tile.tsx` reuses ImageTile's press and image handling (**`lib/image-src.ts` `imageSrc` is mandatory; it's a CSP rule**). It shows a badge `KIND · N MIN` / `LONG READ` / `READ` and the title over a bottom scrim.
  - `article-card.tsx` gets the same label as its eyebrow.
  - A shared `writingLabel(item)` builds both.
  - `feed-grid.tsx` `renderTile`/`isCard` and `components/saved/saved-tile.tsx` handle the new kind.
  - The feed and saved tRPC outputs must carry `kind`, `readingMinutes` and the image dimensions.
- **Reader page:** `link-out-row.tsx` switches its gate to `isLinkCardSource` (today `isBlogSource || pdr`, line 27). It is rendered in exactly one place today — `item-facts.tsx:124`, the *image* branch — and the article branch's `ReaderItemBody` (`reader-item-body.tsx:52`) has its own inline "Read on X →" link. **Replace that inline link with `LinkOutRow`**; don't add a second link. While there, fix the pre-existing class-string bug at `link-out-row.tsx:37-40`: the pieces are concatenated without spaces, so `transition-transform` + `duration-150` is one bogus class and `active:scale-[0.98]` glues onto the caller's `className`.
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

## Decide before the phase that needs it (from the 09-28-26 review)

- **Before Phase 1 — `thin-text` at 400 characters kills short poems.** The "poems survive" line is about Wikipedia bodies arriving before the floor runs. A sonnet is ~600 characters, a haiku is not. If PoetryDB is to be un-parked, exempt `poetrydb` (or lower the floor to ~200); if not, 400 stands.
- **Before Phase 1 — `timeliness` is not stored.** `news` becomes score 1 and `dated` is lost after the re-score. Cheap to keep as a column if a later filter wants it; the plan leaves it out.
- **Before Phase 2 — the Good-articles draw cost** (Phase 2 §3's "known costs"): accept ~80 list calls a night, or draw by a date-seeded sortkey prefix.
- **Before Phase 3 — the pool switch** (Phase 3 "Pools"): PDR essays and Loupe clippings reachable only through writing slots, and `/explore` showing writing to strangers. Both follow from D2/D3; confirm they're wanted.

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
