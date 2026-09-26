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
// Twelve landing-eligible fixtures — six tall, six wide — so CI's fixture-only database has a
// reel of each shape to step through. The
// real corpus (local `e2e:prod`) has ~2,700 more; either way the pool is non-empty, so this file
// never sees the fallback picture — that branch is unit-tested (landing-pool.test.ts).
const PREFIX = "e2e-home-";
let conn: Connection;

test.beforeAll(async () => {
  conn = await connect();
  await seedLandingPool(conn, PREFIX, 12);
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
  // cut: ~3.6 s + 12 × 350 ms ≈ 8 s; dissolve: ~3.6 s + 2 × 3 s. 20 s covers either default.
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
  // Behind the sheet the reel runs the dissolve gear: a change within frame + fade (4.2 s).
  await expect.poll(() => visibleId(page), { timeout: 5_000 }).toBeTruthy();
  const behind = await visibleId(page);
  await expect
    .poll(() => visibleId(page), { timeout: 12_000 })
    .not.toBe(behind);
});

// Reduced motion (D6, 09-26-26). Emulated, because that reader is exactly the one two earlier bugs
// reached: the 09-10 hydration regression (an inert collapse disc), and the 09-26 finding that the
// old "one still" path was what Ben — Reduce Motion on, on both his devices — saw as "no
// animation at all". Meaningful only against a production build. The computed durations are the
// proof that globals.css's 0.01 ms collapse lets the landing through.
test("reduced motion: the overture fades, the reel cross-fades without drift, and the sheet's disc collapses it back", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  // The line is there for this reader now, at its real fade-in — not 0.01 ms.
  const overture = page.getByTestId("overture");
  await expect(overture).toBeVisible();
  expect(
    await overture.evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe("0.5s");
  // The collapse is a real fade of the whole line, not a pop to black (final review, 09-26-26):
  // wait out the fade-in until the line holds at full opacity, then catch it strictly mid-fade.
  // Removing a `both`-filled animation in the same style change as setting opacity starts no
  // transition in any engine, and this is the only layer that can see that — jsdom computes none.
  // Sampled in one evaluate with the tail's presence: the wordmark's own fade-in at `done` (the
  // tail gone) is not the collapse, and must not satisfy this.
  const lineState = () =>
    page.evaluate(() => {
      const el = document.querySelector("[data-testid='overture']");
      return {
        opacity: el ? Number(getComputedStyle(el).opacity) : null,
        collapsing:
          document.querySelector("[data-testid='overture-tail']") !== null,
      };
    });
  await expect
    .poll(async () => (await lineState()).opacity, {
      intervals: [50],
      timeout: 3_000,
    })
    .toBeGreaterThan(0.99);
  await expect
    .poll(
      async () => {
        const { opacity, collapsing } = await lineState();
        if (!collapsing) return "ended before a mid-fade sample";
        return opacity !== null && opacity > 0.05 && opacity < 0.9
          ? "mid-fade"
          : `opacity ${opacity}`;
      },
      { intervals: [50], timeout: 5_000 },
    )
    .toBe("mid-fade");
  // The gentle collapse: the tail unmounts on the frame the reel starts (~3.6 s).
  await expect(page.getByTestId("overture-tail")).toHaveCount(0, {
    timeout: 10_000,
  });
  // The first frame fades in from black; once it is fully there, no layer drifts and the
  // current one carries the gentle fade at its real duration.
  await expect.poll(() => visibleId(page), { timeout: 12_000 }).not.toBeNull();
  const layers = await page
    .locator("[data-testid='landing-reel'] img")
    .evaluateAll((imgs) =>
      imgs.map((i) => ({
        animation: getComputedStyle(i).animationName,
        transition: getComputedStyle(i).transitionDuration,
        opacity: getComputedStyle(i).opacity,
      })),
    );
  expect(layers.every((l) => l.animation === "none")).toBe(true);
  expect(layers.find((l) => l.opacity === "1")?.transition).toBe("1.2s");

  // The glyph, rather than waiting the gentle first pass (~10 s): the sheet's round trip is
  // what this test is for.
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();
  await page.getByRole("button", { name: "Back to the slideshow" }).click();
  await expect(
    page.getByRole("button", { name: "Open sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open sign-in" }).click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport();

  expect(consoleErrors).toEqual([]);
});

// The LCP line of the budget: the first pictures of the reel the server guessed for this browser
// are preloaded. Without a `srcset` (09-25-26: the master, not the 960 rendition) React sends them
// as an HTTP `Link` header rather than `<link>` tags — earlier still, since the browser sees it
// before the HTML. Only meaningful when the reel is proxied pictures: the fixture pixels are
// `data:` URLs, inline already and never preloaded, so on CI's fixture database this skips.
test("the response preloads the first pictures of the guessed reel", async ({
  request,
}) => {
  const response = await request.get("/");
  const html = await response.text();
  test.skip(
    !html.includes('src="/api/img/'),
    "the reel is fixture pixels (CI); nothing to preload",
  );
  expect(response.headers().link ?? "").toMatch(
    /<\/api\/img\/[A-Za-z0-9_-]+>; rel=preload; as="image"/,
  );
  expect(html).not.toContain("?w=960");
});
