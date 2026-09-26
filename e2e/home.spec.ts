import { expect, test, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  seedLandingPool,
  waitForHydration,
  type Connection,
} from "./support";

// **The parked landing** (8.3, docs/DESIGN_landing-redo.md), at `/dev/landing` since 09-26-26,
// when the explore feed became `/`. An overture on black (~3.6 s), then a reel of server-picked
// pictures that hands off to the sign-in sheet. Both halves of that handoff are pinned: it must
// complete on its own for a reader who waits, and be skippable for one who doesn't.
//
// Behind the dev gate, like `/dev/feed`: under the production build (bun run e2e:prod, CI) it is
// a 404 by design and this file skips itself — the gate *is* the assertion there. The page is
// kept whole so the reel can come back; this spec is what says it still works.
//
// Twelve landing-eligible fixtures — six tall, six wide — so CI's fixture-only database has a
// reel of each shape to step through. The
// real corpus (local `e2e:prod`) has ~2,700 more; either way the pool is non-empty, so this file
// never sees the fallback picture — that branch is unit-tested (landing-pool.test.ts).
const PREFIX = "e2e-home-";
let conn: Connection;

const LANDING = "/dev/landing";

test.beforeAll(async () => {
  conn = await connect();
  await seedLandingPool(conn, PREFIX, 12);
});

test.beforeEach(async ({ request }) => {
  const res = await request.get(LANDING);
  test.skip(
    res.status() === 404,
    "dev gate is off (production build) — 404 is the correct answer",
  );
});

/** The parked landing's own way to skip the reel: its glyph. */
async function openLandingSheet(page: Page) {
  await waitForHydration(page);
  const glyph = page.getByRole("button", { name: "Open sign-in" });
  // The sheet may already be up — a slow machine can let the slideshow finish first. Once the
  // sheet rises the glyph unmounts, so its absence is the signal.
  if (await glyph.isVisible()) await glyph.click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
}

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

test("the parked landing renders with no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const response = await page.goto(LANDING);

  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the overture plays, the reel cuts in, and the sheet rises on its own", async ({
  page,
}) => {
  // The whole show is ~20 s under the dissolve (below) — past Playwright's 30 s default once the
  // navigation is counted on a cold picture.
  test.setTimeout(60_000);
  await page.goto(LANDING);
  await expect(page.getByTestId("overture-tail")).toBeVisible();
  // The line unmounts on the frame the reel cuts in — nothing hovers over the slideshow.
  await expect(page.getByTestId("overture")).toHaveCount(0, {
    timeout: 8_000,
  });
  await expect.poll(() => visibleId(page), { timeout: 8_000 }).toBeTruthy();
  // cut: ~3.6 s + 12 × 350 ms ≈ 8 s; dissolve: ~3.6 s + 8 × 2 s ≈ 20 s. 35 s covers either.
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 35_000,
  });
});

test("the glyph opens the sign-in sheet early", async ({ page }) => {
  await page.goto(LANDING);
  await openLandingSheet(page);

  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

// A click on the imagery means "next". `force: true` because the reel is `aria-hidden` (the glyph
// is its accessible control), and Playwright's actionability check otherwise refuses it.
test("clicking the imagery changes the picture, and the pictures keep moving behind the sheet", async ({
  page,
}) => {
  await page.goto(LANDING);
  await expect.poll(() => visibleId(page), { timeout: 8_000 }).toBeTruthy();
  const first = await visibleId(page);
  await page
    .locator("[data-testid='landing-reel']")
    .click({ position: { x: 20, y: 20 }, force: true });
  await expect.poll(() => visibleId(page)).not.toBe(first);

  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 20_000,
  });
  // Behind the sheet the reel runs the dissolve gear: a change within frame + fade (3 s).
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
test("reduced motion: the overture collapses, the reel cross-fades without drift, and the sheet's disc collapses it back", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(LANDING);

  // The line is there for this reader now, at its real fade-in — not 0.01 ms.
  const overture = page.getByTestId("overture");
  await expect(overture).toBeVisible();
  expect(
    await overture.evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe("0.5s");
  // The collapse runs for this reader too (Ben, 09-26-26) — at its real duration, not 0.01 ms:
  // catch the tail strictly mid-clip and the wordmark strictly mid-drift. jsdom computes no
  // transitions, so this is the only layer that can see the global rule letting it through.
  const collapse = () =>
    page.evaluate(() => {
      const tail = document.querySelector("[data-testid='overture-tail']");
      const mark = document.querySelector("[data-testid='overture-mark']");
      if (!tail || !mark) return "ended before a mid-collapse sample";
      const opacity = Number(getComputedStyle(tail).opacity);
      const x = new DOMMatrix(getComputedStyle(mark).transform).m41;
      return opacity > 0.05 && opacity < 0.9 && x > 1
        ? "mid-collapse"
        : `tail ${opacity}, mark ${x}px`;
    });
  await expect
    .poll(collapse, { intervals: [50], timeout: 5_000 })
    .toBe("mid-collapse");
  // And the line goes with the cut: no text over the slideshow (~3.6 s).
  await expect(overture).toHaveCount(0, { timeout: 10_000 });
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
  expect(layers.find((l) => l.opacity === "1")?.transition).toBe("1s");

  // The glyph, rather than waiting the gentle first pass (~20 s): the sheet's round trip is
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
  const response = await request.get(LANDING);
  const html = await response.text();
  test.skip(
    !html.includes('src="/api/img/'),
    "the reel is fixture pixels (CI); nothing to preload",
  );
  // A production build sends them as an HTTP `Link` header; the dev server — the only place this
  // parked page runs now — writes them as `<link>` tags in the head. Either is the preload.
  const header = response.headers().link ?? "";
  const asHeader = /<\/api\/img\/[A-Za-z0-9_-]+>; rel=preload; as="image"/.test(
    header,
  );
  const asTag =
    /<link rel="preload" href="\/api\/img\/[A-Za-z0-9_-]+" as="image"/.test(
      html,
    );
  expect(asHeader || asTag).toBe(true);
  expect(html).not.toContain("?w=960");
});
