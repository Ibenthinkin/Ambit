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
- Composition: weighted-random across (a) picked topics and (b) related topics inferred from saved items — always retaining some randomness.
- Image card: tap → fullscreen; swipe left/right pages through a fullscreen gallery of the feed's images.
- Article card: headline + lede/synopsis; double-tap / long-press expands full text inline.

### 3.4 Save & share
- Save toggles an item into the user's saved set (synced).
- Share invokes the native share sheet with the item's public URL.
- Saves feed back into related-topic weighting.

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
| `body` | **proposed extension (08-20-26, undecided):** for blog items `body` would hold the 1–2 sentence blurb about the source article, with `summary` as fallback — and would explicitly **not** be a reader surface for them. Full article text is used at ingest only and never stored for display. Settle at 6.3's design session. |
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
- **Planned: a blog adapter family (decided 08-20-26, undesigned).** Ambit's content is to come primarily from **designated blogs**, which already carry the tags, descriptions and articles that image sources make you manufacture. It is an **in-repo adapter family** — a shared scraper core plus per-blog config, one `SourceId` per blog — and deliberately **not** a third cross-service integration pattern; the ecosystem's two blessed patterns govern seams *between* services, and this stays inside Ambit. Its presentation contract is **excerpt + link-out**: image or short excerpt, Ambit's own description, a 1–2 sentence blurb about the article, a visible `from: <blog>` credit and a prominent link to the original. **Ambit hosts no reformatted articles** and makes **no fair-use claim**; full text is used at ingest only. Blogs do not `search(q)`, so the adapter interface above does not fit as written — that and six other questions are open. See `docs/BUILD_PLAN.md` step 6.3 and, for the governing decision, Ambit-Admin's `Ecosystem Architecture.md` (08-20-26). Designated-blog list: [`docs/source-candidates.md`](docs/source-candidates.md).
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
- `/` — landing + sign-in / sign-up (email + password; forgot-password link). Built Phase 5.2 — a mode-toggle `AuthCard` (`src/components/landing/`), not the design handoff prototype's magic-link form; see `docs/PHASE5_WALKTHROUGH_5.2.md`.
- `/reset-password` — where the password-reset email lands (`?token=...` on a valid link, `?error=INVALID_TOKEN` on an expired one). Ungated (src/proxy.ts's matcher deliberately excludes it — resetting a password implies being signed out).
- `/onboarding` — topic-chip grid (first sign-in; redirect here until topics chosen). Built Phase 5.3 — a sixteen-chip grid (not the design handoff's thirty-two; see §3.2), `OnboardingScreen` (`src/components/onboarding/`), persisted via `topics.setMine`; see `docs/PHASE5_WALKTHROUGH_5.3.md`.
- `/feed` — the infinite feed (auth-gated, default authenticated landing). Built Phase 5.6 (`docs/PHASE5_WALKTHROUGH_5.6.md`), replacing 5.2's placeholder: an **RSC shell** — the two guards (session → `/`; not-onboarded → `/onboarding`, carried forward verbatim from 5.3), a `prefetchInfinite` + `HydrateClient` handoff, and `FeedScreen`. The route stays **dynamic** by construction (it reads `headers()` and the feed is per-user). The prefetch input and the client `useInfiniteQuery` input must stay byte-identical (`{}` on both sides) or hydration silently misses and the client refetches — which costs a page of the user's corpus, since a received page is acked seen (`feed.markSeen`, Phase 5.7).
- `/saved` — saved items.
- `/i/[itemId]` — public read-only single item. Built Phase 5.7 (`docs/PHASE5_WALKTHROUGH_5.7.md`), replacing 5.6's interim stub. An **image variant** and a **reader variant** keyed on `item.type`; a `from: <source>` credit line under both titles, linking `item.sourceUrl` (every source, not just blogs — §6.1's rights posture, generalized); the article body typeset from the stored `body` column via `src/lib/reader-blocks.ts` (no runtime source fetch, no source HTML, so nothing to sanitize); a `?from=Name` param-driven "shared this with you" row (≤40 chars, text-only, never persisted, never looked up); the `items.wanderNext` teaser on both variants; and a join CTA for signed-out visitors only. The pill toolbar, both sheets, and the protected `saves.forItem` query render **only** when authed — a signed-out visitor triggers no user-scoped request at all, and `generateMetadata` is built purely from the item row so a shared link's preview carries nothing about the sharer. Leaving is `useLeaveToFeed`: **pop** history when the visit came from the feed, push `/feed?focus={id}` only for a cold-opened link — a pushed navigation re-runs the dynamic `/feed` and draws a fresh page of corpus. A horizontal swipe-back (`useSwipeBack`, 0.35× rubber-band follow, commits past 70px) shares that same exit. Ungated in `src/proxy.ts` by design.
- `/g/[itemId]` — the **immersive gallery**, the app's second public route. Built Phase 5.8 (`docs/PHASE5_WALKTHROUGH_5.8.md`): a full-bleed, images-only, zero-chrome-until-you-ask screen, entered by tapping the item page's hero (and, from 5.9, from Saved). **Images only** — a crafted `/g/{articleId}` 404s. Swiping walks the **wander rail** (§9): endless, bidirectional, and marking nothing seen. Chrome (title, maker, hint, pill) starts hidden and cycles on a 10s loop; a tap raises it, a tap while it's up opens the details sheet (tap-again, not double-tap — the prototype's own behaviour). Exits are `useExitGallery`: the close gesture **pops** to the entry surface when a `gallery-origin` marker says one is on the stack, else pushes `/i/{entryId}`; the pill's Feed button does `history.go(-2)` over `…feed → /i/x → /g/x` when *both* origin markers line up, else the documented `/feed?focus={id}` cold-open path. Sharing from here shares `/i/{currentId}`, never `/g/` — so the route carries minimal metadata and `robots: noindex`. The pill, both sheets, and the protected `saves.forItem` query render **only** when authed. Ungated in `src/proxy.ts` by design, like `/i/`.
- `/api/img/[itemId]` — the image proxy (Phase 5.7). Takes an **item id and looks the URL up in our own table; it never accepts a URL**, from a query param or anywhere else — that is the SSRF/open-proxy boundary. It fetches server-side with Ambit's UA and **no `Referer`** — which removes the variable behind the Art Institute of Chicago's `localhost`-referer block (`docs/HANDOFF_aic-images.md` §2.2), though AIC turned out to have escalated to a host-wide Cloudflare *interactive challenge* that no server-side fetch can pass, so that source stays suspended (ibid. §8). Successes stream through with `Cache-Control: public, max-age=31536000, immutable`; every failure path is `no-store`. Its rate limiter is a **separate, generous instance** (600/min per IP) rather than the shared tRPC one — a single feed page loads ~24 images and would otherwise starve the API. `data:` image URLs bypass it client-side. Resizing / IIIF sizing / a CDN cache layer are deliberately deferred to 7.3.
- `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...all]/route.ts` (Better Auth catch-all via `toNextJsHandler`).

### 8.2 Components
- `components/feed/` (Phase 5.6) — the built names, which diverge from the sketch below. `feed-screen.tsx` is the infinite scroll (`useInfiniteQuery` on `feed.page`, `IntersectionObserver` sentinel rooted on the **viewport**); `masonry.ts` holds the layout decisions as pure functions (`buildTiles` inserts at most one serendipity tile per fetched page, on its first `JUMP` with `driftPath.length >= 2`; `packColumns` greedily fills the shorter of two columns, which — unlike CSS `columns` — can never reorder a tile the reader is already looking at); `image-tile.tsx` / `article-card.tsx` / `because-tile.tsx` are the three tiles; `use-feed-scroll.ts` is the `?focus=` return-scroll and session scroll restore.
- `FullscreenGallery.tsx` — fullscreen image view with left/right swipe paging.
- ~~`ArticleExpand.tsx`~~ — **dropped at the 5.4 re-baseline.** The redesign has no in-feed expand: an article card is a doorway (eyebrow + headline + clamped lede) and the body lives on the item page. Long-press on a feed tile opens the item sheet instead (`sheets/item-sheet.tsx`, 5.6).
- `SaveButton.tsx`, `ShareButton.tsx` — item actions (share → Web Share API).
- `OnboardingScreen.tsx` — onboarding selector (chip grid + sticky CTA + `topics.setMine` submit; Phase 5.3). Named to match the built component — the handoff's own `TopicChips` name never landed, since the chip grid, header block, and sticky CTA all live in one client component rather than a split-out chips-only piece.
- `InstallPrompt.tsx` — PWA install affordance.

### 8.3 PWA
- Web app manifest + service worker (built with Serwist — `src/app/manifest.ts`, `src/app/sw.ts` via `@serwist/turbopack`); offline shell + cached last feed page; installable on mobile.

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

**Personalisation = topics, not items.** Saving an item nudges its topic's `user_topic.weight` up (visibly — the UI says so; an invisible feedback loop reads as random, xikipedia's core failure) and folds the item's `aesthetic_tags` into the user's taste keywords. Item-level nearest-neighbour personalisation is dead (Phase 0.4) and stays dead.

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
- **Auth enforcement** — `/feed`, `/saved`, `/onboarding` check session server-side; all tRPC mutations + user-scoped queries use `protectedProcedure`.
- **Authorization** — every `saved_item` / `user_topic` query filters by `userId`.
- **Invite gating** — sign-up rejected server-side for emails without a valid `invite` (Better Auth before-create hook); passwords hashed by Better Auth (scrypt); sessions database-backed and revocable. `revokeSessionsOnPasswordReset: true` (Phase 5.2) means a reset after a suspected compromise kills any live sessions, not just coexists with them.
- **Public surface** — `items.byId`, `items.wanderNext`, `items.galleryRail`, `/i/[itemId]`, and `/g/[itemId]` (plus `/api/img/[itemId]`) are the only unauthenticated surfaces, and all of them serve public-domain content with no user data. None of the three procedures takes a user id: `wanderNext` returns `{id,title,reason}` and `galleryRail` returns public item fields only; both pages' metadata is built from the item row alone; the proxy resolves an item id, never a caller-supplied URL. `/g/` additionally carries `robots: noindex` — `/i/` is the canonical, OG-carrying surface for a shared link, and two indexed pages for one work would be one too many.
- **Source content** — sanitize/normalize external HTML; render article text through trusted rendering, never raw `dangerouslySetInnerHTML` on unsanitized source data.
- **Rate limiting** — basic per-user/IP limits on tRPC endpoints.

## 12. Testing strategy
Production-grade from the start (portfolio / work-transferable practice — non-negotiable).
- **Vitest (unit):** each source adapter's `toItem` normalization; the curator's quality floor + response parsing; the feed tier/topic/item composition logic (tier mix, drift walks, diversity constraints, seen exclusion); repository query builders.
- **Playwright (e2e):** invite gating blocks uninvited sign-up, invited sign-up + sign-in (email + password), sign-out, and the full password-reset round trip through Mailpit's HTTP API — all landed Phase 5.2 (`e2e/auth.spec.ts`, local-only until Phase 7.1 gives CI a Postgres). Phase 5.6 added `e2e/feed.spec.ts`: onboarding → a populated two-column feed, infinite scroll appends, long-press → item sheet → save, tap → item page → back with `?focus=`, and the pill's sheets. Still to come: image fullscreen + swipe, save persists across reload, public `/i/[itemId]` renders read-only.
  Two rules the suite learned the hard way in 5.6, both in `e2e/support.ts` / `playwright.config.ts` with comments: **Playwright's output must not live in the project root** (its mid-run writes trigger the dev server's Fast Refresh, which remounts the app mid-test), and **landing-page interactions must wait for hydration** (the auth form's submit button submits natively before React attaches, reloading to `/?` and discarding the input).
- Aim for strong coverage on adapters + the feed algorithm (highest-value, highest-risk).

## 13. Deployment
- Invite-only (Ben + friends) → shareable tier with a persistent backend + Postgres + ingestion pipeline (awkward on pure serverless).
- **Target: self-host via [Coolify](https://coolify.io)** on a small VPS or the homelab — git-push deploys of the Next.js app + self-hosted Postgres; cron-scheduled ingestion job; zero vendor lock-in; fits the ~$0–15/mo budget. (Vercel free tier is a fallback only if a serverless split proves simpler.)
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
- **Blog adapter family v1 (08-20-26)** — the strategy is decided (§6.1), the design is not. A session owes seven answers: (1) the adapter interface, since blogs have no `search(q)`; (2) topic assignment with no seed queries; (3) items per post and the feed-flooding/dedupe rule; (4) where the article blurb lives (nullable `body`, §5.1); (5) image hosting — this is the strongest case yet for BUILD_PLAN 7.3's proxy-with-cache; (6) scrape etiquette (robots.txt, rate, re-crawl cadence — artvee was cut on exactly this, 08-20-26); (7) whether blog items go through the normal curator pass. Detail in `docs/BUILD_PLAN.md` 6.3.
- **Live search-API nondeterminism at ingest** — Phase 3.4 found Wikipedia's (and to a lesser extent Wellcome's) live search endpoints return a slightly different result set for the exact same query across separate calls (confirmed directly: two back-to-back identical `search()` calls returned 3 different sourceIds out of 10). Ingestion has no HTTP cache (SPEC's deliberate deviation from phase0 — the DB's skip-existing check does that job for anything already discovered), so an immediate re-run isn't a strict no-op the way the DB layer alone guarantees: it can surface a small, convergent trickle of genuinely new items near each query's rank cutoff (622 → +37 → +19 across three consecutive `--quota 10` runs) rather than exactly zero. Never duplicates or re-scores an existing item — verified exact across all three runs — so this is a corpus-completeness curiosity, not a correctness bug.
