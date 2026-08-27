import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { openAuthSheet, signIn, waitForHydration } from "./support";

// The item pages (`/i/[itemId]`) against a real dev server and real Postgres — the app's one
// public surface, so most of what follows runs in a context that is **never signed in**. That is
// the point: a stranger with a link must get the whole page, and nothing about anyone else.
//
// Same local-only caveat as the other specs (CI has no Postgres until 7.1) and the same seeded
// `source: "e2e"` corpus, cleaned up children-first in `afterAll`.
//
// **The swipe gesture is not tested here.** Playwright's mouse API doesn't compose the pointerdown
// / pointermove / pointerup sequence the hook listens for reliably enough to assert on; it's
// covered by `src/hooks/use-swipe-back.test.tsx` and by the phase's iOS device pass, which is where
// a rubber-band follow can actually be judged anyway.
const EMAIL = `ambit-item-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";

/** A 1×1 transparent GIF. Inline, so nothing here depends on a network hop or on the image proxy. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Wiki-format section markers — what `exsectionformat=wiki` stores and the reader parses. */
const BODY = [
  "== A section ==",
  "A paragraph inside the section, long enough to be prose.",
  "=== A subsection ===",
  "Another paragraph, also prose.",
  "== References ==",
  "Someone, A. (1999). A citation nobody wants to read.",
].join("\n");

async function connect() {
  // Playwright runs under plain Node, which doesn't auto-load `.env` — and `~/server/db/client`
  // validates env at import time. Hence the dynamic import; see feed.spec.ts for the full note.
  process.loadEnvFile(new URL("../.env", import.meta.url));
  const [{ db }, schema] = await Promise.all([
    import("../src/server/db/client"),
    import("../src/server/db/schema"),
  ]);
  return { db, ...schema };
}

type Connection = Awaited<ReturnType<typeof connect>>;
let conn: Connection;

let imageId: string;
let articleId: string;
let imagelessId: string;
let httpImageId: string;
let blogId: string;

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

    execFileSync("bun", ["run", "invite", EMAIL], { stdio: "pipe" });
  });

  test.afterAll(async () => {
    const { db, item, seenItem, savedItem } = conn;
    const { inArray, like } = await import("drizzle-orm");

    // **Scoped to this spec's own `sourceId` prefix, not to `source: "e2e"`.** Every spec seeds
    // under that same source, and `fullyParallel` runs the spec files in separate workers — so a
    // cleanup that deleted the whole source would pull another spec's fixtures out from under it
    // mid-run. That is exactly what happened when 5.8 added a third such spec: the feed came back
    // empty and an item page 404'd, in two different files, for no reason visible in either.
    const seeded = await db
      .select({ id: item.id })
      .from(item)
      .where(like(item.sourceId, "e2e-item-%"));
    const ids = seeded.map((row) => row.id);
    if (ids.length > 0) {
      // Children first — both tables carry a foreign key onto `item`.
      await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await db.delete(savedItem).where(inArray(savedItem.itemId, ids));
      await db.delete(item).where(inArray(item.id, ids));
    }
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
    await expect(page.getByText("An engraver, unattributed")).toBeVisible();
    await expect(page.getByRole("link", { name: "E2e" })).toHaveAttribute(
      "href",
      "https://example.test/e2e/image",
    );
    await expect(page.locator("main img").first()).toBeVisible();

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
    // The credit line and the link-out row both point at the post.
    // `exact`, or Playwright's substring match also catches "Read the post on Door of Perception".
    await expect(
      page.getByRole("link", { name: "Door of Perception", exact: true }),
    ).toHaveAttribute(
      "href",
      "https://doorofperception.com/2026/01/a-seeded-post/",
    );
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

    await page.waitForURL("/onboarding");
    // Three is the minimum before the CTA stops reading "Pick N more" (SPEC §3.2). The seeded
    // items all live in Astronomy; the other two are just there to satisfy the gate.
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");

    await page.goto(`/i/${imageId}`);

    // Unlike the feed's three-control pill, an item page has a current item — so it has a share.
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(1);

    // The pill is server-rendered before React attaches to it, so a click that lands too early
    // does nothing at all and the test waits out its timeout on a sheet that never opened — the
    // same trap `waitForHydration`'s own comment describes for the landing form.
    await waitForHydration(page, "nav[aria-label='Ambit toolbar']");

    await page.getByRole("button", { name: "Save to collection" }).click();
    await page.getByRole("heading", { name: "Save to" }).waitFor();
    await page.getByText("Articles").click();
    await expect(page.getByText("Saved to Articles")).toBeVisible();

    // Reopening shows where it went, which is what `saves.forItem` is for.
    await page.getByRole("button", { name: "Save to collection" }).click();
    await expect(page.getByText("Already saved here")).toBeVisible();
    await page.getByTestId("bottom-sheet-scrim").click();

    // The hero is a doorway as of 5.8 — a tap opens the immersive gallery. A Playwright click is a
    // tap (no movement between down and up, so `usePress`'s slop guard passes). The gallery's own
    // behaviour is `gallery.spec.ts`'s subject; what belongs here is that the *item page* sends
    // the reader there at all.
    await waitForHydration(page, "main img");
    await page.locator("main img").first().click();
    await page.waitForURL(`/g/${imageId}`);
    await expect(page.getByTestId("gallery-track")).toBeVisible();
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
});
