import { expect, type Page, test } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  seedFeedCorpus,
  tapInPlace,
  waitForFeedToSettle,
  waitForHydration,
  type Connection,
} from "./support";

// `/explore` — the signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md). The real
// feed engine composing for nobody: the cold-start sampler over the sixteen original topics, so
// the fixtures below live in three of those and carry their memberships, with no user anywhere —
// which is what makes this the cold-start path on CI's fixtures-only database too.
//
// Nothing here is acked, so /explore loads spend no corpus; the seed only has to fill a page or
// two. As everywhere in the suite, assertions are about behaviour — tiles, a block, where a tap
// leads — never about which item appears.
const PREFIX = "e2e-explore-";
const EMAIL = `ambit-explore-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

let conn: Connection;

/** The overture (~3.6 s) owns the screen on every document load; nothing under it takes a tap. */
async function waitForOverture(page: Page) {
  await expect(page.getByTestId("overture")).toHaveCount(0, { timeout: 8_000 });
}

test.describe.serial("explore", () => {
  test.beforeAll(async () => {
    conn = await connect();
    await seedFeedCorpus(conn, PREFIX, 60, ["astronomy", "botany", "music"]);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  test("a signed-out visitor sees the feed and a message block", async ({
    page,
  }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/explore$/);
    // The landing's opening line stands in for the loading screen, then cuts to the feed.
    await expect(page.getByTestId("overture-tail")).toBeVisible();
    await expect(page.getByTestId("explore-curtain")).toBeVisible();
    await waitForOverture(page);
    await expect(page.getByTestId("explore-curtain")).toHaveCount(0);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    // Page one's block is "what is this?", after its fourth card.
    await expect(page.locator('[data-explore-message="about"]')).toBeVisible();
  });

  // The whole point of the taste is that it scrolls: page two is a `fetchNextPage`, which tRPC
  // sends with a `direction` key the RSC prefetch of page one never does.
  test("scrolling loads the next page", async ({ page }) => {
    await page.goto("/explore");
    await waitForHydration(page, "[data-feed-id] > *");
    await waitForOverture(page);
    await waitForFeedToSettle(page);
    const first = await page.locator("[data-feed-id]").count();
    const nextPage = page.waitForResponse(
      (r) => r.url().includes("feed.explore") && r.request().method() === "GET",
    );
    await page.mouse.wheel(0, 20_000);
    expect((await nextPage).status()).toBe(200);
    await expect
      .poll(() => page.locator("[data-feed-id]").count())
      .toBeGreaterThan(first);
  });

  test("'what is this?' opens the about dialog", async ({ page }) => {
    await page.goto("/explore");
    await waitForHydration(page, '[data-explore-message="about"] button');
    await waitForOverture(page);
    await page
      .locator('[data-explore-message="about"]')
      .getByRole("button", { name: "Read how it works" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("What is Ambit?")).toBeVisible();
  });

  test("?open=signup opens the card in sign-up", async ({ page }) => {
    await page.goto("/explore?open=signup");
    await expect(
      page.getByPlaceholder("What should we call you?"),
    ).toBeInViewport();
    // Arriving with the sheet up, there is no overture to wait through — the landing's own rule.
    await expect(page.getByTestId("overture")).toHaveCount(0);
  });

  test("a tile opens the item page, and leaving it comes back to /explore", async ({
    page,
  }) => {
    await page.goto("/explore");
    await waitForHydration(page, "[data-feed-id] > *");
    await waitForOverture(page);
    await waitForFeedToSettle(page);
    const tile = page.locator("[data-feed-id] > *").first();
    await tapInPlace(page, tile);
    await page.waitForURL(/\/i\//);
    // The join card under the picture offers the way back to the taste.
    await expect(
      page.getByRole("link", { name: "Keep exploring" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/explore$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    // Back pops to the feed that was already there — the overture is once per document load.
    await expect(page.getByTestId("overture")).toHaveCount(0);
  });

  test("`/` is still the landing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("auth-sheet")).toBeAttached();
  });

  test("an invited visitor signs up from the about dialog, and /explore then sends them on", async ({
    page,
  }) => {
    await page.goto("/explore");
    await waitForHydration(page, '[data-explore-message="about"] button');
    await waitForOverture(page);
    await page
      .locator('[data-explore-message="about"]')
      .getByRole("button", { name: "Read how it works" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign up" })
      .click();

    await page.getByPlaceholder("What should we call you?").fill("Explore E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    // A new account has no picks yet: /feed hands it to onboarding.
    await page.waitForURL(/\/onboarding/);

    // Signed in, /explore is not for them — the same rule as `/`.
    await page.goto("/explore");
    await expect(page).not.toHaveURL(/\/explore/);
  });
});
