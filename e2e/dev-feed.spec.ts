import { expect, test, type Cookie, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  countSeenFor,
  inviteUser,
  openAuthSheet,
  restoreSession,
  saveSession,
  seedFeedCorpus,
  type Connection,
} from "./support";

// The knob panel (plan 09-05-26). This spec runs against `next dev` (bun run e2e), where the dev
// gate is on by default. Under the production build (bun run e2e:prod, CI) FEED_DEBUG is unset,
// /dev/feed is a 404 by design, and the spec skips itself — the gate *is* the assertion there.
const EMAIL = `ambit-devfeed-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";
const PREFIX = "e2e-devfeed-";
const TOPICS = ["astronomy", "botany", "music"] as const;
// Four feed loads plus two slider commits (a fresh page each), with headroom — see
// support.ts's seedFeedCorpus() for why CI's empty database makes this matter.
const SEED_COUNT = 120;

let conn: Connection;
let session: Cookie[] = [];

test.describe.serial("dev knob panel", () => {
  test.beforeAll(async () => {
    conn = await connect();
    await seedFeedCorpus(conn, PREFIX, SEED_COUNT, TOPICS);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  test("signs up and picks topics", async ({ page }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("Dev Feed");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");
    session = await saveSession(page);
  });

  /** Puts the shared session back and opens the bench. False when the gate is off (a 404). */
  async function onDevFeed(page: Page): Promise<boolean> {
    await restoreSession(page, session);
    const res = await page.goto("/dev/feed");
    return res?.status() !== 404;
  }

  test("shows the panel with the readout, and a slider commit forgets then refetches with knobs", async ({
    page,
  }) => {
    test.skip(
      !(await onDevFeed(page)),
      "dev gate is off (production build) — 404 is the correct answer",
    );

    const panel = page.getByTestId("knob-panel");
    await expect(panel).toBeVisible();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    await expect(panel).toContainText(
      /CORE \d+ · DRIFT \d+ · JUMP \d+ · WILD \d+/,
    );

    // Queries go out as GETs even under httpBatchStreamLink, so the SuperJSON input — knobs
    // included — is in the URL's `input` parameter, URL-encoded. Mutations would be POST bodies.
    const feedUrls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("feed.page"))
        feedUrls.push(decodeURIComponent(r.url()));
    });
    const forget = page.waitForRequest((r) =>
      r.url().includes("feed.forgetSince"),
    );

    const slider = panel.getByRole("slider", { name: /CORE/ });
    await slider.focus();
    await slider.press("End"); // max → 100
    await forget;
    await expect
      .poll(() => feedUrls.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(feedUrls.at(-1)).toContain('"tierCore":100');
    await expect(panel).toContainText(/served this session/);
  });

  // The WILD tier's slider (09-06-26). The e2e database is seeded with homed items only, so this
  // asserts the control surface rather than the draw — that the slider exists, that its value
  // reaches the server, and that the readout has a bucket for it. The tier's own behaviour is
  // covered by feed.test.ts and the two integration suites.
  test("the WILD slider is on the panel and its value reaches the server", async ({
    page,
  }) => {
    test.skip(!(await onDevFeed(page)), "dev gate is off");

    const panel = page.getByTestId("knob-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("core / grown / wild");

    const feedUrls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("feed.page"))
        feedUrls.push(decodeURIComponent(r.url()));
    });

    const slider = panel.getByRole("slider", { name: /WILD — un-homed pool/ });
    await expect(slider).toBeVisible();
    await slider.focus();
    await slider.press("Home"); // min → 0, which switches the tier off entirely
    await expect
      .poll(() => feedUrls.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(feedUrls.at(-1)).toContain('"tierWild":0');
    // With the tier off, no card on the page can be a WILD one.
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    await expect(panel).toContainText(/WILD 0/);
  });

  test("the seen rows served while tuning are gone after a restart", async ({
    page,
  }) => {
    test.skip(!(await onDevFeed(page)), "dev gate is off");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    const forget = page.waitForResponse((r) =>
      r.url().includes("feed.forgetSince"),
    );
    await page
      .getByTestId("knob-panel")
      .getByRole("button", { name: "Restart feed" })
      .click();
    await forget;
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    // After a restart, only the page just served (plus its ack, which may still be in flight)
    // can be in seen_item for this user — the previous tests' pages have been forgotten.
    // Decision D2's honest check: the table, not the panel's counter.
    await expect
      .poll(() => countSeenFor(conn, EMAIL), { timeout: 10_000 })
      .toBeLessThanOrEqual(24);
  });
});
