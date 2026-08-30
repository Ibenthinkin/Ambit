# Ambit — Technical Specification

> Build-ready spec for Ambit. Distilled from the shaped Idea-Forge idea + project plan via the Idea Forge "Spec" stage. This is the foundation a coding agent uses to scaffold and build v1. Living doc — update as decisions land.

## 1. Overview

**Ambit** is a calm, non-social **anti-doomscroll** PWA: an endless feed of genuinely interesting images and short text — pulled from public-domain knowledge, art, and literature APIs — loosely tuned to the user's interests, for staring at while you wait.

**Problem.** The "something to do while waiting" reflex defaults to social media, engineered to agitate. Ambit keeps the same idle-scroll ergonomics but swaps the payload for a calm, enriching one. The magic is **serendipity**: deliberate cross-domain jumps ("you liked internal-combustion engines → here are 1960s Grand Prix photos").

**Scale & posture.** Personal / friends. **Invite-only. No monetization. No social features.**

### Core features

- Email + password accounts; sign-up invite-gated.
- Onboarding: a grid of ~20–40 broad topic chips.
- Infinite vertical feed mixing image + article cards.
  - Images: tap → fullscreen; swipe left/right through a fullscreen gallery.
  - Articles: headline + lede; double-tap / long-press expands full text inline.
- Save + share on any item.
- **Tiered topic-drift feed over a curated pool** (§9): topics connected by an offline embedding-derived adjacency graph decide *where* to look; curated-weighted random decides *what* to show. Validated in Phase 0.5.

### Tech

- **Next.js (App Router)** + **Bun** (runtime + package manager), **TypeScript**, configured as a **PWA**.
- **tRPC** for the type-safe API, **TanStack Query** under the hood.
- **TailwindCSS** for styling.
- **Drizzle ORM** over **Postgres** (no pgvector — the Phase 0.4 pivot removed per-item vectors from the serving path; the topic graph is a checked-in JSON artifact).
- **Better Auth** — email + password, invite-gated sign-up, database sessions, Drizzle adapter.
- **Vitest** (unit) + **Playwright** (e2e).

## 2. Architecture

### 2.1 High-level

- **Frontend & API:** one Next.js app (App Router). Server components for data fetching/SSR; client components for the interactive feed and galleries; **tRPC** route handler at `app/api/trpc/[trpc]/route.ts` for the typed API.
- **Ingestion (background):** scheduled jobs fetch from source APIs, normalize to the common item schema, apply the **quality floor + LLM curation pass** (§6.2), and upsert into Postgres. Runs as a Bun script (cron-triggered), decoupled from request handling.
- **Datastore:** plain Postgres — the curated item pool. No vector index: the only embedding artifact the app reads is the checked-in topic-adjacency graph (§9), a static JSON lookup.
- **Runtime:** Bun for dev and production.

### 2.2 Application layers

**Presentation** — Next.js pages/components, Tailwind, the feed + fullscreen gallery + expandable-article components.

**API** — tRPC routers (`feed`, `items`, `topics`, `saves`, `auth`-adjacent). Type-safe end to end.

**Domain / services** —
- `services/sources/*` — one adapter per source API → common `Item` shape.
- `services/curator.ts` — the ingest-time taste layer: quality floor + LLM curation score (§6.2).
- `services/feed.ts` — the tiered topic-drift composition (§9).

**Data access** — Drizzle schema + repository helpers (`server/db/*`). All user-scoped queries filter by `userId`.

## 3. Functional requirements

### 3.1 Authentication
- **Email + password** via **Better Auth** (`emailAndPassword: { enabled: true }`): built-in sign-up, sign-in, password hashing (scrypt), and password reset.
- **Invite-gated sign-up:** account creation is rejected unless the email has a valid `invite` row — enforced server-side in Better Auth's `databaseHooks.user.create.before` hook (throw `APIError` for uninvited emails); accepting an invite flips its status.
- **Password reset** emails via the transactional mail provider (Mailpit in dev, Resend in prod) through `emailAndPassword.sendResetPassword`. Email *verification* is skipped — the invite list (addresses Ben issued invites to) is the trust anchor, so verification would be redundant friction. `revokeSessionsOnPasswordReset: true` (Phase 5.2) kills any other live sessions the moment a reset completes.
- **Sessions are database-backed** (Better Auth default; `session` table) — revocable server-side, read on the server via `auth.api.getSession({ headers })`.
- Auth state available on server (SSR / protected routes) and client (UI, via `better-auth/react` client).
- Anonymous users: can view a shared item URL (read-only); cannot access the feed, saves, or onboarding.

### 3.2 Onboarding
- First sign-in → topic-chip grid. **v1 = the 16 graph-validated topics** (settled 07-17-26 — DRIFT/JUMP need a topic-graph row per topic, and the validated graph covers 16; the grid grows toward the design handoff's 32 chips as new topics are harvested and the graph recomputed, Phase 6).
- User taps any number of chips; selections persist to `user_topic`.
- Each chip maps to **seed queries per source** (config, not freeform). No sub-taxonomy in v1.
- After selection → land in a feed seeded from picked topics.

### 3.3 Feed
- Infinite vertical scroll of mixed image/article cards, paginated (cursor-based).
- Composition: weighted-random across (a) picked topics and (b) related topics inferred from saved items — always retaining some randomness. (The inference mechanism is §9's save→weight loop, shipped in Phase 6.1.)
- Image card: tap → fullscreen; swipe left/right pages through a fullscreen gallery of the feed's images.
- Article card: headline + lede/synopsis; double-tap / long-press expands full text inline.

### 3.4 Save & share
- Save toggles an item into the user's saved set (synced).
- Share invokes the native share sheet with the item's public URL.
- Saves feed back into related-topic weighting (§9 — a new save bumps the topic's weight; shipped in Phase 6.1).

### 3.5 Sharing / public item
- Any item is viewable read-only at `/i/{itemId}` (public-domain content; no auth, no owner info).

## 4. Non-functional requirements

- **Performance** — feed page loads under ~300 ms for typical sizes; pagination prefetches the next page; images lazy-loaded.
- **Security** — all user data scoped to `userId`; invite-gated sign-up; no private data in any public response.
- **Reliability** — graceful degradation when a source API is down (skip the source, keep serving cached items); ingestion is idempotent (upsert by `source` + `sourceId`).
- **Maintainability** — type-safe end to end (tRPC + Drizzle inferred types); each source adapter isolated and independently testable.
- **Cost** — target ~$0–15/mo (free public-domain APIs; self-hosted plain Postgres; curation ≈ $1 per full corpus re-score via a cheap vision model).
- **UX** — calm, minimal, distraction-free; mobile-first; installable PWA.

## 5. Data model & database schema (Postgres, via Drizzle)

> Auth tables (`user`, `session`, `account`, `verification`) follow the **Better Auth** core schema and are omitted here — generate the Drizzle definitions with the Better Auth CLI (`npx auth@latest generate`), then migrate via drizzle-kit as usual. The hashed password lives on `account`. Below are the app tables.

### 5.1 `item`
The normalized, **curated** feed unit. Items that fail the ingest quality floor (§6.2) are never inserted.

```sql
CREATE TABLE item (
  id             TEXT PRIMARY KEY,           -- nanoid
  source         TEXT NOT NULL,              -- 'wikipedia' | 'met' | 'aic' | 'cma' | 'wellcome' | 'archive' | ...
  source_id      TEXT NOT NULL,              -- id within that source
  type           TEXT NOT NULL,              -- 'image' | 'article'
  title          TEXT NOT NULL,
  summary        TEXT,                       -- lede / synopsis
  body           TEXT,                       -- full article text (nullable; articles only)
  image_url      TEXT,                       -- nullable; images / illustrated articles
  source_url     TEXT NOT NULL,              -- canonical link back to source
  attribution    TEXT,                       -- required by some sources
  license        TEXT,
  tags           TEXT[] NOT NULL DEFAULT '{}',-- native source tags (secondary signal)
  topic_id       TEXT NOT NULL REFERENCES topic(id), -- which topic seed surfaced it
  curation_score REAL NOT NULL,              -- 1-10 from the ingest LLM curator (§6.2)
  aesthetic_tags TEXT[] NOT NULL DEFAULT '{}',-- curator's look/appeal keywords
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
```

| Field | Notes |
|---|---|
| `curation_score` | the taste layer (Phase 0.5): within-topic sampling weight, and a floor below which items never serve. Set at ingest by the LLM curator; re-scoreable corpus-wide for ~$1 when the curator prompt version bumps. |
| `aesthetic_tags` | curator-written look/appeal keywords ("botanical plate", "hand-lettered"); overlap with a user's taste keywords boosts an item's draw weight (§9). |
| `topic_id` | the topic whose seed queries surfaced the item — the feed's unit of drift. |
| `tags` | native categories (Wikipedia categories, Met department/medium/culture, …); secondary signal only. |
| `attribution` | for a **blog** item (planned, §6.1) this is the blog's name, rendered as the `from: <blog>` credit beside the title and linked to `source_url`. That credit line is **not blog-specific** — museum and Wikipedia items get it too (BUILD_PLAN 5.7). |
| `license` | always an honest, non-empty string. For blogs the constant is truthful rather than permissive — *"Rights retained by original authors — displayed with credit and link"*. Never a fair-use claim. |
| `body` | **Settled 08-25-26 (6.3): `body` is `null` for every blog item, always.** The blurb is `summary` (the blog's own excerpt). Blog items are `type: "image"`, so the reader view is unreachable for them by construction; `source-invariants.test.ts` asserts it — both halves: every registered walker's fixture normalizes that way, and no row in the DB says otherwise. Full article text is used at ingest only and never stored. |
| `(source, source_id)` | unique → ingestion upserts idempotently. |
| *(no `embedding` column)* | per-item vectors exist only in the **offline pipeline** (dedupe, quality checks, topic-graph recomputes); the serving DB never stores or queries vectors. This is the Phase 0.4 pivot. |

### 5.2 `topic`
```sql
CREATE TABLE topic (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,               -- chip label
  seed_queries JSONB NOT NULL               -- per-source query config
);
```

> The **topic adjacency graph** (each topic's row of neighbours ranked by similarity — §9) is *not* a table: it's a checked-in JSON artifact (`server/config/topic-graph.json`, generated offline by the Phase-0 tooling from mean-centered topic centroids, hand-editable, diffable in a PR). The feed reads it at startup.

### 5.3 `user_topic`
```sql
CREATE TABLE user_topic (
  user_id  TEXT NOT NULL REFERENCES "user"(id),  -- Better Auth's table is singular `user` (quoted: reserved word in Postgres)
  topic_id TEXT NOT NULL REFERENCES topic(id),
  weight   REAL NOT NULL DEFAULT 1.0,       -- adjusted as the feed learns
  PRIMARY KEY (user_id, topic_id)
);
```

### 5.4 `saved_item`
```sql
CREATE TABLE saved_item (
  user_id       TEXT NOT NULL REFERENCES "user"(id),
  item_id       TEXT NOT NULL REFERENCES item(id),
  collection_id TEXT REFERENCES collection(id) ON DELETE SET NULL, -- nullable: see below
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
```
**One collection per item, by construction** (Phase 5.5): the primary key is `(user_id, item_id)`, so there is exactly one row per saved item and therefore exactly one collection. That's the design's own model — the prototypes key collections as `{ [itemId]: collectionName }`, render a single accent dot, and label exactly one row "Already saved here" — so picking a different collection *moves* the item (an `UPDATE`) rather than adding a second membership.

`collection_id` is **nullable**, meaning "saved but uncollected": such a row is counted by the UI's "Everything kept" total but appears under no named collection. `ON DELETE SET NULL` rather than `CASCADE` because deleting a collection must never silently delete the user's saves.

### 5.4c `collection`
```sql
CREATE TABLE collection (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
```
A user's named buckets for saved items, backing the save-to-collection sheet (Phase 5.5). Three defaults — **Articles, Art, Photos** — are seeded **lazily**, on the first read in `db/collections.ts`, rather than at sign-up: nothing before 5.5 needed them, so seeding on read gets existing users theirs without a backfill migration.

The `(user_id, name)` unique constraint is load-bearing for that seeding, not just hygiene: two concurrent first-reads both attempt the insert, and the constraint is what turns the loser's `ON CONFLICT DO NOTHING` into a no-op instead of a duplicate row. The seeded rows get **staggered `created_at` values** (offset by index, written app-side) because Postgres' `now()` is transaction start time and would otherwise leave `ORDER BY created_at` with a three-way tie and no stable sheet order.

Collection *creation* is a Phase 5.10 concern (it lives on the Profile screen in the design), so there is deliberately no `createCollection` procedure yet.

### 5.4b `seen_item`
```sql
CREATE TABLE seen_item (
  user_id    TEXT NOT NULL REFERENCES "user"(id),
  item_id    TEXT NOT NULL REFERENCES item(id),
  served_at  TIMESTAMPTZ NOT NULL, -- set explicitly by the app, not DEFAULT now() — see below
  PRIMARY KEY (user_id, item_id)
);
```
Every item a user has ever been served, retained forever (no TTL/pruning) — the feed's "almost never repeating" promise (§9). `served_at` is when the reader was actually *handed* the item, set explicitly from the app clock rather than `DEFAULT now()`; as of Phase 5.7 the writer is the client's receipt ack (`feed.markSeen`), so it lands strictly *after* the cursor `anchor` of the page it belongs to — which is exactly what keeps a refetch of that cursor from excluding its own page (§7's cursor design note). No separate `user_id` index: the composite primary key's btree already serves the feed's only query shape ("what has this user seen").

### 5.5 `invite`
```sql
CREATE TABLE invite (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.6 Indexes
```sql
CREATE INDEX idx_item_type        ON item(type);
CREATE INDEX idx_item_source      ON item(source);
CREATE INDEX idx_item_topic_score ON item(topic_id, curation_score); -- the feed's draw path
CREATE INDEX idx_item_tags_gin    ON item USING GIN (tags);
CREATE INDEX idx_saved_item_user  ON saved_item(user_id);
CREATE INDEX idx_collection_user  ON collection(user_id);
```

## 6. Backend — ingestion, curation, repositories

### 6.1 Source adapters — `server/services/sources/`
One module per source. Each exports a uniform interface:

```typescript
export interface SourceAdapter {
  source: SourceId;                                 // 'wikipedia' | 'met' | ...
  search(query: string, opts?: FetchOpts): Promise<RawSourceResult[]>;
  toItem(raw: RawSourceResult): NormalizedItem;     // → common schema (no embedding yet)
}
```

- Implement in phases (Wikipedia + Met + one more first; remaining in Phase 4). **Committed v1 set now includes Cleveland Museum of Art and Wellcome Collection** — both passed the source-candidates trial in Phase 0.5 (CMA: CC0, no key, prose descriptions; Wellcome: open-license filter + per-item license check, history-of-science texture). Adapter quirks for all five are recorded in `phase0/NOTES.md`. **Revised at build time (Phase 3.1):** all five land together in Phase 3, not staggered — `topics.ts`'s per-source seed queries already assumed five, and CMA/Wellcome are trial-passed with quirks recorded.
- **Wikipedia lead images carry a per-file license the search/extract APIs never expose** (article text itself is CC BY-SA 4.0, uniformly). Resolved at ingest via a batched `prop=imageinfo&iiprop=extmetadata` call (≤10 `File:` titles/request — the API's docs call `extmetadata` expensive and ask for small batches), reading `extmetadata.LicenseShortName`. An image is only served when that resolves to a free license (public domain, CC0, CC BY, CC BY-SA, "no restrictions"); otherwise the card renders text-only — Wikipedia's `ArticleCard` is designed for that (30% of articles already lack a lead image, per Phase 0.2). Gotcha found live: MediaWiki normalizes `File:` title underscores to spaces in the `imageinfo` response, so the adapter's lookup key must be normalized the same way or every license silently resolves to "unresolved."
- Respect each source's rate limits + attribution/licensing. Responses are cached by upserting into `item`.
- **A source can be *suspended* without being removed** — `server/config/suspended-sources.ts`. Ingestion skips it and `getTopicPools` refuses to draw its existing rows, so a source that has gone bad stops affecting the feed retroactively rather than only from the next ingest onward (half-suspending is worse than not suspending: undrawable rows go on winning slots in the draw). Nothing is deleted; lifting the flag needs no re-ingest. **Currently suspended: `aic`** (08-20-26) — `www.artic.edu` is behind Cloudflare bot management that 403s any image request with a `localhost` referer, so 17.5% of the corpus fails on the dev machine, plus a second unexplained failure on-device (`docs/HANDOFF_aic-images.md`). Expected to lift with the Phase 5.7 image proxy, which gives every image one origin.
- **Sixth adapter: `archive` (Phase A.5), and the first that is not a public API.** Its source is Ben's own personal-archive service (the separate `ambit-archive` repo), which turns bare personal image files into described, tagged, embedded records and serves them over `GET /search?q=&limit=` behind a static `x-archive-key` header. Two env vars, both **optional** so a clone without the archive still boots and ingests the other sources: `ARCHIVE_URL`, `ARCHIVE_API_KEY` (`sources/archive.ts` reads them at `search()` time and throws a clear error when unset — never returns `[]`, because a missing config that reads as "zero results" is exactly what ingest's error accounting exists to catch). Three things make it the thinnest adapter in the repo, because the archive was built to meet this contract rather than the other way round: **ranked order is the wire contract** (the array index IS the search rank — the archive ranks by cosine similarity over its own embeddings, so `limit` is always filled and an archive cell can never come back empty), **there is no licensing re-check** (`license` is always the honest literal `"unknown"` — recognizing an artwork says nothing about rights on a screenshot of a reproduction), and **no field synthesis** (summaries are guaranteed ≥60 chars at the archive's own enrichment prompt, so the structural floor's `thin-summary` rule should never fire for this source; if it does, that is contract drift). `attribution` is an adapter-supplied constant, `"Personal archive"` — the archive returns no such field and every item shares one honest credit. `sourceUrl` points at the image itself: archive items have no landing page. Content is personal and unfiltered, so per-reader gating is the planned content-pools feature's job, not this adapter's; the service itself is deliberately user-blind (one shared key, server to server).
- **Corpus-walk sources and designated blogs (Phase 6.3, built 08-27-26; design `docs/PHASE6_DESIGN_6.3.md`, evidence `docs/PHASE6_WALKTHROUGH_6.3.md`).** A blog has no `search(q)`, so it is not a `SourceAdapter` — and that interface is a cross-service agreement ambit-archive implemented verbatim, so it was not changed. Instead a **sibling contract**, `CorpusWalkAdapter`, in the same `types.ts`: `{ source; walk(cursor?, opts?) → Promise<{ raw: Raw[]; next?: string }>; toItem(raw) → NormalizedItem }`. The cursor is opaque and adapter-defined; a 401/403 fails the walk immediately (`fetchJson`'s `noRetryOn`) — a blog that refuses us is a blog we stop asking. `WALK_SOURCES` in `config/topics.ts` is the walk half of `SourceId`; `config/blogs.ts` is the **designated-blog registry** (label, license string, robots policy) and `isBlogSource()`. Two registries, `adapters` and `walkers`, with complementary key types, so a source in both or neither is a compile error. **Ingest runs one lane per shape** (§6.4). Blog items are **link cards** (BUILD_PLAN 6.3's presentation contract): `type: "image"`, the post's featured image as hero, the blog's own excerpt as `summary`, `body` null always (§5.1), `attribution` = the blog, license *"Rights retained by original authors — displayed with credit and link"*, and on the item page and gallery sheet a `LinkOutRow` — *Read the post on <blog>* — under the blurb. **No fair-use claim**; removal on request is `--prune` (§6.4).
  - **`doorofperception` — Door of Perception**, the first walk source. WordPress with a live REST API (`/wp-json/wp/v2/posts?_embed&per_page=100`): four requests walk all 390 posts, slug as `sourceId`, `featured_media` as hero (a purpose-made ~800 px crop — tile- and hero-grade, not gallery-grade), `excerpt.rendered` (a written paragraph, not a truncation) decoded to text as the blurb. `robots.txt` is fetched and checked on every run; a `Disallow: /` aborts the walk and says so. **Topic assignment is the curator's classify mode**: the same call that scores the item also files it under one of the sixteen topics *or none*, and a null is dropped and counted rather than force-fit — a psychedelia post filed under `botany` would teach the drift graph something false. **Measured over all 390 before any write (08-27-26): 389 normalized · 3 floored (thin summary) · 318 classified (82%) · 68 honestly refused (18%)** — mythology 109, portraiture 59, botany 47, architecture 30, astronomy 17, machines 13, zoology 9, the-ocean 8, ancient-history 7, geology/music/typography 5 each, textiles 2, cartography 1, poetry 1, ceramics 0. Scores 8.64 avg, 92% ≥ 8 (the archive's doorofperception scrape, which D2 retires: 8.56 / 94%). The 68-post null bucket is the input to a later topic-expansion job, not a defect. **Scrape etiquette** (design §8): robots checked before designation and re-checked every run; honest `USER_AGENT`; ≥500 ms sequential per host; the ordinary ingest cron, no separate crawl; `--prune` for removed posts. **50watts.com was cut 08-25-26** — `User-agent: * / Disallow: /`, REST 403 regardless of UA — the artvee rule at the wire. Deliberately out of scope: a cache in front of `/api/img` (7.3), full-resolution heroes from the archive's `index.csv`, expanding the topic set, a suspended-items list.
  - *Superseded 08-27-26 — the original 08-20-26 strategy note, kept for the record:* Ambit's content is to come primarily from **designated blogs**, which already carry the tags, descriptions and articles that image sources make you manufacture. It is an **in-repo adapter family** — a shared scraper core plus per-blog config, one `SourceId` per blog — and deliberately **not** a third cross-service integration pattern; the ecosystem's two blessed patterns govern seams *between* services, and this stays inside Ambit. Its presentation contract is **excerpt + link-out**: image or short excerpt, Ambit's own description, a 1–2 sentence blurb about the article, a visible `from: <blog>` credit and a prominent link to the original. **Ambit hosts no reformatted articles** and makes **no fair-use claim**; full text is used at ingest only. Blogs do not `search(q)`, so the adapter interface above does not fit as written — that and six other questions are open. See `docs/BUILD_PLAN.md` step 6.3 and, for the governing decision, Ambit-Admin's `Ecosystem Architecture.md` (08-20-26). Designated-blog list: [`docs/source-candidates.md`](docs/source-candidates.md).
- **Phase 6.2 promoted three more, the first round of the trial loop to run** (08-21-26; evidence and Ben's verdicts in `docs/PHASE6_WALKTHROUGH_6.2.md`). Four were trialed, three kept, one parked. This is what "promote one into this list only after it passes the trial" looks like in practice — the entries below record the quirks *found*, not the ones expected:
  - **`smithsonian` — Smithsonian Open Access** (api.si.edu). Keyed: `SMITHSONIAN_API_KEY`, a free api.data.gov key, **optional** for the same reason the archive's pair is (ingest-only; a clone without one must still boot and ingest everything else), read at `search()` time. 1,000 requests/hr on a real key versus DEMO_KEY's 10. Licensing is the friendliest of any source here — `media_usage:"CC0"` is a *query* filter, and 400 of 400 sampled rows carried `usage.access: "CC0"`, so unlike the Met there is no per-item second call — **but the filter is not sufficient alone**: 2 of those 400 simultaneously carried `indexedStructured.online_media_rights: ["Copyright protected/restricted"]`, so both signals are re-checked and contradictions dropped. The rule deliberately spares the far more common *permissive* value in that field, "No Known Copyright Restrictions". `sourceId` is `record_ID` (unit code + accession number), never the row's own timestamp-shaped `id`, which a re-index would be free to change — taking the corpus with it. `imageUrl` gets `&max=1200`: the IDS delivery service defaults to the full-resolution JPEG (837KB versus 89KB capped). **The quirk to plan around is density, not rights** — the natural-history catalogues dominate by row count, and 31% of offered items are dropped by the structural floor before any LLM call (dup-title mostly). Seed vocabulary carries the weight there: `specimen` returns 5,029,697 rows and is never used; `textile` loses most of its yield to objects literally titled "Textile", so the cell asks for `embroidery` and `lace` too. 14 of 16 topics; poetry is the honest omission.
  - **`loc` — Library of Congress**, scoped to cleared collections. No auth; `?fo=json` on any `/pictures/search/` URL returns clean JSON and every result carries a ready full-size image on `tile.loc.gov`. **The per-result `rights` field is empty on every row**, and the Library holds a great deal of in-copyright material, so the adapter never searches all of loc.gov: `CLEARED_COLLECTIONS` lists collections the Library has blanket-cleared, each with its rights statement recorded **verbatim** from the API's own `rights_information` — for the Margolies archive, "No known restrictions on publication", deliberately *not* upgraded to "public domain", which is a stronger claim than the Library makes. Scoping is `q=<token> <query>` plus a re-check of each result's own `collection[]` membership. **The growth path is the point of the entry**: one verified rights statement at a time, a new `CLEARED_COLLECTIONS` row per collection, no adapter change. First and so far only entry: `mrg`, the John Margolies Roadside America photograph archive (11,708 images). Best curation scores in the corpus at sample scale (8.52 avg, every item ≥8; 7.98 across the full 376). **`tile.loc.gov` rate-limits by IP with no `Retry-After` and no published budget** — a 334-image ingest tripped a sustained 429 that outlasted the run. *Solved in 7.3 (08-28-26): the image proxy caches to disk, so each image is fetched once ever, and `bun run img:warm --source loc --rate 1` filled 372 of them with no 429 at all — the 6.2 failure was the burst, not the budget. See **Image delivery** in §8.*
  - **`nasa-images` — NASA Image & Video Library** (images-api.nasa.gov). No auth. Chosen over APOD, which earlier drafts of BUILD_PLAN 6.2 named: the whole media catalogue rather than one keyed image a day. **The licensing posture is the weakest of the three and is stated rather than filtered**: a 600-item survey found *no rights field of any kind* anywhere in the response, so there is nothing to filter on and nothing to re-check. `license` is the literal `"Public domain (NASA)"`, scoped by that word, and `attribution` reproduces NASA's own credit line verbatim (`secondary_creator` on 172/600, `photographer` on 291, originating center otherwise) rather than flattening every item to the agency name; a credit that doesn't already say NASA gets prefixed. Exactly 2 of 600 credited a non-NASA party. No image-URL rewrite: every item publishes its renditions as explicit `links[]` entries with widths, so the adapter picks down a ladder (`~medium` → `~large` → `~small` → `~thumb` → `~orig`) rather than guessing at a URL shape. Six topics.
  - **`poetrydb` — parked, not cut.** Its adapter and tests stay in the repo and its id stays in `TRIAL_SOURCES`; what it has is **no seed cells**, so ingest never reaches it (`seedQueries[sourceId] ?? []` skips an empty list). Two reasons, both recorded and both fixable: its summaries take the poem's first two lines and PoetryDB's `lines[]` includes epigraphs and dedications, so a feed card can lead with transliterated Greek; and the curator's rubric is written for images and cannot score a lyric poem — Pope and Seeger scored 4 against "visually striking… huh, I never knew that", which is the same structural reason Wikipedia averages 5.27. Un-parking it means giving it cells again and nothing else. Its API quirk is worth keeping even so: `GET /lines/<keyword>` **503s at any real result-set size** (nine keywords tested; only a single-poem match returned 200), so the adapter discovers with `/lines/<kw>/title,author` and hydrates each poem individually — and a no-match is a JSON *object* at HTTP 200, not an empty array.
- **Post-MVP source backlog:** additional candidate content APIs to trial (with a per-source trial loop) live in [`docs/source-candidates.md`](docs/source-candidates.md). Promote one into this list only after it passes the trial.

### 6.2 Curation — `server/services/curator.ts` (the taste layer)
The Phase 0.5 finding: **the corpus is the product, not the ranking.** Curation happens once, at ingest, in two stages (prototyped in `phase0/curate.ts`):

1. **Structural quality floor** (free, heuristic): drop items sharing a normalized title with >2 others (interchangeable catalog stubs — 0.4 found 67 items titled just "textile"), bare single-noun titles on image items, summaries under a minimum-signal bar. Items that fail are never inserted.
2. **LLM curator** (cheap vision model via OpenRouter, `OPENROUTER_API_KEY`): a Tumblr-art-blog-curator persona scores each survivor 1–10 for visual/intellectual interest and writes 2–4 `aesthetic_tags`. **Image items are judged by the image itself** — download the image and pass base64; never hand a museum image URL to a third-party service (they bot-block server-side fetchers — bitten twice in Phase 0.5). ~1,450 tokens/item ≈ $1 per full corpus.
   - Responses cached per `item × model × PROMPT_VERSION`; bumping the prompt version surgically invalidates and re-scores.
   - The curator persona prompt is a product artifact: Ben's taste calibration (reference blogs, labeled examples) lands there.

**Embeddings still exist, but only offline.** `openai/text-embedding-3-small` × recipe A (title + summary), via OpenRouter — settled in Phase 0.4/0.5; `bge-m3` cut (≈10× slower through OpenRouter, no quality edge in the harness). Item vectors are pipeline artifacts used for: near-duplicate detection, distance-from-centroid quality checks, and **recomputing the topic graph** (mean-centered centroids — see §9) as the corpus grows. Nothing at request time touches them, and the DB never stores them. (The `dimensions` param is honored by OpenRouter if vector size ever matters; currently moot.)

**Parked experiment — visual embeddings** (Voyage `voyage-multimodal-3.5`, prototyped in `phase0/embed-images.ts`): image vectors capture *form/vibe* where text vectors capture *subject* — potentially a "more like this look" affordance on saves. Keep-or-cut verdict pending Ben's blind-harness browse (§15).

### 6.3 Repositories — `server/db/`
- `schema.ts` — Drizzle schema (the tables above + Better Auth core tables).
- `client.ts` — Drizzle client over Postgres (singleton).
- `items.ts` — `upsertItem`, `getItemById`, `drawFromTopic(topicId, { scoreFloor, excludeIds, limit })` (weighted-random by curation score — the feed's item pick).
- `feed.ts` — `getFeedPage(userId, cursor)` (composes §9).
- `saves.ts` — `unsaveItem`, `isItemSaved`, `getSavedItems(userId, { collectionId? })`, `getSavedCount(userId)`. Reads and the delete only: the *write* path is `collections.ts`'s `setItemCollection`, because every save in the redesign goes through the save-to-collection sheet and therefore always carries a collection.
- `collections.ts` — `getCollections(userId)` (with item counts; lazily seeds the three defaults), `getCollectionForUser(userId, collectionId)` (the ownership check), `setItemCollection(userId, itemId, collectionId)`.
- `topics.ts` — `listTopics`, `setUserTopics(userId, topicIds)`.

All user-scoped queries filter by `userId`.

### 6.4 Ingestion job — `scripts/ingest.ts`
- Bun script, cron-triggered. For each active topic's seed queries → run adapters → normalize → **quality floor → LLM curation score** → `upsertItem`.
- Idempotent via the `(source, source_id)` unique constraint; curation cache means re-runs only pay for genuinely new items.
- **Two lanes since 6.3.** Search sources run as above. Walk sources (`walkers`) are each walked to exhaustion by `processWalker` — sequential per host, a failed page stops the walk — and their items **bypass collision resolution** (nothing to collide on: no seed cells) and join the search winners at the already-in-DB skip; the floor is shared; the curator runs in **classify mode** for them (`{ classify: true }`, its own cache namespace) and a null topic is dropped and counted (`topicHistogram`), never force-fit. `--quota` on a walker is a total-item bound, and any bound makes the walk *incomplete*.
- **`--prune`** (remove-on-request): for a **complete** walk — reached the end, no failed *page*, no `--quota` — `planPrune` names this source's DB rows the walk did not see; ingest prints them every run and deletes them only under `--prune`, children first (`seen_item`, `saved_item`) in one transaction. Never the default. A single post the adapter rejects (no featured image) does not void completeness, or doorofperception could never be pruned.

## 7. API design (tRPC)

Single tRPC router mounted at `app/api/trpc/[trpc]/route.ts`. Protected procedures use a `protectedProcedure` that reads the session and throws `UNAUTHORIZED` if absent.

| Router.procedure | Type | Input | Output |
|---|---|---|---|
| `topics.list` | query | — | `Topic[]` |
| `topics.setMine` | mutation | `{ topicIds: string[] }` | `{ ok: true }` |
| `feed.page` | query | `{ cursor?: string, knobs?: Partial<FeedKnobs> }` | `{ cards: FeedCard[], nextCursor?: string }` |
| `feed.markSeen` | mutation | `{ itemIds: string[] }` (max 64) | `{ ok: true }` |
| `items.byId` | query | `{ id: string }` | `Item` (public; read-only) |
| `items.wanderNext` | query | `{ itemId: string }` | `{ id, title, reason }[]` (public; read-only) |
| `items.galleryRail` | query | `{ itemId: string, count?: number (1-16, default 8), exclude?: string[] (max 200), knobs?: Partial<GalleryKnobs> }` | `RailItem[]` (public; read-only, **no `seen_item` writes**) |
| `saves.collections` | query | — | `{ id, name, createdAt, itemCount }[]` |
| `saves.saveToCollection` | mutation | `{ itemId: string, collectionId: string }` | `{ collectionName: string }` |
| `saves.unsave` | mutation | `{ itemId: string }` | `{ saved: false }` |
| `saves.list` | query | `{ collectionId?: string }` | `Item[]` |
| `saves.count` | query | — | `number` |
| `saves.forItem` | query | `{ itemId: string }` | `{ saved: true, collectionId: string \| null } \| { saved: false, collectionId: null }` |

- **`saves.saveToCollection` is the API's only authorization-sensitive input** (Phase 5.5). Every other protected procedure is scoped by `ctx.user.id` alone, and the three public procedures take no user id at all — this is the one place a client supplies the id of a *user-owned* row. It verifies the collection belongs to the caller and throws `NOT_FOUND`, not `FORBIDDEN`, for both "no such collection" and "someone else's": a probe must not be able to tell a real collection id from a fake one. It also saves the item if it wasn't already, so there is no separate "save" procedure.
- `saves.toggle` **was removed in Phase 5.5** (it had become dead code — nothing outside its own tests ever called it, not even the throwaway `/feed` placeholder). A collection-less save is also semantically wrong now that every save routes through the save-to-collection sheet.
- `feed.page` is **cursor-based** (opaque cursor encodes pagination + the in-flight weighting seed).
- `feed.page` returns `cards`, not bare items (revised at Phase 4.1 build time — see below): each
  `FeedCard` is `{ item: Item, tier: "CORE" | "DRIFT" | "JUMP", topicId: string, driftPath?:
  string[], debug?: { why: string, curationScore: number } }`. `driftPath` (the topic ids a
  DRIFT/JUMP card's walk touched) is real product data, not gated — it's what SPEC §9's
  connective UI rows explain a card with. `debug` is gated by `FEED_DEBUG` (§9).
- `feed.page`'s `knobs` input (Phase 4.2) is zod-bounded to a sane range per field (mirroring
  `FeedKnobs`) but only actually forwarded to `getFeedPage`'s knob overrides when the server's
  `FEED_DEBUG` env var is on; off, a supplied `knobs` object is validated (still 400s on an
  out-of-range value) but then silently ignored, never applied. This keeps a debug-tooling client
  safe to point at a non-dev deployment without special-casing itself.
- **Three public (unauthenticated-allowed) procedures**, backing the app's two public routes
  `/i/{itemId}` and `/g/{itemId}`: `items.byId`; `items.wanderNext` (Phase 5.7), the item page's
  "where Ambit would wander next" teaser; and `items.galleryRail` (Phase 5.8), the immersive
  gallery's endless rail. All three are safe to expose by construction rather than by care: none
  takes a user id, they walk only the checked-in topic graph, and their return shapes are public
  item data, so there is no user data for them to leak. Everything else in the API is protected.
- **`items.galleryRail` (Phase 5.8)** draws the next stretch of the gallery's wander rail from an
  anchor item (§9's "gallery rail"). `RailItem` is `{ id, title, attribution, imageUrl, summary,
  source, sourceUrl, license, topicId, debug?: { via, topic } }` — `debug` gated by `FEED_DEBUG`,
  as `feed.page`'s is. `count` is capped at 16 and `exclude` at 200, which bounds the SQL `IN`-list
  a sequence with no end would otherwise grow without limit; past 200 the rail accepts a rare
  repeat far behind the reader. `knobs` follows `feed.page`'s contract exactly — zod-bounded,
  accepted always, applied only when `FEED_DEBUG` is on, never an error. **The procedure writes no
  `seen_item` rows, ever**: swiping the gallery is free, which is precisely why the rail is its own
  machinery rather than repeated `feed.page` draws (a rejected design that would have re-created
  the 08-20-26 corpus burn one swipe at a time).
- **`feed.markSeen` (Phase 5.7)** is the receipt half of the feed: `feed.page` composes a page and
  writes nothing, and the client acks the page it actually received. It moved off the server render
  because a render is not evidence of a reader — Next prefetches routes, and a back-pop re-running
  the dynamic `/feed` renders it again; each of those used to spend a page of corpus (measured at
  1,116 items in six minutes, 08-20-26). The 64-id input cap mirrors the cursor's `MAX_CURSOR_PREV`
  for the same reason: the array flows into an `IN`-list.

**Cursor design (Phase 4.1).** The cursor is a base64url-encoded JSON object, constant-size by
construction: `{ v: 1, seed: number, page: number, anchor: string, prev: string[] }`. `seed` +
`page` reseed the page's RNG deterministically (`mulberry32(hashSeed(\`${seed}:${page}\`))`), so
refetching the same cursor against unchanged pool state reproduces the exact same page — the
actual mechanism behind "stable pages on refetch." `anchor` is the ISO timestamp of the *previous*
page's composition — a page boundary; `prev` is that previous page's own item ids. Exclusion for
the *current* page's pool is `seen_item.served_at < anchor` (everything seen before this page
boundary) **union** `prev` (the previous page's own items) **union** whatever's already been drawn
so far this page (in-memory, within `composePage`'s own guard loop). Together these cover the
user's whole seen history without the cursor ever growing past one page's worth of ids, no matter
how long the scroll session runs.

*Anchor arithmetic after the Phase 5.7 receipt move.* Through 5.6 the server marked items seen
during the render, so a page's rows carried `served_at === anchor` exactly and the strict `<` was
what kept them out of their own query. Now the client acks on receipt, so those rows land at some
`T_ack > anchor`. Both paths still hold. **Composing page N+1:** page N is excluded by `prev`, and
pages ≤ N−1 were acked before page N was composed, so their `served_at < anchor(N+1)`.
**Refetching cursor N:** the filter still excludes only `served_at < anchor(N)`, and page N's own
acks are *later* than that anchor — so the page does not exclude itself and reproduces identically,
which is what the stability promise above actually rests on. The one new failure mode is a lost or
slow ack racing a fast scroll, which can repeat a page: cosmetic and self-limiting, against a
render-time cost measured in four figures.

**Rate limiting (Phase 4.2).** Every procedure — `publicProcedure` included, since the public
procedures are exactly the unauthenticated surface a scraper would hit hardest — passes through an in-memory
sliding-window limiter (`server/services/rate-limit.ts`'s `RateLimiter`, 120 requests/minute per
key) before reaching its resolver. The key is the session's user id when one exists, else the
caller's IP taken from the *last* `X-Forwarded-For` hop (the one segment a single trusted reverse
proxy — Coolify, §13 — actually appended; earlier hops are attacker-controlled and never trusted).
This is deliberately generous — abuse cover, not throttling of normal use — and single-instance by
construction (state lives in one process's memory), which matches Ambit's single-app-instance
deploy target; a multi-instance deploy would need this backed by shared state instead.

## 8. Frontend — routes & components

### 8.1 Routes (App Router)
- `/` — landing + sign-in / sign-up (email + password; forgot-password link). Rebuilt Phase 5.11 as the redesign's `Landing 2` (`docs/PHASE5_WALKTHROUGH_5.11.md`): a full-bleed slideshow of 8 committed public-domain works (`public/landing/`, listed with credits in `components/landing/landing-slides.ts`), shuffled per load and capped at 8 slides a run, which resolves after ~5s into a persistent `AuthSheet` — tap anywhere or the floating glyph ("Open sign-in") to skip. **The sheet is mounted from first paint and merely translated off-screen**, which is what `waitForHydration(page, "form")` and every auth e2e selector depend on. Inside it is 5.2's mode-toggle `AuthCard` (`src/components/landing/`), unchanged — not the prototype's magic-link form; see `docs/PHASE5_WALKTHROUGH_5.2.md`. 5.2's `LandingShell` (drifting orbs + 42px hero) and the `drift` keyframe were deleted here. `prefers-reduced-motion` collapses to one still slide with the sheet already up.
- `/reset-password` — where the password-reset email lands (`?token=...` on a valid link, `?error=INVALID_TOKEN` on an expired one). Ungated (src/proxy.ts's matcher deliberately excludes it — resetting a password implies being signed out). Shares `/`'s screen in **static mode** since 5.11 (one still slide, sheet already open, no glyph) — but **without the marketing hero**: a reader who followed a reset link already has an account and is mid-task.
- `/onboarding` — topic-chip grid (first sign-in; redirect here until topics chosen). Built Phase 5.3 — a sixteen-chip grid (not the design handoff's thirty-two; see §3.2), `OnboardingScreen` (`src/components/onboarding/`), persisted via `topics.setMine`; see `docs/PHASE5_WALKTHROUGH_5.3.md`.
- `/feed` — the infinite feed (auth-gated, default authenticated landing). Built Phase 5.6 (`docs/PHASE5_WALKTHROUGH_5.6.md`), replacing 5.2's placeholder: an **RSC shell** — the two guards (session → `/`; not-onboarded → `/onboarding`, carried forward verbatim from 5.3), a `prefetchInfinite` + `HydrateClient` handoff, and `FeedScreen`. The route stays **dynamic** by construction (it reads `headers()` and the feed is per-user). The prefetch input and the client `useInfiniteQuery` input must stay byte-identical (`{}` on both sides) or hydration silently misses and the client refetches — which costs a page of the user's corpus, since a received page is acked seen (`feed.markSeen`, Phase 5.7).
- `/saved` — saved items.
- `/i/[itemId]` — public read-only single item. Built Phase 5.7 (`docs/PHASE5_WALKTHROUGH_5.7.md`), replacing 5.6's interim stub. An **image variant** and a **reader variant** keyed on `item.type`; a `from: <source>` credit line under both titles, linking `item.sourceUrl` (every source, not just blogs — §6.1's rights posture, generalized); the article body typeset from the stored `body` column via `src/lib/reader-blocks.ts` (no runtime source fetch, no source HTML, so nothing to sanitize); a `?from=Name` param-driven "shared this with you" row (≤40 chars, text-only, never persisted, never looked up); the `items.wanderNext` teaser on both variants; and a join CTA for signed-out visitors only. The pill toolbar, both sheets, and the protected `saves.forItem` query render **only** when authed — a signed-out visitor triggers no user-scoped request at all, and `generateMetadata` is built purely from the item row so a shared link's preview carries nothing about the sharer. Leaving is `useLeaveToFeed`: **pop** history when the visit came from the feed, push `/feed?focus={id}` only for a cold-opened link — a pushed navigation re-runs the dynamic `/feed` and draws a fresh page of corpus. A horizontal swipe-back (`useSwipeBack`, 0.35× rubber-band follow, commits past 70px) shares that same exit. Ungated in `src/proxy.ts` by design.
- `/g/[itemId]` — the **immersive gallery**, the app's second public route. Built Phase 5.8 (`docs/PHASE5_WALKTHROUGH_5.8.md`): a full-bleed, images-only, zero-chrome-until-you-ask screen, entered by tapping the item page's hero (and, from 5.9, from Saved). **Images only** — a crafted `/g/{articleId}` 404s. Swiping walks the **wander rail** (§9): endless, bidirectional, and marking nothing seen. Chrome (title, maker, hint, pill) starts hidden and cycles on a 10s loop; a tap raises it, a tap while it's up opens the details sheet (tap-again, not double-tap — the prototype's own behaviour). Exits are `useExitGallery`: the close gesture **pops** to the entry surface when a `gallery-origin` marker says one is on the stack, else pushes `/i/{entryId}`; the pill's Feed button does `history.go(-2)` over `…feed → /i/x → /g/x` when *both* origin markers line up, else the documented `/feed?focus={id}` cold-open path. Sharing from here shares `/i/{currentId}`, never `/g/` — so the route carries minimal metadata and `robots: noindex`. The pill, both sheets, and the protected `saves.forItem` query render **only** when authed. Ungated in `src/proxy.ts` by design, like `/i/`.
- `/api/img/[itemId]` — the image proxy (Phase 5.7). Takes an **item id and looks the URL up in our own table; it never accepts a URL**, from a query param or anywhere else — that is the SSRF/open-proxy boundary. It fetches server-side with Ambit's UA and **no `Referer`** — which removes the variable behind the Art Institute of Chicago's `localhost`-referer block (`docs/HANDOFF_aic-images.md` §2.2), though AIC turned out to have escalated to a host-wide Cloudflare *interactive challenge* that no server-side fetch can pass, so that source stays suspended (ibid. §8). Successes stream through with `Cache-Control: public, max-age=31536000, immutable`; every failure path is `no-store`. Its rate limiter is a **separate, generous instance** (600/min per IP) rather than the shared tRPC one — a single feed page loads ~24 images and would otherwise starve the API. `data:` image URLs bypass it client-side. Resizing / IIIF sizing / a CDN cache layer are deliberately deferred to 7.3.
- `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...all]/route.ts` (Better Auth catch-all via `toNextJsHandler`).

### 8.1a Image delivery (Phase 7.3, settled 08-28-26)

**Every item image the app renders goes through `/api/img/[itemId]`, and every source image is
fetched from upstream exactly once, ever.** The gate BUILD_PLAN carried for two phases — hotlink vs
`next/image` vs proxy-with-cache — closed on proxy-with-cache (decision D1), on the evidence of two
different museum behaviours: AIC's Cloudflare rules 403 anything sending a `localhost` referer
(a *referer* problem, which a bare proxy fixes), and `tile.loc.gov` rate-limits **by IP with no
published budget** (a *budget* problem, which only a cache fixes — a bare proxy would concentrate
every reader's requests on one address and make it worse). `next/image` was rejected because each
width/quality variant is its own upstream fetch through the proxy: two or three museum hits for one
image on one screen.

- **One variant per item** (D2): ≤1600 px on the longest edge, WebP quality 82, EXIF-rotated, never
  enlarged. 1600 covers a 3× phone at the hero's rendered width and the gallery's full-bleed. A
  second (thumbnail) variant is a future knob, not a 7.3 deliverable.
- **Disk, not Postgres, not memory** (D3): one file per item at `${IMAGE_CACHE_DIR}/${itemId}.webp`,
  default `.cache/img`. **No eviction** — measured at 62 KB a file, the whole 11,366-item corpus
  projects to ~0.67 GB. **§13: 8.1 mounts that directory as a persistent volume** so a deploy
  doesn't send the corpus back to the museums.
- **Failures are never cached** (D4): a 4xx/5xx, a timeout, or bytes `sharp` refuses answers 502
  `no-store` and writes nothing — a failure that stuck for a year would be indistinguishable from a
  dead image. The in-flight entry is cleared on rejection too, so a bad minute doesn't poison an item.
- **Concurrent misses share one fill** (D5): a feed page requests ~24 images at once and the gallery
  re-requests the hero; an in-process `Map<itemId, Promise>` means one upstream fetch, not three.
- **The security boundary is still the item id.** The URL comes only from our own table; nothing
  accepts a caller-supplied URL, path or size (§11).
- **`X-Ambit-Cache: hit|fill`** on every 200, so "the cache works" is observable with `curl -I`.
- **`bun run img:warm`** spends the one-time fetches deliberately, rate-limited per host, skipping
  what is already cached and abandoning a host after three consecutive 429s. Suspended sources are
  skipped. Share/download filenames follow the served type (D8, `lib/image-filename.ts`).

Implementation: `src/server/services/image-cache.ts` (`getOrFill` / `fillCache` / `readCached`), a
thin `src/app/api/img/[itemId]/route.ts`, `scripts/warm-images.ts`, `IMAGE_CACHE_DIR` in `src/env.js`.

### 8.2 Components
- `components/feed/` (Phase 5.6) — the built names, which diverge from the sketch below. `feed-screen.tsx` is the infinite scroll (`useInfiniteQuery` on `feed.page`, `IntersectionObserver` sentinel rooted on the **viewport**); `masonry.ts` holds the layout decisions as pure functions (`buildTiles` inserts at most one serendipity tile per fetched page, on its first `JUMP` with `driftPath.length >= 2`; `packColumns` greedily fills the shorter of two columns, which — unlike CSS `columns` — can never reorder a tile the reader is already looking at); `image-tile.tsx` / `article-card.tsx` / `because-tile.tsx` are the three tiles; `use-feed-scroll.ts` is the `?focus=` return-scroll and session scroll restore.
- `FullscreenGallery.tsx` — fullscreen image view with left/right swipe paging.
- ~~`ArticleExpand.tsx`~~ — **dropped at the 5.4 re-baseline.** The redesign has no in-feed expand: an article card is a doorway (eyebrow + headline + clamped lede) and the body lives on the item page. Long-press on a feed tile opens the item sheet instead (`sheets/item-sheet.tsx`, 5.6).
- `SaveButton.tsx`, `ShareButton.tsx` — item actions (share → Web Share API).
- `OnboardingScreen.tsx` — onboarding selector (chip grid + sticky CTA + `topics.setMine` submit; Phase 5.3). Named to match the built component — the handoff's own `TopicChips` name never landed, since the chip grid, header block, and sticky CTA all live in one client component rather than a split-out chips-only piece.
- `components/install/` (Phase 5.11) — the built names, replacing this sketch's `InstallPrompt.tsx`. `install-flow.tsx` is the `hidden | banner | sheet | done` machine the feed mounts; `install-banner.tsx` is the dismissible card (at `bottom-[96px]`, clearing the pill); `install-sheet.tsx` is 5.10's instruction sheet, moved here when it gained a second caller; `install-confirmation.tsx` is the `pop-in` checkmark overlay. `lib/install-store.ts` holds the rest: `attachInstallListeners` (mounted app-wide by `install-listener.tsx` in the root layout, because `beforeinstallprompt` fires **once and early** and is lost if nothing is listening), `useInstall()`, `isStandalone()`, and the pure eligibility functions over one versioned `localStorage` key (`ambit.install.v1`) — second feed visit, 30-day snooze on "Not now", permanent on the X, never when standalone.
  **The confirmation deliberately does not follow "Got it"** (a prototype deviation): Safari gives a page no signal about Add to Home Screen, so it fires on `appinstalled` or the first standalone launch, once ever.

### 8.3 PWA
- Web app manifest + service worker (built with Serwist — `src/app/manifest.ts`, `src/app/sw.ts` via `@serwist/turbopack`); offline shell + cached last feed page; installable on mobile.
- **The runtime caching strategy is hand-written (Phase 5.11), not `defaultCache`.** Predicates live in `src/lib/sw-rules.ts` — deliberately free of any `serwist` import so they unit-test in node and can also be called from page code. In order: `/api/auth/*` and `/api/trpc/*` **NetworkOnly**; `/api/img/*` **CacheFirst** (150 entries, 7d, last-used); the `/feed` **document only**, and only a real navigation, **NetworkFirst** into `ambit-pages` (never storing a redirected response — a signed-out `/feed` redirects to `/`); `/_next/static/*` CacheFirst; `/landing/*` and the icons StaleWhileRevalidate; then a **terminating catch-all `NetworkOnly`**.
  Three things about this are load-bearing. **`defaultCache` was caching the personalized feed** — its last rule takes every same-origin `/api/*` except auth into a shared 16-entry `NetworkFirst` bucket, and tRPC travels as GET. **Only the feed *document* is cached**, never an API response: `/feed` is an RSC page with its first page of items dehydrated into the HTML, which is the whole of "reopening offline shows the last feed". And **the trailing catch-all is not redundant** — a request matching no rule never enters Serwist's routing, and `fallbacks` only applies to requests Serwist handled, so omitting it disables the `~offline` page everywhere but `/feed`.
- **`start_url` is `/feed`, not `/`** — `/` redirects for a signed-in reader, and an offline launch cannot follow a redirect.
- **Sign-out purges `ambit-pages`** (`purgePagesCache`, best-effort, called from the page): a cached personalized feed must not outlive its session on a shared device.
- **Verification**: `e2e/pwa.prod.spec.ts`, excluded from `bun run e2e` (`testIgnore: /\.prod\.spec\.ts$/`) because the service worker is registered in production builds only. Run against `bun run build && bun run start`.

## 9. Feed engine (the core) — tiered topic drift over a curated pool

This is where the product lives. Validated end-to-end in Phase 0.5 (`phase0/feed.html` is the reference implementation; its knob defaults are the shipped defaults). The design in one line: **embeddings choose WHERE to look (topic level, offline); curated-weighted random chooses WHAT to show (item level, at request time).**

**Per page, each card slot:**

1. **Tier draw** — default mix **CORE 40 / DRIFT 35 / JUMP 25** (drift-heavy per Ben's 0.5 verdict: "what I enjoy most is the higher, further drift").
   - **CORE** — weighted draw over the user's own topics (`user_topic.weight`).
   - **DRIFT** — start from one of the user's topics, walk its adjacency row: softmax-sample among **positive-similarity neighbours only** (temperature ≈ 0.15; no positive bridge → fall back to CORE), then a **second hop with p ≈ 0.5** (Poetry → Typography → Machines is the signature move).
   - **JUMP** — uniform draw from the **bottom half** of a user topic's row. Deliberately not the strict antipode: tail ordering in a 16-point mean-centered space is noise, and false precision there adds nothing.
2. **Item pick** — within the chosen topic, weighted random over unseen items above the **curation-score floor** (default 4): `weight = (score − floor + 1)^power × (1 + boost per aesthetic_tag shared with the user's taste keywords)`. Never similarity-ranked — that was the 0.4 failure.
3. **Diversity constraints** — no two adjacent cards from the same source; per-page cap per topic (default 3). Constraints are soft: relax rather than starve.
4. **Seen tracking** — served items are excluded per user (the "almost never repeating" promise) via the `seen_item` table (§5.4b); cursor encodes the page seed. Items are marked seen **on receipt** as of Phase 5.7: `getFeedPage` composes the page and writes nothing, and the client acks the page it actually received through the `feed.markSeen` mutation. Only the items that made it into a page are ever acked — never the ones a slot considered and discarded along the way.

   *Why it moved off the render (08-20-26).* A server render is not evidence of a reader. Next prefetches routes, and a back-pop that re-runs the dynamic `/feed` renders it again; through 5.6 each of those marked a full page seen, measured at 1,116 items burned in six minutes. The cost of the move is that a lost or slow ack racing a fast scroll can repeat one page — cosmetic, self-limiting, and much the cheaper failure. `getFeedPage` still captures a `servedAt`, now purely as the next cursor's `anchor` (the page-boundary instant); §7's cursor design note carries the argument for why the exclusion arithmetic survives acks landing *after* that anchor rather than exactly on it.
5. **Card shaping** — map each `item` to an `ImageCard` or `ArticleCard` payload.

**Personalisation = topics, not items** (shipped in Phase 6.1). A **new** save — not a move between collections — does `LEAST(3.0, weight + 0.5)` on the saved item's topic (`WEIGHT_BUMP`/`WEIGHT_CAP` in `db/topics.ts`, phase0's defaults), creating the `user_topic` row at 1.5 when the user never picked that topic. That row creation is the *entire* "related topics inferred from saves" mechanism — deliberately no graph-neighbour spillover, because DRIFT/JUMP already spread a raised weight structurally (weighted draws pick the start of graph walks, and `reachableTopics` widens the fetched pools two hops out). Moves between collections don't re-bump; unsave doesn't decrement (weights record demonstrated interest; unsave is collection housekeeping). Taste keywords are **derived at feed time, never stored**: the last-24 unique `aesthetic_tags` across the user's most recent saves, recency-ordered, case-insensitively deduped (`getTasteKeywords` in `db/saves.ts`) — so there is nothing to migrate or decay, and unsave self-heals the list. Visibility is the combined save toast ("Saved to Art · Now drifting toward Cartography") — the UI *says* it reweighted, because an invisible feedback loop reads as random, xikipedia's core failure. Item-level nearest-neighbour personalisation is dead (Phase 0.4) and stays dead.

**The topic graph** feeding DRIFT/JUMP is a checked-in JSON (§5.2): topic centroids = mean of member-item vectors, **minus the global mean centroid** (load-bearing — skipping the centering makes one hub topic every row's neighbour), cosine-ranked. Regenerate offline when the corpus grows; hand-edit rows freely.

**Dev affordances stay in.** The debug overlay (why each card: tier, drift path with sims, curator score) and the tuning knobs (tier mix, score floor, temperature, hop chance, caps) ship in the app behind a dev flag for the whole development period — feel-tuning is ongoing product work, not a Phase 0 artifact.

**The gallery rail (Phase 5.8)** is this same machinery, extended into a sequence with no end and
run for a reader looking at one picture rather than scrolling a page (`server/services/gallery-rail.ts`,
behind `items.galleryRail`, powering `/g/[itemId]`). Per slot it rolls a **wildcard** first — with
probability `wildcardChance` (default **0.1**) the slot leaves the topic graph entirely and draws
corpus-wide, preferring `server/config/wildcard-sources.ts`'s list when that is non-empty. A wildcard
is a detour, not a relocation: the walk does not advance through it. Otherwise it draws a tier using
the feed's own **CORE/DRIFT/JUMP shares**, read from `DEFAULT_KNOBS` rather than restated, and
`stay`/`drift`/`jump` mean here exactly what they mean above — with drift and jump *advancing* the
walk, so a long swipe genuinely arrives somewhere else. Then one curated-weighted image per step,
with a three-link fallback (step topic → anchor's topic → anywhere) and a **short batch** when even
that runs dry, which the client reads as "this end is exhausted" and rubber-bands against.

Three things it deliberately isn't. It is **not personalized** — no `userId` parameter exists, the
same structural guarantee as `services/wander.ts`, and the reason `/g/` can be public. It is **not
similarity-ranked**, for the Phase 0.4 reason. And it **writes no `seen_item` rows, ever**: swiping
the gallery spends none of the reader's corpus. Repeated `feed.page` draws were rejected in writing
at plan time for exactly that — auth-only, and every swipe-through would have re-created the
corpus-burn defect removed on 08-20-26.

`WILDCARD_SOURCES` holds **`archive`** as of Phase A.5, and nothing else. It shipped empty in 5.8 —
the knob was the doorway, not the feature — because the archive adapter didn't exist on this side
yet; A.5 landed it (§6.1), and this list is the one line that had to change for Ben's own
photographs to start surfacing as the rail's wildcards. The preferred draw falls through to a
source-unrestricted one when it comes back empty, so an archive with nothing ingested yet costs
nothing: the wildcard reaches the whole corpus, which is a real behaviour rather than a degraded
one.

> Tags are a cheap secondary signal (filter/boost). The curation score and the topic graph are the primary drivers.

## 10. Styling (Tailwind)

Minimal, calm, high-contrast-on-neutral; content-forward (chrome recedes). Mobile-first; large
tap targets; smooth fullscreen/swipe transitions. Design tokens come from the handoff
(`docs/design_handoff_ambit_pwa_redesign/README.md`) and live in `src/styles/globals.css` as
Tailwind v4 `@theme` — there is no `tailwind.config.ts`, v4 is CSS-first. Established in Phase 5.1
(`docs/PHASE5_WALKTHROUGH_5.1.md`) and migrated to the redesign in Phase 5.4
(`docs/PHASE5_PLAN_5.4.md`); this section is the durable summary, not the planning doc.

**One ink color, not per-case alphas.** The prototypes hand-authored dozens of one-off
`rgba(239,235,224, N)` values for muted text, hairlines, and subtle fills. Tailwind v4's opacity
modifier runs on `color-mix()` and works on any `--color-*` token, so the whole system collapses
to a single `--color-ink: #EFEBE0` plus a normalized alpha ladder — use these stops, not a value
eyeballed off one prototype screen:

| Role | Class | Notes |
|---|---|---|
| Title tier | `text-ink-hi` | screen + item titles ONLY (`#F5F1E7`, a second opaque stop above ink) |
| Primary text | `text-ink` | body, list labels, toast |
| Secondary text | `text-ink/82` | chip labels (unselected) |
| Body / muted | `text-ink/62` | secondary copy, meta |
| Meta / attribution | `text-ink/55` | source lines, captions |
| Faint label | `text-ink/40` | eyebrows, loader label |
| Disabled | `text-ink/38` | inactive CTA text |
| Hairline strong | `border-ink/16` | glass buttons on imagery |
| Hairline default | `border-ink/12` | sheets, toasts, chips |
| Hairline faint | `border-ink/8` | cards, headers |
| Fill raised | `bg-ink/9` | chrome buttons |
| Fill default | `bg-ink/5` | chips, ghost buttons |
| Fill subtle | `bg-ink/3` | cards, tiles |

**Accent is a runtime knob**, not a build-time theme: one `--accent-raw` CSS variable, set by a
`[data-accent]` attribute on `<html>` (`indigo` `#4C5FE0` default, plus `amber`/`green`/`red`),
exposed as the `--color-accent` token via `@theme inline` (**not** plain `@theme` — a token whose
value is itself a runtime-redefined `var()` needs the `inline` form, or the generated utility
keeps the outer indirection and a `[data-accent]` override never resolves). `--font-sans` (Sora,
via `next/font`) needs the same treatment for the same reason. 5.1 shipped the mechanism, 5.4
re-pointed it at the redesign's set; the user-facing accent picker is Phase 9.2.

**Fonts:** Sora (`next/font/google`, variable — `weight` omitted) for *everything*: headings,
body, and UI chrome alike. The redesign uses a single typeface, so there is no `--font-serif` and
no second family to switch into — Newsreader and the native system stack were both removed in 5.4
(as Geist was in 5.1). Weight carries the hierarchy instead: 600 for titles/CTAs, 400 for body.

**Two easing curves:** `--ease-sheet` (`cubic-bezier(.22,.9,.3,1)`, 260ms) for the pill-summoned
bottom sheets, and `--ease-settle` (`cubic-bezier(.22,.61,.36,1)`, 400ms) for longer travel — the
gallery details modal (`--animate-sheet-gallery`), banners, and the install pop-in. All borders
are 0.5px via the custom `.border-hairline` utility; feed/saved image tiles are square-cornered
full-bleed (radius 0 is the absence of a class, not a token). A global
`prefers-reduced-motion: reduce` block collapses every animation — all motion here is decorative.

**Primitives** (`src/components/ui/`) are plain function components composing classes through
`cn()` — no `class-variance-authority`. Icons (`src/components/icons/`) are inline SVG on their
individually authored viewBoxes (the prototypes mix a 24×24 stroke set with several bespoke
grids), colored via `currentColor`. `@tailwindcss/typography` (`prose`) is **not installed and is
not planned**: the redesign has no expandable article body in the feed (5.6's article cards are
eyebrow + headline + a five-line-clamped lede, and nothing more), and the reader on the item page
renders stored plain text with `whitespace-pre-line` rather than source HTML — which is also the
only safe option, since §11 forbids rendering unsanitized source markup.

## 11. Security considerations

**Every line below ends in the thing that verifies it** — a test, a spec, or a query (Phase 7.2's
whole point was turning this section from a list somebody had read into a list that runs).

- **Auth enforcement** — `/feed`, `/saved`, `/onboarding` check session server-side; all tRPC mutations + user-scoped queries use `protectedProcedure`. *Verified by* `routers.test.ts` ("protected procedures reject a null session") and `src/proxy.test.ts` (the optimistic bounce: every authed prefix redirects without a cookie, no public path ever does).
- **Authorization** — every `saved_item` / `user_topic` / `seen_item` / profile query filters by `userId`. *Verified by* `routers.integration.test.ts` → `describe("7.2 — user isolation")`: two real users, and A's saves, topics, profile and seen rows are each proven invisible to B. The per-module table of which line does the filtering is in `docs/PHASE7_WALKTHROUGH_7.2.md`.
- **Invite gating** — sign-up rejected server-side for emails without a valid `invite` (Better Auth before-create hook); passwords hashed by Better Auth (scrypt); sessions database-backed and revocable. `revokeSessionsOnPasswordReset: true` (Phase 5.2) means a reset after a suspected compromise kills any live sessions, not just coexists with them. *Verified by* `e2e/auth.spec.ts`. Cookie flags observed on the production build: `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`; `Secure` is gated on an https `baseURL`. **Observed on the deployed origin (8.1, 08-29-26):** `__Secure-better-auth.session_token; HttpOnly; Secure; SameSite=Lax; Path=/`, host-only — the `__Secure-` prefix and the `Secure` flag both follow from `BETTER_AUTH_URL=https://ambit.benreilly.io` alone; nothing was configured for them.
- **Headers** (Phase 7.2) — every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that locks only what the app never uses (camera, microphone, geolocation, payment, usb — *not* Web Share, clipboard or notifications, which are features). `Strict-Transport-Security: max-age=31536000; includeSubDomains` is added **only when `BETTER_AUTH_URL` is https**, never on `NODE_ENV` — CI runs a production build over plain http. Every HTML and API response also carries an **enforced** `Content-Security-Policy` with a per-request nonce and `'strict-dynamic'`; `style-src` keeps `'unsafe-inline'` deliberately (fifteen components set `style={{…}}`, and blocking inline styles buys nothing against script injection). All values are built in one pure module, `src/config/security-headers.js`, consumed by `next.config.js` (static headers) and `src/proxy.ts` (the CSP, which needs a request to mint a nonce for). Reading the nonce with `headers()` in the root layout is what makes every route render on demand. *Verified by* `security-headers.test.ts`, `proxy.test.ts`, and `e2e/security.spec.ts` (headers plus zero `securitypolicyviolation` events across `/`, `/i/[itemId]`, `/feed`, `/settings`, `/saved`, under both servers).
- **Public surface** — `items.byId`, `items.wanderNext`, `items.galleryRail`, `/i/[itemId]`, and `/g/[itemId]` (plus `/api/img/[itemId]`) are the only unauthenticated surfaces, and all of them serve public-domain content with no user data. None of the three procedures takes a user id: `wanderNext` returns `{id,title,reason}` and `galleryRail` returns public item fields only; both pages' metadata is built from the item row alone (`generateMetadata` takes `params`, never `searchParams`, so a shared link's preview card cannot carry the sharer's name); the proxy resolves an item id, never a caller-supplied URL — and since 7.3 it caches to disk under `IMAGE_CACHE_DIR` and serves WebP, with the item id still the only key. `/i/?from=` renders a caller-supplied first name as a text node, `null` unless a single string ≤ 40 chars — by design (5.8). `/g/` additionally carries `robots: noindex` — `/i/` is the canonical, OG-carrying surface for a shared link, and two indexed pages for one work would be one too many. tRPC's error formatter leaks no stack traces in production. *Verified by* the audit table in `docs/PHASE7_WALKTHROUGH_7.2.md`, one row per surface with evidence.
- **Source content** — sanitize/normalize external HTML; render article text through trusted rendering, never raw `dangerouslySetInnerHTML` on unsanitized source data. *Verified by two tests:* `src/no-dangerous-html.test.ts` scans `src/**/*.tsx` and fails on any `dangerouslySetInnerHTML` outside the one constant accent script in `layout.tsx` (asserting that string interpolates nothing), and `source-invariants.test.ts` asserts no stored `title`/`summary`/`body` contains an HTML tag. **Open finding (08-28-26):** 41 rows *do* — `<i>`/`<em>` italics passed straight through by `smithsonian` (35 titles), `met` (2), `wellcome` (2 titles + 1 summary) and `nasa-images` (1 summary). Not a security bug (nothing renders them as HTML) but reader-visible; the fix is one `htmlToText()` call in `normalize.ts` plus a re-normalise, and the invariant excludes those four sources until then. 14 further `wikipedia` `body` hits are false positives — articles *about* markup.
- **Rate limiting** — tRPC 120/min keyed on user id → trusted IP → `"unknown"`; `/api/img` 600/min per trusted IP; Better Auth 20 per 10s on `/sign-in/email` and `/sign-up/email` (Phase 7.1 raised it from the 3-per-10s default, which a shared proxy bucket could not survive). *Verified by* `rate-limit.test.ts` (the limiter and `trustedClientIp`) and `routers.test.ts` (the middleware's 429 path: 120 calls on one key pass, the 121st throws `TOO_MANY_REQUESTS`).
- **IP trust** (Phase 7.2, D4) — no proxy code is needed today. Better Auth ≥ 1.6.21 refuses to trust a comma-separated `X-Forwarded-For` chain and uses only a single-valued header, which is what Coolify's Traefik sends (it strips inbound `X-Forwarded-*` from untrusted peers and sets its own); Ambit's own `trustedClientIp()` takes the last hop for the same reason, so both limiters agree. `advanced.ipAddress.trustedProxies` stays unset. **8.1 action:** behind the deployed proxy, confirm with one real request that `/sign-in/email` limits per client rather than per proxy; if the header arrives multi-valued, set `trustedProxies` to the proxy's address. Recorded in full above `rateLimit` in `src/lib/auth.ts`.
- **Not done, and deliberately** — a CSP `report-to` endpoint, `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`, and Subresource Integrity. None is needed by an invite-only app that loads nothing cross-origin; 8.2 candidates if the surface grows.

## 12. Testing strategy
Production-grade from the start (portfolio / work-transferable practice — non-negotiable).
- **Vitest (unit):** each source adapter's `toItem` normalization; the curator's quality floor + response parsing; the feed tier/topic/item composition logic (tier mix, drift walks, diversity constraints, seen exclusion); repository query builders.
- **Playwright (e2e):** nine spec files, 46 tests, covering every flow this section originally listed. `auth.spec.ts` (5.2) — invite gating, sign-up, sign-in, sign-out, and the password-reset round trip through Mailpit's HTTP API. `feed.spec.ts` (5.6) — onboarding → a populated two-column feed, infinite scroll, long-press → item sheet → save, tap → item page → back with `?focus=`, the pill's sheets. `item.spec.ts` (5.7) and `gallery.spec.ts` (5.8) — the public `/i/[itemId]` reader and the immersive `/g/[itemId]`, both largely signed-out. `saved.spec.ts` (5.9), `settings.spec.ts` (5.10), `home.spec.ts` (1.2), `pwa.prod.spec.ts` (5.11), which checks the offline/caching strategy against a real service worker, and `security.spec.ts` (7.2) — the security headers on every kind of route, and zero CSP violations across the real screens under both servers.
  The one item on the original list that is **not** covered here is the swipe gestures — the rail swipe, hard-swipe-up exit, two-finger exit, drag-to-close. Playwright's mouse API doesn't compose multi-pointer or velocity-sensitive sequences reliably enough to assert on; they are covered at the hook level (`use-swipe-back.test.tsx`, `use-rail-gestures.test.tsx`) and judged on each phase's device pass, which is where a rubber-band follow can actually be judged anyway.
  **CI runs the whole suite against a production build** since Phase 7.1 (`bun run build` → `next start`, Postgres + Mailpit as service containers) — which is what lets `pwa.prod.spec.ts` join it, and what surfaced two production-only bugs the dev server had been hiding. Two local scripts go with it: `bun run e2e:prod` reproduces the CI configuration (`E2E_PROD=1`), and `bun run e2e:clean` retires the users the suite leaves behind by design.
  Every DB-touching spec seeds its own `source: "e2e"` corpus under a spec-specific `sourceId` prefix and cleans it up children-first, scoped to that prefix — never to `source: "e2e"` as a whole, which would pull a parallel worker's fixtures out from under it. Sizing matters on an empty database: the feed excludes each reader's `seen_item` rows, so a file's corpus has to cover roughly a page (12) per feed load it performs.
  Two rules the suite learned the hard way in 5.6, both in `e2e/support.ts` / `playwright.config.ts` with comments: **Playwright's output must not live in the project root** (its mid-run writes trigger the dev server's Fast Refresh, which remounts the app mid-test), and **landing-page interactions must wait for hydration** (the auth form's submit button submits natively before React attaches, reloading to `/?` and discarding the input).
- **Not tests, but the measurements that keep them honest:** `bun run bench:feed` times `getFeedPage` over N cursor-followed pages and reports the `getTopicPools` payload separately (Phase 7.3 — it is what showed the pools were dragging 35.8 MB per page). Lighthouse evidence for `/` and `/feed` on a throttled mobile profile lives in `docs/phase7.3-evidence/` as committed JSON (the HTML reports are gitignored). Neither is a gate; both are the before/after a performance claim has to cite.
- Aim for strong coverage on adapters + the feed algorithm (highest-value, highest-risk).

## 13. Deployment
- Invite-only (Ben + friends) → shareable tier with a persistent backend + Postgres + ingestion pipeline (awkward on pure serverless).
- **`IMAGE_CACHE_DIR` must be a persistent volume** (Phase 7.3, decision D3). The image proxy keeps one `<itemId>.webp` per item there — ~0.67 GB for the current corpus, at 62 KB a file. On an ephemeral filesystem every deploy would send the whole corpus back to the museums, which is precisely the traffic the cache exists to prevent. **8.1 mounts it.** `bun run img:warm --rate 2` fills it deliberately after the first deploy.
- **Target: self-host via [Coolify](https://coolify.io)** on a small VPS or the homelab — git-push deploys of the Next.js app + self-hosted Postgres; cron-scheduled ingestion job; zero vendor lock-in; fits the ~$0–15/mo budget. (Vercel free tier is a fallback only if a serverless split proves simpler.)
- **Nightly ingest is a Coolify Scheduled Task, `bun run ingest` at `30 1 * * *` — and Coolify's cron clock is UTC** (probed 08-30-26 with a `date` task: `Sun Aug 30 18:08:03 UTC 2026`). So the run fires at **21:30 EDT / 20:30 EST the previous evening**, ahead of the archive's 03:00 local ingest and the `0 4 * * *` UTC database backup, which is the order 8.1 wants: ingest, then back up what it wrote.
- Bun scripts use the `--bun` flag so the Bun runtime is used in dev and prod:
  ```json
  "scripts": {
    "dev":   "bun run --bun next dev",
    "build": "bun run --bun next build",
    "start": "bun run --bun next start",
    "ingest":"bun run scripts/ingest.ts"
  }
  ```

## 14. Development workflow (build order)
0. **Phase 0 (throwaway) — validate the magic. ✅ COMPLETE (07-13-26).** Outcome: item-level NN rejected (0.4); the validated design is the tiered topic-drift feed over a curated pool (0.5). Deliverables that carry forward: `phase0/harvest.ts` (basis for the five v1 adapters + their recorded traps), `phase0/curate.ts` (basis for the curator service), `phase0/topic-graph.ts` + `topic-graph.json` (the graph tooling), `phase0/feed.html` (reference implementation of §9, still the feel-tuning bench).
1. Scaffold: `create-t3-app` (Next App Router + tRPC + Tailwind + Drizzle; **skip its NextAuth option** — Better Auth is added manually, as create-t3-app doesn't offer it yet), Bun, PWA config. Install pinned package versions manually.
2. DB: Drizzle schema (§5) + Better Auth core tables (CLI-generated); plain Postgres; migrations.
3. Auth: Better Auth email + password, invite-gated sign-up, password reset mail.
4. Source adapters (Wikipedia + Met + one more) → normalization → `item` upsert.
5. Curation service (§6.2: quality floor + LLM curator) + topic-graph config; the ingestion job.
6. Feed engine (§9) + `feed.page` (port the composition from `phase0/feed.html`, including debug overlay + knobs behind a dev flag).
7. Feed UI: infinite scroll, fullscreen swipe gallery, article expand, save/share.
8. Onboarding (taste picker seeded from top curation scores, per 0.5; topic chips as fallback) + `user_topic`; saves reweight topics visibly.
9. Remaining source adapters (CMA + Wellcome already trial-passed); polish; deploy via Coolify; invite friends.

## 15. Open questions / risks

**Settled by Phase 0** (details in `phase0/NOTES.md` + `log.md`):
- ~~Serendipity quality~~ → item-level NN **rejected** (0.4: catalog boilerplate + top-k's anti-serendipity nature); the tiered topic-drift feed over a curated pool **passed the feel gate** (0.5, drift-heavy defaults per Ben's verdict).
- ~~Content density~~ → non-issue at five sources; the binding constraint was quality, answered by the curation layer.
- ~~Embedding model / text construction / `dimensions`~~ → `text-embedding-3-small` × recipe A for offline topic centroids; `bge-m3` cut (~10× slower via OpenRouter); `dimensions` honored but moot — no vector column in the DB.

**Settled by Phase 3.4** (`docs/PHASE3_PLAN.md`, `docs/PHASE3_WALKTHROUGH_3.4.md`):
- ~~Multi-topic collisions at ingestion~~ → **highest-search-rank wins; ties break on the alphabetically-smallest topic id** (`resolveCollisions()`, `server/services/ingest-plan.ts`). Order-independent by construction — the property the phase0 postmortem below demanded — and unit-tested directly on that property (reversed input order → identical winners). The ingestion summary table surfaces collision counts per source so this can never regress invisibly again. Verified against real ingestion: astronomy, which phase0's last-topic-wins dedupe starved to 4 of 419 AIC finds, now keeps a healthy, non-starved share of its pool under the real collision rule (see the walkthrough for the exact post-populate count) — the corpus-wide per-topic spread has no starved outliers.

**Provisionally settled (07-17-26)** — Ben judged both in the harness and is happy for now; final call deferred to when each is actually built:
- **Visual embeddings → provisional KEEP** — the blind-harness browse read well (image vectors find *form/vibe* where text finds *subject*). If it ships, it's a "more like this look" save-affordance, not a feed tier — post-MVP; revisit when that affordance is built.
- **Favorites-prompt onboarding → provisional KEEP** — `--favorites` results read well; planned for onboarding alongside the taste picker (BUILD_PLAN 5.3/8). Final call when onboarding is built.

**Open:**
- **Curator calibration drift** — the persona prompt encodes Ben's taste secondhand; scores skew 7–9. Spot-check against hand labels periodically; `PROMPT_VERSION` bump re-scores the corpus for ~$1.
- **Topic-graph refresh cadence** — recompute on corpus growth is manual; decide when (per-ingest? monthly?) and whether weak-row hand edits persist across recomputes.
- **Tier-mix defaults under real use** — CORE 40/DRIFT 35/JUMP 25 reflects one evening of browsing; revisit once the app has weeks of actual use (knobs stay in behind the dev flag for exactly this).
- **Source-API drift** — ~8 external APIs to keep healthy (ongoing maintenance tax); museum image servers bot-block third-party fetchers (pass bytes, never URLs — bitten twice in Phase 0.5).
- **Article extraction** — clean lede/full-text across heterogeneous sources.
- **The curator has no rubric for text items (08-21-26, Phase 6.2)** — `CURATOR_PROMPT` asks for "visually striking or quietly beautiful images" and ideas with "a genuine spark of *huh, I never knew that*". A lyric poem cannot win on either, whatever its quality: Pope and Seeger both scored 4 in the PoetryDB trial, and Wikipedia's corpus-wide 5.27 average has the same cause. Since the prompt is a product artifact carrying Ben's taste calibration, this is his call, not a refactor: either a second rubric branch for `type: "article"`, or an accepted "text scores low and that is what the tier mix is for". **Blocks un-parking `poetrydb`** and is worth settling before 6.3's blogs, which are text items by construction. *Does not bite 6.3's blogs after all (08-27-26) — a link card is image-led and the hero goes to the model as bytes; doorofperception scored 8.64 avg.*
- ~~**`tile.loc.gov` rate-limits by IP, and the reader shares the user's IP, not ours** (08-21-26, Phase 6.2)~~ → **settled 08-28-26 by Phase 7.3: proxy-with-cache.** Every source image is now fetched from upstream exactly once, ever, resized to ≤1600 px WebP and served off disk (see **Image delivery** below). A reader's scroll costs LoC nothing after the first fill, which is the shape a per-IP budget needs — a bare proxy would have concentrated every reader's requests on one IP and made it worse. `bun run img:warm` spends those one-time fetches deliberately: **372 LoC images at 1/s produced no 429 at all**, so 6.2's failure was a burst, not the budget.
- **The curator's `imageAsDataUrl` failure was silent until 08-21-26** — now counted and printed per source (`fix(curator)`, Phase 6.2). Left open here because the *fix* is only the instrument: nothing yet decides what a run should **do** when the count is high. Options range from "warn" (today) through "refuse to write scores for that source" to "retry the whole source later". The LoC run that motivated it wrote 334 scores of unknown provenance; a re-curation with `--force` once the block clears is the honest repair, and the same question will recur.
- **Blog adapter family v1 — closed 08-27-26.** Designed 08-25-26 (`docs/PHASE6_DESIGN_6.3.md`, all seven answers) and built (§6.1, §6.4, §5.1; `docs/PHASE6_WALKTHROUGH_6.3.md`). *The original item, for the record:* the strategy is decided (§6.1), the design is not. A session owes seven answers: (1) the adapter interface, since blogs have no `search(q)`; (2) topic assignment with no seed queries; (3) items per post and the feed-flooding/dedupe rule; (4) where the article blurb lives (nullable `body`, §5.1); (5) image hosting — this is the strongest case yet for BUILD_PLAN 7.3's proxy-with-cache; (6) scrape etiquette (robots.txt, rate, re-crawl cadence — artvee was cut on exactly this, 08-20-26); (7) whether blog items go through the normal curator pass. Detail in `docs/BUILD_PLAN.md` 6.3.
- **Live search-API nondeterminism at ingest** — Phase 3.4 found Wikipedia's (and to a lesser extent Wellcome's) live search endpoints return a slightly different result set for the exact same query across separate calls (confirmed directly: two back-to-back identical `search()` calls returned 3 different sourceIds out of 10). Ingestion has no HTTP cache (SPEC's deliberate deviation from phase0 — the DB's skip-existing check does that job for anything already discovered), so an immediate re-run isn't a strict no-op the way the DB layer alone guarantees: it can surface a small, convergent trickle of genuinely new items near each query's rank cutoff (622 → +37 → +19 across three consecutive `--quota 10` runs) rather than exactly zero. Never duplicates or re-scores an existing item — verified exact across all three runs — so this is a corpus-completeness curiosity, not a correctness bug.
