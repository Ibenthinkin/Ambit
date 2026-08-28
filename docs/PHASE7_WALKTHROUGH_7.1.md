# Phase 7.1 walkthrough — the e2e suite in CI, against a production build

**Executed 08-27-26** against `docs/PHASE7_PLAN_7.1.md` (no design doc — the decisions were small
enough to settle in chat and are recorded as D1–D8 in the plan), on branch `feat/7.1-e2e-ci`.

**Status: complete.** Both CI jobs green on the PR; the suite is 42 tests against a production
build with a fresh Postgres, and `bun run e2e` locally is unchanged at 41.

The plan's own summary of the phase turned out to be right: *the suite already existed*. Phase 5
built it screen by screen, and 7.1 was the wiring. What made it more than wiring was decision D1 —
run it against a production build rather than `next dev`. That decision found **two real bugs in an
app nobody thought was broken**, both of which only exist in production builds, and neither of
which anyone would have found by reading the code.

---

## The two bugs the production build found

Both of these are the phase's actual value. Neither is a CI artefact; both would have hit beta
readers.

### 1. Better Auth rate-limits sign-in, in production only

The first `bun run e2e:prod` came back with five failures scattered across five files. The error
that explained them, from the auth-error region of the landing page:

```
Locator: getByTestId('auth-error')
Expected substring: "That email and password don't match."
Received string:    "Too many requests. Please try again later."
```

Better Auth ships a rate limiter that is **disabled in development and enabled under
`NODE_ENV=production`** — which `next start` sets — with a stricter built-in rule for the credential
paths. Probed directly against the production server, no test harness involved:

```
req 1: 401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
req 2: 401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
req 3: 401 {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
req 4: 429 {"message":"Too many requests. Please try again later."}

sign-up 1: 400 {"message":"Ambit is invite-only right now. …"}
sign-up 2: 400 …
sign-up 3: 400 …
sign-up 4: 429 {"message":"Too many requests. Please try again later."}
```

Three requests per ten seconds per IP, counted per path. Two separate things follow from that.

**The suite was genuinely unrealistic**, and that half is the suite's fault. Playwright isolates
storage per test, so `feed`/`saved`/`settings` signed in again in *every test* — around twenty
sign-ins from one address inside two and a half minutes. Signing in is setup for those files, not
the thing under test, so they now capture the session cookie once (`saveSession`) and restore it
per test (`restoreSession`). That took the failures from five to two.

**The default is wrong for this app**, and that half is the app's. `auth.spec.ts` cannot be fixed
by session reuse, because its auth requests *are* its assertions — the reset test makes two
`/sign-in/email` calls seconds apart on purpose, to show the old password is rejected and the new
one works. Four sign-ins in twenty-five seconds, against a limit of three per ten. And more
seriously than any of that: the limiter keys on client IP, and Ambit sits behind Coolify's reverse
proxy with **no trusted-proxy IP source configured**, so every reader may land in one shared
bucket. Three sign-ins per ten seconds *for the entire beta* is an outage waiting for the evening
two people sign in at once.

So `src/lib/auth.ts` now states the policy explicitly instead of inheriting it — `/sign-in/email`
and `/sign-up/email` at 20 per 10s, everything else on Better Auth's defaults. Deriving a real
per-client IP behind the proxy is 7.2's.

### 2. The accent knob doesn't survive a reload

With the 429s gone, one test still failed: `settings.spec` line 227, the assertion that the chosen
accent survives a reload. Instrumenting the page with a per-frame sampler gave the whole story in
two lines:

```
 2ms  loading   amber   ls=amber      ← layout.tsx's pre-paint <head> script
15ms  complete  indigo  ls=amber      ← React puts its own value back
```

`layout.tsx` renders `<html data-accent="indigo">` and the inline script replaces it with the
reader's stored accent before first paint. But React owns every attribute it renders: hydrating
`<html>` reconciles that attribute back to the literal. **Pick Amber in Settings, reload, get
Indigo, with `"amber"` still sitting in localStorage.**

It hid for a phase and a half because it takes both halves of a specific setup to see. Development
builds *warn* about a hydration mismatch rather than patching it, so `bun run dev` never showed it;
and `suppressHydrationWarning` on `<html>` — there so a non-default accent doesn't log on every
load — meant the warning nobody was reading wasn't printed either. It only bites on `/settings`,
the one screen that subscribes to the accent store and therefore the one screen that re-renders.

Isolating it took two experiments worth recording, because the first answer was wrong:

- A clean probe against `/` (set localStorage, reload four times, with and without a service
  worker) showed `amber` surviving **8/8**. So the app is not broken in general, and the service
  worker — the initial suspect, since the failing page reported `fromSW: true` — is not the cause.
- Removing `data-accent` from `layout.tsx` entirely, so React would never render it, **did not
  work**: React removed the script's attribute instead of resetting it. Same outcome, one fewer
  valid attribute. Reverted.

The fix that does work is `src/components/accent-sync.tsx` — a client component that re-asserts the
stored accent in an effect, with no dependency array, so the repair follows *every* commit
including the hydration pass. Three consecutive runs of `settings.spec` green, then the full suite.
It is honestly a patch over React's reconciliation rather than a removal of its cause; removing the
cause means letting the server render the accent it will paint (a cookie), which reverses a
recorded 5.10 decision and is a bigger change than the bug warrants. The component says so, and
says to delete it if the accent ever becomes server-known.

---

## What CI told us that local runs could not

The first CI run was red in four tests, all the same shape: `[data-feed-id]` never appeared. The
feed had nothing to draw.

This is the one thing a local run *cannot* catch, and it is worth stating plainly: **every local
run had 8.5k development items standing behind the fixtures.** Two specs (`auth`, `settings`)
seeded nothing at all — they never needed to, since their feed assertions are incidental to what
they test — and two more (`feed` at 30 rows, `saved` at 12) seeded about a page. The feed excludes
each reader's `seen_item` rows, so every visit to `/feed` permanently costs that user up to 12
items; a file whose tests each open the feed burns roughly `12 × tests`.

Sizes now: `feed` 150, `saved` 120, `settings` 90, `pwa.prod` 40, `auth` 40, all through a shared
`seedFeedCorpus()`.

The same run surfaced a second thing only the bigger corpora could: `cleanupSeeded`'s two deletes
raced the still-running server. A feed request in flight when the last test ended can insert a
`seen_item` row *after* the child delete and *before* the item delete, and the file ends red on its
cleanup rather than on anything it asserted. It is one transaction now.

After that, rather than iterate through CI at six minutes a go, the job was reproduced locally —
a fresh database, `.env` moved aside, variables from the environment, exactly as the workflow does
it. Two consecutive clean runs before pushing. That script is worth rebuilding if this ever comes
up again; it turns a six-minute round trip into a four-minute one you can read.

---

## The numbers

**Local, dev server** (`bun run e2e`): **41 passed**, ~1.8m. Unchanged by this phase, as promised.

**Local, production build** (`bun run e2e:prod`): **42 passed**, 25.8s at 3 workers, 1.0m at 1.
The PWA spec's own output on the development database:

```
SW: {"scriptURL":"http://localhost:3000/serwist/sw.js","state":"activated"}
CACHES: {"serwist-precache-v2-…":43,"ambit-images":23,"ambit-pages":1,"ambit-next-static":1}
OFFLINE TILES: 12
CACHES AFTER SIGN OUT: ["serwist-precache-v2-…","ambit-images","ambit-next-static"]
```

**Local, CI-shaped** (fresh database, no `.env`): migrations applied from the journal, 16 topics
seeded, **774 tests in 72 files** (the five DB-backed suites included), production build,
**42 passed** in ~58s. Run twice, identical.

**GitHub Actions** ([run 33134995016](https://github.com/Ibenthinkin/Ambit/actions/runs/33134995016)):

| Job | Wall clock | What it proved |
|---|---|---|
| `check` | 1m18s | typecheck, lint, format, 774 unit tests, build — no database, DB suites self-skip |
| `e2e` | 2m49s | containers healthy → `db:migrate` from the journal → `db:seed` (16 topics) → `bun run test` **with** a database → build → **42 passed** (1.1m) |

The `e2e` job's Vitest output shows `routers.integration.test.ts` and the other DB-backed files
executing rather than skipping — D5 delivered, and the first time those have run in CI since 3.3.
`db:migrate` applying cleanly to an empty database is D4 delivered, and the first automated proof
of the path 8.1's deploy will take.

The PWA spec in CI, on an empty database:

```
SW: {"scriptURL":"http://localhost:3000/serwist/sw.js","state":"activated"}
CACHES: {"serwist-precache-v2-…":43,"ambit-images":18,"ambit-pages":1,"ambit-next-static":1}
OFFLINE TILES: 9
```

**`bun run e2e:clean`, first measurement** — the accumulation CLAUDE.md's `gallery.spec:193` note
blames for the local flake, finally counted:

```
e2e users: 121 · seen_item 2634 · saved_item 17 · user_topic 381 · collection 165
```

A single evening's work put 81 users and 2,206 `seen_item` rows back, which says something about
how fast this accumulates and why the note existed.

---

## What the plan got wrong

Three things, all of the same kind: the plan reasoned carefully about a production build and an
empty database *separately*, and the gaps were in what those two facts do together.

1. **It did not anticipate Better Auth's production-only rate limiter.** D1 chose the production
   build for good reasons and listed what would change; the limiter is not mentioned anywhere, and
   the plan's rate-limit note is about Ambit's *own* tRPC and image-proxy limits ("if a trace shows
   a 429, it is a real finding"), which were never the ones that fired. The instinct was right even
   so — it was a real finding — but it cost the phase its longest detour.

2. **It fixed the corpus sizing for exactly one spec.** T3 correctly worked out that
   `pwa.prod.spec.ts` needed to seed its own rows on an empty database, and then didn't ask the
   same question of the other five. Four of them needed it too, for the same reason, and two needed
   a corpus where they had never had one. The plan's own predicted failure mode ("Playwright times
   out on the first `[data-feed-id]` → the seeded corpus didn't draw") named the symptom exactly
   and then pointed at the wrong cause — `db:seed`, which was fine.

3. **`cleanupSeeded`'s race was invisible at the old sizes.** The plan moved that code verbatim and
   said, correctly, that the refactor must not change what it deletes. It didn't — but it also
   preserved a two-statement gap that only becomes a problem once a file draws several pages.

Everything else landed as written: the `E2E_PROD` switch, the workflow, the service containers'
health commands, `e2e:clean`'s delete order, and the Mailpit assumptions all worked first time.
The plan's verified-facts table was accurate on every row that was checked against reality.

---

## What to remember

- **A green dev-server suite says nothing about a production build.** Two shipped bugs lived in the
  gap: one because a security feature is production-only, one because dev-mode React warns where
  production React patches. Both are the kind of thing that only a real build can tell you, and
  both were sitting in an app that had been through a device pass.
- **A green local suite says nothing about an empty database.** The 8.5k-item dev corpus was
  silently propping up fixtures in four specs. If you add a spec that reads the feed, seed for it,
  and size the corpus for roughly a page per feed load — the engine never serves the same reader
  the same item twice.
- **Reproduce CI locally before iterating through CI.** A fresh database plus a moved-aside `.env`
  is a faithful copy of the job and cuts the loop from six minutes to four, with a readable
  transcript at the end of it.
- **`bun run e2e:clean --confirm`** is now the answer to a locally flaky `gallery.spec:193`. CI
  never accumulates, so a green CI beside a red local run is consistent, and the local one is the
  accumulation.
