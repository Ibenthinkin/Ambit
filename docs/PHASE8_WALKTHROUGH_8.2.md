# Phase 8.2 walkthrough — ops guardrails + beta invites

Companion to `docs/PHASE8_PLAN_8.2.md`. The plan says what to do; this says what actually
happened, what it proved, and every trap hit along the way. Written during execution, not after —
the numbers below are the ones observed at the time, not reconstructed.

**Status: T1–T2 built 09-17-26 on `feat/8.2-ops` (agent). Not deployed** — T2.5's deploy, and all
of T3–T5, are Ben's hands. T6 (the beta week) and T7 (close) follow.

## T1 — the ingest verdict and the run record (09-17-26)

**Built:** `runVerdict()` in `services/ingest-plan.ts` (exit 2 names the dead sources, printed
last as `ingest verdict: FAILED — dead sources: …`); the `ingest_run` table (migration
`0008_ingest_run.sql`, indexed on `finished_at`), written by `scripts/ingest.ts` at the end of every
real run and on the throw path with the message; `/api/health` gains `ingest` + `lastIngestAt`.

**Three things that differ from the plan / handoff text, each for a reason:**

1. **A dead walk is `offered === 0 && errors > 0`, not `walked === 0 && errors > 0`.**
   `runWalk` counts a page as walked *before* asking for it, so a walk whose first page fails every
   retry reads `walked 1 / offered 0 / errors 1` — the handoff's rule would have called the one case
   it exists for healthy. The same rule catches a walker that rejected outright (`walked 0 /
   errors 1`) and one whose every post failed `toItem`. Tests pin all three.
2. **A search source recorded as `searched 0 / errors 1` is dead too.** That is how `main()`
   records a source whose whole promise rejected — it crashed before a search could be counted.
   `searched 0 / errors 0` (parked poetrydb) still reads idle.
3. **`ingest` can also be `"unknown"`** — when the `ingest_run` read throws (the migration has not
   run, the database is down). Reporting `never` there would be a claim about the corpus the probe
   cannot make. It still never changes the status code; the monitor's keyword `"ingest":"ok"`
   fails on it exactly as it should.

**Observed locally:**

| Run | Exit | Verdict line | `ingest_run` rows |
|---|---|---|---|
| `bun run ingest --quota 1 --skip-llm --dry-run` (all sources, 72.5 s) | 0 | absent | 0 (dry run writes none) |
| `bun run ingest --source poetrydb --skip-llm` (real, writes no items) | 0 | absent | +1: `exit_code 0, inserted 0, dry_run f, per_source {"search":{"poetrydb":{…searched 0}}, "walk":{}, "deadSources":[]}` |
| `SMITHSONIAN_API_KEY=not-a-real-key … --source smithsonian --quota 1 --skip-llm --dry-run` — the 08-29 smoke, re-enacted | **2** | `ingest verdict: FAILED — dead sources: smithsonian`, after a table row reading `searched 34 / offered 0 / errors 34` | 0 |

A real run under `--source` writes a row like any other: the health field asks "has an ingest
succeeded lately", not "did the cron fire". Worth knowing before reading `ok` the morning after a
manual top-up.

## T2 — server errors, written down and mailed (09-17-26)

**Built:** `services/error-report.ts` (`formatServerError`, `ErrorThrottle`, `reportServerError`;
16 tests), `OPS_EMAIL` in `src/env.js` + `.env.example`, and `src/instrumentation.ts`
(`onRequestError`, nodejs-only, dynamic imports).

**One trap in the plan's local proof:** the probe route it names, `src/app/api/_boom/route.ts`,
can never be requested — an App Router folder whose name starts with `_` is a *private folder*
and is excluded from routing. The probe used `src/app/api/boom-probe/route.ts` instead, and was
deleted before committing (`grep -rn "boom-probe\|_boom" src/` is empty).

**Observed locally** (`OPS_EMAIL=ben@example.test bun run dev`, two requests three seconds apart,
the first with `?token=SECRET` on it):

```json
{"level":"error","at":"2026-09-17T16:33:43.530Z","method":"GET","path":"/api/boom-probe","routeType":"route","routePath":"/api/boom-probe","message":"boom-probe: deliberate server error","stack":"    at GET (/Users/ben/Dev/ambit/.next/dev/server/chunks/[root-of-the-server]__12o4m_3._.js:50:15)\n    at do (…app-route-turbo.runtime.dev.js:5:40319)\n …8 frames"}
```

- One line per request (two lines), both on stderr.
- **One** mail in Mailpit — `[ambit] server error: boom-probe: deliberate server error` to
  `ben@example.test`; the second request was throttled.
- The query string, and so the fake token, appears in neither.
- No `digest` on a route-handler throw: Next assigns digests to errors React processes (renders),
  so expect the field on a page error and not on an API one.

## Next — Ben's hands

1. **Before the deploy:** Coolify → Ambit → Environment → add `OPS_EMAIL` = your address.
2. **Deploy in daytime**, not during an ingest or a warm — check
   `ssh ben@192.168.1.202 'cat ~/img-warm-round4.log'` first (the warm started 09-17 12:25 runs
   ~3.7 h). The boot path runs migration `0008` itself.
3. **After:** `curl -s https://ambit.benreilly.io/api/health` → `commit` is the merge,
   `"ingest":"never"` until the next 01:30 UTC nightly, `"ok"` the morning after.
4. Then T3 → T5 from the plan.
