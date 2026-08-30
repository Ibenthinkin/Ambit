# Phase 8.1 walkthrough — deploying Ambit to VM 202

Companion to `docs/PHASE8_PLAN_8.1.md`. The plan says what to do; this says what actually
happened, what it proved, and every trap hit along the way. Written during execution, not after —
the numbers below are the ones observed at the time, not reconstructed.

**Status: in progress.** T1–T2 shipped 08-28-26. T3 and T4.1–4.4 executed 08-29-26 — Ambit is
public at `https://ambit.benreilly.io`. T4.5–4.6, T5 and T6 (bar 6.2) done 08-29-26. **T7 in progress 08-30-26** — 7.1 smoke re-run clean, 7.2 tasks created, first full ingest next.

## Deployed facts (T3.6)

Recorded as they were confirmed, so later phases don't have to go re-derive them from a UI.

| Fact | Value | How it was confirmed |
|---|---|---|
| Coolify resource UUID | `mxo9s7hkdbtbfk2ilbvgnmfr` | prefix on both the container name and the volume |
| Container name | `mxo9s7hkdbtbfk2ilbvgnmfr-<digits>` | `docker ps --filter publish=3000` |
| Cache volume | `mxo9s7hkdbtbfk2ilbvgnmfr-ambit-cache` → `/app/.cache` | `docker volume ls \| grep ambit-cache` |
| Host port binding | `0.0.0.0:3000->3000/tcp` | `docker ps` |
| Image tag | the deployed commit SHA (`4a4c428b999c…`) | `docker ps` IMAGE column |
| Database | `ambit-db`, `postgres:17-alpine`, internal network only, no public port | `/api/health` → `db:"ok"` |
| Internal DB hostname | `rabwcgrcztxzngrrxaienfsm` (Coolify-generated, internal network only) | Coolify → `ambit-db` → internal URL |
| Coolify version | v4.3.12 | Coolify sidebar |
| Scheduled-task cron clock | **UTC** — `30 1 * * *` = 21:30 EDT / 20:30 EST the evening before | `tz-probe` task running `date`, 08-30-26: `Sun Aug 30 18:08:03 UTC 2026` |
| Backup on-disk path | _(TODO — does not exist until the first `0 4 * * *` run)_ | Coolify → `ambit-db` → Backups |

**The container name carries a per-deploy numeric suffix**, so anything that has to find this
container (T6's invite, T7's ingest) filters on `publish=3000` or on the resource UUID — never on
the name. Inherited from ambit-archive's A.6 trap #4; it held here.

## T3 — what the first deploy proved

Everything below is from the Mac against `192.168.1.202:3000`, before the tunnel existed. That
separation is deliberate: it makes "the app is broken" and "the tunnel can't reach it" different
questions in T4, and `/api/health` (D10) is what makes them separable at all.

```
/api/health   200  {"ok":true,"db":"ok","imageCache":"ok","commit":"4a4c428b999c…"}
/             200
```

- **`commit` echoes the deployed SHA**, so "did my redeploy land?" is answerable without a shell on
  the host. This is the payoff of T1's `SOURCE_COMMIT` work.
- **`imageCache:"ok"`** is the volume proof — the directory exists at the resolved
  `IMAGE_CACHE_DIR` and is writable *by the container's user*. Had the volume not mounted, the app
  would still have served pages perfectly while quietly re-fetching the entire corpus from the
  museums; nothing else in the system would have said so. This is precisely why the health route
  checks two things rather than one.
- **`Strict-Transport-Security: max-age=31536000; includeSubDomains` is present** — and it is the
  only evidence that Coolify's **Build Variable** tick on `BETTER_AUTH_URL` took effect.
  `next.config.js` decides HSTS inside `headers()`, which Next evaluates **at build time**, so a
  build that didn't know the real origin would have baked the wrong answer in permanently and no
  runtime variable could have undone it. The Dockerfile's `test -n "$BETTER_AUTH_URL"` guard
  catches a *missing* value loudly; a value with the wrong scheme would have failed silently. It
  didn't.
- **Two requests, two different CSP nonces** (`nonce-ZGMxZmQz…`, `nonce-ZTkyODY0…`) — `src/proxy.ts`
  is minting per request in production, not reusing a build-time constant.
- **Reaching it from the Mac at all is the Ports Mappings proof.** A.6 trap #1 produces a container
  Docker calls healthy and nothing off-host can connect to; through a tunnel that reads as a
  pre-deploy 502 and sends you looking in the wrong place. Setting both *Ports Exposes* `3000` and
  *Ports Mappings* `3000:3000` avoided it.

### Two corrections to the plan, found while executing

1. **The GitHub source.** The plan said to use whatever source the archive uses, and the archive
   uses a Deploy Key — because `ambit-archive` is a *private* repo. `Ibenthinkin/Ambit` is
   **public**, so Coolify's plain **Public Repository** source is correct and neither private path
   is needed. (Repo name is `Ambit`, capital A.) If Ambit is ever made private this breaks at the
   next clone, and the archive's Deploy Key flow is the migration.
2. **Auto Deploy is off, and has to be.** Only Coolify's *GitHub App* source registers a push
   webhook by itself; Public Repository and Deploy Key both need a webhook configured by hand in
   GitHub — and GitHub cannot reach this Coolify, which listens on `192.168.1.202:8000`, LAN-only.
   Putting a Coolify login on the public internet is not a trade 8.1 makes. **A deploy is the
   Deploy button in the UI**, which is what the archive does in practice anyway. Whether to expose
   Coolify through the tunnel is 8.2's question.

Both are written back into `docs/PHASE8_PLAN_8.1.md` at T3.4 rather than left only here, so a cold
re-read of the plan doesn't repeat them.

## The archive key now lives in three places (decided, not drifted)

T3 reused the standing `ARCHIVE_API_KEY` rather than minting a new one, so it now exists in the
Mac's `.env`, the archive's Coolify env, and Ambit's Coolify env. This is a **conscious override of
the 08-24-26 trip-wire**, which read: *rotate if the archive ever gets a public route or the key is
reused.* The first clause is still not met — the archive stays LAN-only and `ARCHIVE_URL` is a
private address that never leaves VM 202 — and the key guards a read-only `/search` on a host with
no public route, which is what made leaving it acceptable in the first place.

What the third copy actually changes is the rotation cost: **rotating fewer than all three
recreates the Immich failure exactly** (two copies drifting to two different dead values, diagnosed
only by comparing sha256 fingerprints). Recorded here and, at T9.4, in the Ambit-Admin vault log,
because nothing in either repo can see this coupling.

## T4 — the tunnel, and the test that belonged in the plan rather than its fallback

Ambit is the **first ingress rule on the `homelab` tunnel that points at an IP** rather than a
sibling container name — the four that preceded it are all `service: http://<container>:<port>` on
`mediastack_default` (`audiobookshelf`, `immich-server`, `jellyseerr`, `nextcloud`). The plan cited
a `glance` precedent for an off-host target, but that precedent is Caddy's, not this tunnel's.

So the question "can cloudflared actually reach `192.168.1.202:3000`?" was genuinely open, and the
plan only asked it in T4's *fallback*, after a 502. It is much cheaper before the change:

```
docker run --rm --network mediastack_default curlimages/curl:latest \
  -s http://192.168.1.202:3000/api/health
→ {"ok":true,"db":"ok","imageCache":"ok","commit":"4a4c428b999c…"}
```

Run **first**, that one command turns a possible post-restart 502 from an open-ended hunt into a
single known cause (an ingress typo), because LAN reachability is already excluded. Worth promoting
into the pre-flight of any future ingress addition.

**Two steps were replaced with simpler ones.** `cloudflared`'s own config directory is mounted at
`/etc/cloudflared` in the running container, so validation is `docker exec cloudflared cloudflared
tunnel ingress validate` — no `docker run`, no volume flags, 59 characters. And the DNS record was
created in the Cloudflare dashboard as a proxied `CNAME ambit →
63b87310-f166-4174-9d03-55027c77264f.cfargotunnel.com`, which is byte-identical to what `tunnel
route dns homelab ambit.benreilly.io` would have written and avoids a 120-character command. The
tunnel UUID is readable from `credentials-file` in `config.yml`.

**Verified through the edge** (4.4): proxied DNS (`172.67.222.39` / `104.21.62.89`), `cf-ray`
present (EWR), Google Trust Services cert for `CN=benreilly.io`, `/api/health` 200, and all seven of
7.2's security headers arriving unmodified — HSTS included. Two requests returned two different CSP
nonces and `cf-cache-status: DYNAMIC`, which is D13 confirmed from both sides: the edge is not
caching HTML. Cloudflare added `server`, `cf-ray` and `cf-cache-status`, and stripped nothing.

### A note on the 🖐️ convention

T4 was marked 🖐️ Ben on the assumption the agent has no shell on VM 200. That assumption was wrong
— the Mac's key authenticates to `reef@192.168.1.200` fine, and every read-only step (reading
`config.yml`, inspecting mounts and networks, the reachability probe above) was done by the agent.
What actually gated the work was different and narrower: **writes to remote infrastructure config
are blocked**, so the `config.yml` edit, the restart, and the dashboard steps stayed Ben's. The
convention is still right; the reason attached to it was not. Future plans should mark steps 🖐️ for
*mutation* and *dashboards*, not for "the agent can't get there".

## Two ways a Coolify Postgres resource looks right and is wrong

Both were hit on 08-29-26, back to back, and neither is visible from the Coolify UI or from the
app. They belong together because the tell for both is in the *database* container, never in the
application's logs.

### 1. Coolify's image field defaulted to Postgres 18, not the 17 the plan specified

D4 pinned `postgres:17-alpine` for one reason — it is what dev (`docker-compose.yml:12`) and CI
(`.github/workflows/ci.yml:66`) run, so the boot path CI proves green is the boot path production
executes. The resource came up on **18.6** instead. Nothing failed: migrations applied, `/api/health`
was green, and the app was demonstrably working.

That is exactly what made it worth fixing immediately rather than later. The invariant was broken
silently, and the cost of restoring it scales with the corpus: with **0 items in the table** it was a
ten-minute recreate, and after T7's first ingest it would have been a major-version `pg_dump`/restore
of a corpus that takes two hours to build. Found while checking why the feed was empty — the feed
being empty was correct (D3), the version underneath it was not.

**Set the image field explicitly when creating the resource, and verify after:**
`docker exec <pg> psql -U postgres -tAc "select version()"`.

### 2. `POSTGRES_USER` / `POSTGRES_DB` are ignored after the first start

Recreating the database produced a cluster with `POSTGRES_DB=ambit` and `POSTGRES_USER=ambit` in the
container's environment — and only the `postgres` role and `postgres` database in the cluster.
Postgres's entrypoint honours those variables **only when it initialises an empty data directory**.
The resource had been started once before those fields were filled in, so `initdb` ran with defaults
and every boot since has ignored them. The UI kept displaying the intended values; the container kept
carrying them; nothing anywhere reported a conflict.

**The symptoms pointed at the two innocent parties.** The app's `CMD` is
`db:migrate && db:seed && next start`, so a database it cannot authenticate against fails at the
first `&&` — and Coolify *removes* the container of a failed deploy. What was actually visible:

- `502` from Cloudflare (reads as a tunnel problem)
- the application container **absent** from `docker ps -a` (reads as a Coolify problem)
- the Postgres container reporting `Up 13 minutes` (reads as fine)

The database was the only thing broken, and it was the only thing that looked healthy in
`docker ps`. `docker inspect <pg> --format "{{json .State.Health}}"` had the answer the whole time —
`FailingStreak: 55` and `FATAL: role "ambit" does not exist`, repeating every 15 seconds for fourteen
minutes before anyone looked.

**Diagnostic order for any "the app is 502 and the container is gone" on this host:**

```
docker ps -a --format "{{.Names}}\t{{.Status}}"          # absent vs. exited
docker inspect <pg> --format "{{json .State.Health}}"    # unhealthy, with the reason
docker logs --tail 25 <pg>                               # the underlying error
```

**The fix, without either party seeing the password** — the container already holds it, so it can
quote itself. Inside the Postgres container (`docker exec -it <pg> sh`):

```sh
psql -U postgres -c "CREATE ROLE ambit LOGIN PASSWORD '$POSTGRES_PASSWORD'"
psql -U postgres -c "CREATE DATABASE ambit OWNER ambit"
```

Shell expansion, not psql's `:'var'` interpolation — psql does **not** interpolate variables in a
`-c` string (only in stdin or a file), which is a real error message on the way here. Using
`$POSTGRES_PASSWORD` also guarantees the role's password matches `DATABASE_URL`, since both come
from the value Coolify generated; typing it by hand risks an authentication failure that presents as
the same 502 with a different cause.

**A recreated database is a new database.** The `user` and `invite` rows do not survive it —
`db:migrate` and `db:seed` restore the schema and the 16 topics automatically, but the account has to
be re-invited (`bun run invite <email>`, idempotent) and re-registered.

## T5 + T6 — mail, cookies, and the spoof test that had to be rewritten to prove anything

**T4.5 and 4.6 were done without being ticked**, and both were verifiable from the Mac after the
fact: `/api/img/<any-id>` answers `cf-cache-status: BYPASS` while `/api/health` answers `DYNAMIC`.
Cloudflare only reports BYPASS/MISS/HIT on a path a Cache Rule has made eligible, so the rule
exists and matches — BYPASS rather than MISS only because the empty corpus 404s with `no-store`.
The `HIT` half waits for T7. And a bare-`curl` UA gets `200` on `/` with no `cf-mitigated`, so Bot
Fight Mode is not challenging non-browser clients. Worth remembering: **a dashboard step leaves a
fingerprint in the response headers**; check the headers before re-doing the step.

**Resend, two corrections and one trap.** The plan's DNS list was written from the older Resend
shape — one DKIM TXT at `resend._domainkey` — and Resend's current docs describe three DKIM
CNAMEs (`<hash>._domainkey → <hash>.dkim.amazonses.com`) plus a tracking CNAME. This account got
the *older* shape, so the plan's text was right by luck; the instruction that actually matters is
Resend's own — paste what the dashboard shows. The trap is Cloudflare's: the zone is
`benreilly.io`, so every name Resend shows relative to `ambit.benreilly.io` has to be typed with
`.ambit` appended (`send.ambit`, `resend._domainkey.ambit`), or the record lands on the bare zone
and verification never completes. Checked with `dig @1.1.1.1` — direct to Cloudflare, so Pi-hole's
cache cannot show a stale answer — all three records resolved on the first try and nothing sat on
the under-qualified names. The tracking CNAME was skipped on purpose: a password-reset link
rewritten through a click-tracking redirect is not something Ambit sends.

The key went into Coolify as a runtime variable and the two copies were compared by
**sha256 prefix, never value** (`1568c93682aa` on both sides — the Global Constraints rule, and the
only representation of the key that appears anywhere outside Coolify and the password manager).
Ben used *Redeploy* rather than *Restart*, which showed as `/api/health` reporting `b661442` instead
of `c99bdc1`; harmless (a docs-only delta), and `imageCache: ok` after it is a free preview of
T7.5's volume-survival check. The proof was the real one: forgot-password from the phone, the mail
from the verified domain, the link on `ambit.benreilly.io/reset-password`, the reset applied,
Resend's log showing *delivered*.

**The cookie line, observed:** `__Secure-better-auth.session_token; HttpOnly; Secure; SameSite=Lax;
Path=/`, host-only. Nothing was configured for `Secure` or the `__Secure-` prefix — both follow from
`BETTER_AUTH_URL` being https. Recorded in SPEC §11.

**Per-client rate limiting** behaved exactly as the auth config says: 20 × `401` then `429` on
requests 21–22 of a 22-request loop against `/api/auth/sign-in/email` (`window: 10, max: 20`).

**The spoof test in the plan could not have failed, so it was rewritten.** As written, 6.5 said:
wait 10 s for the bucket to clear, rerun the loop with `x-forwarded-for: 1.2.3.4`, expect `429` at
the 21st. But that is also exactly what a *fresh* bucket keyed on `1.2.3.4` would produce — the
test passes whether the spoof is honoured or ignored. The discriminating version: exhaust the real
bucket to `429`, then **immediately** send with the spoofed header. A honoured spoof gets twenty
fresh `401`s; an ignored one is `429` from the first request. Result: `429 429 429 429` for
`1.2.3.4` and `429 429` for a chained `9.9.9.9, 8.8.8.8`. That is D11 proven behaviourally — the
edge's appended hop wins for Ambit's own limiter, and Better Auth is keying on `cf-connecting-ip`.
The lesson generalises: **a rate-limit spoof test must run inside an already-exhausted window**,
or it measures nothing.

**Not done in T6:** 6.2's phone/cellular sign-up and PWA install. The feed is still empty until
T7, and an install test against an empty feed proves less than one against a full one, so it folds
into T7's tail.

## T7.1 — the smoke test paid for itself twice before the first real ingest

Two dry runs from inside the container, no writes, and the archive half was clean on the first
try — 29 searches, 61 items offered, zero errors, so `ARCHIVE_API_KEY` and `http://192.168.1.202:3001`
(the two values the plan flagged as most likely wrong) are right. The two that *were* wrong were
not on the list.

**`SMITHSONIAN_API_KEY` had a stray leading `=`.** Every Smithsonian call was `HTTP 403`, and the
diagnosis was in the failing URL: `api_key=%3D5Wid…`. The adapter runs the key through
`encodeURIComponent`, and `%3D` is `=` — so the value Coolify holds literally begins with one, the
kind of thing that happens when a `KEY=value` line is pasted and trimmed one character short. Not a
bad key, not a revoked key; one character. Worth adding to the family of "the secret is right and
still 401s/403s" cases in CLAUDE.md: **look at the encoded form of the value in the failing
request** before assuming the credential itself is the problem.

**`OPENROUTER_API_KEY` was a dead key.** Fifty-eight curator calls, fifty-eight
`401 {"message":"User not found."}` — the *account*-level signature CLAUDE.md already records from
08-22 (a malformed key reads `"No auth credentials found"` instead). Same account, same drift:
the password manager still held the old value, and the plan's "may be the Mac's — it is the same
account" was true of the account and false of the key. The live one is the Mac's `.env` copy.

**A leak, recorded for 8.2.** The Smithsonian adapter's error message prints the full request URL,
key included, into whatever captures stdout — here Coolify's task output, and then a chat
transcript. `fetchJson`'s error path should redact `api_key` (and any `?key=` shape) before
throwing, and the Smithsonian key gets rotated regardless (a free api.data.gov key; the form
takes thirty seconds).

Two numbers for the record: the "10-second" smoke took **534 s**, because 34 failing Smithsonian
calls each paid their retry backoff — a failing source makes the *whole* run slow, not just its
column, which is worth knowing before reading a long first ingest as "healthy but big". And
`poetrydb searched 0` is expected: the source is parked with zero topic cells (`topics.ts:41`).

## T7 — the first server-side ingest

**7.1 smoke, two rounds.** The first round (08-29-26 evening) is what found both bad env values —
a stray leading `=` on `SMITHSONIAN_API_KEY` (every call 403, and the URL showed `api_key=%3D…`,
which is `encodeURIComponent("=")` — the tell that the character was *in the value*, not in the
adapter), and a dead `OPENROUTER_API_KEY` (`401 "User not found."`, the account-level signature).
That run took 534 s because 34 failing Smithsonian calls each paid the retry backoff. Second round,
08-30-26, after Ben fixed both in Coolify and restarted (fingerprints from inside the container:
Smithsonian key first byte `5`, 40 bytes; OpenRouter `auth/key` → 200):

```
smithsonian  --quota 3 --skip-llm --dry-run   34 searched · 54 offered · 0 errors · 72.7 s
archive      --quota 1 --dry-run              29 searched · 29 offered · 0 errors · 7.0 s · 29 live curator calls, no 401
```

The archive line is the OpenRouter proof — `--skip-llm` was deliberately left off so the curator
actually spent 29 calls from inside the container. The Smithsonian line's 11 structural-floor drops
(7 bare-title, 4 thin-summary) are the normal quality floor, not errors.

**Side finding carried to 8.2:** the Smithsonian adapter's HTTP error prints the full request URL
*with the key* into task output. Redact `api_key` in `fetchJson` errors and rotate the key.

**7.2 — the cron clock is UTC.** A one-minute `tz-probe` task running `date` printed
`Sun Aug 30 18:08:03 UTC 2026`, so `ingest` at `30 1 * * *` runs at 21:30 EDT the previous evening
(20:30 once DST ends). Recorded in SPEC §13. Probe deleted after one read.

**While the first ingest ran (08-30-26)** — two code fixes that could not touch the container
(a Redeploy or Restart kills the `docker exec` the task is running in) but had to land before
the nightly run matters, merged to `main` and left undeployed until 7.5's no-code-change
redeploy has had its turn:

- **`fetchJson` errors no longer carry the key.** `redactUrl()` in `http.ts` replaces the value
  of any `api_key`/`key`/`token`/`secret`-named query parameter with `[redacted]` in both error
  paths (the retried failure and the `noRetryOn` refusal). The 08-29 smoke had printed the
  Smithsonian key into Coolify's task output 34 times; the key still has to be rotated (7.4b).
- **The 7.2 markup finding is fixed.** `smithsonian`, `met`, `wellcome` and `nasa-images` now run
  `title` and `summary` through `htmlToText()`, and `stripHtml()` learned the difference between an
  inline tag (`<i>`, `<em>` — removed without a trace, so `(<i>Tsuba</i>)` is `(Tsuba)`) and a
  block one (`<br>`, `<p>` — still a space). `bun run renormalize` is the repair for rows that
  arrived before the fix: on the Mac it found exactly the 41 rows 7.2 counted and rewrote them;
  production will have its own count from the first ingest, since that ran the old adapters.
  The invariant test's four-source exclusion is gone. 841 tests green.

