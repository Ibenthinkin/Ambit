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
