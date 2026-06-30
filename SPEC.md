# Ambit — Technical Specification

> Build-ready spec for Ambit. Distilled from the shaped Idea-Forge idea + project plan via the Idea Forge "Spec" stage. This is the foundation a coding agent uses to scaffold and build v1. Living doc — update as decisions land.

## 1. Overview

**Ambit** is a calm, non-social **anti-doomscroll** PWA: an endless feed of genuinely interesting images and short text — pulled from public-domain knowledge, art, and literature APIs — loosely tuned to the user's interests, for staring at while you wait.

**Problem.** The "something to do while waiting" reflex defaults to social media, engineered to agitate. Ambit keeps the same idle-scroll ergonomics but swaps the payload for a calm, enriching one. The magic is **serendipity**: deliberate cross-domain jumps ("you liked internal-combustion engines → here are 1960s Grand Prix photos").

**Scale & posture.** Personal / friends. **Invite-only. No monetization. No social features.**

### Core features

- Magic-link auth, invite-gated.
- Onboarding: a grid of ~20–40 broad topic chips.
- Infinite vertical feed mixing image + article cards.
  - Images: tap → fullscreen; swipe left/right through a fullscreen gallery.
  - Articles: headline + lede; double-tap / long-press expands full text inline.
- Save + share on any item.
- Embeddings-led, cross-source relatedness engine driving a weighted-random feed.

### Tech

- **Next.js (App Router)** + **Bun** (runtime + package manager), **TypeScript**, configured as a **PWA**.
- **tRPC** for the type-safe API, **TanStack Query** under the hood.
- **TailwindCSS** for styling.
- **Drizzle ORM** over **Postgres + pgvector**.
- **NextAuth / Auth.js** — email magic-link, invite-gated.
- **Vitest** (unit) + **Playwright** (e2e).

## 2. Architecture

### 2.1 High-level

- **Frontend & API:** one Next.js app (App Router). Server components for data fetching/SSR; client components for the interactive feed and galleries; **tRPC** route handler at `app/api/trpc/[trpc]/route.ts` for the typed API.
- **Ingestion (background):** scheduled jobs fetch from source APIs, normalize to the common item schema, compute embeddings, and upsert into Postgres. Runs as a Bun script (cron-triggered), decoupled from request handling.
- **Datastore:** Postgres + pgvector — both the item cache and the vector index.
- **Runtime:** Bun for dev and production.

### 2.2 Application layers

**Presentation** — Next.js pages/components, Tailwind, the feed + fullscreen gallery + expandable-article components.

**API** — tRPC routers (`feed`, `items`, `topics`, `saves`, `auth`-adjacent). Type-safe end to end.

**Domain / services** —
- `services/sources/*` — one adapter per source API → common `Item` shape.
- `services/embeddings.ts` — embed `title + summary` into a vector.
- `services/feed.ts` — the weighted-random + nearest-neighbor feed algorithm.

**Data access** — Drizzle schema + repository helpers (`server/db/*`). All user-scoped queries filter by `userId`.

## 3. Functional requirements

### 3.1 Authentication
- Invited users sign in via **email magic link**. No passwords.
- Invite-gated: an email must have a valid `invite` to receive a link.
- Auth state available on server (SSR / protected routes) and client (UI).
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
- **Cost** — target ~$0–15/mo (free public-domain APIs; self-hosted Postgres+pgvector; local or cheap embeddings).
- **UX** — calm, minimal, distraction-free; mobile-first; installable PWA.

## 5. Data model & database schema (Postgres + pgvector, via Drizzle)

> Auth tables (`users`, `accounts`, `sessions`, `verificationTokens`) follow the **NextAuth/Auth.js Drizzle adapter** standard schema and are omitted here — generate them from the adapter. Below are the app tables.

### 5.1 `item`
The normalized feed unit and the vector index.

```sql
CREATE TABLE item (
  id            TEXT PRIMARY KEY,           -- nanoid
  source        TEXT NOT NULL,              -- 'wikipedia' | 'met' | 'aic' | ...
  source_id     TEXT NOT NULL,              -- id within that source
  type          TEXT NOT NULL,              -- 'image' | 'article'
  title         TEXT NOT NULL,
  summary       TEXT,                       -- lede / synopsis
  body          TEXT,                       -- full article text (nullable; articles only)
  image_url     TEXT,                       -- nullable; images / illustrated articles
  source_url    TEXT NOT NULL,              -- canonical link back to source
  attribution   TEXT,                       -- required by some sources
  license       TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',-- native source tags (secondary signal)
  embedding     VECTOR(384),                -- pgvector; dim matches chosen model
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
```

| Field | Notes |
|---|---|
| `embedding` | pgvector column; dimensionality must match the embedding model (384 shown for a small local model — adjust if managed). |
| `tags` | native categories (Wikipedia categories, Met department/medium/culture, …); secondary relevance signal, not the primary engine. |
| `(source, source_id)` | unique → ingestion upserts idempotently. |

### 5.2 `topic`
```sql
CREATE TABLE topic (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,               -- chip label
  seed_queries JSONB NOT NULL               -- per-source query config
);
```

### 5.3 `user_topic`
```sql
CREATE TABLE user_topic (
  user_id  TEXT NOT NULL REFERENCES users(id),
  topic_id TEXT NOT NULL REFERENCES topic(id),
  weight   REAL NOT NULL DEFAULT 1.0,       -- adjusted as the feed learns
  PRIMARY KEY (user_id, topic_id)
);
```

### 5.4 `saved_item`
```sql
CREATE TABLE saved_item (
  user_id  TEXT NOT NULL REFERENCES users(id),
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
CREATE INDEX idx_item_tags_gin    ON item USING GIN (tags);
CREATE INDEX idx_item_embedding   ON item USING hnsw (embedding vector_cosine_ops); -- ANN
CREATE INDEX idx_saved_item_user  ON saved_item(user_id);
```

## 6. Backend — ingestion, embeddings, repositories

### 6.1 Source adapters — `server/services/sources/`
One module per source. Each exports a uniform interface:

```typescript
export interface SourceAdapter {
  source: SourceId;                                 // 'wikipedia' | 'met' | ...
  search(query: string, opts?: FetchOpts): Promise<RawSourceResult[]>;
  toItem(raw: RawSourceResult): NormalizedItem;     // → common schema (no embedding yet)
}
```

- Implement in phases (Wikipedia + Met + one more first; remaining in Phase 4).
- Respect each source's rate limits + attribution/licensing. Responses are cached by upserting into `item`.

### 6.2 Embeddings — `server/services/embeddings.ts`
```typescript
export function embed(text: string): Promise<number[]>; // title + "\n" + summary
```
- **Provider — OPEN, decided in Phase 0.** OpenRouter (Ben's AI gateway) has limited embeddings support, so this is a per-project call. Candidates: a **local model** (`bge-small-en-v1.5` / `all-MiniLM-L6-v2`, ~384-dim, ~$0) vs. **OpenAI `text-embedding-3-small`** (managed, cheap). The `VECTOR(n)` dim in §5.1 must match the chosen model.

### 6.3 Repositories — `server/db/`
- `schema.ts` — Drizzle schema (the tables above + Auth.js adapter tables).
- `client.ts` — Drizzle client over Postgres (singleton).
- `items.ts` — `upsertItem`, `getItemById`, `nearestNeighbors(embedding, { limit, excludeIds })`.
- `feed.ts` — `getFeedPage(userId, cursor)` (composes §9).
- `saves.ts` — `saveItem`, `unsaveItem`, `getSavedItems(userId)`.
- `topics.ts` — `listTopics`, `setUserTopics(userId, topicIds)`.

All user-scoped queries filter by `userId`.

### 6.4 Ingestion job — `scripts/ingest.ts`
- Bun script, cron-triggered. For each active topic's seed queries → run adapters → normalize → embed → `upsertItem`.
- Idempotent via the `(source, source_id)` unique constraint.

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
- `/` — landing + "sign in" CTA (magic link).
- `/onboarding` — topic-chip grid (first sign-in; redirect here until topics chosen).
- `/feed` — the infinite feed (auth-gated, default authenticated landing).
- `/saved` — saved items.
- `/i/[itemId]` — public read-only single item.
- `app/api/trpc/[trpc]/route.ts`, `app/api/auth/[...nextauth]/route.ts`.

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

## 9. Feed & relatedness engine (the core)

This is where the product lives — keep it as simple as possible while preserving the cross-domain magic.

1. **Candidate pull.** For the user's weighted topics, gather recent `item` rows matching topic seed associations.
2. **Relatedness expansion.** For a sample of the user's recently-saved items, run `nearestNeighbors(savedEmbedding, …)` **across sources** (pgvector cosine, ANN/HNSW) to pull semantically related items from *other* domains — the serendipity injection.
3. **Weighted-random merge.** Interleave (1) and (2) with a tunable randomness floor so the feed is never purely deterministic. De-duplicate against items already shown (tracked via cursor).
4. **Card shaping.** Map each `item` to an `ImageCard` or `ArticleCard` payload.

> Tags are a cheap secondary signal (filter/boost), never the primary driver — the embedding nearest-neighbor jump *is* the feature.

## 10. Styling (Tailwind)
- Minimal, calm, high-contrast-on-neutral; content-forward (chrome recedes).
- `@tailwindcss/typography` (`prose`) for expanded article text.
- Mobile-first; large tap targets; smooth fullscreen/swipe transitions.

## 11. Security considerations
- **Auth enforcement** — `/feed`, `/saved`, `/onboarding` check session server-side; all tRPC mutations + user-scoped queries use `protectedProcedure`.
- **Authorization** — every `saved_item` / `user_topic` query filters by `userId`.
- **Invite gating** — magic links only issued to emails with a valid `invite`.
- **Public surface** — only `items.byId` / `/i/[itemId]` are public, and items are public-domain content with no user data.
- **Source content** — sanitize/normalize external HTML; render article text through trusted rendering, never raw `dangerouslySetInnerHTML` on unsanitized source data.
- **Rate limiting** — basic per-user/IP limits on tRPC endpoints.

## 12. Testing strategy
Production-grade from the start (portfolio / work-transferable practice — non-negotiable).
- **Vitest (unit):** each source adapter's `toItem` normalization; embedding helper; the feed merge/weighting logic; repository query builders.
- **Playwright (e2e):** sign-in via magic link (mocked mail) → onboarding → feed renders; image fullscreen + swipe; article expand; save persists across reload; invite gating blocks uninvited emails; public `/i/[itemId]` renders read-only.
- Aim for strong coverage on adapters + the feed algorithm (highest-value, highest-risk).

## 13. Deployment
- Invite-only (Ben + friends) → shareable tier with a persistent backend + Postgres/pgvector + ingestion pipeline (awkward on pure serverless).
- **Target: self-host via [Coolify](https://coolify.io)** on a small VPS or the homelab — git-push deploys of the Next.js app + self-hosted Postgres+pgvector; cron-scheduled ingestion job; zero vendor lock-in; fits the ~$0–15/mo budget. (Vercel free tier is a fallback only if a serverless split proves simpler.)
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
0. **Phase 0 (throwaway) — validate the magic.** Script: pull 2–3 sources, embed, eyeball cross-source nearest-neighbors. Settles the two risks (serendipity *feels* good vs. random; free-API content density) and picks the embedding model before any real build.
1. Scaffold: `create-t3-app` (Next App Router + tRPC + Tailwind + Drizzle + NextAuth), Bun, PWA config. Install pinned package versions manually.
2. DB: Drizzle schema (§5) + Auth.js adapter tables; Postgres + pgvector; migrations.
3. Auth: magic-link + invite gating.
4. Source adapters (Wikipedia + Met + one more) → normalization → `item` upsert.
5. Embeddings + `nearestNeighbors`; the ingestion job.
6. Feed engine (§9) + `feed.page`.
7. Feed UI: infinite scroll, fullscreen swipe gallery, article expand, save/share.
8. Onboarding topic chips + `user_topic`; feed learns from saves.
9. Remaining source adapters; polish; deploy via Coolify; invite friends.

## 15. Open questions / risks
- **Serendipity quality** — cross-domain jumps must feel inspired, not noisy. *Validate in Phase 0.*
- **Content density / variety** from the free APIs. *Validate in Phase 0.*
- **Embedding model** — local vs. managed (§6.2); fixes the `VECTOR(n)` dim. *Decide in Phase 0.*
- **Source-API drift** — ~8 external APIs to keep healthy (ongoing maintenance tax).
- **Article extraction** — clean lede/full-text across heterogeneous sources.
