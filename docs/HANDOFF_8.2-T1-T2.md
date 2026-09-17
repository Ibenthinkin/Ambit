# Handoff — Phase 8.2, Tasks T1 + T2 (agent-only code)

_Written 09-17-26 for a cold session. The plan is `docs/PHASE8_PLAN_8.2.md` (decisions D1–D7
locked 08-30-26; nothing ticked). This brief is what the plan could not know because it was
written before 8.1 closed. Read the plan's T1 and T2 sections in full, then this, then start._

## What you are building, in one paragraph

Two code changes so production can no longer fail silently. **T1:** `scripts/ingest.ts` gets a
_verdict_ — today it prints its summary table and `process.exit(0)` whatever the table says — and
writes one `ingest_run` row per real run, which `/api/health` reports as `ingest: ok | stale |
never` with `lastIngestAt`. **T2:** `src/instrumentation.ts`'s `onRequestError` writes every
server error as one structured log line and mails it through the existing Resend mailer, at most
once per error signature per hour, to `OPS_EMAIL`. Both TDD. Both merge to `main`; **T2 rides
the same deploy as T1, and the deploy is Ben's** (T2.5: he sets `OPS_EMAIL` in Coolify first).

## Ground rules (the repo's, not this brief's)

- `CLAUDE.md` is authoritative. Testing is non-negotiable; comment generously (this repo teaches).
- Branch off `main` (**plain branch, not a worktree** — Ben's preference). `main` is at `1a61e7c`,
  clean and pushed. `bun run check` must be green before every commit; it is green now at
  **1,288 tests**, 13 pre-existing lint warnings.
- **A branch push runs no CI** — open a PR to get the two jobs (`check`, `e2e` against a
  production build with Postgres + Mailpit). Merge on green. Do not deploy.
- Local Postgres needs Docker Desktop: `open -a Docker`, then `docker compose up -d` (Postgres +
  Mailpit on `localhost:8025`). Port 3000 must be free (`lsof -ti:3000`).
- Commit messages end with the `Co-Authored-By` line the session gives you. Update `log.md`
  under a `### [[09-DD-26 ddd]]` heading when you commit (format in `CLAUDE.md`; the spend line
  comes from `session-spend.py`, never estimated).

## Facts that moved since the plan was written (08-30)

**Line numbers in the plan are stale.** Use these instead:

| Plan says | Now |
|---|---|
| stat interfaces at `scripts/ingest.ts:118, :195` | `SourceRunStats` is a private `interface` at **`scripts/ingest.ts:147`** (`searched`, `offered`, `errors`, `claims`). Walk stats are **`WalkRunStats` in `src/server/services/walk-run.ts:11`** — already exported, with fields `walked`, `offered`, `errors`, `pageErrors`, `retries`, `seenSourceIds`, `complete`, `items`. |
| `printSummary(...)` | `scripts/ingest.ts:600`, takes one `args` object; `walkStatsBySource: Map<WalkSourceId, WalkRunStats>` is at `:616`. `main()` starts at `:247`; its final `process.exit(0)` is at `:595`. |
| "a walk errored before its first page returned" | That case is already materialised: `main()` at `:359-370` writes `{ walked: 0, offered: 0, errors: 1, pageErrors: 1, retries: 0, complete: false, ... }` for a rejected walker. **Dead walk = `walked === 0 && errors > 0`.** A walk with `pageErrors > 0` but `walked > 0` is a partial run, not dead — the nightly of 09-17 had 14 and 13 page retries on two healthy 13k-row walks. |
| exit paths | Every early exit is `process.exit(1)` (`:117-140`, `:256`, `:787`). **A `CuratorAbortError` (OpenRouter 401/402, or twenty curator fallbacks in a row) exits 1 via the `main().catch` at `:780`** — that is an account problem, nothing written, and T1.3's `catch`-path `ingest_run` row must carry its message. Keep exit 1 for "threw", exit 2 for "ran, but a source is dead" (the plan's verdict code). |
| `bun run db:generate` | exists (`drizzle-kit generate`). **The next migration is `0008`** — `drizzle/0007_topic_facet.sql` is the newest. Read the generated SQL before committing. |
| `src/instrumentation.ts` | does not exist yet. Next is **16.2** (App Router; `src/proxy.ts` is what was `middleware.ts`). `onRequestError` is stable and fires for render / route / action / proxy. |
| `/api/health` | `src/app/api/health/route.ts` — returns `{ ok, db, imageCache, commit }`, 200/503, `Cache-Control: no-store`, `force-dynamic`. `commit` is `SOURCE_COMMIT`. Two test files beside it: `route.test.ts` (7 cases, mocks `db` and the cache dir) and `route.integration.test.ts` (`describe.skipIf(!DATABASE_URL)`). Add `ingest` and `lastIngestAt`; **never change the status code for any `ingest` value** — the monitor (T4) reads the code, a human reads the field. |
| the mailer | `src/server/services/mailer.ts` — `getMailer(): Mailer`, `MailMessage`, `ResendMailer`. Under `NODE_ENV=production` with no `RESEND_API_KEY` it silently falls back to Mailpit; that is the 8.1 trap and why T2's `reportServerError` must **never throw** and must log even when mail fails. `MAIL_FROM` is in `src/env.js:34`; put `OPS_EMAIL` next to it. `.env.example` exists — document `OPS_EMAIL` there as optional. |
| "T3.0 raises the task timeout" | **Already done (09-10-26):** the Coolify ingest task's timeout is 10800 s and it logs to `/app/.cache/ingest-YYYY-MM-DD.log` on the volume. So the exit code **is** visible to Coolify now — T1.2's caveat is moot. What is still true: Coolify's task status was `failed` for every healthy run before that, so the database (`ingest_run`) is the durable witness. |

**Other things the ingest does now that the plan predates** — none change T1's shape, all
matter for the tests and the summary table you will type against:

- The summary table has a per-walk block with a `retries` column (`:685-710`) and prints an
  **un-homed count with a tag histogram** (Cut 1) — `perSource` jsonb should carry the walk
  block too, not only the search block.
- Sources in `SUSPENDED_SOURCES` (`src/server/config/blogs.ts`) are skipped before any stat
  exists; `loupe` and `mossandfog` are there. A skipped source must not read as dead.
  `poetrydb` is parked the same way the plan describes (`searched 0` → not dead).
- `--source <id>` runs one source; `--dry-run` writes nothing (**no `ingest_run` row either**,
  by the plan's contract); `--cursor`, `--quota`, `--skip-llm` exist. The verdict still runs
  under `--dry-run` — that is the smoke test's whole point.
- Curation cache: `.cache/curation`, one JSON per item; the curator now sends
  `max_tokens: 400` (`CURATOR_MAX_TOKENS`, 09-17). Irrelevant to T1 except that a 402 is a
  `CuratorAbortError`, exit 1, not a dead source.

## T1 — what "dead" means, restated with today's fields

```
search-shaped:  searched > 0 && errors >= searched && offered === 0        → dead
walk-shaped:    walked === 0 && errors > 0                                  → dead
anything with searched === 0 (parked, suspended, --source elsewhere)        → not dead
partial errors (Met's normal: searched 34 / errors 3 / offered 54)          → not dead
walk with retries/pageErrors but walked > 0                                 → not dead
```

`runVerdict()` goes in `src/server/services/ingest-plan.ts` (pure, exported, tested in
`ingest-plan.test.ts` — the file exists with `resolveCollisions`, `topicHistogram`,
`tagHistogram`, `planPrune`). It should take plain data — `Map<string, {searched, offered,
errors}>` and `Map<string, {walked, offered, errors}>` — not the script's private types, so the
test needs no fixture. Move nothing out of `scripts/ingest.ts` that you do not have to.

The plan's fallback stands: if a museum legitimately returns nothing at a small quota, tighten to
`searched >= 3`; never special-case a source by name.

## T2 — the two things most likely to go wrong

1. **The Edge bundle.** `instrumentation.ts` is evaluated for every runtime; the mailer imports
   Node-only modules. Guard with `process.env.NEXT_RUNTIME !== "nodejs"` and a **dynamic
   `import()`** of `~/server/services/error-report` — the Next docs' own pattern. Note: the
   repo's ESLint forbids `import()` **type annotations** (`consistent-type-imports`), not
   dynamic imports; a runtime `await import(...)` is fine.
2. **The local proof.** `OPS_EMAIL=ben@example.test bun run dev`, hit the temporary
   `src/app/api/_boom/route.ts` twice, expect one JSON line per hit on the terminal and **one**
   mail in Mailpit. Under `next dev` a route that throws also shows the dev overlay — ignore it.
   **Delete the probe route before committing** and grep for `_boom` to prove it. Do not add the
   probe to `AUTHED_PREFIXES` or anything in `src/proxy.ts`.

Format rule from D4 that the tests must pin: one line, JSON, `message`, `digest` when present,
stack cut to 8 frames, **no request headers** (cookies live there) — `formatServerError` takes the
request only to read method + pathname.

## Done means

- `bun run ingest --quota 1 --skip-llm --dry-run` locally: exit 0, no verdict line, no row.
- `ingest-plan.test.ts` carries the five verdict cases (the 08-29 smoke — `smithsonian` at
  `searched 34 / errors 34 / offered 0` — exits 2 and names it).
- A real local run writes one `ingest_run` row; `/api/health` reads `never` on a fresh database
  and `ok` after; `stale` still answers 200.
- `error-report.test.ts` covers format, throttle (first / second / after an hour / 200-signature
  cap), a rejecting mailer that does not propagate, and no mail without `OPS_EMAIL`.
- `bun run check` green, PR green, merged to `main`. **Not deployed.** Tell Ben: set `OPS_EMAIL`
  in Coolify, Deploy in daytime (not during an ingest or a warm — check
  `ssh ben@192.168.1.202 'cat ~/img-warm-round4.log'` first; a warm started 09-17 12:25 runs
  ~3.7 h), then `/api/health` shows `ingest: "never"` until the next 01:30 UTC nightly.
- `log.md` entry; tick 1.1–1.5 and 2.1–2.5 in `docs/PHASE8_PLAN_8.2.md`; note the observed
  error line in a new `docs/PHASE8_WALKTHROUGH_8.2.md` (start it — the A.6 shape, see
  `PHASE8_WALKTHROUGH_8.1.md`'s first paragraph).

## What is not yours

T3–T5 (Coolify notifications, the external monitor, Beszel) are Ben's hands. T6 is the beta
week. Anything about sources, the feed, or the tag-alias design is a different thread.
