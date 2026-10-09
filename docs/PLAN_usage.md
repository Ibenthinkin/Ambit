# Usage data for the beta — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Written:** 10-09-26 (overnight) by Fable 5.1 (planning session), base `main` at `d499803`,
branch `feat/usage` — a plain branch in `~/Dev/ambit`, never a worktree. **Not approved yet:**
Ben reads `docs/DESIGN_usage.md` first and overrules the ⚖️ marks there; the plan then executes
in a cheaper session.

**Goal:** `docs/DESIGN_usage.md` — a report over the tables that already exist (Cut 0), then a
first-party `usage_event` table fed by a beacon from the client under a closed vocabulary, with
the report extended to read it (Cut 1). No third party, no identity, said out loud.

**Two cuts, one branch, one deploy** (ruled 10-09-26: straight through). Cut 0 (Tasks 2–4)
touches no schema; Cut 1 (Tasks 5–12) adds migration 0015, the route, the client queue, the call
sites and the report sections. Commit per task; push at the end for Ben's look; merge and deploy
on his word.

**Spec:** `docs/DESIGN_usage.md`. Read it first; this plan does not repeat the reasoning.

## Global constraints

- TDD: the test first, watched to fail, then the code. `bun run test` per task;
  `bunx prettier --write <files>` then `bun run check` before each commit. Commit per task with
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- **Teaching comments** (Ben is a returning webdev): explain the idiom where one appears —
  `sendBeacon` vs `fetch` on `pagehide`, a window function's gap-and-island (sittings), a
  `visibilitychange` accumulator, why a route handler and not tRPC here, an `Origin` check.
- **Posture is a test.** `src/config/usage.test.ts` pins the vocabulary; `route.test.ts` proves
  that an unknown kind, an unknown meta key, a 51st event, a stale `at` and a foreign `Origin`
  are all dropped (and still `204`); `schema` has no `ip`/`ua`/`url` column (assert in the
  migration review, not a test).
- Design-system guards that fail a careless change: `src/no-rounded.test.ts`,
  `src/no-dangerous-html.test.ts`, no `font-semibold`, green only for SPEC §10's seven jobs.
- **Envless CI:** every new `db/*.ts` and route module dynamic-imports `./client` / `~/env` as
  the existing ones do (see `trpc.ts`'s `createTRPCContext` comment). A static import crashes
  `bun run test` in CI.
- `bun run e2e:prod`, never `bun run e2e`; `lsof -ti:3000` first. After Task 10 the suite also
  runs in CI's shape (CLAUDE.md's recipe), because the beacon runs on every screen the specs
  visit.
- `services/feed.integration.test.ts`'s cursor-stability test fails ~1 in 10 locally on a
  foreign-key error from a parallel suite; it is not evidence about this branch (CLAUDE.md).
- **Personas and e2e accounts are never readers.** Every report query excludes
  `personaEmail(slug)` for each of `PERSONAS` (`config/personas.ts`) and `ambit-%@example.com`.

## Review focus

1. Nothing at request time reads `usage_event` (Task 5): grep for the table outside `db/usage.ts`
   and the scripts.
2. The beacon can never make the app slower or louder: the queue is fire-and-forget, the route
   answers `204` on every path, and a thrown insert is one log line (Task 7).
3. The vocabulary file is the whole truth — every `track()` call site names a kind and meta keys
   that `usage.test.ts` lists (Task 9).

---

## Cut 0 — the report over what exists

### Task 1 — ~~Tell the friends~~ (struck 10-09-26)

Ben's ruling: no install-note paragraph, no `USAGE_RECORDED.md`, no toggle. He tells each
invitee in person; the recording is switched off after the beta (Task 8's `USAGE_ENABLED` flag).
Nothing to do here.

### Task 2 — `db/usage.ts`: the Cut 0 queries (TDD, ~1.5 h)

Pure SQL readers, one function per report section, all taking `{ since, until, excludeEmails }`.
Integration tests in `db/usage.integration.test.ts` using `db/test-fixtures.ts`'s
`insertHomedItems` plus hand-inserted `seen_item` / `saved_item` / `session` /
`interview_answer` rows under two fresh users (delete in `afterAll`, like the other suites).

- [ ] 2.1 `readersActive({since, until})` → per user: `{ userId, days: number, served: number,
  saves: number, firstAt, lastAt }` from `seen_item` + `saved_item`. Test: two users, one served
  on two days, the other on one; counts exact.
- [ ] 2.2 `sittings({since, until, gapMinutes = 30})` → per user per sitting: `{ startedAt,
  endedAt, served }` — **gaps-and-islands** over `served_at` with `lag()`; a gap ≥ 30 min starts
  a new sitting. Test: four timestamps at 0, 5, 50, 52 min → two sittings of 2 items each.
- [ ] 2.3 `savesPerHundred({since, until})` → `{ served, saves, perHundred }` across readers.
- [ ] 2.4 `onboardingRuns({since, until})` → per user: runs (`count(distinct run_id)`), skipped
  questions in the latest run (`answer = '{skip}'`), free text present (`text is not null`).
- [ ] 2.5 `signIns({since, until})` → per day: `count(session)`, `count(distinct user_id)`.
- [ ] 2.6 `sourceShare({since, until})` → per source: share of `seen_item` rows vs share of
  `item` rows (`type = 'image'`, score ≥ 4, not `SUSPENDED_SOURCES`) — is the feed over-showing
  a source. Test: two sources with 3:1 corpus and 1:1 served → ratios 0.67 / 2.0.
- [ ] 2.7 `retentionByWeek({weeks = 6})` → per ISO week: active readers, and of those how many
  were active the week before. Test: three users across two weeks → `{ active: 2, returning: 1 }`
  on the second.
- [ ] 2.8 `bun run check`; commit `feat(usage): the Cut 0 readers`.

### Task 3 — `services/usage-report.ts` + `scripts/usage-report.ts` (TDD, ~1 h)

- [ ] 3.1 `renderReport(sections: ReportData): string` — pure, no DB — prints markdown with
  one `##` per section in this order: Readers · Sittings · Saves · Onboarding · Sign-ins ·
  Sources · Retention. Numbers as tables; a reader is `#3 (joined 09-20)` by `user.created_at`
  order, never an email (the digest may be pasted into a chat). Test with a hand-built
  `ReportData`: snapshot the markdown (`toMatchInlineSnapshot`).
- [ ] 3.2 `scripts/usage-report.ts`: `--days N` (default 7), `--weeks N` (default 6) for
  retention; resolves the exclusion list (`PERSONAS` → `personaEmail`, plus the e2e pattern),
  calls the Task 2 readers, prints `renderReport`, `process.exit(0)`. Header comment in the
  `scripts/invite.ts` tone: what it is for, how to run it on production
  (`docker exec "$C" bun run usage:report`), what it never prints.
- [ ] 3.3 `package.json`: `"usage:report": "bun run scripts/usage-report.ts"`.
- [ ] 3.4 Run it locally against the dev database; paste the output into the commit body.
  Commit `feat(usage): usage:report, Cut 0`.

### Task 4 — Cut 0 done-bar

- [ ] 4.1 `bun run check` green; `bun run e2e:prod` unaffected (no client change) — skip.
- [ ] 4.2 SPEC §13 gains one line under the ops table: the report, how it is run, 90-day
  retention (the number applies from Cut 1; say so).
- [ ] 4.3 `.cache/usage-report-prod.sh` for Ben: `C=$(ssh … docker ps -q --filter publish=3000)`
  then `docker exec $C bun run usage:report --days 7` (reads only). Not committed (`.cache/` is
  git-ignored).
- [ ] 4.4 ~~Stop here for Ben's word~~ — ruled 10-09-26: continue straight into Cut 1.

---

## Cut 1 — the event table

### Task 5 — Schema + migration 0015 (~45 min)

- [ ] 5.1 `src/config/usage.ts` (no imports — a leaf the client bundles): `USAGE_KINDS` as a
  const tuple of the fourteen kinds; `SCREENS` tuple; `META_KEYS: Record<Kind, readonly string[]>`
  (the closed keys per kind, exactly the design's table); `MAX_EVENTS_PER_BEACON = 50`;
  `USAGE_RETENTION_DAYS = 90`; `FLUSH_MS = 15_000`. Teaching comment: why a vocabulary is config.
- [ ] 5.2 `src/config/usage.test.ts`: every kind in the design's table is present and no other;
  every `META_KEYS` entry names only keys the design lists; `screen.open`'s screens equal `SCREENS`.
- [ ] 5.3 `schema.ts`: `usageEvent` exactly as the design's SQL — nullable `userId` (cascade),
  `visit`, `kind`, `at` (tz), `screen`, `itemId` (cascade), `topicId`, `meta` jsonb; indexes
  `(user_id, at)` and `(at)`. Comment in the `seenItem` register: what it is, what it is **not**
  (no ip/ua/url columns, by construction), who reads it (scripts only).
- [ ] 5.4 `bun run db:generate` → `drizzle/0015_usage_event.sql`; read it; `bun run db:migrate`
  locally. Commit `feat(usage): usage_event (migration 0015)`.

### Task 6 — `db/usage.ts`: the writer and the Cut 1 readers (TDD, ~1.5 h)

- [ ] 6.1 `recordEvents(rows: NewUsageEvent[])` — one multi-row insert; never throws (catch,
  one `console.error` line with the count, return). Test: 3 rows land; a row with a dead
  `item_id` is kept with `item_id` set to null before the insert (ruled 10-09-26: the event
  still counts; the batch never fails for one dead id) — test that a batch of three with one
  dead id lands all three, one of them item-less.
- [ ] 6.2 `pruneEvents(olderThanDays)` → deleted count.
- [ ] 6.3 Readers, each `{since, until, excludeEmails}`: `visits()` (count, median and p90 of
  `visit.end.seconds`, device split, `via` split, standalone share), `screensPerVisit()`,
  `itemOpens()` (per visit; `from` split; **swipe depth** = the length of consecutive
  `item.open{from: rail}` runs within a visit, median and max), `itemActions()` (linkout, share
  by method, zoom, magazine, unsave — each per 100 item opens), `topicEdits()` (by action),
  `onboardingFunnel()` (readers reaching each step 1–8 in their latest visit that touched
  onboarding; where the last step was), `installs()` (by `how`), `clientErrors()` (by digest,
  with the screen). Integration tests: one fixture visit with a known sequence; assert each
  number.
- [ ] 6.4 Commit `feat(usage): the event writer and readers`.

### Task 7 — `POST /api/usage` (TDD, ~1.5 h)

`src/app/api/usage/route.ts`, tests in `route.test.ts` (mock the session and the writer, like
`api/health/route.test.ts` mocks its checks).

- [ ] 7.1 Zod: `{ visit: string(8..32), events: array(max 50) of { kind ∈ USAGE_KINDS, at: ISO,
  screen?: ∈ SCREENS, itemId?: string(≤32), topicId?: string(≤64), meta?: object } }`; `meta`
  is validated **per kind** against `META_KEYS` with `.strict()` — an unknown key fails the
  event, not the batch.
- [ ] 7.2 Order of checks, each a test: (a) `Origin` header must equal the app's origin
  (`new URL(env.BETTER_AUTH_URL).origin`; absent → reject) → `204`; (b) `RateLimiter` 30/min keyed
  on `user.id ?? trustedClientIp ?? "unknown"` → `204`; (c) body > 64 KB → `204`; (d) zod per
  event, invalid events dropped, valid ones kept; (e) `at` clamped to `[now − 1 h, now]`;
  (f) `userId` from `auth.api.getSession`, null when signed out — **signed-out events are kept
  only for `visit.*` and `screen.open`**, everything else dropped (design posture 6);
  (g) `recordEvents`; (h) always `204` with `Cache-Control: no-store`. One `console.warn` line
  when anything was dropped, with counts, never contents.
- [ ] 7.3 `proxy.ts`: nothing to add (`/api/usage` is not an authed prefix; the CSP matcher
  already covers it). `sw.ts` / `lib/sw-rules.ts`: `/api/usage` must hit **`NetworkOnly`** — add
  the predicate test in `sw-rules.test.ts` (a beacon must never be cached or replayed).
- [ ] 7.4 Commit `feat(usage): POST /api/usage`.

### Task 8 — `lib/usage.ts`: the client queue (TDD, ~1.5 h)

Pure where it can be: the queue and the visit clock take injected `now`, `send`, `storage`.

- [ ] 8.1 `createUsage({ send, now, storage })` → `{ track(kind, props), flush(), start(entry),
  end() }`. `visit` = `storage.get("ambit.visit")` or a new nanoid written there
  (`sessionStorage`: per tab, gone when the tab closes — the teaching comment says why not
  `localStorage`). `track` appends `{ kind, at: now(), …props }`; `flush` sends when the queue is
  non-empty, at most 50 per call; a timer every `FLUSH_MS`. Tests: batching, the 50 cap, an
  empty flush sends nothing.
- [ ] 8.2 The visit clock: active seconds accumulate only while `document.visibilityState ===
  "visible"`; `end()` tracks `visit.end{seconds}` and flushes. Test with a fake clock and
  visibility toggles.
- [ ] 8.3 `send` in the browser: `navigator.sendBeacon("/api/usage", new Blob([json], { type:
  "application/json" }))`, falling back to `fetch(..., { keepalive: true })` when `sendBeacon`
  is absent. Note in a comment: a `Blob` with an explicit JSON type is what makes the beacon
  carry `Content-Type` (a string body is sent as `text/plain`).
- [ ] 8.4 `components/usage/usage-provider.tsx`: a client component mounted once in
  `app/layout.tsx` beside `SwCleanup` — **only when `NEXT_PUBLIC_USAGE_ENABLED` is `"1"`**
  (`env.js` client section; unset = nothing mounts, nothing is tracked, the route still answers
  `204`). This is the after-beta off switch: one env var on Coolify, one redeploy; on mount `start(entry)` with `device` from
  `useMediaQuery("(min-width: 768px)")` (the same `md` as everything else), `standalone` from
  `matchMedia("(display-mode: standalone)")`, `via` from `document.referrer` (`""` → `direct`,
  same origin → `internal`, else `link` — the host is **not** sent); `pagehide` and
  `visibilitychange → hidden` call `flush()` / `end()`. Exposes `useUsage()` → `track`. A
  module-level singleton so `track` works from any component without prop drilling.
- [ ] 8.5 `screen.open` from one place: `usePathname()` in the provider, mapped to `SCREENS` by
  a pure `screenFor(pathname)` (`/i/…` → `item`, `/profile/topics` → `topics`, …, unknown →
  nothing). Test the map.
- [ ] 8.6 Commit `feat(usage): the client queue and provider`.

### Task 9 — The call sites (~2 h, one commit per surface)

Each is one `track()` line at an existing handler; the test for each is the existing component
test extended with a `useUsage` mock asserting the kind and meta.

- [ ] 9.1 Item screen (`components/item/item-screen.tsx`): `item.open{from}` on the entry item
  (the `from` comes from how the screen was reached: `useLeaveToFeed`'s `entryItem` and a new
  optional `from` prop the feed tile / Saved tile / hang pass; `rail` on every rail advance,
  `wander` on a wander-row tap, `link` when `document.referrer` is foreign and the reader is
  signed out, `explore` from `/explore`); `item.zoom` on the first pinch/double-tap into a zoom;
  `item.magazine{on}` on the spread toggle; `item.linkout` on the "Original post/source" button
  and the desktop prose link.
- [ ] 9.2 Share (`sheets/share-sheet.tsx`, `item-shell.tsx`): `item.share{method}` on a
  successful `navigator.share`, copy, or image save.
- [ ] 9.3 Saved (`saved/saved-screen.tsx`): `item.unsave` on the unsave mutation's success.
- [ ] 9.4 Topics (`profile/topics-screen.tsx`): `topics.edit{action}` on add / remove /
  level, with `topicId`.
- [ ] 9.5 Onboarding (`onboarding/onboarding-screen.tsx`): `onboarding.step{step, action}` on
  each advance / skip / back; `onboarding.retake` on "Retake the questions" / "Start over".
- [ ] 9.6 Install (`components/install/*`, `lib/install-store.ts`): `pwa.install{how}` — on
  `beforeinstallprompt` accepted (`prompt`), the card's own Add (`card`), and the window
  `appinstalled` event (`appinstalled`).
- [ ] 9.7 Errors: `app/error.tsx` (new — the app has none; a plain "Something went wrong /
  Back to the feed" in the design system, sentence case, white button) tracks
  `client.error{digest}` with `error.digest ?? "no-digest"` and the current screen. The
  `~offline` page tracks `screen.open{offline}` through the provider's map, nothing more.
- [ ] 9.8 `bun run e2e:prod` green; then CI's shape. `security.spec.ts` gains one assertion: a
  `POST /api/usage` with a foreign `Origin` answers `204` and writes nothing (count the rows
  before and after through the e2e helper's db access).

### Task 10 — The report, Cut 1 sections (TDD, ~1 h)

- [ ] 10.1 `renderReport` gains sections in this order after Sources: Visits · Screens · Items ·
  Topic edits · Onboarding funnel · Installs · Errors. Snapshot test extended.
- [ ] 10.2 `scripts/usage-report.ts`: `--prune` deletes rows older than `USAGE_RETENTION_DAYS`
  and prints the count last. Default off.
- [ ] 10.3 `--mail` (ruled 10-09-26): send the rendered digest to `env.OPS_EMAIL` through
  `getMailer()` (`services/mailer.ts`, the 8.2 error-mail path — Resend in production, Mailpit
  locally), subject `Ambit — usage, week of <date>`, the markdown as the text body. Exits 1
  with one line when `OPS_EMAIL` is unset. Test: a `renderMail(report, date)` pure helper
  (subject + body) with a snapshot; the local proof is one mail in Mailpit. **Not scheduled**:
  the Coolify Sunday task is a later five-minute step, once the digest's shape settles.
- [ ] 10.4 Commit `feat(usage): the Cut 1 report`.

### Task 11 — Docs

- [ ] 11.1 SPEC: §5 gains `5.7 usage_event` (the table and the "no identity columns" sentence);
  §7 no change (a route handler, listed in §8.1 beside `/api/health`); §11 one bullet (the
  `Origin` check, the rate limit, what is never stored) ending in the test that proves it;
  §13 the report line from 4.2 updated.
- [ ] 11.2 CLAUDE.md: one Architecture bullet, in the register of the others — the posture in
  two sentences, the vocabulary file, the route, the script, the 90 days, "nothing at request
  time reads it".
- [ ] 11.3 `docs/USAGE_RECORDED.md` re-read against the shipped vocabulary.

### Task 12 — Done-bar

- [ ] 12.1 `bun run check` green; `bun run e2e:prod` green; CI-shape green.
- [ ] 12.2 Push for Ben's look; merge and deploy on his word (the boot runs migration 0015).
- [ ] 12.3 First digest from production after one week: `sh .cache/usage-report-prod.sh`.
  Paste it into `log.md` with the findings; triage anything that moves a design.

## Cut 2 (not planned here)

Scheduling `--mail` on a Coolify Sunday task; blanking `session.ip_address` / `user_agent`.
