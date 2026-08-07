import { defineConfig } from "vitest/config";

// Vitest itself runs under plain Node (its bin shebangs #!/usr/bin/env node — `bun run test`
// still spawns that), which unlike Bun does not auto-load .env. Items.integration.test.ts (Phase
// 3.3) needs DATABASE_URL to reach db/client.ts, so load .env here, once, before the test files
// import anything — this config module runs in Vitest's main process before it forks workers,
// and forked workers inherit process.env as it stands at fork time. Silently a no-op in CI, which
// has no .env file at all (see .github/workflows/ci.yml) — integration tests are written to
// self-skip via describe.skipIf(!process.env.DATABASE_URL) rather than depend on this succeeding.
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  // no .env present (CI) — DB-backed tests skip themselves instead of failing
}

// Vitest owns fast, isolated unit tests against plain functions (SPEC §12: adapter `toItem`
// normalization, feed merge/weighting logic, etc. as those land). It's Vite-powered, so files
// run directly against TS source with no separate build step — the tradeoff for that speed is
// that it's a Node/jsdom sandbox, not a real browser, which is why rendered-page behavior
// (does the page actually paint, any console errors) is Playwright's job instead (see
// playwright.config.ts + e2e/).
export default defineConfig({
  resolve: {
    // Mirror tsconfig.json's "~/*" -> "./src/*" path mapping. Next.js/tsc both resolve it via
    // tsconfig automatically; Vite's module resolver doesn't read tsconfig paths on its own, so
    // without this any "~/..." import (server/db/client.ts's "~/env", etc.) fails to resolve the
    // moment a test file pulls it in transitively (items.integration.test.ts, Phase 3.3).
    alias: { "~": new URL("./src", import.meta.url).pathname },
  },
  test: {
    // No component rendering happens in *.test.ts files (yet), so the plain Node environment is
    // enough and meaningfully faster than spinning up jsdom's fake DOM per file.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
