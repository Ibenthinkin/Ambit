# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ambit

A calm, non-social **anti-doomscroll PWA**: an infinite feed of public-domain images and articles, loosely tuned to user interests, with deliberate cross-domain serendipity jumps. Invite-only, no monetization, no social features.

## Repository status

**Pre-scaffold.** There is no application code yet — this repo holds the spec, design references, and the completed Phase 0 validation work in `phase0/` (throwaway-but-kept: harvester, curator, topic-graph tooling, and two self-contained browser harnesses — `feed.html` is the reference implementation of the feed algorithm and stays the feel-tuning bench). Phase 0 concluded 07-13-26: item-level embedding recommendation was **rejected**; the validated design is a tiered topic-drift feed over an LLM-curated pool (SPEC §9). Next step: Phase 1 scaffold (SPEC §14).

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
