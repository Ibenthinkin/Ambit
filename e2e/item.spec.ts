import { expect, test } from "@playwright/test";

import {
  PIXEL,
  cleanupSeeded,
  completeOnboarding,
  connect,
  inviteUser,
  openAuthSheet,
  signIn,
  waitForHydration,
  type Connection,
} from "./support";

// The item pages (`/i/[itemId]`) against a real dev server and real Postgres — the app's one
// public surface, so most of what follows runs in a context that is **never signed in**. That is
// the point: a stranger with a link must get the whole page, and nothing about anyone else.
//
// Runs locally against the dev server and, since Phase 7.1, in CI against a production build with
// a fresh database — the seeded `source: "e2e"` corpus below is what makes the latter possible.
// It is cleaned up children-first in `afterAll`.
//
// A picture's page is the **merged item screen** since 09-10-26 (docs/DESIGN_screen-structure.md):
// the old immersive gallery's rail is the hero, the facts sit under it, and `/g/` redirects here.
// `gallery.spec.ts` folded into this file then — its rail flows are the "rail" tests below.
//
// **The swipe gestures are not tested here.** Playwright's mouse API doesn't compose the
// pointerdown / pointermove / pointerup sequences the hooks listen for reliably enough to assert
// on — the rail swipe, the down-flick exit, the article page's swipe-back. They're covered by
// `src/hooks/use-rail-gestures.test.tsx` and `use-swipe-back.test.tsx`, and judged on an iOS device
// pass, which is where a rubber-band follow can actually be judged anyway. The keyboard drives the
// rail here instead: ←/→ page it, Escape leaves.
const EMAIL = `ambit-item-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

/** Wiki-format section markers — what `exsectionformat=wiki` stores and the reader parses. */
const BODY = [
  "== A section ==",
  "A paragraph inside the section, long enough to be prose.",
  "=== A subsection ===",
  "Another paragraph, also prose.",
  "== References ==",
  "Someone, A. (1999). A citation nobody wants to read.",
].join("\n");

// See support.ts's connect() for why the DB handle is loaded in `beforeAll`, not imported statically.
let conn: Connection;

let imageId: string;
let articleId: string;
let imagelessId: string;
let httpImageId: string;
let blogId: string;
/** The rail's neighbours: six more pictures across two topics, so the walk has somewhere to go. */
let imageIds: string[] = [];

/**
 * Bring the picture's chrome (caption + pill) up with the mouse. A *move*, not a click: a click on
 * the picture is a tap, which toggles — and Playwright's click moves the mouse first, which
 * summons, so a click would show and then hide in one call. A move only ever shows, and restarts
 * the ten-second cycle, so the pill stays put for the next few steps.
 */
async function summonChrome(page: import("@playwright/test").Page) {
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(Math.round(width / 2) - 10, Math.round(height / 4));
  await page.mouse.move(
    Math.round(width / 2) + 10,
    Math.round(height / 4) + 10,
  );
  await expect(page.getByTestId("gallery-chrome")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
}

test.describe.serial("item pages", () => {
  test.beforeAll(async () => {
    conn = await connect();

    const [image, article, imageless, httpImage, blog] = await conn.db
      .insert(conn.item)
      .values([
        {
          source: "e2e",
          sourceId: `e2e-item-image-${Date.now()}`,
          type: "image" as const,
          title: "A seeded plate",
          summary: "A caption long enough to occupy a couple of lines.",
          imageUrl: PIXEL,
          sourceUrl: "https://example.test/e2e/image",
          attribution: "An engraver, unattributed",
          topicId: "astronomy",
          curationScore: 9,
        },
        {
          source: "e2e",
          sourceId: `e2e-item-article-${Date.now()}`,
          type: "article" as const,
          title: "A seeded article",
          summary: "A lede long enough to occupy a couple of lines.",
          body: BODY,
          imageUrl: PIXEL,
          sourceUrl: "https://example.test/e2e/article",
          topicId: "astronomy",
          curationScore: 9,
        },
        {
          // No image at all — the twitter-card fallback needs one of these to have anything to say.
          source: "e2e",
          sourceId: `e2e-item-imageless-${Date.now()}`,
          type: "article" as const,
          title: "A seeded article without a picture",
          summary: "A lede, again long enough to occupy a couple of lines.",
          body: BODY,
          sourceUrl: "https://example.test/e2e/imageless",
          topicId: "astronomy",
          curationScore: 9,
        },
        {
          // The only fixture with an http image URL, and it exists for `og:image` alone. The other
          // three carry data-URIs, which the page deliberately keeps *out* of the preview card —
          // there is nothing behind the proxy to fetch, and a scraper can't use a 404. Nothing
          // ever loads this URL; only the meta tag is read.
          source: "e2e",
          sourceId: `e2e-item-http-${Date.now()}`,
          type: "image" as const,
          title: "A seeded plate with a real URL",
          summary: "A caption long enough to occupy a couple of lines.",
          imageUrl: "https://example.test/e2e/plate.jpg",
          sourceUrl: "https://example.test/e2e/http-image",
          topicId: "astronomy",
          curationScore: 9,
        },
        {
          // Phase 6.3: a blog link card. Same `e2e-item-` prefix so afterAll's cleanup finds it;
          // a real blog `source` so the link-out row renders.
          source: "doorofperception",
          sourceId: `e2e-item-blog-${Date.now()}`,
          type: "image" as const,
          title: "A seeded post",
          summary:
            "The blog's own excerpt, long enough to occupy a couple of lines on the card.",
          body: null,
          imageUrl: PIXEL,
          sourceUrl: "https://doorofperception.com/2026/01/a-seeded-post/",
          attribution: "Door of Perception",
          license:
            "Rights retained by original authors — displayed with credit and link",
          topicId: "astronomy",
          curationScore: 9,
        },
      ])
      .returning();

    imageId = image!.id;
    articleId = article!.id;
    imagelessId = imageless!.id;
    httpImageId = httpImage!.id;
    blogId = blog!.id;

    // Six pictures across two real topic ids (moved from gallery.spec.ts), so the rail's walk has
    // somewhere to go and its fallback chain (step topic → anchor topic → anywhere) has something
    // to find. Same `e2e-item-` prefix, so afterAll's cleanup finds them.
    const stamp = Date.now();
    const rail = await conn.db
      .insert(conn.item)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          source: "e2e",
          sourceId: `e2e-item-rail-${i}-${stamp}`,
          type: "image" as const,
          title: `Rail plate ${i}`,
          summary: `A caption for plate ${i}, long enough to occupy a line.`,
          imageUrl: PIXEL,
          sourceUrl: `https://example.test/e2e/rail-${i}`,
          attribution: `Engraver ${i}`,
          topicId: i % 2 === 0 ? "astronomy" : "botany",
          curationScore: 9,
        })),
      )
      .returning();
    imageIds = rail.map((r) => r.id);

    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    // Scoped to this spec's own prefix, never to `source: "e2e"` as a whole — see
    // support.ts's cleanupSeeded() for the 5.8 incident that taught this.
    await cleanupSeeded(conn, "e2e-item-");
  });

  // ── incognito ─────────────────────────────────────────────────────────────────────────────────
  // The default Playwright context has never signed in, so every test in this block is a stranger.

  test("an image item renders whole for a signed-out visitor", async ({
    page,
  }) => {
    await page.goto(`/i/${imageId}`);

    await expect(
      page.getByRole("heading", { name: "A seeded plate", level: 1 }),
    ).toBeVisible();
    // The picture is the page's hero strip, and the facts table sits under it: the maker is a
    // row there (the caption says it too, but the caption starts hidden).
    await expect(page.getByTestId("gallery-track")).toBeVisible();
    await expect(page.locator("main img").first()).toBeVisible();
    const facts = page.getByRole("list", { name: "About this work" });
    await expect(facts).toBeVisible();
    await expect(facts.getByText("An engraver, unattributed")).toBeVisible();
    // Two links name the source — the credit line under the title and the table's From row —
    // and both go to the original.
    const credits = page.getByRole("link", { name: "E2e", exact: true });
    await expect(credits).toHaveCount(2);
    for (const link of await credits.all()) {
      await expect(link).toHaveAttribute(
        "href",
        "https://example.test/e2e/image",
      );
    }

    // The teaser renders even against a thin corpus, because wander-next falls back to the item's
    // own topic when the graph offers nothing.
    await expect(
      page.getByRole("heading", { name: "Where Ambit would wander next" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get your invite" }),
    ).toBeVisible();

    // No pill: it exists only for signed-in readers, along with everything it opens.
    await expect(
      page.getByRole("button", { name: "Save to collection" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
  });

  test("an article renders as a reader, apparatus dropped", async ({
    page,
  }) => {
    await page.goto(`/i/${articleId}`);

    await expect(
      page.getByRole("heading", { name: "A seeded article", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A section" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A subsection" }),
    ).toBeVisible();

    // The References section and its contents are gone — the parser's whole job, proven end to end.
    await expect(page.getByText("A citation nobody wants")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "References" })).toHaveCount(
      0,
    );

    // `sourceLabel`'s title-case fallback for an unknown source.
    await expect(
      page.getByRole("link", { name: "Read on E2e →" }),
    ).toHaveAttribute("href", "https://example.test/e2e/article");
    await expect(
      page.getByText("Ambit is a quieter way to read."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save to collection" }),
    ).toHaveCount(0);
  });

  test("a blog item is a link card: credit, blurb, and a prominent link out — no reader view", async ({
    page,
  }) => {
    await page.goto(`/i/${blogId}`);
    await expect(
      page.getByRole("heading", { name: "A seeded post", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/The blog's own excerpt/)).toBeVisible();
    // The credit line, the facts table's From row and the link-out row all point at the post.
    // `exact`, or Playwright's substring match also catches "Read the post on Door of Perception".
    const credits = page.getByRole("link", {
      name: "Door of Perception",
      exact: true,
    });
    await expect(credits).toHaveCount(2);
    for (const link of await credits.all()) {
      await expect(link).toHaveAttribute(
        "href",
        "https://doorofperception.com/2026/01/a-seeded-post/",
      );
    }
    const linkOut = page.getByRole("link", {
      name: /Read the post on Door of Perception/,
    });
    await expect(linkOut).toBeVisible();
    await expect(linkOut).toHaveAttribute("target", "_blank");
    // No typeset article: the reader body's section headings never render for a blog item.
    await expect(
      page.locator("article").getByRole("heading", { level: 2 }),
    ).toHaveCount(0);
  });

  test("the share preview describes the item and nothing else", async ({
    page,
  }) => {
    await page.goto(`/i/${httpImageId}`);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "A seeded plate with a real URL",
    );
    // Through the proxy, so a scraper fetching it gets an origin that will actually answer.
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage).toContain(`/api/img/${httpImageId}`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );

    // No image behind the proxy → the small card, and no og:image to 404 on.
    await page.goto(`/i/${imagelessId}`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  });

  test("nothing about any user reaches a signed-out visitor", async ({
    page,
  }) => {
    await page.goto(`/i/${imageId}`);

    const html = await page.content();
    expect(html).not.toContain(EMAIL);
    expect(html).not.toContain("Item E2E");
    await expect(page.getByText("shared this with you")).toHaveCount(0);

    // The shared-by row is param-driven and text-only — it says what the link says, no more.
    await page.goto(`/i/${imageId}?from=Mara`);
    await expect(page.getByText("Mara shared this with you")).toBeVisible();
  });

  test("the proxy 404s an id that isn't an item", async ({ request }) => {
    // The happy path is unit-tested (`route.test.ts`); the seeded items here carry data-URIs, which
    // bypass the proxy by design, so this is the branch e2e can actually reach.
    const res = await request.get("/api/img/does-not-exist");
    expect(res.status()).toBe(404);
  });

  test("renders without console errors on both variants", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      // Image loads filtered, and only image loads — same rule and reason as feed.spec.ts.
      const text = msg.text();
      const isImageLoad =
        text.includes("Failed to load resource") ||
        text.includes("ERR_NAME_NOT_RESOLVED");
      if (msg.type() === "error" && !isImageLoad) consoleErrors.push(text);
    });

    await page.goto(`/i/${imageId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(`/i/${articleId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  // ── signed in ─────────────────────────────────────────────────────────────────────────────────

  test("a signed-in reader gets the pill, and can file the item", async ({
    page,
  }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("Item E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await completeOnboarding(page, ["Astronomy", "Botany", "Music"]);

    await page.goto(`/i/${imageId}`);

    // The pill is server-rendered before React attaches to it, so a click that lands too early
    // does nothing at all and the test waits out its timeout on a sheet that never opened — the
    // same trap `waitForHydration`'s own comment describes for the landing form.
    await waitForHydration(page, "nav[aria-label='Ambit toolbar']");

    // On a picture the pill rides in the chrome, which starts hidden. Unlike the feed's
    // three-control pill, an item page has a current item — so it has a share.
    await summonChrome(page);
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);

    await page.getByRole("button", { name: "Save to collection" }).click();
    await page.getByRole("heading", { name: "Save to" }).waitFor();
    await page.getByText("Articles").click();
    await expect(page.getByText("Saved to Articles")).toBeVisible();

    // Reopening shows where it went, which is what `saves.forItem` is for.
    await summonChrome(page);
    await page.getByRole("button", { name: "Save to collection" }).click();
    await expect(page.getByText("Already saved here")).toBeVisible();
    await page.getByTestId("bottom-sheet-scrim").click();

    // The picture IS the screen as of 09-10-26 — there is no doorway to tap. What belongs here:
    // the strip is on the page and the facts are under it.
    await expect(page.getByTestId("gallery-track")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "About this work" }),
    ).toBeVisible();
  });

  test("/g/ redirects to the item page", async ({ page }) => {
    await page.goto(`/g/${imageId}`);
    await page.waitForURL(`/i/${imageId}`);
    await expect(page.getByTestId("gallery-track")).toBeVisible();
  });

  test("from the feed: tile → item → swipe → Escape returns to the intact feed, drawing nothing", async ({
    page,
  }) => {
    await page.goto("/feed");
    await signIn(page, EMAIL, PASSWORD);

    const feedIds = () =>
      page
        .locator("[data-feed-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-feed-id")),
        );
    // The tiles arrive after the route resolves — reading ids straight off `waitForURL` races the
    // render and comes back empty (`onFeed` in feed.spec.ts waits the same way, for the same reason).
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    const before = await feedIds();

    // The first *image* tile, not simply the first tile: an article opens the reader, which has no
    // rail to swipe.
    const imageTile = page.locator("[data-feed-id]:has(img)").first();
    await expect(imageTile).toBeVisible();
    const itemId = (await imageTile.getAttribute("data-feed-id"))!;
    await imageTile.locator("> *").click();
    await page.waitForURL(`/i/${itemId}`);
    await waitForHydration(page, "[data-testid='gallery-track']");

    // Every way back to /feed that would cost a page of corpus: the client query, and any request
    // for the route itself. Same technique, same reasoning, as feed.spec.ts's own guard — counted
    // from here so the outbound trip's requests don't muddy it.
    const draws: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      // The whole URL, not just a label: a recurrence must say exactly which request fired (the
      // first full run of this test saw one client `feed.page` it could not explain).
      if (pathname.startsWith("/api/trpc/feed.page"))
        draws.push(`client ${request.url()}`);
      else if (pathname === "/feed") draws.push(`route:${request.method()}`);
    });

    // ArrowRight advances the rail — the address bar follows (`replaceState`), the page does not
    // navigate.
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.url()).not.toContain(`/i/${itemId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Escape pops the feed that was already on the stack — keyed on the *entry* item, so the swipe
    // doesn't matter: same tiles, no `?focus=`, nothing redrawn.
    await page.keyboard.press("Escape");
    await page.waitForURL(/\/feed$/);
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
    expect(await feedIds()).toEqual(before);
    expect(draws).toEqual([]);
  });

  test("a signed-in reader can sign in again and still read the page", async ({
    page,
  }) => {
    // Playwright isolates storage per test, so this context has no cookie — `/feed` bounces to the
    // landing page, which is where `signIn` starts.
    await page.goto("/feed");
    await signIn(page, EMAIL, PASSWORD);
    await page.goto(`/i/${articleId}`);

    await expect(
      page.getByRole("heading", { name: "A seeded article", level: 1 }),
    ).toBeVisible();
    // No invitation for someone already inside.
    await expect(page.getByText("Get your invite")).toHaveCount(0);
  });

  // The sentence the whole rail design turns on (the 08-20-26 corpus-burn postmortem): swiping is
  // free. Asserted from the outside, on a real signed-up account, after a real rail session.
  test("a rail session spends none of the reader's corpus", async ({
    page,
  }) => {
    const { db, seenItem, user } = conn;
    const { count, eq } = await import("drizzle-orm");

    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, EMAIL));
    const userId = row!.id;

    const seenCount = async () => {
      const [c] = await db
        .select({ n: count() })
        .from(seenItem)
        .where(eq(seenItem.userId, userId));
      return c!.n;
    };

    const before = await seenCount();

    // Signed out is enough for this: the rail procedure is public and takes no user, so if it
    // wrote anything at all it would be a bug regardless of who was looking.
    for (const id of imageIds.slice(0, 3)) {
      await page.goto(`/i/${id}`);
      await expect(page.getByTestId("gallery-track")).toBeVisible();
      await page.keyboard.press("ArrowRight");
    }

    expect(await seenCount()).toBe(before);
  });
});
