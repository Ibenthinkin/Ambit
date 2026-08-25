import { expect, type Page } from "@playwright/test";

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
