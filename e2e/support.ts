import { execFileSync } from "node:child_process";

import { expect, type Page } from "@playwright/test";
import { inArray, like } from "drizzle-orm";

/**
 * Blocks until React has hydrated the landing page's form.
 *
 * **Why every landing-page test needs this.** The auth card is a real `<form onSubmit={…}>` with a
 * `type="submit"` button (`auth-card.tsx`), and its secondary controls are `type="button"` with
 * `onClick` handlers. Interact with any of that before React attaches and you get the pre-hydration
 * behavior instead: the submit button submits the form *natively* — a GET to `/?` that reloads the
 * page and discards the typed values — and the plain buttons do nothing at all. The test then waits
 * out its timeout on a page that never went anywhere. It reads as a flaky app and isn't one; the
 * give-away in a failing trace is `navigated to "http://localhost:3000/?"`.
 *
 * This surfaced in 5.6 only because that phase's `feed.spec.ts` gave the suite enough parallel load
 * to lose the race regularly. The underlying behavior — a form that silently discards a submit made
 * before hydration — is a real, if minor, landing-page defect; it belongs to the auth screens, so
 * 5.6 records it rather than changing it (docs/PHASE5_WALKTHROUGH_5.6.md).
 *
 * The signal is React DOM's own bookkeeping: it stamps `__reactFiber$…` / `__reactProps$…` keys
 * onto each host node as it hydrates it. Nothing else in the page reports "the handlers are live"
 * as directly, and a fixed `waitForTimeout` would be both slower and still a guess.
 */
export async function waitForHydration(page: Page, selector = "form") {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return (
      !!el &&
      Object.keys(el).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
      )
    );
  }, selector);
}

/**
 * Raises the landing page's sign-in sheet and waits until its fields can actually be typed into.
 *
 * **Why every landing test now needs this.** Phase 5.11 put the auth form inside a sheet that
 * spends the first ~5 seconds of a visit translated off the bottom of the screen while the
 * slideshow runs. The fields are in the DOM the whole time — `waitForHydration` still works, and
 * has to keep working — but they are outside the viewport, so Playwright's actionability checks
 * would sit and wait on them. The glyph is the reader's own way to skip ahead; tests take the same
 * path rather than waiting the slideshow out on every single test.
 */
export async function openAuthSheet(page: Page) {
  await waitForHydration(page);
  const glyph = page.getByRole("button", { name: "Open sign-in" });
  // The sheet may already be up — a slow machine can let the slideshow finish first, and this is
  // safe to call twice. Once the sheet rises the glyph unmounts, so its absence is the signal.
  if (await glyph.isVisible()) await glyph.click();
  await expect(page.getByPlaceholder("you@example.com")).toBeInViewport({
    timeout: 15_000,
  });
}

/** Signs an existing user in through the landing page and waits for the feed to render. */
export async function signIn(page: Page, email: string, password: string) {
  await openAuthSheet(page);
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/feed");
  await expect(page).toHaveURL(/\/feed/);
}

/** A 1×1 transparent GIF. Inline, so a tile's happy path never depends on a network hop — and,
 *  because `image-tile.tsx` renders `data:` URLs directly, never on the image proxy either. */
export const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The DB handle every DB-touching spec loads in `beforeAll`.
 *
 * **Why the `.env` load is optional.** Playwright runs under plain Node, which — unlike Bun — does
 * not read `.env` on its own, and `~/server/db/client` pulls in `~/env`, whose Zod validation
 * throws at *import* time without `DATABASE_URL`. Locally the file supplies it. In CI there is no
 * `.env` at all: the workflow puts the same variables straight into the job's environment, which
 * `~/env` reads identically — so a missing file is simply not an error there. (`vitest.config.ts`
 * makes the same accommodation for the same reason.) `process.loadEnvFile` throws on a missing
 * file, hence the try/catch; if the variables are absent *both* ways, `~/env`'s own message says so.
 *
 * **Why the imports are dynamic.** A static import would be hoisted above the env load.
 */
export async function connect() {
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url));
  } catch {
    // No .env (CI) — the job environment must already carry DATABASE_URL and the auth vars.
  }
  const [{ db }, schema] = await Promise.all([
    import("../src/server/db/client"),
    import("../src/server/db/schema"),
  ]);
  return { db, ...schema };
}

export type Connection = Awaited<ReturnType<typeof connect>>;

/**
 * Grants `email` an invite through the real admin path (`scripts/invite.ts`), exactly as
 * docs/PHASE2_WALKTHROUGH_2.2.md did by hand. `execFileSync` with an argument array, no shell:
 * the address is generated, not user input, but there's no reason to route it through one.
 * Requires `bun` on PATH — true locally and under `oven-sh/setup-bun` in CI.
 */
export function inviteUser(email: string): void {
  execFileSync("bun", ["run", "invite", email], { stdio: "pipe" });
}

/**
 * Deletes every seeded item whose `sourceId` starts with `prefix`, children first (`seen_item`
 * and `saved_item` both reference `item`).
 *
 * **Scoped to a prefix, never to `source: "e2e"`.** Every spec seeds under that same source, and
 * `fullyParallel` runs the spec files in separate workers — so a cleanup that deleted the whole
 * source would pull another spec's fixtures out from under it mid-run. That is exactly what
 * happened when 5.8 added a third such spec: the feed came back empty and an item page 404'd, in
 * two different files, for no reason visible in either. Callers pass their own prefix
 * (`"e2e-feed-"`, `"e2e-item-"`, …) and nothing else.
 */
export async function cleanupSeeded(
  conn: Connection,
  prefix: string,
): Promise<void> {
  const { db, item, seenItem, savedItem } = conn;
  const seeded = await db
    .select({ id: item.id })
    .from(item)
    .where(like(item.sourceId, `${prefix}%`));
  const ids = seeded.map((row) => row.id);
  if (ids.length === 0) return;
  await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
  await db.delete(savedItem).where(inArray(savedItem.itemId, ids));
  await db.delete(item).where(inArray(item.id, ids));
}
