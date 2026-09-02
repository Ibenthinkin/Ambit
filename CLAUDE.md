# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ambit

A calm, non-social **anti-doomscroll PWA**: an infinite feed of public-domain images and articles, loosely tuned to user interests, with deliberate cross-domain serendipity jumps. Invite-only, no monetization, no social features.

## Repository status

**Phases 0–5 complete.** Phase 0 (concluded 07-13-26) validated the
design in `phase0/` (throwaway-but-kept: harvester, curator, topic-graph tooling, and two
self-contained browser harnesses — `feed.html` is the reference implementation of the feed
algorithm and stays the feel-tuning bench): item-level embedding recommendation was **rejected**;
the validated design is a tiered topic-drift feed over an LLM-curated pool (SPEC §9). Phases 1–4
scaffolded the real app — Next.js/tRPC/Drizzle/Better Auth, the five source adapters + curator
(§6), the feed engine (§9), and the full tRPC surface (§7) — all on `main`, DB populated from a
real ingest run. Phase 5 built the UI against the redesign handoff (`docs/design_handoff_ambit_pwa_redesign/`)
screen by screen, per `docs/BUILD_PLAN.md`'s Phase 5 ordering. **All of 5.1–5.11 are shipped**
(design system, auth, onboarding, feed, item, gallery, Saved, Profile/Settings/Edit, and the
landing slideshow + install flow + PWA caching). The app has no internal 404s, sign-out lives on
`/settings`, and it is installable with the last feed page available offline. **6.3 shipped
08-27-26** (blog adapters: the `CorpusWalkAdapter` contract, doorofperception live as link
cards). **7.1 shipped 08-27-26** — the Playwright suite (8 specs, 42 tests) runs in CI against a
**production build** with Postgres + Mailpit service containers, and the five DB-backed Vitest
suites run there too; `bun run e2e:prod` reproduces that configuration locally. Running against a
production build is what found two bugs `next dev` had been hiding (Better Auth's production-only
rate limiter, and the accent knob not surviving a reload) — both fixed in 7.1.
**7.2 shipped 08-28-26** — the security pass: every response now carries nosniff,
`X-Frame-Options: DENY`, referrer and permissions policies, HSTS gated on an https
`BETTER_AUTH_URL`, and an **enforced Content-Security-Policy with a per-request nonce**
(`src/config/security-headers.js` builds every value; `next.config.js` sends the static ones and
`src/proxy.ts` mints the nonce). SPEC §11 now ends every bullet in the test that proves it. Two
findings: 41 corpus rows carried `<i>`/`<em>` markup in `title`/`summary` from four adapters
(reader-visible; recorded then, **fixed in 8.1** — the adapters run both fields through
`htmlToText()` and `bun run renormalize --confirm` repairs rows ingested before that), and the CSP
surfaced a dev-only hydration error from the way browsers blank a `<script nonce>` attribute.
**7.3 shipped 08-28-26** — performance + images. The **image-delivery gate is settled:
proxy-with-cache**. `/api/img/[itemId]` now fills a disk cache (`IMAGE_CACHE_DIR`, default
`.cache/img`) and serves **≤1600px WebP**, so every source image is fetched from its museum
**once, ever** (`src/server/services/image-cache.ts`; `bun run img:warm` spends those fetches
politely, per host). And the feed's page compose went from **138 ms to 22 ms** — `getTopicPools`
had been dragging 9,848 full rows / 35.8 MB out of Postgres to pick twelve cards; it now returns a
five-column projection and `getFeedPage` hydrates the winners by id. `bun run bench:feed` is the
before/after. **8.1 is in progress and paused mid-phase**: T1–T2 shipped 08-28-26 (`/api/health`,
`MAIL_FROM`, `cf-connecting-ip` for Better Auth in production, a `SOURCE_COMMIT`-first precache
revision, and the `Dockerfile`/`.dockerignore` whose boot path — migrate, seed, `next start` — was
proven locally against an empty database, cache volume and all). **T3 shipped 08-29-26** — Ambit is
deployed on VM 202 as Coolify's second tenant. **T4 shipped the same night** — Ambit is **public at
`https://ambit.benreilly.io`** through the VM 200 tunnel, all seven security headers surviving the
edge, and the first account is signed up against an empty corpus (correct: D3 fills it in T7). Two
Coolify traps cost the evening and are written up in the walkthrough — the Postgres image field
defaults to 18 rather than the pinned 17, and `POSTGRES_USER`/`POSTGRES_DB` are silently ignored
after a resource's first start. **T7.3 shipped 08-31-26** — the first full ingest landed
**11,313 items** across nine sources, all 16 topics filled, from the *nightly cron* run (Ben's
manual run was killed mid-flight by a NUC host problem, but its curation cache on the volume made
the cron run 70 min instead of two hours). One trap from that worth knowing before you debug
anything scheduled on this host: **Coolify records every healthy ingest as `failed`** — its
`ScheduledTaskJob` times out at 5 minutes, discards the task output, and lets the `docker exec`
run on to completion regardless, so **the task status is not evidence in either direction and the
database is the only honest witness** (the diagnostic query is in `PHASE8_PLAN_8.1.md` 7.3's
fallback). Raising `scheduled_tasks.timeout` is 8.2's T3.0. **7.4 and 7.4c shipped
08-31/09-01-26** — the image cache is warm for all nine sources; the wikipedia adapter now asks for 1600 px thumbnails instead of originals, and `bun run rethumb` is
the row repair. Wikimedia throttles on-demand thumbnail *rendering* on a budget of roughly 60
renders refilling at ~20/min — a sustained `--rate 1` still 429s; warm it as 20-image chunks with
75 s pauses (loop in the 8.1 walkthrough). **T8 (restore drill) and T9.2–9.5 (closing docs) remain**, so
resume from
`docs/PHASE8_PLAN_8.1.md` — its execution-state banner says exactly where — and read
`docs/PHASE8_WALKTHROUGH_8.1.md` for the deployed facts (resource UUID, volume name, DB hostname)
rather than re-deriving them from the Coolify UI. **A second thread is mid-flight beside 8.1:
source-candidates round 2** — every remaining candidate in `docs/source-candidates.md` was live-probed
09-01-26, and the same night Ben verdicted the first three: **thingsorganizedneatly kept** (Tumblr
walk, 891 rows locally @ 7.90), **thisiscolossal kept** (on the new `wp-rest.ts` factory; 6,075
rows locally @ 8.70, 97.5% ≥ 8, all 16 topics — the strongest source in the corpus), **mossandfog
parked** (`SUSPENDED_SOURCES`, the only switch that keeps a
registered walker out of the nightly ingest). Walk sources are now exempt from the dup-title floor
rule, and `bun run stats:walk` prints the score distribution a verdict needs. Neither kept blog is
on production yet — the nightly ingest walks them after the next deploy. Pick the thread up from
`docs/HANDOFF_sources-round2.md`: next are streetartnews and spoon-tamago (config rows on the
factory), then Europeana / Openverse / Chronicling America. See
`docs/BUILD_PLAN.md` for the full phase-by-phase build order and
`log.md` for the narrative of what's landed and why.

## Authoritative documents

- **`SPEC.md`** — the build-ready technical spec: architecture, DB schema, tRPC API surface, feed algorithm, build order (§14), and open questions (§15). Treat it as the source of truth when scaffolding or implementing; it's a living doc — update it as decisions land.
- **`docs/design_handoff_ambit_pwa_redesign/`** — the authoritative design handoff since 08-16-26 (11 `.dc.html` prototypes + README). **Where the prototypes and the README conflict, the prototypes win** — a recorded Phase 5 convention. The bundle's `PROGRESS.md` describes an earlier session and is superseded. The older `docs/design_handoff_ambit_pwa/` is kept as history only. The `.dc.html` files are self-contained interactive prototypes (open directly in a browser), one per screen, with a detailed README covering design tokens, motion specs, and per-screen interaction notes. Recreate these designs in the app's own components — do not copy the prototype code, and do not port `ios-frame.jsx`/`image-slot.js` (presentation scaffolding only).
- **`docs/source-candidates.md`** — post-MVP backlog of candidate content APIs with a per-source trial loop. These are *not* v1 sources; the committed v1 set lives in SPEC §6.1. Promote a candidate into the SPEC only after it passes the trial.

## Planned stack & commands (from SPEC)

Next.js (App Router) + **Bun** (runtime + package manager), TypeScript, tRPC, TailwindCSS, Drizzle ORM over plain Postgres (no pgvector — see below), Better Auth email + password (invite-gated sign-up), Vitest (unit) + Playwright (e2e). Once scaffolded, scripts use the `--bun` flag:

```
bun run dev      # bun run --bun next dev
bun run build    # bun run --bun next build
bun run ingest   # bun run scripts/ingest.ts (cron-triggered ingestion)
```

## Architecture (the parts that span files)

- **One Next.js app** serves frontend + tRPC API; a **decoupled Bun ingestion script** (`scripts/ingest.ts`) fetches from source APIs on a schedule, normalizes, **curates** (quality floor + LLM taste score — SPEC §6.2), and upserts into Postgres.
- **Everything normalizes to one `item` schema** (SPEC §5.1). Each external API gets an isolated `SourceAdapter` (`server/services/sources/*`) with `search()` + `toItem()`; ingestion is idempotent via the `(source, source_id)` unique constraint. Museum image servers bot-block third-party fetchers — anything sending an item's image to an external service must pass bytes, never the URL.
- **The corpus is the product.** The feed's quality comes from curation at ingest (every item carries a 1–10 LLM `curation_score` + `aesthetic_tags`), not from a ranking function. Embeddings choose **where** to look — a checked-in 16×16 topic-adjacency graph built offline from mean-centered topic centroids; curated-weighted **random** chooses what to show (never similarity — item-level NN was tested and rejected in Phase 0.4).
- **Feed composition** (SPEC §9) = per-slot tier draw (CORE 40 / DRIFT 35 / JUMP 25 — drift-heavy on purpose) → topic via the user's weights or a graph walk → item via curated-weighted random, under diversity constraints (no adjacent same-source; per-page topic caps). Saves reweight *topics*, visibly. Cursor-based pagination; the cursor encodes the page seed. Debug overlay + tuning knobs ship behind a dev flag throughout development.
- **Auth boundary**: all user-scoped queries filter by `userId`; the only public surface is `items.byId` / `/i/[itemId]`.

## Conventions

- Testing is non-negotiable (SPEC §12): Vitest coverage on adapter `toItem` normalization and the feed merge/weighting logic; Playwright for the core flows.
- Respect each source API's rate limits and attribution/licensing requirements; store `attribution` and `license` on items.
- Never render unsanitized source HTML.

## Local dev environment

- **Ambit must own port 3000.** `BETTER_AUTH_URL` is pinned to `http://localhost:3000`, so every auth callback and password-reset link points at whatever is listening there — and `tailscale serve --bg 3000`, which is how device passes get HTTPS, fronts the same port. An unrelated `node` app has been squatting 3000 since 08-16; run `lsof -ti:3000` and clear it before starting a dev server or a device pass.
- **Run device passes over HTTPS, not `http://` on the LAN.** The Web Share API is secure-context only, so on plain HTTP `navigator.share` is `undefined` rather than broken — share, clipboard and service workers silently can't be tested at all. Use the tailnet origin (`https://macbook-air-m5.halley-morpho.ts.net`); it and every other dev origin must be listed in `src/config/dev-origins.js`.
- **`e2e/gallery.spec.ts:193` ("tile → item → hero → gallery, and back") goes flaky as the dev DB
  accumulates e2e state.** Distinct from the note below, and don't confuse them: that one is CPU
  load and hits a *different* test each time; this is the **same test every time**, it passes 10/10
  in isolation, and it only fails inside a full `bun run e2e`. Verified on `main` 08-21-26 — clean
  3/3 early in the evening, then 2 failures in 3 runs a couple of hours later with no code change
  between. What accumulated in between: **274 `user` rows and 6,709 `seen_item` rows** from repeated
  suites, on top of a corpus that grew 30% the same day. Both failure signatures are the same class
  — clicking something mid-animation (`element is not stable`, or a `waitForURL` that never
  resolves). **So: a red gallery.spec:193 is not evidence about your branch.** Check `main` at the
  same moment before believing it, then clear the accumulation: **`bun run e2e:clean --confirm`**
  (Phase 7.1) retires every `ambit-%@example.com` user and the rows hanging off them; run it
  without the flag first for a dry-run count. CI never sees any of this — its database is fresh
  every run — so a green CI and a red local `gallery.spec:193` are consistent, and the local one is
  the accumulation. Delete this note if the test is ever made robust.
- **A red Postgres-touching integration test usually means the machine is busy, not that the code broke.** Overlapping `bun run test` runs, or a dev server under load, balloon vitest setup from ~7s to ~650s and then fail *unrelated* integration tests — three times in one session on 2026-08-20, a different test each time. Check what else is running before debugging the test. Delete this note if test isolation is ever fixed; don't leave it as folklore.
- **After `bun add`/`bun remove`, clear Vite's dep cache before trusting a red test run.** Adding
  `sharp` in 7.3 invalidated `node_modules/.vite`, and the symptom was nothing like a dependency
  problem: `bun run test` went from **34 s to 486–1,218 s**, `import` alone taking 700–3,200 s, with
  *different* tests failing every run — including pure unit tests that cannot fail for logic reasons
  (`routers.test.ts`'s "throws UNAUTHORIZED"), test-file counts varying run to run (77 → 71 → 72),
  and one `saves.list` call taking **826 seconds**. Postgres was provably idle and sub-millisecond
  throughout, and no stray processes were running, so it reads exactly like the busy-machine class
  below and isn't. **`rm -rf node_modules/.vite node_modules/.cache/vite`** put it back to 35 s /
  820 tests immediately. Suspect this whenever the *whole* suite degrades right after a dependency
  change; the busy-machine note below is for when it degrades without one.
- **Deleting `.cache/img` forces the image proxy to refetch from the museums.** It is one
  `<itemId>.webp` per item (Phase 7.3) and safe to delete, but it is also the only thing standing
  between a scroll and `tile.loc.gov`'s per-IP budget — refill it with `bun run img:warm --rate 2`
  rather than letting readers do it. `bun run img:warm --dry-run` counts what a run would fetch.
- **A valid API key that still 401s is probably being shadowed by the shell.** Bun resolves real
  environment variables *ahead* of `.env`, so an `export OPENROUTER_API_KEY=…` left in `~/.zshrc`
  wins over the file and editing `.env` changes nothing the process ever sees. This cost most of
  08-22-26: the stale and fresh keys were both 73 chars (`sk-or-v1-` + 64 hex), so length, prefix,
  format and a password-manager comparison all agreed the key was correct. Diagnose with
  `env -u OPENROUTER_API_KEY bun -e '…'` — if that succeeds where a bare run 401s, it's the shadow,
  not the key. (Related tell: OpenRouter's `"User not found."` is an *account*-level error; a
  malformed key reads `"No auth credentials found"`.) The zshrc exports are gone as of 08-22-26,
  but any new machine or re-added export brings it straight back.


## Project log (`log.md`)

Keep a narrative log at repo root in `log.md` — the decisions, findings, and dead-ends that don't live in commit messages. It **complements** commits (which record *what changed in code*); the planning vault's `/brief` skill reads it directly for the Daily Brief. Don't duplicate what a commit already says.

**Format** — append-only, newest on top:
- `## YYYY-MM` month groupers (newest month first).
- `### [[MM-DD-YY ddd]] — <title>` day headings (wikilink form; one entry per day — a second write the same day *extends* that entry, never adds a duplicate heading).
- Default skeleton `**Shipped:** / **Decisions:** / **Open / next:**`, but flexible — include only what's relevant (an on-demand "log the findings above" might be just a `**Findings:**` block).

**Session spend** — every entry ends with a line recording the token spend of the work it covers. **Never estimate it**; get it from the shared script:

```sh
python3 ~/.claude/scripts/session-spend.py --session <session-uuid>
```

The session UUID is the second-to-last component of the scratchpad path in your system prompt (`…/<project-slug>/<session-uuid>/scratchpad`). Paste its stdout verbatim as the last line of the entry, after the `**Open / next:**` block:

```
*Session spend: 1.24M tok (in 187 · out 38.2k · cache r 1.13M / w 61.4k) · ~$2.41 · opus-5 · 09:12→11:40*
```

- It reports the **delta since its previous run in this session**, so a second write never double-counts the first. When a later session extends the same day's entry, **add a second spend line** rather than editing the first — each covers its own session, and the time windows tell them apart.
- Subagent spend is included (attributed by time window, since subagent transcripts carry no link to the parent).
- The dollar figure is list-price arithmetic, not what the subscription actually bills.
- **If the script exits non-zero** (no transcript, or nothing new since the last entry), **omit the line entirely** — don't substitute a guess.

**Write triggers:**
1. **On-demand** — "log this" / "summarize the above and log it".
2. **At commit checkpoints** — when you commit at the user's request, update `log.md` if the work since the last entry is narrative-worthy. A considered update at a natural boundary, *not* a line per commit.
3. **End of session** — backstop for sessions that end without a commit. Only on genuine progress; skip trivial sessions.

## Ecosystem coordination (Ambit-Admin)

Ambit is one of three cooperating services — with **ambit-archive** (`~/Dev/ambit-archive`, Ben's private personal-image source) and **loupe** (`~/Dev/loupe`, his personal magazine-clipping bench). The cross-project map lives in Ben's private vault at `~/vaults/Memory-Palace/05 Projects/Ambit-Admin/` (`Ecosystem Architecture.md` + `Roadmap & Backlog.md`). The parts that bind this repo:

- **The boundary is rights/visibility**: Ambit houses public, public-domain and openly-licensed sources every user may see (new *public* sources land here, in `server/services/sources/`); personal/experimental/unattributed content stays in ambit-archive; personal-use archive material stays in loupe. Ambit is the ecosystem's **only user-facing surface** and the sole gate for the planned per-user content-pool privileges.
- **Two rights postures live under Ambit's roof as of 08-20-26** (Ambit-Admin decision). Alongside owned display of open material, Ambit does **link-card display of designated blogs**: a single image or short excerpt + a visible `from: <blog>` credit + a **prominent link to the original**, in the shape of a social link preview and **never a republished article**. **No fair-use claim** — license strings stay honest ("Rights retained by original authors"), removal on request is the standing policy, and the point of the link-out is to drive readers *to* the blog. Full article text is used at ingest only, never stored for display. Tenable because Ambit is invite-only and non-monetized. Designed and built 08-25/27-26 — SPEC §6.1, `docs/PHASE6_DESIGN_6.3.md`, `docs/PHASE6_WALKTHROUGH_6.3.md`.
- **Two blessed source-integration patterns**: search-shaped (`search(q)`, ranked order — the museums, ambit-archive) and corpus-walk (cursor-paginated full ingest — loupe, whose adapter must fail fast on 401/403 and never dedupe on loupe article `id`). Don't invent a third shape. *Corpus-walk is now implemented in-repo (`CorpusWalkAdapter` in `server/services/sources/types.ts`, Phase 6.3) — loupe's adapter uses it. Designated blogs are registered in `src/server/config/blogs.ts`; a blog's `body` is always null.*
- The `SourceAdapter` contract (`server/services/sources/types.ts`) is a **cross-service agreement** — ambit-archive built to it verbatim. Before changing it (or either private-source integration), read the Ambit-Admin doc and record the decision in its log.
