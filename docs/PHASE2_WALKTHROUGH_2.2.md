# Phase 2.2 walkthrough — Better Auth + invite gating

A step-by-step account of BUILD_PLAN step 2.2 (`docker-compose.yml` services back up, Better Auth
email + password, invite gating, the Mailer seam, route/client wiring, `proxy.ts` route
protection, the invite script). Ben planned this step in one session (08-06-26, which also
verified Phase 1 was fully complete and produced `~/.claude/plans/jolly-launching-hartmanis.md`)
and asked for it to be executed unattended in a follow-up session on a cheaper model, so this
doc is the detailed "what happened and why" record for a session he wasn't present for. Pairs
with `log.md`'s entry for the same day.

## Getting oriented

1. **Read the saved plan file** (`jolly-launching-hartmanis.md`) — it was written self-contained
   specifically for this handoff: context, the 07-17 `PHASE2_PLAN.md` patterns it builds on, and
   two revisions the planning session's docs research had already surfaced (below). Loaded
   `superpowers:executing-plans` and worked through its 8 numbered pieces as checkpoints.
2. **Docker Desktop wasn't running** — started it (`open -a Docker`), polled until the daemon
   responded, then `docker compose up -d`. Both containers (`ambit-postgres-1`,
   `ambit-mailpit-1`) came up healthy on the **same named volume 2.1 left behind** (`down -v` is
   the only thing that would have wiped it), so the schema from 2.1 was already migrated — no
   fresh-migrate needed, confirmed with a no-op `db:migrate` run anyway.
3. **Branched `phase2.2-auth` off `main`** (conventional branch, not a worktree — per the
   standing preference from Phase 1).

## Piece 0 — deps

4. Bumped `drizzle-orm` 0.41.0 → **0.45.2** and `drizzle-kit` 0.30.6 → **0.31.10** — the plan
   flagged that better-auth 1.6.25's drizzle adapter peer-requires `drizzle-orm ^0.45.2` /
   `drizzle-kit >=0.31.4` (an optional peer, so the old versions would have installed anyway, but
   untested outside that range). Landed exactly on `0.45.2`, the floor of the required range.
5. Added `nodemailer` + `@types/nodemailer` (dev) + `resend`.
6. **Verified the bump didn't touch the schema**: `bun run db:generate` reported "No schema
   changes, nothing to migrate" — the 9-table shape from 2.1 round-trips unchanged through the
   newer Drizzle. `bun run check` green.

## Piece 1 — the Mailer seam

7. `src/server/services/mailer.ts`: a small `Mailer` interface (`send({ to, subject, text,
   html? })`), `MailpitMailer` (nodemailer → `localhost:1025`, no `auth` key, `secure: false`)
   and `ResendMailer` (Resend SDK), matching the `SourceAdapter` isolation ethos the codebase
   already uses for content sources. `getMailer()` picks Resend only when
   `NODE_ENV === "production"` **and** `RESEND_API_KEY` is actually set — falling back to
   Mailpit otherwise so a misconfigured prod env fails loudly (empty inbox) rather than crashing
   at boot.
8. `src/env.js`: added `RESEND_API_KEY` as an **optional** server var (required only for
   `ResendMailer` to activate, not for the app to boot).

## Piece 2 — the auth instance

9. Fleshed out `src/lib/auth.ts` in place:
   - `drizzleAdapter(db, { provider: "pg", schema })` — passes the schema module explicitly (2.1
     left this as a minimal stub without it).
   - `databaseHooks.user.create.before`: looks up the `invite` row by email; throws
     `new APIError("BAD_REQUEST", { message: … })` when absent, otherwise returns `{ data: user
     }` to let creation proceed. `.after` flips that invite's `status` to `"accepted"`.
   - `emailAndPassword.sendResetPassword`: fire-and-forget (`void getMailer().send(...)`,
     commented with the timing-attack rationale from the plan) — had to make the callback
     `async` for TypeScript (Better Auth's type expects a `Promise<void>` return even though the
     body itself doesn't await anything).
   - `next.config.js`: added `serverExternalPackages: ["better-auth"]`.
10. `bun run typecheck` caught the missing-`async` issue immediately; one-line fix.

## Piece 3 — route + client

11. `src/app/api/auth/[...all]/route.ts`: `export const { GET, POST } =
    toNextJsHandler(auth)`.
12. `src/lib/auth-client.ts`: `createAuthClient()` from `better-auth/react` — **no `baseURL`
    passed**, deliberately, since client and `/api/auth/*` are always same-origin here (the plan
    sketch had suggested a `NEXT_PUBLIC_BETTER_AUTH_URL` env var, but that would've needed adding
    to the t3-env client schema for no real benefit — Better Auth's client defaults to
    same-origin, which is exactly what this app needs in every environment).

## Piece 4 — route protection

13. **Confirmed the plan's `middleware.ts` → `proxy.ts` revision against live Next.js docs**
    before writing it (Context7, `/vercel/next.js`) — verified `proxy.ts` exporting `proxy()` is
    the current 16.x file convention, and that a `:path*` matcher segment matches the *bare*
    parent path too (zero-or-more), not just sub-paths — a genuine gotcha if it had gone
    unverified, since `/feed/:path*` needs to catch plain `/feed`, not just `/feed/123`.
14. `src/proxy.ts`: `getSessionCookie(request)` → redirect to `/` when absent; matcher covers
    `/feed`, `/saved`, `/onboarding` (each with `/:path*`). Comment spells out the
    optimistic-vs-real-validation split explicitly, per the plan.

## Piece 5 — invite script

15. `scripts/invite.ts` + `"invite": "bun run scripts/invite.ts"` — idempotent upsert-by-email
    (a second run on the same address reports its current status instead of erroring or
    duplicating). Bun resolves the `~/*` path alias in a standalone script run via `bun run`
    without extra config, same as the app itself.
16. Smoke-tested directly against the dev DB: first run → "Invited …"; second run → "already has
    an invite (status: pending) — nothing to do."

## Piece 6 — end-to-end verification (the Done line)

No UI exists yet (that's Phase 5.2), so the whole loop was driven over HTTP directly — backgrounded
`bun run dev`, then `curl` against `/api/auth/*`:

17. **Uninvited sign-up refused**: `sign-up/email` for an un-invited address → `400` with the
    hook's exact polite message.
18. **Invited sign-up succeeds**: `bun run invite ben-e2e@example.com`, then `sign-up/email` →
    `200`, session cookie set (`better-auth.session_token`).
19. **Session is real, invite flipped**: `get-session` with the cookie returns the live session +
    user; `psql` confirms the `invite` row's `status` is now `accepted`.
20. **Password reset, full loop**: `request-password-reset` → `200` (generic "if this email
    exists" response, no enumeration leak) → confirmed the mail landed in Mailpit
    (`GET localhost:8025/api/v1/messages`) → pulled the emailed link, which is Better Auth's own
    `/api/auth/reset-password/{token}?callbackURL=...` redirect endpoint — followed it with
    `curl -D -` (not `-L`) to read the `Location` header rather than actually following the
    redirect, confirming it points at `/reset-password?token=...` exactly as the client-side flow
    expects → `POST /api/auth/reset-password` with that token + a new password → `200`.
21. **Old password now fails** (`401 INVALID_EMAIL_OR_PASSWORD`), **new password signs in**
    (`200`, fresh session token) — the actual proof the reset took effect, not just that the
    reset endpoint returned success.
22. **Proxy redirect verified both directions**: unauthenticated `GET /feed` → `307` to `/`;
    the same request *with* a valid session cookie does **not** redirect (falls through to a
    `404`, since no `/feed` page exists yet — expected, that's Phase 5.4).
23. Stopped the dev server; **`bun run check`** green; **second `db:migrate` confirmed a no-op**
    (drizzle-kit reports the journal as already applied, no new SQL runs).

## Piece 7 — docs + close-out

24. This walkthrough; `BUILD_PLAN.md` 2.2 box checked with a "revised at build time" note
    (`proxy.ts`, the Drizzle bump); `log.md` entry with the session-spend line.
25. **PR's CI build failed on the first push** — not from this session's own changes. `env.js`
    started requiring `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` back in 2.1, but
    `.github/workflows/ci.yml`'s `bun run build` step was never updated to supply them, and 2.1
    was pushed straight to `main` rather than through a PR — so nothing ever ran that build step
    against the new requirement and the gap went unnoticed. `gh run list --branch main` confirmed
    `main` itself has been red since 07-29. Fixed the workflow (placeholder values, since nothing
    in a CI build actually authenticates), re-pushed, CI went green.

## Post-execution finding — main's CI had been broken since 2.1

Discovered only because this was the **first PR opened since the 2.1 commit landed** directly on
`main` (bypassing the pull_request CI trigger entirely). A useful argument for keeping even
solo/paired-session work on a PR rather than pushing straight to `main`, purely so CI actually
runs against it once.

## Notable judgment calls

- **The `middleware.ts` → `proxy.ts` and Drizzle-bump revisions were pre-resolved by the
  planning session**, not decided live here — this execution session's job was to follow the
  plan and verify, not re-litigate settled calls. The one live verification that *did* happen
  (the `:path*` matcher behavior) was a docs-accuracy check on an already-decided approach, not a
  new decision.
- **No decisions were escalated to Ben mid-session** — unlike 2.1 (table-prefix question), 2.2's
  plan didn't leave any open convention forks; everything specified had a single, unambiguous
  implementation.
- **`~/.claude/plans/jolly-launching-hartmanis.md` is a planning-tool artifact, not a repo file**
  — this walkthrough is the durable record; the plan file itself may not persist indefinitely.
