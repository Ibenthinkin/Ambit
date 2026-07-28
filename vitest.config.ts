import { defineConfig } from "vitest/config";

// Vitest owns fast, isolated unit tests against plain functions (SPEC §12: adapter `toItem`
// normalization, feed merge/weighting logic, etc. as those land). It's Vite-powered, so files
// run directly against TS source with no separate build step — the tradeoff for that speed is
// that it's a Node/jsdom sandbox, not a real browser, which is why rendered-page behavior
// (does the page actually paint, any console errors) is Playwright's job instead (see
// playwright.config.ts + e2e/).
export default defineConfig({
  test: {
    // No component rendering happens in *.test.ts files (yet), so the plain Node environment is
    // enough and meaningfully faster than spinning up jsdom's fake DOM per file.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
