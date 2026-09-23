# Phase 8.2 walkthrough — ops guardrails + beta invites

Companion to `docs/PHASE8_PLAN_8.2.md`. The plan says what to do; this says what actually
happened, what it proved, and every trap hit along the way. Written during execution, not after —
the numbers below are the ones observed at the time, not reconstructed.

**Status: the guardrails are all shipped and proven — T1–T2 built 09-17-26 on `feat/8.2-ops`
(agent), merged as PR #20 and deployed by Ben at ~03:00 UTC 09-18-26 (`/api/health` →
`commit a472e7a`); T3.0 was found already done; T3.1–T5 done by Ben's hands in one sitting on
09-20-26, every alert path exercised. T6 — the beta week — is open: the first friends are in
(3 accounts, 4 invites), the feedback file is waiting for rows, and 6.5's triage closes the phase.**

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

## T3.0 — the task timeout was already raised (verified 09-18-26)

The plan's first step was done on 09-10-26 from the database side (`.cache/coolify-ingest-task.sh`,
log 09-10) and never ticked. Read off the host on 09-18-26:

```
name                 timeout  enabled  frequency
img-warm             10800    f        monthly
ingest               10800    t        30 1 * * *
```

Proof it holds: `/app/.cache/ingest-2026-09-18.log` (the 01:30 UTC nightly, on the pre-8.2 code)
ends with the full per-source table and `elapsed: 2719.8s` — a 45-minute run that the old 300 s
job would have killed and recorded `failed`. Nine search sources all offered rows (`errors 0`
throughout), ten walks all offered, no dead source, 53 inserted, 145 memberships. So
*Scheduled Tasks → Failure* is safe to enable in T3.3.

## T3 — Coolify notifications through Resend (09-20-26, Ben's hands)

**Done:** a second Resend key, `coolify` (sending access only, restricted to
`ambit.benreilly.io`; one key per consumer so either rotates alone), pasted into Coolify's
team-level _Notifications → Email_. The shared from-fields — Coolify 4.3.14 keeps _From Name /
From Address / Recipients_ above both the SMTP and Resend sections, and the Resend section is only
an enable toggle and the key — carry `Ambit Ops <ops@ambit.benreilly.io>` and Ben's address;
_Use instance settings_ off. The test notification arrived. Under the events, one toggle was off
and is now on: **Container Status Changes** — everything else the plan wanted was on by default
(Deployments → Failure, Backups → Failure, Scheduled Tasks → Failure, Server → Unreachable,
Server → Disk Usage at Coolify's 80 % / `0 23 * * *`), and every _Success_ toggle stays off.

**Proven (3.4):** a disabled scheduled task `fail-probe` with command `false`, _Execute now_. The
mail was in the inbox at **17:16 local**, from `Ambit Ops <ops@ambit.benreilly.io>`:

> **Subject:** `Coolify: [ACTION REQUIRED] Scheduled task (fail-probe) failed.`
> Scheduled task (fail-probe) was FAILED with the following error: SSH command failed with exit
> code: 1 — _Click here to view the task._

So the mail carries the task name and the exit code, which is what makes it useful: a nightly
that dies on a dead source reads `exit code: 2` (`runVerdict`), a crash before the verdict reads
`1`. The task was deleted afterwards. 3.5, _Backups → Failure_, cannot be forced without breaking
a backup and is recorded as configured, not exercised.

## T4 — the outside view: UptimeRobot (09-20-26, Ben's hands)

Two monitors on the free tier, both on `https://ambit.benreilly.io/api/health`, checking from
**North America — Ashburn, USA** (`178.156.189.249`), which is the point: nothing on the LAN can
see the tunnel or the WAN go down.

- **`ambit/health`** — HTTP(s), every 5 min, alert on non-200.
- **`ambit/ingest`** — keyword, every 30 min, keyword `"ingest":"ok"` (quotes and colon exactly),
  **alert when absent**. Created the morning after health first read `ok` (09-19), so it never
  alerted on the pre-8.2 `never`.

**Proven (4.4)** by editing the keyword to `"ingest":"nope"` and restoring it:

| | UptimeRobot's clock |
|---|---|
| Incident started (root cause _Keyword Does Not Exist_) | 2026-09-20 12:40:22 |
| Resolved | 2026-09-20 12:42:44 |
| Duration | 2 min 22 s |

Both mails arrived; the recovery one reads "The latest incident has been resolved and your monitor
is up again in North America." The health contract this rests on: `ingest` **never changes the
status code**, so the HTTP monitor stays green through a stale ingest and the keyword monitor is
the only thing that sees it.

## T5 — Beszel sees VM 202 (09-20-26)

`archive-host` is on the hub (`https://beszel.home.benreilly.io`) as a **standalone `docker run`**
on VM 202 — deliberately not a Coolify resource, so a Coolify reset can never take the monitor
with it — host network, `docker.sock:ro`, `HUB_URL=http://192.168.1.200:8090` (the LAN IP, never
localhost), the hub's public `KEY` and the universal `TOKEN`. Two scripts, both under the
gitignored `.cache/`: `beszel-agent.sh` (runs on the VM; holds the two secrets; idempotent —
`docker rm -f` then `docker run`, the data volume survives) and `beszel-agent-install.sh` (runs
on the Mac; refuses while the placeholders are unfilled, `scp`s the script up, runs it, deletes
the copy). Written that way because a long pasted line wraps and fails silently in Ben's terminal
— A.6's costliest lesson, still true. **One trap of my own making:** the installer's guard grepped
the whole script for `PASTE_KEY_HERE` and matched its own `if [ "$KEY" = 'PASTE_KEY_HERE' ]`
line, so a correctly filled file was refused; fixed to test the two assignment lines only.
`docker ps` on the host: `beszel-agent Up`, hub green with the container list. **5.3 needed
nothing:** the app container's log driver was already `json-file` / `max-size 10m` / `max-file 3`
(Coolify's default; read 09-18), a 30 MB ceiling. The vault has the `archive-host` row and #34's
note that Ambit wants Beszel alerts once a channel exists.

## What 8.2 proved, and the numbers (09-20-26)

- **Every alert path has fired once on purpose:** a failing scheduled task → mail in minutes; a
  missing keyword → alert and recovery by mail in 2 min 22 s; a server throw → one JSON line and
  one mail (T2, locally against Mailpit; production carries `OPS_EMAIL` since 09-18). The one path
  not exercised is a backup failure, by choice.
- **Two nightlies on the 8.2 code, both `exit_code 0`:** 09-19 (`inserted 44`, 2,702 s) and 09-20
  (`inserted 25`, 2,727 s) — ~45 min each, the corpus growing slowly now that every walk source is
  at budget. `/api/health` → `"ingest":"ok"`, `lastIngestAt 2026-09-20T02:15:29Z`.
- **Production on 09-20:** 196,833 items / 636,780 memberships; image cache **195,483 files /
  27 GB**, VM root disk 62 % (43 GB free); **3 accounts, 4 invites (3 accepted, 1 pending), 12
  collections, 49 topic picks, 2,768 seen rows.** The friends came in from 09-17, before 8.3/8.4
  (the 09-01 gate on T6 was overtaken by Ben's own hand).
- **The twenty personas were not on production until tonight** — the user count of 3 said so,
  whatever the 09-12 note claimed. Ben ran `.cache/seed-personas-prod.sh` after T7's first
  read: `personas: 20 created, 0 updated, 0 unchanged`; verified from the database — **23
  accounts, 20 `persona-*@ambit.local`, `user_topic` 49 → 154**. Those 20 are readers of the
  feed from twenty chairs, not beta users; the beta count stays 3.
- **Spend:** T3–T5 cost nothing but the UptimeRobot free tier; the nightly's OpenRouter spend is
  the curation of ~25–50 new items a night.

**What 8.2 deliberately does not do:** no Sentry/GlitchTip (D4; the trigger is SPEC §15's — more
than ~5 active users, or the first error the hourly throttle hides), no Beszel alerting or push
channel (homelab #34, now wanted by two projects), no client-side error reporting (9.5), no
invite admin page (9.9).

## Next — the beta week (T6.4–6.5)

1. **Each morning, four glances:** UptimeRobot's status page; the inbox (any Coolify/ops mail is a
   finding); OpenRouter's usage page; and on VM 202 `du -sh .cache/img` + `select count(*) from
   item` + the newest `ingest_run` row (`exit_code 0`). One line here if any of them moved.
2. **`docs/BETA_FEEDBACK.md`** gets a row per thing a friend says, in their words, with the screen.
3. **6.5 at the end of the week (agent):** every row triaged — "9.x" rows into BUILD_PLAN Phase 9
   with the row's date as provenance, "fix now" rows listed at the top of this file, "no" rows kept
   with a one-clause reason. That closes 8.2's row in BUILD_PLAN.

**The week's reads** (VM 202 half by the agent, read-only; UptimeRobot / inbox / OpenRouter are
Ben's glances and are not recorded here unless something fired):

- **09-22:** three nightlies on the 8.2 code, all `exit_code 0` (09-20 `inserted 25`, 09-21 `71`,
  09-22 `61`; ~45 min each; `per_source` identical night to night — the four budget walks report
  `complete:false` with the same retry counts every run, which is the standing profile, not a
  fault). Health `ok`, `lastIngestAt 2026-09-22T02:15:26Z`, commit `a472e7a`. **196,965 items**
  (+132 in two nights), image cache **195,485 files / 27 GB** (+2), root disk 62 % / 43 GB free —
  all unchanged in shape. 23 accounts; `invite` reads 24, up from 4, which is the 20 persona
  sign-ups of 09-20 and not new beta invites. No feedback rows yet.
