import { expect, test, type Locator } from "@playwright/test";

import {
  cleanupSeeded,
  completeOnboarding,
  ONBOARDING_TOPICS,
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
//
// **Re-sized 09-17-26, by measurement**: 100 dated from when one shared fixture source held a CI
// page to three tiles (support.ts's FIXTURE_SOURCES). With full pages this file measured
// **117–126 rows** consumed on a fixtures-only database — a 1440 × 900 feed pulls about three
// pages a load — and 100 ran dry before the last test. 260 is that, doubled.
const SEED_COUNT = 260;

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

    await completeOnboarding(page, ONBOARDING_TOPICS);
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

  test("a rail button's sheet floats left of it, over an unblurred page", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const rail = page.getByTestId("rail-toolbar");
    const railBox = (await rail.boundingBox())!;

    const bookmark = rail.getByRole("button", { name: "Save to collection" });
    const anchorBox = (await bookmark.boundingBox())!;
    await bookmark.click();
    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(
      panel.getByRole("heading", { name: "Your collections" }),
    ).toBeVisible();
    await settle(panel);
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(340);
    expect(box.x + box.width).toBeLessThan(railBox.x); // beside the rail, not over it
    // Centred on the button that opened it, not on the rail: on the feed the bookmark is the
    // third of the bar's three controls, below the rail's middle (design §2, `popoverStyle`).
    expect(
      Math.abs(box.y + box.height / 2 - (anchorBox.y + anchorBox.height / 2)),
    ).toBeLessThan(2);

    // Decision 5: no scrim is painted — the click-catcher is transparent.
    await expect(page.getByTestId("bottom-sheet-scrim")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    // ...and the page behind stays unblurred (no scrim blur anywhere since 1b).
    await expect(page.getByTestId("bottom-sheet-scrim")).toHaveCSS(
      "backdrop-filter",
      "none",
    );

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  // docs/DESIGN_chrome-redesign.md §3: hover a tile, the strip appears, one click saves to the
  // last-used collection, the chevron opens the picker under the pill.
  test("hovering a tile reveals its strip; one click saves; the chevron opens the picker beneath", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const first = page.locator("[data-feed-id]:has(img)").first();
    await expect(first).toBeVisible();

    const strip = first.getByTestId("tile-actions");
    await first.hover();
    // The Lift (docs/PLAN_tile-hover.md): the WRAPPER scales and rises. Tailwind v4's `scale-*`
    // writes the standalone `scale` property, so that — never `transform` — is what to read.
    await expect(first).toHaveCSS("scale", "1.035");
    await expect(first).toHaveCSS("z-index", "2");
    // Tailwind's `shadow-*` composes five layers (inset, inset-ring, ring-offset, ring, shadow);
    // the computed value lists four transparent ones before ours, so match ours, not the whole.
    await expect(first).toHaveCSS(
      "box-shadow",
      /rgba\(0, 0, 0, 0\.45\) 0px 14px 34px 0px/,
    );
    await expect(strip).toHaveCSS("opacity", "1");
    await strip.getByRole("button", { name: /^Save to / }).click();
    await expect(page.getByText(/^Saved to /)).toBeVisible();
    await expect(
      strip.getByRole("button", { name: /^Saved to / }),
    ).toBeVisible();

    const second = page.locator("[data-feed-id]:has(img)").nth(1);
    await second.hover();
    const pill = second.getByRole("button", { name: "Choose collection" });
    await pill.click();
    const panel = page.getByTestId("bottom-sheet-panel");
    await expect(
      panel.getByRole("heading", { name: "Save to collection" }),
    ).toBeVisible();
    await settle(panel);
    const pillBox = (await pill.boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(Math.round(box.width)).toBe(340);
    expect(box.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height); // under the pill

    await panel.getByRole("button", { name: /New collection/ }).click();
    const name = `From a hover ${Date.now()}`;
    await panel.getByLabel("Collection name").fill(name);
    await panel.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByText(`Saved to ${name}`, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The next strip names the collection just used.
    const third = page.locator("[data-feed-id]:has(img)").nth(2);
    await third.hover();
    await expect(
      third.getByRole("button", { name: "Choose collection" }),
    ).toHaveText(name);

    await page.goto("/saved");
    expect(
      await page.locator("[data-saved-id]").count(),
    ).toBeGreaterThanOrEqual(2);
  });

  // docs/DESIGN_list-screens.md §6: the hub is the feed's wide column, left-aligned, and packs
  // four collection tiles across; Saved packs four stacks.
  // The keyboard half of the Lift (docs/PLAN_tile-hover.md Task 6, Review focus 5): Tab onto a
  // tile and the wrapper lifts exactly as on hover. `:has(:focus-visible)` on the wrapper — a
  // programmatic `.focus()` may or may not count as "visible" focus in Chromium, so this uses the
  // real key. Tab lands on the toolbar first; the loop walks until a tile is focused.
  test("keyboard focus lifts the tile like a hover", async ({ page }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const first = page.locator("[data-feed-id]:has(img)").first();
    await expect(first).toBeVisible();
    // Park the mouse off the grid so no tile is hovered while we read the scale.
    await page.mouse.move(0, 0);

    await expect(async () => {
      await page.keyboard.press("Tab");
      const onTile = await page.evaluate(() => {
        const el = document.activeElement;
        return (
          el instanceof HTMLElement &&
          el.getAttribute("role") === "button" &&
          el.closest("[data-feed-id]") !== null
        );
      });
      expect(onTile).toBe(true);
    }).toPass({ timeout: 10_000 });

    const focused = page.locator("[data-feed-id]:has(:focus)");
    await expect(focused).toHaveCSS("scale", "1.035");
    await expect(focused).toHaveCSS("z-index", "2");

    // Tabbing away relaxes it.
    await page.keyboard.press("Shift+Tab");
    await expect(focused).toHaveCount(0);
    // At rest the wrapper has no `scale` at all, which Chromium reports as "none", not "1".
    await expect(first).toHaveCSS("scale", "none");
  });

  test("the Profile hub is wide and left-aligned, and its collections pack four across", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    await page.getByRole("button", { name: "Profile" }).click();
    await page.waitForURL("/profile", { timeout: 15_000 });

    const nav = page.getByRole("navigation", { name: "Profile" });
    await expect(nav.getByRole("link")).toHaveText([
      "Collections",
      "Topics",
      "Edit profile",
      "Settings",
    ]);

    // The dashed tile, the three seeded defaults, and the one the hover test above made: five
    // tiles, so a row of four and one below it.
    const grid = page.getByTestId("collections-grid");
    const tiles = grid.locator(":scope > *");
    await expect(tiles).toHaveCount(5, { timeout: 15_000 });
    // Polled, and by `offsetTop`: the server renders the phone's two columns and the client
    // switches to four on hydration (`useColumnCount`), and each tile rises in on a transform —
    // a one-shot `getBoundingClientRect` can catch either mid-flight.
    await expect
      .poll(async () => {
        const tops = await tiles.evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).offsetTop),
        );
        return new Set(tops.slice(0, 4)).size === 1 && tops[4]! > tops[0]!;
      })
      .toBe(true);

    // The 1120 column is centred in the viewport — its left edge at (1440 − 1120) / 2 = 160 — and
    // the nav hangs off that edge inset 20. The grid spans the whole column (its 20 px inset is
    // padding, the nav's is margin), so the grid's box is the column's.
    const gridBox = (await grid.boundingBox())!;
    expect(gridBox.width).toBeLessThanOrEqual(1120);
    expect(Math.abs(gridBox.x + gridBox.width / 2 - CENTRE_X)).toBeLessThan(2);
    const navBox = (await nav.boundingBox())!;
    expect(Math.abs(navBox.x - (gridBox.x + 20))).toBeLessThan(2);

    await nav.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("/profile/settings");
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/saved");
    await expect(
      page.getByTestId("saved-columns").locator(":scope > div"),
    ).toHaveCount(4);
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
    // `:not(:has(h2))`: a writing tile has a picture too, and opens the reader (writing Phase 4).
    const imageTile = page
      .locator("[data-feed-id]:has(img):not(:has(h2))")
      .first();
    await expect(imageTile).toBeVisible();
    // `.first()`: the wrapper holds the tile and, on a mouse, its hover strip.
    await imageTile.locator("> *").first().click();
    await page.waitForURL(/\/i\//);

    const strip = page.getByTestId("hero-rail");
    await expect(strip).toBeVisible();
    await settle(page.getByTestId("hero-frame"));
    const box = (await strip.boundingBox())!;
    expect(Math.round(box.height)).toBe(900);
    expect(Math.round(box.width)).toBe(1440);
    expect(Math.round(box.y)).toBe(0); // top-aligned: nothing above the picture

    // The Information section is full width with 40 px gutters (DESIGN_redesign §6.3).
    const facts = page.getByRole("region", { name: "Information" });
    const factsBox = (await facts.boundingBox())!;
    expect(factsBox.width).toBeGreaterThan(1300);
    expect(factsBox.y).toBeGreaterThanOrEqual(900); // under the picture, not over it

    // More or less, the frame D2B: one pair, in the Information section's third column, under
    // the summary when there is one and always above the bracket link-out, two 220 px buttons.
    const pair = facts.getByRole("group", { name: "More or less of this" });
    await expect(pair).toHaveCount(1);
    const linkOut = facts.getByRole("link", {
      name: /^(Read the|Read it on|See it on)/,
    });
    const [pairBox, linkBox] = [
      (await pair.boundingBox())!,
      (await linkOut.boundingBox())!,
    ];
    expect(pairBox.y + pairBox.height).toBeLessThanOrEqual(linkBox.y);
    // The group is a grid as wide as the column; its two tracks are fixed and left-aligned.
    const buttons = pair.getByRole("button");
    const [less, more] = [
      (await buttons.nth(0).boundingBox())!,
      (await buttons.nth(1).boundingBox())!,
    ];
    expect(Math.round(less.width)).toBe(220);
    expect(Math.round(more.x - (less.x + less.width))).toBe(10);
    expect(Math.round(less.x)).toBe(Math.round(pairBox.x));

    // A mouse moving over the page wakes the caption (decision 7 of docs/DESIGN_redesign.md:
    // any input on a computer). Retried for the item screen's quarter-second wake throttle — see
    // the spread test's `summon`.
    let nudge = 0;
    await expect(async () => {
      nudge = (nudge + 1) % 2;
      await page.mouse.move(700 + nudge * 20, 300 + nudge * 20);
      await expect(page.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "false",
        { timeout: 400 },
      );
    }).toPass();
    // The rail is chrome here too (decision 3): summoned by the same mouse move.
    await expect(page.getByTestId("rail-toolbar")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);
    // …and with the mouse still, 2.6 s of no input puts both away again. No loop brings them
    // back: the old ten-second cycle is gone.
    await expect(page.getByTestId("rail-toolbar")).toHaveAttribute(
      "aria-hidden",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.getByTestId("gallery-chrome")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    // And Escape leaves — the review's "Escape does nothing" (09-10-26), fixed on this screen.
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/feed/);
  });

  // WCAG 2.4.7: the chrome must not idle away under keyboard focus.
  test("keyboard focus in the caption holds the chrome up, and Information lands focus on the section", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    const imageTile = page
      .locator("[data-feed-id]:has(img):not(:has(h2))")
      .first();
    await expect(imageTile).toBeVisible();
    await imageTile.locator("> *").first().click();
    await page.waitForURL(/\/i\//);

    const chrome = page.getByTestId("gallery-chrome");
    // Let any wake from the navigation idle away.
    await expect(chrome).toHaveAttribute("aria-hidden", "true", {
      timeout: 8_000,
    });

    const info = page.getByRole("button", { name: "Information" });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      if (await info.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(info).toBeFocused();
    await expect(info).toBeVisible();
    await page.waitForTimeout(3_000);
    await expect(info).toBeVisible();
    await expect(chrome).toHaveAttribute("aria-hidden", "false");

    await page.keyboard.press("Enter");
    const region = page.getByRole("region", { name: "Information" });
    await expect(region).toBeFocused();
    await expect(region).toBeInViewport();
  });

  // `/` (09-26-26): the signed-out taste at desktop width — four columns like /feed, the rail
  // toolbar at the right, and the sign-up card its Profile raises is centered. Signed out, so
  // this spends nothing of the shared user; the seed above is what it draws.
  // docs/DESIGN_spread-mode.md: the desktop item screen's spread — two rail pictures side by side,
  // turned by two, the focused page being the item. Works on either database shape: the rail is
  // drawn from whatever corpus is there, and the assertions are about positions and alts, never
  // about which pictures came up.
  test("spread mode: two pictures at a time, turned by two, the focused one is the item", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page, EMAIL, PASSWORD);
    // `:not(:has(h2))`: a writing tile has a picture too, and opens the reader (writing Phase 4).
    const imageTile = page
      .locator("[data-feed-id]:has(img):not(:has(h2))")
      .first();
    await expect(imageTile).toBeVisible();
    await imageTile.locator("> *").first().click();
    await page.waitForURL(/\/i\//);
    await settle(page.getByTestId("hero-frame"));

    /** The pictures in the cell under the reader — the track's middle child. */
    const current = page
      .getByTestId("gallery-track")
      .locator("> *")
      .nth(1)
      .locator("img");
    const alts = () =>
      current.evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
    // Which pictures are on the spread, as alt + src. Neither alone is an identity: on the real
    // corpus a blog's posts can share one title ("70s Sci-Fi Art" twice in a row), and on CI's
    // fixtures every picture is the same placeholder src. Together they name the page.
    const srcs = () =>
      current.evaluateAll((els) =>
        els.map((e) => `${e.getAttribute("alt")}|${e.getAttribute("src")}`),
      );
    const toggle = page.getByRole("button", { name: "Magazine view" });
    // The item screen throttles its wake (mouse move, key, wheel, touch, scroll) to one per
    // 250 ms, and Playwright moves faster than any hand — a summon right after another mouse
    // action can be swallowed whole. So keep nudging the mouse until the rail answers — and the
    // toggle's click is inside the same retry: on a computer the chrome hides after 2.6 s idle,
    // so a stall between the summon and the click re-wakes it rather than timing out on a
    // hidden button. The click is the block's last step, so a click that landed is never redone.
    let nudge = 0;
    const summonAndToggle = () =>
      expect(async () => {
        nudge = (nudge + 1) % 2;
        await page.mouse.move(700 + nudge * 20, 300 + nudge * 20);
        await expect(page.getByTestId("rail-toolbar")).toHaveAttribute(
          "aria-hidden",
          "false",
          { timeout: 400 },
        );
        await toggle.click({ timeout: 1_000 });
      }).toPass();

    // The toggle's *state* is read through a locator that sees hidden elements: on a computer the
    // chrome starts hidden (decision 7 of docs/DESIGN_redesign.md) — `visibility: hidden` and
    // `aria-hidden`, which take the button out of the accessibility tree a plain `getByRole`
    // searches. Before the summon, and 2.6 s after any click, there is no visible toggle to read.
    const toggleState = page.getByRole("button", {
      name: "Magazine view",
      includeHidden: true,
    });
    await expect(current).toHaveCount(1);
    await expect(toggleState).toHaveAttribute("aria-pressed", "false");
    await summonAndToggle();
    await expect(toggleState).toHaveAttribute("aria-pressed", "true");

    // The book opens (docs/PLAN_magazine-turn.md Task 6): a leaf swings, then lands.
    const leaf = page.getByTestId("spread-leaf");
    await expect(leaf).toHaveCount(0);

    // Two pages, the left one on the left half of the 1440 viewport and the right one on the right.
    await expect(current).toHaveCount(2);
    await expect(page.getByTestId("spread-spine")).toBeVisible();
    const [left, right] = [
      (await current.nth(0).boundingBox())!,
      (await current.nth(1).boundingBox())!,
    ];
    // Within a pixel: the pictures touch at the spine (D3, amended), so both edges sit on the
    // centre line, and the track's `-33.3333%` translate lands them a fraction either side of it.
    expect(left.x + left.width).toBeLessThanOrEqual(CENTRE_X + 1);
    expect(right.x).toBeGreaterThanOrEqual(CENTRE_X - 1);
    const first = await srcs();

    // More or less, the frame D3B: one pair per figure, under that figure's title.
    const figs = page.getByTestId("spread-fig");
    await expect(figs).toHaveCount(2);
    for (const fig of await figs.all()) {
      await expect(
        fig.getByRole("group", { name: "More or less of this" }),
      ).toHaveCount(1);
    }

    // A turn moves two: neither page of the new spread was on the old one.
    const url = page.url();
    // The turn is a page swinging over the spine (the plan's D1): caught in the air, then landed.
    // The URL moves at once; the pages under the reader are final only once the leaf is gone.
    await page.keyboard.press("ArrowRight");
    await expect(leaf).toBeVisible();
    await expect(page).not.toHaveURL(url);
    await expect(leaf).toHaveCount(0);
    await expect.poll(srcs).not.toEqual(first);
    const turnedSrcs = await srcs();
    expect(first).not.toContain(turnedSrcs[0]);
    expect(first).not.toContain(turnedSrcs[1]);
    const turned = await alts();

    // A click on the right page makes it the item: the facts' title is its alt.
    await page.mouse.click(1080, CENTRE_Y);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(turned[1]!);

    // Turning the spread off keeps that picture.
    // The book folds shut first (Task 6). Mid-fold the cell already shows one picture, so the
    // count alone can pass early — wait for the leaf to land, or the next click lands mid-motion,
    // where the toggle is ignored (D3).
    await summonAndToggle();
    await expect(leaf).toHaveCount(0);
    await expect(current).toHaveCount(1);
    await expect(heading).toHaveText(turned[1]!);

    // Back on, then a reload: the device remembers the spread.
    await summonAndToggle();
    await expect(leaf).toHaveCount(0);
    await expect(current).toHaveCount(2);
    await page.reload();
    await expect(
      page.getByTestId("gallery-track").locator("> *").nth(1).locator("img"),
    ).toHaveCount(2);
  });

  test("/ packs four columns, and the rail's Profile raises a centered sign-up card", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    await expect(
      page.getByTestId("feed-columns").locator(":scope > div"),
    ).toHaveCount(4);

    // The rail is hidden under the overture's curtain until the dissolve.
    const rail = page.getByTestId("rail-toolbar");
    await expect(rail).toHaveAttribute("aria-hidden", "false", {
      timeout: 8_000,
    });
    await expect(page.getByTestId("explore-curtain")).toHaveCount(0);
    await rail.getByRole("button", { name: "Profile" }).click();
    const sheet = page.getByTestId("auth-sheet");
    await expect(sheet).toHaveAttribute("data-open", "true");
    await settle(sheet);
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width)).toBe(520);
    expect(Math.abs(box.x + box.width / 2 - CENTRE_X)).toBeLessThan(2);
  });
});
