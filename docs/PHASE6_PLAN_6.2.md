# Phase 6.2 — Source trials, round 1: detailed execution plan

**Status: ready to execute, with one human prerequisite and one mid-phase stop.** Written to be
executed cold, by a session that has not read the research behind it. Where it says "verified",
the claim was checked against the repo or a live API probe at plan time (08-21-26), not inherited.

**Prerequisite (Ben, before execution starts):** a free api.data.gov key, saved to `.env` as
`SMITHSONIAN_API_KEY`. Signup is instant at <https://api.data.gov/signup/>. T1 fails fast without
it. Everything else in this phase is keyless.

**Mid-phase stop (executing session, non-negotiable):** T6 is a human gate. After the sample
ingests, the session presents the evidence and **stops**. Ben verdicts each source Keep/Park/Cut;
only then does T7 run, and only for keepers. Promoting a source without the eyeball would violate
the trial loop's own rule ("never batch-add without eyeballing"), which is the rule this phase
exists to follow.

**What this phase is.** The first run of `docs/source-candidates.md`'s **trial loop**, over four
candidates: **Smithsonian Open Access**, **Library of Congress (cleared collections, starting
with the Margolies archive)**, **NASA Image & Video Library**, and **PoetryDB**. Each gets a real
adapter in the blessed search shape, trial seed-query cells on the topics where it's honest, and a
sample ingest through the full curator (structural floor + multimodal LLM scoring). Then Ben
verdicts each one; keepers are promoted to SPEC §6.1 with full seed cells and a full ingest run.
The motivation is recorded in log.md 08-21: the gallery rail's feel and `wildcardChance` "can't be
judged honestly against a two-museum corpus" — this phase thickens the corpus so they can be.

**Source of truth.** `docs/source-candidates.md` (as corrected 08-20-26) governs what this phase
is: the four sources are *candidates, not commitments*, and the trial loop is the process.
`docs/BUILD_PLAN.md` 6.2's text ("Remaining v1 adapters: Smithsonian, NASA APOD, Wikiquote,
Gutenberg/Wikisource") predates that correction and is **stale** — T8 rewrites it. Where the two
disagree, source-candidates.md wins.

**Done bar.** Four adapters fixture-tested and live-verified via `bun run probe`; sample corpus
ingested per source with real curation scores; evidence sheet presented at T6 and Ben's four
verdicts recorded in `source-candidates.md`; every keeper promoted — SPEC §6.1 entry, full
seed-query cells tuned against live hit counts, full ingest run, visible in the feed under
`FEED_DEBUG`; trial rows of cut sources deleted; docs and log.md updated.

**Reference reading before you start** (~15 minutes):

- `src/server/services/sources/types.ts` — the adapter contract. Two load-bearing details:
  `search()`'s array order IS the item's rank (ingest's collision rule depends on it), and
  `summary` must always be a real non-empty string (the curator reads it as the primary text
  signal).
- `src/server/services/sources/archive.ts` — the keyed-adapter template: reads `process.env` at
  call time (never imports `~/env` at module top — its header comment explains why), fails fast
  with a clear message when unconfigured. T1 copies this pattern.
- `src/server/services/sources/wellcome.ts` — the precedent for per-item license re-checks and
  for live-verifying an image-URL size rewrite before trusting it. T3's image sizing follows it.
- `src/server/services/sources/http.ts` — `fetchJson` (User-Agent, politeness delay,
  retry-with-backoff on any non-ok response) and the header spread that lets a keyed source add
  headers without losing the defaults. Every adapter goes through it.
- `src/server/services/curator.ts` (header + stage comments) — the two-stage curation every
  ingested item passes: a free structural floor, then multimodal LLM scoring that **downloads the
  image and sends bytes, never the URL** (museum servers bot-block provider-side fetchers,
  CLAUDE.md). This means the sample ingest is also a hotlink health check on each new source —
  the exact failure mode that got AIC suspended.
- `scripts/ingest.ts` header — CLI flags. The ones this phase leans on: `--source`, `--quota`,
  `--topic`, `--skip-llm`, `--dry-run`. Verified at plan time: a topic whose `seed_queries` has
  no cell (or an empty array) for a source is **skipped silently** (`?? []` + `length === 0
  continue`) — partial topic coverage needs no ingest change.
- `docs/source-candidates.md` — the trial loop, the 08-20 probe notes on Smithsonian and LoC that
  T1/T2 build on, and the table idiom T6's verdicts get recorded in.

---

## Decisions locked with Ben 08-21-26 (do not relitigate)

1. **6.2 is reframed: a trial round, not "remaining v1 adapters".** The 08-20 correction in
   source-candidates.md established that Smithsonian/APOD/Wikiquote/Gutenberg were never the
   committed set — an early draft outlived the decision. This phase runs the trial loop; nothing
   is committed until it passes. T8 rewrites BUILD_PLAN 6.2 to match.
2. **The batch is smithsonian + loc + nasa-images + poetrydb** (Ben picked all four offered).
   **NASA Image & Video Library deliberately replaces APOD**: no auth vs. a keyed API, the full
   media catalog vs. one image a day. **Wikiquote and Project Gutenberg/Wikisource are not in the
   batch** — T8 adds them to source-candidates.md as 🔵 untried rows so they aren't lost.
3. **Trial + promote in one phase, gated at T6.** Ben chose the pause-for-eyeball structure over
   an unattended rubric: the session stops with evidence, Ben makes the taste call, the session
   resumes for keepers only.
4. **Partial topic coverage is by design.** A source gets seed cells only for topics where it's
   honest (PoetryDB will never feed `ceramics`; that's fine). Verified: ingest already skips
   empty cells, and the feed draws by topic-then-item, so a source present in four topics simply
   only appears there.
5. **New sources hotlink their image URLs, like every existing source.** The 7.3
   proxy-with-cache decision is not made here. If a trial source's image host misbehaves
   (referer rules, challenges, throttling), that's **evidence recorded for 7.3**, and grounds
   for a Park verdict — not a problem this phase solves.
6. **No topic-graph recompute, no new topics.** The 16 topics stand; new items land in existing
   topics via their seed queries. (The trial loop's step 3 mentions "embedding
   nearest-neighbors" — that language predates the Phase 0.4 pivot; the current-architecture
   eyeball is curation-score distributions plus rendered surfaces, which is what T5's evidence
   sheet provides. T8 may quietly update the loop's wording.)
7. **`WILDCARD_SOURCES` membership is decided per keeper at T7, with Ben, default no.** The
   wildcard dial exists for the archive flavour; a museum-shaped keeper probably doesn't belong
   in it, but an odd one (Margolies?) might. Ask, don't assume.

---

## House rules that apply throughout (verified)

- **One adapter file per source** under `src/server/services/sources/`, exporting a
  `SourceAdapter`, plus one line in `index.ts`'s registry — that line is the *only* wiring
  (ingest and `bun run probe` both read the registry). The `SourceId` union in `types.ts` grows
  by four; `item.source` in the DB is deliberately un-narrowed text (schema.ts comment), so
  **no migration**.
- **Probe first, fixture second, toItem third.** For each source: hit the live API with `curl`
  (or a scratch script), save one real response (trimmed to a few representative rows) into
  `__fixtures__/`, and derive `toItem` from what the API actually returns — not from this
  document's field-name expectations, which are read-only-probe-level, not verified-contract
  level. **Redact `SMITHSONIAN_API_KEY` from any URL captured into a fixture.**
- **Unit tests on fixtures** for every `toItem` (the Phase 3 pattern: happy path + each drop/skip
  rule + normalization edge). `toItem` stays pure and synchronous.
- **All HTTP through `fetchJson`** with a per-source politeness delay (suggested below per task;
  tune down only with evidence). Non-ok responses are retryable by design — never reinterpret a
  failed search as "zero results" (the Phase 0.2 Met lesson, restated in ingest.ts).
- **License honesty.** Filter or re-check to PD/CC0/cleared at the adapter level and record the
  string that is actually true. The Met's own PD filter lies (Phase 3.2 finding, re-confirmed);
  assume nothing.
- **`stripHtml`** (in `normalize.ts`) on any text field that could carry markup (the CMA lesson).
  Never store or render source HTML.
- **`summary` non-empty always.** Where a source has no prose, synthesize an honest one (rules
  per task below) — the curator and any future embedding pass read it.
- **Seed-query typing:** `topics.ts`'s `SeedQueries` is `Record<V1Source, string[]>` — required
  cells for the existing six sources. Add a `TRIAL_SOURCES` const (`["smithsonian", "loc",
  "nasa-images", "poetrydb"]`) and widen the config type to
  `Record<V1Source, string[]> & Partial<Record<TrialSource, string[]>>`, so new-source cells are
  optional per topic (decision 4) while typos still fail the type check.
  `src/server/config/topics.test.ts` locks the topic-contract — extend it, don't fight it. The
  DB column is already loose (`Record<string, string[]>`); `bun run db:seed` upserts, no
  migration.
- **One commit per task, `bun run check` green each time**, on branch
  `feat/phase-6.2-source-trials` (plain branch off main, per Ben's convention).

---

## Tasks

T1–T4 are independent — any order, or parallel sessions. T5 depends on all four. T6 is the gate.
T7/T8 follow the verdicts.

### T1 — `smithsonian` adapter

**Verified at plan time (08-20 live probe, recorded in source-candidates.md):** GET
`https://api.si.edu/openaccess/api/v1.0/search` with
`q=<term> AND media_usage:"CC0" AND online_media_type:"Images"` and `api_key=…` returns hits with
`usage.access: "CC0"` on every sampled row — the license filter is a query parameter, not a
per-item second call. 5.2M rows total, skewed toward specimen/archival records. `DEMO_KEY` is
rate-limited to 10/hr; a real api.data.gov key raises it (typically 1,000/hr — confirm the
`x-ratelimit-limit` header live and pick a politeness delay that respects it; start at 400ms).

**Steps:**
1. Probe live with the real key; capture a trimmed fixture (redact the key). Note where these
   live in the response: id (`id` or `content.descriptiveNonRepeating.record_ID`), title, the
   online-media image URL, the record's public page URL (`guid` or a collections.si.edu link),
   unit name, notes/summary-ish fields, indexed subject terms.
2. `types.ts`: add `"smithsonian"` to `SourceId`. `env.js`: add `SMITHSONIAN_API_KEY:
   z.string().min(1).optional()` to the server schema **and** `runtimeEnv` (both — the file
   requires it). Add the key line to `.env.example`.
3. `smithsonian.ts` on the archive.ts pattern: read `process.env.SMITHSONIAN_API_KEY` at call
   time, throw a clear "not configured" error when absent. `search(query)` sends the composed
   `q` with the CC0 + Images filter terms, then **filters the raw hits through a guard predicate
   the way met.ts does** (see `met.ts:44` — the drop happens in `search()`, keeping `toItem`
   pure happy-path): **re-check `usage.access === "CC0"`** (belt and braces — the Met lesson)
   and require a usable image URL. `toItem` maps: `type: "image"`, `sourceId` = record id, `summary` = best prose field, falling
   back to `"<title> — <unit name>"` (never empty), `attribution` = `"Smithsonian Institution"`
   (or the unit name if the fixture makes that more honest), `license` = `"CC0"`, `tags` from
   indexed terms via existing normalize helpers.
4. Register in `index.ts`. Fixture tests: happy path, non-CC0 dropped, imageless dropped,
   summary fallback.
5. Live-verify: `bun run probe smithsonian "pottery vessel" --limit 5` — eyeball titles, image
   URLs (open two in a browser), licenses.

**Commit:** `feat(sources): smithsonian open access adapter (trial)`

### T2 — `loc` adapter (cleared-collections scope)

**Verified at plan time (08-20 live probe):** GET
`https://www.loc.gov/pictures/search/?q=mrg&fo=json` returns JSON with no auth; results carry a
ready `image.full` URL on `tile.loc.gov`; the per-result `rights` field came back **empty on
every sampled row**. The scoping design follows from that gap: the adapter only searches
collections LoC has blanket-cleared, and the license string is a per-collection constant.

**Design:** a `CLEARED_COLLECTIONS` const in the adapter file — for this trial exactly one
entry: the John Margolies Roadside America archive (`q=mrg`, 11,708 images, LoC-designated
"free to use and reuse" since 2017). Each entry: search token, display name, license string —
take the exact wording from the collection's own rights page (for Margolies it is on the order
of "no known restrictions on publication") and record it verbatim, not paraphrased.
`search(query)` composes `q=<token> <query>` — **verify live** that e.g. `?q=mrg+diner&fo=json`
actually narrows within the collection (spot-check a few results are Margolies photographs); if
composition doesn't scope reliably, fall back to fetching the collection feed and filtering
client-side, and say so in the walkthrough.

**Steps:** probe → fixture → adapter (`sourceId` from the result's stable id/pk field;
`sourceUrl` = the item's loc.gov page link; `imageUrl` = `image.full`; `attribution` =
`"Library of Congress"`; `summary` from title/created/subject fields, never empty; `type:
"image"`; tags from subject headings) → registry → fixture tests (happy path, missing-image
skip, summary synthesis) → `bun run probe loc "diner" --limit 5`. Politeness delay 500ms
(loc.gov documents burst limits; be gentle).

**Note for the T6 verdict:** this trial is deliberately one collection. The verdict is about the
*cleared-collection pattern* as much as Margolies itself — a Keep means "the pattern works;
grow `CLEARED_COLLECTIONS` over time", and that growth path belongs in the SPEC §6.1 entry.

**Commit:** `feat(sources): library of congress adapter, cleared-collections scope (trial)`

### T3 — `nasa-images` adapter

**Plan-time knowledge (probe to confirm):** GET
`https://images-api.nasa.gov/search?q=<term>&media_type=image`, no auth. Response is
`collection.items[]`; each item has `data[0]` (`nasa_id`, `title`, `description`, `keywords`,
`date_created`, `center`) and `links[]` with a preview image href. The preview is often a
`~thumb` variant; a larger rendition is reachable either by URL rewrite (`~thumb` → `~medium` /
`~large`) or via the asset manifest at `/asset/{nasa_id}`. **Follow the Wellcome precedent:**
survey a handful of live URLs, pick the cheapest rewrite that verifiably returns a genuinely
larger file (`curl -sI`, compare content-length), and prefer a rewrite over a per-item second
call.

**License caution (this is the trial question for NASA):** NASA-originated media is public
domain, but the library can include partner/contractor material. Check the fixtures for any
rights-ish field (`secondary_creator`, an explicit rights note in `description`); if one exists,
respect it — skip non-clean rows; if none, scope honestly: `license` = `"Public domain (NASA)"`
and let T5's evidence show whether sampled items are actually NASA-credited. A muddy answer here
is a legitimate Park.

**Steps:** probe → fixture → adapter (`sourceId` = `nasa_id`; `sourceUrl` =
`https://images.nasa.gov/details/<nasa_id>`; `summary` from `description` (strip if HTML-ish,
truncate only if absurd); `attribution` = `"NASA"` or `"NASA / <center>"`; `type: "image"`; tags
from `keywords`) → registry → fixture tests → `bun run probe nasa-images "nebula" --limit 5`.
Politeness delay 250ms.

**Commit:** `feat(sources): nasa image library adapter (trial)`

### T4 — `poetrydb` adapter

**Plan-time knowledge (probe to confirm):** `https://poetrydb.org` — no auth, public-domain
classic poetry. `GET /lines/<keyword>` returns a JSON **array** of `{title, author, lines[],
linecount}`; a no-match response is a JSON **object** (`{status: 404, reason: …}`) — `search()`
must treat that shape as an empty result, not an error. There is no per-poem canonical URL;
compose `sourceUrl` as the API's own title lookup
(`https://poetrydb.org/title/<encoded title>`), which is a real, linkable page of JSON — honest,
if plain. PoetryDB returns no ranking; the array order is arbitrary, which is fine — the rank
contract still applies mechanically to the collision rule.

**Mapping:** `search(query)` = `GET /lines/<query>` (the seed queries below are chosen as
line-keywords). `toItem`: `type: "article"`, `sourceId` = `"<author>::<title>"` (stable and
unique in practice; slugify conservatively), `title`, `attribution` = the poet's name, `body` =
`lines.join("\n")`, `summary` = first two lines + `" — <author>"` (never empty), `imageUrl` =
null, `license` = `"Public domain"`, `tags` = `[author, "poetry"]`.

**Rendering facts (verified at plan time — do not re-derive):**
- `src/lib/reader-blocks.ts` turns **each non-blank line into its own paragraph block**, and its
  degenerate-line filter drops lines with fewer than 3 non-punctuation characters. So a poem
  renders line-by-line on `/i/` — stanza gaps are lost and short exclamation lines may vanish.
  **Acceptable for the trial**; the evidence sheet must include one poem's `/i/` page so Ben
  judges it. If poetrydb is kept, T7 includes a small decision with Ben on whether
  reader-blocks grows verse handling (out of scope for the adapter itself).
- `src/components/feed/article-card.tsx` never reads `imageUrl` (verified) — a null-image
  article is safe in the feed.

**Steps:** probe → fixture (include a no-match object response as a fixture too) → adapter →
registry → fixture tests (happy path, 404-shape → empty, summary/degenerate edges) →
`bun run probe poetrydb "sea" --limit 5`. Politeness delay 250ms.

**Commit:** `feat(sources): poetrydb adapter (trial)`

### T5 — Trial seed cells, sample ingest, evidence sheet

**T5 owns `topics.ts`** (single file; keeps T1–T4 conflict-free if parallelized).

1. Add the `TRIAL_SOURCES` typing (house rules) and trial cells — 2–3 queries per cell, adapting
   the vocabulary lessons already encoded in the existing cells for each topic:
   - `smithsonian`: ~8 varied cells to answer the density question —
     `ceramics`, `textiles`, `machines`, `zoology`, `geology`, `ancient-history`,
     `portraiture`, `botany`.
   - `loc`: `architecture` ("motel", "diner", "gas station"), `typography` ("neon sign",
     "sign"), `machines` ("automobile").
   - `nasa-images`: `astronomy`, `geology`, `the-ocean`, `machines` ("rocket", "aircraft"),
     `cartography` ("earth observation").
   - `poetrydb` (line-keywords): `poetry` ("love", "night", "song"), `the-ocean` ("sea"),
     `astronomy` ("stars", "moon"), `mythology` ("gods"), `botany` ("flower", "rose").
   Update `topics.test.ts` alongside.
2. `bun run db:seed` (upserts the new cells), then per source:
   `bun run ingest --source <id> --quota 15` **with the LLM curator on** (scores are the
   evidence; ~15/cell across these cells is a few hundred items total — trivial OpenRouter
   spend, same pipeline the 3.4 populate proved). Run one source twice to spot-check
   idempotency via the `(source, source_id)` constraint (counts shouldn't move on run 2 beyond
   the known live-API trickle).
3. Compile the **evidence sheet** as the opening section of
   `docs/PHASE6_WALKTHROUGH_6.2.md` (the walkthrough starts life as the gate document). Per
   source:
   - items offered / structurally floored / inserted, per cell (ingest prints this);
   - curation-score distribution vs. the existing corpus baseline — one SQL result pasted in:
     `select source, count(*), round(avg(curation_score),2) as avg, percentile_cont(0.5) within group (order by curation_score) as p50 from item group by source order by source;`
   - image-fetch health: how many curator image downloads failed (curator logs; the AIC
     failure mode — a source whose images the curator can't pull is a source the feed can't
     show);
   - five sample `/i/[itemId]` links, including (for poetrydb) at least one poem;
   - anything smelly: license ambiguity (NASA), scoping weirdness (LoC), specimen-flood
     (Smithsonian), degenerate poems (PoetryDB).
4. A short **eyeball recipe** for Ben: dev server up, the five `/i/` links per source, plus
   `/feed` with `FEED_DEBUG` on to see new-source tiles land in context (they enter topic pools
   immediately once ingested).

**Commit:** `feat(ingest): trial seed cells + sample ingest for the 6.2 batch`

### T6 — THE GATE (stop here)

Present the evidence sheet to Ben. For each of the four sources he verdicts **Keep / Park /
Cut**, in the trial loop's own terms. Record all four in `docs/source-candidates.md` in the
table's existing idiom (✅ kept — promoted, 🟡 parked — with why, ❌ cut — struck through with
the reason), citing the evidence.

Housekeeping that follows directly from verdicts (do at T7 time, but decide here with Ben):
- **Cut** → delete that source's trial rows (`delete from item where source = '<id>'`), remove
  its trial cells; the adapter and tests stay in-repo (cheap, and the trial evidence remains
  reproducible).
- **Park** → default is the same row cleanup unless Ben wants the sample kept; the adapter
  stays. (The `suspended-sources.ts` machinery is for sources with corpus we keep but must not
  draw — only reach for it if Ben wants trial rows retained but hidden.)

**Do not proceed to T7 without the verdicts.**

### T7 — Promotion (per keeper; repeat this task per kept source)

1. **Full seed cells** for every topic where the source is honest — not all 16 by obligation
   (decision 4). Tune the 2.3 way: measure live hit counts per candidate query (probe or a
   scratch loop), keep queries that return healthy, on-topic results at ingest quota, retune the
   weak ones. Update `topics.test.ts`.
2. **Full ingest:** `bun run db:seed`, then `bun run ingest --source <id>` (default quota 150).
   Same order of magnitude per source as the 3.4 populate run. Re-run the score-distribution SQL
   after; paste into the walkthrough.
3. **Docs promotion:** SPEC §6.1 gains the source's entry (shape, quirks found in trial, license
   posture, and for `loc` the cleared-collections growth path); its source-candidates row
   flips to ✅ with a pointer here.
4. **`WILDCARD_SOURCES`:** ask Ben whether this keeper belongs in the gallery rail's wildcard
   list (decision 7; default no).
5. **Feed check:** with `FEED_DEBUG`, confirm the source appears in the feed and the
   no-adjacent-same-source constraint behaves (existing tests already enforce the mechanics;
   this is an eyeball).

**Commit per keeper:** `feat(sources): promote <id> — full seed cells + ingest`

### T8 — Docs

1. **BUILD_PLAN 6.2 rewritten** in the house "revised at build time" idiom: the reframe (trial
   round over the corrected candidate framing, decision 1), what was trialed, the verdicts, and
   what got promoted. APOD/Wikiquote/Gutenberg references removed from the step text.
2. **source-candidates.md:** verdicts recorded (T6); **add 🔵 rows for Wikiquote and Project
   Gutenberg / Wikisource** (📝 text sources, decision 2) so dropping them from BUILD_PLAN
   loses nothing; optionally align the trial loop's step-3 wording with the current
   architecture (decision 6).
3. **SPEC:** §6.1 entries per keeper (T7); add to §15 anything genuinely open that the trial
   surfaced (e.g. NASA license muddiness if parked on it, image-host behavior evidence for 7.3).
4. **`docs/PHASE6_WALKTHROUGH_6.2.md`** finished in the 5.x walkthrough style (it began life as
   T5's evidence sheet).
5. **log.md** entry per CLAUDE.md's format — decisions and findings, not a commit replay —
   ending with the session-spend line from the shared script (omit if the script exits
   non-zero).

**Commit:** `docs: phase 6.2 walkthrough + verdicts recorded`

---

## Verification

- `bun run check` green at every commit; new unit tests exist for all four `toItem`s (fixture
  based, drop rules covered).
- Each adapter live-probed with output pasted into the walkthrough
  (`bun run probe <id> "<query>" --limit 5`), two image URLs per image source opened and seen to
  render in a browser.
- Sample ingest: per-cell stats sane, idempotency spot-check clean, curator image-download
  failure count per source recorded (zero-ish expected; a high count is Park/Cut evidence, and
  7.3 evidence either way).
- `/i/` renders one item per source correctly — including one poem (line-by-line is expected;
  garbled or empty is not) and each image source's hero loading over the dev origin.
- After promotion: keeper visible in `/feed` under `FEED_DEBUG`; score-distribution SQL re-run
  and pasted.
- `bun run e2e` once at the end of the phase (nothing here touches UI code paths, but the suite
  is cheap insurance; remember the CLAUDE.md note — a red Postgres-touching test on a busy
  machine is usually the machine).

## Out of scope (resist)

- **APOD, Wikiquote, Gutenberg/Wikisource adapters** — replaced or deferred (decision 2).
- **Topic-graph recompute, new topics, the 32-chip expansion** — the 16 stand (decision 6).
- **6.1 (feed learns from saves)** — untouched.
- **6.3 (blogs) and anything doorofperception** — its design session is a separate phase.
- **AIC un-suspension and the 7.3 image proxy** — record evidence, change nothing.
- **Getty / Rijksmuseum / Harvard / Openverse / the rest of the candidates table** — later
  rounds; Getty explicitly needs a shape decision first.
- **Feed-mechanics changes, schema migrations** — none are needed; if one starts to look
  needed, stop and re-plan (that's hidden complexity, not a detail).
