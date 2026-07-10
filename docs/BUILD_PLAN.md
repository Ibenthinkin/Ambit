# Ambit — Build Plan (Phase 0 → MVP → Polish)

> **Living execution tracker.** Check a step's box only when its "Done =" line is satisfied. Decision gates are marked ⚖️ — resolve them in the step where they appear and record the outcome in `SPEC.md`.

## Context

Ambit is a calm, anti-doomscroll PWA: an infinite feed of public-domain images/articles with embeddings-led cross-source serendipity. This plan takes the repo from pre-code (spec + design handoff only) through Phase 0 validation, MVP, deploy, and polish. Execution is driven session by session; each numbered step is sized for roughly one working session.

**Decisions already made:** magic-link mail = **Mailpit in dev, Resend in prod**; dev DB = **local Docker Compose (pgvector image)**; embeddings provider = **OpenRouter** (model still open, see 0.3/0.4); this file is the execution tracker.

Steps within a phase are ordered; phases 3–5 can partially interleave (noted).

---

## Phase 0 — Validate the magic (throwaway code)

*Settles the two existential risks — does cross-source serendipity feel good, and is free-API density sufficient — and picks the embedding model. Code lives in `phase0/`, excluded from the future app; keep it in git for the record.*

- [x] **0.1 — Commit this plan + repo tidy.** Commit this plan as `docs/BUILD_PLAN.md`. Move `Ambit/LICENSE` (stray MIT license in a subdirectory) to repo root, update README "License: TBD" → MIT. Fill `.env.example` with all vars the plan will introduce (`DATABASE_URL`, `RESEND_API_KEY`, `NEXTAUTH_SECRET`, `OPENROUTER_API_KEY`).
  *Done = plan committed, license at root, `.env.example` complete.*

- [x] **0.2 — Sample harvester.** Bun script `phase0/harvest.ts`: fetch ~300–600 raw items from **Wikipedia + Met + Art Institute of Chicago** across ~8 topic seeds spanning the onboarding chip range (e.g., Astronomy, Botany, Machines, Mythology, The ocean, Typography, Ancient history, Poetry). Normalize to a minimal `{source, sourceId, type, title, summary, imageUrl, sourceUrl, tags}` shape, dump to `phase0/items.json`. Note per-source density/quality observations in `phase0/NOTES.md`.
  *Done = items.json with all 3 sources represented; density notes written.*

- [x] **0.3 — Embed: 2 models × 2 recipes.** `phase0/embed.ts`, all via **OpenRouter** (`POST /api/v1/embeddings`, batched array `input`, `OPENROUTER_API_KEY`). Models: `openai/text-embedding-3-small` (1536) and `baai/bge-m3` (1024). **Recipes** (keep summary construction swappable — 0.2 found this is the bigger lever): **A** = `title + "\n" + summary` as harvested; **B** = subject-first, leading with `title + tags` before the catalogue fields, so museum items aren't dominated by medium/department. → **4 vector sets**. Also probe whether OpenRouter honors OpenAI's `dimensions` param (undocumented; decides if 1536 can be shortened).
  *Done = four embedding files; `dimensions` support answered; rough timing/cost noted.*

- [ ] **0.4 — Eyeball harness + verdicts.** `phase0/explore.html` (or CLI): pick an item → show its top-N nearest neighbors **restricted to other sources**, as 4 side-by-side columns (model × recipe) plus a random-baseline column. Spend real time browsing. ⚖️ **Decide:** (1) serendipity feels good vs random — go/no-go; (2) model + recipe + `VECTOR(n)` dim; (3) any density red flags. Watch specifically for neighbors clustering on **medium** ("all the bronzes") rather than **subject** — if so, recipe B should fix it; blame the model only after the recipe. Record all three in `SPEC.md` §6.2/§15 and `phase0/NOTES.md`.
  *Done = three decisions recorded in SPEC; Phase 0 marked complete in README status.*

---

## Phase 1 — Scaffold & tooling

- [ ] **1.1 — Scaffold the app.** `create-t3-app` (Next.js App Router + tRPC + Tailwind + Drizzle + NextAuth) with Bun as runtime + package manager; TypeScript strict. Pin versions. Wire `package.json` scripts per SPEC §13 (`--bun` flag). Verify `bun run dev` serves the starter.
  *Done = starter app runs under Bun; committed.*

- [ ] **1.2 — Quality tooling + CI.** Vitest (unit) + Playwright (e2e, installed but minimal) + lint/format (ESLint + Prettier, or Biome — pick one and note it). GitHub Actions: typecheck, lint, unit tests, build on push. Add a `bun run check` meta-script.
  *Done = CI green on main; one placeholder unit + e2e test pass.*

- [ ] **1.3 — PWA shell.** ⚖️ **Decide:** `@serwist/next` (maintained successor) vs `@ducanh2912/next-pwa`. Web app manifest (name, theme `#161411`, icons — generate from the ring-and-dot logo in the design handoff), service worker with offline app shell. Installability verified via Lighthouse.
  *Done = Lighthouse flags app as installable; manifest + SW committed.*

---

## Phase 2 — Database & auth

- [ ] **2.1 — Postgres + Drizzle schema.** `docker-compose.yml` with `pgvector/pgvector` image + Mailpit. Drizzle schema per SPEC §5 (`item`, `topic`, `user_topic`, `saved_item`, `invite`) + Auth.js adapter tables; `VECTOR(n)` from Phase 0 decision. Migrations via drizzle-kit; indexes incl. HNSW. Repository skeletons `server/db/{client,items,feed,saves,topics}.ts`.
  *Done = `docker compose up` + migrate from clean state works; schema matches SPEC §5.*

- [ ] **2.2 — Magic-link auth + invite gating.** Auth.js email provider → Mailpit (dev) / Resend (prod, env-switched). `signIn` callback rejects emails without a pending/accepted `invite` row; accepting flips status. `bun run invite <email>` admin script. Session available server + client; middleware redirects unauthenticated users off `/feed`, `/saved`, `/onboarding`.
  *Done = full loop works locally: invite → magic link lands in Mailpit → click → session; uninvited email politely refused.*

- [ ] **2.3 — Topic seed data.** Define the 32 onboarding topics (labels from the design handoff §2) in a checked-in config with per-source seed queries (`topic.seed_queries` JSONB); seed script upserts them. Start with seed queries for the three Phase-3 sources only; extend in 6.2.
  *Done = `topic` table seeded; labels match design handoff exactly.*

---

## Phase 3 — Source adapters, embeddings, ingestion

*3.x and 4.x are backend-only and can interleave with Phase 5 UI work if you want variety.*

- [ ] **3.1 — Adapter contract + Wikipedia.** `NormalizedItem` type + `SourceAdapter` interface (SPEC §6.1) in `server/services/sources/types.ts`. Wikipedia adapter (REST summary/search APIs): `search()` + `toItem()` with lede extraction, image when available, category tags, attribution/license fields. Vitest coverage on `toItem` with recorded fixture JSON (pattern: fixtures in `__fixtures__/`, no live calls in tests).
  *Done = adapter returns clean `NormalizedItem`s live; unit tests pass on fixtures.*

- [ ] **3.2 — Met + AIC adapters.** Same pattern, reusing Phase 0 findings (endpoints, quirks). Met: objects endpoint, public-domain filter, department/medium/culture → tags. AIC: `/artworks/search` with IIIF image URL construction. Fixture-based tests each.
  *Done = both adapters live-verified + tested; three total sources.*

- [ ] **3.3 — Embeddings service + nearest neighbors.** `server/services/embeddings.ts`: the Phase-0 model behind a single `embed(text)` seam, calling **OpenRouter** with a batched array `input` (ingestion embeds in batches, never one call per item) — model id in env so a same-dimension swap needs no code change. Export the winning recipe as `buildEmbeddingText(item)` so the string fed to the model is defined in exactly one place. `nearestNeighbors(embedding, {limit, excludeIds})` in `server/db/items.ts` using pgvector cosine + HNSW. Unit test the query builder + `buildEmbeddingText`; integration-test against the dev DB with a tiny seeded set.
  *Done = `embed()` + `nearestNeighbors()` work end-to-end against dev DB.*

- [ ] **3.4 — Ingestion job.** `scripts/ingest.ts`: for each topic × seed query × adapter → fetch, normalize, embed, `upsertItem` (idempotent on `(source, source_id)`). Per-source rate-limit throttling, per-source failure isolation (one source down ≠ job dead), structured log summary (fetched/upserted/skipped/errored per source). Run it to populate the dev DB (~1–2k items).
  *Done = two consecutive runs: first populates, second is a no-op upsert; dev DB has all 3 sources across all topics.*

---

## Phase 4 — Feed engine & API

- [ ] **4.1 — Feed algorithm.** `server/services/feed.ts` per SPEC §9: (1) candidate pull from weighted topics, (2) serendipity expansion via `nearestNeighbors` on recent saves *across sources*, (3) weighted-random merge with a tunable randomness floor + de-dup against seen items, (4) card shaping. Opaque cursor encodes pagination position + RNG seed (stable pages on refetch). **This is the highest-value test target** — unit-test merge weighting, dedup, cursor round-trip, cold-start (no saves yet), and source-mix distribution.
  *Done = `getFeedPage()` returns sensibly mixed pages; test suite covers the cases above.*

- [ ] **4.2 — tRPC surface.** Routers per SPEC §7: `topics.list`, `topics.setMine`, `feed.page`, `items.byId` (the only public procedure), `saves.toggle`, `saves.list`. `protectedProcedure` reads session, throws `UNAUTHORIZED`. Basic per-user/IP rate limiting middleware. All user-scoped queries filter by `userId`.
  *Done = all procedures callable; auth enforcement verified (unauth'd `feed.page` fails, `items.byId` succeeds).*

---

## Phase 5 — UI (the design handoff made real)

*Order: tokens first, then screens in user-journey order. The handoff README (`docs/design_handoff_ambit_pwa/README.md`) has exact tokens, motion timings, and per-screen interaction specs — treat it as the source of truth; the `.dc.html` prototypes are the visual reference. Recreate, don't port.*

- [ ] **5.1 — Design system foundation.** Tailwind theme from the handoff tokens: warm-dark palette (`#161411` bg etc.), the 4-accent system (gold default) as CSS vars — one `accent` theme knob app-wide. Newsreader (400/500/600 + italics) via `next/font` + system sans. SVG icon set recreated from the prototypes (bookmark, share, close, arrows, envelope, diamond, ring-and-dot logo). Shared primitives: pill button/chip, card, toast, bottom sheet (26px top radius, slide-up motion), rise-in animation utility.
  *Done = a `/dev/tokens` scratch page renders every primitive in all 4 accents matching the handoff.*

- [ ] **5.2 — Landing / sign-in.** `/` per handoff §1: hero, drifting blurred accent orbs, email form → sending → "check your inbox" states, inline validation, wired to real Auth.js magic-link flow.
  *Done = visually matches `screenshots/01-landing.png`; real sign-in works through it.*

- [ ] **5.3 — Onboarding.** `/onboarding` per handoff §2: 32-chip grid, pop animation on select, sticky CTA ("Pick N more" → "Start exploring", `minPicks=3`), persists via `topics.setMine`, redirect-until-onboarded logic.
  *Done = new user lands here, picks chips, arrives at a feed seeded from them.*

- [ ] **5.4 — Feed screen.** `/feed` per handoff §3: glass sticky header, `useInfiniteQuery` on `feed.page` with IntersectionObserver sentinel + "finding something interesting…" loader, ImageCard + ArticleCard, serendipity connective rows ("{From} → {To}"), movement-guarded taps (≤12px tolerance), save/share (Web Share API with clipboard-toast fallback), article hold-~480ms-or-double-tap expand with progress bar, quick fullscreen preview, `?focus=` return-scroll.
  *Done = smooth infinite scroll of real DB content; every handoff §3 interaction works on a phone.*

- [ ] **5.5 — Fullscreen gallery.** Per handoff §4: three-slide translateX rail, swipe paging over the feed's image set, chrome auto-cycle (10s in/10s out), details bottom sheet with drag-close/side-swipe-cycle, hard-swipe-up + two-finger-swipe + X to return with `?focus=`, save/share.
  *Done = gesture set works on iOS Safari; entry/exit deep-linking with the feed correct.*

- [ ] **5.6 — Saved screen.** `/saved` per handoff §5: 2-col grid (articles full-width), All/Images/Reading segmented filter with live counts, unsave + toast, empty state, tiles open the gallery.
  *Done = saves from feed/gallery appear, filter, unsave, persist across reload.*

- [ ] **5.7 — Public item page.** `/i/[itemId]` per handoff §6: no-auth read-only item, "shared by" row, "where Ambit would wander next" teaser (2 real nearest-neighbor rows), invite CTA. OG meta tags so shared links unfurl nicely.
  *Done = incognito visit renders item + teaser; OG preview correct; no user data leaks.*

- [ ] **5.8 — Install prompt + PWA polish.** Per handoff §7: collapsed banner → instruction sheet → confirmation, using real `beforeinstallprompt` where available and manual iOS-Safari instructions otherwise; dismissal persistence. Offline shell + cached last feed page.
  *Done = installable on iOS + Android; reopening offline shows shell + last cached feed.*

---

## Phase 6 — Learning loop & remaining sources

- [ ] **6.1 — Feed learns from saves.** Saves adjust `user_topic.weight` / inferred related topics (SPEC §3.3b) while retaining the randomness floor. Extend feed tests: a burst of saves in one domain measurably (but not overwhelmingly) shifts composition.
  *Done = weight adjustment covered by tests; feed visibly adapts without collapsing into a filter bubble.*

- [ ] **6.2 — Remaining v1 adapters (batched).** Same adapter+fixture pattern for: **Smithsonian Open Access** (key), **NASA APOD** (key), **Wikiquote**, **Project Gutenberg/Wikisource**, **Public Domain Review** (check API/RSS reality — may need scraping-lite or cutting; ⚖️ decide when reached). Extend topic seed queries to all sources; re-run ingestion; eyeball feed mix.
  *Done = 7–8 live sources; ingestion healthy; per-source items visible in feed.*

---

## Phase 7 — Hardening, e2e, performance

- [ ] **7.1 — Playwright e2e suite.** SPEC §12 flows: magic-link sign-in (Mailpit API to fetch the link) → onboarding → feed renders; image fullscreen + swipe; article expand; save persists across reload; invite gating blocks uninvited email; public `/i/[itemId]` renders read-only. Wire into CI (compose services in the workflow).
  *Done = suite green locally and in CI.*

- [ ] **7.2 — Security pass.** Sanitize all source-derived HTML/text at ingestion (never raw `dangerouslySetInnerHTML`); authz audit — every `saved_item`/`user_topic` query filters `userId`; rate limits verified; security headers (CSP tuned for image sources); no private data on the public surface.
  *Done = checklist in SPEC §11 walked and each line verified.*

- [ ] **7.3 — Performance + images.** ⚖️ **Decide image strategy:** hotlink source URLs vs proxy/cache through the app (`next/image` remote patterns vs a caching route). Consider museum-API etiquette + broken-link rot (favor light proxy-with-cache if cheap). Lazy-load images, prefetch next feed page, feed response <300ms (add missing indexes if not), Lighthouse pass on mobile.
  *Done = feed p50 <300ms locally; Lighthouse perf reasonable on throttled mobile; image decision recorded in SPEC.*

---

## Phase 8 — Deploy & beta

- [ ] **8.1 — Coolify deployment.** App + Postgres(pgvector) on VPS/homelab via Coolify; git-push deploys; env vars (Resend key, DB URL, auth secret); domain + HTTPS; Coolify cron (or system cron) for `bun run ingest`; automated Postgres backups.
  *Done = production URL live; magic link arrives via Resend; ingestion cron ran at least once unattended.*

- [ ] **8.2 — Ops guardrails + beta invites.** Minimal error visibility (server log drain or self-hosted Sentry/GlitchTip), uptime ping, ingestion-failure notification (even just email-on-error). Invite Ben + first friends; collect impressions for a week; triage into Phase 9.
  *Done = friends actively using it; feedback list captured in the repo.*

---

## Phase 9 — Polish & finishing backlog

*Unordered; pull based on beta feedback. Each is roughly a session.*

- [ ] **9.1 — Motion-fidelity pass.** Audit every screen against handoff timings (rise-ins, chip pop, sheet cubic-bezier, toast, gallery chrome cycle); fix drift.
- [ ] **9.2 — Accent picker.** Settings surface to choose among the 4 accents (per-user persistence) — the design's single brand knob, currently default-only.
- [ ] **9.3 — Accessibility pass.** Focus states, reduced-motion variants for every animation, contrast check on muted-opacity text, screen-reader labels on icon buttons, gesture alternatives (buttons for swipe-only actions).
- [ ] **9.4 — Attribution & licensing UI.** Per-item attribution/license display meeting each source's terms (gallery details sheet + item page).
- [ ] **9.5 — Empty/error/edge states.** Feed exhaustion, source outage degradation, slow-network skeletons, broken-image fallback, dead-link pruning during ingestion.
- [ ] **9.6 — Source trials from the backlog.** Run `docs/source-candidates.md` trial loop; suggested first: Cleveland Museum (CC0, no key) and PoetryDB (pure-text serendipity). Also organize the raw candidate list at the bottom of that file into the table. One or two per session, eyeball cross-source jumps, Keep/Park/Cut.
- [ ] **9.7 — Feed tuning pass.** Expose algorithm knobs (randomness floor, serendipity ratio, image:article mix) as config; tune by feel with beta feedback.
- [ ] **9.8 — Saved-items offline + export.** Cache saved items (incl. images) for offline; simple JSON/Markdown export.
- [ ] **9.9 — Invite management.** Tiny admin page (or CLI polish) for issuing/revoking invites, seeing signups.
- [ ] **9.10 — Digest niceties (optional).** E.g., "your week in Ambit" saved-items recap email via Resend — only if it stays calm and opt-in.

---

## Open decision gates (recap)

| Gate | Step | Options |
|---|---|---|
| Serendipity go/no-go + embedding model + recipe + vector dim | 0.4 | via OpenRouter: `openai/text-embedding-3-small` (1536) vs `baai/bge-m3` (1024) × recipe A/B |
| PWA library | 1.3 | `@serwist/next` vs `@ducanh2912/next-pwa` |
| Public Domain Review feasibility | 6.2 | API/RSS adapter vs cut from v1 |
| Image delivery | 7.3 | hotlink vs proxy-with-cache |

## Verification approach

- **Per step:** each step's "Done =" line is its acceptance test; don't check a box without it.
- **Backend:** Vitest on adapters (`toItem` fixtures), feed algorithm (weighting/dedup/cursor), repo query builders; integration tests against the compose DB.
- **Flows:** Playwright e2e per 7.1, in CI from that point on.
- **By hand at every UI step:** real phone (iOS Safari especially — the gesture system lives or dies there) against the handoff screenshots.
- **Continuous:** CI (typecheck, lint, unit, build) green from step 1.2 onward; two-consecutive-run idempotency check whenever ingestion changes.

## Suggested session cadence

Phases 0–2 sequential. Phases 3–4 (backend) and 5 (UI) can interleave once 2.1 is done — e.g., alternate a backend step and a screen. First shippable moment: after 5.4 + 4.2 you can scroll a real feed; MVP = end of Phase 8; everything in Phase 9 is post-beta polish.
