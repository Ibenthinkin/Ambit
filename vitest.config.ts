import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest itself runs under plain Node (its bin shebangs #!/usr/bin/env node — `bun run test`
// still spawns that), which unlike Bun does not auto-load .env. Items.integration.test.ts (Phase
// 3.3) needs DATABASE_URL to reach db/client.ts, so load .env here, once, before the test files
// import anything — this config module runs in Vitest's main process before it forks workers,
// and forked workers inherit process.env as it stands at fork time. Silently a no-op in CI, which
// has no .env file at all (see .github/workflows/ci.yml) — integration tests are written to
// self-skip via describe.skipIf(!process.env.DATABASE_URL) rather than depend on this succeeding.
//
// Both CI jobs still reach the right outcome without the file. The `check` job has no database, so
// the five DB-backed suites skip themselves there, as they always have. The `e2e` job (Phase 7.1)
// puts DATABASE_URL straight into the job environment, which `~/env` reads identically — so those
// five run there, on a Postgres service container. e2e/support.ts's connect() makes the same
// accommodation, for the same reason.
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  // no .env present (CI) — the job environment supplies DATABASE_URL or it genuinely isn't there,
  // and DB-backed tests skip themselves rather than failing
}

// Vitest owns fast, isolated unit tests against plain functions (SPEC §12: adapter `toItem`
// normalization, feed merge/weighting logic, etc.) *and*, as of Phase 5.1, component tests for
// the shared UI primitives. It's Vite-powered, so files run directly against TS/TSX source with
// no separate build step — the tradeoff for that speed is that it's a Node/jsdom sandbox, not a
// real browser, which is why rendered-page behavior (does the page actually paint, any console
// errors) is Playwright's job instead (see playwright.config.ts + e2e/).
export default defineConfig({
  // Vitest is a separate, Vite-based test runner sitting alongside Next's own compiler — it
  // needs its own JSX/TSX transform, which @vitejs/plugin-react provides. Without it, component
  // test files (*.test.tsx) fail to parse JSX at all.
  plugins: [react()],
  resolve: {
    // Mirror tsconfig.json's "~/*" -> "./src/*" path mapping. Next.js/tsc both resolve it via
    // tsconfig automatically; Vite's module resolver doesn't read tsconfig paths on its own, so
    // without this any "~/..." import (server/db/client.ts's "~/env", etc.) fails to resolve the
    // moment a test file pulls it in transitively (items.integration.test.ts, Phase 3.3).
    alias: { "~": new URL("./src", import.meta.url).pathname },
  },
  test: {
    // `globals: true` puts describe/it/expect in global scope (matching the existing *.test.ts
    // style, which imports none of them explicitly) and — the reason it's required now — lets
    // React Testing Library register its own `afterEach(cleanup)` hook automatically, so
    // component tests don't need to call it by hand in every file.
    globals: true,
    // Stays "node" as the *default*: the 172 existing server-side tests are plain functions with
    // no DOM, and spinning up jsdom for every one of them would slow the whole suite for no
    // benefit. Component tests opt into a DOM per-file instead, via a first-line docblock:
    //   // @vitest-environment jsdom
    // right above their imports (Phase 5.1's src/components/ui/*.test.tsx files do this).
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Registers jest-dom's matchers (toBeInTheDocument, toHaveClass, ...) before every test file.
    setupFiles: ["./src/test/setup.ts"],
  },
});
