import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { signIn, waitForHydration } from "./support";

// The feed masonry against a real dev server, real Postgres and the real feed engine (SPEC §12,
// PHASE5_PLAN_5.6.md Step 8). Same local-only caveat as `auth.spec.ts` — CI has no Postgres until
// Phase 7.1 — and the same "leaves a real user row behind by design" arrangement, with a
// timestamped address so reruns never collide.
//
// **Serial, sharing one signed-up user.** Playwright isolates storage per test, so each test
// signs in again through `onFeed()` rather than assuming a cookie carried over.
//
// **What the seeded corpus is and isn't for.** `beforeAll` inserts ~30 `source: "e2e"` items
// directly through Drizzle — never `bun run ingest`, which would hit five live APIs and an LLM.
// It guarantees the feed has *something* to draw (which is what will keep this spec meaningful
// once Phase 7.1 gives CI an empty database), but it deliberately does NOT try to make the feed
// deterministic: the dev DB holds 8.5k real items, the tier draw reaches across all sixteen
// topics, and thirty rows cannot dominate that. So every assertion below is about behavior —
// tiles render, the count grows, a gesture does what it should — never about which item appears.
const EMAIL = `ambit-feed-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

/** The topics this spec's user picks in onboarding, and where its seeded items live. */
const TOPICS = ["astronomy", "botany", "music"] as const;

/** A 1×1 transparent GIF. Inline, so the happy image path never depends on a network hop. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const SEED_COUNT = 30;

/**
 * The DB handle, loaded in `beforeAll`.
 *
 * Two reasons this is a dynamic import rather than a top-level one. Playwright runs under plain
 * Node, which — unlike Bun — does not auto-load `.env`, and `~/server/db/client` pulls in `~/env`,
 * whose Zod validation throws at *import* time without `DATABASE_URL`. So the env file has to be
 * loaded first, and a static import would be hoisted above that. (`vitest.config.ts` solves the
 * same problem the same way, for the same reason.)
 */
async function connect() {
  process.loadEnvFile(new URL("../.env", import.meta.url));
  const [{ db }, schema] = await Promise.all([
    import("../src/server/db/client"),
    import("../src/server/db/schema"),
  ]);
  return { db, ...schema };
}

type Connection = Awaited<ReturnType<typeof connect>>;
let conn: Connection;

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

    execFileSync("bun", ["run", "invite", EMAIL], { stdio: "pipe" });
  });

  test.afterAll(async () => {
    const { db, item, seenItem, savedItem } = conn;
    const { eq, inArray } = await import("drizzle-orm");

    const seeded = await db
      .select({ id: item.id })
      .from(item)
      .where(eq(item.source, "e2e"));
    const ids = seeded.map((row) => row.id);
    if (ids.length > 0) {
      // Children first — both tables carry a foreign key onto `item`.
      await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await db.delete(savedItem).where(inArray(savedItem.itemId, ids));
      await db.delete(item).where(eq(item.source, "e2e"));
    }
  });

  /** Gets the shared user onto a populated /feed. Playwright isolates storage per test, so this
   *  signs in again every time rather than assuming the previous test's cookie carried over. */
  async function onFeed(page: Page) {
    await page.goto("/feed");
    if (!new URL(page.url()).pathname.startsWith("/feed")) {
      await signIn(page, EMAIL, PASSWORD);
    }
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
  }

  test("a new user signs up, picks topics, and lands on a populated feed", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);
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
  });

  test("renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      // Image loads are filtered out, and only image loads. The feed hotlinks museum CDNs until
      // the image proxy lands in 5.7, and several of them bot-block third-party referrers — those
      // 403s are a known, designed-for condition (the tile falls back to "Image unavailable"),
      // not a defect this assertion should chase. Everything else — React errors, hydration
      // mismatches, thrown exceptions — still fails the test, which is the signal worth having.
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
  // corpus (`feed.page` writes `seen_item`, and both the RSC render and the client query draw
  // one). Found on-device 08-20-26. The assertions below are the guard: same tiles, and nothing
  // drawn.
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
    await expect(page.getByRole("heading")).toBeVisible();

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

    await page.getByRole("link", { name: "← Back" }).click();

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
});
