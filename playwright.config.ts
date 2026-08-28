import { defineConfig, devices } from "@playwright/test";

// Playwright drives a real Chromium instance against the actual rendered app — the "does this
// genuinely work in a browser" layer above Vitest's function-level unit tests (SPEC §12).
// `bun run e2e` runs this config; see e2e/home.spec.ts for the one smoke test Phase 1.2 adds.

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

export default defineConfig({
  testDir: "./e2e",
  // `*.prod.spec.ts` is excluded from the **dev-server** run because it cannot pass there: the
  // service worker is registered in production builds only (see `app/layout.tsx`), and `webServer`
  // below runs `next dev` unless `E2E_PROD` says otherwise. Under `E2E_PROD=1` — `bun run e2e:prod`
  // locally, and every CI run since Phase 7.1 — the server is a real build and these specs are an
  // ordinary part of the suite.
  //
  // pwa.prod.spec.ts is the only automated check of the caching strategy — offline feed, offline
  // fallback, and the invariant that no personalized tRPC response is ever stored.
  testIgnore: PROD ? [] : /\.prod\.spec\.ts$/,
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
  // CI gets one worker. Since Phase 7.1 it does have a Postgres of its own (a service container),
  // so the cap is no longer about that — it is that a GitHub runner is a much smaller box than this
  // one, and the contention above bites harder there.
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
  // terminal. Since Phase 7.1 CI boots the server here too: `next start` over the build its own
  // step made, against the job's Postgres and Mailpit service containers (the app needs a reachable
  // Postgres to render anything past a clean 500 — see e2e/home.spec.ts's comment).
  //
  // `reuseExistingServer` is off under `E2E_PROD` as well as in CI: whatever is already on :3000 is
  // far more likely to be a stale `next dev` than the build you just made, and silently testing the
  // wrong server is the worst outcome available here.
  webServer: {
    command: PROD ? "bun run --bun next start" : "bun run --bun next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI && !PROD,
    timeout: 60_000,
  },
});
