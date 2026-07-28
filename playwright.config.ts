import { defineConfig, devices } from "@playwright/test";

// Playwright drives a real Chromium instance against the actual rendered app — the "does this
// genuinely work in a browser" layer above Vitest's function-level unit tests (SPEC §12).
// `bun run e2e` runs this config; see e2e/home.spec.ts for the one smoke test Phase 1.2 adds.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // `test.only` is handy locally to focus one spec while iterating, but it's exactly the kind of
  // thing that should never silently ship — CI fails the run outright if one slips into a commit.
  forbidOnly: !!process.env.CI,
  // Flaky-network/timing retries make sense on a shared CI runner; locally a failure should mean
  // something's actually broken, so don't mask it with an automatic retry.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // Only capture the expensive step-by-step trace on a retry, i.e. when a test already failed
    // once — cheap to skip on the common case of everything passing first try.
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // `webServer` makes Playwright boot the app itself and poll `url` until it responds, so
  // `bun run e2e` works standalone — no need to have `bun run dev` already running in another
  // terminal. Not wired into CI yet: the app needs a reachable Postgres to render anything past a
  // clean 500 (see e2e/home.spec.ts's comment), and CI doesn't get one until Phase 7.1 adds
  // docker-compose Postgres to the workflow — until then this is a local-only check.
  webServer: {
    command: "bun run --bun next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
