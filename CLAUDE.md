# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ambit

A calm, non-social **anti-doomscroll PWA**: an infinite feed of public-domain images and articles, loosely tuned to user interests, with deliberate cross-domain serendipity jumps. Invite-only, no monetization, no social features.

## Repository status

**Phases 0–4 complete; Phase 5 (UI) in progress.** Phase 0 (concluded 07-13-26) validated the
design in `phase0/` (throwaway-but-kept: harvester, curator, topic-graph tooling, and two
self-contained browser harnesses — `feed.html` is the reference implementation of the feed
algorithm and stays the feel-tuning bench): item-level embedding recommendation was **rejected**;
the validated design is a tiered topic-drift feed over an LLM-curated pool (SPEC §9). Phases 1–4
scaffolded the real app — Next.js/tRPC/Drizzle/Better Auth, the five source adapters + curator
(§6), the feed engine (§9), and the full tRPC surface (§7) — all on `main`, DB populated from a
real ingest run. Phase 5 builds the UI against the design handoff (`docs/design_handoff_ambit_pwa/`)
screen by screen, per `docs/BUILD_PLAN.md`'s Phase 5 ordering; 5.1 (design system foundation —
Tailwind tokens, the 4-accent knob, primitives, `/dev/tokens`) is the first step and establishes
what 5.2–5.8 build on. See `docs/BUILD_PLAN.md` for the full phase-by-phase build order and
`log.md` for the narrative of what's landed and why.

## Authoritative documents

- **`SPEC.md`** — the build-ready technical spec: architecture, DB schema, tRPC API surface, feed algorithm, build order (§14), and open questions (§15). Treat it as the source of truth when scaffolding or implementing; it's a living doc — update it as decisions land.
- **`docs/design_handoff_ambit_pwa/`** — high-fidelity design handoff. The `.dc.html` files are self-contained interactive prototypes (open directly in a browser), one per screen, with a detailed README covering design tokens, motion specs, and per-screen interaction notes. Recreate these designs in the app's own components — do not copy the prototype code, and do not port `ios-frame.jsx`/`image-slot.js` (presentation scaffolding only).
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
  same moment before believing it, and consider clearing accumulated e2e users/seen rows. Delete
  this note if the test is ever made robust.
- **A red Postgres-touching integration test usually means the machine is busy, not that the code broke.** Overlapping `bun run test` runs, or a dev server under load, balloon vitest setup from ~7s to ~650s and then fail *unrelated* integration tests — three times in one session on 2026-08-20, a different test each time. Check what else is running before debugging the test. Delete this note if test isolation is ever fixed; don't leave it as folklore.
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
- **Two rights postures live under Ambit's roof as of 08-20-26** (Ambit-Admin decision). Alongside owned display of open material, Ambit does **link-card display of designated blogs**: a single image or short excerpt + a visible `from: <blog>` credit + a **prominent link to the original**, in the shape of a social link preview and **never a republished article**. **No fair-use claim** — license strings stay honest ("Rights retained by original authors"), removal on request is the standing policy, and the point of the link-out is to drive readers *to* the blog. Full article text is used at ingest only, never stored for display. Tenable because Ambit is invite-only and non-monetized. Design is open: SPEC §6.1 and `docs/BUILD_PLAN.md` 6.3.
- **Two blessed source-integration patterns**: search-shaped (`search(q)`, ranked order — the museums, ambit-archive) and corpus-walk (cursor-paginated full ingest — loupe, whose adapter must fail fast on 401/403 and never dedupe on loupe article `id`). Don't invent a third shape.
- The `SourceAdapter` contract (`server/services/sources/types.ts`) is a **cross-service agreement** — ambit-archive built to it verbatim. Before changing it (or either private-source integration), read the Ambit-Admin doc and record the decision in its log.
