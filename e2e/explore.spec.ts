import { expect, type Page, test } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  seedFeedCorpus,
  summonPhoneChrome,
  tapInPlace,
  waitForFeedToSettle,
  waitForHydration,
  type Connection,
} from "./support";

// `/` — the signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md; built as
// `/explore`, the front door since the same evening). The real feed engine composing for nobody:
// the cold-start sampler over the sixteen original topics, so the fixtures below live in three
// of those and carry their memberships, with no user anywhere — which is what makes this the
// cold-start path on CI's fixtures-only database too.
//
// Nothing here is acked, so loads of `/` spend no corpus; the seed only has to fill a page or
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
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
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
    await page.goto("/");
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

  // The toolbar is the app's own (09-26-26): no header. Profile and Save lead somewhere a
  // stranger can't go, so each raises the sign-up card in place; Feed scrolls to the top; a feed
  // has no Share.
  test("the pill's Profile and Save raise the sign-up card; Feed scrolls to the top", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page, "[data-feed-id] > *");
    await waitForOverture(page);
    await expect(page.locator("header")).toHaveCount(0);
    const pill = page.getByTestId("pill-toolbar");
    await expect(pill).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

    await pill.getByRole("button", { name: "Profile" }).click();
    const sheet = page.getByTestId("auth-sheet");
    await expect(sheet).toHaveAttribute("data-open", "true");
    await expect(
      page.getByPlaceholder("What should we call you?"),
    ).toBeInViewport();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: "Back to exploring" }).click();
    await expect(sheet).toHaveAttribute("data-open", "false");

    await pill.getByRole("button", { name: "Save to collection" }).click();
    await expect(sheet).toHaveAttribute("data-open", "true");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-open", "false");

    await page.mouse.wheel(0, 3_000);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await pill.getByRole("button", { name: "Feed" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test("'what is this?' opens the about dialog", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/?open=signup");
    await expect(
      page.getByPlaceholder("What should we call you?"),
    ).toBeInViewport();
    // Arriving with the sheet up, there is no overture to wait through — the landing's own rule.
    await expect(page.getByTestId("overture")).toHaveCount(0);
  });

  test("a tile opens the item page, and leaving it comes back to /explore", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page, "[data-feed-id] > *");
    await waitForOverture(page);
    await waitForFeedToSettle(page);
    // An *image* tile: an article opens the reader page, which has no "Keep exploring" link, and
    // on the fixture corpus the draw sometimes puts an article first. `:not(:has(h2))` because a
    // writing tile has a picture too, with its title over it (writing Phase 4).
    const tile = page
      .locator("[data-feed-id]:has(img):not(:has(h2)) > *")
      .first();
    await tapInPlace(page, tile);
    await page.waitForURL(/\/i\//);
    // The join card under the picture offers the way back to the taste.
    await expect(
      page.getByRole("link", { name: "Keep exploring" }),
    ).toBeVisible();
    // The toolbar is there for a stranger too: a tap on the picture brings it up (on a phone a tap
    // is the chrome's only toggle — `summonPhoneChrome`), Save raises the sign-up card over the
    // picture — no navigation — and Escape closes the card, not the page.
    await summonPhoneChrome(page);
    const pill = page.getByTestId("pill-toolbar");
    await expect(pill).toHaveAttribute("aria-hidden", "false");
    // Share is the detached disc beside the pill, not a control in it. Asked of the `<nav>`: the
    // disc is a child of the `pill-toolbar` wrapper (the grid that centres both), so asking the
    // wrapper for "no Share" only ever passed by catching the chrome mid-fade.
    await expect(
      pill
        .getByRole("navigation", { name: "Ambit toolbar" })
        .getByRole("button", { name: "Share" }),
    ).toHaveCount(0);
    await expect(pill.getByRole("button", { name: "Share" })).toBeVisible();
    await pill.getByRole("button", { name: "Save to collection" }).click();
    const sheet = page.getByTestId("auth-sheet");
    await expect(sheet).toHaveAttribute("data-open", "true");
    await expect(page).toHaveURL(/\/i\//);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-open", "false");
    await expect(page).toHaveURL(/\/i\//);
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    // Back pops to the feed that was already there — the overture is once per document load.
    await expect(page.getByTestId("overture")).toHaveCount(0);
  });

  test("`/explore` is a permanent redirect to `/`, `?open=` and all", async ({
    page,
    request,
  }) => {
    const res = await request.get("/explore", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toBe("/");
    await page.goto("/explore?open=signup");
    await expect(page).toHaveURL(/\/\?open=signup$/);
    await expect(
      page.getByPlaceholder("What should we call you?"),
    ).toBeInViewport();
  });

  test("an invited visitor signs up from the about dialog, and / then sends them on", async ({
    page,
  }) => {
    await page.goto("/");
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

    // Signed in, the taste is not for them: `/` sends a reader to the feed — which, for an
    // account with no picks yet, hands them straight on to onboarding.
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
