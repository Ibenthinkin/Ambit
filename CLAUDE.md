# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Ambit

A calm, non-social **anti-doomscroll PWA**: an infinite feed of public-domain images and articles, loosely tuned to user interests, with deliberate cross-domain serendipity jumps. Invite-only, no monetization, no social features.

**Rollup to planning vault.** At the end of any session that made real progress, read `VAULT_LOG_PATH` from `.env` and append a one-line milestone entry to that file — format `- [[MM-DD-YY ddd]] — <what changed>`, newest under the latest `## YYYY-MM` header. Commits are pulled into the Daily Brief automatically; this log is for the narrative beats worth reading later.

## Repository status

**Pre-implementation.** There is no application code yet — this repo currently holds the spec and design references. Currently in Phase 0 (see SPEC §14): validating that cross-source embedding serendipity feels good and that free-API content density is sufficient, before the real build.

## Authoritative documents

- **`SPEC.md`** — the build-ready technical spec: architecture, DB schema, tRPC API surface, feed algorithm, build order (§14), and open questions (§15). Treat it as the source of truth when scaffolding or implementing; it's a living doc — update it as decisions land.
- **`docs/design_handoff_ambit_pwa/`** — high-fidelity design handoff. The `.dc.html` files are self-contained interactive prototypes (open directly in a browser), one per screen, with a detailed README covering design tokens, motion specs, and per-screen interaction notes. Recreate these designs in the app's own components — do not copy the prototype code, and do not port `ios-frame.jsx`/`image-slot.js` (presentation scaffolding only).
- **`docs/source-candidates.md`** — post-MVP backlog of candidate content APIs with a per-source trial loop. These are *not* v1 sources; the committed v1 set lives in SPEC §6.1. Promote a candidate into the SPEC only after it passes the trial.

## Planned stack & commands (from SPEC)

Next.js (App Router) + **Bun** (runtime + package manager), TypeScript, tRPC, TailwindCSS, Drizzle ORM over Postgres + pgvector, Auth.js email magic-link (invite-gated), Vitest (unit) + Playwright (e2e). Once scaffolded, scripts use the `--bun` flag:

```
bun run dev      # bun run --bun next dev
bun run build    # bun run --bun next build
bun run ingest   # bun run scripts/ingest.ts (cron-triggered ingestion)
```

## Architecture (the parts that span files)

- **One Next.js app** serves frontend + tRPC API; a **decoupled Bun ingestion script** (`scripts/ingest.ts`) fetches from source APIs on a schedule, normalizes, embeds, and upserts into Postgres.
- **Everything normalizes to one `item` schema** (SPEC §5.1). Each external API gets an isolated `SourceAdapter` (`server/services/sources/*`) with `search()` + `toItem()`; ingestion is idempotent via the `(source, source_id)` unique constraint.
- **Embeddings are the product.** Every item's `title + summary` is embedded into a pgvector column; the feed's serendipity comes from nearest-neighbor lookups *across sources* (SPEC §9). Native source tags are only a secondary boost signal — never the primary relevance driver.
- **Feed composition** = weighted-random over the user's picked topics + nearest-neighbors of recently saved items, with a randomness floor. Cursor-based pagination; the cursor encodes the weighting seed.
- **Auth boundary**: all user-scoped queries filter by `userId`; the only public surface is `items.byId` / `/i/[itemId]`.
- **Embedding model is undecided** (local 384-dim vs. OpenAI `text-embedding-3-small`) — the `VECTOR(n)` dimension must match whatever Phase 0 picks.

## Conventions

- Testing is non-negotiable (SPEC §12): Vitest coverage on adapter `toItem` normalization and the feed merge/weighting logic; Playwright for the core flows.
- Respect each source API's rate limits and attribution/licensing requirements; store `attribution` and `license` on items.
- Never render unsanitized source HTML.
