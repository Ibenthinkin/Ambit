# Phase 3 — Source adapters, curation, ingestion: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 3 (steps 3.1–3.4), in the same format as
> [`PHASE2_PLAN.md`](PHASE2_PLAN.md). Written 08-07-26. Check BUILD_PLAN boxes as each step's
> *Done =* line is met. Assumes Phase 2 is complete (compose Postgres, schema, auth, 16 seeded topics).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Workflow note (Ben's plan-then-execute-cheaper):** this plan was written in a Fable session with docs verification done; the executing session should be a cheaper model, working cold from this file. Everything needed is in here or at the exact repo paths cited. When live docs contradict this plan, re-verify against docs before trusting either (that's how 2.2 caught the `proxy.ts` rename).

**Goal:** All five v1 source adapters (Wikipedia, Met, AIC, CMA, Wellcome), the curation service (structural floor + LLM curator), `drawFromTopic`, and the idempotent ingestion job — ending with a populated dev DB. BUILD_PLAN steps 3.1–3.4.

**Architecture:** Each external API gets an isolated `SourceAdapter` in `src/server/services/sources/` (`search()` returns raw per-source records in rank order; `toItem()` is a pure normalizer → unit-testable on fixtures). `scripts/ingest.ts` orchestrates: search all topics × sources → resolve cross-topic collisions (highest-search-rank wins — decision settled in this planning session, records into SPEC §15) → skip items already in DB → structural quality floor → LLM curation (OpenRouter, images passed as base64 bytes, never URLs) → insert. Idempotent via the `(source, source_id)` unique constraint.

**Tech Stack:** Bun + TypeScript (strict), Drizzle over Postgres (compose), Vitest fixtures for all adapter tests, OpenRouter (`google/gemini-2.5-flash-lite`) for curation. **No new dependencies** — everything needed is installed.

## Decisions settled during planning (record in SPEC as noted)

1. **3.4 collision rule = highest-search-rank wins.** When one object answers multiple topics' seed queries, the topic where it ranked highest (lowest index in `search()` results) claims it; ties broken by alphabetically-smallest topic id. Order-independent (SPEC §15's requirement). Collision counts logged per source in the ingest summary. → Task 5 records this in SPEC §15 (move from Open to settled).
2. **Wikipedia images: resolve per-image licenses at ingest.** Batched `prop=imageinfo&iiprop=extmetadata` calls (verified current, 2026-08-07: returns `LicenseShortName` etc.; docs warn it's expensive — batch ~10 File titles per request). Keep an image only when its license is free (public domain / CC0 / CC BY / CC BY-SA); otherwise the card is text-only. → Task 1 records this in SPEC §6.1.
3. **All five adapters land in Phase 3** (BUILD_PLAN 3.2 said three; topics.ts and the seeded queries already assume five; CMA+Wellcome are trial-passed with quirks recorded). → Task 3 updates BUILD_PLAN 3.2's text.

## Global Constraints

- **Runtime:** Bun. Scripts run as `bun run scripts/<name>.ts`. Tests: `bun run test` (Vitest, `src/**/*.test.ts`, node environment). Full gate: `bun run check` (typecheck → lint → format:check → unit tests) must pass before every PR.
- **Branch/PR per BUILD_PLAN step, merged to main before the next.** Branch `phase-3.1-adapter-wikipedia` already exists and is checked out — use it for Task 1. CI only runs on PRs (2.2's hard-won lesson: main was silently red for 8 days from a direct push) — **never push a step straight to main**.
- **User agent for every external request:** `Ambit/0.1 (https://github.com/Ibenthinkin/Ambit; benjamin.reilly@gmail.com)` — public-API etiquette, Wikipedia requires it.
- **Never hand a museum image URL to a third-party service** — download bytes, pass base64 (AIC/museum servers bot-block provider fetchers; bitten twice in Phase 0.5).
- **No live HTTP in unit tests.** Fixtures in `src/server/services/sources/__fixtures__/*.json`, recorded once via curl (commands given per task), trimmed to a few representative records.
- **Teaching comments:** Ben is a returning webdev; this repo doubles as stack-learning. Comment generously in the style of `phase0/harvest.ts` / `src/server/db/schema.ts` — explain what each piece is *for* and the API quirks it guards against.
- **Rate-limit politeness (from Phase 0, all live-verified):** Met 400 ms/req (it 403s — not 429s — when hammered, and the 403 clears after a pause); Wellcome 250 ms; Wikipedia/AIC/CMA ~120–150 ms. Retry with exponential backoff 1 s → 3 s → 9 s + jitter, 4 attempts.
- **Docs updates ride with each task's PR:** check the BUILD_PLAN box, write `docs/PHASE3_WALKTHROUGH_3.x.md` (same style as `docs/PHASE2_WALKTHROUGH_2.2.md`), update SPEC where a decision lands, extend `log.md` per its format rules (incl. the session-spend line from `python3 ~/.claude/scripts/session-spend.py --session <session-uuid>` — never estimate; omit on non-zero exit).

## Reference files (read before the task that uses them)

| File | What it holds |
|---|---|
| `phase0/harvest.ts` | Working reference code for all five sources: endpoints, field lists, summary synthesis, every quirk, inline-commented |
| `phase0/NOTES.md` | The quirk registry: Met PD-filter lies, AIC limit cap + IIIF sizing, Wellcome thumb rewrite, `cllimit=max`, bot-blocking |
| `phase0/curate.ts` | Reference for the curator: persona prompt (port verbatim), floor rules, cache pattern, base64 image handling, concurrency pool |
| `src/server/db/schema.ts` | `item` table — `NormalizedItem` must map onto its insert shape |
| `src/server/config/topics.ts` | The 16 topics + per-source seed-query arrays (already seeded into the DB by 2.3) |
| `docs/PHASE2_WALKTHROUGH_2.2.md` | Walkthrough-doc style to match |

---

### Task 1 — 3.1: Adapter contract, shared plumbing, Wikipedia adapter

**Branch:** `phase-3.1-adapter-wikipedia` (exists, checked out)

**Files:**
- Create: `src/server/services/sources/types.ts`
- Create: `src/server/services/sources/http.ts`
- Create: `src/server/services/sources/normalize.ts`
- Create: `src/server/services/sources/wikipedia.ts`
- Create: `src/server/services/sources/__fixtures__/wikipedia.json`
- Test: `src/server/services/sources/normalize.test.ts`, `src/server/services/sources/wikipedia.test.ts`
- Create: `scripts/probe-adapter.ts` (+ `"probe": "bun run scripts/probe-adapter.ts"` script in `package.json`)
- Modify: `SPEC.md` §6.1 (Wikipedia image-license decision), `docs/BUILD_PLAN.md` (check 3.1)
- Create: `docs/PHASE3_WALKTHROUGH_3.1.md`

**Interfaces (Produces — later tasks depend on these exact names):**

```typescript
// types.ts
export type SourceId = "wikipedia" | "met" | "aic" | "cma" | "wellcome";

/** toItem's output: the `item` insert shape minus what ingestion adds later
 *  (id, topicId, curationScore, aestheticTags, fetchedAt). Aligned with
 *  schema.ts's `item` — `summary` is always synthesized (never null) because
 *  the curator and the embedding tooling both read it. */
export interface NormalizedItem {
  source: SourceId;
  sourceId: string;
  type: "image" | "article";
  title: string;
  summary: string;
  body: string | null;      // full article text; articles only
  imageUrl: string | null;
  sourceUrl: string;
  attribution: string;
  license: string;
  tags: string[];
}

export interface FetchOpts {
  /** Max items to return. Adapters scan more raw hits than this to fill it
   *  (PD/license re-checks drop 30–70% on some sources). Default 50. */
  limit?: number;
}

export interface SourceAdapter<Raw = unknown> {
  source: SourceId;
  /** Results in search-rank order — the array index IS the rank, which the
   *  ingestion collision rule ("highest-search-rank wins") depends on. */
  search(query: string, opts?: FetchOpts): Promise<Raw[]>;
  /** Pure, synchronous normalizer — the unit-test surface. */
  toItem(raw: Raw): NormalizedItem;
}
```

```typescript
// http.ts
export const USER_AGENT =
  "Ambit/0.1 (https://github.com/Ibenthinkin/Ambit; benjamin.reilly@gmail.com)";

/** GET a JSON URL with politeness delay + retry (1s→3s→9s + ≤500ms jitter, 4 attempts).
 *  The retry exists chiefly for the Met, whose rate limit is a 403 that clears
 *  after a pause — treat any non-ok status as retryable. No disk cache (unlike
 *  phase0): the DB's skip-existing check is the real cache now. */
export async function fetchJson(url: string, opts?: { delayMs?: number }): Promise<unknown>;
```

```typescript
// normalize.ts — shared normalization helpers, ported from phase0/harvest.ts
/** Collapse whitespace, trim to `max` chars, cut at a sentence boundary where possible. */
export function toLede(text: string, max?: number): string;   // default max 700
/** Dedupe, drop null/empty, trim. */
export function uniqueTags(tags: (string | null | undefined)[]): string[];
```

**Wikipedia adapter design** (port from `phase0/harvest.ts:196-245`, then extend):

- `search(query, { limit = 50 })`:
  1. `action=query&list=search&srnamespace=0&srlimit=<limit+10>&srsearch=<query>` → drop low-value titles (`/^(List of|Index of|Outline of|Timeline of|Glossary of)\b/i`, `/\(disambiguation\)/i`).
  2. Detail in batches of 20 page ids (TextExtracts cap): `prop=extracts|pageimages|categories&exintro=1&explaintext=1&piprop=original|name&cllimit=max&clshow=!hidden&pageids=...`. **`cllimit=max` is load-bearing** — any smaller value is a whole-query budget that starves later pages of categories (NOTES.md). Drop extracts < 200 chars (stubs). `piprop=original|name` adds `pageimage` (the lead image's File name) next to `original.source` (its URL) — the name is what the license lookup needs.
  3. **Image license resolution** (the settled decision): batch the collected `File:` titles ~10 per request — `prop=imageinfo&iiprop=extmetadata&titles=File:A.jpg|File:B.png`. Read `extmetadata.LicenseShortName.value`. Free-license predicate:
     ```typescript
     /** Wikipedia lead images carry per-file licenses the search/extract APIs
      *  don't expose. Only serve images whose license we may serve (SPEC §6.1). */
     const FREE_IMAGE_LICENSE = /^(public domain|pd|no restrictions|cc0|cc[ -]by(?:[ -]sa)?\b)/i;
     ```
     Non-free or unresolvable → the raw record keeps `imageLicense: null` and the item goes text-only. (extmetadata is expensive server-side — keep batches small, one 120 ms delay between.)
  4. **Full body, one page per request** (verified: whole-article extracts are capped at 1 page/request; only intro extracts batch to 20): for each kept page, `prop=extracts&explaintext=1&exsectionformat=plain&pageids=<one id>`. Cap stored body at ~50 000 chars. Plaintext, so nothing HTML-unsafe is stored (SPEC §11).
- `WikipediaRaw` = `{ page: <the detail-batch page object>, body: string | null, imageLicense: string | null }` — keep `page` as the API returned it so `toItem` owns all normalization.
- `toItem(raw)`: title, `summary: toLede(extract)`, `body`, `imageUrl: raw.imageLicense ? page.original?.source ?? null : null`, `sourceUrl: https://en.wikipedia.org/?curid=<pageid>`, `tags: uniqueTags(categories minus "Category:" prefix)`, `attribution: Wikipedia contributors, “<title>”`, `license: "CC BY-SA 4.0 (text)"` — appending `; image: <LicenseShortName>` when an image is kept.

**Steps:**

- [ ] **Step 1: Write `normalize.test.ts` (failing)** — `toLede`: short text passes through; >700 chars cuts at the last `". "` past the halfway point; no sentence boundary → hard cut + `…`. `uniqueTags`: dedupes, drops null/undefined/whitespace-only, trims.
- [ ] **Step 2: Run it, verify it fails** — `bun run test` → FAIL (module not found).
- [ ] **Step 3: Implement `normalize.ts`, `types.ts`, `http.ts`** — port `toLede`/`uniqueTags` verbatim from `phase0/harvest.ts:170-183`; `fetchJson` from `getJson` (`phase0/harvest.ts:132-167`) minus the disk cache. Run tests → PASS.
- [ ] **Step 4: Record the Wikipedia fixture** — run the real API once and trim (this is the one sanctioned live call; commit the result):
  ```bash
  curl -s -H 'User-Agent: Ambit/0.1 (...)' 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts%7Cpageimages%7Ccategories&exintro=1&explaintext=1&piprop=original%7Cname&cllimit=max&clshow=!hidden&titles=Astronomy%7CHalley%27s%20Comet%7CEpistemology'
  # plus one imageinfo call for the File names those return, e.g.:
  curl -s -H 'User-Agent: ...' 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File:...'
  ```
  Build `__fixtures__/wikipedia.json` as an array of `WikipediaRaw`-shaped records covering: article with free-licensed image, article whose image is non-free (`imageLicense: null` — hand-edit one if the sample doesn't produce it), article with no image, plus one with a `(disambiguation)`-style title and one with a <200-char extract for the filter tests.
- [ ] **Step 5: Write `wikipedia.test.ts` (failing)** — for each fixture record, assert the full `NormalizedItem` shape from `toItem`: type `"article"`, lede ≤700 chars, `Category:` prefixes stripped, image kept/nulled by license, license string composition, `sourceUrl` format. Also unit-test the exported low-value-title predicate and `FREE_IMAGE_LICENSE` against: `"CC BY-SA 4.0"` ✓, `"Public domain"` ✓, `"CC0"` ✓, `"Fair use"` ✗, `"Copyrighted"` ✗.
- [ ] **Step 6: Implement `wikipedia.ts`** to green. Export the adapter as `wikipedia: SourceAdapter<WikipediaRaw>` plus the pure predicates for testing.
- [ ] **Step 7: Write `scripts/probe-adapter.ts`** — dev CLI reused by every later adapter task: `bun run probe wikipedia astronomy --limit 5` → runs `search`, maps `toItem`, prints a compact table (title / type / has-image / license / tag count / summary head). Registry starts with `{ wikipedia }` and grows per task.
- [ ] **Step 8: Live verification** — `bun run probe wikipedia astronomy --limit 5` and one more topic (`typography`): clean items, ledes read well, at least one image survives license resolution, no crashes. This is 3.1's "Done =" line.
- [ ] **Step 9: Docs** — SPEC §6.1: add the Wikipedia image-license bullet (resolve at ingest via batched `imageinfo`/`extmetadata`; non-free → text-only card). BUILD_PLAN: check 3.1. Write `docs/PHASE3_WALKTHROUGH_3.1.md`. Extend `log.md`.
- [ ] **Step 10: Gate + PR** — `bun run check` green → commit → push → PR "Phase 3.1: adapter contract + Wikipedia" → CI green → merge.

---

### Task 2 — 3.2: Met + AIC adapters

**Branch:** `phase-3.2-met-aic` off fresh main

**Files:**
- Create: `src/server/services/sources/met.ts`, `src/server/services/sources/aic.ts`
- Create: `__fixtures__/met.json`, `__fixtures__/aic.json`
- Test: `met.test.ts`, `aic.test.ts`
- Modify: `scripts/probe-adapter.ts` (register both), `docs/BUILD_PLAN.md` (check 3.2)
- Create: `docs/PHASE3_WALKTHROUGH_3.2.md`

**Interfaces:** Consumes `SourceAdapter`/`NormalizedItem`/`fetchJson`/`toLede`/`uniqueTags` from Task 1. Produces `met: SourceAdapter<MetRaw>`, `aic: SourceAdapter<AicRaw>` where `MetRaw` = the Met object-endpoint JSON, `AicRaw` = one AIC search datum.

**Met design** (port `phase0/harvest.ts:253-318`; quirks from NOTES.md):
- `search`: `GET /search?hasImages=true&isPublicDomain=true&q=<query>` → object IDs; then per-object `GET /objects/<id>` at **400 ms delay** (faster → silent 403s). Scan up to `limit × 4` ids — **the search's PD filter lies** (0.2 measured 30–70% of "public domain" hits failing the per-object check); the object record is the truth: require `isPublicDomain && primaryImage && title`. Per-object fetch failures (dead IDs like object 913417 are in the index but 404) are caught, counted, and skipped — never abort the run.
- `toItem`: type `"image"`; summary synthesized from catalogue fields in this exact order (artist+bio, date, medium, culture, period, classification, "<dept> collection", tag terms) via `toLede` — see `metSummary` (`phase0/harvest.ts:258-271`); `imageUrl: primaryImageSmall || primaryImage` (note: some Met URLs contain literal spaces — store as-is; the curator's fetch tries `encodeURI` as fallback); tags from tag terms + department + classification + culture + objectName; attribution `<creditLine>. The Metropolitan Museum of Art`; license `CC0 1.0 (public domain)`.

**AIC design** (port `phase0/harvest.ts:323-384`):
- `search`: `GET /artworks/search?q=<query>&page=<n>&limit=100&fields=<AIC_FIELDS>` — **`limit` above 100 is a hard 403** ("Invalid limit"), so page `1..6`; filter `is_public_domain && image_id && title` client-side (AIC search has no PD filter).
- `toItem`: IIIF URL constructed, **size `!843,843` never `843,`** (plain width 403s on originals narrower than 843 px — IIIF rejects upscales); summary per `aicSummary` order (artist with newlines→commas, date, medium, origin, classification, dept, term_titles); `sourceUrl: https://www.artic.edu/artworks/<id>`; license CC0.

**Steps:**

- [ ] **Step 1: Record fixtures** — Met: `curl` the search for `astronomy`, then 3–4 object records including at least one where `isPublicDomain` is false and one missing `primaryImage` (the servability tests need them). AIC: one search page for `astronomy` with the exact `AIC_FIELDS` list from `phase0/harvest.ts:325`, trimmed to 4–5 data records including a non-PD one.
- [ ] **Step 2: Write both test files (failing)** — per adapter: `toItem` full-shape assertions on the servable fixture records (summary field order matters — assert the synthesized string, it's the 0.2 "museum text is about the wrong thing" lesson made testable); exported servability predicate (`isServable(raw)`) rejects the non-PD / no-image records; AIC: constructed IIIF URL ends `/full/!843,843/0/default.jpg`.
- [ ] **Step 3: Run → FAIL, implement both adapters → PASS.** Keep the delay/paging/scan-factor constants exported (ingestion's summary log references them; tests pin `AIC_PAGE_SIZE = 100`, `MET_DELAY_MS = 400`).
- [ ] **Step 4: Register in `probe-adapter.ts`; live-verify** — `bun run probe met astronomy --limit 5` and `bun run probe aic typography --limit 5` (typography exercises AIC paging depth). Expect the Met probe to be slow — that's the 400 ms politeness delay working.
- [ ] **Step 5: Docs + gate + PR** — check BUILD_PLAN 3.2 and **amend its text**: "three total sources" → five-in-phase-3 decision (CMA + Wellcome land in 3.2b, next PR). Walkthrough `PHASE3_WALKTHROUGH_3.2.md`, log.md, `bun run check`, PR, CI, merge.

---

### Task 3 — 3.2b: CMA + Wellcome adapters

**Branch:** `phase-3.2b-cma-wellcome` off fresh main

**Files:**
- Create: `src/server/services/sources/cma.ts`, `src/server/services/sources/wellcome.ts`
- Create: `__fixtures__/cma.json`, `__fixtures__/wellcome.json`
- Test: `cma.test.ts`, `wellcome.test.ts`
- Modify: `scripts/probe-adapter.ts`, `docs/BUILD_PLAN.md` (3.2b line under 3.2)
- Create: `docs/PHASE3_WALKTHROUGH_3.2B.md`

**Interfaces:** Produces `cma: SourceAdapter<CmaRaw>`, `wellcome: SourceAdapter<WellcomeRaw>`. With this task the adapter registry is complete: all five `SourceId`s resolvable — Task 5 imports the registry object (put it in `src/server/services/sources/index.ts`: `export const adapters: Record<SourceId, SourceAdapter<any>>`; create it here).

**CMA design** (port `phase0/harvest.ts:393-449` — friendliest API: no key, full records in search, one request per query):
- `search`: `GET https://openaccess-api.clevelandart.org/api/artworks/?q=<query>&cc0&has_image=1&limit=<min(limit×3, 1000)>&fields=id,title,tombstone,description,creators,creation_date,culture,technique,department,type,images,url,share_license_status` — `cc0` is a presence-only flag. **Still re-check `share_license_status === "CC0"` per record** (trust-nothing rule) + `images.web.url` + `title`.
- `toItem`: summary leads with the museum's prose `description` when present (the 0.2 subject-before-medium lesson applied at source), then creators, date, technique, culture, type, "<dept> collection"; tags from type/department/technique/culture (CMA has no folksonomy array); attribution `<creators>. The Cleveland Museum of Art`; license CC0.

**Wellcome design** (port `phase0/harvest.ts:458-541`):
- `search`: `GET https://api.wellcomecollection.org/catalogue/v2/works?query=<q>&items.locations.license=cc-0,cc-by,pdm&pageSize=100&page=<1..8>&include=production,contributors,subjects,notes` at 250 ms delay. Per-work check: `title && thumbnail.url && thumbnail.license.id ∈ {cc-0, cc-by, pdm}` — license is per item and heterogeneous; the request filter alone is not sufficient.
- `toItem`: **rewrite the thumbnail size segment** — `thumbnail.url` arrives locked to `!200,200`; swap via `url.replace(/\/full\/![0-9]+,[0-9]+\//, "/full/!800,800/")` (fit-in-box, never upscale; a no-op if the URL shape ever changes). Summary from description/summary-typed notes, contributors, production date, physicalDescription, workType, subjects. License label map: `cc-0` → `CC0 1.0 (public domain)`, `pdm` → `Public Domain Mark`, `cc-by` → `CC BY 4.0`. `sourceUrl: https://wellcomecollection.org/works/<id>`.

**Steps:**

- [ ] **Step 1: Record fixtures** — CMA search for `astronomy` trimmed to 4–5 records (include one non-CC0 and one missing `images.web`); Wellcome one page for `anatomy` with the `include` params, 4–5 works (include one whose `thumbnail.license.id` is outside the open set).
- [ ] **Step 2: Tests (failing)** — servability predicates reject the bad records; CMA summary leads with `description` when present; Wellcome imageUrl asserts the `!800,800` rewrite happened; license label mapping.
- [ ] **Step 3: Implement both → PASS.** Create `sources/index.ts` with the complete five-adapter registry.
- [ ] **Step 4: Probe live** — `bun run probe cma botany --limit 5`, `bun run probe wellcome astronomy --limit 5`; eyeball that Wellcome images aren't 200 px thumbs.
- [ ] **Step 5: Docs + gate + PR** — add a `[x] 3.2b` line to BUILD_PLAN under 3.2, walkthrough, log.md, `bun run check`, PR, merge.

---

### Task 4 — 3.3: Curation service + `drawFromTopic`

**Branch:** `phase-3.3-curation` off fresh main

**Files:**
- Create: `src/server/services/curator.ts`
- Test: `src/server/services/curator.test.ts`
- Modify: `src/server/db/items.ts` (implement `drawFromTopic`; leave `upsertItem`/`getItemById` stubs — they land in 3.4 / Phase 4)
- Test: `src/server/db/items.integration.test.ts` (skips without a DB)
- Modify: `src/env.js` (+ `OPENROUTER_API_KEY: z.string().min(1).optional()` in `server` + `runtimeEnv` — optional because only ingest needs it; the script enforces presence itself)
- Modify: `.gitignore` (+ `.cache/`)
- Modify: `docs/BUILD_PLAN.md` (check 3.3)
- Create: `docs/PHASE3_WALKTHROUGH_3.3.md`

**Interfaces (Produces):**

```typescript
// curator.ts — port of phase0/curate.ts (the reference; keep its structure & comments' spirit)
export const CURATOR_MODEL = "google/gemini-2.5-flash-lite";
export const PROMPT_VERSION = 1;
export const CURATOR_PROMPT = `...`; // ← copy VERBATIM from phase0/curate.ts:79-89 — it is a
                                     // product artifact (Ben's taste calibration lands there)

export type CuratedItem = NormalizedItem & { curationScore: number; aestheticTags: string[] };

/** Stage 1 — structural quality floor (free, pure). Batch-relative: dup-title
 *  counts are within the given batch. Rules (each maps to a Phase 0.4 finding):
 *  >2 items sharing a normalized title; bare single-word titles on IMAGE items
 *  only; summaries under 60 chars. */
export function structuralFloor(items: NormalizedItem[]): {
  kept: NormalizedItem[];
  dropped: { item: NormalizedItem; rule: "dup-title" | "bare-title" | "thin-summary" }[];
};

/** Stage 2 — LLM curator. Cached on disk (.cache/curation/) keyed
 *  sha256(model|v<PROMPT_VERSION>|source:sourceId); image items judged from the
 *  DOWNLOADED image as base64 (never the URL); fetch failure → judge text-only;
 *  scoring failure after retries → neutral 5 + [] and a warn (never lose the item).
 *  Concurrency 8. Returns items in input order. */
export function curateItems(
  items: NormalizedItem[],
  opts?: { force?: boolean; onProgress?: (done: number, total: number) => void },
): Promise<CuratedItem[]>;
```

```typescript
// items.ts — drawFromTopic becomes real (upsertItem stays a 3.4 stub)
/** SPEC §9.2. Weight = (score − floor + 1)^power × (1 + boostPerTag × sharedAestheticTags).
 *  Defaults are the Phase 0.5 shipped knobs (phase0/feed.template.html:221):
 *  power 1.5, boostPerTag 0.5 (scoreFloor is the caller's knob, feed default 4).
 *  Weighted sample WITHOUT replacement; rng injectable for tests. NEVER
 *  similarity-ranked — the 0.4 failure stays dead. */
export function drawFromTopic(
  topicId: string,
  opts: {
    scoreFloor: number;
    excludeIds: string[];
    limit: number;
    tasteKeywords?: string[];
    power?: number;        // default 1.5
    boostPerTag?: number;  // default 0.5
    rng?: () => number;    // default Math.random
  },
): Promise<Item[]>;

/** Exported for unit tests + Phase 4 reuse. */
export function drawWeight(score: number, floor: number, power: number, sharedTags: number, boostPerTag: number): number;
```

**Implementation notes:**
- Curator call: `POST https://openrouter.ai/api/v1/chat/completions`, `response_format: { type: "json_object" }`, `temperature: 0.2`, system = `CURATOR_PROMPT`, user content = text block (`Type/Title/Tags(≤12)/Text` — see `itemAsText`, `phase0/curate.ts:171-180`) + `image_url` part with the base64 data URL for image items. Parse → clamp score 1–10 (round), reject `≤0`/NaN as a retryable bad response, tags → lowercase trimmed strings, max 4. Retry 4× with backoff; on final failure neutral 5.
- `imageAsDataUrl(url)`: try `url` then `encodeURI(url)` (Met's literal-spaces trap); require `content-type: image/*`; send `USER_AGENT`. Port from `phase0/curate.ts:191-205`.
- `drawFromTopic` query: Drizzle select from `item` where `topicId` = arg AND `curationScore >= scoreFloor` AND `id NOT IN excludeIds` (guard the empty-array case — `notInArray` with `[]` is invalid SQL; conditionally include). Then weighted sampling in JS (topic pools are hundreds of rows; `idx_item_topic_score` covers the scan). Shared-tag count = intersection of `aestheticTags` with lowercased `tasteKeywords`.

**Steps:**

- [ ] **Step 1: `curator.test.ts` (failing), structural floor cases** — build small `NormalizedItem[]` literals: 4 items titled "Textile"/"textile "/"TEXTILE."/"textile" → all 4 dropped as `dup-title` (normalization: lowercase, strip non-letter/number/space, collapse whitespace); image item titled "Bowl" → `bare-title`; **article** titled "Astronomy" → kept (rule is image-scoped); summary of 59 chars → `thin-summary`; a clean item → kept.
- [ ] **Step 2: Curator response-parsing cases** — export the internal `parseCuratorResponse(content: string)` and test: valid JSON → clamped score + ≤4 lowercase tags; score `0`/missing → throws (retryable); score `14` → clamps to 10; non-array tags → `[]`; junk strings filtered out.
- [ ] **Step 3: `drawWeight` cases** — `(score 8, floor 4, power 1.5, 0 shared, boost .5)` → `5^1.5 ≈ 11.18`; 2 shared tags → `× 2`; score at the floor → weight 1; power 0 + no tags → 1 for every score (pure random, the documented knob semantics).
- [ ] **Step 4: Run → FAIL, implement `curator.ts` + `drawWeight`/sampler → PASS.** (No live LLM calls in tests — `curateItems`'s network path is exercised by the 3.4 live run.)
- [ ] **Step 5: Implement `drawFromTopic` + `items.integration.test.ts`** — guard with `describe.skipIf(!process.env.DATABASE_URL)`. Seed: insert a throwaway topic + ~6 items across scores 2–9 (unique nanoid'd sourceIds), then: floor 4 excludes the 2-scorers; `excludeIds` honored; `limit` honored; with a seeded deterministic `rng`, draw order is stable; 300 draws with real rng → the score-9 item appears more often than the score-5 item. Clean up (delete inserted rows) in `afterAll`.
- [ ] **Step 6: Run integration tests against compose DB** — `docker compose up -d`, `bun run test` (they self-skip in CI, which has no Postgres until 7.1 — note this in the file header).
- [ ] **Step 7: Live curator smoke (~40 items, ≈ $0.01)** — tiny inline script or extend probe: harvest `wikipedia astronomy --limit 20` + `met astronomy --limit 20`, run `structuralFloor` + `curateItems`, print the score histogram + top/bottom 3. Sanity: museum treasures score 7–9, keyword strays 3–5 (0.5's calibration pattern). Verify `.cache/curation/` filled and an immediate re-run bills 0 tokens.
- [ ] **Step 8: Docs + gate + PR** — check BUILD_PLAN 3.3, walkthrough, log.md, `bun run check`, PR, merge.

---

### Task 5 — 3.4: Ingestion job

**Branch:** `phase-3.4-ingestion` off fresh main

**Files:**
- Create: `scripts/ingest.ts`
- Modify: `package.json` (+ `"ingest": "bun run scripts/ingest.ts"` — SPEC §13)
- Modify: `src/server/db/items.ts` (implement `upsertItem`)
- Create: `scripts/ingest.test.ts` → **no** — collision logic must be unit-tested, so put it in `src/server/services/ingest-plan.ts` + `src/server/services/ingest-plan.test.ts` (pure planning/collision module; the script stays thin orchestration)
- Modify: `SPEC.md` §15 (collision rule settled) & §6.4 if wording drifts; `docs/BUILD_PLAN.md` (check 3.4 — **also fix its stale "normalize, embed, upsertItem" wording**: no embedding happens at ingest, the 0.4 pivot removed it)
- Create: `docs/PHASE3_WALKTHROUGH_3.4.md`

**Interfaces (Produces):**

```typescript
// ingest-plan.ts — the pure, testable core of the collision rule
export interface Claim {
  topicId: string;
  rank: number;          // index in the search() results that surfaced it
  item: NormalizedItem;
}

/** THE 3.4 DECISION (settled 08-07-26): highest-search-rank wins, ties → the
 *  alphabetically-smallest topic id. Order-independent by construction —
 *  phase0's last-topic-wins dedupe silently starved earlier topics (astronomy
 *  kept 4 of 419 AIC finds; SPEC §15). Returns one winner per (source,
 *  sourceId) plus per-source collision counts for the summary log. */
export function resolveCollisions(claims: Claim[]): {
  winners: (Claim & { collidedWith: string[] })[];
  collisionCountBySource: Record<string, number>;
};
```

```typescript
// items.ts — upsertItem becomes real
/** Insert, or on (source, sourceId) conflict refresh the content fields
 *  (title, summary, body, imageUrl, sourceUrl, attribution, license, tags,
 *  fetchedAt) while PRESERVING id, topicId, curationScore, aestheticTags —
 *  scores are only re-bought on a PROMPT_VERSION bump, and topic reassignment
 *  of an existing item would churn the corpus under users. Returns the row. */
export function upsertItem(values: NewItem): Promise<Item>;
```

**Pipeline** (`scripts/ingest.ts`; flags: `--source <id>`, `--topic <id>`, `--quota <n>` default 150, `--skip-llm` (neutral 5s — free dry-runs), `--dry-run` (no DB writes)):

1. Read topics + seed queries **from the DB** (`select from topic`; the DB is the source of truth post-2.3, and SPEC §6.4 says "each active topic's seed queries").
2. Per source **in parallel, sequential within each source** (rate limits are per-host — phase0's proven shape): for each topic, for each of that topic's `seedQueries[source]` (cells can hold several queries since 2.3 — split the quota evenly across the cell's queries, `Math.ceil(quota / queries.length)` each), `adapter.search(query, { limit })` → `toItem` each → `Claim { topicId, rank: index-within-that-query's-results, item }`. Wrap **both** per-source and per-topic in try/catch: one source down ≠ job dead; a failed search is logged as ERR, never as zero (the 0.2 lesson).
3. `resolveCollisions(allClaims)`.
4. Skip-existing: one `select({ source, sourceId }).from(item)` → a `Set` of `source:sourceId` keys; winners already present are counted `alreadyInDb` and dropped (this is what makes run 2 a no-op and why curation is never re-paid).
5. `structuralFloor(newItems)` — batch-relative dup-title counting is computed over this run's new items (comment the limitation: it can't see titles already in the DB; acceptable because dup-title pathology is within-harvest catalog runs).
6. `curateItems(kept)` (or neutral 5s under `--skip-llm`). Requires `OPENROUTER_API_KEY` unless `--skip-llm`; fail fast with a clear message.
7. `upsertItem` each winner with its `topicId` + scores.
8. **Structured summary table** (the BUILD_PLAN/SPEC requirement — collisions must be visible, per source): searched / offered / normalized / **collisions** / alreadyInDb / floored (per rule) / curated / inserted / errors, plus a per-topic kept column like phase0's `summarize()`, and elapsed time + tokens billed.

**Steps:**

- [ ] **Step 1: `ingest-plan.test.ts` (failing)** — the order-independence property is the whole point, test it explicitly: (a) two claims for the same `source:sourceId` from topics A (rank 3) and B (rank 1) → B wins, `collidedWith: ["A"...ids]`, collision count 1; (b) equal ranks → alphabetically-smaller topic id wins; (c) **same claims in reversed input order → identical winners** (the property phase0 violated); (d) no collision → passthrough with count 0; (e) three-way collision counts correctly.
- [ ] **Step 2: Implement `ingest-plan.ts` → PASS.**
- [ ] **Step 3: Implement `upsertItem`** — Drizzle `insert(item).values(values).onConflictDoUpdate({ target: [item.source, item.sourceId], set: { title, summary, body, imageUrl, sourceUrl, attribution, license, tags, fetchedAt: new Date() } }).returning()`. Extend `items.integration.test.ts`: insert → same key with changed title + changed curationScore → title updated, **score unchanged**, same row id.
- [ ] **Step 4: Write `scripts/ingest.ts`** per the pipeline above, teaching-commented (this file is the ingestion story end-to-end; write it like `phase0/harvest.ts` reads).
- [ ] **Step 5: Small live run** — `docker compose up -d && bun run db:migrate && bun run db:seed`, then `bun run ingest --quota 10 --skip-llm --dry-run` (structure sanity, no cost, no writes), then `bun run ingest --quota 10` (~800 items max, curation ≈ $0.15). Check the summary table: all five sources, 16 topics, collision counts visible and plausible.
- [ ] **Step 6: The idempotency gate (3.4's "Done =" line)** — run `bun run ingest --quota 10` again immediately: **0 inserted, everything alreadyInDb, 0 curation tokens billed.** Verify in psql: `select source, count(*) from item group by 1;` shows all five sources; `select topic_id, count(*) from item group by 1 order by 2;` shows no starved topics (the collision rule working — compare astronomy's count to phase0's pathological 4).
- [ ] **Step 7: Full populate** — `bun run ingest` (quota 150; expect ~1–1.5 h dominated by the Met's 400 ms politeness delay, and roughly ~$1–2 of curation for a phase0-scale corpus; `--source met` etc. let you run sources separately if the session needs to split it).
- [ ] **Step 8: Docs** — SPEC §15: move the multi-topic-collision question to **settled** (highest-search-rank wins, tie → alphabetical topic id; note the astronomy/AIC re-check result from Step 6). SPEC §6.4: confirm wording matches (no "embed" step). BUILD_PLAN: check 3.4 + fix its stale "embed" wording + note Phase 3 complete. Walkthrough 3.4, log.md (Phase 3 closed).
- [ ] **Step 9: Gate + PR** — `bun run check`, PR "Phase 3.4: ingestion job — Phase 3 complete", CI, merge.

---

## Verification (phase-level)

- Every task: `bun run check` green locally + CI green on the PR before merge.
- Unit surface: 5 × `toItem` fixture suites, normalize helpers, servability/license predicates, floor rules, curator parsing, `drawWeight`, collision resolution (incl. the order-independence property).
- Integration (compose DB, self-skipping): `drawFromTopic` floor/exclude/weighting, `upsertItem` score-preserving conflict behavior.
- Live: `bun run probe <source> <topic>` per adapter at land time; the 40-item curator smoke; and the two-consecutive-runs idempotency gate with the psql topic-distribution check.
- End state: dev DB populated across all five sources × 16 topics; no starved topics; Phase 4.1 (feed algorithm) is unblocked with a real corpus to tune against.

## Self-review notes (done at planning time)

- Spec coverage: BUILD_PLAN 3.1–3.4 all mapped (3.2b added for the five-source decision); SPEC §6.1/§6.2/§6.4/§15 updates assigned to tasks; §13's `ingest` script wired in Task 5.
- Type-consistency spine: `NormalizedItem` (T1) → consumed by every adapter (T2/T3), `structuralFloor`/`curateItems` (T4), `Claim`/`resolveCollisions`/`upsertItem` (T5). `CuratedItem` adds exactly the two fields `item`'s insert needs beyond `topicId`.
- Deliberate deviations from phase0 to not cargo-cult: no HTTP disk cache (DB skip-existing replaces it); curation cache moves to `.cache/curation/` at repo root; quota split across multi-query cells (2.3 introduced them; phase0 had one query per cell).
