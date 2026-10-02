# The production image (Phase 8.1). Coolify builds this on VM 202, so the install happens natively
# on linux/amd64 and `sharp` resolves its prebuilt glibc binary with no C++ toolchain in the image.
#
# ── Why this ships the full dependency tree, dev deps included (decision D5) ──
#
# The archive's image next door installs `--production` and is right to; this one must not. Two
# things in a running Ambit container are devDependencies: `drizzle-kit`, which applies the
# migration journal at boot, and everything `scripts/` imports — the nightly ingest is a Coolify
# scheduled task that `docker exec`s into this container. Installing `--production` would break
# both, at 01:30, silently.
#
# The payoff of taking that plainly is that the boot path below is byte-for-byte the one CI's `e2e`
# job has proven green on every push since 7.1: db:migrate -> db:seed -> build -> next start. This
# is a first deploy; `output: "standalone"` and a slimmer image are a 9.x optimisation, and under
# Bun they would need the scripts/ and drizzle-kit story solved separately.
FROM oven/bun:1.4.0-debian AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json bun.lock ./
# --frozen-lockfile: a build is not the place to resolve a new version of anything.
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# **The real public origin has to be present at BUILD time, not just at runtime.** next.config.js
# runs `headers()` during the build and decides there whether to emit HSTS, by reading
# `BETTER_AUTH_URL`'s scheme (7.2, D5) — so a build that doesn't know the origin bakes in the wrong
# answer, permanently, and no runtime variable can undo it. In Coolify this means BETTER_AUTH_URL
# is the one variable with "Build Variable" ticked.
#
# The other two only have to satisfy env.js's Zod schema: nothing connects and nothing signs
# anything during a build (CI's `check` job builds with placeholders in exactly this shape). They
# are ARGs rather than real secrets on purpose — never pass the production values here, because a
# build ARG is visible in the image's history.
ARG BETTER_AUTH_URL
ARG DATABASE_URL=postgres://build:build@localhost:5432/build-placeholder
ARG BETTER_AUTH_SECRET=build-placeholder-never-used-at-runtime
RUN test -n "$BETTER_AUTH_URL" || (echo "BETTER_AUTH_URL build arg is required" && exit 1)
RUN bun run build

FROM base AS runtime
# ── The Claude judge's CLI (10-02-26, docs/PLAN_judge-on-vm202.md) ──
#
# The ingest is `docker exec`'d into this container, and with CURATOR_JUDGE=claude the curator
# spawns `claude -p` for every judgment, on Ben's subscription. So the CLI lives here.
#
# **Pinned, and it stays pinned.** The judge passes a row of flags that strip Claude Code's own
# ~54,000-token overhead down to ~400 per judgment; it has tripwires for a CLI that stops
# honouring them, and an auto-update inside a container is the way to trip them at 4 am. To move
# to a newer CLI: change the ARG, deploy, run `bun run judge:probe` in the container, read the
# token count. The installer is Anthropic's native one (code.claude.com/docs/en/setup); it needs
# curl. **curl stays in the image** (Ben, 10-02-26): the ingest needs it at run time too, so do
# not purge it to save a few MB — a container without it fails at 4 am, not at build time. The
# binary lands in /root/.local/bin — the container runs as root.
#
# No credential is here or anywhere in the build: the login is CLAUDE_CODE_OAUTH_TOKEN, a
# *runtime* variable in Coolify (never tick "Build Variable" on it — a build ARG is readable in
# the image's history).
#
# This sits before the first COPY so a code change never re-runs the install.
ARG CLAUDE_CODE_VERSION=2.1.287
ENV DISABLE_AUTOUPDATER=1
ENV PATH="/root/.local/bin:${PATH}"
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://claude.ai/install.sh -o /tmp/claude-install.sh \
 && bash /tmp/claude-install.sh "$CLAUDE_CODE_VERSION" \
 && rm /tmp/claude-install.sh \
 && rm -rf /var/lib/apt/lists/* \
 && curl --version \
 && claude --version | grep -F "$CLAUDE_CODE_VERSION"

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
# tsconfig.json ships because Bun resolves the `~/*` path alias from it at RUNTIME, not just at
# typecheck time (the archive learned this the hard way). Leave it out and every
# `import { env } from "~/env"` in scripts/ fails at exec time, reading as a missing module rather
# than as missing config. drizzle.config.ts is what `db:migrate` reads; next.config.js and
# postcss.config.js are read by `next start`.
COPY package.json bun.lock tsconfig.json next.config.js postcss.config.js drizzle.config.ts ./
# src/ and scripts/ are runtime code here, not build inputs: the ingest, seed, invite and
# image-warm commands all run inside this container (D7).
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle

EXPOSE 3000

# Docker's own healthcheck, which Coolify honours in preference to its UI check. `bun -e` rather
# than curl: curl is in the image now (the judge's installer and the ingest need it, see the
# runtime stage's top), but the healthcheck does not depend on it — `bun -e` is the proven check
# and needs nothing beyond the runtime the app already runs on. 60s start period covers migrate + seed + first render.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrate, seed, then serve — chained with && so a failed migration never leaves a server
# answering from a half-migrated database. db:seed is a config upsert (scripts/seed-topics.ts), so
# it is safe on every boot and *required* before any ingest: item.topic_id is a NOT NULL FK.
# `img:dims --landing` (09-25-26) records the cached masters' sizes that the landing reel reads to
# give phones tall pictures and computers wide ones; a row without them is not in the pool, so an
# unmeasured deploy would show only the fallback picture. Idempotent (seconds the first time,
# nothing after) and deliberately non-fatal: a landing with fewer pictures must never stop a boot.
CMD ["sh", "-c", "bun run db:migrate && bun run db:seed && (bun run img:dims --landing || true) && bun run --bun next start"]
