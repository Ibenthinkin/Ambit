import { defineConfig, devices } from "@playwright/test";

// Playwright drives a real Chromium instance against the actual rendered app — the "does this
// genuinely work in a browser" layer above Vitest's function-level unit tests (SPEC §12).
// `bun run e2e` runs this config; see e2e/home.spec.ts for the one smoke test Phase 1.2 adds.
export default defineConfig({
  testDir: "./e2e",
  // `*.prod.spec.ts` is excluded from the ordinary suite because it cannot pass against it: the
  // service worker is registered in production builds only (see `app/layout.tsx`), and `webServer`
  // below runs `next dev`. Run it deliberately, against a real build:
  //
  //   lsof -ti:3000 | xargs kill; bun run build && bun run start &
  //   bunx playwright test pwa.prod.spec.ts --workers=1
  //
  // It is the only automated check of the caching strategy — offline feed, offline fallback, and
  // the invariant that no personalized tRPC response is ever stored.
  testIgnore: /\.prod\.spec\.ts$/,
  // **A dot-directory on purpose, and load-bearing.** Playwright's default `test-results/` sits in
  // the project root, where it writes traces, screenshots and error-context files *while the tests
  // are still running*. Next's dev-server watcher sees those writes as project changes and fires
  // Fast Refresh — which remounts the app mid-test. Under parallel workers that reliably killed an
  // in-flight sign-in: the click landed, `router.push("/feed")` was swallowed by the rebuild, and
  // the test sat on `waitForURL` until it timed out. It looked exactly like a flaky app and wasn't
  // one; the smoking gun was `[Fast Refresh] rebuilding` in the failing run's trace. Turbopack
  // ignores dot-directories, so moving the output here takes the watcher out of the loop.
  outputDir: "./.playwright/test-results",
  fullyParallel: true,
  // **Capped, deliberately.** Playwright's default is half the machine's cores, which put five
  // workers on this box — and from 5.9 onward that was reliably too many. The failure is always the
  // same shape and never the same test: a server-bound wait (a feed compose, a save's three
  // invalidation refetches, a `waitForURL` behind a dynamic route) outlives its allowance because
  // four other workers are driving the same single dev server and the same Postgres. Each phase's
  // reflex was to raise that one assertion's timeout, which moved the failure rather than fixing it.
  //
  // 5.10 makes six spec files, and PHASE5_PLAN_5.10.md §5 named this the moment to stop: cap the
  // workers instead. Three keeps the wall clock close (the suite is I/O-bound on one dev server, so
  // the fifth and fourth workers were buying very little) and takes the contention out. The
  // per-assertion 15s allowances already in the specs stay as they are — they're honest about a
  // dynamic feed being slow, and they're what makes three workers enough.
  //
  // CI gets one worker: it has no Postgres until Phase 7.1, and when it does it'll be a smaller box
  // than this one.
  workers: process.env.CI ? 1 : 3,
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
