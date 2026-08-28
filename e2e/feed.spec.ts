import { expect, test, type Cookie, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  PIXEL,
  restoreSession,
  saveSession,
  type Connection,
} from "./support";

// The feed masonry against a real dev server, real Postgres and the real feed engine (SPEC §12,
// PHASE5_PLAN_5.6.md Step 8). Runs locally against the dev server and, since Phase 7.1, in CI
// against a production build with a fresh database — the seeded corpus below is what makes the
// latter possible. Same "leaves a real user row behind by design" arrangement as `auth.spec.ts`,
// with a timestamped address so reruns never collide.
//
// **Serial, sharing one signed-up user.** Playwright isolates storage per test, so each test
// signs in again through `onFeed()` rather than assuming a cookie carried over.
//
// **What the seeded corpus is and isn't for.** `beforeAll` inserts ~30 `source: "e2e"` items
// directly through Drizzle — never `bun run ingest`, which would hit five live APIs and an LLM.
// It guarantees the feed has *something* to draw (which is what keeps this spec meaningful on
// CI's empty database), but it deliberately does NOT try to make the feed
// deterministic: the dev DB holds 8.5k real items, the tier draw reaches across all sixteen
// topics, and thirty rows cannot dominate that. So every assertion below is about behavior —
// tiles render, the count grows, a gesture does what it should — never about which item appears.
const EMAIL = `ambit-feed-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

/** The topics this spec's user picks in onboarding, and where its seeded items live. */
const TOPICS = ["astronomy", "botany", "music"] as const;

const SEED_COUNT = 30;

// See support.ts's connect() for why the DB handle is loaded here rather than imported statically.
let conn: Connection;

/**
 * The signed-in session the sign-up test below captures, reused by every test after it instead of
 * signing in again — see support.ts's saveSession() for why (the production build rate-limits
 * `/sign-in` to 3 requests per 10s, and this file used to make one per test).
 */
let session: Cookie[] = [];

test.describe.serial("feed", () => {
  test.beforeAll(async () => {
    conn = await connect();

    await conn.db
      .insert(conn.item)
      .values(
        Array.from({ length: SEED_COUNT }, (_, i) => ({
          source: "e2e",
          sourceId: `e2e-feed-${i}`,
          // Roughly a third articles, so both tile components get exercised. The per-branch
          // `as const` is load-bearing: nothing gives this object literal a contextual type
          // (`Array.from` builds it before `.values()` ever sees it), so without them TypeScript
          // widens `type` to `string` and the insert stops matching the column's narrowed union.
          type: i % 3 === 0 ? ("article" as const) : ("image" as const),
          title: `E2E fixture item ${i}`,
          summary: `A lede for fixture ${i}, long enough to occupy a couple of lines.`,
          // Two rows point at a host that cannot resolve, so the broken-image fallback is a path
          // this suite actually walks rather than one that only exists in unit tests.
          imageUrl: i % 13 === 0 ? "https://invalid.example/x.jpg" : PIXEL,
          sourceUrl: `https://example.test/e2e/${i}`,
          topicId: TOPICS[i % TOPICS.length]!,
          // Comfortably above the engine's default `scoreFloor` of 4, so these are drawable.
          curationScore: 9,
        })),
      )
      .onConflictDoNothing();

    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    // Scoped to this spec's own prefix, never to `source: "e2e"` as a whole — see
    // support.ts's cleanupSeeded() for the 5.8 incident that taught this.
    await cleanupSeeded(conn, "e2e-feed-");
  });

  /** Gets the shared user onto a populated /feed. Playwright isolates storage per test, so the
   *  session the sign-up test captured has to be put back into each fresh context by hand. */
  async function onFeed(page: Page) {
    await restoreSession(page, session);
    await page.goto("/feed");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
  }

  test("a new user signs up, picks topics, and lands on a populated feed", async ({
    page,
  }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("Feed E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");

    // A page is 12 cards; 8 is a floor that survives a Because tile or two without being brittle.
    await expect
      .poll(() => page.locator("[data-feed-id]").count())
      .toBeGreaterThanOrEqual(8);

    // Both columns are populated — the masonry is a masonry, not one long stack.
    const perColumn = await page.evaluate(() =>
      [...document.querySelectorAll(".grid > div")].map(
        (column) => column.querySelectorAll("[data-feed-id]").length,
      ),
    );
    expect(perColumn).toHaveLength(2);
    expect(Math.min(...perColumn)).toBeGreaterThan(0);

    // Every test below reuses this session rather than signing in again.
    session = await saveSession(page);
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      // Image loads are filtered out, and only image loads. Images route through `/api/img/` as
      // of 5.7, but the bytes still come from a museum CDN at the far end, and a CI box with no
      // outbound network gets a failed load rather than a picture — a known, designed-for
      // condition (the tile falls back to "Image unavailable"), not a defect this assertion should
      // chase. Everything else — React errors, hydration mismatches, thrown exceptions — still
      // fails the test, which is the signal worth having.
      const text = msg.text();
      const isImageLoad =
        text.includes("Failed to load resource") ||
        text.includes("ERR_NAME_NOT_RESOLVED");
      if (msg.type() === "error" && !isImageLoad) consoleErrors.push(text);
    });

    await onFeed(page);
    expect(consoleErrors).toEqual([]);
  });

  test("scrolling to the bottom appends another page", async ({ page }) => {
    await onFeed(page);
    const before = await page.locator("[data-feed-id]").count();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expect
      .poll(() => page.locator("[data-feed-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(before);
  });

  test("a long press opens the item sheet, and picking a collection saves", async ({
    page,
  }) => {
    await onFeed(page);

    const tile = page.locator("[data-feed-id] > *").first();
    const box = (await tile.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Past `usePress`'s 450ms threshold, with room to spare.
    await page.waitForTimeout(550);
    await page.mouse.up();

    const sheet = page.getByTestId("bottom-sheet-panel");
    await expect(sheet.getByText("Closer Look")).toBeVisible();
    await expect(sheet.getByText("Save to collection")).toBeVisible();

    // `saves.collections` seeds Articles/Art/Photos on first read, so there is always a row.
    await sheet.getByText("Articles").click();
    await expect(page.getByText(/^Saved to /)).toBeVisible();
  });

  // The feed a reader comes back to must be *the feed they left*. This used to push
  // `/feed?focus={id}`, which re-ran the dynamic route and built an entirely new page of cards —
  // so the reader lost their place, and each round trip permanently spent two pages of their
  // corpus (through 5.6 `feed.page` wrote `seen_item` itself, and both the RSC render and the
  // client query drew one). Found on-device 08-20-26. The assertions below are the guard: same
  // tiles, and nothing drawn. Both halves still matter with receipt-based marking — a fresh draw
  // is a fresh page of cards whether or not it gets acked.
  test("returning from an item page restores the same feed without drawing new items", async ({
    page,
  }) => {
    await onFeed(page);

    const feedIds = () =>
      page
        .locator("[data-feed-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-feed-id")),
        );

    const before = await feedIds();
    expect(before.length).toBeGreaterThan(0);

    const itemId = before[0]!;
    await page.locator(`[data-feed-id="${itemId}"] > *`).click();
    await page.waitForURL(`/i/${itemId}`);
    // Level 1 specifically: the item page grew a second heading in 5.7 (the wander-next teaser),
    // and the item's own title is the one that proves the page rendered.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Every way back to /feed that would cost a page of corpus: the client query, and any request
    // for the route itself — a document load or an RSC payload fetch both re-run the server
    // component. Matched on the path alone rather than on an `RSC:` header, so that a header Next
    // renames out from under us can never turn this into a vacuous pass. Counted from here so the
    // outbound trip's own requests don't muddy it.
    const draws: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/trpc/feed.page")) draws.push("client");
      else if (pathname === "/feed") draws.push(`route:${request.method()}`);
    });

    // The pill's Feed button is the way back now — `BackToFeed` was folded into `useLeaveToFeed`
    // (5.7) and the pill calls it. The e2e user is signed in, so the pill is there.
    await page.getByRole("button", { name: "Feed" }).click();

    // Popped, not pushed — so the URL is the feed entry that was already on the stack, with no
    // `?focus=` in it. (`?focus=` remains the href, and is what a cold-opened shared link uses.)
    await page.waitForURL(/\/feed$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();

    expect(await feedIds()).toEqual(before);
    expect(draws).toEqual([]);
  });

  test("the pill's bookmark browses collections", async ({ page }) => {
    await onFeed(page);
    await page.getByRole("button", { name: "Save to collection" }).click();
    await expect(
      page.getByRole("heading", { name: "Your collections" }),
    ).toBeVisible();
  });

  test("the pill has no share control on the feed", async ({ page }) => {
    await onFeed(page);
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  });

  // The install banner's whole design is about *not* nagging, so what's worth pinning is the
  // restraint: it waits for a second visit, "Add" leads somewhere real, and the X is final.
  // Headless Chromium never fires `beforeinstallprompt`, so "Add" here always takes the
  // instructions path — which is also the path every iOS reader gets, and the only one a test can
  // drive (a real install dialog is browser chrome, outside the page).
  test("the install banner waits for a second visit, then respects the answer", async ({
    page,
  }) => {
    await onFeed(page);

    // Seed the state as though this reader came by yesterday. Faster and far steadier than trying
    // to manufacture a six-hour gap.
    await page.evaluate(() =>
      localStorage.setItem(
        "ambit.install.v1",
        JSON.stringify({
          v: 1,
          feedVisits: 1,
          lastVisitAt: Date.now() - 7 * 60 * 60 * 1000,
        }),
      ),
    );
    await page.reload();

    const banner = page.getByTestId("install-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await banner.getByRole("button", { name: "Add" }).click();
    await expect(
      page.getByRole("heading", { name: "Add to home screen" }),
    ).toBeVisible({ timeout: 15_000 });

    // Closing the instructions is a "not now" — a month's silence, not a refusal.
    await page.keyboard.press("Escape");
    await expect(banner).toBeHidden();
    const afterSnooze = await page.evaluate(() =>
      localStorage.getItem("ambit.install.v1"),
    );
    expect(afterSnooze).toContain("snoozedUntil");

    // Now take the other branch: the X, which must stick across reloads.
    await page.evaluate(() =>
      localStorage.setItem(
        "ambit.install.v1",
        JSON.stringify({ v: 1, feedVisits: 2, lastVisitAt: Date.now() }),
      ),
    );
    await page.reload();
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await banner.getByRole("button", { name: "Not now" }).click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(banner).toHaveCount(0);
  });
});
