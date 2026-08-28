import { expect, test, type Cookie, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  restoreSession,
  saveSession,
  seedFeedCorpus,
  type Connection,
} from "./support";

// Phase 5.10's three screens — Profile, Profile Edit, Settings — against a real dev server and
// Postgres — locally the dev server, and since Phase 7.1 a production build with a fresh database
// in CI. Same "leaves a real user row behind by design" arrangement as `feed.spec.ts` and
// `saved.spec.ts`, whose scaffolding this shares (./support).
//
// **Nothing here depends on *which* items exist** — the collection tiles are about names and
// counts, and every count starts at zero. It does need the feed to have *something* in it, though:
// the first test walks the sign-up journey through onboarding to a populated feed. That used to
// come free from the development database; on CI's empty one (Phase 7.1) the file seeds its own
// small corpus, like every other spec. See support.ts's seedFeedCorpus().
//
// Every server-bound wait carries an explicit 15s. The 5s default became the suite's consistent
// loser once 5.9 brought the parallel worker count to five (08-23-26), and this file makes six spec
// files. If timeouts start rotating between victims anyway, the fix is to cap `workers` in
// playwright.config.ts rather than to keep sprinkling per-assertion allowances — 5.9's own
// recommendation, recorded here so the next person hits it in the right order.
const RUN = Date.now();
const EMAIL = `ambit-settings-e2e-${RUN}@example.com`;
const PASSWORD = "correcthorse123";

/**
 * Timestamped for the same reason the email is, and then some: `user.handle` is **globally**
 * unique, and this spec's user row survives the run by design (like every other spec's). A fixed
 * handle therefore works exactly once — every rerun collides with its own predecessor and the save
 * comes back CONFLICT. Typed in mixed case with a leading `@` on purpose, so the round trip has
 * both normalizations to prove.
 */
const HANDLE = `e2e${RUN}`;

/** The topics this spec's user picks in onboarding, and where its seeded items live. */
const TOPICS = ["astronomy", "botany", "music"] as const;

// See support.ts's connect() for why the DB handle is loaded in `beforeAll`, not imported statically.
let conn: Connection;

/**
 * The signed-in session the sign-up test below captures, reused by every test after it instead of
 * signing in again — see support.ts's saveSession() for why (the production build rate-limits
 * `/sign-in` to 3 requests per 10s, and this file used to make one per test).
 */
let session: Cookie[] = [];

test.describe.serial("settings", () => {
  test.beforeAll(async () => {
    conn = await connect();
    // Six tests, most of which pass through /feed at least once, and each visit costs this reader
    // a page (12) it can never be served again — see support.ts's seedFeedCorpus().
    await seedFeedCorpus(conn, "e2e-settings-", 90, TOPICS);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    const { db, collection, savedItem, user } = conn;

    // Scoped by this run's own user, found by its timestamped email — never by a broad predicate
    // that could pull another spec's fixtures out from under a parallel worker.
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, EMAIL))
      .limit(1);
    if (!row) return;

    // Children first: `saved_item.collection_id` is ON DELETE SET NULL, so the delete would
    // succeed either way, but dependency order keeps this readable as the graph it is. The user
    // row itself stays, like every other spec's — the timestamped email means reruns never collide.
    await db.delete(savedItem).where(inArray(savedItem.userId, [row.id]));
    await db.delete(collection).where(eq(collection.userId, row.id));

    // And the corpus, children-first, scoped to this file's own prefix.
    await cleanupSeeded(conn, "e2e-settings-");
  });

  /** Gets the shared user onto a path. Storage is per-test, so the session the sign-up test
   *  captured is put back by hand rather than signed in for again — see support.ts's
   *  saveSession() for why this file no longer signs in six times in two minutes. */
  async function goTo(page: Page, path: string) {
    await restoreSession(page, session);
    await page.goto(path);
  }

  test("a new user signs up and reaches Profile from the feed's pill", async ({
    page,
  }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page
      .getByPlaceholder("What should we call you?")
      .fill("Settings E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");
    // The pill only exists once the feed has rendered — 15s, same as every other first compose.
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });

    // The signpost 5.6 left behind: the pill's avatar has pointed at a 404 since then.
    await page.getByRole("button", { name: "Profile" }).click();
    await page.waitForURL("/profile", { timeout: 15_000 });

    await expect(page.getByText("Settings E2E")).toBeVisible();
    await expect(page.getByText("New collection")).toBeVisible();
    // The three seeded defaults, all empty.
    for (const name of ["Articles", "Art", "Photos"]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("0 items").first()).toBeVisible();

    // And back out. The pill's Feed button pops, because arriving here wrote the marker.
    await page.getByRole("button", { name: "Feed" }).click();
    await page.waitForURL(/\/feed/, { waitUntil: "commit" });

    // Every test below reuses this session rather than signing in again.
    session = await saveSession(page);
  });

  test("a collection can be made once, and its tile opens the filtered Saved list", async ({
    page,
  }) => {
    await goTo(page, "/profile");

    await page.getByText("New collection").click();
    await page.getByLabel("Collection name").fill("Maps");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Maps created")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-collection-id]")).toHaveCount(4, {
      timeout: 15_000,
    });
    // The sheet closes itself on success — an assertion worth making in its own right, and the one
    // this test was missing. `BottomSheet` keeps the panel mounted for a 260ms exit animation, and
    // against a production build the new tile lands well before that finishes: for those few
    // frames "New collection" matches the sheet's own <h2> as well as the dashed tile, and the
    // reopen below fails on strict mode rather than on anything being wrong.
    await expect(
      page.getByRole("heading", { name: "New collection" }),
    ).toBeHidden({ timeout: 15_000 });

    // The duplicate path: the sheet stays open with the name intact, error under the field.
    await page.getByText("New collection").click();
    await page.getByLabel("Collection name").fill("Maps");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByText("You already have a collection with that name."),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Collection name")).toHaveValue("Maps");

    // Dismiss the sheet and follow the tile through to Saved.
    await page.getByTestId("bottom-sheet-scrim").click();
    await page.getByText("Maps", { exact: true }).click();
    await page.waitForURL(/\/saved\?collection=/, { timeout: 15_000 });
  });

  test("the edit form round-trips name, handle and bio", async ({ page }) => {
    await goTo(page, "/profile");

    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.waitForURL("/profile/edit", { timeout: 15_000 });

    await page.getByLabel("Name").fill("Ben R");
    // Typed with the sigil and in upper case, exactly as a reader might — both are normalized
    // away before the write (see HANDLE).
    await page.getByLabel("Handle").fill(`@${HANDLE.toUpperCase()}`);
    await page.getByLabel("About").fill("Maps, mostly.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile saved")).toBeVisible({
      timeout: 15_000,
    });
    // The save leaves after its confirmation beat, back to Profile.
    await page.waitForURL("/profile", { timeout: 15_000 });
    await expect(page.getByText("Ben R")).toBeVisible();
    await expect(page.getByText(`@${HANDLE}`)).toBeVisible();
    await expect(page.getByText("Maps, mostly.")).toBeVisible();

    // And Settings reads the same row.
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForURL("/settings", { timeout: 15_000 });
    await expect(page.getByText("Ben R")).toBeVisible();
  });

  test("the real settings rows are real, and the stubs are honest", async ({
    page,
  }) => {
    await goTo(page, "/settings");

    // "What you see" reads back the three topics picked during onboarding.
    await expect(page.getByText("Astronomy, Botany, Music")).toBeVisible({
      timeout: 15_000,
    });

    // "Maps" is the chip label for the `cartography` topic (the slug is a graph key — see
    // server/config/topics.ts). Adding it makes four picks, and the row lists three alphabetically
    // with an overflow count.
    await page.getByText("What you see").click();
    // Scoped to the sheet: "Everything kept · 0 saves" also matches a bare `name: "Save"` prefix
    // match, and "Maps" would match this user's collection tile on another screen.
    const sheet = page.getByTestId("bottom-sheet-panel");
    await sheet.getByRole("button", { name: "Maps" }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Feed updated")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Astronomy, Botany, Maps +1")).toBeVisible({
      timeout: 15_000,
    });

    // Appearance: the knob applies live, and survives a reload via layout.tsx's inline script.
    await page.getByText("Appearance").click();
    await page.getByText("Amber").click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");

    // A stub says so rather than showing an invented value.
    await page.getByText("Serendipity").click();
    await expect(page.getByText("Serendipity · coming soon")).toBeVisible();

    await expect(page.getByText("Ambit · invite-only · v0.5")).toBeVisible();
  });

  test("sign out from its permanent home ends the session", async ({
    page,
  }) => {
    await goTo(page, "/settings");

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // The guard holds afterwards — this is the assertion that makes it a sign-out and not a
    // navigation.
    await page.goto("/feed");
    await page.waitForURL("/");
  });
});
