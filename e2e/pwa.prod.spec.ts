import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { openAuthSheet } from "./support";

// **Not part of `bun run e2e`** — `playwright.config.ts` ignores `*.prod.spec.ts`, because this
// cannot pass against a dev server: `app/layout.tsx` registers the service worker in production
// only, deliberately (a precaching worker in front of a dev server serves stale chunks and the
// page silently stops responding — the trap that ate an hour of 5.5's device pass).
//
// To run it:
//
//   lsof -ti:3000 | xargs kill; bun run build && bun run start &
//   bunx playwright test pwa.prod.spec.ts --workers=1
//
// It exists because 5.11's caching strategy is otherwise only checkable by hand, and one of its
// claims — "no personalized API response is ever cached" — is exactly the kind that rots quietly.
// It also caught a real regression when it was written: without a trailing catch-all rule in
// `sw.ts`, unmatched navigations never enter Serwist's routing, so the offline fallback page is
// never served and the browser shows its own connection error instead.

const EMAIL = `ambit-pwa-verify-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

test.describe.serial("pwa verification (production build)", () => {
  test("offline: shell + last cached feed, and no personalized API response cached", async ({
    page,
  }) => {
    execFileSync("bun", ["run", "invite", EMAIL], { encoding: "utf-8" });

    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("PWA Verify");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding", { timeout: 15_000 });
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed", { timeout: 15_000 });
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });

    // 1. The service worker actually installs and takes control.
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return {
        scriptURL: reg.active?.scriptURL ?? null,
        state: reg.active?.state ?? null,
      };
    });
    console.log("SW:", JSON.stringify(swState));
    expect(swState.state).toBe("activated");
    expect(swState.scriptURL).toContain("/serwist/sw.js");

    // Give the runtime rules a moment to populate as the page settles, then reload once so the
    // /feed document itself goes through the NetworkFirst handler.
    await page.reload();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(2500);

    // 2. What is actually in Cache Storage.
    const buckets = await page.evaluate(async () => {
      const names = await caches.keys();
      const out: Record<string, string[]> = {};
      for (const name of names) {
        const cache = await caches.open(name);
        out[name] = (await cache.keys()).map((r) => new URL(r.url).pathname);
      }
      return out;
    });
    console.log(
      "CACHES:",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(buckets).map(([k, v]) => [k, v.length]),
        ),
      ),
    );

    const all = Object.values(buckets).flat();
    // The invariant, verified against a real browser rather than a unit test.
    expect(all.filter((p) => p.startsWith("/api/trpc"))).toEqual([]);
    expect(Object.keys(buckets)).not.toContain("apis");
    expect(buckets["ambit-pages"] ?? []).toContain("/feed");
    expect((buckets["ambit-images"] ?? []).length).toBeGreaterThan(0);

    // 3. Offline: the feed renders from cache.
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });
    const offlineTiles = await page.locator("[data-feed-id]").count();
    console.log("OFFLINE TILES:", offlineTiles);
    expect(offlineTiles).toBeGreaterThan(0);

    // 4. Offline: an uncached route falls back to the offline shell, not a browser error page.
    await page.goto("/settings");
    await expect(page.getByText("You're offline")).toBeVisible({
      timeout: 15_000,
    });

    // 5. Back online, then sign out — the cached feed must not outlive the session.
    await page.context().setOffline(false);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const afterSignOut = await page.evaluate(() => caches.keys());
    console.log("CACHES AFTER SIGN OUT:", JSON.stringify(afterSignOut));
    expect(afterSignOut).not.toContain("ambit-pages");
  });
});
