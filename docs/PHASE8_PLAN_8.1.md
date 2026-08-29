# Phase 8.1 — Coolify deployment: detailed execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in **pairing mode** — this phase cannot run unattended. Steps use checkbox (`- [ ]`) syntax for tracking. Companion to `docs/BUILD_PLAN.md` Phase 8.1 — same format as `PHASE7_PLAN_7.3.md`, with the 🖐️ **Ben** convention from ambit-archive's `PHASE_A6_PLAN.md`: a step marked 🖐️ needs Ben's hands (a Coolify/Cloudflare/Resend UI, a shell on a homelab host, or a secret the agent must never see). The agent prepares the exact values and commands, Ben runs them, the agent verifies from the Mac. Every task has a checkable done-bar and a written fallback.

**Goal:** Ambit runs in production on the homelab — `https://ambit.benreilly.io`, a second Coolify tenant on VM 202 beside the archive, Postgres 17 as a Coolify database with scheduled backups, the image cache on a persistent volume, nightly ingest as a Coolify scheduled task, password-reset mail through Resend — and the four items carried in from 7.2/7.3 are confirmed on the deployed origin (volume mounted, full `img:warm` run, per-client rate limiting behind the real proxy, `Secure` cookie).

**Architecture:** one container built from a new `Dockerfile` (Bun 1.4.0, full `node_modules`, `next build`; boot = `db:migrate && db:seed && next start`) published on VM 202's host port 3000; the existing `homelab` Cloudflare Tunnel on VM 200 gets one ingress rule → `http://192.168.1.202:3000`; TLS terminates at Cloudflare's edge, so the app is told its own origin via `BETTER_AUTH_URL=https://ambit.benreilly.io` (runtime *and* build time — HSTS is baked at build). No Caddy LAN name, no Traefik in the request path, no Cloudflare Access (the app has its own auth + invite gate). Single instance, always — both rate limiters and the image cache's in-flight map assume it.

**Tech Stack:** Next.js 16.2 / Bun 1.4.0 (`oven/bun:1.4.0-debian`) / Drizzle 0.45 + `drizzle-kit` migrate / Better Auth 1.6.25 / Postgres 17 / `sharp` 0.34.5 (linux-x64 glibc prebuilt) / Coolify v4.3.x on VM 202 / `cloudflared` on VM 200 / Resend.

**Status: ready to execute cold — attended.** Everything below was verified 08-28-26 against the repo at `main` = `8bb9237`, ambit-archive's `docs/PHASE_A6_PLAN.md` + `PHASE_A6_WALKTHROUGH.md` (the same Coolify host, deployed 08-23), the vault's `homelab-reference.md` and `runbooks/cloudflared-tunnel.md`, and the current Coolify / Next.js / Better Auth / Cloudflare / Resend / Bun docs. Expect one evening for T1–T6 and a second sitting the next day for T7–T9 (the first full ingest and the image warm each take an hour or more, and the done-bar needs one *unattended* cron run, which means sleeping on it).

## Global Constraints

- **Secrets never touch the repo, the plan, the walkthrough, the log, or a transcript.** Ben mints them (`openssl rand -base64 32` for the auth secret; keys from the Resend/OpenRouter dashboards) and pastes them into Coolify himself. When the agent must confirm two copies agree, compare `sha256` fingerprints, never values (A.6 lesson: two dead keys had drifted to two *different* dead values). Every secret exists in **≥2 places** — Coolify and Ben's password manager — before the phase closes.
- **The Mac's `.env` is not touched** and `BETTER_AUTH_URL` there stays `http://localhost:3000`. Production gets a *new* `BETTER_AUTH_SECRET`, never the Mac's.
- **Never `db:push` in production.** The journal in `drizzle/` applies via `drizzle-kit migrate` — CI has proven it on an empty database every run since 7.1.
- **Do not touch the archive application in Coolify** (`archive.home.benreilly.io`, VM 202 port 3001) except to *read* its settings as a reference. Its weekly Sunday task is red on purpose (Ambit-Admin log); leave it.
- **`traverse` (192.168.1.40) is not touched.** VM 200 gets one ingress block in `cloudflared`'s `config.yml` and a container restart; nothing else.
- **Long single-line commands pasted into a terminal split at the wrap and fail silently** (A.6's costliest lesson). Every host command below is short, or is written to a file and run from it. After any `crontab`/config edit, print it back and read it.
- **No test is weakened to pass.** A red check in T2's local boot proof is a finding to diagnose (two attempts), then a fallback.
- **One instance.** Never set replicas, never publish a second container against the same volume.
- **Comment generously** in the two new files (`Dockerfile`, `/api/health`) — this repo teaches; the archive's `Dockerfile` is the model for tone.

## Before you start

```bash
cd ~/Dev/ambit
git status                                  # clean, on main
git log --oneline -3                        # 8bb9237 or later
gh run list --branch main --limit 3         # both CI jobs green on the last push
bun --version                               # 1.4.0 — the tag the Dockerfile pins
docker info >/dev/null && echo docker-ok    # T2's local image proof needs Docker Desktop
docker compose up -d                        # dev Postgres + Mailpit, for T2's proof
lsof -ti:3000 | xargs kill 2>/dev/null      # port 3000 must be free (CLAUDE.md)
git checkout -b feat/8.1-deploy
```

**Decisions locked (do not relitigate — settled with Ben 08-28-26):**

- **D1 — Homelab, not a VPS.** VM 202 (`192.168.1.202`, Coolify, the archive's host) gets Ambit as its second tenant. Public reach is the *existing* `homelab` Cloudflare Tunnel on VM 200 — one new ingress rule, exactly the off-host precedent Caddy already sets for `glance` (`192.168.1.101`). $0/mo; ingest reaches the archive over the LAN; VM 202 is already in the nightly `vzdump` to the NAS. Accepted trade: reader traffic depends on the home WAN.
- **D2 — Hostname `ambit.benreilly.io`.** One origin. No `ambit.home.benreilly.io` Caddy entry: Better Auth trusts only `baseURL` in production (`devTrustedOrigins()` returns `[]`), so a second name would 403 every sign-in. **No Cloudflare Access** in front — the app's own auth + invite gate is the access control, and a second login screen would break the PWA install flow for friends.
- **D3 — Fresh ingest on the server.** Nothing is copied from the Mac's database. The first `bun run ingest` is run attended (T7), then the nightly task takes over. The feed is thin on day one and fills over the first week; that is the accepted cost of clean provenance.
- **D4 — Postgres 17 as a Coolify database resource**, reached over Coolify's internal Docker network (never a published port). Backups = Coolify's scheduled `pg_dump --format=custom` to local disk (which the VM-level `vzdump` then carries to the NAS) — **and a restore drill is part of the done-bar**, because an untested backup is a hope.
- **D5 — The image mirrors CI, not `output: "standalone"`.** Full `bun install --frozen-lockfile` (dev deps included: `drizzle-kit` runs the boot-time migrate and is a devDependency), `bun run build`, `CMD bun run db:migrate && bun run db:seed && bun run --bun next start`. That is byte-for-byte the path CI's `e2e` job has proven since 7.1 (`db:migrate` → `db:seed` → `build` → `next start`). Standalone output under Bun is undocumented by Vercel and would need the `scripts/` + `drizzle-kit` story solved separately; it is a 9.x optimisation, not a first-deploy risk.
- **D6 — One volume at `/app/.cache`**, with `IMAGE_CACHE_DIR=/app/.cache/img` set explicitly (absolute — the default resolves against `cwd`). The same volume carries `.cache/curation`, which `curator.ts:235` hardcodes to `cwd/.cache/curation`, so the ingest-time LLM cache survives redeploys too.
- **D7 — Ingest is a Coolify scheduled task in the app container**, `30 1 * * *` — done before the archive's 03:00 chain and its 04:00 restart (Ambit's ingest reads the archive's `/search`). Coolify runs it as `docker exec`, so the image must ship `scripts/` and `src/` — which D5 guarantees.
- **D8 — Host-published port (`Ports Mappings 3000:3000`), Domains field empty.** cloudflared reaches the container through the host, never through Coolify's Traefik, exactly as Caddy reaches the archive. Consequence, accepted: no rolling updates — a deploy is ~2–4 minutes of 502 while the image builds and the new container boots. Setting only *Ports Exposes* produces a healthy container that nothing can reach (A.6 trap #1).
- **D9 — Resend sends from `ambit.benreilly.io`.** Its DNS records live at `send.ambit.benreilly.io` (MX + SPF TXT) and `resend._domainkey.ambit.benreilly.io` (DKIM TXT), which do **not** collide with the tunnel's CNAME at the bare name (a CNAME forbids sibling records *on the same name*, not on subdomains). The from-address becomes an env var, `MAIL_FROM`, defaulting to `Ambit <noreply@ambit.benreilly.io>`; the API key is a **Sending-access** key restricted to that domain.
- **D10 — A real `/api/health`** (DB `select 1` + image-cache dir writable), used by a Dockerfile `HEALTHCHECK` (which Coolify honours over its UI check) and by every verification step below. Today the only readiness signal is "does `/` return 200", which is a full page render.
- **D11 — Client IP in production comes from `cf-connecting-ip`.** Cloudflare's edge *appends* to any `X-Forwarded-For` the client sends, so behind the tunnel XFF is multi-valued whenever an attacker wants it to be — and Better Auth ≥ 1.6.21 treats a multi-hop chain as *no IP*. `cf-connecting-ip` is set by the edge unconditionally. Ambit's own `trustedClientIp()` takes the **last** XFF hop, which is the one Cloudflare appended, so it is already correct; Better Auth gets `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` under `NODE_ENV=production` only (CI and dev have no Cloudflare). T6 proves both with two real clients. `trustedProxies` stays unset.
- **D12 — HSTS without `preload`** (the 7.2 note stands: preload is an irreversible list submission; not for a beta).
- **D13 — No Cloudflare edge caching of pages.** One Cache Rule for `/api/img/*` only (the route already sends `public, max-age=31536000, immutable`), so repeat image loads never leave Cloudflare and the home uplink carries each image roughly once. Everything else stays dynamic.

**Verified facts (08-28-26) the plan is built on:**

| Fact | Where verified | Consequence |
|---|---|---|
| No `Dockerfile`, `.dockerignore`, health route, backup script, or cron config exists in the repo | repo inventory | T1–T2 create them; nothing to migrate from |
| `next.config.js:50` evaluates `env.BETTER_AUTH_URL.startsWith("https://")` inside `headers()`, which Next runs **at build time**; `SKIP_ENV_VALIDATION` leaves `env.BETTER_AUTH_URL` undefined and the build throws | `next.config.js`, `src/env.js:99` | The Dockerfile takes `BETTER_AUTH_URL` as a **build ARG** (real value) plus placeholder ARGs for `DATABASE_URL`/`BETTER_AUTH_SECRET` (exactly as CI's `check` job does). In Coolify, `BETTER_AUTH_URL` must have **Build Variable** ticked |
| `drizzle-kit` is a devDependency; `db:migrate` = `drizzle-kit migrate` reading `drizzle.config.ts` → `~/env` | `package.json`, `drizzle.config.ts` | D5: no `--production` install. `tsconfig.json` must be in the image (the `~/*` alias is resolved from it at runtime — the archive learned this) |
| CI's `e2e` job = `db:migrate` → `db:seed` → `build` → `next start`, green on every push since 7.1 | `.github/workflows/ci.yml:107-120` | The container boot sequence is already proven end to end |
| `db:seed` is a config load — upsert-with-update, safe on every boot; **required** before any ingest (`item.topic_id` NOT NULL FK) | `scripts/seed-topics.ts:1-12` | It runs in `CMD`, every boot |
| Sign-up is refused for any email without an `invite` row; `bun run invite <email>` creates one idempotently | `src/lib/auth.ts:72-87`, `scripts/invite.ts` | T6 runs it via `docker exec` before Ben's first sign-up |
| `ResendMailer` hardcodes `from: "Ambit <noreply@ambit.app>"`; a missing `RESEND_API_KEY` under `NODE_ENV=production` silently falls back to Mailpit on `localhost:1025` and the un-awaited send vanishes | `src/server/services/mailer.ts:56,74-80`, `src/lib/auth.ts:52` | T1 adds `MAIL_FROM`; T5's reset-mail test is the only proof mail works — there is no error path to watch |
| `IMAGE_CACHE_DIR` resolves relative paths against `process.cwd()`; no eviction; 62 KB/file, ~0.67 GB projected; `curator.ts:235` hardcodes `cwd/.cache/curation` | `image-cache.ts:83-86`, SPEC §8.1a, `curator.ts` | D6 |
| `image-cache.ts:263` in-flight map and both `RateLimiter`s are process-local — "one app instance is the 8.1 deploy shape" | `image-cache.ts:260-262`, `rate-limit.ts:5-9` | Never scale to 2 |
| Better Auth 1.6.25 (installed) exposes `advanced.ipAddress.ipAddressHeaders` and `trustedProxies`; `useSecureCookies` defaults to "secure in production", derived from `baseURL`'s scheme, not the socket | `node_modules/better-auth/dist` grep; better-auth.com/docs/reference/options | D11; `Secure` + `__Secure-` prefix follow from `BETTER_AUTH_URL=https://…` alone |
| Cloudflare sets `CF-Connecting-IP` (single, edge-set) and **appends** to `X-Forwarded-For`; `X-Forwarded-Proto: https`; free-plan 100 MB request cap; dynamic paths are **not** edge-cached without a Cache Rule | developers.cloudflare.com/fundamentals/reference/http-headers | D11, D13 |
| A locally-managed tunnel's ingress `service:` is any URL — off-host LAN targets work (`http://192.168.1.202:3000`) | cloudflared config-file docs; the vault runbook's "Adding more services later" (3 steps) | T4 is: edit `config.yml` on VM 200, `tunnel route dns`, `docker compose restart cloudflared` |
| `cloudflared`'s `config.yml` lives **only on VM 200** at `/opt/docker/mediastack/cloudflared/config.yml` (not tracked in the vault; the runbook is) | `find` over the vault | T4 edits it on the host and records the block in the runbook table |
| Coolify: Dockerfile `HEALTHCHECK` takes precedence over the UI check; the UI check needs `curl`/`wget` in the image; volumes get the resource UUID prefixed to their name; scheduled tasks are `docker exec` into the app container with output captured per run (occasionally flaky — GitHub #6566); `SOURCE_COMMIT` is a predefined **runtime** var, excluded from builds by default | coolify.io/docs (health-checks, persistent-storage, cron-syntax, environment-variables) | T1's HEALTHCHECK uses `bun -e fetch(...)` (no curl in `oven/bun`); T8 verifies task output once by hand; T1's serwist revision prefers `SOURCE_COMMIT` |
| Coolify Postgres backups: `pg_dump --format=custom --no-acl --no-owner`, local and/or S3; retention by count/days/MB; the on-disk path is shown per run in the Backup tab | coolify.io/docs/databases/backups | T8's restore drill uses `pg_restore --clean` from that file |
| `oven/bun:1.4.0-debian` exists; `sharp` 0.34.5 ships a linux-x64 glibc ≥ 2.28 prebuilt | Docker Hub tags API; sharp.pixelplumbing.com/install | D5's base image; no toolchain in the image |
| A.6's traps on this exact host: two port fields (Exposes vs Mappings); Domains must stay empty; volume names are `<uuid>-<name>`; VM 202 resolves `*.home.benreilly.io` only since the 08-23 netplan fix; `crontab -e` paste-wrap | `ambit-archive/docs/PHASE_A6_WALKTHROUGH.md` §"traps" | Repeated inline where each bites |
| A full `bun run ingest` at the default quota took ~64 min in 3.4 (Met-dominated); there are more sources now | `docs/PHASE3_WALKTHROUGH_3.4.md:119` | T7 budgets 1.5–2 h and runs it via a Coolify task, not a foreground shell |
| `src/trpc/react.tsx:76-77` falls back to `http://localhost:${PORT ?? 3000}` server-side | file read | **Correct in the container** — the app *is* localhost:3000 inside it. No change |
| `src/app/serwist/[path]/route.ts:13-15` uses `spawnSync("git").stdout ?? randomUUID()` — in a container without `.git`, `stdout` is `""`, not `null`, so the revision is the empty string | file read | T1 fixes: `process.env.SOURCE_COMMIT || git || uuid` |

## Tasks

### T1 — Code: production readiness (agent; ~1 h)

Four small, independently testable changes. Commit as one.

- [x] **1.1 `GET /api/health`** — new `src/app/api/health/route.ts`. Runs `select 1` through `db`, and `access(IMAGE_CACHE_DIR, W_OK)` (create the dir if missing, as `image-cache.ts` does). Returns `200 {"ok":true,"db":"ok","imageCache":"ok","commit":<SOURCE_COMMIT|null>}` or `503` with the failing field named. **Never echoes env, headers, or paths.** `dynamic = "force-dynamic"`, `Cache-Control: no-store`. Add it to `src/proxy.ts`'s matcher exclusions is **not** needed (the CSP header on a JSON response is harmless; leave the matcher alone). Vitest: one DB-backed test in the existing self-skipping style (`src/app/api/health/route.test.ts`) asserting the 200 shape, plus a unit test that a bad cache dir yields 503. Playwright: one line in `e2e/security.spec.ts`'s header sweep so `/api/health` carries the static headers too.
- [x] **1.2 `MAIL_FROM`** — `src/env.js`: `MAIL_FROM: z.string().min(1).default("Ambit <noreply@ambit.benreilly.io>")` (+ `runtimeEnv`); `mailer.ts:56` reads it; `.env.example` documents it beside `RESEND_API_KEY` ("must be an address on the Resend-verified sending domain"). Extend the existing mailer test if one asserts the from-address; otherwise add one.
- [x] **1.3 Better Auth client IP behind Cloudflare (D11)** — `src/lib/auth.ts`: add
  ```ts
  advanced: {
    ipAddress: {
      // Production sits behind Cloudflare's edge, which sets this header unconditionally and
      // *appends* to any X-Forwarded-For the client sends — so XFF is multi-valued whenever an
      // attacker wants it to be, and Better Auth >= 1.6.21 then sees no IP at all. Dev and CI
      // have no Cloudflare in front; keep the x-forwarded-for default there. (8.1, D11.)
      ipAddressHeaders: env.NODE_ENV === "production" ? ["cf-connecting-ip"] : undefined,
    },
  },
  ```
  and rewrite the "Phase 8.1 action" paragraph of the D4 comment block (L165-168) to record what was done and point at T6's proof. Keep `trustedProxies` unset. Unit test in `src/lib/auth.test.ts` (or wherever the auth options are asserted): production config names `cf-connecting-ip`; non-production leaves it undefined. `rate-limit.ts`'s `trustedClientIp` stays as is (last hop) — add a one-line test case "Cloudflare-appended chain `spoofed, 203.0.113.9` → `203.0.113.9`" if not already present.
- [x] **1.4 Serwist precache revision** — `route.ts:13-15` becomes `process.env.SOURCE_COMMIT || spawnSync(...).stdout?.trim() || crypto.randomUUID()`, comment updated (Coolify sets `SOURCE_COMMIT` at runtime; a container has no `.git`; the empty-string case).
- [x] **1.5** `bun run check` green. **Commit:** `feat(deploy): /api/health, MAIL_FROM, Cloudflare client IP, SOURCE_COMMIT precache revision`.

*Done = `check` green; `curl -s localhost:3000/api/health` on the dev server returns the 200 shape; the from-address is no longer a literal.*

### T2 — Code: the container, proven locally (agent; ~1.5 h)

- [x] **2.1 `.dockerignore`** — `node_modules`, `.next`, `.cache`, `.playwright`, `.git`, `.github`, `.superpowers`, `.claude`, `**/.env`, `**/.env.*`, `!.env.example`, `docs`, `e2e`, `phase0`, `*.zip`, `OVERNIGHT_STATUS.md`, `log.md`, `tsconfig.tsbuildinfo`, `start-database.sh`. **`.env` exclusion is load-bearing** — a local `docker build` would otherwise bake the Mac's secrets into an image layer. (`phase0/` is not needed at runtime: the topic graph the feed reads is `src/server/config/topic-graph.json`.)
- [x] **2.2 `Dockerfile`** (root), commented in the archive's teaching style:
  ```dockerfile
  FROM oven/bun:1.4.0-debian AS base
  WORKDIR /app
  ENV NODE_ENV=production

  FROM base AS deps
  COPY package.json bun.lock ./
  # Full install, dev deps included: drizzle-kit (a devDependency) runs the boot-time migrate,
  # and the ingest cron execs scripts/ inside this same container. --production would break both.
  RUN bun install --frozen-lockfile

  FROM base AS build
  COPY --from=deps /app/node_modules ./node_modules
  COPY . .
  # next.config.js validates env at build time and bakes HSTS from BETTER_AUTH_URL's scheme
  # (7.2 D5), so the real public origin must be present at BUILD time. The other two only need
  # to satisfy Zod — nothing connects during a build (CI's check job does exactly this).
  ARG BETTER_AUTH_URL
  ARG DATABASE_URL=postgres://build:build@localhost:5432/build-placeholder
  ARG BETTER_AUTH_SECRET=build-placeholder-never-used-at-runtime
  RUN test -n "$BETTER_AUTH_URL" || (echo "BETTER_AUTH_URL build arg is required" && exit 1)
  RUN bun run build

  FROM base AS runtime
  COPY --from=deps /app/node_modules ./node_modules
  COPY --from=build /app/.next ./.next
  COPY --from=build /app/public ./public
  COPY package.json bun.lock tsconfig.json next.config.js postcss.config.js drizzle.config.ts ./
  COPY src ./src
  COPY scripts ./scripts
  COPY drizzle ./drizzle
  EXPOSE 3000
  HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  # Migrate, seed (a config upsert, safe every boot), then serve — chained with && so a failed
  # migration never leaves a server answering from a half-migrated database.
  CMD ["sh", "-c", "bun run db:migrate && bun run db:seed && bun run --bun next start"]
  ```
  Check whether `next build` needs `src/config/*.js` and `src/env.js` — they're under `src/`, so yes, copied. If the build stage complains about a file outside these `COPY`s, add it rather than widening to `COPY . .` in runtime.
- [x] **2.3 CI parity** — `.github/workflows/ci.yml`: both `setup-bun@v2` steps get `bun-version: 1.4.0` (CI currently floats to latest; the image is pinned).
- [x] **2.4 Local boot proof against an empty database** (Docker Desktop, arm64 image — fine for the proof; Coolify builds amd64 on the host):
  ```bash
  docker compose exec postgres psql -U ambit -c 'create database ambit_docker'
  docker build --build-arg BETTER_AUTH_URL=https://ambit.benreilly.io -t ambit:local .
  docker run --rm -d --name ambit-local -p 3100:3000 \
    -e DATABASE_URL=postgres://ambit:ambit@host.docker.internal:5432/ambit_docker \
    -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
    -e BETTER_AUTH_URL=https://ambit.benreilly.io \
    -e IMAGE_CACHE_DIR=/app/.cache/img -v ambit-local-cache:/app/.cache ambit:local
  sleep 25; docker logs ambit-local | tail -20     # migrate applied 4, seed 16 topics, Ready
  curl -s localhost:3100/api/health                 # 200, db ok, imageCache ok
  curl -sI localhost:3100/ | grep -i 'strict-transport\|x-frame\|content-security'   # HSTS present (baked from the https ARG)
  docker inspect --format '{{.State.Health.Status}}' ambit-local   # healthy
  docker exec ambit-local bun run ingest --quota 2 --skip-llm --source met   # scripts + src + drizzle resolve inside the image
  docker exec ambit-local ls .cache                  # img/ (and curation/ after the ingest)
  docker stop ambit-local; docker volume rm ambit-local-cache
  docker compose exec postgres psql -U ambit -c 'drop database ambit_docker'
  ```
  **Fallback (D5):** if `bun run --bun next start` misbehaves inside the container but `next start` under Node doesn't, the image installs Node 24 LTS in `runtime` and `CMD` uses `bun run start` without `--bun` for the server only — record it as a finding; do not switch to standalone in this phase. If `sharp` fails to load, the fallback is `oven/bun:1.4.0` (full Debian) — same glibc, more libs.
- [x] **2.5** `bun run check` green (Vitest sees no new tests here). **Commit:** `feat(deploy): Dockerfile + .dockerignore — CI's proven boot path in a container; pin Bun 1.4.0 in CI`.
- [x] **2.6** Push the branch; wait for both CI jobs green (the `e2e` job is the migrate/seed/boot rehearsal on amd64). Merge to `main` (`--no-ff`) and push — Coolify deploys from `main`.

*Done = a container built from `main` boots from an empty database to `healthy` on the Mac; HSTS is present because the build arg was https; `docker exec … bun run ingest` works inside the image.*

> **Execution state (08-28-26):** T1 and T2 are complete and merged to `main` (`59c76e5`), both CI jobs green. A pre-flight finding not in the plan: `main`'s `check` job had been red since the 7.3 merge (unit tests importing `~/env`, which validates at import time, in a job with no environment) — fixed in `4f1af6a` before T1. Two corrections to the plan's text: a feature-branch push triggers no CI (the workflow runs on `main` pushes and pull requests), so T2.6 needed PR #19; and `docker build` can fail with `DeadlineExceeded` loading the base image's metadata, which is a transient registry timeout, not a wrong tag. **T3 executed 08-29-26** — deployed, `/api/health` green on `192.168.1.202:3000`; two corrections to T3.4 are written into it (the repo is public, so Coolify's Public Repository source is right; and Auto Deploy has to be off because GitHub cannot reach a LAN-only Coolify). **Execution resumes at T4, which needs Ben.**

### T3 — 🖐️ Coolify: database + application on VM 202 (Ben with the agent; ~1 h)

Coolify UI: `http://192.168.1.202:8000`. The agent prepares every value below in the chat *except* secrets; Ben pastes.

- [x] **3.1 Secrets, minted by Ben, into the password manager first:** `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), a Resend **Sending-access** key (T5 — can be left blank until then), the OpenRouter key (may be the Mac's — it is the same account), `ARCHIVE_API_KEY` (from the archive's Coolify env), `SMITHSONIAN_API_KEY` (from the Mac `.env`).
- [x] **3.2 Database** — Project (the archive's project is fine) → *Add Resource → Database → PostgreSQL*, image `postgres:17-alpine` (matches dev and CI), name `ambit-db`, db `ambit`, user `ambit`. **Do not enable a public port.** Copy the **internal** connection URL (`postgres://ambit:<pw>@<container>:5432/ambit`). Start it.
- [x] **3.3 Backups** — `ambit-db` → *Backups → Add*: `0 4 * * *` (after the 01:30 ingest), destination local, "Backup All Databases" on, retention 14 days / 20 files / 2000 MB. Note the on-disk path Coolify shows after the first run (T8 needs it).
- [x] **3.4 Application** — *Add Resource → Application → **Public Repository***. **Correction to this plan (08-28-26, during execution):** the text below used to say "use the same source the archive uses". That was wrong by assumption — `ambit-archive` is a *private* repo and was set up with a Deploy Key, but **`Ibenthinkin/Ambit` is public** (`gh repo view` → `visibility: PUBLIC`), so none of Coolify's two private paths are needed. Repo `https://github.com/Ibenthinkin/Ambit` (**capital A**), branch `main`, **Build pack: Dockerfile**, Dockerfile location `/Dockerfile`, application name `ambit`. If the repo is ever made private, this breaks at the next clone and the archive's Deploy Key flow is the migration.
  - **Network:** *Ports Exposes* `3000`; *Ports Mappings* `3000:3000`; **Domains empty** (D8; A.6 trap #1 — with only Exposes set the container is healthy and unreachable, and through the tunnel that reads as a pre-deploy 502).
  - **Storage:** *Add → Volume*, name `ambit-cache`, destination `/app/.cache` (Coolify names it `<uuid>-ambit-cache`).
  - **Environment variables** (Runtime ✓ on all; **Build Variable ✓ only on `BETTER_AUTH_URL`**, ✗ on everything else so no secret becomes a build ARG):
    `DATABASE_URL` (3.2's internal URL) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL=https://ambit.benreilly.io` · `MAIL_FROM=Ambit <noreply@ambit.benreilly.io>` · `RESEND_API_KEY` (blank until T5 → **unset, not empty** — `emptyStringAsUndefined` makes those equal anyway) · `OPENROUTER_API_KEY` · `ARCHIVE_URL=http://192.168.1.202:3001` (the archive's host-published port on the same VM; no DNS, no TLS in the path) · `ARCHIVE_API_KEY` · `SMITHSONIAN_API_KEY` · `IMAGE_CACHE_DIR=/app/.cache/img`. Leave `FEED_DEBUG` unset (off in production).
  - **Advanced:** **Auto Deploy off** — and this is a second correction to the plan. Only Coolify's *GitHub App* source registers the push webhook itself; the Public Repository and Deploy Key sources both need a **manual** webhook configured in GitHub (`manual_webhook_secret_github` in Coolify's API), and GitHub cannot reach this Coolify — it listens on `192.168.1.202:8000`, LAN-only, and putting a Coolify login on the public internet is not a trade this phase makes. So a deploy is the **Deploy button in the UI**, which is what the archive does in practice too. Exposing Coolify through the tunnel is 8.2's question, not 8.1's. Leave the UI health check disabled — the Dockerfile's wins.
- [x] **3.5 Deploy.** Watch the build log (the `bun run build` step is the slow one, ~3–5 min on the NUC). Then from the Mac:
  ```bash
  curl -s http://192.168.1.202:3000/api/health          # 200, db ok, imageCache ok, commit = the main SHA
  curl -sI http://192.168.1.202:3000/ | head -5           # 200 (HSTS is present even over plain http — it was baked in)
  ```
  🖐️ On VM 202: `docker ps --filter publish=3000` shows `0.0.0.0:3000->3000/tcp`; `docker volume ls | grep ambit-cache`.
  **Fallback:** a healthy container with `curl: connection refused` on `:3000` = Ports Mappings missing → set it and **redeploy** (bindings are fixed at container creation; a restart won't do). A boot log ending in a `drizzle-kit` error = wrong `DATABASE_URL` (internal hostname) — fix the var, restart.
- [x] **3.6** Record in the walkthrough: Coolify version, the volume's full name, the backup path, the internal DB hostname (not the password).

*Done = `/api/health` is 200 on `192.168.1.202:3000` from the Mac; volume and port binding confirmed on the host.*

### T4 — 🖐️ Cloudflare: the tunnel and DNS (Ben; ~30 min)

Runbook: vault `05 Projects/homelab/runbooks/cloudflared-tunnel.md`, "Adding more services later". On VM 200 (`ssh reef@192.168.1.200`):

- [ ] **4.1** Append to `/opt/docker/mediastack/cloudflared/config.yml`'s `ingress:` list, **above** the trailing `http_status:404` catch-all:
  ```yaml
    - hostname: ambit.benreilly.io
      service: http://192.168.1.202:3000
  ```
  Validate before restarting: `docker run --rm -v /opt/docker/mediastack/cloudflared:/etc/cloudflared cloudflare/cloudflared:latest tunnel --config /etc/cloudflared/config.yml ingress validate`.
- [ ] **4.2** `docker run -it --rm -v /opt/docker/mediastack/cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel route dns homelab ambit.benreilly.io` → creates the proxied CNAME → `<UUID>.cfargotunnel.com`.
- [ ] **4.3** `cd /opt/docker/mediastack && docker compose restart cloudflared && docker logs --tail 20 cloudflared` — four "Registered tunnel connection" lines.
- [ ] **4.4** From the Mac **and** from the phone on cellular:
  ```bash
  dig +short ambit.benreilly.io                          # CNAME → *.cfargotunnel.com
  curl -sI https://ambit.benreilly.io/ | grep -i 'HTTP/\|strict-transport\|cf-ray\|content-security'
  curl -s https://ambit.benreilly.io/api/health
  ```
  Landing page renders in a browser; slideshow images load (`/landing/*` is static); `/i/<any itemId>` will 404 until T7 — expected.
- [ ] **4.5 Cache Rule (D13)** — Cloudflare dashboard → `benreilly.io` → *Caching → Cache Rules → Create*: name `ambit image proxy`, expression `(http.host eq "ambit.benreilly.io" and starts_with(http.request.uri.path, "/api/img/"))`, action *Eligible for cache*, Edge TTL *Use cache-control header from origin*. Verify after T7: two requests for the same image, the second's `cf-cache-status: HIT`.
- [ ] **4.6** Cloudflare → *Security → Bots*: confirm **Bot Fight Mode is off** for the zone (it challenges non-browser clients; the PWA's service worker and `fetch` calls must not be challenged). If it is on and was on for the other four hostnames, leave it and note it; test the install flow in T6 regardless.
- [ ] **4.7 Vault:** add the row to the runbook's "What to publish" table and to `homelab-reference.md`'s *Public hostnames (Cloudflare Tunnel)* table (`ambit.benreilly.io` → `192.168.1.202:3000`, "Ambit — has its own auth + invite gate"); add Ambit to the *Archive VM (VM 202)* section (it now hosts two tenants; port 3000 alongside 3001). Commit the vault.
  **Fallback:** a Cloudflare **502/530** with T3's health green = the tunnel can't reach `192.168.1.202:3000` from VM 200 — `curl -s http://192.168.1.202:3000/api/health` *from VM 200* is the discriminating test (LAN reachability vs. ingress typo). Cloudflare **403 / challenge page** on API calls = Bot Fight Mode or a WAF managed rule — turn the rule off for this hostname rather than fighting it in the app.

*Done = `https://ambit.benreilly.io/api/health` is 200 from off the LAN with a valid certificate and `strict-transport-security` present; vault updated.*

### T5 — 🖐️ Resend: sending domain and key (Ben; ~30 min + DNS wait)

- [ ] **5.1** resend.com → *Domains → Add* `ambit.benreilly.io`, region nearest. Copy the records it generates (typically: MX at `send.ambit.benreilly.io`, TXT SPF at `send.ambit.benreilly.io`, TXT DKIM at `resend._domainkey.ambit.benreilly.io`, optionally `_dmarc.ambit.benreilly.io`). **Paste them verbatim** — Resend's own warning.
- [ ] **5.2** Cloudflare DNS → add each record, **DNS only** (grey cloud; MX/TXT are never proxied anyway). The bare `ambit.benreilly.io` CNAME from T4 is untouched (D9).
- [ ] **5.3** Resend → *Verify*; wait (≤15 min typical). Then *API Keys → Create*: **Sending access**, domain restricted to `ambit.benreilly.io`. Into the password manager, then Coolify `RESEND_API_KEY`. **Restart** (runtime var only — no rebuild).
- [ ] **5.4** The only proof mail works (there is no error path — the send is fire-and-forget): from the phone, `https://ambit.benreilly.io/forgot-password` (or wherever the reset lives) for `benjamin.reilly@gmail.com` **after T6.1's invite + sign-up** — the mail arrives from `Ambit <noreply@ambit.benreilly.io>`, the link opens `https://ambit.benreilly.io/…` (not localhost — that is `BETTER_AUTH_URL` doing its job), the reset works. Check Resend's *Logs* for the delivered event and the mail's headers for `dkim=pass`.
  **Fallback:** verification stuck > 1 h = a record pasted with the zone appended twice (`send.ambit.benreilly.io.benreilly.io`) — Cloudflare's UI wants the *relative* name. Mail sent but not received = check Resend logs first (bounced vs. delivered), then Gmail spam.

*Done = a real password-reset mail from the verified domain, DKIM passing, link pointing at the public origin.*

### T6 — First account, cookies, and the proxy proofs (agent + Ben; ~45 min)

- [ ] **6.1 Invite** — 🖐️ on VM 202: `C=$(docker ps -q --filter publish=3000); docker exec "$C" bun run invite benjamin.reilly@gmail.com` (the filter, not the container name — the name changes every deploy; A.6 trap #4). Prints the invite created.
- [ ] **6.2 Sign-up on the phone (cellular), through onboarding, to an empty feed** — expected pre-T7 (the feed is empty, not broken; `/api/health` is the discriminator). Then **install the PWA** (5.11's flow) and confirm the service worker registers under the CSP (Safari → Develop, or Chrome `chrome://serviceworker-internals`).
- [ ] **6.3 Cookie flags (carried item 4)** — from the Mac:
  ```bash
  curl -si https://ambit.benreilly.io/api/auth/sign-in/email -H 'content-type: application/json' \
    -H 'origin: https://ambit.benreilly.io' -d '{"email":"benjamin.reilly@gmail.com","password":"<wrong>"}' | grep -i 'set-cookie\|HTTP/'
  ```
  A wrong password returns no session cookie; use the right one **once** (typed at the prompt, not in the transcript) or read the flags off the phone's/desktop's devtools after sign-in. Required: `__Secure-better-auth.session_token=…; HttpOnly; Secure; SameSite=Lax; Path=/`. Record the line (minus the value) in the walkthrough and in SPEC §11's cookie bullet.
- [ ] **6.4 Per-client rate limiting (carried item 3; D11)** — two clients, ~simultaneously: the Mac on home WiFi (which still egresses via Cloudflare, a different IP from the phone's cellular) and the phone.
  ```bash
  for i in $(seq 1 22); do curl -s -o /dev/null -w '%{http_code} ' https://ambit.benreilly.io/api/auth/sign-in/email \
    -H 'content-type: application/json' -H 'origin: https://ambit.benreilly.io' \
    -d '{"email":"nobody@example.com","password":"x"}'; done; echo
  ```
  Expect twenty `401`s then `429` on the 21st–22nd from the Mac, **while the phone can still sign in** during the same 10-second window. Then the same loop against `/api/img/<id>` is unnecessary — Ambit's own limiter uses the last XFF hop, which T6.5 checks directly.
- [ ] **6.5 Spoof test (the behavioural proof D11 needs)** — wait 10 s for the bucket to clear, then rerun 6.4's loop from the Mac with `-H 'x-forwarded-for: 1.2.3.4'` added to the curl. Still 429 at the 21st request: Cloudflare appended the real address after the spoofed one, Better Auth keyed on `cf-connecting-ip`, and Ambit's own limiter took the last hop. (The header shapes themselves are documented Cloudflare behaviour; nothing in the image can echo them without leaking, so the behaviour is the check.)
- [ ] **6.6 `SOURCE_COMMIT`** — `curl -s https://ambit.benreilly.io/api/health | jq .commit` equals `git rev-parse main`. If `null`, 🖐️ `docker exec "$C" printenv SOURCE_COMMIT` says whether Coolify passes it at runtime at all; record either way. (The UUID fallback is acceptable — it only churns the offline-page precache per boot. *Include Source Commit in Build* is the build-time switch and is not what this needs.)
  **Fallback (D11):** if the phone *also* gets 429 during the Mac's loop, every client is sharing one bucket. First `docker exec "$C" printenv NODE_ENV` — anything but `production` means `ipAddressHeaders` was never applied, and the fix is the env, not code. If it *is* production, the header isn't arriving as expected: file it as a finding with the evidence, leave the raised 20/10 s limit doing its job (7.1's reason for raising it was exactly this case), and do not reach for `trustedProxies` — cloudflared is the peer, not an addressable proxy hop.

*Done = Ben's account exists via invite; PWA installed from the public origin; `__Secure-` cookie with `Secure`; 429 per client, not per proxy; a spoofed XFF changes nothing.*

### T7 — Corpus: first ingest and the image warm (Ben launches, agent watches; ~3 h wall, mostly waiting)

Both run inside the app container via Coolify **Scheduled Tasks** with *Execute now* — output is captured per run and survives the Mac sleeping. A `docker exec` from an interactive shell would die with the shell.

- [ ] **7.1 Smoke** — 🖐️ `docker exec "$C" bun run ingest --quota 3 --skip-llm --dry-run` (10 s; proves adapters, keys and the archive URL from inside the container; `--skip-llm` means no OpenRouter spend). Then `--quota 3 --source archive --dry-run` specifically — the archive key and `http://192.168.1.202:3001` are the two values most likely to be wrong.
- [ ] **7.2 Scheduled task `ingest`** — Application → *Scheduled Tasks → Add*: name `ingest`, command `bun run ingest`, frequency `30 1 * * *`, enabled. **Timezone is not documented** — add a second task `tz-probe`, command `date`, `every_minute`, read one execution's output, delete it. If the host is UTC, `30 1` UTC = 21:30 EDT the previous evening; that is fine (before the archive's 03:00 local), but write the resolved local time into the walkthrough and SPEC §13.
- [ ] **7.3 First full ingest** — *Execute now* on `ingest`. Budget 1.5–2 h. Watch: `curl -s https://ambit.benreilly.io/api/health` stays 200 throughout (the ingest shares the process's CPU but not its request path); Coolify's task output at the end shows the per-source table. Then the feed on the phone has cards. Record: items ingested, per-source counts, OpenRouter spend for the run (dashboard, `usage.cost` sum), wall time.
  **Fallback:** a task that shows "Waiting for task output…" forever (Coolify #6566) — the run is still real; check `select count(*) from item` via `docker exec <db-container> psql -U ambit -d ambit -c 'select source, count(*) from item group by 1'`. A source that 401s = key not set in Coolify (the smoke in 7.1 catches this first).
- [ ] **7.4 Image warm (carried item 2)** — task `img-warm`, command `bun run img:warm --rate 2`, **no schedule** (disabled), *Execute now*. Per-host rate, hosts in parallel; ~1–2 h. Then 🖐️ `docker exec "$C" sh -c 'ls .cache/img | wc -l; du -sh .cache/img'` ≈ item count and ~0.7 GB. Two `curl -sI https://ambit.benreilly.io/api/img/<id>` — first `x-ambit-cache: hit` (warmed) and `cf-cache-status: MISS`, second `cf-cache-status: HIT` (T4.5's rule).
- [ ] **7.5 Redeploy survival (carried item 1)** — Coolify *Redeploy* (no code change). After it: `/api/health` 200, `ls .cache/img | wc -l` unchanged, a `curl -sI …/api/img/<id>` is `hit` not `fill`. **This is the whole point of the volume — do not skip it.**

*Done = the feed is populated from a server-side ingest; the cache is warm; both survive a redeploy; spend and wall time recorded.*

### T8 — Backups: the restore drill (Ben; ~20 min, after the first 04:00 backup)

- [ ] **8.1** `ambit-db` → *Backups*: the first scheduled run succeeded; note file path + size.
- [ ] **8.2 Restore into a scratch database, never into `ambit`** — 🖐️ on VM 202, with `D=$(docker ps -q --filter name=ambit-db)` (adjust the filter to the container's real name from `docker ps`):
  ```bash
  docker exec "$D" psql -U ambit -d postgres -c 'create database ambit_restore'
  docker cp <backup path> "$D":/tmp/ambit.dmp
  docker exec "$D" pg_restore --no-owner --no-acl -U ambit -d ambit_restore /tmp/ambit.dmp
  docker exec "$D" psql -U ambit -d ambit_restore -c 'select count(*) from item; select count(*) from "user"'
  docker exec "$D" psql -U ambit -d postgres -c 'drop database ambit_restore'
  ```
  Counts match production's. Write the four lines into SPEC §13 as *the* restore procedure.
- [ ] **8.3** Confirm the Proxmox nightly `vzdump` of VM 202 is still scheduled and its last run succeeded (Proxmox UI on `192.168.1.50` → Datacenter → Backup) — that job is what carries the Coolify dump off the host.

*Done = a backup file has been restored and counted; the procedure is written down.*

### T9 — The unattended run, docs, log (agent, next morning; ~1 h)

- [ ] **9.1 The done-bar's last clause** — the morning after T7: Coolify *Scheduled Tasks → ingest* shows a run at the scheduled time, exit 0, with a per-source table; `select count(*) from item` grew (or stayed, if the sources had nothing new — the run's table says which). `/api/health` 200. **If the run failed, 8.1 is not done** — diagnose (the smoke in 7.1 is the tool), fix, and wait another night.
- [ ] **9.2 Docs** — `docs/BUILD_PLAN.md` 8.1 ✅ with the deployed facts (host, URL, volume, cron time, backup cadence, the four carried items each with its proof) and the four decisions that differ from the plan text (D1 homelab not VPS; Coolify task not system cron; fresh ingest; `cf-connecting-ip`). `SPEC.md` §13 rewritten as *what is deployed* — the env-var table with each var's source, the boot sequence, the volume, the restore procedure from T8, the "one instance" rule, and the Cloudflare pieces (tunnel ingress, Cache Rule); §11's cookie bullet gets the observed production line. `CLAUDE.md`: status paragraph ("**8.1 shipped <date>** — …, next 8.2"), and a *Local dev* note that production's origin is `ambit.benreilly.io` and that `docker ps --filter publish=3000` on VM 202 is how you find the container. `README.md` gets a one-line "Deployed at" if it has a status section.
- [ ] **9.3 Walkthrough** `docs/PHASE8_WALKTHROUGH_8.1.md` — the A.6 shape: what deploying proved, every trap hit (there will be some), the numbers (build time on the NUC, image size, first-ingest wall time and spend, cache size, backup size), and what 8.1 deliberately does not do (no error visibility, no uptime ping, no ingest-failure mail — all 8.2).
- [ ] **9.4 Vault** — Ambit-Admin `log.md`: one entry ("Ambit deployed to VM 202; public at `ambit.benreilly.io`; the archive is now reached at `http://192.168.1.202:3001` from a sibling container; the `ARCHIVE_API_KEY` now lives in **three** places — rotate all three together"). `Ecosystem Architecture.md`'s integration table: Ambit ← Archive row → "**deployed both sides**".
- [ ] **9.5 `log.md`** entry per CLAUDE.md's format, with the session-spend line from the script. **Commit:** `docs: 8.1 shipped — deployed facts in SPEC §13, BUILD_PLAN, CLAUDE.md; walkthrough`. Merge `feat/8.1-deploy` if anything is still on it (T1–T2 merged earlier); push.

*Done = one unattended ingest run is on record; SPEC §13 describes the real deployment; the walkthrough exists; both repos and the vault agree.*

## Verification (the done-bar, end to end)

1. `curl -s https://ambit.benreilly.io/api/health` → `200 {"ok":true,"db":"ok","imageCache":"ok",…}` from a network that is not the LAN.
2. `curl -sI https://ambit.benreilly.io/` carries `strict-transport-security`, `content-security-policy` with a nonce, `x-frame-options: DENY`, and a valid Cloudflare-issued certificate.
3. Ben's account was created through an invite; the PWA is installed from the public origin; the session cookie is `__Secure-…; Secure; HttpOnly; SameSite=Lax`.
4. A password-reset mail arrives from `noreply@ambit.benreilly.io` with `dkim=pass`, and its link opens the public origin.
5. Twenty-one sign-in attempts from one client yield a 429 while a second client is unaffected; a spoofed `X-Forwarded-For` does not change that.
6. The feed shows server-ingested items; `.cache/img` holds ~one file per item and is unchanged across a redeploy; a repeat image request is `cf-cache-status: HIT`.
7. A Coolify backup has been `pg_restore`d into a scratch database and its row counts matched.
8. The `ingest` task has run **unattended** at its scheduled time with exit 0.
9. `bun run check` and CI green on `main`; SPEC §13 / BUILD_PLAN / CLAUDE.md / walkthrough / vault updated.

## Out of scope (resist)

- **Error visibility, uptime ping, ingest-failure notification** — 8.2, by name. Beszel on VM 200 could watch VM 202 today; wiring it is 8.2.
- **Inviting anyone but Ben** — 8.2, after a few days of Ben using production.
- **`output: "standalone"`, a slimmer image, multi-arch builds, a registry** — 9.x; D5.
- **Cloudflare Access, WAF rules, HSTS preload, edge-caching anything but `/api/img/*`** — D2, D12, D13.
- **Copying any data from the Mac** — D3. The Mac's `.cache/curation` (46 MB of LLM envelopes) would save re-curation spend; it stays local this phase, and the first run's real cost (T7.3) decides whether 9.x copies it.
- **The 41 markup rows, the landing JPEG→WebP, the React #418 under Lighthouse, the reduced-motion `animation-delay`** — 7.2/7.3 findings, all still open, none a deploy blocker.
- **A LAN hostname through Caddy, a second instance, `db:push`, editing the archive app** — never in this phase.
