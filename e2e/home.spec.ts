import { expect, test, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  openAuthSheet,
  seedLandingPool,
  type Connection,
} from "./support";

// The landing (8.3, docs/DESIGN_landing-redo.md): an overture on black (~3.6 s), then a reel of
// server-picked pictures that hands off to the sign-in sheet. Both halves of that handoff are
// pinned: it must complete on its own for a reader who waits, and be skippable for one who
// doesn't — every auth test depends on the second (`openAuthSheet`), so a regression there would
// surface as the whole suite timing out rather than as a landing bug.
//
// Six landing-eligible fixtures, so CI's fixture-only database has a reel to step through. The
// real corpus (local `e2e:prod`) has ~2,700 more; either way the pool is non-empty, so this file
// never sees the fallback picture — that branch is unit-tested (landing-pool.test.ts).
const PREFIX = "e2e-home-";
let conn: Connection;

test.beforeAll(async () => {
  conn = await connect();
  await seedLandingPool(conn, PREFIX, 6);
});

test.afterAll(async () => {
  await cleanupSeeded(conn, PREFIX);
});

/** The id of the picture on screen, or null while the overture owns the screen or mid-fade. */
const visibleId = (page: Page) =>
  page
    .locator("[data-testid='landing-reel'] img")
    .evaluateAll(
      (imgs) =>
        imgs
          .find((i) => getComputedStyle(i).opacity === "1")
          ?.getAttribute("data-id") ?? null,
    );

test("home page renders with no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the overture plays, the reel cuts in, and the sheet rises on its own", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("overture-tail")).toBeVisible();
  // The tail unmounts on the frame the reel cuts in.
  await expect(page.getByTestId("overture-tail")).toHaveCount(0, {
    timeout: 8_000,
  });
  await expect.poll(() => visibleId(page), { timeout: 8_000 }).toBeTruthy();
  // cut: ~3.6 s + 12 × 350 ms ≈ 8 s; dissolve: ~3.6 s + 12 s. 20 s covers either default.
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 20_000,
  });
});

test("the glyph opens the sign-in sheet early", async ({ page }) => {
  await page.goto("/");
  await openAuthSheet(page);

  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

// A click on the imagery means "next". `force: true` because the reel is `aria-hidden` (the glyph
// is its accessible control), and Playwright's actionability check otherwise refuses it.
test("clicking the imagery changes the picture, and the pictures keep moving behind the sheet", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => visibleId(page), { timeout: 8_000 }).toBeTruthy();
  const first = await visibleId(page);
  await page
    .locator("[data-testid='landing-reel']")
    .click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(() => visibleId(page)).not.toBe(first);

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 20_000,
  });
  // Behind the sheet the reel runs the dissolve gear: a change within frame + fade (8.5 s).
  await expect.poll(() => visibleId(page), { timeout: 5_000 }).toBeTruthy();
  const behind = await visibleId(page);
  await expect
    .poll(() => visibleId(page), { timeout: 12_000 })
    .not.toBe(behind);
});

// The hydration regression test (09-10-26): the collapse disc was an inert <div> on the client for
// any reader whose OS asks for reduced motion. Emulated here, because that reader is exactly the
// one the bug reached; meaningful only against a production build, where it was React #418.
test("the sheet's disc collapses it back to the reel, reduced motion included", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
  await expect(page.getByTestId("overture")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(
    page.getByRole("button", { name: "Open sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();

  expect(consoleErrors).toEqual([]);
});

// The LCP line of the budget: the first pictures are preloads in the served HTML. Only meaningful
// when the reel is proxied pictures — the fixture pixels are `data:` URLs, inline already, and get
// no preload by design, so on CI's fixture-only database this skips honestly.
test("the served HTML preloads the first picture with its srcset", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  test.skip(
    !html.includes('src="/api/img/'),
    "the reel is fixture pixels (CI); nothing to preload",
  );
  expect(html).toMatch(
    /<link rel="preload" as="image"[^>]*imageSrcSet="\/api\/img\/[^"]+\?w=960 960w/,
  );
});
