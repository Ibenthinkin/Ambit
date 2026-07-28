# Phase 2 — Database & auth: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 2 (steps 2.1–2.3), in the same format as
> [`PHASE1_PLAN.md`](PHASE1_PLAN.md). Written 07-17-26; Ben is executing this himself as a
> learning exercise. Check BUILD_PLAN boxes as each step's *Done =* line is met. Assumes Phase 1
> is complete (scaffold + CI + PWA shell).

## Context

Phase 2 stands up the data layer and the front door: Docker Postgres + the Drizzle schema
(SPEC §5), Better Auth email + password with invite-gated sign-up (SPEC §3.1), and the topic
seed data that everything downstream (ingestion, feed, onboarding) hangs off.

**Decision settled 07-17-26 — v1 seeds the 16 validated topics, not the design handoff's 32
chips.** The topic graph only covers 16 topics, and DRIFT/JUMP need a graph row per topic;
seeding graph-less topics would break the feed's drift machinery. The chip grid grows toward the
handoff's 32 in Phase 6, when new harvests land and the graph is recomputed. Label
reconciliation is decided below (Step 3) so 2.3 is purely mechanical.

**Cross-cutting:** this project doubles as stack-learning — generous explanatory comments in
config and code, explaining what each piece is *for*.

**Check before starting 2.2:** Phase 1's scaffold (07-28-26) found `bun create t3-app@latest --help`
now lists an experimental `--betterAuth [boolean]` flag that didn't exist when this plan was
written — this whole plan assumes it doesn't. Worth a quick spike to see whether it actually
covers the invite-gated-signup pattern below (`databaseHooks.user.create.before` + `APIError`) or
just does the vanilla Better Auth wiring; if the latter, hand-wiring per this plan is probably
still less work than fighting the generator's assumptions.

## Key findings from the 07-17 docs research

- **Better Auth: current stable 1.6.x** (1.7 is an RC — stay on 1.6). All the SPEC's planned
  patterns are confirmed current:
  - `drizzleAdapter(db, { provider: "pg", schema })`, imported from
    `better-auth/adapters/drizzle` (one doc source showed a separate package name — verify the
    subpath against the installed package).
  - `emailAndPassword: { enabled: true, sendResetPassword }` — callback receives
    `{ user, url, token }`; **don't `await` the mail send** inside it (timing-attack leakage).
  - Invite gating via `databaseHooks.user.create.before` throwing `APIError` is still the
    recommended pattern; there is no first-party invite plugin.
  - `toNextJsHandler` catch-all; `auth.api.getSession({ headers: await headers() })` on the
    server; `createAuthClient` from `better-auth/react` on the client.
  - Middleware protection: `getSessionCookie(request)` is a fast **optimistic** check only
    (cookie existence, spoofable) — real validation is `getSession` per page/procedure. If
    cookie options are ever customized, pass matching options to `getSessionCookie` explicitly.
- **Bun traps (open issues as of 07-26):** add `better-auth` to `serverExternalPackages` in
  `next.config` (fixes `--bun` Next 16 build chunk errors); run the schema CLI as plain
  `bunx @better-auth/cli generate` — **never `bunx --bun`** (segfault reports); avoid combining
  `--bun` + `cacheComponents` + `getSession` in a page component. The CLI needs the auth
  instance exported as `export const auth` (or default export).
- **Drizzle: `drizzle-orm` 0.45.x** (1.0 is beta — skip). `dialect: "postgresql"` in
  `drizzle.config.ts`. Migration workflow: `drizzle-kit push` for fast local iteration,
  `generate` + `migrate` with the SQL files committed once a change is ready (the audit trail).
- **Postgres driver: postgres.js (`postgres`)** — cross-runtime, most mature under Bun. Drizzle's
  `bun-sql` driver over the built-in `Bun.sql` is a possible later swap (faster, Bun-only, less
  battle-tested) — low-risk to revisit since the query builder abstracts the driver.
- **Schema DSL specifics we need:** `text("tags").array()` for `TEXT[]`;
  `jsonb("seed_queries").$type<SeedQueries>()` for typed JSONB; composite PKs via the table
  callback returning `[primaryKey({ columns: [...] })]`.
- **Mailpit:** image `axllent/mailpit`, SMTP `1025`, web UI `8025`; nodemailer transport with the
  `auth` key omitted and `secure: false`.
- **Resend:** pure-JS SDK, Bun-safe (inferred, smoke-test it). Dev/prod switching has no blessed
  pattern — use a tiny `Mailer` interface with Mailpit (nodemailer) + Resend implementations,
  env-switched; same isolation ethos as `SourceAdapter`. (Simpler alternative if Resend-specific
  features are never needed: one nodemailer transport pointed at `smtp.resend.com` in prod with
  the API key as password.)

---

## Step 1 — 2.1 Postgres + Drizzle schema

1. `docker-compose.yml`: `postgres` (pin the current major, e.g. `postgres:17-alpine`; db/user/
   password `ambit` to match `.env.example`'s `DATABASE_URL`) + `axllent/mailpit`
   (`1025:1025`, `8025:8025`). Named volume for pg data.
2. `drizzle.config.ts`: `dialect: "postgresql"`, `out: "./drizzle"`, schema path — comment
   explaining the drizzle-kit (migrations CLI) vs drizzle-orm (runtime) split.
3. `src/server/db/schema.ts` per SPEC §5: `item` (incl. `curation_score`, `aesthetic_tags`,
   `topic_id` FK), `topic` (typed `seed_queries` JSONB), `user_topic` + `saved_item` (composite
   PKs), `invite`; indexes per §5.6 — call out `idx_item_topic_score` as the feed's draw path.
   IDs are nanoids generated at the app layer.
4. Better Auth core tables (`user`, `session`, `account`, `verification`): scaffold a minimal
   `src/lib/auth.ts` first (the CLI reads it), generate with plain
   `bunx @better-auth/cli generate`, then own the generated definitions in `schema.ts`.
5. First committed migration: `drizzle-kit generate` + `migrate` against the compose DB; use
   `push` for day-to-day iteration afterward. Add `db:migrate` / `db:push` scripts.
6. Repository skeletons `src/server/db/{client,items,feed,saves,topics}.ts`: `client.ts` real
   (postgres.js singleton + drizzle), the rest typed stubs with doc comments describing their
   Phase 3–4 contracts (`upsertItem`, `drawFromTopic(topicId, { scoreFloor, excludeIds, limit })`,
   `getFeedPage`, …) so the shape of the system is visible before it's built.
7. Check in `src/server/config/topic-graph.json`: transform `phase0/topic-graph.json`'s keys to
   the slug topic ids (tiny one-off script or hand-edit — 16 keys), keeping the metadata block
   (`model`, `note`, `builtFrom`).
8. Teaching pass: `schema.ts` explains the Drizzle idioms as they appear (pgTable callback,
   `$type<>`, composite PKs, why FKs are `text`); the compose file explains each service.

***Done =** `docker compose up` + migrate from a clean volume works; schema matches SPEC §5.*

## Step 2 — 2.2 Better Auth + invite gating

1. Flesh out `src/lib/auth.ts`:
   `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema }), emailAndPassword: { enabled: true, sendResetPassword } })`;
   add `serverExternalPackages: ["better-auth"]` to `next.config`.
2. Invite gate in `databaseHooks.user.create.before`: look up the `invite` row for the email;
   throw `APIError("BAD_REQUEST", …)` with a polite message if absent; flip `status` →
   `accepted` on success (after-hook or same transaction).
3. Mail: `src/server/services/mailer.ts` — the `Mailer` interface + `MailpitMailer` (nodemailer,
   no auth, `secure: false`) and `ResendMailer` (Resend SDK) implementations, env-switched.
   `sendResetPassword` uses it fire-and-forget (see the timing note above).
4. Catch-all `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler`; client
   `src/lib/auth-client.ts` via `createAuthClient` (`better-auth/react`).
5. `middleware.ts`: `getSessionCookie` optimistic redirect off `/feed`, `/saved`, `/onboarding` →
   `/`; comment explaining optimistic-vs-real validation (real `getSession` checks land with the
   pages and tRPC `protectedProcedure` in Phases 4–5).
6. `scripts/invite.ts` + `"invite": "bun run scripts/invite.ts"` — upsert an invite row by email.
7. Skip `requireEmailVerification` — the invite list is the trust anchor (SPEC §3.1).
8. Teaching pass: `auth.ts` gets the fullest comments — what Better Auth owns (hashing, sessions,
   tokens) vs what we own (invite policy, mail transport, route protection).

***Done =** full loop locally: invite → sign-up with password → session; uninvited sign-up
politely refused; forgot-password mail lands in Mailpit and resets successfully.*

## Step 3 — 2.3 Topic seed data (16 validated topics)

1. **The v1 topic set** (settled 07-17-26; graph key → slug id → chip label):
   | Graph key | id | Chip label |
   |---|---|---|
   | Ancient history, Architecture, Astronomy, Botany, Ceramics, Geology, Machines, Music, Mythology, Poetry, Textiles, The ocean, Typography | slugified (`ancient-history`, `the-ocean`, …) | unchanged (13 topics) |
   | Cartography | `cartography` | **Maps** (the handoff's term) |
   | Portraiture | `portraiture` | Portraiture (not in the handoff's 32 — graph-validated topics win) |
   | Zoology | `zoology` | Zoology (ditto) |
2. `src/server/config/topics.ts`: checked-in config `{ id, label, seedQueries }` with seed
   queries ported from `phase0/harvest.ts`'s `TOPICS` block for **all five v1 sources**
   (supersedes BUILD_PLAN's original "three sources first" note — adapters simply come online
   per phase and ignore queries for sources that don't exist yet).
3. `scripts/seed-topics.ts` (`bun run db:seed`): upsert by id, idempotent.
4. Teaching pass: comment on why seed queries are config-not-freeform (SPEC §3.2) and how a
   topic id threads through the system: `topic` table → `topic-graph.json` keys →
   `item.topic_id` → `user_topic`.

***Done =** `topic` table seeded with 16 rows; labels match the mapping above; a second seed run
is a no-op.*

## Verification

- **Clean slate:** `docker compose down -v && docker compose up -d && bun run db:migrate &&
  bun run db:seed` succeeds end-to-end from nothing.
- **Auth loop by hand:** `bun run invite you@example.com` → sign-up → session visible;
  an uninvited email is rejected with the hook's message; password reset opens in Mailpit
  (localhost:8025) and completes.
- **Idempotency:** second `db:seed` and second `migrate` are no-ops.
- `bun run check` + CI stay green; final eyeball diff of `schema.ts` against SPEC §5.

## Out of scope

Phase 3 (source adapters, curation service, ingestion job) gets its own plan. No items are
ingested in Phase 2 — the `item` table stays empty; `/feed` still shows the scaffold page.
