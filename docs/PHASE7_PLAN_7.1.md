# Phase 7.1 — Playwright e2e in CI: detailed execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the existing Playwright suite — plus the production-only PWA spec that has never had an automated home — runs green on every push and PR, against a production build, a fresh Postgres and a Mailpit, inside GitHub Actions. The five DB-backed Vitest suites that have self-skipped in CI since Phase 3.3 run there too. Locally nothing gets slower or stranger: `bun run e2e` stays exactly what it is.

**Architecture:** a second job in `.github/workflows/ci.yml` (`e2e`, parallel to `check`) with two GitHub **service containers** (Postgres 17, Mailpit) mapped to the runner's localhost; the schema applied by the real `drizzle/` migration journal and `bun run db:seed`; a `bun run build` then Playwright's own `webServer` booting `next start`. One switch in `playwright.config.ts` (`E2E_PROD=1`) selects the production server and un-ignores `pwa.prod.spec.ts`; the same switch reproduces CI locally as `bun run e2e:prod`. The five copies of the specs' `connect()` helper collapse into `e2e/support.ts`, made tolerant of there being no `.env` file — which is the one line that would otherwise throw in CI.

**Tech Stack:** Next.js 16 / Bun 1.3 / TypeScript (strict) / Drizzle over Postgres 17 / Vitest 4 / Playwright 1.62 / GitHub Actions (`ubuntu-latest`).

**Status: ready to execute cold.** Written 08-27-26 by a session that read every file named below and verified the external claims (§ "Verified facts") against current docs that day. No design doc: the decisions were small enough to settle in chat and are recorded under "Decisions locked".

## Global Constraints

- **Do not make the tests weaker to make CI green.** No new `test.skip`, no widened timeouts, no `retries` above the existing 2, no `expect.soft`. A test that fails only in CI is telling you something about the production build, the empty database, or the runner — find out which and fix *that*. If it is genuinely a runner limitation, stop and report it rather than hiding it.
- **The specs' seeding contract stays:** every spec seeds its own `source: "e2e"` rows under a spec-specific `sourceId` prefix and cleans up children-first, scoped to that prefix — never to `source: "e2e"` as a whole (the 5.8 incident, quoted in every spec's `afterAll`). The refactor in T1 moves that code; it must not change what it deletes.
- **Repo conventions:** comment generously — Ben is a returning webdev and the codebase teaches (CLAUDE.md). Every task ends green on `bun run check` (run `bun run format:write` first — `format:check` is part of `check` and the code blocks in this plan are not guaranteed to be prettier-exact); commit per task with a conventional-commit subject. Plain branch `feat/7.1-e2e-ci` off `main`, merged back with `--no-ff` at the end (no worktrees).
- **Local dev:** Ambit must own port 3000 (`lsof -ti:3000 | xargs kill` if something else is on it). `docker compose up -d` for Postgres + Mailpit. A red Postgres-touching test on a busy machine is usually load, not code (CLAUDE.md) — and the `gallery.spec:193` note there is about *local* state accumulation, which CI's fresh database never has.
- **Never commit `.env`.** The CI job gets its variables from the workflow file; the secret there is a placeholder and must stay obviously fake.
- **Do not** use the Agent tool, workflows, or deep-research unless Ben asks.

---

## Before you start

```bash
cd ~/Dev/ambit && git checkout main && git pull && git checkout -b feat/7.1-e2e-ci
lsof -ti:3000 || echo "port 3000 free"
docker compose up -d
bun run check          # must be green before the first edit — if not, stop and report
bun run e2e            # must be green too (41 passed); a red gallery.spec:193 alone is the known local flake — run it once more before believing it
```

**Decisions locked (do not relitigate — settled with Ben 08-27-26):**

- **D1 — CI runs the suite against a production build** (`bun run build` → `next start`), not `next dev`. Faster and steadier on a small runner (no Fast Refresh, no first-compile wait), it is what beta readers will hit, and it is the only way `pwa.prod.spec.ts` — the single automated check of the offline/caching strategy — can join the suite. Local `bun run e2e` keeps the dev server; `bun run e2e:prod` reproduces CI.
- **D2 — Service workers stay *allowed* in CI.** Considered and rejected: `serviceWorkers: "block"` for the ordinary specs. Blocking makes `navigator.serviceWorker.register` fail, which the `SerwistProvider` may surface as a console error — and three specs assert "no console errors". Allowing is simply production behaviour; the SW rules (`src/lib/sw-rules.ts`) never cache tRPC or auth, so no test can be answered from a cache it didn't expect.
- **D3 — GitHub service containers, not `docker compose` in the workflow.** The runner health-gates them and tears them down; no orchestration step to maintain. The compose file stays the *local* definition. Two definitions of the same two services is accepted; a comment in each points at the other.
- **D4 — Real migrations (`db:migrate`), not `db:push`.** CI becomes the first automated proof that the `drizzle/` journal applies cleanly to an empty database — the path Phase 8.1's deploy will take.
- **D5 — The e2e job also runs `bun run test`.** With `DATABASE_URL` present, the five `describe.skipIf(!process.env.DATABASE_URL)` suites execute. The `check` job keeps running the unit suite without a database; the duplication is seconds.
- **D6 — Env comes from the job, never a written `.env`.** The specs' `process.loadEnvFile("../.env")` becomes tolerant (the idiom `vitest.config.ts` already uses). Bun subprocesses (`bun run invite`) and Playwright's `webServer` inherit the job environment.
- **D7 — The e2e job runs in parallel with `check`, not `needs: check`.** A typecheck failure wastes a few runner minutes; serialising would add them to every green run instead.
- **D8 — A local `bun run e2e:clean`** (dry-run by default, `--confirm` to delete) retires accumulated e2e users and their rows. It is the remedy CLAUDE.md's `gallery.spec:193` note asks for and is never run in CI.

**Verified facts (08-27-26) the plan is built on:**

| Fact | Where verified | Consequence |
|---|---|---|
| Jobs running directly on the runner reach service containers via `localhost` **only if ports are mapped** (`- 5432:5432`); `options:` takes Docker `--health-*` flags and the runner waits for health. | GitHub Actions docs, *Use Docker service containers* / workflow syntax | Both services map ports; Postgres health-cmd `pg_isready -U ambit -d ambit`. |
| The official Mailpit image's own `HEALTHCHECK` is `CMD ["/mailpit", "readyz"]`; `/livez` and `/readyz` are unauthenticated HTTP endpoints; `GET /api/v1/messages?limit=N` and `GET /api/v1/message/{ID}` (with a `Text` field) are what `auth.spec.ts` already calls. | axllent/mailpit `Dockerfile`, `server/server.go`, `server/apiv1/message.go` | health-cmd `/mailpit readyz` in the service definition; the spec's `fetchResetLink` needs no change. |
| `process.loadEnvFile(path)` **throws** when the file is missing. | Node docs; `vitest.config.ts` wraps it in try/catch for exactly this | T1's `connect()` must catch it; today five specs would crash in `beforeAll` in CI. |
| `image-tile.tsx` and `image-item-body.tsx` render a `data:` `imageUrl` directly and route only `http(s)` URLs through `/api/img/[itemId]`; the proxy 404s anything that isn't `http(s)`. | `src/components/feed/image-tile.tsx:87`, `src/app/api/img/[itemId]/route.ts` | The PWA spec's `ambit-images` assertion needs seeded rows with a **same-origin http URL** (T3); the 1×1 data-URI pixel the other specs use never touches the proxy. |
| The SW caches `/api/img/*` cache-first (`isImageProxy`), `/feed` navigations network-first, and never tRPC or `/api/auth`. The proxy answers with `Cache-Control: public, max-age=31536000, immutable`. | `src/lib/sw-rules.ts`, the proxy route | A 200 from the proxy for a seeded same-origin image lands in `ambit-images`. |
| Rate limits: tRPC 120/min per user id (or per trusted IP, else a shared `"unknown"` bucket); the image proxy 600/min per IP. Neither is disabled in development, so local runs already live under them. | `src/server/api/trpc.ts:162`, the proxy route, `rate-limit.ts` | CI's single worker is *less* load than local's three. If a trace shows a 429, it is a real finding, not a CI artefact — report it. |
| `getMailer()` picks Resend only when `NODE_ENV === "production" && RESEND_API_KEY`; otherwise Mailpit at hardcoded `localhost:1025`. | `src/server/services/mailer.ts` | `next start` sets `NODE_ENV=production`; with no `RESEND_API_KEY` in the job, mail goes to the mapped Mailpit port. Do **not** add a Resend key to CI. |
| Playwright config: `serviceWorkers: "allow" \| "block"` is a `use` option; `testIgnore` accepts an array; `webServer.command` inherits `process.env`. | playwright.dev, *Service workers*, `TestProject`, `TestConfig.webServer` | T2's config switch. |
| Latest action tags (via `gh api …/releases/latest`): `actions/checkout` **v7**, `oven-sh/setup-bun` **v2**, `actions/cache` **v6**, `actions/upload-artifact` **v7**. | GitHub API, 08-27-26 | Pin majors as listed. |
| GitHub-hosted `ubuntu-latest` ships Node; Playwright's CLI and Vitest run under Node even when launched via `bun run` (their bins are `#!/usr/bin/env node`). `setup-bun` puts `bun` on `PATH`, which `execFileSync("bun", ["run", "invite", …])` needs. | Runner images; `vitest.config.ts` header comment | No `setup-node` step required. |
| `tsc --noEmit` and `eslint .` both cover `e2e/` (tsconfig `include: **/*.ts`). | `tsconfig.json` | The T1 refactor must typecheck and lint; `bun run check` proves it. |
| The specs' e2e users all match `ambit-%@example.com` (`ambit-e2e-`, `ambit-feed-e2e-`, `ambit-item-e2e-`, `ambit-gallery-e2e-`, `ambit-saved-e2e-`, `ambit-settings-e2e-`, `ambit-pwa-verify-`). Only `session` and `account` cascade from `user`; `user_topic`, `collection`, `saved_item`, `seen_item` do not. | `e2e/*.spec.ts`, `src/server/db/schema.ts` | T4's delete order. |

**File map (what this plan creates or modifies):**

| File | Role |
|---|---|
| `e2e/support.ts` | + `connect()`, `Connection`, `PIXEL`, `inviteUser()`, `cleanupSeeded()` — the shared scaffolding |
| `e2e/auth.spec.ts`, `feed.spec.ts`, `gallery.spec.ts`, `item.spec.ts`, `saved.spec.ts`, `settings.spec.ts` | use the shared scaffolding; header comments updated |
| `e2e/pwa.prod.spec.ts` | seeds its own corpus with same-origin images; uses the shared scaffolding; header updated |
| `playwright.config.ts` | the `E2E_PROD` switch; comments updated |
| `package.json` | + `e2e:prod`, `e2e:clean` |
| `scripts/e2e-clean.ts` (new) | local cleanup of accumulated e2e users |
| `.github/workflows/ci.yml` | + the `e2e` job; header comment updated |
| `docker-compose.yml` | one comment pointing at the CI twin |
| `vitest.config.ts`, `src/server/db/items.integration.test.ts` | comments that say "CI has no database" become true-in-CI notes |
| `SPEC.md` §12, `docs/BUILD_PLAN.md` 7.1, `CLAUDE.md` | the record |
| `docs/PHASE7_WALKTHROUGH_7.1.md` (new), `log.md` | written last |

---

## Tasks

### T1 — Shared e2e scaffolding in `e2e/support.ts`

Five specs carry a byte-identical `connect()`; four carry an identical children-first cleanup; seven shell out to `bun run invite` the same way. Consolidating them is what makes the one behavioural change this task needs — tolerating a missing `.env` — a single edit instead of five.

- [ ] **1.1** Add to `e2e/support.ts` (keep the existing three helpers; put these below them):

```ts
import { execFileSync } from "node:child_process";

import { inArray, like } from "drizzle-orm";

/** A 1×1 transparent GIF. Inline, so a tile's happy path never depends on a network hop — and,
 *  because `image-tile.tsx` renders `data:` URLs directly, never on the image proxy either. */
export const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The DB handle every DB-touching spec loads in `beforeAll`.
 *
 * **Why the `.env` load is optional.** Playwright runs under plain Node, which — unlike Bun — does
 * not read `.env` on its own, and `~/server/db/client` pulls in `~/env`, whose Zod validation
 * throws at *import* time without `DATABASE_URL`. Locally the file supplies it. In CI there is no
 * `.env` at all: the workflow puts the same variables straight into the job's environment, which
 * `~/env` reads identically — so a missing file is simply not an error there. (`vitest.config.ts`
 * makes the same accommodation for the same reason.) `process.loadEnvFile` throws on a missing
 * file, hence the try/catch; if the variables are absent *both* ways, `~/env`'s own message says so.
 *
 * **Why the imports are dynamic.** A static import would be hoisted above the env load.
 */
export async function connect() {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env (CI) — the job environment must already carry DATABASE_URL and the auth vars.
  }
  const [{ db }, schema] = await Promise.all([
    import("../src/server/db/client"),
    import("../src/server/db/schema"),
  ]);
  return { db, ...schema };
}

export type Connection = Awaited<ReturnType<typeof connect>>;

/**
 * Grants `email` an invite through the real admin path (`scripts/invite.ts`), exactly as
 * docs/PHASE2_WALKTHROUGH_2.2.md did by hand. `execFileSync` with an argument array, no shell:
 * the address is generated, not user input, but there's no reason to route it through one.
 * Requires `bun` on PATH — true locally and under `oven-sh/setup-bun` in CI.
 */
export function inviteUser(email: string): void {
  execFileSync("bun", ["run", "invite", email], { stdio: "pipe" });
}

/**
 * Deletes every seeded item whose `sourceId` starts with `prefix`, children first (`seen_item`
 * and `saved_item` both reference `item`).
 *
 * **Scoped to a prefix, never to `source: "e2e"`.** Every spec seeds under that same source, and
 * `fullyParallel` runs the spec files in separate workers — so a cleanup that deleted the whole
 * source would pull another spec's fixtures out from under it mid-run. That is exactly what
 * happened when 5.8 added a third such spec: the feed came back empty and an item page 404'd, in
 * two different files, for no reason visible in either. Callers pass their own prefix
 * (`"e2e-feed-"`, `"e2e-item-"`, …) and nothing else.
 */
export async function cleanupSeeded(conn: Connection, prefix: string): Promise<void> {
  const { db, item, seenItem, savedItem } = conn;
  const seeded = await db
    .select({ id: item.id })
    .from(item)
    .where(like(item.sourceId, `${prefix}%`));
  const ids = seeded.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
  await db.delete(savedItem).where(inArray(savedItem.itemId, ids));
  await db.delete(item).where(inArray(item.id, ids));
}
```

  Keep `drizzle-orm` as a top-level import (it has no env dependency — `settings.spec.ts` already imports it that way); keep the `../src/server/db/*` imports dynamic.

- [ ] **1.2** Refactor the six specs to use it. Mechanical, one file at a time, `bun run e2e <file>` after each:
  - Delete each local `connect()`, `Connection`, `PIXEL`, and the `execFileSync` import; import `connect`, `inviteUser`, `cleanupSeeded`, `PIXEL` (and `type Connection` where the file declares `let conn: Connection`) from `./support`.
  - Replace `execFileSync("bun", ["run", "invite", EMAIL], { stdio: "pipe" })` with `inviteUser(EMAIL)`.
  - Replace the four identical `afterAll` bodies (feed, gallery, item, saved) with `await cleanupSeeded(conn, "e2e-feed-")` etc. — the prefix each file's `like(...)` used. `settings.spec.ts`'s `afterAll` is *different* (it deletes the user's collections and saves, not items) and stays as it is. `auth.spec.ts` seeds nothing and only needs `inviteUser`.
  - Where a deleted comment carried an incident story (the dynamic-import note in `feed.spec.ts`, the 5.8 story in the `afterAll`s), leave a one-line pointer: `// See support.ts's connect() / cleanupSeeded() for why.` The stories now live once, in `support.ts`.
  - **Update every header comment that says the spec is "local-only until Phase 7.1" / "CI has no Postgres until 7.1"** (`auth.spec.ts:9`, `feed.spec.ts:9,18`, `gallery.spec.ts`, `item.spec.ts`, `saved.spec.ts`, `settings.spec.ts`) to the new truth — e.g. *"Runs locally against the dev server and in CI against a production build with a fresh database (Phase 7.1); the seeded corpus is what makes the latter possible."*
- [ ] **1.3** `bun run check` green (the refactor must typecheck — `Connection` is now exported, and no spec should still import `execFileSync`). `bun run e2e` green, 41 passed.
- [ ] **1.4** Commit: `refactor(e2e): share connect/invite/cleanup scaffolding in support.ts, tolerate a missing .env`.

*Done = one `connect()` in the repo; `grep -c "loadEnvFile" e2e/*.ts` prints 0 for every spec and 1 for support.ts; suite green.*

### T2 — The `E2E_PROD` switch in `playwright.config.ts`, and the two scripts

- [ ] **2.1** In `playwright.config.ts`, above `defineConfig`:

```ts
/**
 * `E2E_PROD=1` runs the suite against a **production build** instead of the dev server, which is
 * what CI does (Phase 7.1, decision D1) and what `bun run e2e:prod` reproduces locally. Three
 * things change under it, all below: the server command, the `*.prod.spec.ts` exclusion (a
 * production server is the one place those specs *can* pass), and whether an already-running
 * server on :3000 is trusted — under `E2E_PROD` it is not, because the thing squatting the port is
 * far more likely to be a stale `next dev` than the build you just made.
 *
 * The build itself is NOT started here: `webServer` has a 60s budget and a build can take longer.
 * `bun run e2e:prod` builds first; CI builds in its own step.
 */
const PROD = process.env.E2E_PROD === "1";
```

  Then:
  - `testIgnore: PROD ? [] : /\.prod\.spec\.ts$/,` — and rewrite the comment above it: the spec is excluded from the *dev-server* run because the service worker registers in production builds only; under `E2E_PROD` it is part of the suite. Replace the "run it deliberately" recipe with `bun run e2e:prod`.
  - `webServer.command: PROD ? "bun run --bun next start" : "bun run --bun next dev",`
  - `webServer.reuseExistingServer: !process.env.CI && !PROD,`
  - Rewrite the two "until Phase 7.1" comments (`workers` at line ~41: CI *does* have a Postgres now and still gets one worker because the runner is a smaller box; `webServer` at line ~66: CI now boots the server here too, against the job's service containers).
- [ ] **2.2** `package.json` scripts, alphabetical with their neighbours:

```json
"e2e": "playwright test",
"e2e:clean": "bun run scripts/e2e-clean.ts",
"e2e:prod": "bun run build && E2E_PROD=1 playwright test",
```

  (`E2E_PROD=1 …` is POSIX shell syntax; local shells and the CI runner's bash both accept it. CI sets the variable at job level and runs plain `bun run e2e`, so the script's inline form is for local use only.)
- [ ] **2.3** `bun run check` green. `bun run e2e` green (unchanged behaviour). Don't run `e2e:prod` yet — T3 fixes the spec that would fail.
- [ ] **2.4** Commit: `feat(e2e): E2E_PROD switch runs the suite against a production build`.

*Done = `E2E_PROD=1 bunx playwright test --list` includes `pwa.prod.spec.ts`; without it, the list is unchanged.*

### T3 — `pwa.prod.spec.ts` seeds a corpus the proxy can serve

The spec currently seeds nothing and relies on the 8.5k-item dev corpus. In CI the database holds only what the specs put there, so a fresh reader's feed would be empty and the first `[data-feed-id]` wait would time out. It also asserts `ambit-images` is non-empty — which needs image requests that go **through `/api/img/`** (the SW's cache-first rule matches that path), and the proxy only serves `http(s)` URLs. A same-origin URL to a file in `public/` is the honest fixture: real bytes, one origin, no network.

- [ ] **3.1** Rewrite the top of `e2e/pwa.prod.spec.ts`:
  - Header: it is now **part of `bun run e2e:prod` and of CI**, excluded only from the dev-server run; keep the paragraph on *why* it can't pass under `next dev` and the regression it caught when written.
  - `import { cleanupSeeded, connect, inviteUser, openAuthSheet, type Connection } from "./support";`
  - Seed 12 image items in `beforeAll`, prefix `e2e-pwa-`, topics `["astronomy", "botany", "music"]` (the three the test picks in onboarding), `curationScore: 9`, and:

```ts
/**
 * A same-origin image, so the request is real — `image-tile.tsx` sends every http(s) `imageUrl`
 * through `/api/img/[itemId]`, the proxy fetches it (from this very server), answers 200 with an
 * immutable Cache-Control, and the service worker's cache-first image rule stores it. That chain is
 * the assertion on `ambit-images` below; a `data:` pixel would never enter it, and an external URL
 * would make the test depend on somebody else's server. `icon-192.png` is the PWA's own icon.
 */
const IMAGE_URL = "http://localhost:3000/icon-192.png";
```

  - `afterAll`: `await cleanupSeeded(conn, "e2e-pwa-")`.
  - Replace the inline `execFileSync(...)` with `inviteUser(EMAIL)`.
- [ ] **3.2** Run it: `lsof -ti:3000 | xargs kill; bun run e2e:prod`. Expect **42 passed**. Read the spec's own `console.log` lines in the output — `SW:`, `CACHES:`, `OFFLINE TILES:` — and record them for the walkthrough. If `ambit-images` is still empty, check the trace for the `/api/img/<id>` responses: a 404 means the seeded URL was not `http(s)`; a 502 means the proxy couldn't fetch its own origin (report — that is a real finding about `next start`).
- [ ] **3.3** `bun run check` green. Commit: `test(e2e): pwa spec seeds a same-origin corpus so it passes on an empty database`.

*Done = `bun run e2e:prod` 42 passed on this machine; the PWA spec's cache assertions pass against seeded rows alone (verify by running it against a database with no other `e2e` rows if you want certainty: it must not depend on the dev corpus).*

### T4 — `bun run e2e:clean`: retire accumulated e2e users

Every spec leaves its user row behind by design (timestamped addresses never collide). Across a week that is hundreds of `user` rows and thousands of `seen_item` rows in the dev database — the accumulation CLAUDE.md's `gallery.spec:193` note blames for the local flake. CI never needs this; it starts empty.

- [ ] **4.1** Create `scripts/e2e-clean.ts`:

```ts
// Retire the users the e2e suite leaves behind (`e2e/*.spec.ts` sign up a fresh, timestamped
// `ambit-…@example.com` address per run by design) and every row that hangs off them. Dry-run by
// default; `--confirm` deletes. Run with `bun run e2e:clean [--confirm]`.
//
// Local only. CI gets a fresh database per run (Phase 7.1) and never needs this. Locally it is the
// remedy for the accumulation CLAUDE.md's gallery.spec:193 note describes — hundreds of users and
// thousands of `seen_item` rows from repeated suites, on a box that also runs the dev server.
//
// **Delete order matters.** Only `session` and `account` cascade from `user`; `user_topic`,
// `collection`, `saved_item` and `seen_item` reference it without `onDelete`, so they go first.
// `verification` rows (reset tokens) carry no FK and expire on their own — left alone. The
// `invite` row for each address goes too, so a rerun of the same timestamp could never be "already
// invited" (it can't happen — `Date.now()` — but the table should not keep a stub per run either).
import { inArray, like } from "drizzle-orm";

import { db } from "~/server/db/client";
import {
  collection,
  invite,
  savedItem,
  seenItem,
  user,
  userTopic,
} from "~/server/db/schema";

/** Every e2e spec's address shape. Real readers never sign up under example.com. */
const PATTERN = "ambit-%@example.com";

async function main() {
  const confirm = process.argv.includes("--confirm");

  const users = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(like(user.email, PATTERN));
  const ids = users.map((u) => u.id);

  // `db.$count` (drizzle-orm ≥ 0.36; the repo is on 0.45) — a `SELECT count(*)`, so it works for
  // the two tables with composite primary keys and no `id` column (`user_topic`, `seen_item`).
  const [seen, saved, topics, collections] =
    ids.length === 0
      ? [0, 0, 0, 0]
      : await Promise.all([
          db.$count(seenItem, inArray(seenItem.userId, ids)),
          db.$count(savedItem, inArray(savedItem.userId, ids)),
          db.$count(userTopic, inArray(userTopic.userId, ids)),
          db.$count(collection, inArray(collection.userId, ids)),
        ]);

  console.log(
    `e2e users: ${users.length} · seen_item ${seen} · saved_item ${saved} · user_topic ${topics} · collection ${collections}`,
  );
  if (!confirm) {
    console.log("Dry run. Re-run with --confirm to delete.");
    process.exit(0);
  }
  if (ids.length === 0) process.exit(0);

  await db.delete(seenItem).where(inArray(seenItem.userId, ids));
  await db.delete(savedItem).where(inArray(savedItem.userId, ids));
  await db.delete(collection).where(inArray(collection.userId, ids));
  await db.delete(userTopic).where(inArray(userTopic.userId, ids));
  await db.delete(user).where(inArray(user.id, ids)); // session + account cascade
  await db.delete(invite).where(like(invite.email, PATTERN));
  console.log(`Deleted ${users.length} users and their rows.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("e2e-clean failed:", err);
  process.exit(1);
});
```

  `seen_item` and `user_topic` have composite primary keys and **no `id` column** — do not "simplify" the counts into `select({ id })` calls; they won't typecheck.
- [ ] **4.2** Run `bun run e2e:clean` (dry run) and record the numbers for the walkthrough — this is the first measurement of how much the suite has accumulated. Then `bun run e2e:clean --confirm`, then `bun run e2e:clean` again → `e2e users: 0`. Then `bun run e2e` → 41 passed (the suite makes its own users).
- [ ] **4.3** `bun run check` green. Commit: `feat(scripts): e2e:clean retires accumulated e2e users (dry-run by default)`.

*Done = a dry run prints counts and deletes nothing; `--confirm` empties them; the suite is unaffected.*

### T5 — The `e2e` job in `.github/workflows/ci.yml`

- [ ] **5.1** Replace the header comment (lines 3–5: "Playwright/e2e stays out of this workflow until Phase 7.1…") with the two-job description: `check` (typecheck/lint/format/unit/build, no database) and `e2e` (service containers → migrate → seed → unit+integration → build → Playwright against `next start`).
- [ ] **5.2** Append the job. Keep the placeholder secret obviously fake; keep `DATABASE_URL` identical to the compose one so the two definitions are visibly twins:

```yaml
  # End-to-end: the Playwright suite against a PRODUCTION build (Phase 7.1, decision D1), a fresh
  # Postgres and a Mailpit — the two services docker-compose.yml provides locally, here as GitHub
  # service containers. The job runs directly on the runner, so both services must map their ports
  # to localhost (they are unreachable by service name from the host). The runner waits on each
  # container's --health-cmd before the first step runs.
  #
  # Runs alongside `check`, not after it (decision D7): a typecheck failure costs a few wasted
  # runner minutes here, while `needs: check` would add them to every green run.
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: ambit
          POSTGRES_PASSWORD: ambit
          POSTGRES_DB: ambit
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U ambit -d ambit"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 15
      mailpit:
        # The image's own HEALTHCHECK is `/mailpit readyz`; spelled out so the runner gates on it.
        image: axllent/mailpit
        ports:
          - 1025:1025
          - 8025:8025
        options: >-
          --health-cmd "/mailpit readyz"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 15
    env:
      # The same values the local .env.example documents. `~/env` reads them from the process
      # environment; there is no .env file in CI and the specs' connect() tolerates that.
      DATABASE_URL: postgres://ambit:ambit@localhost:5432/ambit
      BETTER_AUTH_SECRET: ci-e2e-placeholder-secret-never-used-for-anything-real
      BETTER_AUTH_URL: http://localhost:3000
      # No RESEND_API_KEY on purpose: getMailer() then targets Mailpit on localhost:1025 even
      # under NODE_ENV=production, which `next start` sets.
      E2E_PROD: "1"
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      # Chromium is ~150 MB; cache the download between runs. `--with-deps` still runs on a cache
      # hit — it is what installs the OS libraries, which the cache does not cover — but skips the
      # download itself. Keyed on the lockfile so a Playwright bump refreshes the browser.
      - uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}
      - run: bunx playwright install --with-deps chromium

      # The real migration journal (drizzle/), not `db:push` — decision D4: this is the first
      # automated proof it applies cleanly to an empty database, the path 8.1's deploy will take.
      - run: bun run db:migrate
      - run: bun run db:seed

      # With DATABASE_URL present the five `describe.skipIf(!process.env.DATABASE_URL)` suites run
      # here for the first time in CI (decision D5). The `check` job still runs the rest without one.
      - run: bun run test

      - run: bun run build
      - run: bun run e2e

      # Traces are recorded on first retry (playwright.config.ts) — so a failing test leaves one.
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-traces
          path: .playwright/test-results/
          retention-days: 7
```

- [ ] **5.3** Add to `docker-compose.yml`'s header comment one sentence: *"CI defines the same two services as GitHub service containers in `.github/workflows/ci.yml` (Phase 7.1) — change credentials, images or ports in both places."*
- [ ] **5.4** Update the two comments that describe CI as database-less: `vitest.config.ts` (the "Silently a no-op in CI, which has no .env file at all" paragraph — now: the `check` job has none and its DB tests skip; the `e2e` job supplies `DATABASE_URL` and runs them) and `src/server/db/items.integration.test.ts:5`.
- [ ] **5.5** `bun run check` green. Commit: `ci: e2e job — service containers, migrations, integration tests, Playwright against next start`. **Push the branch and open a PR** (`gh pr create --fill`); CI runs on `pull_request`.
- [ ] **5.6** Watch both jobs (`gh pr checks --watch`). Iterate on the *workflow* only; the suite itself was proven locally in T3. What to expect and what it means:
  - **Service never healthy** → the `options:` line; check the `Initialize containers` log. Postgres's health-cmd needs the `-U ambit -d ambit` flags because the default role is `postgres`.
  - **`db:migrate` fails** → a real finding about the journal (D4's whole point). Record it; do not switch to `db:push` without reporting.
  - **An integration test fails only in CI** → it assumed rows the dev database happens to have. Fix the *test's* fixture (it should seed what it reads), not the workflow.
  - **Playwright times out on the first `[data-feed-id]`** → the seeded corpus didn't draw; check that `db:seed` ran (item → topic FK) and that the spec's `TOPICS` match its onboarding picks.
  - **`fetchResetLink` throws** → Mailpit's 8025 mapping, or the mail went to Resend (check no `RESEND_API_KEY` is set at repo level).
  - **429s in a trace** → a real rate-limit finding; report with the trace, don't raise limits.
  - **`gallery.spec:193` red** → CI has no accumulated state, so this is *not* the local flake. Retry once via the workflow's own `retries: 2`; if it fails every attempt, download the trace and report.
  Every iteration is a commit on the branch; squash them into one `ci:` commit before merge if there were more than two.

*Done = both jobs green on the PR; the `e2e` job log shows migrations applied, `bun run test` with the integration suites **not** skipped (look for the `feed.integration` / `routers.integration` file lines in Vitest's output), and `42 passed`.*

### T6 — Docs in this repo

- [ ] **6.1** `SPEC.md` §12, Playwright paragraph: replace "(… local-only until Phase 7.1 gives CI a Postgres)" and the "Still to come" list with the current inventory — 8 specs / 42 tests; every flow named in the original list is covered except the swipe gestures, which are covered at the hook level (`use-swipe-back.test.tsx`, `use-rail-gestures.test.tsx`) and on device passes because Playwright cannot compose multi-pointer/velocity gestures reliably; CI runs the suite against a production build (Phase 7.1). Add one sentence on the two local scripts (`e2e:prod`, `e2e:clean`).
- [ ] **6.2** `docs/BUILD_PLAN.md` 7.1: tick, and append the *Done =* record in the style of the 6.x entries: what it turned out to be (the suite already existed; 7.1 was the CI wiring, the production-build decision, the PWA spec joining, and the integration tests running in CI for the first time), the decisions D1–D8 in one line each, and the walkthrough pointer. Update the Phase 5 status italic ("Next: Phase 7") to "Next: 7.2".
- [ ] **6.3** `CLAUDE.md`: in *Local dev environment*, the `gallery.spec:193` paragraph gains the remedy — `bun run e2e:clean --confirm` — and the clause that CI never sees the accumulation; and the "Repository status" paragraph's "**Next: Phase 7.**" becomes "7.1 shipped <date> (e2e in CI against a production build). **Next: 7.2.**".
- [ ] **6.4** `bun run check` green (`format:check` does not cover `.md`; the docs just need to read well). Commit: `docs: 7.1 recorded — SPEC §12, BUILD_PLAN, CLAUDE.md`.

### T7 — Walkthrough, log, merge

- [ ] **7.1** Write `docs/PHASE7_WALKTHROUGH_7.1.md` in the shape of `docs/PHASE6_WALKTHROUGH_6.3.md`: executed-against header; then the numbers this plan asked you to record — the local `e2e:prod` result and the PWA spec's `SW:` / `CACHES:` / `OFFLINE TILES:` lines (T3.2), the `e2e:clean` dry-run counts (T4.2), the CI job's wall-clock for both jobs and the integration-test lines from its Vitest output (T5.6) — and a section *What the plan got wrong*, even if it is one line saying nothing did.
- [ ] **7.2** `log.md`: extend today's entry (or start one — one heading per day, newest on top, per CLAUDE.md's format), **Shipped / Decisions / Open-next**, ending with the session-spend line produced by `python3 ~/.claude/scripts/session-spend.py --session <your-session-uuid>` (the second-to-last component of your scratchpad path). Omit the line if the script exits non-zero.
- [ ] **7.3** Final `bun run check` and `bun run e2e` green; CI green on the PR's last commit. Merge: `git checkout main && git merge --no-ff feat/7.1-e2e-ci && git push`. Confirm the `push` to `main` also runs both jobs green.

---

## Verification (the done-bar, end to end)

1. `bun run e2e` locally: 41 passed against the dev server — unchanged.
2. `bun run e2e:prod` locally: 42 passed against a production build, including `pwa.prod.spec.ts`.
3. GitHub Actions on the PR and on `main`: `check` green; `e2e` green with migrations applied from the journal, the integration suites executed (not skipped), and 42 passed.
4. `grep -rn "until Phase 7.1" --include='*.ts' --include='*.yml' .` (outside `docs/` and `log.md`) prints nothing.
5. `bun run e2e:clean` prints counts and deletes nothing without `--confirm`.

## Out of scope (resist)

- **Making `gallery.spec:193` robust.** If CI shows it green run after run, that is evidence for CLAUDE.md's diagnosis (local state), not a fix. Note the CI record in the walkthrough; leave the CLAUDE.md note in place with the remedy added (T6.3).
- Running Firefox/WebKit projects, sharding, or more than one CI worker. One worker is the deliberate choice in the config; revisit only if the job's wall-clock becomes a problem.
- Uploading the `.next` build from `check` to `e2e` to save a build. A second build is a couple of minutes; the coupling is not worth it yet.
- Rate-limit changes, security headers, CSP — **7.2**. Image caching, feed latency, Lighthouse — **7.3**.
- Blog #2 (Public Domain Review / Tumblr walks) — after beta, via the trial loop (BUILD_PLAN 9.6).
