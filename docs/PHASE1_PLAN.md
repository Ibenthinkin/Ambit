# Phase 1 — Scaffold & tooling: detailed execution plan

> Companion to [`BUILD_PLAN.md`](BUILD_PLAN.md) Phase 1 (steps 1.1–1.3). Written 07-17-26 after the
> gate decisions landed; Ben is executing this himself as a learning exercise. Check BUILD_PLAN
> boxes as each step's *Done =* line is met.

## Context

Phase 0 closed 07-13-26: the tiered topic-drift feed over an LLM-curated pool passed the feel gate,
and the docs were swept to match. The repo is pre-scaffold — no application code yet. This plan
executes BUILD_PLAN Phase 1: scaffold the Next.js/Bun/tRPC/Drizzle app, stand up quality tooling +
CI, and add the PWA shell.

**Gates settled 07-17-26:** lint/format = **ESLint + Prettier** (the t3 default — zero swap-out
work); PWA = **`@serwist/next`**; SPEC §15's visual-embeddings and `--favorites` questions recorded
as **provisional keep**.

**Cross-cutting:** this project doubles as stack-learning. Every step ships with generous
explanatory comments in config and code — what each piece is *for*, not just what it does.

**Key findings from the 07-17 docs research** (current-docs check on the libraries involved):

- `bun create t3-app@latest` works and uses Bun as the package manager when invoked that way.
  Non-interactive scaffolding needs the `--CI` flag before the feature flags do anything; omitting
  `--nextAuth` scaffolds **no auth provider**. Better Auth is still not a create-t3-app option
  (open issues since 2024) — it gets hand-wired in Phase 2.2, exactly as SPEC §14 already plans.
- The t3 template may still be on **Next 15 / Tailwind v3** (changelog confirms Next 15; no
  evidence of 16 or Tailwind 4). Inspect the generated `package.json` and upgrade to current
  stable as part of 1.1 — greenfield project, no reason to start stale. Fallback if the template
  fights the upgrade: hand-scaffold with `create-next-app` + manual tRPC/Drizzle wiring.
- **Serwist does not support Turbopack** (Next 16's default dev bundler) — its build step needs
  webpack. Strategy: disable the SW in dev, keep Turbopack for daily dev, verify PWA behavior on
  production builds (`next build` + `next start`).
- **Bun-as-runtime for Next.js has open issues** (e.g. Next 16 Cache Components broken under Bun
  1.3.7 — oven-sh/bun#26508). `bun install` is universally safe. Keep the SPEC §13 `--bun`
  scripts but explicitly verify dev + build under the Bun runtime; if flaky, drop `--bun` (Node
  runtime, Bun package manager) and record the decision in SPEC §13.

---

## Step 0 — Record the settled gates (docs-only) ✅ done 07-17-26

Done in the same commit that added this file: SPEC §15 gained the "provisionally settled" entries
(visual embeddings → future "more like this look" save-affordance; `--favorites` → planned for
onboarding alongside the taste picker; final calls when each is built); BUILD_PLAN's two stale
pre-pivot lines fixed (3.3's *Done* line, 4.1's body — both still referenced `nearestNeighbors`);
gates recorded (1.2 ESLint + Prettier, 1.3 `@serwist/next`); log.md entry written.

## Step 1 — 1.1 Scaffold the app

1. Scaffold into a scratch dir (repo root is non-empty):

   ```sh
   bun create t3-app@latest ambit-scaffold --CI --trpc --tailwind --drizzle --dbProvider postgres --appRouter --noGit
   ```

   No `--nextAuth` → no auth provider in the scaffold.
2. Inspect `package.json`: if Next < 16 / Tailwind < 4, upgrade to current stable within this step
   and re-verify the app still serves. Pin exact versions (no `^`) per BUILD_PLAN 1.1.
3. **Merge into repo root** (SPEC wants one app at root): move scaffold files in, keeping t3's
   `src/` layout — SPEC paths map as `app/*` → `src/app/*`, `server/*` → `src/server/*`. Preserve
   `README.md`, `LICENSE`, `CLAUDE.md`, `log.md`, `docs/`, `phase0/`; merge `.gitignore` and
   `.env.example` (t3's `src/env.js` schema becomes the typed home for env vars — carry the
   existing keys over as they become real). Exclude `phase0/` from `tsconfig`/lint so throwaway
   code doesn't fail checks.
4. Wire `package.json` scripts per SPEC §13 (`bun run --bun next dev|build|start`; `ingest`
   placeholder). **Bun-runtime checkpoint:** verify `bun run dev` *and* `bun run build` actually
   work under `--bun`; if not, switch to the Node runtime, keep Bun as package manager, record the
   caveat in SPEC §13.
5. TypeScript strict (t3 default) stays on.
6. Teaching pass: explanatory header comments in `next.config`, `src/env.js`,
   `drizzle.config.ts`, the tRPC plumbing (`src/server/api/trpc.ts` is the densest — annotate
   what context/procedures/middleware each are for), and the Tailwind setup.
7. Commit. ***Done =** starter app serves under Bun; committed.*

## Step 2 — 1.2 Quality tooling + CI

1. Keep the scaffold's **ESLint + Prettier** (incl. `prettier-plugin-tailwindcss`,
   typescript-eslint, the drizzle plugin) — settled at the gate; confirm they run under Bun.
2. **Vitest**: add with one real-but-minimal unit test (a small `src/lib/` pure function, so the
   placeholder test isn't fake).
3. **Playwright**: install + minimal config + one smoke e2e (home page renders, no console
   errors) against the dev server.
4. `bun run check` meta-script: typecheck → lint → format check → unit tests.
5. **GitHub Actions** (`.github/workflows/ci.yml`): `oven-sh/setup-bun`,
   `bun install --frozen-lockfile`, `bun run check`, `bun run build`. E2e stays out of CI until
   7.1 (needs compose services). Push and confirm green.
6. Teaching pass: comments in the workflow + configs explaining each job/choice.
7. Commit. ***Done =** CI green on main; placeholder unit + e2e pass.*

## Step 3 — 1.3 PWA shell (`@serwist/next`)

1. Install `@serwist/next` (+ dev `serwist`). In `next.config`, wrap with
   `withSerwistInit({ swSrc: "src/app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development" })`.
   Create `src/app/sw.ts`: precache manifest (`self.__SW_MANIFEST`), `defaultCache` runtime
   caching, offline fallback shell. tsconfig: add `@serwist/next/typings` + `webworker` lib,
   exclude `public/sw.js`; gitignore `public/sw*`.
2. **Manifest** via App Router convention `src/app/manifest.ts`: name "Ambit",
   `theme_color`/`background_color` `#161411`, display `standalone`. Icons: extract the
   ring-and-dot logo from the design handoff prototypes → 192/512 + maskable PNGs in `public/`.
3. **Turbopack strategy** (the known Serwist limitation): daily dev stays on Turbopack with the
   SW disabled; PWA behavior verified on `bun run build` + `bun run start`. Document the tradeoff
   in a comment at the serwist config.
4. Verify installability with a Lighthouse audit against the production build
   (`bunx lighthouse` or Chrome DevTools).
5. Teaching pass: `sw.ts` gets the fullest comments — the service-worker lifecycle is the least
   familiar part of the stack.
6. Commit; update log.md (Phase 1 complete); check the three BUILD_PLAN boxes.

## Verification

- **Step 1:** `bun run dev` serves the starter; `bun run build` succeeds; both observed under the
  Bun runtime (or the Node fallback recorded in SPEC §13).
- **Step 2:** `bun run check` passes locally; the GitHub Actions run on `main` is green;
  Playwright smoke passes.
- **Step 3:** production build + `bun run start` → Lighthouse reports installable; manifest + SW
  served; navigation still works with the SW registered.
- BUILD_PLAN boxes checked only when their *Done =* lines are satisfied, per the tracker's rule.

## Out of scope

Phase 2 (Docker Postgres + Drizzle schema, Better Auth + invite gating, topic seeds) gets its own
plan; nothing in Phase 1 creates DB tables or auth.
