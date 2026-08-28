# Ambit — Project Log

Narrative record of decisions, findings, and dead-ends that don't live in commit
messages. `/brief` reads this. Newest on top.

## 2026-08

### [[08-28-26 Fri]] — Phase 7.3 executed unattended: proxy-with-cache settled, and 35 MB the feed had been dragging per page

**Shipped:** `feat/7.3-images-perf`, T1–T6, six commits, second half of the overnight Ralph run.
**BUILD_PLAN's two-phase-old ⚖️ image gate is closed: proxy-with-cache.** `/api/img/[itemId]` now
fills a disk cache and serves ≤1600px WebP, so a source image is fetched from its museum **once,
ever** (`src/server/services/image-cache.ts`; `bun run img:warm` spends those fetches politely, per
host, skipping what is cached and abandoning a host after three consecutive 429s). `check` 797 →
820 tests; `e2e:prod` still 46.

**The number nobody was looking for.** T2 was filed as hygiene — the feed was already at 138 ms
against a 300 ms bar, so the plan expected the projection to matter only on a VPS. It was the
phase's biggest win: `getTopicPools` did a bare `select()` and was dragging **9,848 full rows,
about 35.8 MB**, out of Postgres to compose twelve cards, most of it the `body` column
`composePage` never reads. Pools now carry a five-column `PoolItem` projection and `getFeedPage`
hydrates the winners by id. **p50 138 → 22 ms, p95 174 → 51 ms, payload 35.8 → 1.6 MB**, with
`FeedCard` and therefore every client byte-for-byte unchanged. The plan measured latency in its
research and concluded there was nothing to win; it never measured payload.

**Two real bugs, both found by running the thing rather than reading it.** The first `img:warm`
against LoC died 50 images in: `AbortSignal.timeout` covers the **body read** as well as the fetch,
and that rejection was escaping `fillCache` unwrapped — as a `DOMException`, which **is not
`instanceof Error` under Bun**, so the obvious timeout check both mislabelled it and passes under
Node, where the unit tests run. Through the route that would have been a 500 instead of a 502, on
exactly the slow-museum morning the cache exists for. Both halves fixed and tested. Separately, the
in-flight map was cleared in a `.finally()` whose derived promise nobody awaited — every failed fill
would have raised an unhandled rejection; its own unit test caught that before it reached a log.

**The warm run answered a 6.2 question.** 372 LoC images at 1/s: **zero 429s**, four timeouts. So
`tile.loc.gov`'s unpublished budget tolerates a steady trickle and it was the *burst* that tripped
it in 6.2 — and it is a one-time cost now regardless. Cache measures 62 KB a file, ~0.67 GB
projected for the whole corpus, half the plan's estimate.

**Lighthouse** (throttled mobile, production build): `/` 87 perf / 95 a11y / 96 BP; `/feed` 91 →
**90 perf, 100 BP, Speed Index 1.6 s → 0.9 s** after `decoding="async"` on tiles, `fetchPriority`
on the hero and a `preload` for it. LCP did not move, and the report says why: **the landing
slideshow is 1.6 MB of JPEG** and is `/`'s LCP essentially in full — a 9.x follow-up the `sharp`
pipeline this phase added would fix in one script.

**Decisions:** proxy-with-cache over `next/image` (a fetch per width/quality variant) and over
hotlinking (AIC's referer rule, LoC's per-IP budget) — D1; one variant per item, ≤1600px WebP q82 —
D2; disk, no eviction, **8.1 mounts the volume** — D3; failures never cached, at any layer — D4;
concurrent misses share one fill — D5; share/download filenames follow the served type — D8.

**Findings recorded, not fixed:** a **production React #418 hydration error that only appears under
Lighthouse's emulation** (three runs of four, consistently on `/`; ruled out CPU throttling at 4×
and 8× via CDP; invisible to `e2e:prod`, which asserts no console errors on that page and passes).
And **`/i/[itemId]` returns `NO_FCP` to headless Lighthouse** while demonstrably rendering fine —
first-paint at 72 ms, hero through the cache as a 640×432 WebP, a screenshot showing the finished
page — so it has no numbers in the evidence set, deliberately, rather than a fabricated one. Worth
one pass in a real non-headless Chrome. Related and cheap: `globals.css`'s reduced-motion block
zeroes `animation-duration` but not `animation-delay`, so a reduced-motion reader still waits out
the 160 ms `<Rise>` stagger.

**The time sink was not code.** `bun add sharp` staled Vite's dep-optimizer cache, and the symptom
looked nothing like a dependency problem: the suite went from 34 s to 486–1,218 s, `import` alone
taking 700–3,200 s, with *different* tests failing every run — including pure unit tests that cannot
fail for logic reasons — while Postgres sat idle and sub-millisecond. `rm -rf node_modules/.vite`
put it back to 35 s. Written into CLAUDE.md so the next phase doesn't re-derive it.

**Open / next:** the full `bun run img:warm --rate 2` (7.3 warmed `loc` only); **8.1 must mount
`IMAGE_CACHE_DIR` as a persistent volume**, plus 7.2's two proxy confirmations (per-client rate
limiting, `Secure` cookie); the landing JPEGs → WebP; the #418 hydration error; and 7.2's 41 rows of
stored `<i>`/`<em>` markup. 8.1 is next.

*Session spend: 99.02M tok (in 686 · out 261.5k · cache r 97.21M / w 1.55M) · ~≥$66.10 · opus-5 + opus-4-7 + <synthetic> · 00:44→07:06*

**Planned (afternoon): Phase 8.1** — `docs/PHASE8_PLAN_8.1.md`, cold-executable but **attended**
(🖐️ Ben steps for the Coolify / Cloudflare / Resend UIs and the two host shells; the agent prepares
values and verifies from the Mac). Decisions with Ben, don't relitigate: **homelab, not a VPS** —
Ambit is VM 202's second Coolify tenant beside the archive, public through the *existing*
`homelab` Cloudflare Tunnel on VM 200 with one ingress rule → `192.168.1.202:3000` (the `glance`
off-host precedent), no Caddy LAN name (Better Auth trusts only `baseURL` in production), no
Cloudflare Access; hostname **`ambit.benreilly.io`**; **fresh ingest on the server**, nothing copied
from the Mac; **Postgres 17 as a Coolify database** with its scheduled `pg_dump` and a mandatory
restore drill. The image mirrors CI rather than `output: "standalone"` — `drizzle-kit` (a
devDependency) runs the boot-time migrate and the ingest cron `docker exec`s `scripts/`, so a
pruned or standalone image would break both, and Bun + standalone is undocumented anyway.

**Plan-time findings worth knowing before executing:** the repo has **no Dockerfile, no health
route, no backup or cron config** at all. `next.config.js` bakes HSTS from `BETTER_AUTH_URL`'s
scheme *at build time*, so `SKIP_ENV_VALIDATION` would throw on `.startsWith` — the real https
origin must be a **build ARG** (Coolify "Build Variable"). The Resend from-address is a hardcoded
`noreply@ambit.app` and a missing key fails **silently** (fire-and-forget send → Mailpit on
`localhost:1025`) — the plan adds `MAIL_FROM` and makes a real reset mail the only proof. The
serwist precache revision is `""` in a container without `.git` (`stdout ?? uuid` — empty string
isn't null). And **Cloudflare appends to any client-supplied `X-Forwarded-For`**, which Better
Auth ≥ 1.6.21 then treats as *no IP* — production keys on `cf-connecting-ip` (D11), proven by a
two-client + spoofed-header test rather than by reading the headers back. Resend's DNS records sit
on `send.` / `resend._domainkey.` subdomains, so they coexist with the tunnel's CNAME.

**Open / next:** execute 8.1 in a cheaper session (one evening for T1–T6, a second sitting for
the first ingest, the image warm and the restore drill; the done-bar needs one *unattended*
01:30 ingest run, so it closes the morning after). Then 8.2.

*Session spend: 5.99M tok (in 3.6k · out 139.6k · cache r 5.34M / w 509.2k) · ~$22.54 · fable-5 · 12:33→12:55*

**Executed (afternoon/evening): Phase 8.1 T1–T2**, the two agent-only tasks. Merged to `main`
(`59c76e5`) with both CI jobs green; **T3 onward is 🖐️ Ben's**, so the phase pauses there by design.

**main's CI had been red since the 7.3 merge, and nobody had looked.** The pre-flight caught it:
7.3's `image-cache.ts` is the first unit-tested module to import `~/env`, which validates the
*whole* schema the moment it is imported — and the `check` job has no `.env` and, deliberately, no
`DATABASE_URL`, because that absence is what makes the five DB-backed suites skip themselves. So
`createEnv` threw at import time and took `image-cache.test.ts` and the img route's test down with
it, green locally the entire time because a real `.env` is loaded there. Handing the job a
placeholder `DATABASE_URL` would have fixed the import and silently un-skipped five suites against
a database that isn't there; the fix instead says *no `DATABASE_URL` means no environment to
validate* and uses env.js's own `SKIP_ENV_VALIDATION` hatch, with the schema defaults set by hand.
Reproduced before and after by moving `.env` aside: 2 failed → 73 passed | 4 skipped.

**T1** landed the four production-readiness changes. `/api/health` (D10) runs `select 1` and proves
the image cache's *resolved* directory is writable, always both checks so two simultaneous failures
are both named, and answers in fixed vocabulary — the route is public through the tunnel, so it can
describe an outcome but never the machine. `MAIL_FROM` replaced the hardcoded `noreply@ambit.app`.
Production now reads `cf-connecting-ip` (D11); `trustedProxies` stays unset, and the D4 comment
block in `auth.ts` was rewritten rather than left contradicting itself — 7.2 reasoned about
Coolify's Traefik, and the deploy that actually happens has a CDN in front instead. The serwist
precache revision takes the first *non-empty* candidate now (`SOURCE_COMMIT` → git → uuid).

**T2's container was proven locally, and proved more than the plan asked.** Build 1.55 GB; migrate
applied the journal to an empty database, seed wrote 16 topics, Ready in 45 ms; `/api/health` 200
and the container reaches `healthy` on the Dockerfile's own `bun -e fetch` check (no curl in
`oven/bun`); `GET /` carries HSTS and a per-request CSP nonce **because the build arg was https**,
which is the whole reason `BETTER_AUTH_URL` is a build variable; `docker exec … bun run ingest
--quota 2 --skip-llm --source met` ingested 16 items, so `scripts/`, `src/`, `drizzle/` and the
`~/*` alias all resolve inside the image. Then the extra: the image proxy filled `/app/.cache/img`
on the mounted volume, the container was **stopped and replaced on that same volume**, and the same
request came back `x-ambit-cache: hit` — a free rehearsal of T7.5, the step the volume exists for.
`SOURCE_COMMIT` set on the container comes back as `/api/health`'s `commit`, so T6.6 already has
its mechanism confirmed.

**Two things the plan said that turned out otherwise.** Pushing a feature branch triggers no CI at
all — the workflow runs on `main` pushes and `pull_request`, so T2.6's "push and wait for green"
needed a PR (#19, both jobs green, merged). And the first `docker build` failed on
`DeadlineExceeded` loading metadata for `oven/bun:1.4.0-debian` — a transient registry timeout, not
a wrong tag: `docker pull` of the same tag succeeded and the rebuild went straight through. Worth
knowing before diagnosing a Coolify build failure as a Dockerfile problem.

**Open / next:** 🖐️ **T3** — the Coolify database + application on VM 202 (secrets minted by Ben,
`Ports Mappings 3000:3000` with Domains empty, the `/app/.cache` volume, `BETTER_AUTH_URL` as the
only Build Variable), then T4's tunnel ingress and T5's Resend domain. Everything from T3 to T9 is
untouched.

*Session spend: 28.77M tok (in 469 · out 167.7k · cache r 27.93M / w 667.9k) · ~$23.67 · opus-5 + opus-4-7 · 14:14→15:01*

### [[08-28-26 Fri]] — Phase 7.2 executed unattended: the security pass, and 41 rows of markup nobody had looked for

**Shipped:** `feat/7.2-security`, T1–T7, six commits, run start-to-finish by the overnight Ralph
loop against `docs/PHASE7_OVERNIGHT.md`. The app has security headers for the first time —
nosniff, `X-Frame-Options: DENY`, `Referrer-Policy`, a `Permissions-Policy` that locks only what
the app never uses, HSTS gated on an https `BETTER_AUTH_URL`, and an **enforced CSP with a
per-request nonce and `'strict-dynamic'`**. Every value comes from one pure module
(`src/config/security-headers.js`), consumed by `next.config.js` for the static headers and by
`src/proxy.ts` for the CSP, which is the only place a nonce can be minted. SPEC §11 was rewritten
so every bullet ends in the test that proves it. `check` 774 → 797 tests; `e2e:prod` 42 → 46;
`e2e` 41 → 45.

**D2 was never needed.** The plan carried a written retreat — drop the nonce, fall back to
`script-src 'unsafe-inline'` — for exactly the case where an unattended run can't debug a red CSP.
The enforced policy was green on `e2e:prod` the first time it ran. The negative control the plan
asked for was done and undone: deleting the CSP line from `proxy.ts` fails `security.spec.ts` with
`no CSP on /`.

**Two findings, both from tests that had never existed before:**

1. **41 corpus rows carry stored markup.** The new DB invariant asks whether any stored `title`,
   `summary` or `body` contains an HTML tag. Four adapters pass their source's italics straight
   through: smithsonian 35 titles, met 2, wellcome 2 + 1 summary, nasa-images 1 summary. Not a
   security bug — nothing renders source text as HTML, which is what the new source-scan test
   guarantees — but reader-visible right now: *Sword Guard (`<i>`Tsuba`</i>`) With the Motif of
   Sunrise Over the Ocean*. The fix is one `htmlToText()` call in `normalize.ts` plus a
   re-normalise of existing rows, which is an adapter change and therefore not this phase's (D7:
   record it, don't rewrite adapters overnight). A further 14 wikipedia `body` hits are **false
   positives** — articles *about* markup, whose prose contains `<section>`, `<ref>`, `<b>`, `<ul>`.
   The invariant excludes exactly those, per field, with both reasons in the test.
2. **The CSP surfaced a dev-only hydration error.** Browsers blank a `<script nonce>` content
   attribute once parsed — that is the CSP spec, so a script on the page can never read a nonce
   back out of the DOM and forge one. React's dev-only hydration check doesn't know that, sees the
   server's value against an empty attribute, and logs a mismatch on every load; four "renders
   without console errors" specs went red on the dev server while `e2e:prod` stayed green.
   `suppressHydrationWarning`, scoped to that one element, with the reason written down.

**Decisions:** the CSP is enforced rather than report-only, with a nonce (D1); `style-src` keeps
`'unsafe-inline'` deliberately — fifteen components set `style={{…}}` and blocking inline *styles*
buys nothing against script injection; **no IP-trust code was needed** (D4) — Better Auth ≥ 1.6.21
already refuses a multi-hop `X-Forwarded-For`, and Ambit's own `trustedClientIp()` takes the last
hop for the same reason, so both limiters agree; HSTS is gated on the URL's scheme, never on
`NODE_ENV`, because CI runs a production build over plain http (D5).

**Also worth knowing:** reading `headers()` in the root layout is what makes the nonce
per-request, and it makes every route render on demand — three previously static routes
(`/~offline`, `/_not-found`, `/dev/tokens`) are now `ƒ`, and no `await connection()` was needed.
Cookie flags were read off a real production sign-up rather than the docs:
`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`, with `Secure` correctly absent over http.

**Open / next:** the 41 markup rows (one `htmlToText()` + a re-normalise); 8.1 confirms per-client
rate limiting and a `Secure` cookie behind the deployed proxy. And **the e2e suite is flaky on this
box in a way worth fixing**: `feed.spec.ts`'s `afterAll` `cleanupSeeded` dies on
`seen_item_item_id_item_id_fk` when an in-flight `feed.markSeen` lands a row after the teardown
transaction deleted them — the transaction comment in `support.ts` says this was supposed to be
fixed, and it isn't. Roughly three failures across eight full runs tonight, never the same test
twice, always green on a re-run. 7.3 is next.

*Session spend: 28.74M tok (in 479 · out 174.9k · cache r 27.77M / w 789.8k) · ~$24.78 · opus-5 + opus-4-7 · 00:10→00:44*

### [[08-27-26 Thu]] — Phase 6.3 executed: corpus-walk lane, doorofperception live as 318 link cards; D2 staged to the attended step

**Shipped:** `feat/6.3-blog-adapters`, T1–T4 from the prior session plus T5–T12 (Ambit side)
today, twelve commits. The gate held: **classified all 390 posts before any write — 318 filed
(82%), 68 honestly refused**, mythology 109 / portraiture 59 / botany 47 / architecture 30 down to
ceramics 0. Ingested 318 at 8.64 avg (92% ≥ 8, against the archive scrape's 8.56), idempotent on
re-run, `--prune` armed, blog cards drawing in every tier. `LinkOutRow` on the item page and the
gallery sheet, maker-line dedupe, the `body`-is-null invariant asserted in CI both as a fixture
test and a DB query, one signed-out e2e. Docs (SPEC §5.1/§6.1/§6.4/§15, BUILD_PLAN, candidates,
CLAUDE.md) and the Ambit-Admin vault (log, roadmap, architecture) are updated. Walkthrough:
`docs/PHASE6_WALKTHROUGH_6.3.md`.

**Three things the plan did not know, found by running it:**

1. **A walk that can never be complete is a `--prune` that can never run.** T6 as written made
   `complete` require `errors === 0`; doorofperception has one post with no featured image that
   `toItem` rejects on every walk, so the re-run reported `complete no` where the plan expected
   `yes`. Split `pageErrors` from `errors`: a failed *page* voids completeness (the cursor past it
   is untrustworthy), a rejected *post* does not. Related and kept: a rejected raw is not in
   `seenSourceIds` — it was never a row, so `planPrune` can't name it, and if it once had a hero
   and lost it, it *should* go.
2. **The walk table had no `no-image` column**, so the plan's "stop if heroes don't fetch"
   precondition was unreadable from the histogram run — and the curator cache hides the answer on
   any re-run. Added the column; checked the first run's heroes directly through the curator's own
   fetch path (20/20 OK). Worth remembering: *a cached curator run can't tell you whether images
   fetched* — the only honest reading is the first pass.
3. **`onClick` on the plan's `LinkOutRow` would have broken `ImageItemBody` as a server
   component** (a function prop on a host element). Written handler-free from the start; the
   gallery sheet's close-on-tap is stopped by a wrapper `div` there instead. The 68 refused posts
   also pass through the curator on every run (68 cache hits, free) — the cost of "dropped, not
   stored", and the summary counts them so it never reads as a leak.

**Decisions:** dry-run T12 numbers are recorded and the destructive half is *not* run unattended,
per the plan — **11,496 archive items carry doorofperception provenance; Ambit holds 251 archive
rows from them (of 310), 0 saved by anyone.** Two e2e/test-state leaks noted, not fixed: two
`test-feed-topic-*` rows sit in the dev `topic` table and print in every ingest summary.

**D2 executed, later the same day — and the plan had the wrong instance.** Ambit's half is
done: `retire --confirm` deleted **251 archive rows (310 → 59), 0 saves lost**, re-run matches 0,
`body`-null invariant still 0. The Mac archive copy is swept: `retired 11568 provenance · withdrew
11496 items`, files and `index.csv` untouched, `/search` on it returns personal material only. T13
verification green — `bun run check` 72 files / 774 tests, e2e **41 passed in 2.1 m** (no
gallery.spec:193 flake this time) — and the branch is merged to `main`. Two findings:

1. **`DISK_ROOTS` had no entry to remove.** It was the single root `./storage/sources` with the
   scrape as its only subfolder. A blank root is rejected at startup and a missing one is a
   connector *problem* (blocks the sweep, no override), so the mechanism became *repoint at an
   empty sibling* (`./storage/sources/personal`). That also changes which guard fires: the **zero
   guard**, not the 20% ratio guard the plan predicted — reached first once the walk sees nothing.
2. **Every one of Ambit's archive rows points at VM 202** (`archive.home.benreilly.io`), not the
   Mac copy the plan's step 3 edited. Checked by reading `image_url` hosts *before* the sweep —
   one query, and without it the Mac sweep would have read as "done". Production still reports
   13,380 items and ranks the scrape; SSH to `ben@192.168.1.202` refuses the Mac's key, so **the
   production sweep is the one step still open**, and it is Ben's to run.

**Production swept the same evening, by Ben on VM 202** — after one false start: the first
`docker exec … sync` ran before the env change and walked the old root (11,572 files hashed for a
run that could withdraw nothing; killed). The fix was a one-exec override, `docker exec -e
DISK_ROOTS=/app/storage/sources/personal "$C" bun run sync --connector=disk --force-sweep` →
**`retired 11568 provenance · withdrew 11496 items`**, the same line as the Mac. Verified from
Ambit: production `/search` returns personal material only for the three scrape-shaped probes
(withdrawn items leave `/search` at hydration, no restart), and the archive adapter dry-run is
clean (29 searched · 93 offered · 0 errors). D2 is done end to end; the "no default ingest"
caveat is lifted. The D2 numbers, final: archive 310 → 59 in Ambit; 11,496 withdrawn on both
archive copies; `index.csv` and 392 files untouched on both.

**And persisted**: Ben set `DISK_ROOTS=/app/storage/sources/personal` in Coolify and redeployed;
after the restart production `/health` reads **1,993**, the same as the Mac copy. That step was
load-bearing, not tidy — `sync.ts` revives a withdrawn item on re-sighting, so the weekly Sunday
walk of the old root would have restored all 11,496. **D2 is closed on every copy.**

**Open / next:** (1) The weekly Sunday `sync --connector=disk` task on Coolify now exits 1 on the
zero guard every run — disable it, or accept the red. (2) Two `test-feed-topic-*` rows in the dev
`topic` table still print in every ingest summary — e2e/test leak, not fixed. (3) ambit-archive
has an uncommitted, unrelated A.6c log/SPEC diff from another session — left alone. Then Phase 7.
Blog #2 is PDR (RSS walk) or thingsorganizedneatly (Tumblr walk), each its own adapter on the same
contract.

**7.1 planned, later the same evening — and a numbering slip caught first.** Ben asked to "start
planning phase 7 the blog adapter"; Phase 7 in the build plan is *hardening* (7.1 e2e in CI, 7.2
security, 7.3 image strategy) and the blog adapter was 6.3. Advice given and taken: run Phase 7 in
plan order — 7.3 is the most load-bearing open decision in the repo (AIC still suspended, LoC's
per-IP budget, blog heroes riding an uncached `/api/img`), but it changes how every image is served,
so the CI safety net lands first — and leave blog #2 (PDR / Tumblr walks) for after beta, via 9.6's
trial loop. Plan: `docs/PHASE7_PLAN_7.1.md`, seven tasks, cold-executable.

**What 7.1 turned out to be:** smaller than the build plan reads. Eight specs / 41 tests already
cover every SPEC §12 flow except swipe gestures (untestable in Playwright, covered at the hook
level); every spec seeds its own `source: "e2e"` corpus. The work is the wiring, plus three findings:
(1) the five identical `connect()` helpers call `process.loadEnvFile("../.env")`, which **throws**
when the file is missing — every DB-touching spec would have died in `beforeAll` on the first CI
run; consolidated into `e2e/support.ts` with the tolerant idiom `vitest.config.ts` already uses.
(2) `pwa.prod.spec.ts` seeds nothing and asserts `ambit-images` is non-empty — but tiles render
`data:` URLs *without* the proxy, and the SW's image rule matches `/api/img/` only, so on an empty
database the spec needs same-origin **http** fixtures (`/icon-192.png`). (3) With a Postgres in the
job, the five `describe.skipIf(!DATABASE_URL)` Vitest suites un-skip for free — they have never run
in CI since 3.3.

**Decisions (Ben):** CI runs against a **production build** (`E2E_PROD=1`; `bun run e2e:prod`
reproduces it locally), which is what lets the PWA spec — the only automated check of the caching
strategy — join the suite; service workers stay allowed (blocking risks console-error assertions);
GitHub service containers rather than compose-in-the-workflow; real `db:migrate` so CI is the first
proof the journal applies to an empty database ahead of 8.1; `bun run e2e:clean` for the local
user/seen-row accumulation behind the `gallery.spec:193` flake — CI never sees it.

**Open / next:** execute 7.1 in a cheaper session; then plan 7.2 (security pass) and 7.3 (the image
decision, with 6.2's LoC evidence in hand).

**7.1 executed the same night, and it was not the wiring job the plan expected.** All seven tasks
landed — `e2e/support.ts` holds the one `connect()`, the `E2E_PROD` switch, `e2e:clean`, the CI
job with Postgres + Mailpit service containers — and both jobs are green on
[PR #18](https://github.com/Ibenthinkin/Ambit/pull/18) (`check` 1m18s, `e2e` 2m49s, **42 passed**).
The migration journal applied cleanly to an empty database, and the five `skipIf(!DATABASE_URL)`
Vitest suites ran in CI for the first time since 3.3. Walkthrough:
`docs/PHASE7_WALKTHROUGH_7.1.md`.

**The production build found two real bugs, in an app nobody thought was broken.** This is the
phase's actual value, and neither is a CI artefact:

1. **Better Auth rate-limits sign-in — in production only.** Its limiter is disabled in dev and
   enabled under `NODE_ENV=production`, at **3 requests / 10s per IP** on `/sign-in` and
   `/sign-up`, counted per path (probed directly: three 401s, then a 429). Two consequences, and
   both halves needed fixing. The suite was unrealistic — Playwright isolates storage per test, so
   three specs signed in *per test*, ~20 sign-ins in 2.5 minutes; they now capture one session per
   file and restore it (`saveSession`/`restoreSession`), which took the failures 5 → 2. And the
   default is wrong for this app: `auth.spec.ts` can't be fixed that way because its auth requests
   *are* its assertions (the reset test signs in twice, seconds apart, on purpose), and — the part
   that matters beyond tests — the limiter keys on client IP while Ambit sits behind Coolify's
   proxy with **no trusted-proxy IP source**, so the whole beta may share one bucket. `auth.ts` now
   states the policy explicitly (20/10s on the two credential paths); the proxy half is 7.2's.
2. **The accent knob doesn't survive a reload.** Pick Amber in Settings, reload, get Indigo — with
   `"amber"` still in localStorage. The per-frame trace: `2ms loading amber` (the pre-paint script
   does its job), `15ms complete indigo` — React reconciles `<html data-accent>` back to the
   literal `layout.tsx` renders. Hidden for a phase and a half because dev builds *warn* about the
   mismatch instead of patching it, and `suppressHydrationWarning` meant the warning nobody was
   reading wasn't printed either. Only bites on `/settings`, the one screen that re-renders.
   `AccentSync` repairs it after every commit. A tried-and-reverted fix worth remembering: dropping
   `data-accent` from `layout.tsx` so React never renders it — React then *removed* the script's
   attribute instead of resetting it.

**And CI found the thing no local run could.** First CI run: four tests red, all
`[data-feed-id]` never appearing. Every local run had 8.5k dev items standing behind the fixtures.
Two specs seeded nothing (`auth`, `settings` — their feed assertions are incidental, so they never
needed to) and two seeded about a page (`feed` 30, `saved` 12), while the engine excludes each
reader's `seen_item` rows — so every feed load costs that user 12 items and a file burns roughly
`12 × tests`. Sizes are now 150/120/90/40/40 through a shared `seedFeedCorpus()`. The same run
exposed a race in `cleanupSeeded`: a feed request still in flight can insert a `seen_item` row
between the child delete and the item delete, so a file ends red on its cleanup rather than on
anything it asserted. One transaction now. **The plan fixed corpus sizing for exactly one spec
(`pwa.prod`) and didn't ask the same question of the other five** — its own predicted symptom, with
the wrong cause attached.

**Worth keeping as method:** rather than iterate through CI at six minutes a go, the job was
reproduced locally — fresh database, `.env` moved aside, variables from the environment — and run
twice clean before pushing. Four minutes, with a readable transcript.

**`e2e:clean`'s first measurement**, the accumulation behind the `gallery.spec:193` note, finally
counted: `121 users · 2,634 seen_item · 381 user_topic · 165 collection · 17 saved_item`. One
evening's work put 81 users and 2,206 seen rows straight back.

**Merged to `main` the same night** — `--no-ff`, [PR #18](https://github.com/Ibenthinkin/Ambit/pull/18)
merged, both jobs green on the push to `main` too. The merged tree threw one red on the way in:
`gallery.spec:248` ("a gallery session spends none of the reader's corpus") came back 11 tiles
instead of 12, then passed 5/5 in isolation and on a clean full run. Same class as the
`gallery.spec:193` note in CLAUDE.md and the same cause — the dev DB had put **81 users and 2,206
`seen_item` rows** back in a single evening. Not a regression, and CI (fresh database every run)
has never shown it.

**7.2 and 7.3 planned the same night, for an unattended run** — `docs/PHASE7_PLAN_7.2.md`,
`docs/PHASE7_PLAN_7.3.md`, and the runner contract `docs/PHASE7_OVERNIGHT.md` (Ralph loop, gates,
stop rules, a morning report in an untracked `OVERNIGHT_STATUS.md`). Three things the planning
read found, each of which changed a plan:

1. **7.2 is mostly verification.** No `dangerouslySetInnerHTML` touches source data anywhere;
   blogs pass `htmlToText()` at ingest; every user-scoped DB function filters `userId`; three
   limiters already exist. What the app has *never* had is a single security header — so the
   phase is CSP (per-request nonce + `'strict-dynamic'`, with a written fallback to
   `'unsafe-inline'` because nobody will be watching), HSTS/nosniff/frame-ancestors/referrer/
   permissions from one pure module, a two-user authz test, a no-HTML guard, and an audit table.
   And 7.1's "give Better Auth a real IP" item dissolved into a version fact: **better-auth 1.6.21
   stopped trusting multi-hop `X-Forwarded-For`** (1.6.25 is installed), single-valued headers —
   what Coolify's Traefik sends — just work, and `trustedClientIp()` already takes the last hop.
   No code; 8.1 confirms it with one request.
2. **The feed bar is already met — p50 143 ms over 11,366 items** — but `getTopicPools` fetches
   essentially the whole eligible corpus as full rows (bodies included: 28.7 MB of Wikipedia) on
   every page and picks 24 in JS. 7.3 makes it a projection + hydrate, gated by a new
   `bench:feed`, revertable if the integration suite objects.
3. **The image gate is settled: proxy-with-cache, inside `/api/img`.** `sharp` 0.34.5 was
   already in the tree (Next's dependency) and works under Bun — 3000×2000 → 1600 px WebP in
   46 ms. One file per item under `IMAGE_CACHE_DIR`, one upstream fetch per image ever, an
   in-flight map so a page's 24 tiles don't double-fetch, failures never cached, and a per-host
   rate-limited `img:warm` that turns `tile.loc.gov`'s budget into a one-time slow fill (the run
   warms `loc` only). `next/image` was considered and rejected: each width variant would re-fetch
   through the proxy, and every `<img>`, the SW rule and the share sheet would move.

A CSP nonce needs every HTML route dynamic; the production build had three static ones
(`/~offline`, `/_not-found`, `/dev/tokens`) — reading `headers()` in the root layout takes care of
all three, and the plan re-reads the route table to prove it.

**Decisions (Ben, 08-27-26):** cache + resize in `/api/img` over `next/image`; nonce CSP with the
fallback rule; each phase merges to `main` and pushes when its local gate is green, and a red gate
leaves the branch unmerged with the failing test named in the report.

**Open / next:** the overnight run itself. Morning: read `OVERNIGHT_STATUS.md`, then the two
walkthroughs. Housekeeping unchanged: the dev DB is due a `bun run e2e:clean --confirm` (the run
is allowed to do it).

*Session spend: 26.05M tok (in 30.2k · out 264.0k · cache r 24.52M / w 1.23M) · ~≥$50.61 · fable-5 + opus-4-7 + <synthetic> · 12:10→13:09*
*Session spend: 5.95M tok (in 5.0k · out 68.5k · cache r 5.49M / w 389.5k) · ~$16.76 · fable-5 · 15:28→15:35*
*Session spend: 5.84M tok (in 2.4k · out 69.5k · cache r 5.67M / w 99.0k) · ~$11.15 · fable-5 · 15:35→15:41*
*Session spend: 5.51M tok (in 1.8k · out 28.5k · cache r 5.15M / w 326.8k) · ~$13.13 · fable-5 · 15:41→19:26*
*Session spend: 5.91M tok (in 1.5k · out 130.8k · cache r 5.74M / w 33.5k) · ~$12.96 · fable-5 · 19:26→19:33*
*Session spend: 9.09M tok (in 5.7k · out 151.6k · cache r 8.48M / w 452.7k) · ~$25.17 · fable-5 · 19:52→20:13*
*Session spend: 63.22M tok (in 821 · out 348.6k · cache r 61.75M / w 1.12M) · ~$48.60 · opus-5 + opus-4-7 · 20:16→22:14*
*Session spend: 10.79M tok (in 68 · out 17.3k · cache r 10.73M / w 38.5k) · ~$6.18 · opus-5 · 22:14→22:41*
*Session spend: 7.41M tok (in 7.8k · out 226.6k · cache r 6.61M / w 559.9k) · ~$29.22 · fable-5 · 22:48→23:14*

### [[08-25-26 Tue]] — Phase 5.11 executed: landing slideshow, install flow, PWA caching. **Phase 5 complete.** Then: 6.3's design session opened.

**Shipped:** `feat/5.11-landing-install-pwa`, ten commits, merged to `main`. The redesign's
`Landing 2` (slideshow → auth sheet), a real install flow (banner → browser prompt or instructions
→ confirmation), and a hand-written service-worker caching strategy. `LandingShell`, the drifting
orbs and the `drift` keyframe are deleted. v0.5.0. Walkthrough:
`docs/PHASE5_WALKTHROUGH_5.11.md`.

**Three PWA findings, all worth keeping:**

1. **`defaultCache` had been caching the personalized feed since Phase 1.** Its last rule routes
   every same-origin `/api/*` except auth through `NetworkFirst` into a shared 16-entry bucket, and
   tRPC queries travel as GET — so feed pages were sitting in Cache Storage, evicting the image
   proxy from the same 16 slots. Replaced by predicates in `src/lib/sw-rules.ts` (no `serwist`
   import, so they unit-test in node and page code can call `purgePagesCache` too). Only the
   `/feed` **document** is cached, never an API response: the RSC HTML carries the first page
   dehydrated, which is the whole of "reopening offline shows the last feed".
2. **An unterminated `runtimeCaching` list silently disables the offline page.** A request matching
   no rule never enters Serwist's routing at all, and `fallbacks` only applies to requests Serwist
   handled — so "anything unmatched goes straight to the network" (what the plan said, and what I
   wrote) meant an offline `/settings` got Chrome's own error page instead of the precached
   `~offline` shell. `defaultCache`'s catch-all `NetworkOnly` looks redundant and is not. **Only
   caught because I wrote the plan's "manual" §6.3 verification as a script** — no unit test could
   have (every matcher was individually correct) and no `bun run e2e` could either (the SW is
   production-only). That script is kept as `e2e/pwa.prod.spec.ts`, excluded from the default suite
   via `testIgnore: /\.prod\.spec\.ts$/`.
3. **`start_url: "/"` defeats an offline launch** — `/` is itself a redirect when signed in, and a
   redirect is precisely what an offline navigation cannot follow. Now `/feed`, which still bounces
   signed-out readers server-side.

**The repo's lint rules reject the textbook React shape, twice.** `react-hooks/set-state-in-effect`
errored on both new stateful components (the plan wrote each as "read `localStorage`/`matchMedia`/a
shuffle in a mount effect, then setState"), and `react-hooks/refs` on the latest-callback
assignment. No file in the repo suppresses either, so the shape changed rather than the config:
**`useSyncExternalStore(subscribeToNothing, () => true, () => false)` as the hydration boundary, a
lazy `useState` initializer containing reads only, and derived state instead of a second effect.**
The "reads only" part is not pedantry — StrictMode double-invokes initializers, and `InstallFlow`'s
would otherwise have counted every visit twice and brought the banner forward a whole session.
Worth remembering: in this repo, *"read it in a mount effect and setState" is not available.*

**Two smaller things.** `/reset-password` was showing the marketing pitch above "This link has
expired" — the prototype never had to face that, since its sheet only ever held a sign-in form; the
hero is now keyed to the route, not the render mode. And `sips -s formatOptions 72` made the
Haeckel plate **bigger** (533 KB → 626 KB); `formatOptions low` gave 185 KB with no visible
blocking at a 100% crop. Eight slides, 1.6 MB total.

**Verified against a real production build** (`e2e/pwa.prod.spec.ts`): SW activated; buckets
`ambit-images` 22 / `ambit-pages` 1 / `ambit-next-static` 1 / precache 43; **no `apis` bucket and
zero cached `/api/trpc/*`**; offline reload of `/feed` renders 12 tiles; offline `/settings` gets
the `~offline` shell; sign-out drops `ambit-pages` and keeps the images.

**Open / next:** two device passes only Ben can do — the **Chromium install dialog** (headless
never fires `beforeinstallprompt`, so that branch is unit-tested only) and the **iOS home-screen
pass** over the tailnet, where the confirmation should appear exactly once on first launch from the
icon. Ben's cleared landing images never arrived, so the run ships as the 8 Wikimedia works; adding
more is one file plus one line, and the 8-slide cap keeps the pacing at ~5s however long the list
grows. Then: the thrice-deferred **6.3 blog design session**, or Phase 7.

*Session spend: 53.70M tok (in 8.7k · out 253.8k · cache r 52.23M / w 1.21M) · ~$43.42 · opus-5 + opus-4-7 + fable-5 · 23:46→00:33*

**Later the same day — the 6.3 blog-adapter design session opened, and stopped four questions in**
so the rest could be handed to another model. Everything needed to resume is in
`docs/PHASE6_DESIGN_HANDOFF_6.3.md`; only the parts that won't survive in that doc are here.

**Four probes reframed the seven open questions before any of them were asked.** (1) The image
proxy Phase 5 built already answers Q5 — `/api/img/[itemId]` fetches by item id with no referer, so
blog images need no new hosting story and only the cache layer is left, which that route's own
comment already gives to 7.3. (2) **doorofperception is WordPress and its REST API is live**:
390 posts, `robots.txt` allow-all with no AI block list, `featured_media` on every post, and
`excerpt.rendered` is a *written* paragraph rather than a truncation. So corpus #1 needs no HTML
scraping at all, and BUILD_PLAN's "shared scraper core" is more honestly a WP REST corpus-walk
adapter — which also means the blog strategy's first test doesn't exercise the scraper it was
sketched around. (3) The 310 `archive` rows carry **no post provenance**: `attribution: "Personal
archive"`, `source_url` pointing at the archive's own `/img/<sha>.webp`. Any doorofperception image
already in the corpus is on screen right now with the wrong credit and no link out — so the overlap
question was never housekeeping, it was a rights correction. (4) 11,572 images across 390 posts
(p50 29, max 123) against an ~11,300-item corpus, and a taxonomy — Art / Consciousness /
Psychedelic — that only partly overlaps the sixteen topics.

**Decisions:** one item per post using the blog's own featured image (~390 items, ~3% of corpus,
and the link-card shape the rights posture describes) · ambit-archive **stops serving
doorofperception** from `/search` and Ambit deletes those rows, so every image from that blog
carries its credit or isn't there · **corpus-walk becomes a second blessed adapter shape**, a
`CorpusWalkAdapter` sibling leaving `SourceAdapter` — the cross-service agreement — untouched, and
loupe inherits it · topic assignment folds into the curator's existing LLM call as "one of 16 or
none", with nulls **dropped and counted** rather than force-fit, because a psychedelia post filed
under `botany` teaches the drift graph something false. The plan owes a measured histogram over all
390 before any of that is committed to.

**Open / next:** the interrupted question is where a blog card's text lives — one blurb in
`summary` with `body` hard-null (which turns "Ambit never renders blog article text" into an
invariant a test can assert), versus BUILD_PLAN's original two-text sketch, a new column, or a
third `type`. Then scrape etiquette for blogs #2+, curator confirmation, re-crawl semantics, the
designated-blog registry, and an explicit call on whether the archive retirement ships inside 6.3
or splits out. Two things live outside this repo: the archive-side exclusion, and recording that
decision in the Ambit-Admin vault doc, since it changes a private-source integration.

*Session spend: 7.57M tok (in 170 · out 112.9k · cache r 6.76M / w 703.2k) · ~$12.34 · opus-5 + opus-4-7 · 08:19→22:09*

**The design session then finished, under a different model.** The handoff doc was checked cold —
every path, line number and count held, and two of its "confirm this" asks are now confirmed (the
present-row skip runs *before* the curator; `upsertItem`'s refresh never touches topic or score, so
a re-crawled post keeps both). Three probes changed the inputs: **none of the blog #2 candidates
is WordPress, and 50watts is out** — `User-agent: * / Disallow: /`, REST 403 regardless of UA — so
the "shared scraper core" is not a WP client but the walk contract + registry + card, with each
blog its own adapter exactly as each museum is; **the curator already sends the hero as bytes and
caches by item**, so classification is a prompt *variant* on the walk path with its own cache key
rather than a change the museum corpus ever sees; and doorofperception's featured images are a
purpose-made **~800 px crop** — fine for tile and hero, not gallery-grade, and a reason `index.csv`
stays valuable. Ambit-Admin's *Ecosystem Architecture* turned out to already define corpus-walk in
D3+D4's exact terms, so those two implement a recorded decision rather than make one.

**Decisions to close it out:** one blurb in `summary` with `body` hard-null for every blog item
(so "Ambit never renders blog article text" is an invariant CI refuses, not a rule to remember);
D2 ships **inside** 6.3, ordered blog-live → verified → retire, so there is never a window with
neither credit; and the walk lane joins the pipeline at step 3 — bypassing collision resolution,
sharing skip/floor/curator/upsert — with classification as a curator mode. The archive retirement
is configuration, not code: stop scanning the folder, run a complete sync attended, let the sweep
withdraw; its 20% mass-drop guard will trip on purpose. Approved design: `docs/PHASE6_DESIGN_6.3.md`.

**Open / next:** `docs/PHASE6_PLAN_6.3.md` is written — thirteen tasks, cold-executable, for a
separate session. T7 is the gate: the classification histogram over all 390 posts, recorded before
any write, with a stop-and-show if the yield is under ~30%. T12 is the attended one: the archive's
20% mass-drop guard is *expected* to block the first sync, and `--force-sweep` is Ben reading the
number.

*Session spend: 10.66M tok (in 12.2k · out 135.4k · cache r 9.88M / w 626.4k) · ~$28.28 · fable-5 + opus-5 · 22:09→22:39*
*Session spend: 11.34M tok (in 11.2k · out 250.5k · cache r 10.48M / w 594.0k) · ~$35.00 · fable-5 · 22:39→22:53*

### [[08-24-26 Mon]] — Archive is live and verified; Ambit's side of A.6 closed the same afternoon

No Ambit code changed. Recording this here because [[Ambit Archive]] is now a real, reachable
source and the hookup is Ambit's to do.

`archive.home.benreilly.io` serves the full corpus over a valid cert through Caddy, `/search`
returns a ranked array for a valid key and 401 for a wrong or absent one, and `/img/<sha>.webp`
serves derivatives with an immutable cache header. Item count settled at **13,379** after two
images were deliberately purged.

**Task 18 (Ambit's side) — done, second session the same day.** `.env` already carried
`ARCHIVE_URL=https://archive.home.benreilly.io` and the key; what was left was the stale rows and the
proof.

- **The 310 rows from 08-21 were repaired by a URL rewrite, not a re-ingest or a delete.** Two
  reasons, one of them a finding: `scripts/ingest.ts` filters out anything already in the DB
  *before* `upsertItem` runs (`ingest.ts:238-249`), so the upsert's `imageUrl` refresh never touches
  an existing row — **a re-ingest cannot repair a stale URL, ever**. And delete-then-re-ingest would
  re-pay curation for 310 items. The archive's `/img/<sha>.webp` path is pure content-hash string
  maths, so swapping `http://localhost:3001/` → `https://archive.home.benreilly.io/` on `image_url`
  and `source_url` is exact. Dry-run first (310 rows, sample HEADs 200 on prod), then applied: 310
  updated, 0 left. Zero saves referenced them; 4 `seen_item` rows did.
- **HEAD-swept all 310 image URLs on prod: 310/310 → 200.** Neither of the two images purged from
  the archive on 08-24 was ever in Ambit's rows, so nothing to delete.
- `bun run ingest --source archive --quota 20` (space-separated flags) against prod: 29 searches,
  320 offered, **0 errors**, 10 collisions → the identical 310, all skipped, 0 inserted, 2.6s. The
  search ranking is deterministic, so at the same quota the adapter draws the same set it drew on
  08-21; a bigger quota is how the archive grows its footprint in Ambit, not a re-run.
- **An archive image renders inside Ambit through `/api/img/[itemId]`**: 200 `image/webp`,
  1010×1400, 150 KB, 0.47s server-side. That was the last unverified line of runbook Task 19 that
  Ambit could answer; also re-checked from here: no key → 401, direct `/img` → 200 with
  `public, max-age=31536000, immutable`, two traversal forms → 404.
- Noticed, not fixed: the ingest run enumerated **18 topics, not 16** — two `test-feed-topic-*`
  rows are sitting in `topic`, e2e leftovers of the same accumulation `CLAUDE.md` warns about for
  `gallery.spec:193`. They draw 0 archive items, so harmless today; worth sweeping with the e2e
  users/seen rows.

**Key rotation — decided against (later the same day).** The key was echoed in plaintext during
testing, but it only guards read-only `/search` on a host that resolves LAN-only (Pi-hole
split-horizon, no public route), and `/img` is public-by-hash regardless. Grepped both repos' docs,
logs and the vault: the value is nowhere but the two `.env`s, Coolify, and the 08-24 session
transcript. Low enough to leave. **Rotate if the archive ever gets a public route or the key is
reused** — and do it in all three places in one pass, or the copies drift the way the Immich key
did. Verified the standing key from Ambit's `.env`: `/search` 200, wrong key 401, no shell shadow.

Full detail in `~/Dev/ambit-archive/log.md`; the VM 202 DNS fix is in the vault's homelab log.

*Session spend: 32.51M tok (in 400 · out 251.5k · cache r 31.64M / w 615.6k) · ~$28.27 · opus-5 · 11:35→14:37*
*Session spend: 8.05M tok (in 9.2k · out 113.5k · cache r 7.60M / w 327.5k) · ~$19.92 · fable-5 · 15:19→15:29*

**Evening: Phase 5.11 planned — landing slideshow + install + PWA polish** (the last Phase 5
step; `docs/PHASE5_PLAN_5.11.md`, cold-executable in the 5.10 format). Three decisions put to
Ben, all answered: slides are **the 8 Wikimedia PD works fetched once into `public/landing/`
plus a set Ben is clearing himself** (the bundle's `uploads/*.webp` stay out — that gate holds);
pacing is **"faster, ~5 s"** — `slideMs 600`, a random subset of 8 per load, tap-anywhere or the
floating glyph skips; the install banner shows on the **second feed visit**, "Not now" snoozes
30 days, the X is permanent, never when already standalone. Approved on the landing design
with "hero size is easy to change, don't care on the first go" — the prototype's 16 px sheet
hero ships as drawn.

**Plan-time findings worth keeping:**
- **`defaultCache` was caching the personalized feed.** `@serwist/turbopack`'s default rules
  put every same-origin `/api/*` except auth through `NetworkFirst` into a 16-entry `apis`
  bucket; tRPC queries go over GET, so feed pages have been landing in Cache Storage since
  Phase 1, sharing those 16 slots with `/api/img/*`. 5.11 replaces it with a hand-written
  strategy: tRPC `NetworkOnly`, image proxy `CacheFirst` (150 / 7 d), only the `/feed`
  **document** `NetworkFirst` — the RSC HTML carries the first page dehydrated, so "last cached
  feed" needs no API response cached at all. Redirected responses are never stored (a signed-out
  `/feed` is a redirect to `/`, and a cached redirect breaks navigations), and sign-out purges
  the pages bucket.
- **`start_url: "/"` defeats offline launch.** `/` is itself a redirect when signed in, so an
  installed app opened offline would hit the `~offline` fallback instead of the cached feed.
  Moves to `/feed`, which still bounces signed-out readers to `/` server-side.
- **The one prototype deviation:** the "Ambit is on your home screen" confirmation fires on
  `appinstalled` (Chromium) or on the *first standalone launch* (iOS), never after "Got it" —
  Safari gives the page no install signal, so the prototype's flow would confirm an install
  that may not have happened.
- The sheet must be **mounted from first paint** (translated off-screen, not unmounted):
  `waitForHydration(page, "form")` and every auth e2e selector depend on the form being in
  the DOM; the tests take the reader's own skip path (`openAuthSheet` clicks the glyph).
- 5.10's `InstallSheet` header comment had already reserved this phase's use of it; it moves to
  `components/install/` and is otherwise untouched.

**Open / next:** execute `docs/PHASE5_PLAN_5.11.md` on `feat/5.11-landing-install-pwa` in a
cheaper session — Ben's cleared images are an optional prerequisite, not a blocker. Offline and
install verification is manual against `bun run preview` (the SW is production-only by policy).
Phase 5 closes with that merge; then the 6.3 blog design session or Phase 7.

*Session spend: 8.58M tok (in 4.8k · out 174.3k · cache r 7.71M / w 696.7k) · ~$29.59 · fable-5 + opus-5 · 19:54→23:46*

### [[08-24-26 Mon]] — Phase 5.10: Profile + Settings planned, then shipped

**The headline decision: BUILD_PLAN's "minimal viable" 5.10 is superseded.** Asked why the
entry cut so much, Ben pulled the full designed surface back into scope — bio, handle, the
complete settings row set — with three carve-outs: **avatar upload is out permanently**,
replaced by a deterministic per-user color disc now and a *preference-derived sprite/glyph
generator* as a named post-MVP feature; the three expensive rows (**Serendipity, Muted
sources, Invite a friend**) ship as honest stubs (visible, no fabricated values, "coming
soon" toasts) rather than real features; **email is read-only** (Better Auth's update-user
rejects email changes; change-email is a later auth phase).

**Decisions locked with Ben:** handle is display-only (no share button — no public profiles
to share); `/profile/edit` is a dedicated route (real multi-field form, not a sheet); new
collection gets a name-input sheet (the prototype's zero-input auto-name is rejected — no
rename exists, so auto-names would be permanent); sign-out gets a standalone card above the
version footer (the prototype has no sign-out anywhere — 5.10 invents it); collection
deletion/rename deferred entirely (no design pressure, and it keeps the `collections_seeded_at`
migration out); contact mailto = Ben's address; `package.json` → 0.4.0 so the footer's "v0.4"
is wired, not hardcoded; collection tiles get real cover images (additive `cover` on
`saves.collections`).

**Plan-time findings:**
- The Profile/Settings prototypes live in the **redesign** bundle, and there are **three**
  screens, not two — `Ambit - Profile Edit.dc.html` is where all editing happens. The bundle
  has no sign-out and no collection deletion anywhere (grep-verified across all 11 files).
- `handle`/`bio` can't ride `ctx.user` — `getSession` only returns columns Better Auth
  declares — so the phase adds a proper tRPC `user` router (`me` + `updateProfile`) rather
  than `authClient.updateUser` or `additionalFields`.
- The repo was already waiting again: `PillToolbar`'s default `onProfile` pushes `/profile`
  (a 404 today) from three shipped screens; the accent knob from 5.1 becomes Appearance's
  real picker; the Notifications row can show live browser permission state without any push
  feature existing.

**Shipped:** `docs/PHASE5_PLAN_5.10.md` — cold-executable in the 5.9 format (migration 0003,
`user` router, `createCollection`, `topics.mine`, covers, three screens + four sheets, three
new origin markers, ~35-40 new tests + a sixth e2e spec, 12-step order with the
don't-delete-sign-out-early trap flagged).

---

**Executed the same day** on `feat/5.10-profile-settings`, straight through with no mid-phase
stop, and **merged to `main`** (`595b038`), re-verified green there. `bun run check` green (642
vitest tests, 47 new), `bun run build` clean, `bun run e2e` green across all six spec files on
three consecutive runs. Walkthrough: `docs/PHASE5_WALKTHROUGH_5.10.md`. All fourteen plan decisions
held; the app has no internal 404s left.

**Four things argued back, none of them the design:**

- **The prototype's warn tint already had a token.** The plan said to render `#D98C6A` as a
  literal with a "no theme token" comment. `--color-error` in globals.css *is* that hex.
  `text-error` throughout instead.
- **The plan's shape for the two client-capability reads is a lint error in this repo.** Null
  `useState` + an effect that fills it in — for the accent (localStorage) and the notification
  permission (`window.Notification`) — is exactly what `react-hooks/set-state-in-effect` flags,
  and it's an error here, not a warning. Both are genuinely external stores, so both became
  `useSyncExternalStore` with a `getServerSnapshot` returning `null`: same pre-mount null the plan
  wanted, one render sooner, no suppression, and the server/hydration renders agree by
  construction. The topics sheet's re-seed-on-open took the *other* house answer — render-time
  state adjustment against a `prevOpen`, which is what `BottomSheet` already does. Two hardenings
  fell out of testing it: `getSnapshot` needs no cache (it returns a string; `Object.is` compares
  by value) and caching it was a way for store and reality to disagree across tests; and
  `"Notification" in window` is **not** a sufficient guard — a webview, or a test that stubs the
  global away, leaves the key present with an undefined value and `.permission` throws.
- **`listTopics()` has no `ORDER BY`.** Settings' "What you see" row takes the first three picked
  labels, and I wrote it deferring to "the catalog's order" with a comment claiming that was
  stable. Postgres returned "Botany, Music, Astronomy" and the e2e assertion caught it. Sorted
  alphabetically now. **Flagged, not fixed:** the onboarding chip grid renders from that same
  unordered query, so its order is arbitrary too — real if minor, and fixing it means changing a
  screen 5.10 doesn't own.
- **Global handle uniqueness bit two test fixtures, in sequence.** `user.handle` is unique across
  the whole table and e2e user rows persist by design (the timestamped *email* only stops reruns
  colliding on email). `e2e/settings.spec.ts` used a literal `@BenTest`: it passed once, then
  failed against its own predecessor. `routers.integration.test.ts` then failed the same way,
  losing to the e2e user. Both handles are run-scoped now, and the squatted `bentest` was released
  from the dev DB by hand. Neither was a code defect — both were fixtures assuming a namespace
  they don't own, and both would have failed on `main` a month from now.

**Playwright workers capped at 3 (CI: 1) — the deferred decision, finally taken.** 5.9 recommended
it, the 5.10 plan named the trigger condition, and six spec files hit it immediately: two
consecutive whole-suite runs each failed two tests, never the same two
(`gallery.spec:193` / `saved.spec:142` / `feed.spec:173` in rotation), and every one passed in
isolation. Playwright's default had put five workers on this box against one dev server and one
Postgres. Three workers, then three consecutive green full runs at 1.7–1.8 min versus ~1.5 for the
flaky five-worker runs — the fourth and fifth workers were buying almost nothing and costing
correctness. **`gallery.spec:193` passed all three times**, which is suggestive about CLAUDE.md's
documented dev-DB flake but not proof; the note stays until it survives more sessions.

**Also shipped, beyond the plan's own list:** 9.2 (the accent picker) is checked off in BUILD_PLAN
— 5.10 had to build the Settings surface anyway, so it landed here, persisted **per-device** in
localStorage rather than as a user column. And 9.11 is new: the preference-derived sprite/glyph
avatar generator, as the locked decision required, with the pill's per-user disc folded into it.

**Open / next:** 5.11 (landing/PWA) or the still-thrice-deferred 6.3 blog design session. Two
small things noticed and left: `listTopics` ordering (above), and — from this morning's archive
session — the two `test-feed-topic-*` rows still sitting in `topic`.

*Session spend: 17.91M tok (in 154 · out 181.9k · cache r 16.33M / w 1.40M) · ~≥$51.61 · fable-5 + opus-4-7 + <synthetic> · 23:53→12:34*
*Session spend: 62.55M tok (in 522 · out 233.1k · cache r 61.44M / w 872.9k) · ~$45.28 · opus-5 · 16:09→16:56*
*Session spend: 6.07M tok (in 51 · out 24.8k · cache r 5.04M / w 1.00M) · ~$12.11 · opus-5 + opus-4-7 · 16:56→19:50*

### [[08-23-26 Sun]] — Phase 6.1 planned: the feed learns from saves

**Decisions (locked with Ben, do not relitigate):** 6.1 chosen over resuming UI (5.9/5.10), a
feel-tune pass, or the 6.3 blog design session. Four design calls, all landing on the recommended
option: **no unsave decrement** (weights record demonstrated interest; unsave is housekeeping);
**taste keywords derived at feed time** from the last-24 unique tags across recent saves — never
stored, so no migration and unsave self-heals; **one combined toast** ("Saved to Art · Now
drifting toward Cartography"); **no graph-neighbor spillover** — creating the `user_topic` row on
a save of an unpicked topic *is* the related-topic inference, and DRIFT/JUMP structure spreads it
from there. Bump arithmetic wasn't up for debate: phase0's `min(3, w + 0.5)` is the shipped
default per SPEC §9's standing rule.

**Findings from the plan-time exploration:**
- BUILD_PLAN 6.1 cites **SPEC §3.3b, which doesn't exist** — the material lives in §3.3/§3.4/§9.
  The plan fixes the phantom.
- The engine was already waiting: `feed.ts:526` carries the literal `tasteKeywords: []` TODO
  naming Phase 6.1, and `drawWeight` already applies the tag boost. Saving currently has **zero**
  side effects beyond the upsert; `isItemSaved` sits router-unused since `saves.toggle` died —
  it's the ready-made new-save-vs-move check.
- Two breakages a cold executor would hit blind, now pre-charted: strict `toEqual` assertions on
  the mutation's return shape, and `sheets.test.tsx`'s hand-typed mock contract failing
  *typecheck* (not just tests) once components read `result.drift`.
- One real edge case, documented-not-mechanized: an authed never-onboarded user can save from the
  public `/i/`/`/g/` pages, which creates a single-row weights map *and* flips
  `hasCompletedOnboarding`, silently skipping the picker forever. Bounded and acceptable for an
  invite-gated app; recorded, nothing built.

**Shipped:** `docs/PHASE6_PLAN_6.1.md` — cold-executable in the 6.2 style (five tasks, ending in
docs; verified-at-plan-time blocks; the 5.4 seeded-distribution test pattern reused for the
"measurably but not overwhelmingly" done bar: >+5pp shift at cap weight, <50% share, topicCap
bound under shipped knobs).

**Open / next:** execute the plan in a cheaper session on `feat/6.1-feed-learns-from-saves`.

*Session spend: 3.86M tok (in 80 · out 90.8k · cache r 2.70M / w 1.07M) · ~$28.69 · fable-5 · 19:30→20:13*

**Executed the same evening** (second session, straight through, no mid-phase stops — as planned):

**Shipped:** the save→feed learning loop, merged as `feat/6.1-feed-learns-from-saves`. A new save
bumps its topic `LEAST(3.0, w + 0.5)` atomically (one upsert; `xmax = 0` answers new-vs-existing
with no read-then-write race — Drizzle took the expression without needing the plan's fallback);
taste keywords now derive at feed time from the last-24 unique tags over recent saves, deleting
the `feed.ts` TODO; the combined toast ships from a single `saveToastText` helper at all four
call sites. 558 vitest tests + 15 e2e green; walkthrough: `docs/PHASE6_WALKTHROUGH_6.1.md`.

**Findings (where the plan met reality):**
- The tier-mix test's flat-`sim` fixture is **asymmetric for per-topic share measurements**:
  `pickJump` slices each row's stored tail, so with tied sims, tail membership falls out of array
  order and the alphabetically-first topic measured 0.195 instead of 0.25 under uniform weights.
  Rotated sims (0.9/0.5/0.1 cyclic) restore real symmetry — worth remembering next time a
  distribution test wants per-topic (not per-tier) assertions.
- The predicted `sheets.test.tsx` *typecheck* break never happened — `vi.mock` replaces the tRPC
  hooks at runtime only, so hand-typed mock shapes never meet the component's types. The break
  was real but surfaced as a runtime assertion instead.
- Scripted FEED_DEBUG check: 5 botany saves doubled botany's share of fresh pages (10/48 vs 5/48
  for a cold twin) — measurable, not overwhelming; every save toasted the topic by name.

**Open / next:** 5.9/5.10/5.11 (remaining UI), or the 6.3 blog-source design session.

*Session spend: 20.15M tok (in 442 · out 147.5k · cache r 19.21M / w 794.0k) · ~$35.95 · fable-5 + opus-4-7 · 20:17→20:31*
*Session spend: 2.32M tok (in 28 · out 11.0k · cache r 2.29M / w 18.0k) · ~$3.20 · fable-5 · 20:31→20:33*

**Phase 5.9 planned the same night** (third session): **5.9 Saved UI chosen** over the 6.3 blog
design session (deferred a third time, knowingly) and the feel-tune pass — it's the next Phase 5
screen in journey order, pure UI over 5.5's shipped backend, and 6.2's corpus discharged the
"sources before more UI" argument from 08-21.

**Decisions locked in the plan (`docs/PHASE5_PLAN_5.9.md`):** chips are **collections**, not the
prototype's All/Images/Reading type filter, and the grid is the 5.6 shared masonry, not the
prototype's caption grid — both reinterpretations BUILD_PLAN's own 5.9 entry already made. Filter
state lives in the URL (`/saved?collection=`); a third `saved-origin` marker (mirroring
feed/gallery-origin, deliberately unabstracted) so leaving Saved pops instead of rebuilding the
feed; article taps carry **no** origin marker (feed-origin's semantics would mislabel the pill);
unsave is optimistic with the item-sheet invalidation trio; no long-press/ItemSheet on Saved tiles.

**Plan-time findings:** the repo was already waiting for this screen everywhere — `proxy.ts`
matches `/saved/:path*`, `CollectionsSheet` pushes `/saved?collection={id}` links that currently
404, `PillToolbar` reserves the `"on-saved"` white bookmark, and `chip.tsx`'s header comment
promises exactly the `size="sm"` prop the plan adds. Zero backend work: `saves.list`'s doc comment
even names 5.9's chips as its purpose. Deferred and flagged: share-collection (entirely),
collection creation (5.10 owns it — chips show seeded defaults only until then), `saves.list`
pagination, and the Saved-reachability question (two hops from feed — flag, don't fix).

**Open / next:** execute `docs/PHASE5_PLAN_5.9.md` in a cheaper session on
`feat/5.9-saved-collections-ui`.

*Session spend: 3.16M tok (in 76 · out 72.9k · cache r 2.85M / w 234.3k) · ~$11.18 · fable-5 · 22:12→22:57*

**5.9 executed the same night** (fourth session, straight through): `/saved` shipped and merged
as `feat/5.9-saved-collections-ui`. The plan held — no design question surfaced; 581 vitest tests
green (21 new), build clean, the new e2e spec 5/5. Walkthrough:
`docs/PHASE5_WALKTHROUGH_5.9.md`.

**Findings (where reality improved on or argued with the plan):**
- **Chip taps cost zero client fetches**, not the one the plan budgeted: `router.replace` to
  `/saved?collection=` is an RSC navigation, so the shell re-prefetches the filtered list and the
  payload hydrates the new query key. The hydration contract covers the filter, not just the
  cold load (verified with a scripted Network-tab check, plus zero client `saves.*` on hard
  reload).
- **The e2e suite's five-worker load, not the code, was the whole fight.** Adding the fifth spec
  file pushed server-bound waits past Playwright's 5s default with a rotating victim
  (`auth:68` × 3, then feed's console test, then saved's own save round-trip) — every one green
  in isolation, and `main` red the same way under the same load. Fixes: 15s allowances on the
  server-bound waits (saved.spec + auth:68, matching feed.spec's own polls), and cleared 271
  accumulated e2e users / 6.4k seen rows (the documented gallery:193 aggravator). If a sixth
  spec repeats this, cap `workers` in playwright.config.ts instead of spreading more timeouts.

**Open / next:** 5.10 (profile/settings — collection creation, the Saved-reachability decision),
5.11, or the thrice-deferred 6.3 blog design session.

*Session spend: 34.67M tok (in 427 · out 199.7k · cache r 33.89M / w 586.0k) · ~$53.30 · fable-5 + opus-4-7 · 23:18→23:53*

### [[08-22-26 Sat]] — LoC re-curation repaired, and a stale key no amount of checking could find

**Findings:**
- `bun run recurate --source loc` failed *every* item with OpenRouter `401 {"message":"User not found."}`.
  The cause was not the key in `.env`: **Bun resolves real environment variables ahead of `.env`**, and
  `~/.zshrc` carried two `export OPENROUTER_API_KEY` lines — the second, dead one winning. Editing `.env`
  changed nothing the process ever saw. Both old and new keys were 73 chars (`sk-or-v1-` + 64 hex), so
  length, prefix, format and a password-manager comparison all looked correct; the shadow was invisible to
  every check short of `env -u OPENROUTER_API_KEY bun -e …`, which returned 200 on the first try. The zshrc
  exports are deleted — `.env` is now the only source.
- **"User not found." is OpenRouter's *account*-level error**, not a bad-key error (a malformed key reads
  "No auth credentials found"). That distinction was the tell, and it pointed at the account for two rounds
  before the real answer turned out to be which key was being sent at all. Worth remembering next time.
- The 401s were never cached. `curator.ts`'s `writeFile` to `.cache/curation/` sits inside the `try` after a
  successful parse, so the failed run left no poisoned entries needing a sweep before the retry.

**Shipped:**
- **LoC re-curation complete** — resumed from offset 259 (5-row smoke test, then 112): **117 rows re-scored
  against the actual image**, `no-image 0`, `fallback-skips 0`, so nothing was left on a text-only judgment.
  avg 7.20→7.60 on the smoke set, 7.72→8.16 across the remaining 112; 49 of those changed score.
- The upward drift is what the text-only scores predicted: LoC's billboard/signage catalog titles undersell
  their images, so judging from title alone scored them low. `tile.loc.gov` is no longer throttling — the
  Phase 6.2 429 that caused the text-only scores in the first place has cleared.

**Confirmed:** LoC holds **376 rows total**, so rows 0–258 (first run) plus 259–375 (this one) cover the
source completely — every LoC item has now been scored against its image, and `recurate.ts`'s LoC job is
done. Post-repair distribution: avg **8.21**, range 7–9, **0 rows with empty tags** and **0 bare-5s** — the
shape `recurate.ts` treats as a give-up fallback survives nowhere in the source. (There is no score-based
floor hiding low rows: `ingest.ts`'s structural floor is rule-based and runs *before* the curator, so 7–9
is the genuine range.)

**Open / next:** nothing outstanding on LoC.

*Session spend: 3.94M tok (in 110 · out 27.9k · cache r 3.62M / w 297.7k) · ~$5.48 · opus-5 · 09:13→13:17*

### [[08-21-26 Fri]] — Two environment facts moved out of the Daily Brief and into CLAUDE.md

Vault-side hygiene with a repo-side consequence. Ben trimmed the Daily Brief's attention list from 35
items to 16 on the rule that **an item belongs there only if the brief is its only home** — anything an
active repo's own plan tracks gets a pointer, not a copy. Verifying that before trimming found two
Ambit items with no home at all, so they now live in `CLAUDE.md` under a new *Local dev environment*
section rather than only inside an old log entry:

- **Ambit must own port 3000** — `BETTER_AUTH_URL` is pinned to `http://localhost:3000` and
  `tailscale serve --bg 3000` fronts the same port, so a squatting `node` process breaks auth callbacks
  and device passes at once. This had existed only in the 08-16 entry and had been dropped from every
  Open/next list since.
- **Device passes must run over HTTPS** — the Web Share API is secure-context only, so on plain HTTP
  `navigator.share` is `undefined` rather than broken, and share/clipboard/service-worker checks were
  silently untestable in every past pass.

Also recorded there: a red Postgres-touching integration test usually means the machine is busy
(overlapping `bun run test`, loaded dev server → vitest setup ~7s → ~650s), not that the code broke.

Worth knowing for its own sake: the same sweep found **`structuralFloor`'s `dup-title` fix already
shipped** (`search.ts`/`server.ts`, tested) while the brief had been carrying it as open for four days.
A copy of a repo's backlog goes stale the moment anyone works in the repo.

---

**Phase 6.2 planned — and reframed while being planned.** A Fable session picked the next phase
with Ben: **sources before more UI** (5.9/5.10 wait), on the strength of 5.8's own finding that
rail feel and `wildcardChance` can't be judged against a two-museum corpus. Plan doc:
`docs/PHASE6_PLAN_6.2.md`, cold-executable in the 5.x style.

**The reframe:** BUILD_PLAN 6.2 still promised "remaining v1 adapters — Smithsonian, APOD,
Wikiquote, Gutenberg", but the 08-20 correction in `source-candidates.md` had already established
those were never commitments. So 6.2 is now **the first run of the trial loop**, and the batch is
what the candidates table actually ranks: **Smithsonian Open Access, LoC (cleared-collections
scope, starting with Margolies), NASA Image & Video Library, PoetryDB** — Ben took all four.
NASA's full library deliberately replaces APOD (no auth, whole catalog vs. keyed
image-of-the-day); Wikiquote and Gutenberg/Wikisource become candidate rows instead of silently
vanishing.

**Decisions:** trial **and** promote in one phase, but gated — the executing session builds all
four adapters, sample-ingests with the curator on (whose bytes-not-URLs image download doubles as
a hotlink health check, the exact thing that killed AIC), then **stops for Ben's Keep/Park/Cut**
before any promotion. Partial topic coverage is by design (ingest already skips empty cells —
verified, not built). No graph recompute, no new topics; hotlinking stands and image-host
misbehavior is recorded as 7.3 evidence, not solved. `WILDCARD_SOURCES` membership is asked per
keeper, default no.

**One prerequisite is Ben's:** a free api.data.gov key as `SMITHSONIAN_API_KEY` before execution.
Discharged same evening — key is in `.env`, and 6.2 is **ready to hand to an executing session**
(T1–T4 are independent starts; the session must stop at T6 for Ben's Keep/Park/Cut verdicts).

*Session spend: 8.51M tok (in 152 · out 135.6k · cache r 7.73M / w 649.0k) · ~$27.49 · fable-5 · 17:02→17:36*
*Session spend: 3.54M tok (in 44 · out 13.4k · cache r 2.83M / w 703.6k) · ~$17.57 · fable-5 · 17:36→19:33*

---

**6.2 executed — four trialed, three kept, one parked.** The plan ran end to end in one session,
including the T6 stop. Verdicts: **Keep** smithsonian · **Keep** loc · **Keep** nasa-images ·
**Park** poetrydb. Corpus went from ~8,900 items over six drawable sources to **~11,300 over
eight**. Evidence sheet and walkthrough: `docs/PHASE6_WALKTHROUGH_6.2.md`.

**Findings, in rough order of how much they'll matter later:**

**1. `tile.loc.gov` rate-limits by IP, and it caught us mid-ingest.** The LoC sample run's hotlink
check was clean (42/42). The 334-image *promotion* run tripped a sustained HTTP 429 — not a burst
problem: serial requests a second apart 429 identically, as do requests with no User-Agent and
requests carrying a stock Chrome one. No `Retry-After`, no `x-ratelimit-*`, still blocking forty
minutes later. **This is a different problem from AIC's and points somewhere else.** AIC is a
referer rule, which a proxy fixes by definition. This is a *budget*, which a **cache** fixes and a
bare proxy might make worse by funnelling every reader's requests through one address — and the
feed hotlinks heroes from the *reader's* connection, so the exposure isn't ours to observe. Into
SPEC §15 for 7.3, per the phase's own "record, don't solve" decision.

**2. The curator's image-download failure was completely silent, and that's now fixed.** It has
always degraded gracefully — appends "(The image could not be fetched…)" and scores from text — but
said nothing. So a 334-item run finished, reported clean success, and left no way to answer whether
those scores were made by looking at the pictures. `scoreItem` now returns `imageFetchFailed`,
`curateItems` takes a hook, ingest prints a `no-image` column. **The instrument didn't exist when
it was needed**, which is the whole lesson; LoC's 376 scores are of unknown provenance and want a
`--force` re-curation once the block clears. That's the first thing to pick up.

**3. PoetryDB was parked for a reason that isn't PoetryDB's fault.** It averaged 5.50 with nothing
above 7 — but Pope and Seeger both scored **4**, against a prompt that asks for "visually striking
or quietly beautiful images" and "*huh, I never knew that*". A lyric poem cannot win on that
rubric, and it's the same structural reason wikipedia sits at 5.27 corpus-wide. **So the number was
reading the prompt, not the corpus**, and the honest verdict was Park rather than Cut. Two fixable
blockers recorded: that rubric gap (Ben's call — `CURATOR_PROMPT` is a taste artifact, SPEC §15),
and summaries that take the first two lines of `lines[]`, which includes epigraphs — "The Last
Oracle" leads with transliterated Greek. Parking is implemented as *no seed cells*: adapter and
tests stay, ingest never reaches it, a test locks the state so un-parking can't happen silently.

**4. Two plan assumptions died on contact, both replaced on measurement.** PoetryDB's `GET
/lines/<keyword>` — the natural one-step search — **503s at any real result-set size** (nine
keywords tested; only a single-poem match returned 200), so search became a two-step. And LoC's
per-collection rights wording couldn't come from the collection's rights page, which is a
JavaScript-rendered LibGuide with no static text; it came from the API's own `rights_information`
instead, which is better anyway — reproducible by anyone re-running the probe.

**5. Density is a vocabulary problem, not a quota problem.** Smithsonian loses 31% of offered items
at the structural floor and NASA 42%, almost all dup-title. The instructive part is which cells came
in thin and why: `smithsonian/textiles` yielded 4 from a 13,350-hit query because Cooper Hewitt
catalogues objects under the literal title "Textile"; `nasa/cartography` yielded 3 from 7,356
because NASA publishes long runs of near-identical scene captures. Both were fixed at promotion by
**changing the words**, not raising the quota — a bigger quota just floors more. (`specimen`
returns 5,029,697 Smithsonian rows and is never used.)

**Small things that had to happen:** `sourceLabel()` gained the four names, because the credit line
rendered "from: Loc" and "from: Poetrydb" — a false detail sitting directly in front of the evidence
Ben was verdicting against. `normalize.decodeEntities()` joined `stripHtml` (13 of 600 NASA
descriptions carry `&quot;`/`&amp;`, which strips tags leaves behind). And the plan's own
score-distribution SQL doesn't run — `round(double precision, integer)` doesn't exist in Postgres;
`avg` needs a `::numeric` cast.

**The e2e red herring, worth an hour of someone else's time.** The final `bun run e2e` failed
`gallery.spec.ts:193` four times running while `main` passed 27/27 on the same DB — which reads as
conclusive and isn't. The test passes 10/10 in isolation; only the full suite fails it; the failure
signature moves between "element is not stable" and a `waitForURL` that never resolves. Only one
file in the whole diff can even reach that flow (`source-label.ts`, whose longer credit lines could
plausibly shift layout under an animation) — swapping in `main`'s copy **still failed**. Re-running
`main` itself settled it: clean 3/3 early in the evening, **2 failures in 3 runs two hours later**,
no code change between. What accumulated in between: **274 `user` rows and 6,709 `seen_item` rows**
from repeated suites, on a corpus 30% larger than that morning. A pre-existing flake this phase made
more likely without causing. Recorded in CLAUDE.md and explicitly distinguished from the older
busy-machine note — that one hits a *different* test each time, this one is always the same test.
Not fixed here; making it robust is its own change.

**Open / next:** (1) **`--force` re-curate the 376 LoC items** once `tile.loc.gov` clears, with the
new counter on, and record the real number. (2) **Ben's call on a curator rubric for text items** —
blocks un-parking poetrydb, and lands before 6.3's blogs, which are text by construction. (3) 7.3's
proxy-vs-cache decision now has two different kinds of evidence pointing at different fixes.
(4) `gallery.spec.ts:193` wants either a stability fix or a dev-DB reset habit — 274 accumulated
e2e users is not a healthy baseline. (5) 6.1 (feed learns from saves) is untouched and next in the
phase.

*Session spend: 82.88M tok (in 954 · out 338.6k · cache r 80.81M / w 1.74M) · ~$62.59 · opus-5 + opus-4-7 · 19:56→21:14*

### [[08-21-26 Fri]] — Handoff: the three questions 5.8 can't be planned without

**Nothing shipped; this is a handoff.** Picked up at the top of 5.8 (the immersive gallery), got as
far as the questions that gate the plan doc, and Ben moved the planning session to Fable. Recording
the questions here so the next session starts from them instead of re-deriving them.

**Where `main` actually is.** Clean at `376b2e7`, 395 unit tests + e2e green at branch tip. 5.7 is
*fully* closed — merged at `44371e7`, iOS device pass passed 08-20-26, and last night's follow-up
commit added the HTTPS dev origin and the hero callout guard. No `PHASE5_PLAN_5.8.md` exists yet.

**Q1 — what the gallery swipes through.** The prototype fakes this with a fixed 28-item `POOL`;
the real app has to answer it, and the answer decides the auth posture, the route, and whether the
gallery burns corpus. Three readings:

- **A wander rail** — prev/next from a topic-graph walk seeded by the entry item, i.e. `wander.ts`
  (already public, already unpersonalized, already backing the item page's teaser) extended from
  three rows to an endless images-only rail. Infinite by construction, which is what the
  prototype's wrap is imitating; **public**, which matters because the entry point is the hero on
  `/i/[itemId]` and the person tapping it may be a stranger who cold-opened a shared link; and it
  marks nothing seen, so swiping doesn't spend corpus. Costs a new public procedure.
- **The feed's image set** — what BUILD_PLAN 5.8 currently says ("over the feed's image set").
  Swiping continues exactly what the reader was just scrolling, but a feed page carries only ~6–8
  images, the pool has to reach a *different route* through client state, and it has no answer for
  either the stranger or Saved (5.9).
- **Fresh `feed.page` draws** — personalized and endless, but auth-only (breaks the public hero)
  and every swipe-through burns corpus through `markSeen`. That is precisely the failure mode
  08-20 spent a session removing; listed to be rejected in writing, not to be considered.

**Q2 — do feed tiles enter the gallery?** BUILD_PLAN says the gallery is entered from item pages
and Saved, "not feed tiles". The redesign README's gesture matrix lists **Feed** as an entry
("Tap image → Feed, Saved, Item image → Open Gallery at that work `?start={id}`"). A real
conflict, and one the recorded convention doesn't settle by itself — *prototypes beat the README*,
but here the README disagrees with BUILD_PLAN rather than with a prototype. Today's shipped
behaviour is 5.6's: a tile tap opens the item page, a long-press opens the item sheet.

**Q3 — route shape.** An own route (`/g/[itemId]`-ish) makes the exit a history **pop** through
the `useLeaveToFeed` machinery 5.7 already built, and makes the gallery deep-linkable. An overlay
mounted over `/i/[itemId]` opens instantly and changes no URL, but then the OS back gesture leaves
the item page entirely instead of closing the gallery — so it has to hand-roll a history entry,
which is the first option with extra steps. Worth deciding explicitly rather than by default,
because 5.7 established that back/exit behaviour here is a **correctness** constraint (a pushed
`/feed` re-runs the dynamic route and draws a page) and not a matter of feel.

**Two constraints 5.8 must not trip, both bought expensively on 08-20.** The item hero's iOS
long-press "Add to Photos" (two taps to the camera roll, the best path a web app can have) works
*only* because the hero doesn't set `-webkit-touch-callout: none` the way the feed tiles must — so
wiring the gallery tap onto that hero must not copy the tile's iOS incantations wholesale. There's
a warning comment in `image-item-body.tsx`; it is the thing most likely to be undone by an
executing session doing the obvious. And **device passes now run over HTTPS**
(`tailscale serve --bg 3000`), because `navigator.share`, the clipboard and service workers are
secure-context-only and were silently `undefined` over plain http — 5.8's share/save paths can't
be tested on the LAN origin at all.

**Also still parked, and 5.8 is where it was deferred to:** how often archive ("wildcard") items
turn up in gallery browsing. Ben wants that flavour more present. Still a wish, not a design —
archive items are labelling-only today. Q1's answer is what makes it addressable at all, since a
wander rail is where a "more wildcard" knob would live.

**Open / next:** answer Q1–Q3 with Ben in the Fable planning session, then write
`docs/PHASE5_PLAN_5.8.md` cold-executable in the 5.4–5.7 house style. Unrelated and still open from
08-20: the 60 real items (30 met, 30 wikipedia) stranded on `topic_id = test-feed-topic-*` by an
integration test that never restored them, and AIC's Cloudflare challenge (`HANDOFF_aic-images.md`
§8) — neither blocks 5.8.

*Session spend: 3.20M tok (in 76 · out 25.7k · cache r 2.98M / w 197.5k) · ~$4.11 · opus-5 · 08:11→08:22*

**The Fable session happened; 5.8 is planned.** All three questions answered with Ben, and
`docs/PHASE5_PLAN_5.8.md` written cold-executable — the handoff below is discharged.

**Decisions:** **Q1 → the wander rail.** A new public `items.galleryRail` extends the wander
machinery into an endless, bidirectional, images-only rail: topic walk using the feed's own
CORE/DRIFT/JUMP shares picks where, curated-weighted random picks what, and nothing is ever
marked seen. **Q2 settled itself by evidence, not preference** — the redesign *feed prototype's
own code* sends image taps to the item page (`openItem()` → `Item Image.dc.html`); only the Saved
and Item-Image prototypes call `openGallery()`. So the README's gesture-matrix row for Feed is
simply wrong, prototypes-beat-README applies after all, and BUILD_PLAN's "not feed tiles" stands.
**Q3 → own route `/g/[itemId]`**, exits popping through a `gallery-origin` marker that mirrors
`feed-origin` (the pill's Feed button reaches the intact feed via `history.go(-2)` when both
markers line up — zero draws).

**The wildcard wish got re-grounded at plan time:** there is no ambit-archive adapter in this repo
to boost — "archive items" are labelling support only. The knob became `wildcardChance` (a rail
slot ignores the walk and draws corpus-wide, preferring a `WILDCARD_SOURCES` list that is empty
today), honored under the same `FEED_DEBUG` gate as the feed knobs. A serendipity dial now, the
archive doorway later.

**Two prototype-vs-README corrections worth remembering:** the gallery has **no double-tap** —
tap shows chrome, tap-again opens details (the prototype's code and its own hint copy agree); and
the details sheet's Medium/Origin/Where-it-lives facts don't exist in the schema, so the table
maps to Maker/From/License/Topic. The 08-20 constraints are wired into the plan as first-class
tasks and device-pass items: the hero tap is a slop-guarded pointer handler (never a `<Link>`,
never the tile's touch-callout suppression — Add to Photos survives), and the device pass runs
over the `tailscale serve` HTTPS origin.

**Open / next:** hand `PHASE5_PLAN_5.8.md` to an executing session (T1/T3/T4 are independent
starts). Still parked from 08-20, still non-blocking: the `test-feed-topic-*` stranded items and
AIC's Cloudflare challenge.

*Session spend: 8.56M tok (in 154 · out 147.4k · cache r 7.87M / w 534.1k) · ~$25.93 · fable-5 · 08:39→09:37*

---

**5.8 executed, cold, from the plan Fable wrote.** Eight tasks on `feat/phase-5.8-gallery`, each its
own commit with `bun run check` green; `bun run e2e` green three runs running (27 tests). Narrative in
`docs/PHASE5_WALKTHROUGH_5.8.md`; what shipped is in the commits and the BUILD_PLAN entry. What is
worth keeping here is the part neither of those records.

**The plan was executable cold, and the two places it wasn't were both self-contradictions rather
than gaps.** T2 said to gate the debug knobs in the router "mirroring `routers/feed.ts`" — which
doesn't gate them; `getFeedPage` does, precisely so the router can't grow an opinion that disagrees
with the service. T4 asked for a handlers object in one sentence and a ref'd node in the next. In
both cases the *named pattern* was right and the *instruction* was wrong, which is a useful signal
about how to read a plan written from a repo survey: where it points at an existing file, follow the
file.

**A latent e2e bug the phase exposed and did not cause.** `feed.spec.ts` and `item.spec.ts` both seed
under `source: "e2e"` and both deleted the whole source in `afterAll`. Under `fullyParallel` the spec
files run in separate workers, so adding a third such spec had them deleting each other's fixtures
mid-run — surfacing as an empty feed in one file and a 404'd item page in another, neither of which
contained the cause. All three cleanups are now scoped to their own `sourceId` prefix. The general
shape is worth remembering: **a shared fixture namespace plus a broad delete is a time bomb that only
goes off when a third participant arrives.**

**Two CSS facts that cost real time.** `--animate-sheet-*` carries `animation-fill-mode: both`, so
after the entrance the keyframe's own `translateY(0)` beats any inline transform — drag-to-close does
nothing until `style.animation = "none"` hands control over. And `pointer-events: none` on an ancestor
is not a lock: `PillToolbar` sets `auto` on its own nav (deliberately, so its full-width wrapper
doesn't eat scrolls), and a descendant's `auto` wins. Making the faded-out chrome genuinely inert
needed `visibility`, which also happens to transition with exactly the right discrete semantics.

**The parked archive question got answered as a doorway, not a feature.** There is no ambit-archive
adapter in this repo — "archive items" are labelling support with no rows behind them — so 08-20's
"Ben wants that flavour more present" became `wildcardChance` (default 0.1) over a `WILDCARD_SOURCES`
list that is empty today. A tunable serendipity dial now; the archive's slug drops into that list when
the integration lands, and nothing else changes. Worth turning up under `FEED_DEBUG` during the device
pass to find out what the rail actually wants — 0.1 is a starting position, not a verdict.

**Open / next:** the **iOS device pass**, over the `tailscale serve` HTTPS origin, is the only thing
between 5.8 and done — the gesture matrix, drag-close, both exits, and above all whether the hero's
long-press still offers **Add to Photos** (a test now pins the two implementation choices that would
break it, but the callout itself is only visible on a device). Then merge and 5.9, which inherits the
gallery entry from Saved for free — the origin marker stores an item id, not a route. Still parked and
still non-blocking: the `test-feed-topic-*` stranded items and AIC's Cloudflare challenge.

*Session spend: 49.80M tok (in 672 · out 256.9k · cache r 48.39M / w 1.15M) · ~$39.94 · opus-5 + opus-4-7 · 09:52→10:28*

---

**The 5.8 device pass passed, and found one thing worth the whole exercise.** Add to Photos survived
the hero tap — the regression the phase was built around avoiding. Everything else worked. But four
separate complaints came back and they turned out to be **one defect wearing four coats**: rail
swipes "quite hard", the item page's left-to-right back gesture "too hard to do", the details sheet
not closing on a down swipe, and the two-finger exit "barely fires".

The temptation was four threshold nudges. The actual causes were three, all shared:

- **No velocity path on any threshold.** Every commit in the app was distance-only, which punishes
  the confident flick and rewards the hesitant drag — backwards, since a fast short movement is the
  more deliberate of the two. The one gesture that always felt right (the gallery's hard-flick exit)
  was the one that already had a two-way test. Everything is "far enough **or** fast enough" now.
- **The axis was re-decided at release instead of locked at the slop.** A thumb swipe arcs, so a
  good sideways swipe that drifted down finished as "vertical" and did nothing. `useSwipeBack` was
  worse — it *permanently abandoned* the gesture the first time vertical won mid-drag, which is
  exactly why the item page's back swipe died halfway across.
- **iOS Safari's `pointercancel` was discarding the two-finger exit at the moment it was
  recognised.** Safari fires it when it claims a multi-touch gesture for the system, *even under
  `touch-action: none`*, and the hook treated every cancel as "throw this away".

**The transferable lesson, for 5.9 and 5.10:** when several gestures on several screens all feel
"too hard", suspect a shared missing *dimension* before suspecting the numbers. Four tweaks would
have shipped four half-fixes and left the two-finger exit broken outright.

**Two smaller catches, both from writing the tests rather than the fix.** React normalizes synthetic
`timeStamp` as `nativeEvent.timeStamp || Date.now()` — so a falsy native value silently becomes an
epoch millisecond beside a sibling's `performance.now()` one, and the subtraction goes *negative*,
which sails through any `elapsed < window` check. `BottomSheet` reads one clock now; the rail hook
can keep reading the event's, because native listeners never see React's normalization. And
`gallery.spec.ts`'s doorway test had been taking the feed's first tile blind and `test.skip`-ing when
it drew an article — a third of runs, showing green while covering nothing.

**Feel is deliberately not tuned.** Ben's read on the rail: the mechanics are right, but how it
*feels* can't be judged honestly against a two-museum corpus — a walk that can't drift far can't be
told from a lucky one. `wildcardChance` stays at its untuned 0.1 for the same reason. Both want a
re-run once more sources land, not a guess now.

**Open / next:** **re-confirm the gesture fix on device** — it is pinned by nine unit tests and the
e2e suite is green, but a threshold is a feel judgement and no test makes one; the session ended with
the dev server stopped before a retest. Then merge 5.8 and start 5.9 (Saved), which inherits the
gallery entry for free — the origin marker stores an item id, not a route. Worth watching: `bun run e2e` flaked twice in ~8 full runs
during this session, in *different* specs each time including ones this branch never touched, always
a 30s "waiting for element to be visible". Consistent with the machine-load note in CLAUDE.md and
with a dev server shared with the phone; three consecutive green runs closed it out. If it recurs on
a quiet machine it's real and worth chasing.

*Session spend: 36.82M tok (in 194 · out 115.4k · cache r 36.57M / w 141.6k) · ~$22.58 · opus-5 · 10:28→11:19*
*Session spend: 6.33M tok (in 61 · out 30.9k · cache r 6.02M / w 283.8k) · ~$5.63 · opus-5 + opus-4-7 · 11:19→11:33*

### [[08-20-26 Thu]] — The 5.6 device pass passes; the feed was eating the corpus on every Back

**The pass itself: green.** 5.6's tile gestures (tap vs. long-press vs. scroll, the 12px slop
guard, the four iOS incantations) and 5.5's carried-over pill/sheet checks all behave correctly on
the phone. The `pt-[58px]` inset clears the status bar as-is. That closes the Done bar both phases
have been waiting on since 08-16.

**Findings:** Ben also reported a slow load and a hydration error, and chasing those turned up
something much worse underneath.

**The slow load was transport, not code.** The phone was on the same LAN the whole time (direct
Tailscale path), but the first packet took 784ms — radio asleep — and the warm link still measures
4–128ms with 47ms stddev. Jittery wifi plus an unminified dev bundle means chunk fetches time out,
and the log filled with `ChunkLoadError`. Worth recording how it was *ruled out* as a build
problem: every one of the seven failing chunk names still returned 200 from the running server, so
the names hadn't churned and nothing was stale. That also clears the service worker, 08-17's
suspect — a stale SW cache would have named chunks the server no longer has. "Zero `sw.js`
requests" was never evidence either way, since a cached SW makes no request.

**The hydration error was a symptom, not a bug.** When a chunk failure breaks the RSC→client cache
handoff, the client refetches `feed.page` — which returns *different items*, because the server's
render already marked the first twelve seen and the cursor excludes the seen history. Client render
≠ server HTML, guaranteed. Nothing to fix in the components.

**The real defect, and Ben named it faster than the investigation did:** going to an item page and
coming back rebuilt the feed from scratch. The item stub's Back was `<Link href="/feed?focus={id}">`
— a *push*, so the dynamic route re-ran, `getFeedPage` never repeats items, and the reader landed
among cards they'd never seen with their scroll position gone. Cost per round trip: **two pages of
corpus**, one drawn by the RSC render and one by the client query. `use-feed-scroll.ts`'s header had
described this precisely and filed the fix under 5.7; what nobody had connected is that it fires on
every single Back, not just in edge cases.

**Which is where 08-18's unresolved contradiction goes.** That session was left holding "172
server-side `feed.page` executions against zero `GET /feed` lines" and couldn't reconcile it. The
answer is the finding it had already made one paragraph earlier: proxy-*redirected* requests
produce no log line, so `/` → 307 → `/feed` renders invisibly. Combine that with a ChunkLoadError
reload loop and the arithmetic closes — **1,116 items marked seen in six minutes**, 696 in the worst
single minute, ~130 renders × 12 items at ~700–1200ms each.

**So the "reading history" wasn't reading.** Ben's account held 2,743 `seen_item` rows and his three
CORE topics were the most exhausted in the corpus (portraiture 82%, zoology 73%, architecture 67%)
— which would have made the feed draw from the dregs of exactly the topics he picked, and read as
an algorithm problem. Cleared, with a CSV backup.

**Shipped:** `BackToFeed` + `feed-origin.ts`. Back now **pops history** when the reader arrived from
the feed and only pushes `?focus=` when they didn't — which is the cold-opened shared link, where
there is no feed behind the page and popping would leave Ambit entirely. The distinction rides on a
`sessionStorage` marker the feed writes on tap. **The markup deliberately does not branch on that
marker at render time**: the obvious shape (read storage, return a button or a link) is a hydration
mismatch by construction, since the server has no `sessionStorage` — so the anchor is
unconditional and the pop is an interception of its click. Same DOM on both sides, and it still
works if JS never boots. Also refreshed the rotted LAN dev origin (`.68.65` → `.1.215`).

333 unit tests (was 329) + 14 e2e green. The e2e that asserted the *old* behaviour was rewritten to
pin the new one: same tile ids before and after, and zero requests to `/feed` or `feed.page`.
Matched on path rather than an `RSC:` header so a header rename can't make it pass vacuously, and
checked with a negative control — stub `cameFromFeed` to `false` and it fails, so it isn't testing
nothing.

**Confirmed on device.** Ben re-tested after the fix: returning to the feed from an item view
lands on the same spot, same items. The behaviour the whole investigation was chasing is now the
behaviour you get.

**AIC suspended, not removed.** Ben's call, and the right one — the source was actively getting in
the way of building. `src/server/config/suspended-sources.ts` switches a source off **end to end**:
ingestion skips it, *and* `getTopicPools` refuses to draw its existing rows. Doing only the first
would have been worse than doing nothing, since 1,338 undrawable rows would have gone on winning
slots in the draw and the feed would have looked like it had quietly gone bad. Nothing is deleted
and no re-ingest is needed to reverse it: the adapter, its tests and every row stay put, so lifting
the flag is a one-line change. `--source aic` still ingests when asked explicitly, and says out loud
that the feed won't draw the result. 5.7's image proxy is what lifts this.

**Open / next:** the fix removes the loop's fuel but not the loop's *cost*: `feed.page` still writes
`seen_item` during a server render whose output can be discarded, so any future reload loop burns
corpus again, just slower. The durable fix is to let receipt — not attempted render — be what marks
an item seen; carry it into the 5.7 plan. AIC is parked rather than solved: the `localhost`-referer 403 stands
(`docs/HANDOFF_aic-images.md`), and the on-device result **confirmed a second cause** — AIC tiles
were the only ones missing on the phone even over a tailnet referer that returns 200 from the
laptop, which is exactly what that handoff predicted and nobody had been able to demonstrate.
Suspending the source buys quiet, not an answer; the questions to resume with are that second cause
and whether the block is a dev-only artifact at all (both referers ever tested are dev-only). Minor corpus leak found in passing: 60 real items (30 met, 30 wikipedia) still carry
`topic_id = test-feed-topic-*` from an integration test that never restored them, which makes them
unreachable by the feed — `source='e2e'` cleanup is clean, this is a different leak.

*Session spend: 18.77M tok (in 306 · out 111.1k · cache r 18.13M / w 524.1k) · ~$17.09 · opus-5 · 10:00→11:05*
*Session spend: 10.07M tok (in 181 · out 69.1k · cache r 9.75M / w 247.5k) · ~$8.38 · opus-5 + opus-4-7 · 11:05→11:51*

**Decisions (afternoon) — blog-first content, decided in Ambit-Admin and landed here as docs.**
Ben reviewed the ecosystem's content strategy. The trigger was in the *other* repo — ambit-archive's
A.3b planned **$150/month of SerpApi** to identify artworks — but pulling that thread redirected
where Ambit's content comes from at all. Five decisions; **docs only, no code, no schema change.**

- **Ambit's future content comes primarily from designated blogs.** Blogs already carry the tags,
  descriptions and the article explaining *why* an image matters — exactly the metadata that
  identification was going to buy, and that image APIs make you manufacture. This is the strategy,
  not a source addition.
- **The presentation contract is excerpt + link-out, with no reader view.** A blog item is a **link
  card**: image, Ambit's short description, a 1–2 sentence blurb about the source article, a
  `from: <blog>` credit by the title, and a **prominent link to the actual article**. Ambit hosts no
  reformatted articles; `body` is not a display surface for blog items; full text is used **at
  ingest only** (topics, tags, blurb) and never stored for display. The recorded goal is to **drive
  readers out to the blog** — which is what makes the posture honest rather than merely legal-ish.
- **Honest rights posture — no fair-use claim, no republication.** Image or short excerpt + visible
  credit + link out; truthful license strings ("Rights retained by original authors — displayed with
  credit and link"); remove-on-request. Loupe is the precedent. Tenable because Ambit is invite-only
  and non-monetized. The README and CLAUDE.md now say this in the places that used to say
  "public/PD/fair-use".
- **The `from: <source>` credit line is not blog-specific and ships with 5.7**, for every source —
  museum and Wikipedia items included. 9.4 stays the licensing *audit* and now covers blog credit
  and license display too.
- **Shape: an in-repo adapter family, explicitly not a third cross-service pattern.** Recorded in
  Ambit-Admin so nobody re-opens the "two blessed patterns" rule to accommodate it: those govern
  seams *between* the three services, and this one lives entirely inside Ambit.
- **New BUILD_PLAN step 6.3, gated on a design session** (⚖️), carrying **seven open questions**:
  the adapter interface (blogs don't `search(q)`), topic assignment without seed queries,
  items-per-post and the feed-flooding/dedupe rule, where the blurb lives, image hosting (the
  **strongest case yet for 7.3's proxy-with-cache** — decide them together), scrape etiquette, and
  whether blog items go through the curator pass. Public Domain Review **moved from 6.2 into 6.3**:
  its "scraping-lite or cut" gate was always a blog question.
- **First corpus: doorofperception.com**, already scraped — 11,572 images sitting in ambit-archive
  with an `index.csv` of per-image post URLs as the attribution source. Ingesting it here retires
  85% of the archive's corpus and prototypes the whole strategy for **$0**. It also owns the
  Ambit-side dedupe design, since those items may already be in the corpus via the archive adapter
  (A.5). Sequenced after archive A.5/A.6 and after the 6.3 design session.
- **5.8 gets a parked note, not a design.** Ben wants archive ("wildcard") items more present in
  gallery browsing. Recorded as a wish to revisit with the gallery in hand — archive items are
  **labeling only** today, flowing through the normal feed algorithm under a constant attribution.
  **No new feed tier, no mechanics now.**

**Two drifts found while executing, both worth recording.** The plan assumed
`fix-feed-back-navigation` was merged and that `docs/source-candidates.md` carried an uncommitted
link dump; neither was true — the branch is 6 commits ahead of `main` with no PR, and the dump was
already committed and triaged this morning as `3739638`. So this docs branch is cut from
`fix-feed-back-navigation`, not `main` (Ben's call). And the plan wanted **artvee** listed as a
designated blog, which the morning's triage had already **cut** on robots.txt grounds — the cut
stands, and it is now cited in the blogs table as the worked precedent for open question 6: a site
that machine-readably refuses agents doesn't become a designated blog because its works are PD.

*Session spend: 8.46M tok (in 106 · out 48.4k · cache r 8.32M / w 96.7k) · ~$6.34 · opus-5 · 12:11→12:22*

**5.7 planned (afternoon)** — `docs/PHASE5_PLAN_5.7.md`, written cold-executable for a
cheaper-model session. Three decisions taken with Ben at plan time: **reader body = stored `body`
+ backfill** — planning surfaced that the ingester stores Wikipedia bodies with
`exsectionformat=plain`, so the corpus has *no* `== heading ==` markers and the prototype's reader
parser can't work on it as stored; the adapter flips to `exsectionformat=wiki` and a one-off
script re-fetches existing bodies, rather than taking a runtime Wikipedia dependency. **The image
proxy ships in 5.7**, not 7.3 — `/api/img/[itemId]`, itemId-lookup-only (never a URL param; that's
the SSRF boundary), no Referer sent (which is what defeats AIC's 403), so the AIC suspension lifts
in the same phase that caused it. And **signed-out visitors get no pill toolbar** — the prototypes
don't model auth; anon gets content + credit line + join CTA only. The morning's two carries both
landed in scope: seen-marking moves to receipt (`feed.markSeen`, with the argument for why the
cursor's anchor math survives written into the plan), and the pop-don't-push evidence became a
shared `useLeaveToFeed` hook that both the swipe-back gesture and the pill's Feed button use —
`BackToFeed` dies with the stub. One prototype/plan conflict resolved against the prototype: the
wander-next teaser renders on *both* variants (the redesign draws it image-only; the Done bar says
"both variants + teaser", and the Done bar wins).

**Open / next:** execute T1–T9 per the plan doc; run the Wikipedia body backfill after merge; the
phase closes on an iOS device pass (swipe-back feel, Save-image to camera roll, and — the real
question — whether AIC images load on the phone through the proxy, HANDOFF Q2).

*Session spend: 4.24M tok (in 84 · out 122.5k · cache r 3.65M / w 466.4k) · ~≥$19.10 · fable-5 + <synthetic> · 15:33→17:00*

**5.7 executed (evening)** — nine tasks, nine commits, on `feat/phase-5.7-item-pages`. Walkthrough
in `docs/PHASE5_WALKTHROUGH_5.7.md`; the plan held up almost unchanged, so what follows is only the
parts that aren't in it.

**Three things argued back.** The plan's own OG fixture contradicted its own assertion — it seeded
the e2e image item with a `data:` pixel *and* asked `og:image` to end in `/api/img/{id}`, which the
page deliberately refuses to emit for a `data:` URL (nothing behind the proxy to fetch, and a broken
preview image is worse than none). Fixed by seeding a fourth item with an http URL that exists for
that meta tag alone. `renderHook` turned out to be the wrong tool for `useSwipeBack`, whose entire
behaviour is an effect attaching native listeners to a ref'd node: the ref has to be attached by
React *before* the effect runs, which only a real component does. And the authed e2e test needed
`waitForHydration` pointed at the pill — a server-rendered toolbar takes an early click and drops
it, the exact trap that helper's own comment describes for the landing form. That last one presented
as a flake (2 failures in 7 runs) and wasn't.

**The big one: the proxy works, and AIC still doesn't.** The manual dev pass was the first time
anyone pointed the finished proxy at a real AIC row, and it returned 502. Direct measurement:
`www.artic.edu` now answers `403` with `cf-mitigated: challenge` and a "Just a moment..." body to
*everything* from this network — the IIIF image URLs, **§2.2's own control URL that returned 200
that morning**, a desktop-Chrome user-agent, and the plain homepage. That is a Cloudflare
**interactive JS challenge**, not the referer rule, and no server-side fetch can ever pass one:
there is no header to send, only a script to run. `api.artic.edu` is unaffected (200), so ingestion
would have gone on adding rows nobody can see — the exact half-suspended state the list exists to
prevent. **So `aic` went back onto `SUSPENDED_SOURCES`**, reversing the plan's Decision 2 in part.
Undistinguished: whether AIC escalated generally, or this IP earned a challenge after the morning's
48-concurrent probe. Cheap test is time and a different network; `HANDOFF_aic-images.md` §8 has the
commands and both readings.

**The proxy is still right, and the reasoning still holds** — every client-side attempt was doomed
because a browser won't let you *unset* the `Referer` Cloudflare was judging, and moving the fetch
server-side removes the input rather than working around the rule. Met, CMA and Wellcome all
verified streaming through it. It just turned out to be aimed at a mitigation AIC had already moved
past. What it bought regardless: one origin for every image (which is what makes the Save-image row
possible at all), somewhere for 7.3's resizing and caching to live, and immunity to the next source
that dislikes our referer. The property to defend there is "item id in, never a URL" — the helpful
`?url=` escape hatch is what turns an image proxy into an SSRF gadget, so it's commented as a
boundary rather than a detail.

**And the lesson, cheaply bought:** §2.2 was measured carefully — 20/20, both directions — and was
still the wrong thing to be building against by the time the build finished, because nobody re-ran
the control. One `curl` in the dev pass caught it. Re-measure the premise before declaring the fix,
especially when the premise is somebody else's live infrastructure.

**One self-inflicted detour worth recording, because the *method* is the lesson.** The authed item
e2e test needed a `waitForHydration` on the pill — a server-rendered toolbar takes an early click
and drops it. Correct, and six green full runs followed. Then a different feed test failed once
while the machine was loaded, and applying the same wait to `feed.spec.ts`'s shared `onFeed()`
helper took the entire suite down: six parallel workers each spinning a `requestAnimationFrame` poll
starved the dev server, and every spec began timing out on plain `page.goto("/")`, 9 minutes a run.
It looked *exactly* like the environmental contention the HANDOFF footnote describes, and it got
diagnosed that way for several rounds — .next cleared, load averages inspected, Postgres bloat
checked, query paths timed (all fine: `getWanderNext` 25–72ms, dev server 40–500ms warm). What
actually settled it in one run: `git checkout <last-green> && bun run e2e` → 22 passed in 60s. Mine,
then. Reverted; feed.spec never needed it. A fix that's right for one call site isn't automatically
right for a shared helper, and "check out the last green commit" beats any amount of theorising
about load.

**Verified:** `bun run check` green at every commit (42 files / 395 tests, up from 378); six
consecutive green `bun run e2e` runs after the hydration fix, and three more at branch tip after the
revert, against the repo's three-run bar;
the Wikipedia body backfill dry-run, then the full 2,200-row run against the dev DB. Also normal, now that it's understood: `❌ tRPC failed on feed.markSeen: aborted` appears a few
times per e2e run — the ack fires on mount and the browser cancels it when the reader navigates
away. That is the "lost ack" tradeoff the receipt design accepted, made visible, and it's dev-only
output. Recorded but not chased: the dev server also emits a few `unhandledRejection: Error:
aborted` lines during an e2e run
when the browser abandons in-flight requests — it reproduces with this branch stashed, so it
predates the proxy, and no test is affected. The proxy now joins `req.signal` into its upstream
fetch anyway, since not pulling bytes for a departed reader is right on its own terms.

**Open / next:** the **iOS device pass** is the last thing between 5.7 and done — swipe-back feel,
back-restores-the-feed on device, and Save-image reaching the camera roll. AIC on the phone is no
longer really a question for it: the host-wide challenge explains the 08-18 phone observation and
tonight's laptop one with a single mechanism (HANDOFF §8.2), which is the closest thing to an answer
Q2 has had. Retry `curl -sI https://www.artic.edu/` in a day or two, and from another network sooner
— that's what distinguishes "they escalated" from "this IP is in the doghouse", and un-suspending is
one line either way. Q3 (is any of this dev-only?) is now the *interesting* question rather than the
academic one, and still waits on a deployed origin — as does checking the OG preview against a real
scraper. The 60 items stranded on `topic_id = test-feed-topic-*` are still there; the backfill's dry
run bumped into one.

*Session spend: 58.51M tok (in 25.9k · out 288.1k · cache r 56.74M / w 1.46M) · ~≥$47.08 · opus-5 + opus-4-7 + <synthetic> · 17:34→19:04*
*Session spend: 34.42M tok (in 223 · out 72.7k · cache r 34.11M / w 232.2k) · ~≥$20.65 · opus-5 + opus-4-7 + <synthetic> · 19:04→20:35*

**5.7's device pass — passed, and the two things it found were both about the test environment
rather than the code.** Swipe-back follows and commits; back restores the exact feed from both
exits; Save image reaches the camera roll. 5.7 is done.

**Save image landed in Files, not Photos, and the cause is a class of bug worth naming: the Web
Share API is secure-context only.** Over `http://` on the LAN, `navigator.share` / `canShare` are
not broken, they are `undefined` — so the handler fell straight through to its `<a download>`
fallback and looked quietly wrong. The clipboard and service workers are gated the same way, which
means *every* device pass over plain http has been silently unable to test three whole features.
Fixed at the root rather than worked around: `tailscale serve --bg 3000` puts a real cert in front
of the dev server at `https://macbook-air-m5.halley-morpho.ts.net`, and `dev-origins.js` now emits
the https, port-less origin too so Better Auth's CSRF check accepts a sign-in from it. Re-tested
there and the OS share sheet appears with the image in it. **Run future device passes over that
HTTPS origin.**

**The best save path was already shipped and nobody had noticed.** Long-pressing the hero gives
iOS's native "Add to Photos" — two taps, against three through the share sheet — and it works only
because the item page doesn't suppress the image callout the way the feed tiles must
(`-webkit-touch-callout: none` is load-bearing there, it fights the long-press-opens-item-sheet
gesture). **5.8 will wire a gallery tap onto that same hero and the obvious move is to copy the feed
tile's iOS incantations wholesale, which would silently kill this** — so it's now a warning comment
in `image-item-body.tsx`. The share-sheet row stays anyway: it's the discoverable affordance, and
it's the right behaviour on desktop. Worth recording the bound too, since it ends the "can we make
it one tap" conversation: **no web API can write to the iOS photo library at all** — a user-mediated
OS sheet is the ceiling for a web app, by Apple's deliberate choice.

**"Way too slow" on device was `next dev`, and the numbers are worth keeping.** Same proxied image:
**170–970ms under `next dev`, 27–55ms on a production build, against 60–90ms hotlinking the museum
CDN directly.** So in production the proxy is *faster* than the hotlinking it replaced — it reuses
one warm upstream connection instead of paying a TLS handshake per image — and the proxy's own work
is 23–33ms (1ms DB + 22–32ms upstream). Same shape as 08-20's morning finding: the dev server is not
the app. One real number underneath it though: a Wikipedia hero measured **1.95 MB** unresized,
which is 7.3's IIIF sizing and will bite on cellular.

*Session spend: 25.05M tok (in 124 · out 57.6k · cache r 24.94M / w 53.7k) · ~$14.45 · opus-5 · 20:35→22:53*

### [[08-18-26 Tue]] — Two origin allowlists, and 1 image in 6 was never loading

**Findings:** Working from a different location, on the tailnet. Three things came out of trying to
start the 5.6 device pass, and only the third is really about images.

**The dev origin has to be the tailnet one, not a LAN IP.** `next.config.js` still pinned
`192.168.1.168` from 08-17; the machine was on `192.168.68.65` and would have reproduced the
dead-buttons bug verbatim. A DHCP lease rots every time Ben changes location, so the durable entry
is the Tailscale address — `100.109.133.60` / `macbook-air-m5.halley-morpho.ts.net` — which follows
the machine between networks. The LAN entry stays as a same-network fallback.

**Two independent allowlists both have to name every dev origin, and they fail at completely
different moments.** Fixing `allowedDevOrigins` got the phone a page that rendered perfectly and
then answered sign-in with `403` — `[Better Auth]: Invalid origin`. Next's list governs `/_next/*`
asset serving (get it wrong: nothing hydrates, no error anywhere); Better Auth's `trustedOrigins`
governs its CSRF check (get it wrong: the page is fine until you try to sign in). Nothing connects
them, they look like unrelated bugs, and the second is invisible until you're past the first — so
they now share one list in `src/config/dev-origins.js`, which carries both failure signatures in
its header. `trustedOrigins` returns `[]` in production, so a personal tailnet address can't ride
into a real build. Verified the security property directly: an unlisted origin still gets 403.

**The Art Institute of Chicago hard-blocks a `localhost` referer, and has all along.** Chasing the
phone's broken images turned up something else entirely: 20/20 AIC images 403 with
`Referer: http://localhost:3000/`, 20/20 succeed with any other referer, user-agent irrelevant. The
403 is **Cloudflare's**, not the origin's — `www.artic.edu` sits behind bot management, and a
localhost referer reads as a bot to it. Since `next dev`'s canonical origin *is* localhost:3000,
**every one of AIC's 1,338 images — 17.5% of the corpus — has been failing silently on the laptop,
presumably for all of Phase 5**, hidden by a fallback tile designed to look unremarkable. The
lesson is the shape of it: a fallback that renders calmly is a fallback that can hide a total
outage of one source. That's an argument for the dev diagnostic label, and for 5.7's image proxy
being the structural fix (one origin for every image) rather than a per-source workaround.

**Shipped:** the shared dev-origin list; `trustedOrigins` on the auth server; image tiles that
**retry** (2 attempts, widening backoff, no cache-busting — a unique query param would miss the CDN
cache every time and harden a rate-limit into a wall) instead of latching `Image unavailable`
permanently on the first dropped request, which on a phone turned every transient blip into a
permanent hole; a dev-only `source · hostname` label on the fallback, which is the only reason the
AIC concentration was visible at all on a device with no console; and `(src=rsc|nextjs-react)` on
the `[TRPC]` log line — kept deliberately, because a server-side caller issues no HTTP request of
its own, so the dev request log *structurally cannot* attribute one, and `feed.page` writes
`seen_item` on every call. 329 tests green (was 328).

**Not root-caused, and recorded as such:** the laptop's endless refresh. It cleared on restart with
the new config and never recurred, so the trail is cold. Ruled out with evidence: not the service
worker (zero `sw.js` requests; `SwCleanup`'s sessionStorage guard is genuinely loop-proof), not the
onboarding↔feed bounce (`redirect()` throws before the prefetch, and all 172 prefetches completed).
Left standing was a contradiction never resolved — 172 server-side `feed.page` executions against
zero `GET /feed` lines, after confirming that plain, proxy-pass-through, RSC, and RSC-prefetch
requests all *do* log. Worth knowing for next time: **proxy-*redirected* requests produce no log
line at all**, which is what sent that investigation sideways for a while.

**Open / next:** the phone's broken images **did not reproduce** from the dev machine — 48/48 mixed
and 20/20 AIC-only succeeded with the phone's exact request shape (iOS UA + tailnet referer,
concurrent). So the AIC block above may be the whole story with "phone" a red herring, or there may
be a second phone-specific cause (iCloud Private Relay against Cloudflare, a Tailscale exit node,
carrier CGNAT). Handed off in `docs/HANDOFF_aic-images.md`, whose first recommended action is the
cheap one: both devices on `/feed`, compare the diagnostic labels. Also open: whether the referer
block is a dev-only artifact, since both referers ever tested are dev-only and nobody has seen what
AIC does with a production origin. Unchanged: the 5.6 on-device pass itself still owes tap vs.
long-press on real tiles, 5.5's pill/sheet pass, and the `pt-[58px]` inset.

**Watch out:** overlapping `bun run test` runs (or a busy dev server) balloon vitest setup from ~7s
to ~650s and fail unrelated Postgres-touching integration tests — three times this session, a
different test each time. Passes alone, passes clean serially. Check what else is running before
debugging a red integration test; but per 5.6's flake, check the setup timing rather than assuming.

*Session spend: 30.24M tok (in 490 · out 188.2k · cache r 29.38M / w 669.3k) · ~≥$26.09 · opus-5 + <synthetic> · 11:51→19:17*

### [[08-17-26 Mon]] — The dev SW cleanup could itself loop; guarded

**Findings:** Ben hit an endless refresh loop on `localhost:3000` in dev. Root cause wasn't
current code — `main`'s layout correctly registers no SW outside production — but a missing
guard in `SwCleanup`: it reloaded *every* time it found a registration, with no memory of
having already done so. Fine when cleanup converges (verified: a manually installed worker
cleans up in exactly one reload), but the server log showed the worker being **re-registered
between cleanups** (repeating `GET /` + `GET /serwist/sw.js` pairs) — most plausibly a second
context still running a pre-fix bundle (an old tab, or the installed PWA from the 5.5 device
pass; the loop died on its own around when other windows got closed, consistent with that).
Cleanup-unregisters ↔ other-context-re-registers is a standoff that refreshes forever. Ruled
out along the way: dev-served `sw.js` is byte-stable across fetches (no update-churn loop),
and a clean browser profile doesn't loop at all.

**Shipped:** the cleanup logic extracted to an exported `cleanupStaleServiceWorkers()` and made
loop-proof (TDD, 6 new tests): reload at most once per tab session (`sessionStorage` flag,
re-armed once a pass finds nothing), skip the reload entirely when no worker controls the page
(nothing live is stale), and warn loudly instead of reloading when a registration re-appears
after the one corrective reload — worst case is now one extra reload plus a console message
naming the likely culprit.

**Open / next:** unchanged from 08-16 — execute against the redesign per BUILD_PLAN 5.5+.

*Session spend: 9.21M tok (in 216 · out 87.3k · cache r 8.86M / w 258.9k) · ~$18.40 · fable-5 · 10:15→11:37*

**Later: the on-device blocker itself found and fixed.** The dead-buttons incident wasn't the
service worker at all — Next dev refuses to serve `/_next/*` assets to any origin that isn't
localhost, so a phone loading the dev server via the LAN URL gets HTML whose scripts never
finish booting: React never hydrates and every button is inert. `allowedDevOrigins:
["192.168.1.168"]` in `next.config.js` (the machine's DHCP address — re-copy from `next dev`'s
"Network:" line if it changes) is what makes on-device testing against the dev server possible.
Verified with a throwaway phone sign-up (`blanktest@example.dev`), then cleaned up: user row
deleted (session/account cascade), its accepted invite row removed, and confirmed it had left
no saves/topics/seen-items/collections behind.

*Session spend: 1.34M tok (in 44 · out 7.4k · cache r 1.21M / w 120.1k) · ~$3.98 · fable-5 · 15:48→15:49*

**Later still: 5.6 planned** (`docs/PHASE5_PLAN_5.6.md`, written to execute cold in a
cheaper-model session). Two decisions put to Ben, both siding with the recommendation:
**Because tiles appear at most once per page** — on the page's first JUMP with a 2+ `driftPath`
(every eligible DRIFT+JUMP would have been ~7 of 12 tiles; the prototype's cadence is
occasional) — and the copy is "you've been exploring {fromTopic}" over "{toTopic}" in accent,
since the prototype's item-level narrative lines can't be generated from topic labels. Settled
at plan time: the feed pill drops share (3 items; prototype wins, and there's no "current item"
on a feed to share — `PillToolbar.onShare` goes optional), the masonry height rotation becomes
literal **aspect-ratio** classes rather than fixed px (same 8 prototype ratios, still
statically scannable, but it doesn't distort on 430px phones), and a minimal `/i/[itemId]` stub
ships inside 5.6 so tile taps navigate somewhere real before 5.7. Notable exploration findings
baked into the plan: the README's whole feed-gesture section is stale against `Feed Masonry 3`
(no double-tap, no inline expand, no feed header at all), the prototype's IO root and
scroll-restore are scroller-scoped ios-frame scaffolding (window-scoped in the real app — the
same class of bug as 5.5's `absolute`→`fixed` trio), and `feed.page`'s unconditional `markSeen`
makes refetch discipline (`staleTime: Infinity`, byte-matched hydration inputs) a correctness
constraint, not a perf nicety. 5.5's never-run device pass folds into 5.6's Done bar.

*Session spend: 5.27M tok (in 106 · out 111.0k · cache r 4.26M / w 899.2k) · ~$27.80 · fable-5 · 16:20→21:06*

**And then executed: 5.6 is code complete** (`docs/PHASE5_WALKTHROUGH_5.6.md`). The plan held —
nine steps, all landed roughly as written — so what's worth recording is the four places the
real world argued with it.

**The prototype's fixture lied about the data.** Article ledes are specified (and prototyped)
as `item.summary` straight through, unclamped, which is fine when every lede in the fixture is
a hand-written sentence. The actual column holds source synopses, and Wikipedia's run 600+
characters — the first real article card rendered **twenty-five lines tall** in a 196px column.
That's the redesign's "no body, no expand affordance" rule broken by accident: at that length
the lede *is* the body. Clamped to five lines, with `masonry.ts`'s height estimate capped to
match so the packer still predicts the tile it's placing. Only findable by running it against
the real corpus, which is the argument for doing the browser pass before writing the
walkthrough rather than after.

**`?focus=` can't work through the stub's Back link, and that isn't a bug in `?focus=`.** The
return-scroll assumes coming back to `/feed` shows you the feed you left. Browser *back* does —
the App Router restores the RSC payload from its client cache, the tiles are all still there,
and scroll restores exactly (measured: 628 → 628). But a fresh `<Link href="/feed?focus=…">`
re-runs the dynamic route, and `getFeedPage` never repeats items, so you land on **entirely
different cards** and the focused tile is genuinely gone (measured: 24 new tiles, old one
absent). Left as planned — 5.7 owns the real back gesture, and this is the evidence for what it
should be: pop history, don't push.

**Two scroll-restore races that jsdom cannot see.** The first implementation restored to 0
every time, for two independent reasons: `scrollTo({top: 900})` on a document that hasn't laid
out yet silently *clamps* near the top (so the restore path needed the retry schedule the focus
path already had, plus a check of where it actually landed), and the rAF scroll-persist
listener was **eating its own tail** — a clamped restore fires `scroll`, which writes the
clamped offset over the saved one, so by the next attempt there was nothing left to restore to.
Persistence is now suppressed until the restore sequence settles.

**Two e2e bugs wearing a flake costume.** The feed suite passed serially and failed under
parallel workers, in a different test each run, always on sign-in. The house wisdom
("first-run failure after a change is usually on-demand compilation — re-run first") sent me
round the loop twice before I read a trace, which is the lesson: the recorded flake pattern is
a prior, not a diagnosis. Cause one — **Playwright's `test-results/` sits in the project root**
and writes traces *during* the run, which trips Next's dev watcher; the failing trace has
`[Fast Refresh] rebuilding` exactly where the navigation should have been, and a remount mid
sign-in swallows `router.push`. Fixed with a dot-directory `outputDir` (Turbopack ignores
those). Cause two, revealed once the first was gone — `navigated to "http://localhost:3000/?"`:
the landing form is a real `<form onSubmit>` with a `type="submit"` button, so **a click before
hydration submits it natively**, reloading the page and discarding the typed values. Worked
around in the tests (`e2e/support.ts`'s `waitForHydration`, polling for React DOM's own
`__reactFiber$` keys) and left otherwise alone — it's a real auth-screen defect, but it's 5.2's,
not the feed's, and reaching across to fix it mid-phase seemed worse than recording it.

The hydration contract the plan worried most about turned out fine, and is checkable in ten
seconds: hard-reload `/feed` with the Network tab on `trpc` and there are **zero** requests —
page one comes entirely from the dehydrated cache — then exactly one per scroll to the bottom.
328 tests green (was 288), e2e 14/14 across three consecutive parallel runs, build clean.

**Open / next:** the **on-device pass** is the one thing left, and it needs Ben and a phone —
tap vs. long-press vs. scroll on real tiles (the 12px slop guard and the four iOS incantations
all pass in a desktop browser while being wrong on iOS, which is why the Done bar names a
device), plus 5.5's carried-over pill/sheet pass, plus the `pt-[58px]` top inset, which is a
plain value today because no screen in the app has established a safe-area convention yet.
Then 5.7 — item pages, which also inherit the image proxy the feed's broken tiles are waiting on.

*Session spend: 84.25M tok (in 764 · out 260.7k · cache r 83.26M / w 728.1k) · ~$55.43 · opus-5 · 21:26→23:11*

### [[08-16-26 Sun]] — Redesign landed; Phase 5 re-baselined (5.4 is now the design migration)

**Shipped:** Ben's redesign handoff arrived (`docs/design_handoff_ambit_pwa_redesign/` — 11
prototype screens + an authoritative README; the bundle's own `PROGRESS.md` is a leftover from
an earlier design session and is superseded). This session planned the integration and produced
the docs: BUILD_PLAN's Phase 5 rewritten (5.4–5.8 → a new 5.4–5.11 ordering), a self-contained
`PHASE5_PLAN_5.4.md` for the design-system migration (written to be executed by a cheaper-model
session), the old feed plan preserved as `PHASE5_PLAN_5.4_FEED_OLD_DESIGN.md` (its
backend/RSC research is load-bearing for the future 5.6 feed plan), SPEC §8.3's stale next-pwa
mention fixed (repo uses Serwist). Branch housekeeping: `phase-5.4-feed`'s lone commit merged
to `main`, branch deleted, work now on `phase-5.4-design-migration`.

**Decisions** (four put to Ben directly, all sided with the recommendation):
1. **Auth keeps email+password + invite gate** — the new Landing shows magic-link, but it's a
   restyle-only divergence, same as 5.2 recorded. Protects the whole auth test surface.
2. **Collections backend gets built (5.5)** — the save-to-collection sheet is a backbone
   component on nearly every screen; building it on mocks then rewiring would double work.
3. **Profile/Settings minimal viable** — only backed rows; **sign-out lives in Settings**,
   which finally resolves the open Decision 1 from the paused feed plan (interim home during
   5.6–5.9: `/dev/tokens`).
4. **Feed gestures: prototype wins over README** — verified by reading `Feed Masonry 3.dc.html`:
   taps open item pages (not the Gallery, as the stale README section says) and long-press
   opens a per-item sheet; "prototypes win" is now the recorded Phase 5 convention, checked
   per-screen at plan time.

Settled without Ben: masonry heights via the old plan's fixed literal-class rotation (the DB
has no image dimensions; adding them at ingest is a possible later enhancement), and a hard
licensing gate — the bundle's 20 `uploads/*.webp` are uncleared, so production imagery stays
limited to the 8 Wikimedia PD works until resolved.

**Findings worth keeping:** the token layer migrates unusually cleanly — bg/ink/on-accent are
byte-identical between old and new designs, so the 5.1 alpha-ladder architecture survives
intact; the real changes are Sora replacing Newsreader+system-sans (`--font-serif` dies
app-wide), the accent set (gold/sage/slate/terracotta → indigo-default/amber/green/red,
renamed), sheet radius 26→22, a second sheet easing, and a handful of net-new tokens
(`ink-hi #F5F1E7`, `shadow-toolbar`, avatar gradient — the latter needs the same twMerge
registration that bit 5.2 via `border-hairline`). Item pages moved ahead of the Gallery in the
ordering because the decided gesture model routes feed taps to them.

**Open / next:** execute `PHASE5_PLAN_5.4.md` in a cheaper-model session (regression signal:
auth/onboarding tests pass unmodified). Deferred flags recorded in BUILD_PLAN for later plan
docs: Saved's two-hop reachability (5.9), share-collection scope with no public `/c/` route
(5.9), reader body source — stored text vs server-side Wikipedia cache (5.7).

*Session spend: 9.69M tok (in 166 · out 138.6k · cache r 9.02M / w 526.7k) · ~$26.49 · fable-5 · 21:52→00:10*

**Then executed 5.4 in the same session** (Ben switched to Opus 5 and said go, so the
plan-then-execute-cheaper split didn't apply this time — the plan doc is still written to be
executable cold). Walkthrough: `docs/PHASE5_WALKTHROUGH_5.4.md`. The app is now on the redesign's
token layer: Sora everywhere, indigo accent set, `ink-hi` title tier, 22px sheets, reduced-motion
support. **All 7 e2e green unmodified** — the signal the restyle stayed a restyle.

**Findings:** the sheet animation had to *split* rather than change — the old 400ms/103% curve is
still wanted for 5.8's gallery modal, so it was renamed `--animate-sheet-gallery` and
`--animate-sheet-up` rebuilt as the redesign's 260ms `sheetup`; `BottomSheet` picked the new one
up with no component change. Adding `.bg-avatar-gradient` walked straight back into the
`border-hairline` twMerge trap from 5.1 (custom `bg-`/`border-` classes get misread as *color*
utilities and silently dropped next to `bg-ink/NN`) — registered it in the `bg-image` group, and
discovered the `border-hairline` regression test everyone assumed existed had never been written.
Both now have one.

Two false alarms cost real time and are written up in the walkthrough so they don't cost it twice:
(1) every `.border-hairline` element measured `1px`, looking exactly like the 5.2 regression —
it's **Chrome snapping sub-pixel borders to a whole device pixel at DPR 1**, and a raw inline
`border-width: 0.5px` measures the same; check `devicePixelRatio` before panicking. (2) an e2e
sign-up test timed out at `/feed` waiting for `/onboarding`, reading as a broken redirect guard —
it was a cold dev compile (the font/CSS changes invalidated the build cache); warm, it passes in
3.1s. Nothing was "fixed" for either.

**Also found, deliberately not fixed:** `feed.test.ts`'s tier-ratio test is genuinely flaky —
1000 draws through unseeded `Math.random`, asserting CORE within ±0.05 of 0.4; it failed once at
0.46. Pure server logic, untouched by this phase; seeding it or widening the tolerance changes
what the test means, so it's flagged rather than quietly patched.

**Open / next:** 5.5 — the shared backbone (pill toolbar, sheet shell v2, save/share sheets,
`usePress`) plus the collections backend. Needs its own plan doc first. Carry forward: the flaky
feed test, and the landing hero/wordmark crowding (0px gap — pre-existing, and 5.11 replaces that
screen wholesale, so it was left alone).

*Session spend: 51.39M tok (in 460 · out 175.3k · cache r 49.88M / w 1.34M) · ~$42.82 · opus-5 + fable-5 + opus-4-7 · 00:10→00:29*

**Then a third session: cleared the two carry-forwards and planned 5.5.**

**The flaky test had a second cause nobody had looked for.** The 5.4 note above blamed unseeded
`Math.random`, which was half right. Measured properly — 400 seeded repetitions of the fixture,
rather than eyeballing one failure — the real failure rate is **4.5%**, roughly ten times what
1000 binomial draws against a ±0.05 window should produce. The reason: **the fixture couldn't fill
the page.** 4 topics × 200 items = 800 items for a `pageSize: 1000` page, so `composePage` ran to
total pool exhaustion on *every* run. Once a topic's pool empties every tier landing on it just
retries, and the tiers don't concentrate on topics equally (JUMP draws the bottom half of a row,
CORE spreads across all of `weights`) — so the measured mix wasn't the configured ratio at all.
JUMP centred on **0.229**, not 0.25, leaving its true mean under 2σ from the failure edge. That
off-centre mean, not the rng, is what made a 3σ-looking tolerance fail one run in twenty-two.

Fixed both: pools to 400/topic (means re-centre on 0.402 / 0.349 / 0.250, and a new assertion pins
"the page filled" so it can't silently regress), and eight fixed seeds pooled into one 8000-draw
sample. Determinism paid for a **tighter** tolerance — ±0.02, 2.5× stricter than what it replaces —
so the de-flaked test is a better regression detector than the flaky one, verified by injecting a
`tierCore 40→35 / tierJump 25→30` change and watching it fail. The file's *other* `Math.random`
tests were deliberately left alone: they assert invariants ("never lands back on start"), where
unseeded draws usefully fuzz a bit more of the space each run. **The lesson worth keeping:** a
statistical test's fixture has to be able to *reach* the thing it measures — a starved fixture
silently changes what the assertion means, and reads as rng noise.

**Branch housekeeping:** `phase-3.3-curation` and `phase-5.2-landing-signin` deleted both sides.
Git reported them unmerged because both landed as *squash* merges (PRs #8 and #13), so the branch
tips were never ancestors of `main` — content verified present on `main` before deleting.
`archive-seed` deliberately survives: it's live post-MVP work, not a stale branch.

**Phase 5.5 planned** — `docs/PHASE5_PLAN_5.5.md`, written to execute cold. Four decisions put to
Ben, all sided with the recommendation: one collection per item (picking another row *moves* it,
matching the prototypes' `{itemId: collectionName}` shape); `saves.toggle` removed rather than kept
(verified dead — nothing in `src/` or `e2e/` calls it, *not even* the `/feed` placeholder the
BUILD_PLAN line assumed did, so SPEC §7's six-procedure surface changes); all six share targets via
`navigator.share` with a toast fallback rather than six brittle per-service intent URLs; and the
Save-image row deferred to 5.7, since it needs a server-side image proxy (museum hosts bot-block
third-party fetchers) and image contexts don't exist until then.

**The plan's main finding, which the BUILD_PLAN line got wrong:** the pill's bookmark sheet has
**two modes**, not one. With an item in context (item pages, gallery) it's a save sheet — title
"Save to collection", accent dot + "Already saved here", picking assigns. With no item (the feed
pill) it's a *browse* sheet — title "Your collections", "Everything kept" + counts + "New
collection · Make one on your profile", picking navigates to Saved. Two components over one shell,
not one component with a flag. Same read also settled that collection *creation* lives on Profile
(5.10) — so 5.5 ships no `createCollection` procedure, keeping the discipline that just deleted
`toggle` — and that the feed's long-press item sheet ("Closer Look" + compact rows, on a third
animation, `ambitmenurise`) is 5.6's, not 5.5's. Drag-to-close likewise turns out to belong to
5.8's gallery modal, despite `bottom-sheet.tsx`'s own comment attributing it to 5.5.

**Readiness check before executing, and one gap it caught.** Verified rather than assumed:
migration state clean (2 journaled / 2 applied, `saved_item` still exactly
`user_id/item_id/saved_at`, no `collection` table), DB populated (8,563 items · 16 users · 14
onboarded · **0 saves**), both containers up, `DATABASE_URL` present so the integration tests
actually run instead of self-skipping. The gap: **every procedure Step 9's demo touches is
`protectedProcedure`**, but `/dev/tokens` has never needed a session — an anonymous visit would
have failed each new section with `UNAUTHORIZED`, reading like a broken component rather than a
missing login. The plan now opens with a verified Preconditions block and asks the demo to render
a visible signed-out banner instead of failing silently. Worth noting the empty `saved_item` too:
the accent dot and "Already saved here" can't appear until the first save goes through the sheet
being built, which is the correct starting state and not a bug to chase.

**Open / next:** execute `PHASE5_PLAN_5.5.md`. Its Done bar is a real phone, not CI — the
`pointer-events` wrapper, the slop guard, and the sheet exit animation all pass in a desktop
browser while being wrong on iOS. Still carried forward: the landing hero/wordmark crowding (0px
gap — 5.11 replaces that screen wholesale).

*Session spend: 14.89M tok (in 264 · out 155.5k · cache r 13.44M / w 1.29M) · ~$23.21 · opus-5 + opus-4-7 · 09:01→12:12*

**Then executed 5.5 in the same session** — Ben said go rather than handing the plan to a cheaper
model, so the plan-then-execute-cheaper split didn't apply again. Walkthrough:
`docs/PHASE5_WALKTHROUGH_5.5.md`. Merged to `main` as `a80fd4e`. **Code complete, not done**: the
step's Done bar names a real phone, and that pass hasn't happened.

**The plan held up.** Ten steps, executed in order, three commits; the generated migration came out
as exactly the predicted five statements, and the pre-flight Preconditions block earned itself
immediately (nothing was rediscovered at execution time). Five deviations, all deliberate and all
recorded: `saves.count` promoted to a real procedure (the alternative fetched every item record to
produce a number — and unlike the `toggle` we just deleted, it has a consumer); seeded collections
get **staggered `created_at`** values, because Postgres' `now()` is transaction start time and one
three-row insert therefore left `ORDER BY created_at` a three-way tie with no stable sheet order;
`onSaved` reports the collection id as well as its name, since every caller needs the id to move its
own `currentCollectionId`; `Bookmark` already had the `filled` variant the plan wanted added; and
the share targets needed explicit `aria-label`s (three of six are a bare letter glyph, which
announces as "X X" at best and "P" at worst).

**Two findings that will matter in 5.8**, which has far more animation to test than this:
1. **jsdom implements no `AnimationEvent` at all**, so React never delivers a synthetic
   `onAnimationEnd` there — probed four ways (from a child with `bubbles: true`, a manual bubbling
   `dispatchEvent`, directly on the handler element, testing-library's default init), all zero
   calls. This began as "why won't my exit-animation test pass" and ended as "it *can't*." The sheet
   attaches a **native** listener via a ref instead: testable, and it's the path a browser actually
   takes. Also needs an `e.target === el` guard, since `animationend` bubbles and any child
   animation would otherwise tear the sheet down mid-exit.
2. **The exit state is adjusted during render, not in an effect.** The first version tripped
   `react-hooks/set-state-in-effect`, which turned out to be flagging a real defect rather than
   style: an effect renders the closed sheet once and *then* re-renders it as leaving — a visible
   flicker on the way out. React's documented "adjusting state when a prop changes" pattern fixes it
   and shrinks the component to one `leaving` bit with `mounted = open || leaving` derived.

**An e2e investigation that took a wrong turn worth recording.** After a 12-hour-old hung dev server
(holding port 3000 with no listening socket, so Playwright could neither reuse nor replace it) was
cleared, the suite failed one auth test on the `auth-error` assertion; re-run, it failed a
*different* test on the *same* assertion (`test.describe.serial` aborts the file, so the two runs
stopped at different points). The obvious next move — A/B against `main` — passed 7/7 and looked
like proof the regression was 5.5's. **It wasn't.** `main`'s tree was already warm from the
preceding runs, so that comparison varied branch *and* compile state together. Warmth alone was the
real variable: every failure was a first run after a code change, with Next still compiling routes
on demand; warm, the branch went 7/7 three times running at ~14s. Same false-alarm class 5.4
recorded, plus a sharper lesson — **an A/B is only evidence if it isolates one variable** — and a
standing note that the suite's 5s `toContainText` timeouts are a flake risk to revisit when e2e
joins CI in 7.1.

**Open / next:** the on-device pass for 5.5 (`pointer-events` wrapper, 12px slop guard, sheet exit
animation — all of which pass on a desktop while being wrong on iOS), then 5.6, the feed masonry.
5.6 inherits `usePress` and builds what a long press opens (the "Closer Look" item sheet, on a
third animation, `ambitmenurise`). Still carried forward: the landing hero/wordmark crowding (0px
gap — 5.11 replaces that screen wholesale).

*Session spend: 66.61M tok (in 553 · out 243.5k · cache r 65.68M / w 681.0k) · ~≥$44.36 · opus-5 + opus-4-7 + &lt;synthetic&gt; · 12:12→13:55*

**Then `/code-review` over the merged range — ten findings, all applied** (`05e77d6`, merged
`988e221`). Two were real defects, and they're the same *kind* of mistake: code that works in the
one place it was exercised.

1. **`/dev/tokens` was permanently burning the corpus.** `feed.page` is declared a tRPC *query* and
   reads like one, but `getFeedPage` calls `markSeen` unconditionally and `seen_item` has no TTL by
   design — so every visit to the style guide consumed a page of the signed-in user's feed forever,
   and with the 30s `staleTime` plus React Query's default `refetchOnWindowFocus`, tabbing back
   consumed another. Now it prefers an already-saved item (`saves.list` is a pure read) and borrows
   from the feed only behind a button that names the cost. **A tRPC `query` is not a promise of
   purity** — this one's write is three files from its call site.
2. **Nothing in the app establishes a positioning context.** The pill and the sheet were both
   `absolute`, inherited from prototypes that live inside an iOS-frame wrapper. The real app has no
   such wrapper (not `layout.tsx`, not `/dev/tokens`), so both resolved against the initial
   containing block — the pill scrolled away instead of floating, and a sheet opened after scrolling
   rendered off-screen at the top of the document. Both are `fixed` now. Notable because **this is
   precisely what the on-device pass would have surfaced**: the review got there first only by
   reading CSS instead of screenshots.

Third medium: save failures were silent (the sheet dismisses the instant a row is picked, so a
failed write looked like a success). `onError` is now a *required* prop, which is why the type
checker immediately found all four call sites — a case where making the API stricter did the
finding for me.

The other seven were smaller — full dialog semantics + a real Tab trap on the sheet shell (the scrim
hid the page visually but did nothing to the tab order), `overflow-y-auto` restored as a floor,
`usePress` resetting before bailing on a non-primary button, the "Everything kept" count waiting on
its own query, the Share demo button disabled until an item exists, and the sheets test restoring
fixture state in `afterEach`. One finding I deliberately **didn't** build: lazy seeding keys on "no
collections" rather than "never seeded", which is harmless until deletion exists — documented at the
call site and written into BUILD_PLAN's 5.10 line instead of migrated speculatively.

**A bug found while fixing, worth keeping next to the `AnimationEvent` one:** the focus trap's first
draft filtered candidates by `offsetParent !== null`, which reports `null` for *everything* under
jsdom — the trap would have tested as empty while working fine in a browser. Twice in one phase now,
**jsdom's missing layout and event interfaces quietly inverted what a DOM test proved.** Worth
remembering in 5.8, which is almost entirely gesture and animation.

279 tests (was 268), build clean, e2e 7/7. 5.5 is still **code complete, not done** — the on-device
pass remains, and two of these three defects are exactly the sort it exists to catch.

*Session spend: 31.62M tok (in 184 · out 64.6k · cache r 31.36M / w 198.1k) · ~$18.87 · opus-5 + opus-4-7 · 13:55→14:11*

**Round two: reviewing the fixes found that the fix was broken.** Four more findings, and the first
is the one worth keeping: **the accessibility work from round one didn't survive a re-rendering
parent.** `BottomSheet`'s focus effect listed `onClose` in its deps, and every call site passes a
fresh inline arrow — so *any* parent render while a sheet was open tore the effect down and rebuilt
it, yanking focus off whatever the user had tabbed to and re-recording the restore target as a
control *inside* the sheet. Closing then "restored" focus to a node about to be unmounted: exactly
the failure the change was written to prevent. `onClose` is in a ref now, and the guard was
mutation-tested — putting the old dependency array back fails it.

Second: **the third instance of this phase's positioning bug.** `Toast` was still `absolute`, so
round one's new failed-save message painted off-screen on a long page — the fix for silent failures
was itself silent. Now `fixed`, with a `raised` variant clearing the pill; the handoff's otherwise
odd "toast bottom: 46–120px depending on screen" turns out to encode exactly that. Plus a Tab-trap
leak when focus sits outside the panel (Safari blurs to `<body>` on taps to non-focusable sheet
content, and from there an unguarded Tab walks into the page behind the scrim), and a `/dev/tokens`
borrow button that vanished after one failed attempt.

**The through-line of both rounds: the recurring defect was never logic, it was _context_.**
`absolute` inherited from prototypes that live inside an iOS frame the real app doesn't have; an
effect whose dependency array is textbook-correct in isolation and wrong against every real caller;
`markSeen` firing three files away from a call site that looks like a read. None of those show up in
a unit test that renders the thing alone — which is also why the phase's Done bar is a device, not
CI. 282 tests, build clean, e2e 7/7.

**Also answered, not a bug:** `bun run invite` sends no email — it's an admin script that inserts an
`invite` row so the sign-up gate accepts an address (SPEC §3.1). The only mail the app ever sends is
the password reset, and in dev it goes to Mailpit (`localhost:1025`, UI on `:8025`), never a real
inbox; `requireEmailVerification` is deliberately off because the invite list *is* the trust anchor.
Worth knowing before the device pass: port 3000 is currently held by an unrelated `node` app, and
`BETTER_AUTH_URL` is pinned to `http://localhost:3000`, so Ambit has to own that port or every auth
callback and reset link points at the wrong server.

*Session spend: 18.67M tok (in 95 · out 44.0k · cache r 17.31M / w 1.31M) · ~$22.71 · opus-5 + opus-4-7 · 14:11→23:19*

### The on-device pass — started, **still blocked**, picking up in the morning

**Unresolved: on Ben's phone, `/dev/tokens` renders but nothing on it responds to a tap.** Two fixes
went in tonight that were each real defects but *neither resolved it*. Recording that plainly so
tomorrow doesn't start from a false premise.

**Fixed on the way, both genuine, neither the cause:**
1. **The auth card's mode-switch links were 20px tap targets.** "First time? Create your account" —
   the only route to sign-up — was a bare 13px text button with no padding (measured 207×20, against
   Apple's 44px minimum). Now 231×44 via `py-3`/`min-h-11` with a compensating negative margin, on
   all five of the card's text buttons. Verified with a touch tap 4px from the top edge, which
   missed the old box entirely. Ben got signed in, so this was at worst contributory.
2. **A precaching service worker was running in front of the dev server.** The app registered its
   ~120KB Serwist worker in *every* environment. Against a dev server whose chunk URLs change on
   each rebuild, a device that loaded the app earlier keeps being served stale JS: the HTML and CSS
   are fine so the page looks right, but the hydration bundle doesn't match and no handler is ever
   attached — silent in the terminal *and* the console, which is what made it expensive. Now
   production-only, plus a dev-only `SwCleanup` that unregisters any already-installed worker and
   clears its caches (registration alone can't help a device that already has one). Verified
   behaviourally: real `next start` still registers `/serwist/sw.js`; dev reports 0 registrations,
   0 caches, 33 interactive buttons.

**Ruled out, with evidence — don't re-tread these:**
- **Not a WebKit/Safari bug.** Installed Playwright's webkit and drove `/dev/tokens` through
  Safari's own engine on a fresh profile: 33 buttons, the accent switcher flips `data-accent`, no
  page errors, even with a service worker controlling the page.
- **Not the server.** Dev log is clean 200s throughout.
- **Not hydration in a fresh browser** — Chromium and WebKit both mount and run the tRPC queries.
- **Not the auth state.** Ben is signed in and onboarded (3 topics).

**The cheap discriminator to run first in the morning** (nobody has actually run it yet, which is
the real gap in tonight's debugging — every hypothesis was tested against *my* browsers, never
against the failing device): **have Ben tap an accent swatch at the top of `/dev/tokens`.** Those are
pure client state, no network and no tRPC. If the accent changes, hydration is fine and the problem
is confined to the backbone section's data path; if it doesn't, the page's JS isn't running at all on
that device and the next step is Safari Web Inspector over USB — the actual console from the actual
phone, which is the one piece of evidence this whole investigation never had.

Also worth checking in the morning: whether `SwCleanup` fired on his device at all, and whether the
phone is loading a cached *document* rather than a fresh one.

*Session spend: 40.47M tok (in 218 · out 77.7k · cache r 40.13M / w 264.0k) · ~$23.97 · opus-5 + opus-4-7 · 23:19→00:17*

### [[08-13-26 Thu]] — Phase 5.4 (Feed) planned, then paused pending a design redo

**Mode:** Sonnet 5, planning-mode session on branch `phase-5.4-feed`. Three parallel `Explore`
agents (old design handoff, backend contract, existing frontend conventions) fed a `Plan` agent
that produced a full `PHASE5_PLAN_5.4.md`-shaped design — architecture, gesture hooks, visual
spec, copy, steps, verification, risks — matching 5.2/5.3's plan-doc format. Two scope questions
were resolved with Ben up front (plain `<img loading="lazy">` over `next/image` — no
`images.remotePatterns` configured for any of the 5 source hosts and zero `next/image` usage
anywhere yet; image tap opens a local in-page "quick fullscreen preview," not a navigation to
Gallery, which is Phase 5.5 and doesn't exist).

**Then paused before writing anything to `main`.** Ben is unhappy with the current design handoff
(`docs/design_handoff_ambit_pwa/`) and is redesigning it in Claude's design tool. Building out a
detailed, pixel-accurate Feed plan against a visual spec about to be replaced would waste the work
and risk anchoring the real build on the wrong design — so the plan was saved as-is
(`docs/PHASE5_PLAN_5.4.md`, committed on `phase-5.4-feed`, prominently marked PAUSED at the top)
rather than executed or merged. `phase-5.4-feed` stays unmerged until the new design lands and the
plan's stale parts (visual spec, copy, exact class translations — everything sourced from the old
`Ambit - Feed.dc.html`) get re-derived.

**What's still trustworthy in the saved plan, confirmed directly against the repo (not just
inherited from the old design)**: the `feed.page`/`saves.toggle`/`items.byId` signatures, the
`Item` schema, `driftPath` semantics (read straight from `src/server/services/feed.ts` — absent
for CORE, length-1 fallback when a topic has no positive adjacency row, `[start, hop1, hop2?]`
otherwise), the cursor/`nextCursor` end-of-feed signal, the RSC `prefetchInfinite`/`HydrateClient`
pattern (zero existing consumers anywhere — this would be the first, and the query-key-must-match
requirement between server prefetch and client `useInfiniteQuery` is the sharp edge to watch for
whenever this actually gets built), and the full `src/components/ui/` primitive/token inventory.
None of that is design-dependent.

**One open product question surfaced during review, independent of the redesign**: where sign-out
lives once `/feed`'s throwaway placeholder is deleted (the design handoff has no sign-out
affordance anywhere on any screen). The plan's first draft suggested relocating it to
`/dev/tokens`, but that route hard-`notFound()`s in production — meaning that "recommendation"
would make sign-out *categorically* unreachable for real users, not just harder to find. Caught
before Ben was asked to sign off on it; still unresolved, flagged clearly in the saved plan's
Decision 1 for whenever this resumes.

**Decisions:** don't build UI against a design about to change. Preserve the (large) stack-level
research investment — backend contract + primitive inventory — since none of it depends on visual
design and re-deriving it later would be pure waste. Keep the branch unmerged rather than landing
a plan-only doc on `main`, mirroring how 5.2/5.3's own plan-review commits lived on their phase
branches before the phase actually executed.

**Open / next:** wait for Ben's new design. When it lands: re-run the design-handoff exploration
against it, reuse the backend/primitive research verbatim, redo only the visual-spec/copy/gesture-
constant verification, and resolve the sign-out placement question (may be moot if the new design
addresses it directly) before writing anything executable.

*Session spend: 32.22M tok (in 278 · out 192.1k · cache r 30.05M / w 1.97M) · ~$16.52 · sonnet-5 + opus-4-7 · 22:41→12:20*

### [[08-12-26 Wed]] — Phase 5.3 planned: onboarding (`docs/PHASE5_PLAN_5.3.md`)

**Mode:** planning session (Sonnet 5, not the usual Opus planning tier) per the
plan-then-execute-cheaper workflow — no app code; the deliverable is `docs/PHASE5_PLAN_5.3.md`,
self-contained for a cold cheaper-model session. Branched fresh off `main` (`b2de133`, 5.2's
squash-merge) as `phase-5.3-onboarding`.

**The backend for this screen already existed going in.** `topics.list`/`topics.setMine` and their
repo functions landed in Phase 4.2, already tested, already handling re-pick correctly (a kept
topic retains its learned weight). `Chip` and `Button`'s disabled→ghost-ladder behavior were built
in 5.1 with comments explicitly anticipating this exact screen. So 5.3 turns out to be almost
entirely UI wiring plus one small new repo helper, not new backend work — closer to 5.2's
"primitives already exist, just assemble them" shape than to 4.x's from-scratch service work.

**Findings that shaped the plan:**
- **`src/server/config/topics.ts`'s own header comment settles the chip-order question**: "This is
  not the onboarding chip order — that's Phase 5.3's call, and it reads from this array rather than
  from the DB." Taken literally — chip data/order comes from the static `TOPICS` config, not a
  `topics.list` network round-trip. This means the RSC-prefetch (`HydrateClient`) plumbing
  `src/trpc/server.ts` sets up, which a speculative note in 5.2's walkthrough guessed 5.3 would
  finally use, stays unused — that guess doesn't hold up against the config file's own instruction.
  Left for 5.4's Feed instead, which genuinely needs `useInfiniteQuery` reactivity.
- **No "onboarded" concept exists anywhere yet.** Derived as "does this user have any `user_topic`
  rows" — a new `hasCompletedOnboarding(userId)` helper, used by both `/onboarding` (redirect to
  `/feed` if already true) and the `/feed` placeholder (redirect to `/onboarding` if false). The
  `/feed` change isn't wasted throwaway work — 5.4's real feed page needs the identical guard, just
  relocated.
- **`docs/BUILD_PLAN.md`'s own 5.3 line is stale** — still says "32-chip grid," predating the
  07-17-26 divergence down to sixteen (only sixteen topics have a row in the offline-built
  topic-drift graph). Flagged to fix in the same edit that ticks the box.
- **This is the app's first client-side tRPC consumer.** Every client component so far (`AuthCard`,
  `ResetPasswordCard`, `SignOutButton`) has talked to Better Auth's client directly; `OnboardingScreen`
  is the first to call `api.<router>.<procedure>.useMutation()` from `~/trpc/react`, and its test
  file will be the first to mock that module rather than `authClient`.

**Decisions:** persist selection once, on submit, via `topics.setMine` — not per-toggle like the
prototype's `localStorage` write, which only existed because the prototype had nothing else to
persist to. No `<form>` wrapper (no text inputs to benefit from Enter-submission/autofill, unlike
`AuthCard`). Submitting state reuses 5.2's `aria-busy` + `pointer-events-none opacity-80` pattern,
not `disabled` — same ghost-ladder collision 5.2 already found, now confirmed to also apply here.
The onboarding eyebrow is accent-colored per the README, deliberately distinct from the generic
muted `text-ink/40` eyebrow convention `dev/tokens` documents for other screens — a single call
site, not worth generalizing yet.

**Open / next:** execute `docs/PHASE5_PLAN_5.3.md` in a cheaper session on `phase-5.3-onboarding`.

*Session spend: 10.71M tok (in 206 · out 130.6k · cache r 10.21M / w 373.5k) · ~$4.84 · sonnet-5 · 15:21→15:37*

**Review pass (same day, switched to Opus 5).** Re-read the plan against the codebase rather than
against itself. Three things were wrong, all of which would have cost the executing session real
time, and all of which came from the same root cause — **writing spec from the prototype's inline
styles and my own memory instead of checking the repo's actual toolchain and the handoff's shared
sections**:
- **Tailwind v3 gradient syntax in a v4.3.3 repo.** `bg-gradient-to-t`/`from-[62%]` should be
  `bg-linear-to-t`/`from-62%`. Verified against Tailwind's docs. The failure mode is nasty: a v3
  name renders *no background at all*, so the sticky bar loses its fade and chips scroll visibly
  underneath it with nothing obviously "broken" to point at.
- **`to-transparent` where the prototype says `rgba(22,20,17,0)`.** Not interchangeable —
  `transparent` is transparent *black* and can band mid-fade. Now `to-bg/0`.
- **Rise-in motion omitted entirely.** I'd checked the onboarding prototype (which doesn't implement
  it) and missed that the README puts rise-in in its **shared** Motion section — a global token, not
  a landing-only flourish. The prototype files are inconsistent about applying it; the spec wins.
  *Generalizable lesson for 5.4–5.8: check the handoff's shared sections, not just the per-screen
  one — the prototypes under-implement the global tokens.*

Also hardened: navigate with `router.replace` (a `push` leaves `/onboarding` in history, where
backing into it bounces forward to `/feed` and the back button reads as broken); flagged a stale
client Router Cache on `/feed` as the subtlest failure mode (would present as the redirect guard
looping — deliberately *not* pre-patched, just told the executor to walk that transition first);
wrote out the actual `vi.mock` skeleton for `~/trpc/react`, since `useMutation()` is a hook
returning an object and is much harder to mock than 5.2's plain-function `authClient` — and pinned
the component to local `submitting` state so the mock stays one field wide. Fixed a step-ordering
claim copied from 5.2 that doesn't hold here (`AuthCard` could be eyeballed on the existing `/`
before its wiring landed; `OnboardingScreen` has no route to render in until its own step). Named
the re-pick gap explicitly — `setUserTopics` supports weight-preserving re-picks, but Decision 4's
redirect makes it unreachable until Phase 9 settings, so it shouldn't get built here or refiled as
a bug later.

*Session spend: 12.98M tok (in 148 · out 77.5k · cache r 12.18M / w 716.8k) · ~$14.57 · opus-5 + sonnet-5 · 15:37→16:14*

**Execution pass (same day, cheaper Sonnet 5 session, cold on the plan above).** Worked
`docs/PHASE5_PLAN_5.3.md`'s 7 steps in order on `phase-5.3-onboarding`, verifying each against the
real codebase (existing `Chip`/`Button`/`Rise` primitives, `topics` router, `TOPICS` config) before
writing anything — no gaps found, the plan matched the repo as verified. Shipped: new
`hasCompletedOnboarding(userId)` in `src/server/db/topics.ts` (`.limit(1)` existence check);
`OnboardingScreen` (`src/components/onboarding/`) — the app's first client-side tRPC consumer
(`api.topics.setMine.useMutation()`); `/onboarding`'s Server Component route (session → onboarded
→ render); `/feed`'s inverse guard, commented as surviving into 5.4. 10 new tests (8 component, 2
integration) — 217 total, all green. Walkthrough: `docs/PHASE5_WALKTHROUGH_5.3.md`.

No new bugs — every checkpoint the plan called out (gradient render, accent recolor, exact-3 CTA
flip, both redirect directions, the stale-Router-Cache risk on `replace("/feed")`) matched on the
first Chrome DevTools MCP + real-loop walkthrough. One near-miss worth flagging for future
sessions: reading `getComputedStyle` across four back-to-back synchronous `data-accent`
`setAttribute` calls (no yield between them) initially looked like chip/CTA fill wasn't recoloring
— an artifact of reading mid-CSS-transition, not a real bug; re-checking with a moment between
reads showed all three (eyebrow, chips, CTA) recoloring correctly. Also added
`data-testid="onboarding-error"` to the error slot, preemptively — 5.2's walkthrough flagged
`role="alert"` alone as ambiguous in real-browser e2e (Next's route-announcer also carries it), and
this is the first other inline error slot in the app since that finding.

**Open / next:** Phase 5.4 — Feed screen. Real `/feed` replaces the placeholder this phase's guard
now points at; first real consumer of `src/trpc/server.ts`'s RSC-prefetch plumbing.

*Session spend: 34.01M tok (in 526 · out 105.8k · cache r 33.58M / w 331.4k) · ~$9.10 · sonnet-5 · 22:24→22:41*

### [[08-12-26 Wed]] — Phase 5.2 executed and landed: landing / sign-in

**Mode:** cheaper-model (Sonnet 5) execution session per the plan-then-execute-cheaper workflow —
`docs/PHASE5_PLAN_5.2.md` worked cold, step by step, on branch `phase-5.2-landing-signin`.
Walkthrough: `docs/PHASE5_WALKTHROUGH_5.2.md`.

**Shipped:** the real `/` (mode-toggle `AuthCard`: sign-in/sign-up/forgot/forgot-sent, wired to
`signIn.email`/`signUp.email`/`requestPasswordReset`), `/reset-password` (both the valid- and
expired-token query shapes, `ResetPasswordCard`), and a throwaway `/feed` placeholder (signed-in
email + sign-out, `DELETE IN 5.4`) so the whole loop is walkable. `revokeSessionsOnPasswordReset:
true` added to `src/lib/auth.ts`. 14 new tests (`input`, `auth-card`, `reset-password-card`) plus
a 6-test local-only `e2e/auth.spec.ts` driving the real loop through a running dev server +
Mailpit — 207 unit tests total, all green; `bun run build` under CI's placeholder env confirms
`/`, `/feed`, `/reset-password` all render dynamically, none accidentally prerendered.

**Two real bugs, both caught by the plan's own checkpoints, neither visible from reading the
code:**
- **Sign-in/sign-up succeeded but never navigated anywhere.** The submit handler cleared
  `submitting` and returned on success with no `router.push` — `/`'s server-side redirect only
  fires on a fresh page load, so a client-side sign-in left the user staring at their own form
  with a valid session cookie already set. Only caught by actually signing in through Chrome
  DevTools MCP and watching nothing happen. Fixed: both success paths `router.push("/feed")` now.
- **`authClient.$ERROR_CODES` is `{}` at runtime here** — exactly the risk the plan flagged and
  told the executing session to check against a live server rather than trust. Better Auth's
  client resolves it via a lazy `GET /api/auth/error-codes/to-json` call that 404s under this
  app's config, so `signInError.code === authClient.$ERROR_CODES.INVALID_EMAIL_OR_PASSWORD` was
  silently always `false`, and the wrong-password case fell through to Better Auth's raw message
  instead of the mapped one. Fixed with the two verified string codes read directly off curl
  responses against the real server (`INVALID_EMAIL_OR_PASSWORD`,
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`).

**A third bug, found in passing, scoped beyond this phase's own files:** `cn()`'s plain
`twMerge` didn't recognize `.border-hairline` (5.1's custom 0.5px border utility) and
misclassified it into the same conflict group as `border-ink/NN` — silently dropping it from
*every* component using the design system's own documented `border-hairline border-ink/12` idiom
(confirmed via `getComputedStyle`: `Input`/`Button` rendered a 1px border, not the specced
0.5px hairline, with the class entirely absent from the DOM). Root-caused and fixed at the one
shared choke point (`extendTailwindMerge` in `src/lib/utils.ts`), plus removed a redundant
literal `border` class that six Phase-5.1 primitives (`button`, `chip`, `icon-button`,
`segmented`, `toast`, plus `input` from this phase) each additionally had sitting next to
`border-hairline`. Not a Phase 5.2 file, but fixed here since it directly affects this phase's own
visual-fidelity gate — every input and button on the auth card runs through it.

**Findings:** the design handoff has no sign-out affordance on any screen (Phase 9 settings gap,
noted at planning time, confirmed again by needing to build one for the placeholder); Next.js's
own `#__next-route-announcer__` also carries `role="alert"`, so e2e error assertions need
`data-testid="auth-error"` rather than the ambiguous role alone (jsdom component tests don't hit
this, only real-browser Playwright specs do).

**Open / next:** plan Phase 5.3 — Onboarding (`/onboarding`, the topic-chip grid) against the now-
real sign-up flow this phase lands users at the front of.

*Session spend: 72.70M tok (in 804 · out 278.7k · cache r 70.87M / w 1.55M) · ~≥$23.18 · sonnet-5 + <synthetic> · 08:38→10:17*

### [[08-11-26 Tue]] — Phase 5.2 planned: landing / sign-in (`docs/PHASE5_PLAN_5.2.md`)

**Mode:** Opus planning session per the plan-then-execute-cheaper workflow — no app code; the
deliverable is `docs/PHASE5_PLAN_5.2.md`, self-contained for a cold cheaper-model session.
Planned against the *now-real* 5.1 primitive API rather than an imagined one, which was the whole
reason 5.2–5.8 were left unplanned last time. Scoped to 5.2 alone, same rationale.

**Ben's calls (four, all taken as recommended):** mode-toggle auth card (rejecting an email-first
two-step, which would need an endpoint that tells anyone who asks which emails are registered — a
an enumeration oracle invite-gating doesn't otherwise hand out); a display-name field on the sign-up
mode only; a throwaway `/feed` placeholder deleted in 5.4; Playwright specs written now, local-only
until 7.1 gives CI a Postgres.

**Findings that reshaped the task:**
- **The reset email doesn't link to our page.** Better Auth builds
  `{baseURL}/api/auth/reset-password/{token}?callbackURL=…` — *its own* GET endpoint, which
  validates the token and only then bounces to `/reset-password?token=…` **or**
  `?error=INVALID_TOKEN`. So `/reset-password` is unavoidably in 5.2's scope and has to handle both
  query shapes. Also: `resetPassword` does **not** sign the user in, and `requestPasswordReset`
  always reports success even for unknown addresses (deliberate anti-enumeration) — which is what
  lets the "Check your inbox" stage render with no branch.
- **The signed-in redirect cannot live in `src/proxy.ts`.** The proxy check is cookie-shape-only,
  so a stale-but-well-formed cookie would send `/` → `/feed` → `/` in an infinite ping-pong. It
  belongs only where a real `getSession` runs; `proxy.ts` needs no changes at all this phase.
- **Two 5.1 primitives actively fight this screen.** `Button` hardcodes `type="button"`, so a real
  `<form>` would silently never submit; and its `disabled` branch swaps an accent button onto the
  *ghost* ladder — right for Onboarding's "Pick N more", wrong mid-submit, presenting as a CTA that
  turns grey while loading. Neither is a bug in 5.1 (both are correct for what 5.1 built against);
  they're the first evidence of what happens when the primitives meet a screen with real async
  state. `Input` also has no placeholder color — fixed *in the primitive*, not at the call site.
- **The design handoff has no sign-out affordance on any screen.** Surfaced only because the
  throwaway placeholder needed somewhere to put one. That's a real Phase 9 settings gap, logged
  here so it isn't rediscovered later.

**Decisions:** the prototype's magic-link "Check your inbox" stage is **reused verbatim** as the
forgot-password confirmation (envelope-in-circle, email in accent) — the flow change would
otherwise have thrown away the best-looking thing on the screen, and only the body copy changes.
The obsolete "no password, no algorithm" caption (README §1 retires it explicitly) becomes
"Invite-only · no ads, no algorithm". `revokeSessionsOnPasswordReset: true` gets added to
`src/lib/auth.ts` — one line, and a reset after a suspected compromise should kill live sessions.

**Flagged as the phase's weak point:** the Better Auth **error-code map** is the one part of the
wiring not pinned by verified docs. The plan tells the executing session to trigger each failure
against a running server and read real `error.code` values back, rather than trust a hardcoded
list — a hallucinated code union would fail silently into the `error.message` fallback and look
like it worked.

**Open / next:** execute `docs/PHASE5_PLAN_5.2.md` in a cheaper session on `phase-5.2-landing`.
The visual gate is `/` at 402×874 against `screenshots/01-landing.png` in all four accents; the
functional gate is the full loop by hand through Mailpit (uninvited refusal → invite → sign-up →
sign-out → sign-in → wrong password → reset → old password rejected).

*Session spend: 6.41M tok (in 122 · out 113.9k · cache r 5.95M / w 343.8k) · ~$9.26 · opus-5 · 12:38→15:22*

### [[08-10-26 Mon]] — Phase 4.2 landed — **Phase 4 complete**

**Shipped:** merged PR #11 (`phase-4.2-trpc-surface` → `main`, squash `456cc73`); CI green on the
real head SHA, branch deleted both sides. That closes **Phase 4** — feed engine (4.1) and tRPC
surface (4.2) are both on `main`, so every backend piece Phase 5's UI consumes now exists. The
technical narrative lives in `docs/PHASE4_WALKTHROUGH_4.1.md` / `_4.2.md`; SPEC §7 gained the
`knobs`-gating and rate-limiting paragraphs in the same merge.

**Findings:**
- ***The log stopped tracking reality for two days.*** 4.1 and 4.2 both executed *and merged* on
  08-08 in separate cheaper-model sessions, and neither wrote back here — `log.md`'s newest entry
  still read "Phase 4 **planned**" while `main` already carried both. Nothing was lost (the
  walkthrough docs caught the detail), but `/brief` ran on a two-day-stale picture. This is the
  plan-then-execute-cheaper workflow's structural blind spot: the planning session logs, the
  executing session ships, and the write-back falls through the gap between them. **Going
  forward:** the executing session writes its own entry, and the session that lands the PR checks
  for the gap before merging.
- **`PHASE4_WALKTHROUGH_4.2.md`'s first "finding for later tasks" was already stale when written** —
  it flags `FEED_DEBUG` knob-gating as having zero test coverage, but the *next* commit
  (`b841bc7`, a review fix) added exactly that coverage: 4 cases in `services/feed.test.ts`
  covering explicit off/on plus the `NODE_ENV=development` fallback both ways. Corrected in the
  doc in this commit, so the finding list doesn't send someone to redo it. Ordering hazard worth
  remembering: a walkthrough written *before* the review-fix pass describes the pre-review tree.

**Open / next:**
- **Phase 5.1 — design system foundation** is the next box (Tailwind theme from the handoff
  tokens, 4-accent system, Newsreader, shared primitives). Per PHASE4_PLAN the *first shippable
  moment* is 5.4, so 5.1–5.4 is the run that produces something to actually look at.
- One real carry-forward from 4.2: **the rate limiter is untested under concurrent load.** The
  sliding window is unit-tested with an injected clock and `trustedClientIp`'s spoof-resistance is
  tested directly, but nothing exercises the 120 req/min threshold end-to-end. Deliberate — it's
  abuse cover, not throttling — but Phase 7.2/7.3's ops work is where it should get a real test.
- **Ambit Archive** moved out to its own repo today (Ben set it up there from
  `docs/AMBIT_ARCHIVE_SEED.md`). Its Ambit-side integration edits were gated on 4.2 landing, so
  that precondition is now met and the `archive-seed` branch here is free to rebase onto current
  `main` whenever the archive service is real.

*Session spend: 1.37M tok (in 46 · out 16.6k · cache r 1.17M / w 187.3k) · ~$2.18 · opus-5 + sonnet-5 · 10:46→12:05*

**Same day, continued — Phase 5.1 planned (`docs/PHASE5_PLAN.md`).** Planning only, no app code;
the doc is self-contained for a cold cheaper-model session. **Deliberately scoped to 5.1 alone** —
5.2–5.8 get planned once the primitives exist, since detail written against imaginary primitives
goes stale.

**Findings that reshaped the task:**
- **The prototypes have no token system.** Every value is a hard-coded inline style; the *only* CSS
  variable in the whole handoff bundle is `--ambit-accent`, on one input, so a `:focus` rule can
  reach it. "Tokens as CSS vars" is net-new authoring, not a port — and the prototypes disagree with
  each other in ~10 places (rise 8px vs 10px, sheet 103% vs 105%, Feed's props JSON even declares
  the wrong default accent).
- **`ambitpop` is two different animations under one name** — chip select (`1→0.94→1`) in
  Onboarding, checkmark entrance (`0.6→1.08→1`) in Install. Split into `chip-pop` / `pop-in`.
- **`/dev/tokens` would have been publicly reachable.** `src/proxy.ts` gates only `/feed`, `/saved`,
  `/onboarding`; nothing covers `/dev/*`. The plan requires it to `notFound()` outside development.

**Decisions:**
- **One ink color, not forty-one alphas.** The prototypes carry 19 distinct muted-text alphas, 12
  border, 10 fill — hand-authoring noise against a README that specifies *ranges*. Tailwind v4's
  opacity modifier runs on `color-mix()` and works on any `--color-*`, so the whole muted/border/fill
  system collapses to `--color-ink: #EFEBE0` plus a normalized alpha ladder. (v3's
  `rgb(var(--x) / <alpha-value>)` channel trick is exactly what a model trained earlier reaches for
  — the plan says so explicitly.)
- **`@theme inline` for the accent knob**, and this is the load-bearing detail: a theme token whose
  value is a `var()` redefined at runtime silently fails under plain `@theme` — the utility keeps
  the indirection and the `[data-accent]` scope never resolves. Same applies to `--font-serif`
  pointing at `next/font`'s injected var. Flagged in the plan as the single most likely failure.
- **Geist is removed, not supplemented** — the handoff ships no sans webfont at all. Newsreader
  loads as a variable font with `weight` **omitted** and `axes: ['opsz']`, which also sidesteps an
  unresolved docs question (whether the loader errors on a 400/500/600 + italic combination when
  Newsreader has no italic-600).
- **First UI testing layer in the project's life** (Ben's call): `@testing-library/react` + jsdom,
  with Vitest keeping `environment: "node"` as the default and component files opting in per file
  via `// @vitest-environment jsdom` — so the 172 server tests stay fast and CI actually gates
  components. This is the precedent for 5.2–5.8.
- Primitive set = BUILD_PLAN's list **plus** the high-reuse extras the audit surfaced (circular icon
  button — the most-repeated element in the bundle — glass header, segmented control, input,
  spinner), so 5.2–5.6 stop re-inventing them. No `class-variance-authority`; plain variant maps
  through the existing `cn()`.

Three docs items came back **unverified** and are flagged in the plan as "test, don't assume" rather
than stated as fact: whether `--z-*` is a real `@theme` namespace, whether `@vitejs/plugin-react` is
strictly required under Vitest 4, and jsdom-vs-happy-dom currency.

**Open / next:** execute `docs/PHASE5_PLAN.md` in a cheaper session on `phase-5.1-design-system`.
The visual gate is `/dev/tokens` on a real phone at the 402×874 design viewport, all four accents,
against `docs/design_handoff_ambit_pwa/screenshots/`.

*Session spend: 4.73M tok (in 76 · out 133.7k · cache r 4.00M / w 591.1k) · ~$11.26 · opus-5 · 12:05→14:05*

**Same day, continued — Phase 5.1 landed** (squash-merged
[#12](https://github.com/Ibenthinkin/Ambit/pull/12) → `main` at `3d39e9d`, merged by Ben directly
mid-session). Picked up cold from `docs/PHASE5_PLAN.md` in a Sonnet 5 session, per the
plan-then-execute-cheaper workflow. Full narrative in `docs/PHASE5_WALKTHROUGH_5.1.md`; BUILD_PLAN
5.1 checked with its retrospective paragraph; SPEC §10 rewritten with the token model + alpha
ladder; CLAUDE.md's stale "Pre-scaffold" status corrected.

**Shipped:** the design system foundation — Tailwind v4 tokens (`src/styles/globals.css`, `@theme`
+ `@theme inline`), the 4-accent runtime knob (`[data-accent]` on `<html>`, gold default),
Newsreader via `next/font` (Geist removed), 11 icons, 11 shared primitives
(`src/components/ui/`), and `/dev/tokens` as the proof page. Also the project's first UI test
layer (`@testing-library/react` + jsdom, opt-in per file via `// @vitest-environment jsdom`) — 21
new component tests, 193 total, all green.

**Verified, not just built:** confirmed the plan's single highest-risk item — `@theme inline`
resolving a runtime-swapped accent — actually works, live, in a running `bun run dev` server via
Chrome DevTools MCP (toggled the accent switcher, read `data-accent` back, screenshotted every
primitive recoloring with no rebuild). Confirmed `/dev/tokens`'s dev-only gate from both sides:
real content under `bun run dev`, a genuine prerendered `__next_error__` 404 in a `bun run build`
output built with CI's exact placeholder env. Visually checked the 402×874 viewport against
`docs/design_handoff_ambit_pwa/screenshots/03-feed.png` — wordmark weight/size, background, and
the icon-button chrome all matched.

**Finding:** the exact gap this log flagged after Phase 4.2 recurred, in miniature — a follow-up
log-only commit on the feature branch (correcting "PR not yet merged, CI hasn't run" to reflect
the real state) was pushed *after* Ben had already squash-merged #12, so it landed on the
now-deleted feature branch instead of `main`. Cherry-picked onto `main` directly (`0efbb21`,
matching the precedent this same entry's `7375e59` set for doc-only follow-ups) rather than a new
PR. Worth naming as its own pattern: a merge can happen while the executing session is still
mid-write, not just across a multi-day gap.

**Open / next:** Phase 5.2 (Landing/sign-in) is next, planned fresh against the now-real primitive
API rather than an imagined one.

*Session spend: 21.96M tok (in 362 · out 116.9k · cache r 21.54M / w 312.0k) · ~$6.73 · sonnet-5 · 22:10→22:24*
*Session spend: 8.14M tok (in 101 · out 23.7k · cache r 8.00M / w 121.1k) · ~$2.73 · sonnet-5 + opus-4-7 · 22:24→22:53*
*Session spend: 7.65M tok (in 74 · out 12.7k · cache r 7.61M / w 26.2k) · ~$1.75 · sonnet-5 · 22:53→23:14*

### [[08-08-26 Sat]] — Phase 4 planned: feed engine & API (`docs/PHASE4_PLAN.md`)

**Mode:** Fable planning session per the plan-then-execute-cheaper workflow — no code written;
the deliverable is `docs/PHASE4_PLAN.md`, self-contained for a cold cheaper-model session
(tasks 4.1 feed engine / 4.2 tRPC surface, one branch+PR each).

**Decisions:**
- **`seen_item` table, retention = forever** (Ben's call). SPEC §5 never defined a home for §9's
  seen-tracking — the phase0 prototype kept it in localStorage, which quietly became a schema
  gap. New table lands with 4.1's migration; decay/reset affordances are Phase 9 material.
- **Constant-size stable cursor** — `{v, seed, page, anchor, prev[]}`, where `anchor` is
  captured *before* the page's seen-rows insert and `prev` carries only the previous page's ids.
  That makes the exclusion set reproducible, so refetching a cursor returns the identical page
  even though serving already marked its items seen — SPEC §7's "stable pages on refetch"
  without unbounded cursor growth or server-side page caches. ~400 chars, safe over tRPC's GET
  transport (verified; `methodOverride: "POST"` exists as the escape hatch).
- **`feed.page` returns `cards`, not bare `Item[]`** — tier + topic + drift path per card. The
  drift path is product, not debug: 5.4's serendipity connective rows ("{From} → {To}") need it.
  Debug payload + knob overrides gate on a new `FEED_DEBUG` env var.
- **One pool query per page**, not per-slot `drawFromTopic` calls (12+ queries/page would blow
  the <300 ms budget): slot plan first (pure, in-memory), then a single `getTopicPools` select,
  then seeded in-memory draws reusing 3.3's exported `drawWeight`.
- Cold start = uniform weights over all 16 topics; taste keywords stay deferred to 6.1;
  rate limiting = in-memory sliding window (single-instance Coolify assumption).

**Findings:**
- `protectedProcedure` **doesn't exist yet** — Phase 2.2 shipped the optimistic proxy redirect
  and left `trpc.ts` with a comment promising the real thing; 4.2 builds it (docs-verified
  Better Auth `getSession` shape + tRPC v11 narrowing idiom are inlined in the plan).
- The prototype's `pickDrift` comment says "softmax over the row's top half" but the code (and
  SPEC §9) filter to positive-sim neighbours — the plan's porting notes call this out so the
  executing session follows the code, not the stale comment.

**Open / next:** execute `docs/PHASE4_PLAN.md` Task 1 (`phase-4.1-feed-engine`) in a cheaper
session; probe-feed CLI is the pre-UI feel check before 4.1's box gets ticked.

*Session spend: 5.96M tok (in 104 · out 142.7k · cache r 5.31M / w 513.0k) · ~$22.71 · fable-5 · 08:37→09:05*

### [[08-07-26 Fri]] — Phase 3.4 shipped: ingestion job — Phase 3 complete

**Mode:** cold pickup in a new session, `docs/PHASE3_PLAN.md` Task 5 already fully specified from
3.3's handoff. Read `log.md` + `PHASE3_PLAN.md` cold, confirmed `phase-3.4-ingestion` was the
checked-out branch off a clean `main`, executed via `superpowers:executing-plans`, TDD for the
pure collision-resolution logic.

**Shipped (BUILD_PLAN 3.4 box checked — Phase 3 complete):** full detail in
`docs/PHASE3_WALKTHROUGH_3.4.md`. `resolveCollisions()` (`src/server/services/ingest-plan.ts`)
settles SPEC §15's collision question: highest-search-rank wins, ties → alphabetically-smallest
topic id, order-independent by construction (6 new unit tests, including the reversed-input-order
property itself). `upsertItem()` made real in `src/server/db/items.ts` (insert-or-refresh-content,
preserving id/topicId/curationScore/aestheticTags on conflict — 2 new integration tests).
`scripts/ingest.ts` orchestrates all five adapters → collision resolution → skip-existing →
structural floor → curation → upsert, with a structured per-source/per-topic summary table
(`--source`/`--topic`/`--quota`/`--skip-llm`/`--dry-run` flags). 93 tests total, `bun run check`
green.

**Live verification, in order:** free structural dry-run (622 would-insert, 0 errors, all 16
topics represented) → real small run (622 inserted, ~$0.15, score histogram matched the known 7-9
skew) → two immediate re-runs to gate idempotency → full populate at the default quota (150,
~64 min).

**Finding — live search APIs aren't perfectly deterministic across repeated calls.** The plan's
literal "second run inserts 0" gate didn't hold — investigated rather than assumed a bug. A direct
probe (same adapter, same query, two back-to-back calls, no pipeline involved) confirmed
Wikipedia's search returns different sourceIds for the identical query across separate calls —
external API behavior, not a code defect; 3.3's walkthrough independently hit the same phenomenon
in its curator smoke test ("a second live harvest pulled a slightly different set from the live
search index"), a second, larger-scale confirmation of the same property. Re-runs showed a small,
convergent trickle instead of zero (622 → +37 → +19); no duplication or re-scoring at any point —
DB counts reconcile exactly across every run (including the full populate: 678 + 7,825 = 8,503,
down to the last item), and `upsertItem`'s conflict path is integration-tested to preserve
score/topic. Documented in SPEC §15 as an expected live-API characteristic, not a defect to fix.

**Final dev corpus: 8,503 items** across all five sources (wikipedia 2,170 · wellcome 1,952 ·
cma 1,528 · met 1,515 · aic 1,338) and all sixteen topics (457–608 each — astronomy at **457**,
the direct payoff of the collision fix against phase0's pathological 4 of 419 usable AIC finds
under its last-topic-wins dedupe). Score distribution matches SPEC §15's calibration-drift note
(7–9 heavy); 90% of items carry an image.

**Open / next:** Phase 3 is complete. Phase 4 (feed algorithm) is unblocked with a real corpus to
tune against — `docs/BUILD_PLAN.md`'s Phase 4 section is the next planning target.

*Session spend: 4.43M tok (in 10.0k · out 26.4k · cache r 4.19M / w 205.4k) · ~$2.79 · sonnet-5 + opus-4-7 · 15:07→15:09*

### [[08-07-26 Fri]] — Phase 3.3 shipped: curation service + `drawFromTopic`

**Mode:** cold pickup in a new session (`/Users/ben/.claude/CLAUDE.md`'s "pick up where the last
session left" flow) — no plan-mode brainstorming needed, `docs/PHASE3_PLAN.md` Task 4 was already
fully specified from 3.2b's handoff. Read `log.md` + `docs/PHASE3_PLAN.md` cold, confirmed via git
that `main` was clean and up to date at 3.2b's merge commit, then executed Task 4 directly via
`superpowers:executing-plans`, TDD throughout (every function's tests written and run to a failing
state before implementation — plan Steps 1-4 for the curator, Step 5 for `drawFromTopic`).

**Shipped (BUILD_PLAN 3.3 box checked):** full detail in `docs/PHASE3_WALKTHROUGH_3.3.md`.
`src/server/services/curator.ts` (structural floor + LLM curator, ported from `phase0/curate.ts`
— prompt copied verbatim as a product artifact) and `drawFromTopic()` made real in
`src/server/db/items.ts` (weighted-random draw, never similarity — the 0.4 failure stays dead).
21 new tests (85 total): 12 pure curator tests, 4 pure `drawWeight` tests, 5 integration tests
against real Postgres. Live curator smoke (~$0.01, 40 items) confirmed sane score distribution and
a working disk cache; script deleted after verification per the plan (not part of the committed
surface).

**Findings — both infrastructure, not curation logic, and both fixed at the root rather than
worked around:**
- **Vitest doesn't resolve the `~/*` tsconfig path alias.** Every adapter file through 3.2b used
  relative imports, so nothing had yet exercised a test transitively importing a `~/`-aliased
  module. First one to do it (`items.integration.test.ts` → `db/client.ts` → `~/env`) failed
  outright. Fixed once, permanently, with an explicit `resolve.alias` in `vitest.config.ts`.
- **`bun run test` doesn't get Bun's automatic `.env` loading** — Vitest's bin shebangs to plain
  Node, unlike `dev`/`build`/`start`, which force `--bun`. Integration tests were *silently
  self-skipping* even with `docker compose up -d` running and a real `.env` present — technically
  "working as designed" (skip when no DB) but not actually exercising the DB path Step 6 needed.
  Tried forcing `--bun` on vitest to match the existing idiom; that broke `zod`'s package-export
  resolution inside Vite's SSR transform instead (`z.string is not a function`) — reverted.
  Settled on loading `.env` once in `vitest.config.ts` via Node 24's built-in
  `process.loadEnvFile()`, a no-op in CI (no `.env` there) rather than a crash — no new dependency.
- **A third fix rides along:** `drawFromTopic()` imports `db/client.ts` *dynamically*, inside the
  function body, not at module scope — otherwise merely importing `items.ts` for the pure
  `drawWeight` tests would trigger `~/env`'s Zod validation, and CI's `bun run test` step runs with
  **zero env vars set** (only the later `bun run build` step supplies them). Verified directly, not
  just reasoned about: ran the full suite under a stripped environment (`env -i ... bun run test`,
  CI's actual condition) — 85 passed, 5 correctly skipped, no crash.

**Open / next:** Task 5 (3.4: ingestion job) — `scripts/ingest.ts` wires all five adapters, the
collision-resolution rule, and this task's curation service into the idempotent job that populates
the dev DB. Branch `phase-3.3-curation` pushed with a PR open.

*Session spend: 22.23M tok (in 336 · out 117.1k · cache r 21.45M / w 661.3k) · ~$8.11 · sonnet-5 · 14:53→15:07*

### [[08-07-26 Fri]] — Phase 3 planned; 3.1 (adapter contract + Wikipedia) shipped

**Mode:** Ben asked for a Phase 3 execution plan (Fable, plan mode). Explored the repo's Phase 0
reference code (`phase0/harvest.ts`, `phase0/curate.ts`, `phase0/NOTES.md`) and the Phase 2
scaffolding it builds on (`schema.ts`, `topics.ts`, `items.ts` stubs), verified two live API
behaviors via WebFetch (MediaWiki's `imageinfo`/`extmetadata` shape, and that full-article
extracts cap at 1 page/request vs intro extracts' 20-page batch), then used `AskUserQuestion` to
settle three open decisions before writing the plan:
- **3.4's multi-topic collision gate (SPEC §15, previously open):** highest-search-rank wins, ties
  broken alphabetically by topic id. Order-independent by construction, replacing Phase 0's
  last-topic-wins dedupe that silently starved earlier topics (astronomy kept 4 of 419 AIC finds).
- **Wikipedia lead images:** resolve per-image licenses at ingest (batched `imageinfo` calls) and
  serve free-licensed images; text-only otherwise. Not deferred to "text-only forever."
- **Adapter scope:** all five v1 sources (not three) land together in Phase 3 — `topics.ts`
  already assumes five, and CMA/Wellcome are trial-passed with quirks recorded in `phase0/NOTES.md`.

Plan saved to `docs/PHASE3_PLAN.md` (five tasks: 3.1 adapter contract + Wikipedia, 3.2 Met + AIC,
3.2b CMA + Wellcome, 3.3 curation service + `drawFromTopic`, 3.4 ingestion job). Ben then switched
model (Sonnet 5) and asked for direct execution in-session — a deviation from the
plan-then-execute-cheaper split used for Phase 2 (recorded in memory: phase plans now get
committed straight to `docs/PHASE<N>_PLAN.md`, matching the PHASE1/PHASE2 convention, rather than
staying in the `~/.claude/plans/` scratch file).

**Shipped (BUILD_PLAN 3.1 box checked):** full detail in `docs/PHASE3_WALKTHROUGH_3.1.md`.
`server/services/sources/{types,http,normalize}.ts` (the shared adapter contract + plumbing) and
`wikipedia.ts` (search → intro-detail batch → per-image license resolution → toItem; a separate
`fetchBody()` for the one-page-per-request full-body case). `scripts/probe-adapter.ts` as the
reusable live-verification CLI. 33 unit tests on fixtures; two live probes (astronomy, typography)
plus a live `fetchBody` check.

**Findings:**
- **A real bug the live probe caught, not the fixtures:** the first live run returned zero images
  across every item, including ones known to have free-licensed lead images. Cause — MediaWiki
  normalizes `File:` title underscores to spaces in the `imageinfo` *response*, but the adapter's
  license lookup was still keyed on the raw underscored value it sent in the *request*. Fixtures
  encoded the correct mapping by construction, so only the live call exposed it; fixed by
  normalizing both sides through one `toFileTitle()` helper. Confirms the plan's live-verification
  step (not just fixture tests) earns its place.
- **Full-article body fetches are a real per-item cost** Phase 0 never measured (its harvester only
  ever pulled intro extracts) — one page per request, not batchable like the 20-page intro fetch.
  Noted for Task 5: the ingestion job should call `fetchBody()` only after the structural floor +
  collision resolution, not on every raw search hit.
- Lint caught three real issues (two stray `any`s, one assertion-style nit) before this walkthrough
  was written — fixed, not suppressed; `bun run check` green.

**Open / next:** Task 2 (3.2: Met + AIC adapters), same pattern, reusing the shared plumbing from
3.1.

*Session spend: 30.92M tok (in 24.4k · out 209.9k · cache r 29.37M / w 1.32M) · ~≥$36.20 · sonnet-5 + fable-5 + <synthetic> · 12:16→13:23*

**Same session, continued — 3.2 (Met + AIC adapters) shipped.** Full detail in
`docs/PHASE3_WALKTHROUGH_3.2.md`. `met.ts` (N+1 shape: search returns bare IDs, one
`GET /objects/<id>` per candidate at a 400ms delay) and `aic.ts` (one search call returns full
records, paginated at the undocumented 100-per-page hard cap). Both register in
`scripts/probe-adapter.ts`; 11 new unit tests (44 total).

**Findings:**
- **Live fixture-gathering re-confirmed two Phase 0 findings directly, with real examples on
  file:** the Met's `isPublicDomain=true` search filter genuinely lies (fixture objects `745853`
  and `490889` came back from a PD-filtered "machine" search yet are `isPublicDomain: false` on
  their own record), and AIC's `is_public_domain` field is unreliable in a sharper way than
  recorded before — it can be **entirely absent**, not just `false`.
- **A wrong assumption caught by the test itself, not by review:** an early AIC fixture labeled a
  record as having `is_public_domain` absent based on a truncated debug print; the real record had
  it explicitly `false`. The test failed immediately (`expected true to be false`) rather than
  silently passing on a wrong premise — fixed by hand-editing one record to genuinely lack the key
  (marked inline) and using a different real record for the "explicitly false" case.
- Lint flagged 12 real `prefer-nullish-coalescing` violations across both adapters; each swap was
  checked for safety before applying (every flagged expression feeds a later `.filter(Boolean)`,
  which treats `""` and `null` identically, so the intermediate-value change never reaches output).
- **The Met's N+1 shape makes it the ingestion job's throughput bottleneck** — worth keeping in
  mind for Task 5's full-populate run estimate.

**Open / next:** Task 3 (3.2b: CMA + Wellcome adapters) — completes the five-adapter registry.

*Session spend: 26.94M tok (in 299 · out 133.4k · cache r 26.38M / w 423.4k) · ~$10.21 · sonnet-5 + opus-4-7 · 13:23→13:31*

**Same session, continued — 3.2b (CMA + Wellcome adapters) shipped. All five v1 source adapters
complete.** Full detail in `docs/PHASE3_WALKTHROUGH_3.2b.md`. `cma.ts` (friendliest API of the
five — one request can cover a whole topic's quota) and `wellcome.ts` (per-item license
heterogeneity, every hit's own `thumbnail.license.id` re-checked against the open set).
`src/server/services/sources/index.ts` completes the five-adapter registry;
`scripts/probe-adapter.ts` now imports it directly instead of wiring adapters up by hand. 20 new
unit tests (64 total) — all passed on the first run, no debugging cycle needed this time.

**Findings:**
- **CMA's `description` field carries raw HTML** (`<em>`, `<br>`) not mentioned anywhere in
  `phase0/NOTES.md` — the throwaway harvester stored it but never rendered it, so nobody noticed.
  Added `stripHtml()` to `normalize.ts` (CLAUDE.md: never render unsanitized source HTML), designed
  to replace tags with a space rather than nothing so adjacent tags like `<br><br>` don't jam
  words together (`poetry.<br><br>Here` → `poetry.Here` was the failure mode a dedicated unit test
  now guards against).
- **Wellcome's thumbnail-rewrite regex only covered half of live URL shapes.** The plan ported
  phase0's regex verbatim (bracket form only); a live survey across four searches found the
  plain-width form is nearly as common (47 vs 33 of 80). Checked safety first — AIC's IIIF server
  403s a wider plain-width request, so blindly copying that assumption to Wellcome would have
  repeated the mistake — but `curl -I` + a file-size comparison confirmed Wellcome's server honors
  a wider plain-width request cleanly (222KB vs 47KB for the same image, not a re-served original).
  Extended the regex to rewrite both shapes to the same `!800,800` target; re-verified against 5
  fresh live results afterward.

**Open / next:** Task 4 (3.3: curation service + `drawFromTopic`) — the taste layer that turns
these five adapters' raw output into what the feed draws from. **Handing off to a new session
here** — Task 3's branch (`phase-3.2b-cma-wellcome`) is committed and pushed with a PR open;
`docs/PHASE3_PLAN.md` has the full Task 4/5 spec for a cold pickup.

*Session spend: 41.58M tok (in 392 · out 109.2k · cache r 40.24M / w 1.23M) · ~$13.83 · sonnet-5 + opus-4-7 · 13:31→13:53*

### [[08-06-26 Thu]] — Phase 1 verified complete; Phase 2.2 and 2.3 shipped — **Phase 2 closed**

**Mode change:** Ben asked to confirm Phase 1 was really done, then plan Phase 2 the same way as
prior phases. Re-ran `bun run check` fresh — still green, all three BUILD_PLAN 1.1–1.3 boxes hold.
Since Phase 2 already had a plan (`docs/PHASE2_PLAN.md`, written 07-17) and 2.1 was already
shipped, the ask narrowed to resuming at 2.2. New workflow tried for the first time: **plan with
the expensive model, execute the saved plan in a separate session on a cheaper one.** The planning
session did the docs-verification legwork (Context7 against installed versions) and wrote a
self-contained plan to `~/.claude/plans/jolly-launching-hartmanis.md`; declined to auto-execute
when plan mode exited, per Ben's explicit request. A follow-up session (`sonnet-5`, same day)
picked the plan up cold and executed it end-to-end via `superpowers:executing-plans`, pairing
checkpoints included in the plan but run unattended since Ben wasn't present to review piece-by-
piece live — the walkthrough doc serves as the after-the-fact record instead.

**Shipped (BUILD_PLAN 2.2 box checked):** full detail in `docs/PHASE2_WALKTHROUGH_2.2.md`.
- Mailer seam (`src/server/services/mailer.ts`): `Mailer` interface, `MailpitMailer`
  (nodemailer), `ResendMailer`, env-switched — same isolation ethos as `SourceAdapter`.
- `src/lib/auth.ts` fleshed out: `drizzleAdapter` now gets the schema explicitly; invite gating
  via `databaseHooks.user.create.before` (throws `APIError` for uninvited emails) / `.after`
  (flips `invite.status` → `accepted`); `sendResetPassword` fire-and-forget through the mailer.
- Route (`app/api/auth/[...all]/route.ts` via `toNextJsHandler`) + client
  (`src/lib/auth-client.ts` via `createAuthClient`, same-origin, no `baseURL`).
- Route protection + invite script (`scripts/invite.ts`, idempotent upsert-by-email).
- Full HTTP-level verification since no UI exists until Phase 5.2: invite → sign-up → session →
  invite flipped to accepted; uninvited sign-up refused with the polite message; password-reset
  loop driven end-to-end through Mailpit's own API (request → catch mail → follow the emailed
  redirect → extract token → reset → old password fails, new one signs in); proxy redirect
  checked both directions (no cookie → 307 to `/`; valid cookie → falls through, 404 since
  `/feed` doesn't exist yet).

**Decision — `middleware.ts` → `proxy.ts`, caught before it was written.** The 07-17 plan
predates Next 16's rename of Middleware to Proxy. The planning session's docs research flagged it
as a revision; the executing session **re-verified it against live docs** rather than trusting
the plan blindly (confirmed `proxy.ts` exporting `proxy()` is the current convention, and that a
`:path*` matcher segment matches the bare parent path too — `/feed/:path*` needed to catch plain
`/feed`, not just sub-paths, a real gotcha if it had gone unchecked). Also bumped `drizzle-orm`
0.41.0 → 0.45.2 and `drizzle-kit` 0.30.6 → 0.31.10 first (better-auth 1.6.25's adapter peer-range),
confirmed zero schema diff from the bump before building on top of it.

**Findings:**
- Docker Desktop wasn't running at the start of the execute session — started it, polled for the
  daemon, then `docker compose up -d`. The named Postgres volume from 2.1 had survived (only
  `down -v` would wipe it), so the schema was already migrated; verified with a no-op
  `db:migrate` rather than assuming.
- Better Auth's emailed reset link isn't a raw token — it's the library's own
  `/api/auth/reset-password/{token}?callbackURL=...` redirect endpoint. Verified with
  `curl -D -` (not `-L`) to read the `Location` header and confirm it lands on
  `/reset-password?token=...`, matching what the client-side flow expects, before trusting the
  token extraction.
- `sendResetPassword` needed to be declared `async` even though its body doesn't `await`
  anything — Better Auth's type expects a `Promise<void>` return; `tsc` caught it immediately.
- **`main`'s CI had been silently red since 2.1 (07-29), undetected for 8 days.** `env.js`
  started requiring `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` in that commit, but
  `.github/workflows/ci.yml`'s build step was never updated to supply them — invisible because
  2.1 was pushed straight to `main` rather than through a PR, so the `pull_request` CI trigger
  never ran against it. Only surfaced because this was the first PR since. Fixed the workflow
  (placeholder values); worth treating even solo/paired work as PR-only going forward, purely so
  CI actually runs.

**Open / next:** 2.3 (topic seed data — the 16 validated topics, per the label mapping settled
07-17) is next. No UI exists yet; Phase 5.2 is the first point sign-in/sign-up become visible.

*Session spend: 25.94M tok (in 528 · out 134.5k · cache r 25.12M / w 682.6k) · ~$20.35 · sonnet-5 + fable-5 · 10:11→10:32*

**Third session, same day — 2.3 shipped, Phase 2 complete.** Same plan-then-execute-cheaper split
(planned on Opus, executed on Sonnet in-session this time rather than a fresh one). Full detail in
`docs/PHASE2_WALKTHROUGH_2.3.md`. Shipped: `src/server/config/topics.ts` (16 topics, per-source
seed-query arrays), `scripts/seed-topics.ts` (`bun run db:seed`), and
`src/server/config/topics.test.ts`. No migration — `seed_queries` shipped back in 2.1's migration
0000, and narrowing the type in *config only* (`Record<V1Source, string[]>`, assignable to the
schema's deliberately-open `Record<string, string[]>`) got the typo-safety without touching
`schema.ts`.

**Finding — the Phase 0 seed-query warning was mostly a false alarm, and the real bug is worse.**
`phase0/NOTES.md:44-48` says to "budget real time for seed-query tuning in 2.3" and names six weak
topic×source cells. Measuring them instead of acting on them split those six into **three unrelated
causes**: four (all AIC) were an artifact of `harvest.ts`'s last-topic-wins dedupe; two (Textiles/Met
150→6, Ceramics/Met 150→57) were the curation floor; only **four cells were genuinely bad queries**,
all CMA and Met, retuned against live-measured hit counts. AIC's `/artworks/search` turns out to be a
**relevance ranking over the whole 132k corpus, not a filter** (`pagination.total` = 132681 for every
query), so topics overlap massively at the 600-candidate depth harvest pages to. Reproduced exactly:
`astronomy` finds 419 usable AIC items, 415 are claimed by later-ordered topics, **4 survive** —
matching `items.json` to the item. Astronomy is 1st in `TOPICS` order, Machines 3rd; the raw AIC
counts track list position almost monotonically. Recorded in **SPEC §15 as a Phase 3.4 open
question**, because `(source, source_id)` UNIQUE + a single-valued `item.topic_id` means real
ingestion hits the identical collision — the rule it picks must be order-independent, and the
ingest log should surface collision counts so it can't recur invisibly.

**Finding — JSONB doesn't round-trip key order.** The second seed run reported "16 updated" instead
of "16 unchanged", failing the step's own no-op requirement. Cause: change detection compared
`JSON.stringify(row.seedQueries)` to the config object, but Postgres normalizes JSONB object keys
(shortest first, then bytewise), so `{wikipedia, met, aic, …}` comes back `{aic, cma, met, …}`. Data
was correct throughout; only the reporting lied. Fixed by walking a fixed key list. Any future
"has this JSONB column changed?" check in this repo has the same trap waiting.

**Decisions:** seed script upserts with `onConflictDoUpdate` (the repo's first `onConflict*` use),
deliberately inverting `invite.ts`'s read-first-and-bail — an invite is user data that must never be
overwritten, a topic is config that *should* re-sync when `topics.ts` is edited. Rejected `star`
(193 CMA hits) and `printing type` (4,573 Met hits) despite good counts — hit count isn't relevance.
Dropped the dead `typography` term from CMA entirely rather than keeping it for appearances.
Caveat noted for later: `topic-graph.json`'s Astronomy and Machines centroids were built from
AIC-starved samples, so worth a re-look after 3.4's real ingestion.

**Open / next:** Phase 3 — 3.1 (adapter contract + Wikipedia adapter). Backend 3.x/4.x can start
interleaving with Phase 5 UI work from here. Two things 3.x inherits: the collision rule above, and
the fact that seed-query *quality* still isn't proven — the retuned queries were verified non-empty
against live APIs, not verified to survive the 3.3 curation floor.

*Session spend: 13.76M tok (in 214 · out 145.7k · cache r 12.73M / w 878.8k) · ~$17.98 · opus-5 + sonnet-5 · 14:42→15:48*

## 2026-07

### [[07-29-26 Wed]] — Phase 2.1 shipped: Postgres + Drizzle schema, paired step-by-step

**Mode change:** Ben installed Docker Desktop and asked to start Phase 2. Per the "ask/observe per
phase" note from Phase 1, offered three ways to work it; he picked **pairing step-by-step**
(propose each piece, he reviews before moving on) rather than Phase 1's "he executes, Claude
plans" or handing the whole thing over. Detailed play-by-play in
`docs/PHASE2_WALKTHROUGH_2.1.md`, written specifically so he can follow along after the fact.

**Shipped (BUILD_PLAN 2.1 box checked):**
- `docker-compose.yml`: `postgres:17-alpine` + `axllent/mailpit`, verified up/healthy and actually
  accepting connections (not just trusting the health label).
- The real Drizzle `schema.ts`: Better Auth's `user`/`session`/`account`/`verification` generated
  for real via `bunx @better-auth/cli generate` (against a minimal `src/lib/auth.ts` scaffolded
  just for the CLI to read) and hand-merged, plus `item`/`topic`/`user_topic`/`saved_item`/`invite`
  transcribed from SPEC §5 — every field, default, FK, and all six §5.6 indexes (GIN on `tags`,
  the feed's `idx_item_topic_score` composite).
- First migration generated, reviewed against SPEC line-by-line, and applied — all 9 tables
  confirmed live via `psql \dt`, not just a clean CLI exit.
- `topic-graph.json` ported from `phase0/` into `server/config/`, 16 chip-label keys slugified to
  the topic ids PHASE2_PLAN's Step 3 mapping settles on.
- `db/index.ts` → `client.ts` rename; typed-stub repositories `items.ts`/`feed.ts`/`saves.ts`/
  `topics.ts` matching SPEC §6.3's contracts, each throwing `"not implemented until Phase N.M"`.
- Cleaned out the last of the t3 placeholder: `postRouter` trimmed to just the pure `hello`
  procedure the homepage still calls (its `create`/`getLatest` siblings referenced the now-gone
  placeholder table — dead code Phase 1's own comments had already flagged as due for removal).
- `bun run check` green throughout; dev server boots and serves a real 200 against the new schema.

**Decision — dropped the `ambit_` table-name prefix.** The t3 scaffold's `pgTableCreator`
prefixes every table (for sharing one Postgres across multiple apps), but Better Auth's generated
tables come back unprefixed, and SPEC §5's own SQL is unprefixed throughout. Since this compose
Postgres is dedicated to Ambit alone, the prefix bought nothing — asked Ben rather than picking
silently (a real convention change, not an implementation detail); he chose to drop it, so
`drizzle.config.ts`'s `tablesFilter` came out too (leaving it in would have silently hidden every
unprefixed table from drizzle-kit).

**Findings:**
- Verified the exact Drizzle DSL for the unfamiliar pieces (GIN index via `.using("gin", ...)`,
  composite PKs via the table-callback `primaryKey({ columns: [...] })` form, typed JSONB via
  `.$type<...>()`) against Drizzle's current docs rather than from memory — installed version is
  0.41.0, plan was written against research done 07-17.
- `.env` sits outside the assistant's read/write boundary for existing secrets, but *generating and
  appending* a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) plus `BETTER_AUTH_URL` is a
  pure local write with nothing to leak — did that directly instead of stopping to ask Ben to
  type it in by hand.
- First draft of `items.ts` actually implemented `upsertItem` for real before catching, on review,
  that PHASE2_PLAN explicitly wants typed stubs here ("so the shape of the system is visible
  before it's built") — rewrote it back down to match the other three skeleton files.

**Open / next:** Ben paused here to review before continuing. Step 2 (2.2 — Better Auth email +
password, invite gating, Mailpit/Resend mailer, auth route + client, middleware) is next, same
pairing mode, picking up from the minimal `src/lib/auth.ts` already scaffolded this session.

*Session spend: 22.45M tok (in 364 · out 90.1k · cache r 21.88M / w 479.5k) · ~$7.20 · sonnet-5 · 11:11→11:58*

### [[07-28-26 Tue]] — Phase 1.1 shipped: scaffold on Next 16, two real bugs caught before they shipped

**Shipped:** `bun create t3-app` (trpc + tailwind + drizzle/postgres + appRouter, `--eslint`, no auth)
in an isolated worktree (`.claude/worktrees/phase1-scaffold`, branch `worktree-phase1-scaffold`).
Upgraded the template Next 15.2.3 → 16.2.12 via `@next/codemod` (which also had to migrate
`next lint` → the ESLint CLI — Next 16 removes `next lint` outright, a fact the 07-17 plan didn't
know yet). Merged into repo root; renamed the leftover `ambit-scaffold_` Drizzle table prefix to
`ambit_`; excluded `phase0/` and `docs/` (throwaway tooling and design prototypes, not app code)
from tsconfig/eslint/prettier; wired `package.json` scripts to SPEC §13's `--bun` convention;
teaching-pass comments landed in next.config.js, env.js, drizzle.config.ts, trpc.ts, globals.css.
BUILD_PLAN 1.1 box checked.

**Findings — two real bugs, not template defaults:**
- **`eslint-plugin-react` 7.37.5 doesn't support ESLint 10** (its peerDep still caps at `^9.7`) —
  hit a hard crash (`contextOrFilename.getFilename is not a function`) the moment `eslint-config-
  next@16` pulled in ESLint 10. Pinned ESLint to 9.39.5, the latest 9.x line.
- **Turbopack's client/server bundle-boundary tracer doesn't elide inline `import { type X }`**
  the way `tsc`/webpack do — it resolved the type-only `AppRouter` import in `src/trpc/react.tsx`
  as a real edge, pulling the `postgres` driver's Node built-ins (`fs`/`net`/`tls`) into the client
  bundle and 500ing both `next dev` and `next build`. Confirmed by isolating the variable: `next
  build --webpack` compiled clean on the exact same code. Fix: standalone `import type { X }`
  instead of the inline modifier; also flipped typescript-eslint's `fixStyle` to
  `"separate-type-imports"` so `lint:fix` can't silently reintroduce the pattern project-wide.
- Both fixes verified under the **actual `--bun` runtime** (not just Bun-as-package-manager) for
  both `dev` and `build` — no Node-runtime fallback needed, unlike the risk the 07-17 plan flagged.

**Decisions:**
- **Dropping the worktree technique after Phase 1.** Ben tried the scaffold hands-on and found the
  isolated-worktree setup (separate directory, separate branch, not reachable by switching
  branches in the main checkout) more confusing than it's worth. Once Phase 1's branch merges back
  to `main`, future phase work goes back to a conventional branch-off-`main`/merge-back flow in the
  normal working directory.
- Homepage 500s locally and that's expected — no Postgres reachable yet (Phase 2 scope); confirmed
  the failure is a clean `TRPCError` from the missing DB, not a leftover bundler regression.

**Open / next (superseded below):**
- Flagged in `PHASE2_PLAN.md`: `create-t3-app` now has an experimental `--betterAuth` flag that
  didn't exist when that plan was written against "create-t3-app doesn't offer Better Auth yet" —
  worth a quick spike before 2.2's hand-wiring to see if it actually covers invite-gated signup.
- **Docker (or Podman) needed before Phase 2** — `start-database.sh` and BUILD_PLAN 2.1 both assume
  it for the local dev Postgres; not needed for the rest of Phase 1.

**Later the same day — Phase 1.2 shipped (Vitest, Playwright, CI), and the worktree technique's
retirement actually carried out.**

The 1.1 worktree's commits were still sitting on `worktree-phase1-scaffold`, un-merged, when this
session picked back up — last entry's "drop the worktree technique" was a decision recorded, not
yet executed. Fast-forward-merged into `main`, removed the worktree directory and its branch, and
did 1.2 on a conventional branch (`phase1.2-quality-tooling`, off `main` in the normal working
directory) per that decision — PR #1, merged after CI went green.

**Shipped:**
- Vitest, unit-testing a real `cn()` helper (`clsx` + `tailwind-merge`, added since components
  will need it — not a fake placeholder test).
- Playwright, smoke-testing the home page renders with no console errors (`bun run e2e`, local-only
  — CI has no Postgres until Phase 7.1 adds compose services).
- `bun run check` meta-script: typecheck → lint → format check → unit tests.
- GitHub Actions (`.github/workflows/ci.yml`): checkout → setup-bun → `bun install
  --frozen-lockfile` → `bun run check` → `bun run build` (a placeholder `DATABASE_URL` env var
  satisfies `src/env.js`'s build-time validation; nothing actually connects since the home route
  is dynamic, not statically generated). Verified green both on the PR and on push to `main`.
- BUILD_PLAN 1.2 box checked; 1.1's box updated too (see finding below).

**Findings:**
- **The 1.1 "homepage 500s without Postgres" finding is now superseded, not just documented** —
  trimmed the create-t3-app boilerplate's DB-backed `getLatest` demo query off the home page
  (kept the DB-free `hello` query) so the Playwright smoke test can genuinely pass without
  standing up Postgres early, keeping Phase 1 fully DB-free as designed. Deleted the now-orphaned
  `_components/post.tsx` demo component along with it.
- **A worktree's local `.env` doesn't survive `git worktree remove`** — the DB URL that made 1.1's
  dev server boot lived in the worktree's own untracked `.env`, not in the repo. Once the worktree
  was removed, the main checkout's own `.env` (a pre-Phase-1 leftover from Phase 0, holding only
  the harvester/curator API keys) had no `DATABASE_URL`, so `bun run dev`/`build` failed *env
  validation* outright rather than the softer "500 at query time" — a sharper failure mode worth
  knowing about if a worktree's app never got its own committed `.env.example`-derived `.env`.

**Decisions:**
- Confirmed with Ben mid-session: rather than stand up Postgres early or water down the smoke
  test's assertions to match a known-broken page, the right fix was trimming the demo DB call —
  it's throwaway t3 boilerplate due for replacement by the real feed UI anyway, and it keeps the
  "Docker not needed until Phase 2" sequencing intact.

**Open / next (superseded below):**
- 1.3 (PWA shell / `@serwist/next`) is the last item in Phase 1.
- `PHASE2_PLAN.md`'s `--betterAuth` flag spike and the Docker/Podman-before-Phase-2 need (both
  still open, carried over from above) remain ahead of 2.1.

**Later the same day — Phase 1.3 shipped, Phase 1 complete.**

**Shipped:**
- Web app manifest (`src/app/manifest.ts`): name "Ambit", `#161411` theme/background, standalone
  display.
- App icons: extracted the design handoff's ring-and-dot logo mark (accent gold `#BFA06A`,
  README's documented icon-tile gradient `#0F0D09` → `#221E17` as background) and rendered it to
  192/512 PNGs plus maskable variants (mark scaled to fit the maskable safe zone). No SVG
  rasterizer was available locally (no rsvg-convert/inkscape/imagemagick), so a one-off script
  drove Playwright's already-installed Chromium to screenshot an HTML/SVG page at each exact
  pixel size instead.
- Service worker (`src/app/sw.ts`) + offline fallback page (`src/app/~offline`), registered via
  `<SerwistProvider>` in the root layout.
- BUILD_PLAN 1.3 box checked; Phase 1 marked complete.

**Decisions:**
- **`@serwist/next` → `@serwist/turbopack`, revising the 07-17 gate.** That gate settled on
  `@serwist/next` specifically because Serwist had no Turbopack support at the time — SW would
  have to stay disabled under `next dev` and only get verified against production builds. Docs
  research this session found `@serwist/turbopack` now ships as a first-class package (same
  9.5.12 release as `@serwist/next`, not experimental): it compiles the service worker as a
  Route Handler (`src/app/serwist/[path]/route.ts`) rather than a webpack build step, so it works
  identically in `next dev` and `next build` — no dev/prod split. Confirmed with Ben before
  switching, since it revises a previously-settled gate.

**Findings:**
- **The route handler's directory must be a dynamic `[path]` segment, not a literal `sw.js`
  folder** — got this wrong on the first pass (nested it under a literal `serwist/sw.js/`
  directory to match the `SerwistProvider`'s `swUrl="/serwist/sw.js"`), which surfaced as a
  `next build` type error demanding `params: Promise<{ path: string }>`. Confirmed the correct
  shape by fetching the live docs page directly (context7's snippets didn't show the file path
  annotation) — Serwist needs the `[path]` catch-all so one handler can serve every path under
  `/serwist/*` (the SW script, its sourcemap), not just one literal file.
- **Lighthouse has fully removed its PWA category and every installability audit** — not
  deprecated-but-available via `--only-audits`, actually gone (`--list-all-audits` returns zero
  matches for installable-manifest/service-worker/manifest/maskable-icon). The 07-17 plan's
  "verify via Lighthouse" step is dead as written. Verified installability instead via Chrome's
  own real signal: listened for `beforeinstallprompt` (fired) and confirmed
  `navigator.serviceWorker.getRegistrations()` shows the worker `active` at `/serwist/sw.js` —
  arguably more authoritative than Lighthouse's audit ever was, since it's the actual heuristic
  Chrome uses to decide whether to offer install.
- Trimmed the create-t3-app boilerplate's homepage title/description (still said "Create T3
  App"/"Generated by create-t3-app") and added a real `viewport`/`appleWebApp` metadata block
  while wiring the manifest — iOS Safari doesn't read `manifest.json` for "Add to Home Screen" at
  all, so `appleWebApp` is a separate, necessary block.

**Open / next:** Phase 1 complete. Phase 2 (Docker Postgres + Drizzle schema, Better Auth +
invite gating, topic seeds) is next — `PHASE2_PLAN.md`'s `--betterAuth` flag spike and the
Docker/Podman requirement (both flagged above) are the first things to resolve there.

### [[07-17-26 Fri]] — Phase 1 gates settled; detailed plan written; Ben takes the wheel

**Decisions:**
- **The two harness judgments left open at the 0.5 gate are provisionally settled** — Ben browsed
  with the Voyage key in place and is happy with both the visual-embeddings column and the
  `--favorites` taste-profile results. Recorded in SPEC §15 as **provisional KEEP** (visual
  vectors → a future "more like this look" save-affordance, not a feed tier; `--favorites` →
  planned for onboarding beside the taste picker); final calls deferred to when each is built.
- **1.2 lint/format gate → ESLint + Prettier** (the t3 default — zero swap-out; Biome v2 still
  lacks equivalents for the newer react-hooks and @next/eslint-plugin-next rules).
- **1.3 PWA gate → `@serwist/next`** (next-pwa is deprecated in its favor). Caveat that shaped
  the plan: Serwist has no Turbopack support, so dev runs with the SW disabled and PWA behavior
  is verified on production builds.

**Shipped:** `docs/PHASE1_PLAN.md` — a detailed execution plan for BUILD_PLAN 1.1–1.3, including
the 07-17 docs-research findings: create-t3-app still has no Better Auth option (hand-wire in
2.2 as planned) and its template likely lags on Next 16 / Tailwind 4 (inspect + upgrade at
scaffold time; `create-next-app` hand-scaffold as fallback); Bun-as-runtime for Next has open
issues (e.g. oven-sh/bun#26508), so 1.1 includes an explicit checkpoint — verify dev + build
under `--bun`, fall back to Node runtime + Bun package manager if flaky and record it in SPEC
§13. Also fixed two stale pre-pivot lines in BUILD_PLAN that the 0.5 sweep missed (3.3's *Done*
line and 4.1's body still described `nearestNeighbors`).

**Open / next:** Ben executes Phase 1 himself from `docs/PHASE1_PLAN.md` as a learning exercise
— the plan doubles as the reference doc. Next session picks up wherever that leaves the tracker.

**Later the same day — Phase 2 planned the same way (`docs/PHASE2_PLAN.md`).**
- **Decision: v1 seeds the 16 graph-validated topics, not the design handoff's 32 chips.**
  Planning surfaced a real mismatch the docs had papered over: the handoff's onboarding grid
  specs 32 chip labels, but the validated topic graph covers 16 topics — and DRIFT/JUMP need a
  graph row per topic, so graph-less chips would break the feed. The grid grows toward 32 in
  Phase 6 when new harvests land and the graph is recomputed. Label mapping settled in the plan:
  Cartography surfaces as the handoff's "Maps"; Portraiture and Zoology stay (graph-validated
  beats design-listed). Recorded in SPEC §3.2, BUILD_PLAN 2.3, and a divergence note in the
  handoff README §2 (mirroring the §1 auth note).
- Docs research findings baked into the plan: Better Auth is 1.6.x and every pattern the SPEC
  bet on is still the recommended one (drizzleAdapter, `databaseHooks.user.create.before` +
  `APIError` for invite gating — no first-party invite plugin exists, `toNextJsHandler`,
  `getSessionCookie` as optimistic-only middleware check). Bun traps to respect: `better-auth`
  in `serverExternalPackages`, and run the schema CLI as plain `bunx @better-auth/cli generate`
  — `bunx --bun` segfaults. Drizzle 0.45.x (1.0 still beta), postgres.js as the driver
  (`Bun.sql` a later low-risk swap), `push` for iteration + committed `generate`/`migrate` to
  ship. Mail = tiny `Mailer` interface, Mailpit (nodemailer) dev / Resend prod.
- BUILD_PLAN 2.3's "three sources first" superseded: `harvest.ts` already carries seed queries
  for all five v1 sources, so the topic config ships them all and adapters come online per phase.

### [[07-13-26 Mon]] — Phase 0.4 verdict: item-level NN is dead; topic-level drift replaces it

**Verdict — the 0.4 gate returns NO on item-level nearest-neighbour recommendation.** Ben browsed
the harness and couldn't distinguish the variants: all four vector sets produce the same thing, all
are far too clustered, and chaining is a straight line rather than a drift. Clicking *Poetry
Fragment (Qit'a) in Nasta'liq Script* returns pages of calligraphy from the same few poems. His
words: "it feels like a direct search… that is not a serendipitous drift, that's just a straight
line."

**Why (the corpus explains it):**
- **580 of 3168 items sit on a literally duplicated title.** 67 items are titled just `textile`,
  27 `fragment`, 12 `page of calligraphy from an anthology of poetry by sa'di and hafiz`.
- Met items have a **median title of 4 words and a median summary of 129 chars** (12% under 80).
- So embedding `title + summary` for a museum object mostly embeds *accession-catalog boilerplate*.
  Cosine similarity over that text degenerates into **string matching** — which is exactly why the
  neighbours of the calligraphy fragment were a dozen items whose titles are the same sentence.
- Compounding it: **top-k NN is by construction an anti-serendipity operator.** It returns the most
  similar item available. Asking it for a drift and getting a straight line is the definition of the
  function, not a tuning failure. The 0.4 mid-band toggle was the right instinct but can't rescue a
  corpus whose mid-band is also calligraphy.

**The pivot — embeddings move up a level, from items to topics.** The failure was about *what we
embedded*, not about embeddings. Separation of concerns, and it's the whole design now:
- **Embeddings choose WHERE to look** — topic level. 16 clean, semantically real concepts.
- **Random draw + filters choose WHAT to show** — item level, where embeddings failed.

**Shipped: `phase0/topic-graph.ts` → `phase0/topic-graph.json`.** Topic centroid = mean of every item
vector carrying that topic (grounds each node in servable content). Emits a 16×16 adjacency matrix,
**computed once offline and checked in** — no pgvector, no per-item vector in the DB, no embedding
call at request time. The recommender collapses into a static lookup table we can read, hand-edit,
and diff in a PR.

**Trap found — hubness — and it would have shipped silently.** Raw cosine over topic centroids makes
**Geology the top-2 neighbour of 10 of the 16 topics** (Music→Geology 0.73, Portraiture→Geology 0.70
— nonsense). Classic high-dimensional pathology: a centroid near the corpus mean is "close" to
everything, so *every user on the platform drifts into rocks*. Fix is one step —
**subtract the global mean centroid** (the "generic digitised museum object" direction) before
comparing. Geology drops to 3 top-2 appearances and the graph goes flat. This step is load-bearing;
without it the feature looks like it works and is broken.

**The graph, once centered, is genuinely good** — real intellectual bridges, not medium/era clusters:
Textiles↔Machines 0.37 (the Jacquard loom), Typography→Machines 0.12 (the printing press),
Botany→Textiles 0.22 (dyes, fibres), Ceramics→Geology 0.24 (clay), Astronomy→Cartography→The ocean
(navigation). `Poetry → Typography → Machines` is a two-hop walk that is exactly the drift we wanted.
**Honest caveat:** rows for **Architecture and Music** have a best-neighbour under 0.06 — no real
structure, drift there is indistinguishable from noise. Script flags them; curate by hand.

**Decisions:**
- **Feed = three tiers over topics, random within a topic.** CORE (user's picked topics) / DRIFT
  (walk the adjacency row, 1–2 hops, softmax-sampled) / JUMP (the *antipode* — tail of the row — a
  principled cross-domain leap rather than mere noise). Item selection inside the chosen topic is
  **random**, never by similarity.
- **Personalisation-from-saves is dead and stays dead.** SPEC §9's "nearest-neighbours of recently
  saved items" was the item-level NN that failed. Personalisation is now: which topics you pick, and
  which topics you drift toward.
- **The real work was never the ranking function.** A random draw over *this* corpus still serves
  "textile" 67 times. Needed in either world, and it's what actually makes the feed feel good:
  a **quality floor at ingest** (drop bare-noun titles, drop items sharing a title with >2 others)
  and **diversity constraints at composition** (no two adjacent cards from one source; cap per
  topic/creator/collection per page).
- Keep `phase0/` on disk — `harvest.ts` is still the basis for the real adapters.

**Open / next:**
- ~~Ben is putting the topic-drift proposal to Fable before committing~~ → done, session 2 below.
- SPEC §9 (feed algo), §5.1 (vector column), §15 (embedding-dimension open question) and the
  CLAUDE.md "**Embeddings are the product**" line are all now **false** and need rewriting once the
  approach is settled. Not touched yet, deliberately — the sweep is gated on 0.5 (below).
- ~~Hand-authored adjacency matrix vs computed~~ → resolved by session 2's recompute: on the
  curated 5-source corpus the computed graph has zero weak rows; hand-editing demoted to review.

---

**Session 3 (night) — ⚖️ THE 0.5 GATE PASSED; Phase 0 closed; docs swept.**

Ben's verdict on `feed.html`: *"it's getting good. definitely on the right track… what I enjoy
the most is the higher further drift."* Consequences, all landed:
- **Default tier mix shifted drift-heavy:** CORE 40 / DRIFT 35 / JUMP 25, second-hop chance
  0.5 (was 55/30/15, hop 0.35). These are now the shipped defaults in SPEC §9. (Anyone with
  stored knobs from an earlier browse: hit "Reset knobs to defaults" to pick them up.)
- **Debug overlay + tuning knobs stay in the product** behind a dev flag for the whole
  development period — feel-tuning is ongoing product work.
- **The doc sweep, in one commit:** SPEC rewritten end-to-end for the validated design
  (pgvector/`VECTOR(n)`/`nearestNeighbors` removed everywhere; §5.1 gains
  `curation_score`/`aesthetic_tags`/`topic_id`; §6.2 is now the curator service; §9 is the
  tiered-drift algorithm with the 0.5 defaults; §14 marks Phase 0 complete; §15 splits
  settled-vs-open). CLAUDE.md "Embeddings are the product" → "The corpus is the product."
  README status → Phase 0 complete. source-candidates: CMA + Wellcome marked ✅ kept/promoted.
  BUILD_PLAN 0.5 all checked; 2.1/3.3/8.1 rewritten for the no-pgvector world.
- **Still open (SPEC §15):** visual-embeddings keep-or-cut (Ben hasn't blind-judged the sixth
  column yet), curator prompt calibration, `--favorites` with real input, topic-graph refresh
  cadence, tier-mix under weeks of real use.

**Session 2 (evening) — vision re-clarified; Phase 0.5 "Feel Gate" built end-to-end.**

Fable's take on the 0.4 debate, as requested: **pivot endorsed**, with the caveat that the
empirical "NO" was overdetermined — item-NN was never tested on a clean corpus, but the
structural argument (top-k NN is anti-serendipity by definition) and the product-feel argument
(random-within-interests won both rounds) decide it regardless. Pushbacks that became decisions:
saves are **demoted to a topic-level signal, not dead**; item vectors **stay in the offline
pipeline** (dedupe, quality, graph recompute) — only the request path drops them; JUMP =
**random draw from the row's tail half**, not the strict antipode (false precision at 16 points).

Ben then re-stated the north star: the feel of **old Tumblr's curated-but-never-repeating
drift** — "a person's favorite wing of a museum" — pushed a bit further cross-domain, run rich
(personal product, no scale constraints). Anti-example researched: **xikipedia** (traced the
actual code: no embeddings — category-tag score bags; no quality layer beyond stub-removal;
cold start seeds 12 huge categories at equal weight, which is *why* it opens boring; feedback
loop invisible). Diagnosis for Ambit: the topic graph gives **structure (WHERE)** but nothing
gives **taste (WHAT)** — the missing layer is item-level curation + a differentiated cold start.
Phase 0.5 planned and approved (see BUILD_PLAN 0.5).

**Shipped (all `phase0/`, verified end-to-end):**
- **Corpus 3,168 → 9,811 → curated 8,093.** `harvest.ts` + Cleveland Museum (CC0, no key, real
  prose descriptions — friendliest API of the five) + Wellcome Collection (open-license filter +
  per-item license check); quota 75→150. New traps recorded in NOTES: Wellcome's `thumbnail.url`
  is a rendered IIIF URL locked to `!200,200` (not `info.json` as docs imply); AIC's IIIF server
  bot-blocks provider-side image fetchers; some Met image URLs contain literal spaces.
- **`curate.ts` — the taste layer.** Stage 1 structural floor (dup-titles >2, bare-noun image
  titles, thin summaries): 9,811 → 8,093, losses exactly where 0.4 found the noise. Stage 2:
  gemini-2.5-flash-lite as a Tumblr-art-blog-curator persona scores every item 1–10 + aesthetic
  tags, judging images by the *downloaded image* (base64 — the catalog text would replay the 0.4
  trap). ~12.4M tokens ≈ $1.25, cached per item×model×prompt-version. Spot-checks read true:
  Great Wave / Frederick Douglass daguerreotype / Voyager Family Portrait at 10; book-title-page
  stubs at 1; keyword-strays at 4.
- **Topic graph recomputed on the curated corpus: zero weak rows** (0.4's three noise rows all
  healed). Machines↔Typography 0.35, Ancient history↔Mythology 0.34, Architecture→Cartography
  0.12 — bridges are ideas, not mediums.
- **`build-feed.ts` + `feed.template.html` → `feed.html` — the wind tunnel.** Self-contained
  scrolling feed implementing the whole post-0.4 design: CORE/DRIFT/JUMP tier mix (drift walks
  positive-sim bridges only — first build let a −0.01 edge through, caught via the debug
  overlay; jump = tail-half draw), item pick weighted by curator score + aesthetic-tag overlap,
  no-adjacent-same-source + per-page topic caps, localStorage seen-set (never repeats), save →
  visible reweight with a toast ("Now also drifting toward Cartography" — xikipedia's invisible
  loop, made legible), debug why-line per card, all parameters live knobs. Cold-start modes:
  **taste picker** (24 top-scored items — now The Great Wave, The Scream, the Enigma machine,
  celestial woodcuts), **topic chips** (the xikipedia-style control), and **`--favorites "…"`**
  (build-time LLM maps freeform favorites → topic weights + keywords + a blurb). Playwright:
  composed pages average curator score 8.0 (min 7), five sources interleaved, zero console errors.
- **`embed-images.ts` ready** for the visual-vibe experiment — Voyage `voyage-multimodal-3.5`
  (URL-native, shared text/image space, free tier covers the corpus; researched vs
  Jina/Cohere/DeepInfra). **Blocked on `VOYAGE_API_KEY`** (free, dash.voyageai.com).

**Open / next (pick up here):**
- **Ben browses `feed.html` — this is the 0.5 gate.** Compare the taste-picker vs topic-chips
  cold starts; turn the knobs (tier mix, score floor, drift temperature); debug overlay shows
  every card's why. Regenerate anytime: `harvest → curate → embed → topic-graph → build-feed`.
- Ben's curator calibration: spot-check ~30 scores (visible in the debug overlay); if the taste
  is off, describe the miss → prompt tweak → `PROMPT_VERSION` bump re-scores for ~$1.25.
  Reference Tumblr-blog links welcome — they'd be distilled into the curator persona.
- `--favorites` mode needs Ben's real list to be judged fairly.
- ~~`VOYAGE_API_KEY` → run embed-images.ts~~ → done (session 3, same day): Ben's first run
  crawled for hours — Voyage's URL fetcher is bot-blocked by AIC (same trap as the curator,
  second time in one day; NOTES now carries the rule: *never hand a museum image URL to a
  third-party service, pass bytes*). Rewritten to local-download + base64 with checkpoint/resume:
  **5,931 visual vectors in 35 min**, free tier. explore.html rebuilt with a sixth
  **voyage-multimodal · visual** column (blind mode shuffles it in with the text columns).
  First impression: text NN finds the *subject*, visual NN finds the *form/vibe* — for a
  sculptural Astronomy allegory, text returns zodiac prints, visual returns tritons fountains
  and firedogs. **Judge in the blind harness whether vibe-drift belongs in the feed.**
- **After the gate:** the one-sweep doc rewrite (SPEC §9/§5.1/§6.1/§15, CLAUDE.md "Embeddings
  are the product" line, README status, source-candidates trial verdicts, system-map artifact).

### [[07-11-26 Sat]] — Auth rethink: magic link → email + password (Better Auth)

**Decisions:**
- Ben dropped magic-link auth for regular **email + password**. That forced a library change, not just a flow change: Auth.js's Credentials provider is the wrong tool for passwords — officially discouraged, JWT-only sessions (no DB persistence/revocation), and no built-in sign-up, hashing, or reset; you'd hand-roll all of it. Picked **Better Auth** instead (current docs verified): built-in email/password with scrypt hashing + reset flow, database sessions, Drizzle adapter, and a documented invite-gating seam (`databaseHooks.user.create.before` throws for uninvited emails).
- Mail infra (Mailpit dev / Resend prod) **survives** — repurposed from magic links to password-reset mail. Email *verification* skipped: the invite list is the trust anchor.
- Scaffold consequence: create-t3-app still only offers NextAuth, so 1.1 now declines its auth option and 2.2 adds Better Auth by hand. Auth tables switch to Better Auth's `user`/`session`/`account`/`verification` (CLI-generated); app-table FKs now reference singular `"user"`.
- Design handoff landing prototype still shows the magic-link flow — divergence note added to its README §1 rather than rewriting the as-built prototype description; 5.2 builds sign-in/sign-up/forgot-password states in the same visual language.

**Shipped:** SPEC (§1, §3.1, §5, §6.3, §8.1, §11, §12, §14), BUILD_PLAN (context, 0.1, 1.1, 2.1, 2.2, 5.2, 7.1, 8.1), README, CLAUDE.md stack line, `.env.example` (`NEXTAUTH_*` → `BETTER_AUTH_*`) all updated to match.

### [[07-10-26 Fri]] — Phase 0.3: four vector sets, `dimensions` answered; 0.4 harness built

**Shipped:**
- **Repo-as-teaching-tool pass** (evening session): explanatory comments through the `phase0/`
  scripts + harness template, aimed at a returning webdev — modern JS/TS idioms, embeddings
  concepts, the retry/cache patterns. Fixed one stale comment while in there (the harvest dedupe
  Map keeps the *last* topic's copy, not the first). Published the **Ambit system map artifact**
  (architecture, four data flows, data model, Phase 0 story, build order):
  https://claude.ai/code/artifact/cb527a06-6bd3-4d00-ac4b-a13a722a8262
- **0.4 eyeball harness**: `phase0/build-explore.ts` + `phase0/explore.template.html` → self-contained `phase0/explore.html` (0.7 MB, gitignored, no server needed — open it directly). Precomputed top-10 *cross-source* neighbors per item for all 4 vector sets; 5 columns (4 sets + seeded-random baseline); search / random-item / click-to-chain; **blind mode** shuffles and unlabels the columns with a reveal button, so the go/no-go and model-vs-model judgments aren't biased. Verified end-to-end in Playwright (render, navigation, blind/reveal, search) — zero console errors after the fix below.
- **AIC image trap found + fixed in `harvest.ts`**: the docs' IIIF size `843,` 403s on any original narrower than 843px (servers reject upscales — ~7% of AIC thumbs). `!843,843` (fit-in-box) works for all. Recorded in NOTES for the 3.2 adapter; items.json regenerated from cache (only imageUrls changed, vectors unaffected).
- Early unblinded impression from verification screenshots: for easy cases all 4 model columns are clearly on-subject vs an obviously-random baseline; the Typography article (the known-hard topic) looked much shakier. The real browsing + verdicts are still open.
- `phase0/embed.ts` (zero-dep Bun, same style as the harvester): embeds all 416 items through OpenRouter as 2 models × 2 recipes → 4 vector sets under `phase0/vectors/` (gitignored, ~19 MB, reproducible). Skips sets already on disk; `--force` re-embeds.
- 0.3 findings appended to `phase0/NOTES.md`; box checked in BUILD_PLAN.

**Findings:**
- **OpenRouter honors OpenAI's `dimensions` param** (asked 512, got 512) — the open probe from 0.2. If 0.4 picks `text-embedding-3-small`, the `VECTOR(n)` dim is a free choice, not locked to 1536.
- Whole run cost **~$0.003** (verified via OpenRouter usage accounting: $0.02/M vs $0.01/M). Cost is a non-factor in the model pick.
- **bge-m3 is ~10× slower through OpenRouter** (75.7s vs 6.6s per set) — its upstream provider, not the model. Ingestion-only, so tolerable, but a tiebreaker strike.
- Smoke test: cross-source neighbors of the Wikipedia *Astronomy* article are all astronomy-subject museum objects under both models. Proves the vectors work, not that serendipity is good — that's 0.4.

**First 0.4 verdict attempt — inconclusive, and the random column won:**
- Ben's browse of the harness: 416 items is too sparse to judge, and **the random baseline was his favorite column**. Two confounds explain (but don't dismiss) this: (1) the "random" column samples a corpus 100% harvested around his 8 topics, so it's really *random-within-interests* — a product finding in itself; (2) the NN columns show top-10 most-similar, i.e. relevant-but-unsurprising "more of the same," while serendipity lives in the mid-distance band the harness never shows — and at ~50 items/topic that band barely exists.
- Provisional product implication if this holds at scale: feed shifts toward "curate the pool, randomize the order, embeddings for chain-jumps off saves" — SPEC §9's randomness floor becomes the ceiling.

**Revised 0.4 plan executed — harness rebuilt at scale, verdicts still Ben's to make:**
- Harvest scaled 416 → **3,168 items** (16 topics incl. 8 new ones — Architecture, Music,
  Textiles, Cartography, Zoology, Portraiture, Ceramics, Geology — quota 20 → 75/source/topic).
  Hit a new trap along the way: AIC hard-caps `limit` at 100 (undocumented, 403s above it) —
  fixed with pagination. Side effect: AIC/Typography, which 0.2 found totally empty at a
  60-item probe, fills its full quota once paged to 300 candidates — reverses that specific
  "0 items" finding (deeper search, not a real density floor). Met/Typography stayed genuinely
  sparse (5/75), confirming 0.2 rather than contradicting it.
- Re-embedded all 4 sets (`bun run phase0/embed.ts --force`) against the larger corpus.
  bge-m3's ~10x-slower-than-OpenAI pattern held at scale (≈7 min/set vs ≈45s) — firmer
  tiebreaker strike now. `dimensions` param re-confirmed honored at this size.
- Harness now has a **near/mid-band toggle**: model columns default to top-10 (as before) or
  switch to 10 evenly-spaced picks from rank ~20–120; random baseline is the fixed control
  either way, unaffected by the toggle. Verified end-to-end in Playwright — toggle correctly
  swaps neighbor content/scores, random stays identical, search/blind/nav all still work.
  Full detail in `phase0/NOTES.md` under "0.4 — First pass and scale-up".

**Open / next (pick up here):**
- **Session ended at the judgment gate — everything is staged for Ben's 0.4 verdicts.** The
  teaching pass + artifact link are committed and pushed (`a4c0251`); the harness was opened
  for browsing but no verdicts were reached. Judging procedure agreed: blind mode ON, a round
  at top-10 then a round with the mid-band toggle (rank ~20–120) against the fixed random
  control, chain-jump via card clicks, reveal only after forming an opinion; probe Typography
  and Ceramics items for medium-vs-subject clustering (recipe B is the intended fix).
- **Ben re-judges** `phase0/explore.html` (open directly; blind mode on), comparing **near vs
  mid-band vs random** — the question his first-pass reaction (preferring random) actually
  raised. Bring back the three ⚖️ verdicts: (1) serendipity go/no-go, (2) model + recipe,
  (3) `VECTOR(n)` dim (free choice if the OpenAI model wins — `dimensions` honored). Then:
  record in SPEC §6.2/§15, check the 0.4 box, mark Phase 0 complete in README, update the
  system-map artifact's Phase 0 section — which unlocks **Phase 1.1 (scaffold)**.
- **System-map artifact** (keep updated as architecture evolves; same URL via the `url` param):
  https://claude.ai/code/artifact/cb527a06-6bd3-4d00-ac4b-a13a722a8262
- Watch for medium-vs-subject clustering (recipe B is the intended fix); Typography is still
  the source most likely to expose it (Met especially, given how sparse it stayed).
- If the harness needs regenerating on a fresh checkout: `bun run phase0/harvest.ts` →
  `bun run phase0/embed.ts --force` (needs `OPENROUTER_API_KEY`) → `bun run phase0/build-explore.ts`.

### [[07-09-26 Thu]] — Phase 0.2: sample harvester

**Shipped:**
- `phase0/harvest.ts` (zero-dep Bun script) + `phase0/items.json`: **416 items** — 160 Wikipedia articles, 135 Met, 121 AIC — across the 8 topic seeds. On-disk response cache (gitignored) so 0.3/0.4 iterate without re-hitting the APIs.
- `phase0/NOTES.md` with the density + quality findings.

**Findings:**
- **Density is a non-issue.** Every topic × source pair except one could fill its quota many times over. The binding constraint for v1 is *quality and licensing*, not volume.
- **The real risk to serendipity is the embedding text, not the model.** Museum objects have no prose description; their summary is synthesized from catalogue fields and is dominated by artist/date/**medium**/department, with the actual subject buried last in the tags. Wikipedia hands the model 591 chars of prose; the Met hands it 137 chars of "Bronze. Sculpture-Bronze." Cross-source neighbors may therefore cluster on *medium* rather than *subject* — technically serendipitous, experientially dull. **If 0.4 looks bad, re-order the summary to lead with subject/tags before blaming the model.** 0.3 should keep summary construction swappable so 0.4 can compare *recipes*, not just bge-small vs. text-embedding-3-small.

**Traps found (all will recur in the Phase 3 adapters):**
- The Met's `isPublicDomain=true` **search filter is not honored** — 14 of the first 20 `machine` hits aren't public domain. Must re-check every object's own record, at ~2–3× the fetches. An adapter that trusts the search filter ingests copyrighted images.
- The Met rate-limits with a silent **403, not 429**, and it clears after a pause. First run showed three topics at `0/0`, which reads exactly like "no content" but was three dropped searches (real totals: 39 / 11,666 / 1,928). Harvester now reports a failed search as `ERR`, never a zero. ~2.5 req/s is clean.
- Wikipedia's **`cllimit` is a per-query budget, not per-page**: at `cllimit=20` over a 20-page batch, page one takes all 20 categories and the rest get none. Only `cllimit=max` works. Silent — made tags look uniformly empty.
- **Wikipedia licensing isn't uniform**: text is CC BY-SA 4.0 but each lead image has its own per-file license the summary API doesn't expose. Resolve via `prop=imageinfo&iiprop=extmetadata` in 3.1, or don't render Wikipedia images. Met/AIC are clean CC0 once per-object verified.
- AIC + "typography" → **0 usable items** (all 60 hits in-copyright 20th-c photography). Abstract topics need object-vocabulary seed queries against museums. **Budget real time for seed-query tuning in 2.3** — one term per topic won't work across sources.

**Decisions:**
- **Embeddings go through OpenRouter**, for model flexibility. Its embeddings endpoint (`POST /api/v1/embeddings`, batched array `input`) is real now — SPEC §6.2's "limited embeddings support" note was stale. Verified against the docs.
- **Local `bge-small` dropped.** Two facts killed it: embeddings are computed *at ingestion only* (the feed reads vectors already in Postgres, so nothing embeds on the request path — a managed provider adds no request latency or uptime risk), and cost is negligible (~$0.002 for the whole 416-item Phase 0 corpus at $0.02/M). The "local is free" argument was carrying weight it no longer deserved. Managed wins on simplicity; no local model runtime in Phase 3.3.
- Caveat noted: **model choice stays expensive to reverse.** A gateway makes a *same-dimension* model swap one line, but a dimension change still means re-embedding the corpus plus a `VECTOR(n)` migration. `embed()` is the single seam.
- `bge-small` isn't on OpenRouter anyway; closest is `bge-m3` (1024-dim). So 0.3's candidates became **`openai/text-embedding-3-small` (1536)** vs **`baai/bge-m3` (1024)**.
- **0.3 reshaped to 2 models × 2 recipes** (4 vector sets) rather than a wider model bake-off — because 0.2 found the *embedding text* is the bigger lever. Recipe A = as-harvested; recipe B = subject-first (title + tags before catalogue fields). 0.4 gets 4 columns + random baseline.

**Open / next (pick up here):**
- **0.3 — embed** (`phase0/embed.ts`). Needs `OPENROUTER_API_KEY`, not yet set in `.env`. Also probe whether OpenRouter honors OpenAI's `dimensions` param — undocumented, and it decides whether 1536 can be shortened.
- Then 0.4 (eyeball harness → go/no-go on serendipity, model + recipe pick, `VECTOR(n)` dim). If neighbors cluster by *medium* rather than *subject*, that's recipe A failing — try recipe B before blaming the model.

### [[07-08-26 Wed]] — Repo setup + in-repo log
**Shipped:**
- `docs/BUILD_PLAN.md`: the living execution tracker (Phase 0 → MVP → Polish), step 0.1 done (plan committed, `LICENSE` moved to repo root, README license field fixed).
- `docs/source-candidates.md`: post-MVP backlog of candidate content APIs, seeded with early ideas to organize later.
- This `log.md` convention, replacing the dead `VAULT_LOG_PATH` vault-rollup step (adapted from Magpie's `log.md` pattern — the vault's `/brief` skill already reads any hybrid project's `<repo>/log.md` generically, no per-project wiring needed).

**Decisions:**
- Dev magic-link mail: Mailpit in dev, Resend in prod. Dev DB: local Docker Compose (`pgvector` image). Recorded in BUILD_PLAN.md context.
- Project log lives in-repo (`log.md` at root) and complements commits — retired `VAULT_LOG_PATH`.

**Open / next (pick up here):**
- Phase 0 is still the active phase: **0.2 sample harvester** — Bun script to pull ~300–600 raw items from Wikipedia + Met + AIC across ~8 topic seeds, normalize, dump to `phase0/items.json`, note per-source density in `phase0/NOTES.md`.
- Then 0.3 (embed with both candidates) → 0.4 (eyeball harness, go/no-go on serendipity + embedding model pick).
