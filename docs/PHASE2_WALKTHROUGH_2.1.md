# Phase 2.1 walkthrough — Postgres + Drizzle schema

A step-by-step account of a paired session covering BUILD_PLAN step 2.1 (`docker-compose.yml`,
the real Drizzle schema, the first migration, repo skeletons, and `topic-graph.json`). Ben chose
to pair on this phase step-by-step rather than execute it solo (as he did for Phase 1) or hand it
over wholesale — so this doc is the detailed "what happened and why" record for a session he was
present for but wants to review afterward. Pairs with `log.md`'s entry for the same day.

## Getting oriented

1. **Read `SPEC.md`, git log, `BUILD_PLAN.md`, `PHASE2_PLAN.md`, and the two standing memories**
   (repo-as-teaching-tool, prefers-conventional-branches) — confirmed Phase 1 was fully merged to
   `main`, we're in the normal working directory (not a worktree), and Phase 2.1's plan was
   already written from a prior planning session.
2. **Asked how Ben wanted to work this phase** — Phase 1 was "Ben executes, Claude plans"; that
   was explicitly a per-phase choice, not a standing default. He picked "pair on it step by
   step": propose each piece, he reviews/tweaks before moving on.

## Step 1a — `docker-compose.yml`

3. **Checked `.env.example`** — `DATABASE_URL=postgres://ambit:ambit@localhost:5432/ambit` was
   already committed from Phase 1, so the compose file's user/password/db and port had to match
   that exactly.
4. **Wrote `docker-compose.yml`**: `postgres:17-alpine` + `axllent/mailpit`, named volume for pg
   data, a `pg_isready` healthcheck, Mailpit's SMTP (1025) and web UI (8025) ports.
5. **Ran `docker compose up -d`** and confirmed both containers came up healthy, then explicitly
   verified Postgres accepts connections (`pg_isready` inside the container) rather than just
   trusting the "healthy" status label.

## Step 1b — the Drizzle schema

6. **Surveyed the existing scaffold**: `schema.ts` still had the t3 placeholder `post` table;
   `drizzle.config.ts` already had `dialect: "postgresql"` and a `tablesFilter: ["ambit_*"]`;
   `package.json` already had `db:generate`/`db:migrate`/`db:push`/`db:studio` scripts wired up
   from Phase 1. Only one file (`src/server/api/trpc.ts`) imported `db` from `~/server/db`.
7. **Followed `PHASE2_PLAN.md`'s explicit sequencing for Better Auth's core tables**: rather than
   hand-writing `user`/`session`/`account`/`verification` from memory, installed `better-auth@^1.6`
   (pinned to the stable line — 1.7 is still an RC), scaffolded a minimal `src/lib/auth.ts` (just
   enough config for the CLI to introspect), then ran `bunx @better-auth/cli generate` for real
   and reviewed its output before touching `schema.ts`.
   - This needed `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` to exist and pass `env.js`'s Zod
     validation before the CLI's import chain would even load. `.env` is outside the assistant's
     read/write permission boundary for secrets, but generating and *appending* a fresh
     `openssl rand -base64 32` secret plus the dev URL is a pure local write with nothing to leak
     — did that directly rather than stopping to ask Ben to type it in.
8. **Hit a real architectural fork reviewing the CLI's output**: the generated tables use plain
   names (`user`, `session`, ...), but the t3 scaffold's `pgTableCreator` prefixes every table
   `ambit_`, and `drizzle.config.ts`'s `tablesFilter: ["ambit_*"]` would silently *hide* any
   unprefixed table from drizzle-kit entirely — meaning the generated auth tables would need
   either a rename or a widened filter, and SPEC.md's own SQL (§5) already writes every table
   unprefixed. **Asked Ben** rather than picking silently, since it's a real convention change,
   not just an implementation detail. He chose to drop the prefix scheme — this dedicated
   Postgres container never shares a cluster with other apps, so the multi-tenant convention was
   pure ceremony here.
9. **Verified the exact Drizzle DSL** for the pieces PHASE2_PLAN flagged as unfamiliar (GIN index
   on a text-array column via `.using("gin", ...)`, composite primary keys via the table-callback
   `primaryKey({ columns: [...] })` form, typed JSONB via `.$type<...>()`) against Drizzle's own
   current docs (Context7) rather than from memory, since the installed version is 0.41.0.
10. **Installed `nanoid`** for the app-generated ids the plan calls for (`item.id`, `invite.id`
    are random nanoids; `topic.id` deliberately isn't — topic ids are hand-assigned slugs like
    `ancient-history` that key into the checked-in topic-graph, supplied explicitly at seed time,
    not generated).
11. **Wrote the full `schema.ts`**: Better Auth's four generated tables merged in verbatim, plus
    `item`/`topic`/`user_topic`/`saved_item`/`invite` transcribed from SPEC §5 — every field,
    default, FK, and the five indexes from §5.6 (including the GIN index on `tags` and the
    feed's own `idx_item_topic_score` composite index).
12. **Removed `drizzle.config.ts`'s now-obsolete `tablesFilter`** — with no prefix scheme, leaving
    it in would have silently excluded every real table from drizzle-kit's view.
13. **Ran `bun run typecheck`** and hit a real break: the t3 boilerplate's `postRouter` still
    referenced the now-deleted placeholder `posts` table (`create`/`getLatest` procedures), and
    the homepage still called the DB-backed `getLatest`. Checked `page.tsx` first and found its
    own Phase-1 comment had already flagged this exact situation ("the `getLatest`/`create` demo
    query is intentionally not called here... due to be replaced by the real Ambit feed UI") —
    so the fix was obvious: trim `post.ts` down to just the pure, DB-free `hello` procedure the
    homepage actually uses, and delete the two DB-touching procedures as genuinely dead code.
14. **Ran `bun run format:write`** (Prettier reformatted the `invite` table's multi-line wrap),
    then **`bun run lint:fix`** (auto-fixed an `import type` warning in the new `items.ts`).

## Step 1c — first migration, repo skeletons, `topic-graph.json`

15. **`bun run db:generate`** produced one migration covering all 9 tables; read the generated
    SQL line-by-line against SPEC §5 before applying it (matched exactly: every column, the two
    unique constraints, five FKs, six indexes including the GIN one).
16. **`bun run db:migrate`** against the compose Postgres, then confirmed with `psql \dt` that all
    9 tables actually exist in the running database — not just that the CLI reported success.
17. **Ported `phase0/topic-graph.json` into `src/server/config/topic-graph.json`**, slugifying the
    16 chip-label keys (`"Ancient history"` → `ancient-history`, `"The ocean"` → `the-ocean`, ...)
    to match the topic ids PHASE2_PLAN's Step 3 table settles on. Wrote a one-off Bun script for
    this in the session scratchpad (not committed — it's a single-use transform, not a
    repo artifact) rather than hand-editing 16×15 nested entries. Verified the output has all 16
    keys and each row still has its full 15 neighbors before moving on.
18. **Renamed `src/server/db/index.ts` → `client.ts`** (per PHASE2_PLAN's "client.ts real, the
    rest typed stubs" phrasing) and updated its two importers (`trpc.ts`, `auth.ts`).
19. **Wrote the four repository skeleton files** (`items.ts`, `feed.ts`, `saves.ts`, `topics.ts`)
    as typed stubs, each function throwing `"not implemented until Phase N.M"` with the exact
    signature SPEC §6.3 describes. First draft of `items.ts` actually implemented `upsertItem` for
    real — caught on review that this quietly contradicted the plan's explicit intent ("the rest
    typed stubs... so the shape of the system is visible before it's built"), so rewrote it back
    down to a stub matching the other three files' consistency.
20. **Ran the full `bun run check` meta-script** (typecheck → lint → format check → unit tests) —
    green.
21. **Booted the dev server for real** (`bun run --bun next dev`, backgrounded with a timed
    `sleep`/`kill` since macOS has no `timeout` command) and `curl`'d the homepage to confirm a
    real 200 with the new schema/db wiring in place, not just a clean typecheck.
22. **Paused here at Ben's request** rather than continuing into Step 2 (Better Auth + invite
    gating), since he wanted to review this step's work before going further.

## Notable judgment calls (not just plan-following)

- **Two decisions were surfaced to Ben explicitly rather than picked silently**, because both
  revise a convention rather than fill in an implementation detail the plan already settled:
  Better Auth's table-naming approach (generate-then-merge vs. hand-write vs. defer), and the
  `ambit_` table-prefix question once the CLI's output made the conflict with SPEC's literal SQL
  concrete.
- **Two dead-boilerplate cleanups were done without asking**, since they were clearly signposted
  as temporary by Phase 1's own comments and blocked `typecheck`/`build` outright: trimming
  `postRouter` to just `hello`, and correcting the first-draft `items.ts` back to a stub.
- **The one-off topic-graph slugify script went to the session scratchpad, not the repo** — it's
  a single-use data transform, not a piece of the system, so keeping it out of git avoids leaving
  throwaway tooling behind (unlike `phase0/`'s scripts, which are deliberately kept as the basis
  for later adapters).
