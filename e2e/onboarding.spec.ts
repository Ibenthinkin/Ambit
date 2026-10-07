import { expect, test, type Cookie, type Page } from "@playwright/test";

import {
  answerQuestionnaire,
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  restoreSession,
  saveSession,
  seedFeedCorpus,
  type Connection,
} from "./support";

// The questionnaire's own journeys (10-02-26, docs/PLAN_onboarding-questionnaire.md). Every other
// spec signs up *through* it (support.ts's `completeOnboarding`, answering toward astronomy,
// botany and music); this file covers what none of them reach:
//
//   1. skipping every question — the reveal then proposes the starters, and that is enough;
//   2. a retake from /profile/topics — which *replaces* the reader's topics;
//   3. Reading set to "None" — a feed with no writing in it at all;
//   4. First Exhibition's reveal head — a named exhibition, kept on /profile/topics.
//
// Nothing here types into the two free-text questions: that would be a model call, CI has no key
// (the server answers empty lists), and the mapping is unit-tested with the call mocked.
//
// Same "leaves a real user row behind by design" arrangement as the other specs.
const RUN = Date.now();
const EMAIL = `ambit-onboarding-e2e-${RUN}@example.com`;
const PASSWORD = "correcthorse123";
const PREFIX = "e2e-onboarding-";

/**
 * Where the fixtures live: the three topics a skip-everything reveal proposes (the bank's first
 * three starters, all original topics), plus the two the retake answers toward. A third of the
 * rows are articles — which is what makes "None means no writing" a claim about the feed engine
 * rather than about an empty shelf.
 */
const TOPICS = [
  "astronomy",
  "botany",
  "architecture",
  "the-ocean",
  "geology",
] as const;

let conn: Connection;
let session: Cookie[] = [];

/** A writing card of either kind — the picture-led tile and the text card both carry a title
 *  heading; a plain picture carries no words. */
const writingTiles = (page: Page) =>
  page.locator("[data-feed-id]").filter({ has: page.locator("h2") });

test.describe.serial("onboarding questionnaire", () => {
  test.beforeAll(async () => {
    conn = await connect();
    // Three tests visit the feed, the last one for three pages; each page costs this reader
    // twelve rows it can never be served again (support.ts's seedFeedCorpus).
    await seedFeedCorpus(conn, PREFIX, 240, TOPICS);
    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  async function goTo(page: Page, path: string) {
    await restoreSession(page, session);
    await page.goto(path);
  }

  test("a new user can skip every question and still start, from the starters", async ({
    page,
  }) => {
    await page.goto("/");
    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page
      .getByPlaceholder("What should we call you?")
      .fill("Onboarding E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("/onboarding");

    // Toward nothing at all: every question is skipped.
    await answerQuestionnaire(page, []);

    // The reveal still has something to say — an exhibition named from nothing, and the
    // starters, each at "some".
    const reveal = page.locator('[data-step="reveal"]');
    await expect(reveal.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      reveal.getByRole("heading", { level: 2, name: "Your mix" }),
    ).toBeVisible();
    await expect(reveal.locator("[data-topic]")).toHaveCount(3);
    for (const topic of ["astronomy", "botany", "architecture"]) {
      await expect(
        reveal
          .locator(`[data-topic="${topic}"]`)
          .getByRole("radio", { name: "some", checked: true }),
      ).toBeVisible();
    }

    await page.getByRole("button", { name: "Open my feed" }).click();
    await page.waitForURL("/feed");
    await expect(page.locator("[data-feed-id]").first()).toBeVisible({
      timeout: 15_000,
    });
    session = await saveSession(page);

    // Onboarded now: the questionnaire is not shown again uninvited.
    await page.goto("/onboarding");
    await page.waitForURL("/feed");
  });

  test("retaking the questions replaces the reader's topics", async ({
    page,
  }) => {
    await goTo(page, "/profile/topics");
    await expect(
      page.getByRole("group", { name: "Architecture level" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Retake the questions" }).click();
    await page.waitForURL("/onboarding?retake=1");
    // It says what finishing will do, before a single question, with a way out.
    await expect(
      page.getByText(/Your answers will replace the topics you have now/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();

    // This time toward rocks and an evening of music. The bank has had no path to the-ocean since
    // v2 (First Exhibition) — the Land, sea & sky wing spreads its point over too many topics for
    // one of them to reach the reveal — while geology + music reaches on both database shapes in
    // bank v3 (bank.test.ts pins that path through lib/interview/path.ts).
    await answerQuestionnaire(page, ["geology", "music"]);
    await expect(
      page.getByText(/This replaces your current topics/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open my feed" }).click();

    // A retake ends where it began, on the list it just rewrote.
    await page.waitForURL("/profile/topics", { timeout: 15_000 });
    await expect(page.locator('[data-topic="geology"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-topic="music"]')).toBeVisible();
    // Overwritten, not merged: a first-run starter no answer led back to is gone. (Astronomy may
    // remain — on a small database it is what tops the reveal back up to three.)
    await expect(page.locator('[data-topic="architecture"]')).toHaveCount(0);

    // And it sticks.
    await page.reload();
    await expect(page.locator('[data-topic="geology"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-topic="architecture"]')).toHaveCount(0);
  });

  test("Reading set to None gives a feed with no writing in it", async ({
    page,
  }) => {
    await goTo(page, "/profile/settings");
    const reading = page.getByRole("button", { name: /^Reading/ });
    await reading.click({ timeout: 15_000 });
    const saved = page.waitForResponse(
      (r) => r.url().includes("user.setReadingAmount") && r.status() === 200,
    );
    await page
      .getByRole("dialog", { name: "Reading" })
      .getByRole("radio", { name: "None" })
      .click();
    await saved;
    await expect(reading).toContainText("None");

    // A document load, so the first page is composed by the server at the new amount. A third
    // of this reader's corpus is articles; at the default share about one card in eight would
    // be writing, so three pages with none is the setting at work, not luck.
    await page.goto("/feed");
    const tiles = page.locator("[data-feed-id]");
    await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      expect(await tiles.count()).toBeGreaterThanOrEqual(30);
    }).toPass({ timeout: 30_000 });
    await expect(writingTiles(page)).toHaveCount(0);
  });

  test("the reveal names a first exhibition, and the profile shows it again", async ({
    page,
  }) => {
    await goTo(page, "/profile/topics");
    await page
      .getByRole("link", { name: "Retake the questions" })
      .click({ timeout: 15_000 });
    await page.waitForURL("/onboarding?retake=1");
    await answerQuestionnaire(page, ["astronomy", "botany", "music"]);

    // Above the levels: the exhibition's two-word title, the page's h1, and the temperament.
    const reveal = page.locator('[data-step="reveal"]');
    await expect(reveal.getByRole("heading", { level: 1 })).toHaveText(
      /\S+ \S+/,
    );
    await expect(
      reveal.getByRole("group", { name: "Temperament" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open my feed" }).click();

    // Stored with the run, and read back on the profile.
    await page.waitForURL("/profile/topics", { timeout: 15_000 });
    await expect(
      page.getByRole("region", { name: "Your first exhibition" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
