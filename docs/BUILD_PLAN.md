# Ambit — Build Plan (Phase 0 → MVP → Polish)

> **Living execution tracker.** Check a step's box only when its "Done =" line is satisfied. Decision gates are marked ⚖️ — resolve them in the step where they appear and record the outcome in `SPEC.md`.

## Context

Ambit is a calm, anti-doomscroll PWA: an infinite feed of public-domain images/articles with embeddings-led cross-source serendipity. This plan takes the repo from pre-code (spec + design handoff only) through Phase 0 validation, MVP, deploy, and polish. Execution is driven session by session; each numbered step is sized for roughly one working session.

**Decisions already made:** auth = **Better Auth, email + password, invite-gated sign-up** (replaced the original Auth.js magic-link plan, 2026-07); transactional mail (password reset) = **Mailpit in dev, Resend in prod**; dev DB = **local Docker Compose, plain Postgres** (pgvector dropped with the 0.4 pivot); feed = **tiered topic drift over an LLM-curated pool** (0.4/0.5 — SPEC §9); offline embeddings for topic-graph tooling = **OpenRouter `text-embedding-3-small` × recipe A**; ingest curation = **cheap vision model via OpenRouter, images passed as bytes**; this file is the execution tracker.

Steps within a phase are ordered; phases 3–5 can partially interleave (noted).

---

## Phase 0 — Validate the magic (throwaway code)

*Settles the two existential risks — does cross-source serendipity feel good, and is free-API density sufficient — and picks the embedding model. Code lives in `phase0/`, excluded from the future app; keep it in git for the record.*

- [x] **0.1 — Commit this plan + repo tidy.** Commit this plan as `docs/BUILD_PLAN.md`. Move `Ambit/LICENSE` (stray MIT license in a subdirectory) to repo root, update README "License: TBD" → MIT. Fill `.env.example` with all vars the plan will introduce (`DATABASE_URL`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`). *(Originally shipped with `NEXTAUTH_SECRET`; renamed when the auth decision changed to Better Auth.)*
  *Done = plan committed, license at root, `.env.example` complete.*

- [x] **0.2 — Sample harvester.** Bun script `phase0/harvest.ts`: fetch ~300–600 raw items from **Wikipedia + Met + Art Institute of Chicago** across ~8 topic seeds spanning the onboarding chip range (e.g., Astronomy, Botany, Machines, Mythology, The ocean, Typography, Ancient history, Poetry). Normalize to a minimal `{source, sourceId, type, title, summary, imageUrl, sourceUrl, tags}` shape, dump to `phase0/items.json`. Note per-source density/quality observations in `phase0/NOTES.md`.
  *Done = items.json with all 3 sources represented; density notes written.*

- [x] **0.3 — Embed: 2 models × 2 recipes.** `phase0/embed.ts`, all via **OpenRouter** (`POST /api/v1/embeddings`, batched array `input`, `OPENROUTER_API_KEY`). Models: `openai/text-embedding-3-small` (1536) and `baai/bge-m3` (1024). **Recipes** (keep summary construction swappable — 0.2 found this is the bigger lever): **A** = `title + "\n" + summary` as harvested; **B** = subject-first, leading with `title + tags` before the catalogue fields, so museum items aren't dominated by medium/department. → **4 vector sets**. Also probe whether OpenRouter honors OpenAI's `dimensions` param (undocumented; decides if 1536 can be shortened).
  *Done = four embedding files; `dimensions` support answered; rough timing/cost noted.*

- [x] **0.4 — Eyeball harness + verdicts.** `phase0/explore.html` (or CLI): pick an item → show its top-N nearest neighbors **restricted to other sources**, as 4 side-by-side columns (model × recipe) plus a random-baseline column. Spend real time browsing. ⚖️ **Decide:** (1) serendipity feels good vs random — go/no-go; (2) model + recipe + `VECTOR(n)` dim; (3) any density red flags. Watch specifically for neighbors clustering on **medium** ("all the bronzes") rather than **subject** — if so, recipe B should fix it; blame the model only after the recipe. Record all three in `SPEC.md` §6.2/§15 and `phase0/NOTES.md`.
  *Outcome (07-13-26): verdict was **NO on item-level NN** — all four sets indistinguishable and over-clustered; corpus boilerplate + top-k's anti-serendipity nature explain it (see log.md). Pivot: embeddings move up a level to a 16×16 **topic-drift graph** (`phase0/topic-graph.ts`), item choice becomes curated-random. The SPEC/README recording moved into 0.5's gate, where the replacement design gets validated first.*

- [x] **0.5 — The Feel Gate: curation + feed prototype.** The 0.4 pivot needs its own validation before Phase 1: does a **tiered topic feed over a curated pool** feel like "a drift through the good wing of the museum"? (North star re-clarified 07-13-26 — old-Tumblr curated-but-never-repeating; anti-example: xikipedia's structureless random. See log.md.)
  - [x] Structural quality floor + dedupe: `phase0/curate.ts` stage 1 (dup-titles >2, bare-noun image titles, thin summaries) → `items.curated.json` + survival report. First run: 3,168 → 2,639, losses concentrated in Met/Textiles+Machines as 0.4 predicted.
  - [x] Two new sources on trial in `harvest.ts` (per `docs/source-candidates.md` loop): **Cleveland Museum of Art** (CC0, no key, prose descriptions!) + **Wellcome Collection** (open-license filter + per-item check, IIIF thumbs resize trap noted). Quota 75 → 150/source/topic.
  - [x] LLM curation pass: `curate.ts` stage 2 — cheap vision model scores every survivor 1–10 ("would a great Tumblr art-blog curator post this?") + 2–4 aesthetic tags; judged from the downloaded image (base64 — museum servers bot-block provider fetchers). Full corpus: 8,093 items, 12.4M tokens ≈ $1.25, spot-checks read true (Great Wave 10, journal stubs 1–2). *Prompt calibration against Ben-labeled items stays an ongoing item (SPEC §15) — scores skew 7–9 but rank correctly.*
  - [x] Visual-embeddings experiment: `phase0/embed-images.ts` via **Voyage `voyage-multimodal-3.5`** — 5,931 vectors in 35 min, free tier. (First attempt in URL mode crawled for hours: AIC bot-blocks Voyage's fetcher — rewritten to base64 + checkpoint/resume; rule recorded in NOTES.) explore.html now has the visual column, blind-shuffled with the text columns. *The keep-or-cut judgment joins the ⚖️ gate below: early look says text NN = subject, visual NN = form/vibe.*
  - [x] Feed-feel prototype: `phase0/build-feed.ts` + `feed.template.html` → `feed.html`. CORE/DRIFT/JUMP over the topic graph (drift = softmax over positive-sim bridges only; jump = bottom-half draw), curation-weighted item picks, source-adjacency + topic-cap diversity rules, seen-tracking, save-to-reweight loop with visible feedback, debug overlay, live knobs. Two cold-start modes (taste picker / topic chips) + optional third (`--favorites "…"` → LLM taste profile).
  - [x] Recompute `topic-graph.json` on the curated 5-source corpus. *Outcome: **zero weak rows** (was 3 — Music, Portraiture, Architecture all healed by curation + corpus scale; best-neighbour sims 0.06–0.35, bridges intellectually real). Hand-curation demoted from "required fix" to an at-gate review of the rows with Ben.*
  - [x] ⚖️ **The gate: PASSED (07-13-26).** Ben: "definitely on the right track… what I enjoy the most is the higher further drift." Consequences: default tier mix shifted drift-heavy (CORE 40 / DRIFT 35 / JUMP 25; second-hop chance 0.5); debug overlay + tuning knobs stay in through all of development. Doc sweep done in one commit (SPEC, CLAUDE.md, README, source-candidates verdicts, log.md, system-map artifact). Still open, tracked in SPEC §15: visual-embeddings keep-or-cut (blind harness ready), curator calibration, `--favorites` with real input.
  *Done = gate passed and every 0.4/0.5 decision recorded in SPEC; Phase 0 closed in README.* ✅ **Phase 0 complete — next: 1.1 scaffold.**

---

## Phase 1 — Scaffold & tooling

*Detailed execution plan (incl. 07-17-26 docs-research findings on create-t3-app, Serwist/Turbopack, and Bun-as-runtime caveats): [`docs/PHASE1_PLAN.md`](PHASE1_PLAN.md).*

- [x] **1.1 — Scaffold the app.** `create-t3-app` (Next.js App Router + tRPC + Tailwind + Drizzle; **decline its NextAuth option** — create-t3-app doesn't offer Better Auth yet, so auth is added by hand in 2.2) with Bun as runtime + package manager; TypeScript strict. Pin versions. Wire `package.json` scripts per SPEC §13 (`--bun` flag). Verify `bun run dev` serves the starter.
  *Done = starter app runs under Bun; committed.* ✅ Scaffolded on Next 16.2.12 (upgraded from the template's 15.2.3 via `@next/codemod`) + Tailwind v4 + ESLint 9.39.5 (10.x breaks on `eslint-plugin-react`'s ESLint-10 incompatibility). `bun run dev`/`build` verified under the real `--bun` runtime, no Node fallback needed. Homepage originally 500'd without a real Postgres (a clean `TRPCError`, not a bundler regression) — the DB-backed demo call was trimmed in 1.2 so Phase 1 stays fully DB-free.

- [x] **1.2 — Quality tooling + CI.** Vitest (unit) + Playwright (e2e, installed but minimal) + lint/format (⚖️ **settled 07-17-26: ESLint + Prettier** — the t3 default, zero swap-out; Biome's React/Next rule coverage still has gaps). GitHub Actions: typecheck, lint, unit tests, build on push. Add a `bun run check` meta-script.
  *Done = CI green on main; one placeholder unit + e2e test pass.* ✅ Vitest unit-tests a real `cn()` helper (clsx + tailwind-merge); Playwright smoke-tests the home page (no console errors) — trimmed the t3 boilerplate's DB-backed `getLatest` demo off the homepage so the smoke test passes without Postgres, keeping Phase 1 DB-free. `bun run check` = typecheck → lint → format check → unit tests. GitHub Actions (`.github/workflows/ci.yml`) runs check + build on push/PR; e2e stays local-only until Phase 7.1 adds compose Postgres to CI. [PR #1](https://github.com/Ibenthinkin/Ambit/pull/1), green on main.

- [x] **1.3 — PWA shell.** ⚖️ **Settled 07-17-26: `@serwist/next`** (`@ducanh2912/next-pwa` is deprecated and points at Serwist; note Serwist needs webpack — SW disabled under Turbopack dev, verified on prod builds). Web app manifest (name, theme `#161411`, icons — generate from the ring-and-dot logo in the design handoff), service worker with offline app shell. Installability verified via Lighthouse.
  *Done = Lighthouse flags app as installable; manifest + SW committed.* ✅ **Revised at build time: `@serwist/next` → `@serwist/turbopack`** — Serwist shipped native Turbopack support (a Route Handler-based SW, `src/app/serwist/[path]/route.ts`, instead of a webpack build step) since the 07-17 gate, closing the exact dev/prod split that settled it on `@serwist/next`; works identically in `next dev` and `next build` now. Manifest (`src/app/manifest.ts`) + icons (192/512 + maskable, rendered from the design handoff's ring-and-dot mark onto its icon-tile gradient) + SW (`src/app/sw.ts`) + offline fallback (`src/app/~offline`) all committed. **Installability verified via Chrome's own `beforeinstallprompt` signal, not Lighthouse** — Lighthouse fully removed its PWA/installable-manifest audits as of v13 (`--list-all-audits` returns none), so the original verification method no longer exists. [PR #2](https://github.com/Ibenthinkin/Ambit/pull/2), green on main. **Phase 1 complete.**

---

## Phase 2 — Database & auth

*Detailed execution plan (incl. 07-17-26 docs-research findings on Better Auth 1.6.x patterns, Bun-specific traps, drizzle-kit workflow, and the Mailer setup): [`docs/PHASE2_PLAN.md`](PHASE2_PLAN.md).*

- [x] **2.1 — Postgres + Drizzle schema.** `docker-compose.yml` with plain `postgres` image + Mailpit (pgvector dropped with the 0.4 pivot — no vector column anywhere in §5). Drizzle schema per SPEC §5 (`item` incl. `curation_score`/`aesthetic_tags`/`topic_id`, `topic`, `user_topic`, `saved_item`, `invite`) + Better Auth core tables (`user`, `session`, `account`, `verification` — generate with `npx auth@latest generate`, then own them in `schema.ts`). Migrations via drizzle-kit; indexes per §5.6 (note `idx_item_topic_score` — the feed's draw path). Repository skeletons `server/db/{client,items,feed,saves,topics}.ts`. Check in `server/config/topic-graph.json` (from `phase0/topic-graph.ts`).
  *Done = `docker compose up` + migrate from clean state works; schema matches SPEC §5.* ✅ Paired session, 07-29-26 (walkthrough: `docs/PHASE2_WALKTHROUGH_2.1.md`). **Revised at build time:** no `ambit_` table prefix — SPEC's own SQL is unprefixed and this compose Postgres never shares an instance with other apps, so `tablesFilter` was dropped along with the prefix. All 9 tables (5 app + 4 Better-Auth-generated) migrated and verified live via `psql \dt`.

- [x] **2.2 — Email + password auth (Better Auth) + invite gating.** Better Auth with `emailAndPassword: { enabled: true }`, Drizzle adapter (`provider: "pg"`), catch-all route `app/api/auth/[...all]/route.ts` via `toNextJsHandler`. Invite gating in `databaseHooks.user.create.before`: throw `APIError` unless the email has a pending/accepted `invite` row; accepting flips status. Password reset via `emailAndPassword.sendResetPassword` → Mailpit (dev) / Resend (prod, env-switched); skip `requireEmailVerification` (the invite list is the trust anchor). `bun run invite <email>` admin script. Session (database-backed) available server (`auth.api.getSession({ headers })`) + client (`better-auth/react`); middleware redirects unauthenticated users off `/feed`, `/saved`, `/onboarding`.
  *Done = full loop works locally: invite → sign-up with password → session; uninvited sign-up politely refused; forgot-password mail lands in Mailpit and resets successfully.* ✅ Planned in one session (08-06-26), executed unattended in a follow-up per Ben's plan-then-execute-cheaper workflow — walkthrough: `docs/PHASE2_WALKTHROUGH_2.2.md`. **Revised at build time:** `middleware.ts` → **`src/proxy.ts`** (Next 16 renamed Middleware to Proxy; `middleware.ts` still works but is deprecated in 16.2 — confirmed the file convention and that `:path*` matches the bare parent path via current docs before writing it). Also bumped `drizzle-orm` 0.41.0 → 0.45.2 / `drizzle-kit` 0.30.6 → 0.31.10 first, to satisfy better-auth 1.6.25's drizzle-adapter peer range (schema round-tripped with zero diff). Full HTTP-level verification (curl against `/api/auth/*`, Mailpit's API for the reset link) since no UI exists until Phase 5.2.

- [x] **2.3 — Topic seed data.** ⚖️ **Settled 07-17-26: v1 seeds the 16 graph-validated topics, not the handoff's 32 chips** — DRIFT/JUMP need a graph row per topic; expand toward 32 in Phase 6 when new harvests land and the graph is recomputed. Labels per the mapping in `PHASE2_PLAN.md` step 3 (Cartography → "Maps"; Portraiture/Zoology keep their names). Checked-in config with per-source seed queries (`topic.seed_queries` JSONB) ported from `phase0/harvest.ts` for **all five v1 sources** (supersedes the earlier "three sources first" note — adapters come online per phase); seed script upserts them idempotently.
  *Done = `topic` table seeded with 16 rows; labels match the PHASE2_PLAN mapping.* ✅ Planned and executed 08-06-26 (walkthrough: `docs/PHASE2_WALKTHROUGH_2.3.md`). `src/server/config/topics.ts` + `scripts/seed-topics.ts` (`bun run db:seed`) + `src/server/config/topics.test.ts` locking the topic-id ↔ topic-graph-key contract. No migration needed — `seed_queries` already shipped in migration 0000. **Revised at build time:** Phase 0's `NOTES.md` warning to "budget real time for seed-query tuning" turned out to be **mostly a false alarm** — of the six weak topic×source cells, four (all AIC) were an artifact of `phase0/harvest.ts`'s last-topic-wins dedupe, not bad queries, and two more (Textiles/Met, Ceramics/Met) were the curation floor. Only **four cells were genuinely query problems** (Typography/Met+CMA+AIC, Astronomy/CMA, Cartography/CMA), each retuned against live-measured hit counts. The dedupe finding is recorded as a **Phase 3.4 open question** in SPEC §15 — real ingestion faces the same collision. **Phase 2 complete.**

---

## Phase 3 — Source adapters, curation, ingestion

*3.x and 4.x are backend-only and can interleave with Phase 5 UI work if you want variety.*

- [x] **3.1 — Adapter contract + Wikipedia.** `NormalizedItem` type + `SourceAdapter` interface (SPEC §6.1) in `server/services/sources/types.ts`. Wikipedia adapter (REST summary/search APIs): `search()` + `toItem()` with lede extraction, image when available, category tags, attribution/license fields. Vitest coverage on `toItem` with recorded fixture JSON (pattern: fixtures in `__fixtures__/`, no live calls in tests).
  *Done = adapter returns clean `NormalizedItem`s live; unit tests pass on fixtures.* ✅ Planned + executed 08-07-26 (`docs/PHASE3_PLAN.md`, walkthrough `docs/PHASE3_WALKTHROUGH_3.1.md`). Adapter does 3 request shapes per article: batched intro-extract search (20 pages/call, `cllimit=max` — a per-page not per-query budget, per Phase 0), batched `imageinfo` license resolution (≤10 titles/call), and a per-article full-body fetch (whole-article extracts cap at 1 page/request — new finding, not in Phase 0's throwaway harvester, since it never fetched bodies). `scripts/probe-adapter.ts` added as the live-verification CLI reused by every later adapter task. 33 unit tests, 20 live-verified against real API responses across two topics.

- [x] **3.2 — Met + AIC adapters.** Same pattern, reusing Phase 0 findings (endpoints, quirks). Met: objects endpoint, public-domain filter, department/medium/culture → tags. AIC: `/artworks/search` with IIIF image URL construction. Fixture-based tests each.
  *Done = both adapters live-verified + tested; three total sources.* ✅ Planned + executed 08-07-26 (`docs/PHASE3_PLAN.md`, walkthrough `docs/PHASE3_WALKTHROUGH_3.2.md`). **Revised at build time: "three total sources" superseded** — all five v1 adapters land in Phase 3 (decided during 3.1's planning; `topics.ts` already assumed five). Met's `isPublicDomain=true` search filter re-confirmed lying live (found real fixture examples of PD-claimed objects that fail their own record check); AIC's `is_public_domain` field can be entirely absent, not just `false` — both re-check paths tested. 11 new unit tests (44 total), both adapters live-verified.
- [x] **3.2b — CMA + Wellcome adapters.** (Added when 3.1 settled all five sources land in Phase 3, not staggered to Phase 6.) Same pattern: CMA's friendliest-API shape (full records in search, explicit `cc0` flag, prose `description`) and Wellcome's per-item license heterogeneity + thumbnail-size rewrite. Fixture-based tests each; `sources/index.ts` completes the five-adapter registry.
  *Done = both adapters live-verified + tested; all five v1 sources have adapters.* ✅ Planned + executed 08-07-26 (`docs/PHASE3_PLAN.md`, walkthrough `docs/PHASE3_WALKTHROUGH_3.2b.md`). **Two new findings beyond the plan:** CMA's `description` field carries raw HTML (`<em>`/`<br>`) not documented anywhere — added `stripHtml()` to `normalize.ts` (CLAUDE.md: never render unsanitized source HTML). Wellcome's thumbnail-size rewrite was extended beyond the ported phase0 regex: a live URL-shape survey found the plain-width form (`300,`, no `!`) is about as common as the bracket form (47/80 vs 33/80 across four searches) and — unlike AIC — Wellcome's IIIF server honors a wider plain-width request cleanly (live-verified via `curl`, confirmed a genuinely larger file), so both shapes now rewrite to `!800,800` instead of only the bracket one. `src/server/services/sources/index.ts` completes the five-adapter registry; `scripts/probe-adapter.ts` now imports it directly. 20 new unit tests (64 total), both adapters live-verified. **All five v1 source adapters shipped — Phase 3.1/3.2/3.2b done.**

- [x] **3.3 — Curation service.** `server/services/curator.ts`, ported from `phase0/curate.ts` (SPEC §6.2): structural quality floor + LLM curator (persona prompt as a versioned constant; response cache keyed item×model×`PROMPT_VERSION`; images downloaded and passed as base64 — museum servers bot-block provider-side fetchers, see NOTES). `drawFromTopic(topicId, {scoreFloor, excludeIds, limit})` in `server/db/items.ts` (weighted random by curation score). Unit test the floor rules + response parsing + draw-weight math; integration-test against the dev DB with a tiny seeded set.
  *Done = curator scores a live 40-item batch sanely, cache verified reusable; drawFromTopic's score-floor/exclude/limit/rng-determinism/score-skew all integration-tested against real Postgres.* ✅ Planned + executed 08-07-26 (`docs/PHASE3_PLAN.md`, walkthrough `docs/PHASE3_WALKTHROUGH_3.3.md`). **Two build-time findings beyond the plan, both infrastructure, not curation logic:** (1) Vitest doesn't resolve the `~/*` tsconfig path alias on its own — the first test file to transitively reach `db/client.ts` (which reads `~/env`) failed to resolve at all; fixed with an explicit `resolve.alias` in `vitest.config.ts`. (2) Vitest's `bin` shebangs to plain Node, so `bun run test` doesn't get Bun's automatic `.env` loading the way `bun run dev` does — `drawFromTopic`'s integration tests silently self-skipped (correctly, by design) rather than actually running locally; fixed by loading `.env` once in `vitest.config.ts` via `process.loadEnvFile()`, wrapped so it's a no-op in CI (no `.env` there at all). `drawFromTopic` also imports its DB client *dynamically*, inside the function body rather than at module scope — otherwise merely importing `items.ts` for the pure `drawWeight` tests would trigger `~/env`'s Zod validation and crash `bun run test` in CI, which sets no env vars at all for that step (only the later `bun run build` step does, per `.github/workflows/ci.yml`). Verified by running the full suite with a stripped (`env -i`) environment: 85 passed, 5 correctly skipped.
  *Done = floor rules + curator scoring verified against a small seeded set in the dev DB; `drawFromTopic` returns weighted-random picks above the score floor. (Line rewritten 07-17-26 — previously referenced the pre-pivot `embed()`/`nearestNeighbors()` design.)*

- [x] **3.4 — Ingestion job.** `scripts/ingest.ts`: for each topic × seed query × adapter → fetch, normalize, **quality floor → LLM curation score** (no embedding step — cut with the 0.4 pivot, per §6.4), `upsertItem` (idempotent on `(source, source_id)`). Per-source rate-limit throttling, per-source failure isolation (one source down ≠ job dead), structured log summary (searched/offered/errors/collisions per source, floor/curated/inserted totals, per-topic inserted counts). Collision resolution (`server/services/ingest-plan.ts`'s `resolveCollisions`) settles SPEC §15's open question: highest-search-rank wins, ties → alphabetically-smallest topic id, order-independent by construction. Ran to populate the dev DB.
  *Done = ✅ Planned + executed 08-07-26 (`docs/PHASE3_PLAN.md`, walkthrough `docs/PHASE3_WALKTHROUGH_3.4.md`). Two consecutive runs at `--quota 10` proved the pipeline never duplicates or re-scores an existing item (DB counts incremented exactly, `upsertItem` integration-tested to preserve id/topicId/curationScore/aestheticTags on conflict) — dev DB has all five sources across all sixteen topics, no starved topics (astronomy healthy, vs. phase0's pathological 4/419). **One build-time finding beyond the plan:** immediate re-runs aren't a strict zero-insert no-op the way the plan predicted — Wikipedia's (and to a lesser extent Wellcome's) live search API returns a slightly different result set for the identical query across separate calls (confirmed via a direct back-to-back probe), so a re-run can surface a small, convergent trickle of genuinely new items near the query's rank cutoff (622 → +37 → +19 across three `--quota 10` runs) rather than exactly zero — recorded in SPEC §15 as a live-API characteristic, not a correctness bug. Full populate (`bun run ingest`, quota 150) run to build the real dev corpus — see the walkthrough for final counts. **Phase 3 complete.**

---

## Phase 4 — Feed engine & API

- [x] **4.1 — Feed algorithm.** `server/services/feed.ts` per SPEC §9 (port the composition from `phase0/feed.html`, the reference implementation): (1) per-slot tier draw (CORE 40 / DRIFT 35 / JUMP 25), (2) topic pick — CORE = weighted draw over `user_topic`; DRIFT = graph walk, softmax over positive-sim neighbours only, second hop p≈0.5; JUMP = uniform from the row's bottom half, (3) item pick — curated-weighted random over unseen items above the score floor (never similarity), under diversity constraints (no adjacent same-source; per-page topic cap), (4) card shaping. Opaque cursor encodes pagination position + RNG seed (stable pages on refetch); debug overlay + tuning knobs behind the dev flag. **This is the highest-value test target** — unit-test tier-mix distribution, drift-walk fallbacks (no positive bridge → CORE), diversity-constraint relaxation, seen exclusion, cursor round-trip, and cold start.
  *Done =* ✅ Planned + executed 08-08-26, walkthrough `docs/PHASE4_WALKTHROUGH_4.1.md`. `getFeedPage()` returns sensibly mixed pages against the populated dev DB (`bun run probe:feed --uniform --pages 6`: tier mix converged to 38/39/24 against a 40/35/25 target, all 16 topics represented, zero source-adjacency violations). New `seen_item` table (SPEC §5.4b) + a constant-size `{v, seed, page, anchor, prev[]}` cursor (SPEC §7) — `prev` plus a strict `served_at < anchor` filter together exclude a user's whole seen history without the cursor ever growing. `services/random.ts` (`hashSeed`/`mulberry32`/`weightedPick`) is the deterministic-RNG seam every test hangs off; `services/feed.ts`'s `pickCore`/`pickDrift`/`pickJump`/`composePage` are pure and DB-free, taking injected `{weights, graph, pools, rng, knobs}`, with `getFeedPage` as the thin async shell that fetches pools (batched once, for every topic reachable within two graph hops of the user's own topics — not the prototype's per-slot lazy fetch) and marks items seen at serve time. 32 new unit tests + 5 new integration tests (130 total, all green); `bun run check` clean.

- [x] **4.2 — tRPC surface.** Routers per SPEC §7: `topics.list`, `topics.setMine`, `feed.page`, `items.byId` (the only public procedure), `saves.toggle`, `saves.list`. `protectedProcedure` reads session, throws `UNAUTHORIZED`. Basic per-user/IP rate limiting middleware. All user-scoped queries filter by `userId`.
  *Done =* ✅ Planned + executed 08-08-26, walkthrough `docs/PHASE4_WALKTHROUGH_4.2.md`. All six SPEC §7 procedures callable; auth enforcement verified — `caller.feed.page` (and every other protected procedure) throws `UNAUTHORIZED` on a null session, `items.byId` resolves regardless of session, confirmed both by 22 new unit/integration tests and by a manual `curl` transcript against `bun run dev`: `items.byId` without a cookie → 404 `NOT_FOUND` (never 401), `feed.page` without a cookie → 401 `UNAUTHORIZED`, `feed.page` with a real session cookie (via the 2.2 sign-up flow) → 200 with 12 cards spanning all three tiers. `createTRPCContext` calls `auth.api.getSession()` (dynamic import, same CI-has-no-env-vars pattern every `db/*.ts` repo already uses); `RateLimiter` (`server/services/rate-limit.ts`) is a pure, unit-tested, injected-clock sliding-window limiter (120 req/min/key, single-instance-in-memory, keyed on the session user id else the *last* trusted `X-Forwarded-For` hop — not the spoofable first one). `db/topics.ts` (`setUserTopics`, transactional: drops deselected topics, inserts new ones at weight 1, `onConflictDoNothing` preserves a retained topic's learned weight) and `db/saves.ts` (`saveItem`/`unsaveItem`/`isItemSaved`/`getSavedItems`) are real. The t3 starter's `post` router and its homepage demo call are gone. 34 new tests (rate-limit.ts 12, routers.test.ts 13, routers.integration.test.ts 9) — 164 total, all green; `bun run check` clean.

---

## Phase 5 — UI (the design handoff made real)

*Order: tokens first, then screens in user-journey order — with one forced deviation: item pages (5.7) land before the gallery (5.8) because the redesigned feed's taps navigate to them.*

*Source of truth (since 08-16-26): the **redesign handoff** — `docs/design_handoff_ambit_pwa_redesign/README.md` for tokens, motion timings, and per-screen specs, with the convention that **the `.dc.html` prototypes win over the README where they conflict** (the README's Feed section predates `Ambit - Feed Masonry 3.dc.html`; verify each screen against its prototype at plan time). The bundle's `PROGRESS.md` describes an earlier design session (Newsreader/gold) and is superseded by the README. Recreate, don't port. Steps 5.1–5.3 below were built against the old handoff (`docs/design_handoff_ambit_pwa/`) and their Done-notes are kept verbatim as history; 5.4 migrates them to the new design language. Decisions taken at re-baseline (recorded in `PHASE5_PLAN_5.4.md`): keep email+password auth (no magic link — restyle only), build the collections backend (5.5), minimal-viable Profile/Settings with **sign-out living in Settings**, feed taps open item pages (prototype wins), masonry heights via fixed literal-class rotation (no image dimensions in the DB), and the bundle's `uploads/*.webp` are licensing-uncleared — production imagery is limited to the 8 Wikimedia PD works or Ben-cleared images until resolved.*

- [x] **5.1 — Design system foundation.** Tailwind theme from the handoff tokens: warm-dark palette (`#161411` bg etc.), the 4-accent system (gold default) as CSS vars — one `accent` theme knob app-wide. Newsreader (400/500/600 + italics) via `next/font` + system sans. SVG icon set recreated from the prototypes (bookmark, share, close, arrows, envelope, diamond, ring-and-dot logo). Shared primitives: pill button/chip, card, toast, bottom sheet (26px top radius, slide-up motion), rise-in animation utility.
  *Done =* ✅ Planned + executed 08-10-26, walkthrough `docs/PHASE5_WALKTHROUGH_5.1.md`. Tokens
  ported into `src/styles/globals.css` as Tailwind v4 `@theme`/`@theme inline` (no config file —
  v4 is CSS-first); the one-off prototype alphas collapsed to a single `--color-ink` token plus a
  12-row normalized alpha ladder (recorded in SPEC §10). Accent is a runtime `[data-accent]`
  attribute on `<html>` resolving through `@theme inline` — verified live in a running `bun run
  dev` server via Chrome DevTools MCP: toggling the accent switcher on `/dev/tokens` recolors
  every primitive with no rebuild. Newsreader loads via `next/font/google` (`weight` omitted,
  `axes: ['opsz']`); Geist is gone. 11 icons (`src/components/icons/`) and 11 primitives
  (`src/components/ui/`) built per the plan's exact interfaces, all through the existing `cn()` —
  no `class-variance-authority` added. `/dev/tokens` (dev-only — `notFound()` when
  `NODE_ENV=production`, confirmed both ways: real content under `bun run dev`, a genuine
  `__next_error__` 404 shell in a `bun run build` output) renders every token/icon/primitive with
  the 4-way switcher. First UI test layer: `@testing-library/react` + jsdom, opted into per file
  via `// @vitest-environment jsdom`, the 172 existing server tests staying on the `"node"`
  default. 21 new component tests (button 4, chip 3, segmented 3, toast 5, bottom-sheet 4, rise 2)
  — 193 total, all green; `bun run check` and `bun run build` (CI's placeholder-env invocation)
  both clean.

- [x] **5.2 — Landing / sign-in.** `/` per handoff §1 **plus its divergence note** (prototype shows the old magic-link flow): hero, drifting blurred accent orbs, then sign-in (email + password), first-time sign-up for invited emails, and forgot-password states — same card/input/button visual language as the prototype, inline validation, wired to real Better Auth flows.
  *Done =* ✅ Planned 08-11-26, executed 08-12-26, walkthrough `docs/PHASE5_WALKTHROUGH_5.2.md`.
  Mode-toggle `AuthCard` (not email-first) covers sign-in/sign-up/forgot/forgot-sent, wired to real
  `signIn.email`/`signUp.email`/`requestPasswordReset`; `/reset-password` handles both the valid-
  and expired-token query shapes; a throwaway `/feed` placeholder makes the loop walkable until
  5.4. The plan's own checkpoints caught two real bugs invisible from reading the code: a missing
  post-sign-in `router.push("/feed")` (the server-side redirect only fires on a fresh load), and
  `authClient.$ERROR_CODES` resolving to `{}` at runtime (its backing endpoint 404s here) — fixed
  by reading the real error codes off a running server instead, exactly as the plan warned to.
  Also found and fixed, in passing: `cn()`'s plain `twMerge` didn't know about the custom
  `border-hairline` utility and was silently dropping it app-wide (misclassified as a border-color
  competing with `border-ink/NN`) — a Phase 5.1 regression across most primitives, root-caused and
  fixed at the shared `cn()` helper. `bun run check` (207 tests) and `bun run build` (CI's
  placeholder env; `/`, `/feed`, `/reset-password` all confirmed dynamic, not prerendered) both
  green; `bun run e2e` (7 local-only tests) green, including a full Mailpit-scraped reset round
  trip.

- [x] **5.3 — Onboarding.** `/onboarding` per handoff §2: 16-chip grid (not the handoff's 32 — the v1 topic-drift graph only covers sixteen topics; corrected here, this line predates that divergence), pop animation on select, sticky CTA ("Pick N more" → "Start exploring", `minPicks=3`), persists via `topics.setMine`, redirect-until-onboarded logic.
  *Done =* ✅ Planned 08-12-26, executed 08-12-26, walkthrough `docs/PHASE5_WALKTHROUGH_5.3.md`.
  `OnboardingScreen` (`src/components/onboarding/`) is the app's first client-side tRPC consumer
  (`api.topics.setMine.useMutation()`) — every prior client component talked to Better Auth's
  client directly. New `hasCompletedOnboarding(userId)` repo helper backs both directions of the
  guard: `/onboarding` redirects an already-onboarded user to `/feed`, and `/feed`'s placeholder
  (carrying forward into 5.4) redirects a not-yet-onboarded user to `/onboarding`. Chip/Button
  primitives and the sticky-CTA gradient (`bg-linear-to-t from-bg from-62% to-bg/0`, Tailwind v4
  syntax) needed no rework — both were built in 5.1 anticipating this exact screen. `bun run check`
  (217 tests, up from 207) and `bun run build` (CI's placeholder env; `/onboarding` and `/feed`
  both confirmed dynamic) both green; `bun run e2e` (7 local-only tests, including the updated
  sign-up → onboarding → feed loop) green.

- [x] **5.4 — Design-system migration + restyle of built screens.** Migrate the token layer to the redesign (`PHASE5_PLAN_5.4.md`): Sora replaces Newsreader+system-sans (`--font-serif` dies), accent set becomes indigo `#4C5FE0` default + amber/green/red (`data-accent` names renamed), `--color-ink-hi` title tier, sheet radius 26→22, new sheet ease `cubic-bezier(.22,.9,.3,1)` (old 103%/settle animation renamed `--animate-sheet-gallery` for the gallery details modal), `--shadow-toolbar`, avatar-gradient utility (registered in twMerge like `border-hairline`), `prefers-reduced-motion` support. Restyle `/`, `/reset-password`, `/onboarding`, `/dev/tokens` (near-total rewrite), `/~offline` (finally on-palette) — **no flow or layout changes**; auth/onboarding tests pass unmodified as the regression signal.
  *Done =* ✅ Planned + executed 08-16-26, walkthrough `docs/PHASE5_WALKTHROUGH_5.4.md`. Sora
  replaces Newsreader + the system stack (`--font-serif` deleted app-wide); accent set replaced and
  renamed to indigo (default) / amber / green / red; new `--color-ink-hi` title tier above the
  untouched 5.1 alpha ladder; sheet radius 26→22, new `--shadow-toolbar`, and the sheet animation
  **split in two** — the original 400ms/103% curve renamed `--animate-sheet-gallery` and reserved
  for 5.8's details modal, with `--animate-sheet-up` rebuilt as the redesign's 260ms `sheetup`
  (BottomSheet picked it up with no component change). New `.bg-avatar-gradient` utility,
  registered in tailwind-merge's `bg-image` group — the exact trap `border-hairline` fell into in
  5.1 — and `utils.test.ts` gained regression cases for both (the `border-hairline` one had never
  actually been written). `Chip` lost its `serif` prop; `Logo` is now the redesign's exact mark
  spec; icon strokes audited against the handoff's 1.7–2px band (`Bookmark` deliberately keeps 1.3
  on its bespoke 13×16 grid). Landing/onboarding/reset got a typography-and-color pass with every
  string and test id untouched, `/~offline` finally came onto the palette, and `/dev/tokens` was
  rewritten as the new living style guide (including a side-by-side replay of the two sheet
  curves). 219 tests green; `bun run build` clean with all four routes still dynamic; **all 7 e2e
  green unmodified** — the phase's regression signal. Two false alarms and one pre-existing flaky
  server test (`feed.test.ts`'s unseeded tier-ratio assertion) are documented in the walkthrough.

- [x] **5.5 — Shared backbone + collections backend.** The redesign's two backbone components + the data model the save sheet needs — planned in `PHASE5_PLAN_5.5.md` (08-16-26), which carries four decisions taken with Ben: **one collection per item** (picking another row *moves* it), `saves.toggle` **removed** (verified dead — nothing in `src/` or `e2e/` calls it, not even the `/feed` placeholder), share targets all via `navigator.share` with a toast fallback, and the Save-image row **deferred to 5.7** with the image proxy it needs. Backend: `collection` table (`id,userId,name,createdAt`, unique `(userId,name)`), nullable `collectionId` FK on `saved_item`, lazy per-user seeding of Articles/Art/Photos, `saves` router evolves (`saveToCollection` / `collections`-with-counts / `unsave` / `list({collectionId?})`), drizzle migration, SPEC §5/§6.3/§7 updated. UI: `PillToolbar` (glass pill, profile/mark/bookmark/share, `pointer-events` wrapper pattern, active bookmark states), `BottomSheet` v2 (centered title slot, exit animation — the null-when-closed test assertion changes here; drag-to-close turns out to belong to 5.8, not here), **two** collection sheets rather than one — `SaveToCollectionSheet` (item in context: accent dot + "Already saved here", picking saves) and `CollectionsSheet` (feed pill, no item: "Everything kept" + counts + "New collection · Make one on your profile", picking navigates) — plus `ShareSheet` (copy-link + `navigator.share` targets), `usePress` hook (≤12px slop tap + 450ms long-press, iOS-safe), avatar chip. Collection *creation* is not here: the prototypes put it on Profile (5.10). All demoed live on `/dev/tokens` against the real router.
  *Done = migration applied; router integration tests green; pill + both sheets work end-to-end on `/dev/tokens` on a real phone.*
  *Status =* ✅ **Done.** Code complete 08-16-26; the on-device pass (folded into 5.6's) passed
  08-20-26 — the pill's `pointer-events` wrapper does not eat scrolls that start low on the
  screen, and the sheet exit animation plays. Walkthrough
  `docs/PHASE5_WALKTHROUGH_5.5.md`. Migration `0002_quick_whizzer` applied; 268 tests green (was
  219), including 19 router tests against real Postgres — the cross-user authorization case among
  them (saving into another user's collection is `NOT_FOUND`, and nothing lands in theirs).
  `bun run build` clean, `bun run e2e` 7/7. Five deviations from the plan, all recorded in the
  walkthrough: `saves.count` added as a real procedure (the alternative fetched every item record
  to produce a number), seeded collections get staggered `created_at` (Postgres' `now()` is
  transaction start time, so one insert left `ORDER BY created_at` a three-way tie), `onSaved`
  reports the collection id as well as its name, `Bookmark` already had its `filled` variant from
  5.4, and the share targets needed explicit `aria-label`s. Two findings worth carrying into 5.8's
  much heavier animation work: **jsdom implements no `AnimationEvent`**, so React never delivers
  `onAnimationEnd` there and animated components must listen natively to be testable; and the
  sheet's exit state has to be adjusted **during render**, not in an effect, or the close flickers.
  **Still open: the real-phone pass** — the `pointer-events` wrapper, the 12px slop guard and the
  sheet exit animation all pass in a desktop browser while being wrong on iOS, which is exactly why
  this step's Done bar names a device. It was blocked on the dev-origin issue (fixed 08-17 via
  `allowedDevOrigins`) and is now folded into **5.6's** device pass, which covers both phases'
  gestures in one sitting.

- [x] **5.6 — Feed masonry.** `/feed` proper per the `Feed Masonry 3` prototype (placeholder dies; sign-out moves to `/dev/tokens` until 5.10, e2e updated). RSC `prefetchInfinite`/`HydrateClient` (first-ever consumer — the server prefetch input must byte-match the client `useInfiniteQuery` input) + IntersectionObserver sentinel; `/feed` stays dynamic. Two independent flex columns in a `1fr 1fr` gap-4 grid, greedy shortest-column placement with estimated heights, fixed rotation of literal height classes, square-cornered full-bleed image tiles; article cards + serendipity "BECAUSE" rows from `driftPath`; tap → item page, long-press → item sheet ("Closer look" + save-to-collection); `data-feed-id` + `?focus=` return-scroll. Reuses `PHASE5_PLAN_5.4_FEED_OLD_DESIGN.md`'s backend-contract/RSC research wholesale. Planned in `PHASE5_PLAN_5.6.md` (08-17-26), which carries two decisions taken with Ben — **Because tiles: at most one per page, on the page's first JUMP with `driftPath ≥ 2`**, copy "you've been exploring {from}" / "{to}" in accent — plus three settled at plan time: the feed pill has **3 items, no share** (`PillToolbar.onShare` goes optional; prototype wins, and share-on-feed has no referent), the height rotation uses literal **aspect-ratio** classes (the prototype's 8 ratios; scales on wider phones where fixed px would distort), and a minimal `/i/[itemId]` **stub ships in 5.6** so taps navigate for real. 5.5's still-open device pass folds into this phase's Done bar.
  *Done = smooth infinite scroll of real DB content; taps/long-press correct on a phone (5.7 routes may be stubs until 5.7 lands — the pair ships back-to-back).*
  *Status =* ✅ **Done.** Code complete 08-17-26; **on-device pass passed 08-20-26**, carrying
  5.5's too — tap vs. long-press vs. scroll all correct on the phone, no iOS selection or callout
  on a long press, and `pt-[58px]` clears the status bar as-is (no safe-area value needed yet).
  Walkthrough `docs/PHASE5_WALKTHROUGH_5.6.md`. 328 tests green (was 288),
  `bun run e2e` **14/14** across three consecutive parallel runs, `bun run build` clean. The RSC
  hydration contract is verified empirically, not just by construction: a hard reload of `/feed`
  makes **zero** client `feed.page` requests, and each scroll to the bottom makes exactly one.
  Six deviations, all in the walkthrough; two are worth knowing here. **Article ledes are clamped
  to five lines** (with `masonry.ts`'s height estimate capped to match) — the prototype doesn't
  clamp because its fixture ledes are hand-written sentences, whereas the real `summary` column
  holds Wikipedia extracts of 600+ characters, which rendered as a twenty-five-line wall in a
  196px column. And **`?focus=` cannot work through a pushed Back link**: `/feed` is dynamic and
  `getFeedPage` never repeats items, so a fresh `<Link>` navigation lands on an entirely different
  feed — measured. (Fixed 08-20-26, once the device pass showed what it cost in practice: the
  stub's Back now *pops* history via `BackToFeed`, and only pushes `?focus=` for a cold-opened
  shared link. See log.md.) Browser *back* does preserve it (router cache) and restores scroll exactly,
  which is the evidence 5.7's back gesture should **pop history rather than push**. Two e2e bugs
  found that looked like flake and weren't: Playwright's default `test-results/` sits in the
  project root and its mid-run writes trigger Fast Refresh (fixed with a dot-directory
  `outputDir`), and the landing form **natively submits before hydration** — a GET to `/?` that
  silently discards the typed values. The latter is a real auth-screen defect, worked around in
  the tests (`e2e/support.ts`'s `waitForHydration`) and left for 5.2's owners rather than reached
  across for here.

- [x] **5.7 — Item pages.** `/i/[itemId]` on the public `items.byId` — image and reader variants by item type, shared-by row (param-driven), "where Ambit would wander next" (new procedure over the topic graph), join CTA for signed-out visitors, OG meta, horizontal swipe-back with rubber-band follow honoring `?focus=`. Reader body: decide at plan time between stored `summary`/`body` and a server-side cached Wikipedia extract (the prototype fetches client-side; its own README says move it server-side). Built to `PHASE5_PLAN_5.7.md`; see `PHASE5_WALKTHROUGH_5.7.md`.
  **Decisions locked at plan time:** reader body comes from the **stored `body`** (the adapter flips to `exsectionformat=wiki` so extracts keep their `== Section ==` markers, plus a one-off backfill of existing rows) — no runtime Wikipedia dependency; the **image proxy ships here**, not at 7.3, expected to lift the AIC suspension (it didn't — see below); signed-out visitors get **no pill toolbar** at all.
  **Decisions taken during the build:** the teaser renders on **both** variants (the prototype had it image-only; the Done bar is authoritative) with real links; the join CTA **drops** the prototype's "keep browsing without an account" link, which would dead-end at the auth-gated feed; the hero image **has no tap handler** until 5.8 wires the gallery behind it (5.8 did, 08-21-26, without touching the callout); the shared-by param is **`?from=`**, capped at 40 chars and never persisted; `BackToFeed` is gone, folded into a shared **`useLeaveToFeed`** used by both the swipe gesture and the pill's Feed button; wander-next **falls back to the item's own topic** when the graph offers nothing, so the teaser renders against a thin corpus.
  **Rode along, by prior decision:** seen-marking moved from render-time to **receipt** (`feed.markSeen`) — a render is not evidence of a reader, and the old behavior burned 1,116 items in six minutes; `drawFromTopic` gained the suspended-source filter `getTopicPools` already had.
  **AIC stays suspended.** The proxy works (Met/CMA/Wellcome verified streaming through it), but re-measuring at the end of the phase found `www.artic.edu` serving a Cloudflare **interactive JS challenge** (`cf-mitigated: challenge`) to every request from this network — homepage included, browser UA, no referer. That is a different mitigation from the referer rule the proxy was built to defeat, and one no server-side fetch can pass. `api.artic.edu` is still healthy, so leaving the source live would keep adding rows nobody can see. `HANDOFF_aic-images.md` §8 has the measurements and what would clear it.
  **Added 08-20-26 — the item page hosts the generalized credit line.** A `from: <source>` line sits near the title and links `sourceUrl`, **for every source**, not just blogs — museum and Wikipedia items get it too, which is why it ships here once rather than inside 6.3. Blog items (6.3) additionally show the article blurb and a **prominent** link out to the original. Explicitly **no reader-view work for blogs**: Ambit never reformats and hosts someone else's article. 9.4 remains the licensing audit and now covers this line's wording too.
  *Done = incognito visit renders both variants + teaser; OG preview correct; no user data leaks; swipe-back works on iOS.* First three verified by `e2e/item.spec.ts` (which runs signed-out by design); **the iOS device pass passed 08-20-26** — swipe-back follow and commit both good, back restores the feed from both the gesture and the pill, Save-image reaches the camera roll. Two findings from it, neither blocking: the Web Share API is **secure-context only**, so device passes now run behind `tailscale serve` HTTPS (see `src/config/dev-origins.js`); and iOS's native long-press on the hero offers **"Add to Photos"** in two taps, which is the best path a web app can have — **5.8 must not suppress the callout when it wires the gallery tap** — it didn't, and a test now pins both halves (no anchor around the hero image, no `-webkit-touch-callout` anywhere in its markup).

- [x] **5.8 — Immersive gallery.** The signature screen, planned in `PHASE5_PLAN_5.8.md` (08-21-26) and built to it. `/g/[itemId]` on `bg-immersive`: a three-cell rail, pointer-event swipe with a 20%-width threshold + `touch-action: none`, chrome hidden by default (600ms unit fade, 10s/10s auto-cycle, inert while hidden), a details sheet on `--animate-sheet-gallery` with drag-close + side-swipe-cycle, and hard-swipe-up / two-finger exits. Pill + both sheets embedded.

  **The pool source was re-decided 08-21-26** and this entry is corrected accordingly: the rail is **not** "the feed's image set" but a **wander rail** — a new *public* procedure (`items.galleryRail`) extending `services/wander.ts`'s machinery into an endless, bidirectional, images-only sequence seeded by the entry item. Public because the entry point is the hero on the public `/i/[itemId]` and the person tapping it may be a stranger; infinite by construction, which is what the prototype's 28-item wrap was imitating; and it **marks nothing seen**, so swiping never burns corpus. Fresh `feed.page` draws were rejected in writing: auth-only, and every swipe-through would have re-created the corpus-burn defect removed on 08-20.

  **Decisions locked with Ben at plan time:** entered from the **item hero and Saved only** — feed tiles keep opening item pages (the redesign README's gesture matrix lists Feed as an entry; the feed prototype's own `openItem()` does not, and prototypes beat the README, so 5.6's shipped tile behaviour is untouched and Saved's entry lands in 5.9). Own route, **not an overlay** — deep-linkable, and the exit is a real history pop rather than a hand-rolled entry; the URL does **not** change while swiping. **Sharing shares `/i/{currentId}`, never `/g/`**, so `/g/` gets minimal metadata + `robots: noindex`. **Exits**: the close gesture pops to the entry surface via a `gallery-origin` marker mirroring `feed-origin` (entry-agnostic — 5.9's Saved entry needs no change), pushing `/i/{entryId}` when cold-opened; the pill's Feed button does `history.go(-2)` when both origin markers line up, else `/feed?focus=`. **Hero tap is a slop-guarded pointer handler**, not a `<Link>` and not the feed tile's callout suppression — both would break the native "Add to Photos" bought on 08-20 (5.7's own warning). **No double-tap**: the README says double-tap → details, the prototype codes tap-again, prototypes win. **Facts table is schema-honest** — the prototype's Medium/Origin/Where-it-lives don't exist on `item`, so the rows are Maker / From / License / Topic, each omitted when null. `BottomSheet` grew `variant`, `dragToClose` and `onSwipeSide`, all additive.

  **The parked archive question, re-grounded and answered as a doorway.** There is no ambit-archive adapter in this repo — "archive items" are labelling support with no rows behind them — so the wish became `wildcardChance` (default **0.1**): the probability a rail slot ignores the topic walk and draws corpus-wide, preferring a `WILDCARD_SOURCES` list that is **empty today**. A tunable serendipity dial now, and archive items slot straight into it when that integration lands. Client overrides honored only under `FEED_DEBUG`, like `feed.page`'s knobs. Still **no new feed tier and no mechanics** in the feed itself.

  *Done = the full gesture matrix works on iOS Safari (no scroll bleed, no stuck chrome); entry/exit deep-linking correct.* Everything a browser can prove is verified by `e2e/gallery.spec.ts` (three consecutive green runs, 27 tests): cold-open signed-out, tap → chrome → tap-again → details, the article guard, the full feed→item→hero→gallery doorway with the pill's Feed button landing on the intact feed and zero draws in the request log, and a gallery session leaving `seen_item` untouched. **The iOS device pass passed 08-21-26** (over the `tailscale serve` HTTPS origin), and the regression it was watching for did not happen — the hero's long-press still offers "Add to Photos". It found one cluster worth the whole exercise: four gestures across three screens all felt "too hard" for three *shared* reasons — no velocity path on any threshold, an axis re-decided at release rather than locked at the slop, and iOS's `pointercancel` on a claimed multi-touch gesture discarding the two-finger exit at the moment it was recognised. All fixed on this branch (`917c18f`); see the walkthrough. Rail *feel* is deliberately left for a later pass — Ben's read is that it can't be judged honestly until the corpus spans more sources — and `wildcardChance` stays at its untuned 0.1 for the same reason.

- [ ] **5.9 — Saved + collections UI.** `/saved` per handoff: title + count line, horizontally scrolling collection chips with live counts (accent-filled active), the shared masonry from 5.6, unsave badge + toast, empty state, image tap → gallery, article tile → reader, pill bookmark filled-white. Share-collection scope needs a call at plan time (public `/c/{collection}` is not in current scope — degrade or defer). Pure UI over 5.5's backend. Also revisit Saved's reachability here (currently two hops from the feed — possibly intentional restraint).
  *Done = save-from-feed → appears-in-saved → unsave round trip in e2e; chip counts match router integration tests.*

- [ ] **5.10 — Profile + Settings (minimal viable).** `/profile`: name (Sora 600 28 `ink-hi`), avatar-gradient chip (no upload), collections grid from `saves.collections`, edit-name (tiny `user.updateName` procedure or Better Auth's built-in update), and **collection creation** (`createCollection` — deliberately not built in 5.5, since the design puts the affordance here and a procedure with no consumer is what deleting `saves.toggle` cleaned up). **If deletion ships with it**, 5.5's lazy seeding needs a companion change: it keys on "the user has no collections", not "has never been seeded", so deleting all three defaults would silently recreate them on the next sheet open — a per-user `collections_seeded_at` marker or equivalent has to land alongside (noted in `db/collections.ts`). `/settings`: glass sticky header + back chevron, shortcut cards (Edit profile, Saved with live count), backed rows only — Add to home screen, About, **Sign out** (its permanent home; leaves `/dev/tokens`, e2e updated). No handle, no avatar upload, no stub rows (muted sources / serendipity level / invite quota wait for their features).
  *Done = full loop sign-up → onboarding → feed → settings → sign-out in e2e; name edit round-trips.*

- [ ] **5.11 — Landing slideshow + install + PWA polish.** Landing per `Landing 2`: full-bleed cross-fading slideshow (Fisher–Yates shuffle per load, `slideMs` cadence, stop-on-last → 260ms → auth sheet rises with the existing password `AuthCard` inside), preload via `new Image()`, orbs + `drift` keyframe deleted. **Hard gate: slide list restricted to the 8 Wikimedia PD works (proxied/cached, not hot-linked) or Ben-cleared images — the bundle's `uploads/*.webp` are licensing-uncleared.** Install: dismissible banner → iOS instruction sheet / real `beforeinstallprompt` elsewhere, dismissal persistence, `pop-in` checkmark; extend `sw.ts` to cache the last feed page (never the personalized feed API responses themselves — deliberate strategy, not `defaultCache`).
  *Done = auth e2e still green (same fields inside the sheet); installable on iOS + Android; reopening offline shows shell + last cached feed.*

---

## Phase 6 — Learning loop & remaining sources

- [ ] **6.1 — Feed learns from saves.** Saves adjust `user_topic.weight` / inferred related topics (SPEC §3.3b) while retaining the randomness floor. Extend feed tests: a burst of saves in one domain measurably (but not overwhelmingly) shifts composition.
  *Done = weight adjustment covered by tests; feed visibly adapts without collapsing into a filter bubble.*

- [ ] **6.2 — Remaining v1 adapters (batched).** Same adapter+fixture pattern for: **Smithsonian Open Access** (key), **NASA APOD** (key), **Wikiquote**, **Project Gutenberg/Wikisource**, ~~**Public Domain Review**~~ (**moved to 6.3, 08-20-26** — the "scraping-lite or cut" gate was really a blog question, and 6.3 is where blogs are answered). Extend topic seed queries to all sources; re-run ingestion; eyeball feed mix.
  *Done = 7–8 live sources; ingestion healthy; per-source items visible in feed.*

- [ ] **6.3 — Blog source adapters (⚖️ design session first — decided 08-20-26, undesigned).**
  **Strategy:** Ambit's content comes primarily from **blogs** rather than from image scraping plus
  paid identification, because blogs already carry what costs money to manufacture — tags,
  descriptions, and an article saying why the image matters. Recorded in Ambit-Admin (08-20-26)
  along with the rights posture this step must honour.

  **Presentation contract — excerpt + link-out, no reader view.** A blog item is a **link card**:
  the image, Ambit's own short description, a 1–2 sentence blurb on what the source article is
  about, the `from: <blog>` credit from 5.7, and a **prominent link to the actual article**. Ambit
  hosts no reformatted articles; **`body` is not a display surface for blog items.** Full article
  text is used **at ingest only** — to derive topics, tags and the blurb — and is never stored for
  display. The recorded goal is to **drive readers out to the blog**, which is also what makes the
  rights posture honest: image or short excerpt + visible credit + link out, truthful license
  strings ("Rights retained by original authors — displayed with credit and link"), and
  remove-on-request. **No fair-use claim anywhere.**

  **v1 sketch** (a sketch, not a spec — the design session decides): a shared scraper core plus
  per-blog config; **one `SourceId` per blog**; the ingest unit is a **post**; each notable image
  becomes one `image` item and/or the post becomes one summary card; `source_id` = post-slug
  (+ index where a post yields several); `sourceUrl` = the post URL; `attribution` = the blog name;
  an honest per-blog license constant.

  **Seven open questions — settle these before any code:**
  1. **Adapter interface.** Blogs don't do `search(q)`, so the search-shaped contract doesn't fit as
     written. A local-index fake `search()` over already-scraped posts, or an ingest entry point
     shaped like an in-repo corpus walk?
  2. **Topic assignment without seed queries.** Search-shaped sources derive an item's topic from
     *which query surfaced it*; there is no such query here. LLM classification at ingest, or
     per-blog topic defaults?
  3. **Items per post, and the flooding rule.** A post with 30 images could swamp a feed page. How
     many items per post, and how does dedupe/spacing work?
  4. **Where the blurb lives.** Proposed: a nullable `body` (used as blurb, never as a reader
     surface), with `summary` as fallback. Needs a schema call.
  5. **Image hosting.** Blog images hotlinked from someone else's server is the **strongest case yet
     for 7.3's proxy-with-cache** — decide 7.3 and this together.
  6. **Scrape etiquette.** robots.txt compliance, request rate, re-crawl cadence, and identifying
     the agent. *A worked precedent already exists:* artvee was **cut 08-20-26** because its
     robots.txt runs an AI block list — a blog that machine-readably refuses agents does not become
     a designated blog just because its works are public domain.
  7. **Curation.** Do blog items go through the normal curator pass and quality floor? Presumably
     yes; confirm rather than assume.

  **First corpus: doorofperception.com.** The scrape already exists — 11,572 images on disk in
  `ambit-archive`, with `storage/sources/doorofperception/index.csv` (11,584 rows) mapping every
  image to its post URL and original URL, which is the attribution source. Ingesting it here
  **retires 85% of the archive corpus** and prototypes this whole step for $0. It also owns the
  **Ambit-side dedupe design** — those items may already have been ingested through the archive
  adapter (A.5). Designated-blog list: `docs/source-candidates.md`.
  *Done = a design session's decisions recorded in a plan doc; then one blog live end to end,
  displaying as a link card with credit and link-out, and no article text rendered by Ambit.*

---

## Phase 7 — Hardening, e2e, performance

- [ ] **7.1 — Playwright e2e suite.** SPEC §12 flows: invited sign-up + sign-in (email + password) → onboarding → feed renders; password reset (Mailpit API to fetch the reset link); image fullscreen + swipe; article expand; save persists across reload; invite gating blocks uninvited sign-up; public `/i/[itemId]` renders read-only. Wire into CI (compose services in the workflow).
  *Done = suite green locally and in CI.*

- [ ] **7.2 — Security pass.** Sanitize all source-derived HTML/text at ingestion (never raw `dangerouslySetInnerHTML`); authz audit — every `saved_item`/`user_topic` query filters `userId`; rate limits verified; security headers (CSP tuned for image sources); no private data on the public surface.
  *Done = checklist in SPEC §11 walked and each line verified.*

- [ ] **7.3 — Performance + images.** ⚖️ **Decide image strategy:** hotlink source URLs vs proxy/cache through the app (`next/image` remote patterns vs a caching route). Consider museum-API etiquette + broken-link rot (favor light proxy-with-cache if cheap). Lazy-load images, prefetch next feed page, feed response <300ms (add missing indexes if not), Lighthouse pass on mobile.
  *Done = feed p50 <300ms locally; Lighthouse perf reasonable on throttled mobile; image decision recorded in SPEC.*

---

## Phase 8 — Deploy & beta

- [ ] **8.1 — Coolify deployment.** App + Postgres on VPS/homelab via Coolify; git-push deploys; env vars (Resend key, OpenRouter key for ingest curation, DB URL, auth secret); domain + HTTPS; Coolify cron (or system cron) for `bun run ingest`; automated Postgres backups.
  *Done = production URL live; password-reset mail arrives via Resend; ingestion cron ran at least once unattended.*

- [ ] **8.2 — Ops guardrails + beta invites.** Minimal error visibility (server log drain or self-hosted Sentry/GlitchTip), uptime ping, ingestion-failure notification (even just email-on-error). Invite Ben + first friends; collect impressions for a week; triage into Phase 9.
  *Done = friends actively using it; feedback list captured in the repo.*

---

## Phase 9 — Polish & finishing backlog

*Unordered; pull based on beta feedback. Each is roughly a session.*

- [ ] **9.1 — Motion-fidelity pass.** Audit every screen against handoff timings (rise-ins, chip pop, sheet cubic-bezier, toast, gallery chrome cycle); fix drift.
- [ ] **9.2 — Accent picker.** Settings surface to choose among the 4 accents (per-user persistence) — the design's single brand knob, currently default-only.
- [ ] **9.3 — Accessibility pass.** Focus states, reduced-motion variants for every animation, contrast check on muted-opacity text, screen-reader labels on icon buttons, gesture alternatives (buttons for swipe-only actions).
- [ ] **9.4 — Attribution & licensing UI.** Per-item attribution/license display meeting each source's terms (gallery details sheet + item page). **Note 08-20-26:** the `from: <source>` credit line itself ships earlier, with **5.7** — this step stays the *audit*, and now also covers blog credit and license-string display (6.3's honest-rights posture: credit visible, link out prominent, no fair-use claim).
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
| Serendipity go/no-go + embedding model + recipe + vector dim | 0.4/0.5 | **Settled:** item-NN rejected; tiered topic drift over curated pool passed the feel gate. Offline model `text-embedding-3-small` × A; vector dim moot (no DB vector column). |
| PWA library | 1.3 | **Settled (07-17-26): `@serwist/next`** (next-pwa deprecated; SW verified on prod builds — Serwist doesn't support Turbopack dev) |
| Lint/format | 1.2 | **Settled (07-17-26): ESLint + Prettier** (t3 default; Biome's React/Next rule coverage still partial) |
| Public Domain Review feasibility | ~~6.2~~ → 6.3 | **Moved 08-20-26** — it is a blog question; answered by 6.3's design session |
| Blog adapter family v1 | 6.3 | **New 08-20-26.** Seven questions (adapter interface, topic assignment, items-per-post, blurb home, image hosting, scrape etiquette, curation) — a design session before any code |
| Image delivery | 7.3 | hotlink vs proxy-with-cache — **6.3 strengthens the proxy case**; decide together |

## Verification approach

- **Per step:** each step's "Done =" line is its acceptance test; don't check a box without it.
- **Backend:** Vitest on adapters (`toItem` fixtures), feed algorithm (weighting/dedup/cursor), repo query builders; integration tests against the compose DB.
- **Flows:** Playwright e2e per 7.1, in CI from that point on.
- **By hand at every UI step:** real phone (iOS Safari especially — the gesture system lives or dies there) against the handoff screenshots.
- **Continuous:** CI (typecheck, lint, unit, build) green from step 1.2 onward; two-consecutive-run idempotency check whenever ingestion changes.

## Suggested session cadence

Phases 0–2 sequential. Phases 3–4 (backend) and 5 (UI) can interleave once 2.1 is done — e.g., alternate a backend step and a screen. First shippable moment: after 5.4 + 4.2 you can scroll a real feed; MVP = end of Phase 8; everything in Phase 9 is post-beta polish.
