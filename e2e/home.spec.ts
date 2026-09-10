import { expect, test } from "@playwright/test";

import { openAuthSheet } from "./support";

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

// The landing screen is a slideshow that hands off to the sign-in sheet (5.11). Both halves of
// that handoff are worth pinning: it must complete on its own for a reader who waits, and it must
// be skippable for one who doesn't — the whole e2e suite depends on the second, so a regression
// there would surface as every auth test timing out rather than as a landing bug.
test("the slideshow resolves into the sign-in sheet on its own", async ({
  page,
}) => {
  await page.goto("/");

  // No interaction at all — 8 slides at 600ms plus the handoff beat, with room for a slow decode.
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
});

test("the glyph opens the sign-in sheet early", async ({ page }) => {
  await page.goto("/");
  await openAuthSheet(page);

  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

// 09-10-26 (docs/DESIGN_screen-structure.md §3): the show never stops, and a click on the imagery
// means "next". `force: true` because the slideshow is `aria-hidden` (the glyph is its accessible
// control), and Playwright's actionability check otherwise refuses it.
test("clicking the imagery changes the slide, and the pictures keep moving behind the sheet", async ({
  page,
}) => {
  await page.goto("/");
  const visible = () =>
    page
      .locator("[data-testid='landing-slideshow'] img")
      .evaluateAll(
        (imgs) =>
          imgs
            .find((i) => getComputedStyle(i).opacity === "1")
            ?.getAttribute("src") ?? null,
      );
  await expect.poll(visible).toBeTruthy();
  const first = await visible();
  await page
    .locator("[data-testid='landing-slideshow']")
    .click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(visible).not.toBe(first);

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
  const behind = await visible();
  await expect.poll(visible, { timeout: 5_000 }).not.toBe(behind);
});

// The hydration regression test: this glyph was an inert <div> on the client until 09-10-26 for
// any reader whose OS asks for reduced motion — the server rendered a <button>, the client didn't.
// Emulated here, because that reader is exactly the one the bug reached; meaningful only against
// a production build (`bun run e2e:prod`), where the mismatch was React #418.
test("the sheet's glyph collapses it back to the slideshow, reduced motion included", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  // Reduced motion arrives with the sheet up; the glyph takes it down, and the other glyph brings
  // it back.
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(
    page.getByRole("button", { name: "Open sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();

  expect(consoleErrors).toEqual([]);
});
