import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, like } from "drizzle-orm";

import { signIn, waitForHydration } from "./support";

// The Saved screen (5.9) against a real dev server and Postgres — same local-only caveat and
// same "leaves a real user row behind by design" arrangement as `feed.spec.ts`, whose scaffolding
// this copies wholesale. Deliberately NOT modeled on `gallery.spec.ts`'s multi-screen doorway
// test (its long navigation chains are the environment-flaky part of that suite); each test here
// keeps its chain short.
//
// The seeded corpus exists so the direct-insert tests (3–4) have items whose type and id this
// spec controls; the feed-driven tests (2, 5) intentionally work with whatever the real feed
// draws, because their assertions are about behavior, never about which item appears.
const EMAIL = `ambit-saved-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

/** The topics this spec's user picks in onboarding, and where its seeded items live. */
const TOPICS = ["astronomy", "botany", "music"] as const;

/** A 1×1 transparent GIF. Inline, so the image tiles never depend on a network hop. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const SEED_COUNT = 12;

/** See feed.spec.ts's `connect` for why this is dynamic: `~/env` throws without DATABASE_URL. */
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

test.describe.serial("saved", () => {
  test.beforeAll(async () => {
    conn = await connect();

    await conn.db
      .insert(conn.item)
      .values(
        Array.from({ length: SEED_COUNT }, (_, i) => ({
          source: "e2e",
          // The spec-specific prefix is what the afterAll cleanup is scoped to — deleting by
          // `source: "e2e"` would pull other specs' fixtures out from under their parallel
          // workers (see feed.spec.ts's afterAll for the incident that taught this).
          sourceId: `e2e-saved-${i}`,
          type: i % 3 === 0 ? ("article" as const) : ("image" as const),
          title: `Saved E2E fixture ${i}`,
          summary: `A lede for saved fixture ${i}, long enough for a couple of lines.`,
          imageUrl: PIXEL,
          sourceUrl: `https://example.test/e2e-saved/${i}`,
          topicId: TOPICS[i % TOPICS.length]!,
          curationScore: 9,
        })),
      )
      .onConflictDoNothing();

    execFileSync("bun", ["run", "invite", EMAIL], { stdio: "pipe" });
  });

  test.afterAll(async () => {
    const { db, item, seenItem, savedItem } = conn;

    const seeded = await db
      .select({ id: item.id })
      .from(item)
      .where(like(item.sourceId, "e2e-saved-%"));
    const ids = seeded.map((row) => row.id);
    if (ids.length > 0) {
      // Children first — both tables carry a foreign key onto `item`.
      await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await db.delete(savedItem).where(inArray(savedItem.itemId, ids));
      await db.delete(item).where(inArray(item.id, ids));
    }
  });

  /** Gets the shared user onto a populated /feed (storage is per-test, so sign in each time). */
  async function onFeed(page: Page) {
    await page.goto("/feed");
    if (!new URL(page.url()).pathname.startsWith("/feed")) {
      await signIn(page, EMAIL, PASSWORD);
    }
    // 15s for the same reason as every server-bound wait in this file: a feed compose under five
    // parallel workers has repeatedly outlived the 5s default (08-23-26).
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  /** Gets the shared user onto /saved, via the session guard's redirect if signed out. */
  async function onSaved(page: Page) {
    await page.goto("/saved");
    if (!new URL(page.url()).pathname.startsWith("/saved")) {
      await signIn(page, EMAIL, PASSWORD);
      await page.goto("/saved");
    }
  }

  test("a new user signs up and finds the quiet empty state", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("Saved E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");

    await page.goto("/saved");
    await expect(page.getByText("Nothing kept yet")).toBeVisible();
    await expect(page.getByText("Your quiet collection")).toBeVisible();
    // No chips on the zero-saves screen — the empty state owns it entirely.
    await expect(page.getByRole("button", { name: /^All/ })).toHaveCount(0);

    // A direct `goto` wrote no origin marker, so leaving is a push to /feed, not a pop out of
    // the app. `commit`, not the default `load`: the assertion is *where the CTA navigates*, and
    // waiting out a full dynamic /feed compose on a box already running four other workers is how
    // this test spent its budget on someone else's page (seen on 08-23-26's suite runs).
    await page.getByRole("button", { name: "Back to exploring" }).click();
    await page.waitForURL(/\/feed/, { waitUntil: "commit" });
  });

  // BUILD_PLAN's done bar, end to end: save on the feed → find it on Saved → unsave → gone.
  test("a feed save appears on Saved with live counts, and unsaving removes it", async ({
    page,
  }) => {
    await onFeed(page);

    // Long-press the first tile (feed.spec's mechanics) and file it into Articles.
    const wrapper = page.locator("[data-feed-id]").first();
    const itemId = (await wrapper.getAttribute("data-feed-id"))!;
    const tile = page.locator("[data-feed-id] > *").first();
    const box = (await tile.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550); // past usePress's 450ms threshold
    await page.mouse.up();

    const sheet = page.getByTestId("bottom-sheet-panel");
    await sheet.getByText("Articles").click();
    // 15s, not the default 5: the toast waits out the save mutation plus three invalidation
    // refetches, and on a box running four parallel workers that round trip alone has blown a 5s
    // assertion (08-23-26). Same allowance feed.spec gives its own server-bound polls.
    await expect(page.getByText(/^Saved to /)).toBeVisible({ timeout: 15_000 });

    // The pill's bookmark → collections sheet → "Everything kept" is the app's own doorway to
    // Saved (and what writes the saved-origin marker test 5 relies on).
    await page.getByRole("button", { name: "Save to collection" }).click();
    await page
      .getByTestId("bottom-sheet-panel")
      .getByText("Everything kept")
      .click();
    await page.waitForURL(/\/saved/);

    await expect(page.locator(`[data-saved-id="${itemId}"]`)).toBeVisible();
    await expect(page.getByText("1 thing kept")).toBeVisible();
    await expect(page.getByRole("button", { name: "All · 1" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Articles · 1" }),
    ).toBeVisible();

    await page
      .locator(`[data-saved-id="${itemId}"]`)
      .getByRole("button", { name: "Remove from Saved" })
      .click();
    await expect(page.getByText("Removed from Saved")).toBeVisible();
    await expect(page.locator(`[data-saved-id="${itemId}"]`)).toHaveCount(0);
    await expect(page.getByText("Nothing kept yet")).toBeVisible();
  });

  test("chips filter the grid and carry live counts", async ({ page }) => {
    // Two saves inserted directly — one seeded *image* item in Articles, one seeded *article*
    // item in no collection — so this test controls exactly which tile belongs to which chip.
    const { db, user, collection, savedItem, item } = conn;
    const [account] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, EMAIL));
    const [articles] = await db
      .select({ id: collection.id })
      .from(collection)
      // The row itself was seeded when test 2's sheet first read `saves.collections`.
      .where(
        and(
          eq(collection.userId, account!.id),
          eq(collection.name, "Articles"),
        ),
      );
    const seeded = await db
      .select({ id: item.id, sourceId: item.sourceId })
      .from(item)
      .where(inArray(item.sourceId, ["e2e-saved-0", "e2e-saved-1"]));
    // `i % 3 === 0` seeds articles, so 0 is the article and 1 is the image.
    const articleItemId = seeded.find((r) => r.sourceId === "e2e-saved-0")!.id;
    const imageItemId = seeded.find((r) => r.sourceId === "e2e-saved-1")!.id;
    await db.insert(savedItem).values([
      { userId: account!.id, itemId: imageItemId, collectionId: articles!.id },
      { userId: account!.id, itemId: articleItemId, collectionId: null },
    ]);

    await onSaved(page);
    await expect(page.getByText("2 things kept")).toBeVisible();
    await expect(page.getByRole("button", { name: "All · 2" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Articles · 1" }),
    ).toBeVisible();

    // Filter to Articles: the URL carries the filter, and only the image tile survives.
    await page.getByRole("button", { name: "Articles · 1" }).click();
    await page.waitForURL(/\/saved\?collection=/);
    await expect(page.locator("[data-saved-id]")).toHaveCount(1);
    await expect(
      page.locator(`[data-saved-id="${imageItemId}"]`),
    ).toBeVisible();

    // A zero-count chip is reachable and lands on the filtered-empty line, not the empty state.
    await page.getByRole("button", { name: "Art", exact: true }).click();
    await expect(
      page.getByText("Nothing in this collection yet."),
    ).toBeVisible();

    await page.getByRole("button", { name: "All · 2" }).click();
    await expect(page.locator("[data-saved-id]")).toHaveCount(2);
  });

  test("an image tile opens the gallery, an article tile opens the reader", async ({
    page,
  }) => {
    const { db, item } = conn;
    const seeded = await db
      .select({ id: item.id, sourceId: item.sourceId })
      .from(item)
      .where(inArray(item.sourceId, ["e2e-saved-0", "e2e-saved-1"]));
    const articleItemId = seeded.find((r) => r.sourceId === "e2e-saved-0")!.id;
    const imageItemId = seeded.find((r) => r.sourceId === "e2e-saved-1")!.id;

    await onSaved(page);

    // `> *` then .first(): the pressable tile is the wrapper's first child; the second is the
    // unsave badge, which must NOT be what this click lands on.
    await page.locator(`[data-saved-id="${imageItemId}"] > *`).first().click();
    await page.waitForURL(`/g/${imageItemId}`);

    await page.goBack();
    await page.waitForURL(/\/saved/);

    await page
      .locator(`[data-saved-id="${articleItemId}"] > *`)
      .first()
      .click();
    await page.waitForURL(`/i/${articleItemId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  // Saved's version of feed.spec's return-trip guard: leaving through the header's back arrow
  // pops the feed that is already on the stack — same tiles, zero draws — rather than rebuilding
  // a dynamic /feed (two pages of corpus per trip; see saved-origin.ts).
  test("leaving Saved returns to the same feed without drawing new items", async ({
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

    await page.getByRole("button", { name: "Save to collection" }).click();
    await page
      .getByTestId("bottom-sheet-panel")
      .getByText("Everything kept")
      .click();
    await page.waitForURL(/\/saved/);

    // Every way back to /feed that would cost a page of corpus: the client query, and any request
    // for the route itself (a document load or an RSC payload fetch both re-run the server
    // component). Counted from here so the outbound trip's own requests don't muddy it.
    const draws: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/api/trpc/feed.page")) draws.push("client");
      else if (pathname === "/feed") draws.push(`route:${request.method()}`);
    });

    await page.getByRole("button", { name: "Back to feed" }).click();
    await page.waitForURL(/\/feed$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();

    expect(await feedIds()).toEqual(before);
    expect(draws).toEqual([]);
  });
});
