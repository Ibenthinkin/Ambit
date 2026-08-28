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
# than curl/wget: neither is in oven/bun, and adding one to get a healthcheck would be a package
# in the image for no other reason. 60s start period covers migrate + seed + first render.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrate, seed, then serve — chained with && so a failed migration never leaves a server
# answering from a half-migrated database. db:seed is a config upsert (scripts/seed-topics.ts), so
# it is safe on every boot and *required* before any ingest: item.topic_id is a NOT NULL FK.
CMD ["sh", "-c", "bun run db:migrate && bun run db:seed && bun run --bun next start"]
