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
- **Password reset** emails via the transactional mail provider (Mailpit in dev, Resend in prod) through `emailAndPassword.sendResetPassword`. Email *verification* is skipped — the invite list (addresses Ben issued invites to) is the trust anchor, so verification would be redundant friction.
- **Sessions are database-backed** (Better Auth default; `session` table) — revocable server-side, read on the server via `auth.api.getSession({ headers })`.
- Auth state available on server (SSR / protected routes) and client (UI, via `better-auth/react` client).
- Anonymous users: can view a shared item URL (read-only); cannot access the feed, saves, or onboarding.

### 3.2 Onboarding
- First sign-in → topic-chip grid (~20–40 broad chips).
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
  source         TEXT NOT NULL,              -- 'wikipedia' | 'met' | 'aic' | 'cma' | 'wellcome' | ...
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
  user_id  TEXT NOT NULL REFERENCES "user"(id),
  item_id  TEXT NOT NULL REFERENCES item(id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
```

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

- Implement in phases (Wikipedia + Met + one more first; remaining in Phase 4). **Committed v1 set now includes Cleveland Museum of Art and Wellcome Collection** — both passed the source-candidates trial in Phase 0.5 (CMA: CC0, no key, prose descriptions; Wellcome: open-license filter + per-item license check, history-of-science texture). Adapter quirks for all five are recorded in `phase0/NOTES.md`.
- Respect each source's rate limits + attribution/licensing. Responses are cached by upserting into `item`.
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
- `saves.ts` — `saveItem`, `unsaveItem`, `getSavedItems(userId)`.
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
| `feed.page` | query | `{ cursor?: string }` | `{ items: Item[], nextCursor?: string }` |
| `items.byId` | query | `{ id: string }` | `Item` (public; read-only) |
| `saves.toggle` | mutation | `{ itemId: string }` | `{ saved: boolean }` |
| `saves.list` | query | — | `Item[]` |

- `feed.page` is **cursor-based** (opaque cursor encodes pagination + the in-flight weighting seed).
- `items.byId` is the only public (unauthenticated-allowed) procedure, backing `/i/{itemId}`.

## 8. Frontend — routes & components

### 8.1 Routes (App Router)
- `/` — landing + sign-in / sign-up (email + password; forgot-password link). *Note: the design handoff's landing prototype still shows the earlier magic-link flow — see the divergence note in `docs/design_handoff_ambit_pwa/README.md` §1.*
- `/onboarding` — topic-chip grid (first sign-in; redirect here until topics chosen).
- `/feed` — the infinite feed (auth-gated, default authenticated landing).
- `/saved` — saved items.
- `/i/[itemId]` — public read-only single item.
- `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...all]/route.ts` (Better Auth catch-all via `toNextJsHandler`).

### 8.2 Components
- `Feed.tsx` — infinite scroll (TanStack Query `useInfiniteQuery` on `feed.page`); renders mixed cards.
- `ImageCard.tsx` / `ArticleCard.tsx` — the two card types.
- `FullscreenGallery.tsx` — fullscreen image view with left/right swipe paging.
- `ArticleExpand.tsx` — inline expand on double-tap / long-press.
- `SaveButton.tsx`, `ShareButton.tsx` — item actions (share → Web Share API).
- `TopicChips.tsx` — onboarding selector.
- `InstallPrompt.tsx` — PWA install affordance.

### 8.3 PWA
- Web app manifest + service worker (e.g. `@ducanh2912/next-pwa` or equivalent); offline shell + cached last feed page; installable on mobile.

## 9. Feed engine (the core) — tiered topic drift over a curated pool

This is where the product lives. Validated end-to-end in Phase 0.5 (`phase0/feed.html` is the reference implementation; its knob defaults are the shipped defaults). The design in one line: **embeddings choose WHERE to look (topic level, offline); curated-weighted random chooses WHAT to show (item level, at request time).**

**Per page, each card slot:**

1. **Tier draw** — default mix **CORE 40 / DRIFT 35 / JUMP 25** (drift-heavy per Ben's 0.5 verdict: "what I enjoy most is the higher, further drift").
   - **CORE** — weighted draw over the user's own topics (`user_topic.weight`).
   - **DRIFT** — start from one of the user's topics, walk its adjacency row: softmax-sample among **positive-similarity neighbours only** (temperature ≈ 0.15; no positive bridge → fall back to CORE), then a **second hop with p ≈ 0.5** (Poetry → Typography → Machines is the signature move).
   - **JUMP** — uniform draw from the **bottom half** of a user topic's row. Deliberately not the strict antipode: tail ordering in a 16-point mean-centered space is noise, and false precision there adds nothing.
2. **Item pick** — within the chosen topic, weighted random over unseen items above the **curation-score floor** (default 4): `weight = (score − floor + 1)^power × (1 + boost per aesthetic_tag shared with the user's taste keywords)`. Never similarity-ranked — that was the 0.4 failure.
3. **Diversity constraints** — no two adjacent cards from the same source; per-page cap per topic (default 3). Constraints are soft: relax rather than starve.
4. **Seen tracking** — served items are excluded per user (the "almost never repeating" promise); cursor encodes the page seed.
5. **Card shaping** — map each `item` to an `ImageCard` or `ArticleCard` payload.

**Personalisation = topics, not items.** Saving an item nudges its topic's `user_topic.weight` up (visibly — the UI says so; an invisible feedback loop reads as random, xikipedia's core failure) and folds the item's `aesthetic_tags` into the user's taste keywords. Item-level nearest-neighbour personalisation is dead (Phase 0.4) and stays dead.

**The topic graph** feeding DRIFT/JUMP is a checked-in JSON (§5.2): topic centroids = mean of member-item vectors, **minus the global mean centroid** (load-bearing — skipping the centering makes one hub topic every row's neighbour), cosine-ranked. Regenerate offline when the corpus grows; hand-edit rows freely.

**Dev affordances stay in.** The debug overlay (why each card: tier, drift path with sims, curator score) and the tuning knobs (tier mix, score floor, temperature, hop chance, caps) ship in the app behind a dev flag for the whole development period — feel-tuning is ongoing product work, not a Phase 0 artifact.

> Tags are a cheap secondary signal (filter/boost). The curation score and the topic graph are the primary drivers.

## 10. Styling (Tailwind)
- Minimal, calm, high-contrast-on-neutral; content-forward (chrome recedes).
- `@tailwindcss/typography` (`prose`) for expanded article text.
- Mobile-first; large tap targets; smooth fullscreen/swipe transitions.

## 11. Security considerations
- **Auth enforcement** — `/feed`, `/saved`, `/onboarding` check session server-side; all tRPC mutations + user-scoped queries use `protectedProcedure`.
- **Authorization** — every `saved_item` / `user_topic` query filters by `userId`.
- **Invite gating** — sign-up rejected server-side for emails without a valid `invite` (Better Auth before-create hook); passwords hashed by Better Auth (scrypt); sessions database-backed and revocable.
- **Public surface** — only `items.byId` / `/i/[itemId]` are public, and items are public-domain content with no user data.
- **Source content** — sanitize/normalize external HTML; render article text through trusted rendering, never raw `dangerouslySetInnerHTML` on unsanitized source data.
- **Rate limiting** — basic per-user/IP limits on tRPC endpoints.

## 12. Testing strategy
Production-grade from the start (portfolio / work-transferable practice — non-negotiable).
- **Vitest (unit):** each source adapter's `toItem` normalization; the curator's quality floor + response parsing; the feed tier/topic/item composition logic (tier mix, drift walks, diversity constraints, seen exclusion); repository query builders.
- **Playwright (e2e):** invited sign-up + sign-in (email + password) → onboarding → feed renders; password reset via mocked mail (Mailpit); image fullscreen + swipe; article expand; save persists across reload; invite gating blocks uninvited sign-up; public `/i/[itemId]` renders read-only.
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

**Open:**
- **Curator calibration drift** — the persona prompt encodes Ben's taste secondhand; scores skew 7–9. Spot-check against hand labels periodically; `PROMPT_VERSION` bump re-scores the corpus for ~$1.
- **Visual embeddings keep-or-cut** — image vectors find *form/vibe* where text finds *subject* (Phase 0.5 experiment, vectors + blind harness ready). If kept: a "more like this look" save-affordance, not a feed tier. *Judge in the blind harness.*
- **Favorites-prompt onboarding** — the build-time LLM taste-profile mode (`--favorites`) is prototyped but unjudged with real input; decide whether it ships in 5.2's onboarding alongside the taste picker.
- **Topic-graph refresh cadence** — recompute on corpus growth is manual; decide when (per-ingest? monthly?) and whether weak-row hand edits persist across recomputes.
- **Tier-mix defaults under real use** — CORE 40/DRIFT 35/JUMP 25 reflects one evening of browsing; revisit once the app has weeks of actual use (knobs stay in behind the dev flag for exactly this).
- **Source-API drift** — ~8 external APIs to keep healthy (ongoing maintenance tax); museum image servers bot-block third-party fetchers (pass bytes, never URLs — bitten twice in Phase 0.5).
- **Article extraction** — clean lede/full-text across heterogeneous sources.
