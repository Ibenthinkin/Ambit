import { expect, test, type Locator } from "@playwright/test";

import {
  cleanupSeeded,
  completeOnboarding,
  connect,
  inviteUser,
  openAuthSheet,
  seedFeedCorpus,
  signIn,
  type Connection,
} from "./support";

// The desktop pass, at 1440×900 (see playwright.config.ts's `desktop` project). Everything the
// phone suite asserts still holds in the `chromium` project; this file only checks what changes
// above `md` — docs/DESIGN_desktop-polish.md §5.
//
// Serial and sharing one signed-up user, the same arrangement as feed.spec.ts. Playwright isolates
// storage per test, so the second test signs in again rather than assuming a cookie carried over.

const EMAIL = `ambit-desktop-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";
const TOPICS = ["astronomy", "botany", "music"] as const;
const PREFIX = "e2e-desktop-";

// Five feed loads at four columns (the chrome redesign added three); 100 rows is that plus
// headroom. See feed.spec.ts's note on why the seed exists at all (CI's database is empty) and
// what it deliberately doesn't do.
const SEED_COUNT = 100;

// The viewport is 1440×900, so its centre — what "centered" means below — is (720, 450).
const CENTRE_X = 720;
const CENTRE_Y = 450;

/**
 * Wait for an element's own animations and transitions to finish before measuring it.
 *
 * Not optional here: the desktop dialog arrives by `dialog-in`, which scales 0.97 → 1, and a
 * `boundingBox()` taken mid-flight reports the *transformed* box — 504px for a 520px panel, which
 * is exactly the failure this replaced. `toBeVisible()` does not wait for an animation to end.
 */
async function settle(locator: Locator) {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
}

let conn: Connection;

test.describe.serial("desktop", () => {
  test.beforeAll(async () => {
    conn = await connect();
    await seedFeedCorpus(conn, PREFIX, SEED_COUNT, TOPICS);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  test("sign-up card is centered, the feed packs four centered columns", async ({
    page,
  }) => {
    await page.goto("/");
    await openAuthSheet(page);

    // The auth panel is a centered card, not a bottom sheet, at this width.
    const sheet = page.getByTestId("auth-sheet");
    await settle(sheet);
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width)).toBe(520);
    expect(Math.abs(box.x + box.width / 2 - CENTRE_X)).toBeLessThan(2);

    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("Desktop E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await completeOnboarding(page, ["Astronomy", "Botany", "Music"]);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();

    // Four stacks, every one populated, inside a container no wider than 1120 and centered.
    const grid = page.getByTestId("feed-columns");
    await expect(grid.locator("> div")).toHaveCount(4);
    const perColumn = await grid
      .locator("> div")
      .evaluateAll((cols) =>
        cols.map((c) => c.querySelectorAll("[data-feed-id]").length),
      );
    expect(Math.min(...perColumn)).toBeGreaterThan(0);

    const gridBox = (await grid.boundingBox())!;
    expect(gridBox.width).toBeLessThanOrEqual(1120);
    expect(Math.abs(gridBox.x + gridBox.width / 2 - CENTRE_X)).toBeLessThan(2);
  });

  // docs/DESIGN_chrome-redesign.md §2: from `md` the toolbar is a vertical rail, fixed at the
  // right edge and vertically centred. Three controls on the feed — no Share, as on the phone.
  test("the toolbar is a vertical rail hugging the right edge", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);

    const rail = page.getByTestId("rail-toolbar");
    await expect(rail).toBeVisible();
    await expect(page.locator("nav[aria-label='Ambit toolbar']")).toHaveCount(
      1,
    );

    const box = (await rail.boundingBox())!;
    expect(Math.abs(box.x + box.width - (1440 - 26))).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - CENTRE_Y)).toBeLessThan(2);

    const buttons = rail.getByRole("button");
    await expect(buttons).toHaveCount(3);
    const tops = await buttons.evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top),
    );
    expect(tops).toEqual([...tops].sort((a, b) => a - b)); // stacked, top to bottom
    expect(tops[1]! - tops[0]!).toBeGreaterThan(52); // each below the last
  });

  test("right-click opens the item sheet as a centered dialog; Escape closes it", async ({
    page,
  }) => {
    // Playwright isolates storage per test; sign in again through the landing page.
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const tile = page.locator("[data-feed-id] > *").first();
    await expect(tile).toBeVisible();

    await tile.click({ button: "right" });

    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(panel.getByText("Save to collection")).toBeVisible();
    await settle(panel);
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(520);
    expect(Math.abs(box.x + box.width / 2 - CENTRE_X)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - CENTRE_Y)).toBeLessThan(2);
    // Not anchored to the bottom edge.
    expect(box.y + box.height).toBeLessThan(900 - 40);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  // The merged item screen (docs/DESIGN_screen-structure.md decision 2): above `md` the picture is
  // full viewport height, edge to edge, and the words stay in the 720px reader column.
  test("the item page's picture fills the viewport height, with the facts in the reader column", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const imageTile = page.locator("[data-feed-id]:has(img)").first();
    await expect(imageTile).toBeVisible();
    await imageTile.locator("> *").click();
    await page.waitForURL(/\/i\//);

    const strip = page.getByTestId("hero-rail");
    await expect(strip).toBeVisible();
    await settle(page.getByTestId("hero-frame"));
    const box = (await strip.boundingBox())!;
    expect(Math.round(box.height)).toBe(900);
    expect(Math.round(box.width)).toBe(1440);
    expect(Math.round(box.y)).toBe(0); // top-aligned: nothing above the picture

    const facts = page.getByRole("list", { name: "About this work" });
    const factsBox = (await facts.boundingBox())!;
    expect(factsBox.width).toBeLessThanOrEqual(720);
    expect(factsBox.y).toBeGreaterThanOrEqual(900); // under the picture, not over it

    // A mouse moving over the picture summons the caption.
    await page.mouse.move(700, 300);
    await page.mouse.move(720, 320);
    await expect(page.getByTestId("gallery-chrome")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    // The rail is chrome here too (decision 3): summoned by the same mouse move.
    await expect(page.getByTestId("rail-toolbar")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);

    // And Escape leaves — the review's "Escape does nothing" (09-10-26), fixed on this screen.
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/feed/);
  });
});
