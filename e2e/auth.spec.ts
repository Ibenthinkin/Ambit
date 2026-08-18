import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { signIn, waitForHydration } from "./support";

// The full email + password loop against a REAL dev server + Postgres + Mailpit (SPEC §12 names
// these exact flows). Local-only, like e2e/home.spec.ts's own comment explains — CI has no
// Postgres until Phase 7.1 adds it to the workflow. Uses a fresh `ambit-e2e-${Date.now()}@...`
// address per run and shells out to the real `bun run invite` admin path (execFileSync), same as
// docs/PHASE2_WALKTHROUGH_2.2.md's manual curl-driven verification, just automated — this
// **leaves a real user row in the dev DB by design** (the timestamped email means reruns never
// collide with a previous run's leftover user).
//
// Split into several serial tests (sharing one signed-up user via `test.describe.serial`) rather
// than one giant end-to-end test, per PHASE5_PLAN_5.2.md's own risk note: the Mailpit-scraping
// step is the most likely thing to be flaky, so the reset-request and reset-completion halves get
// separate assertions instead of one long chain that fails opaquely partway through.
const EMAIL = `ambit-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";
const NEW_PASSWORD = "correcthorse456";

// Polls Mailpit's HTTP API (http://localhost:8025) for the most recent message to `email` and
// pulls the reset link out of its plaintext body — the same call
// docs/PHASE2_WALKTHROUGH_2.2.md documents doing by hand with curl. Mailpit catches mail
// effectively instantly (it's a local fake SMTP server, not a real delivery hop), but a short
// poll loop is cheap insurance against a slow tick.
async function fetchResetLink(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const listRes = await fetch(
      "http://localhost:8025/api/v1/messages?limit=25",
    );
    const { messages } = (await listRes.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const match = messages.find((m) => m.To.some((to) => to.Address === email));
    if (match) {
      const msgRes = await fetch(
        `http://localhost:8025/api/v1/message/${match.ID}`,
      );
      const { Text } = (await msgRes.json()) as { Text: string };
      const found = /https?:\/\/\S+/.exec(Text);
      if (found) return found[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No reset email arrived for ${email} within 15s.`);
}

test.describe.serial("auth", () => {
  test("uninvited sign-up is refused with the invite-only message", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("E2E Tester");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByTestId("auth-error")).toContainText("invite-only");
  });

  test("invited sign-up succeeds, completes onboarding, and lands on the real feed", async ({
    page,
  }) => {
    // execFileSync (argument array, no shell) rather than execSync's shell-interpolated string —
    // EMAIL is generated internally here, not user input, but there's no reason to route through
    // a shell for a fixed two-argument command.
    execFileSync("bun", ["run", "invite", EMAIL], { stdio: "pipe" });

    await page.goto("/");
    await waitForHydration(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page.getByPlaceholder("What should we call you?").fill("E2E Tester");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // A fresh sign-up has no topic picks yet, so /feed's guard bounces here first
    // (PHASE5_PLAN_5.3.md Decision 5) — not the feed placeholder directly.
    await page.waitForURL("/onboarding");

    // Three stable labels, not positional `.nth()` picks, so a future reorder of `TOPICS`
    // doesn't quietly change what this test selects. `pressed: false` both disambiguates from
    // any other "Astronomy"-adjacent text on the page and asserts the pre-click state.
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();

    await page.waitForURL("/feed");
    // 5.6 replaced the "Signed in as …" placeholder with the real masonry, so the end of the
    // sign-up journey is now provable the way a user would judge it: there are tiles on screen.
    // A freshly onboarded user gets a full page of them from the dev corpus.
    await expect(page.locator("[data-feed-id]").first()).toBeVisible();
  });

  test("sign out returns to the landing page, and /feed bounces an unauthenticated visitor", async ({
    page,
  }) => {
    await page.goto("/feed");
    // A stale session from the previous test's cookie jar isn't guaranteed by Playwright's
    // per-test isolation, so sign in fresh here rather than assuming one carried over.
    if (page.url().endsWith("/")) {
      await signIn(page, EMAIL, PASSWORD);
    }

    // Sign-out moved to /dev/tokens in 5.6, when /feed's placeholder was deleted — the design has
    // no sign-out affordance on any real screen until Settings lands in 5.10.
    await page.goto("/dev/tokens");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/");

    await page.goto("/feed");
    await page.waitForURL("/");
  });

  test("a wrong password shows the mapped error", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password").fill("totallywrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("auth-error")).toContainText(
      "That email and password don't match.",
    );
  });

  test("forgot password sends a reset email", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Forgot your password?" }).click();
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText("Check your inbox")).toBeVisible();
    await expect(page.getByText(EMAIL)).toBeVisible();
  });

  test("the reset link completes the round trip and the new password works", async ({
    page,
  }) => {
    const resetLink = await fetchResetLink(EMAIL);

    await page.goto(resetLink);
    await page.waitForURL(/\/reset-password\?token=/);
    await waitForHydration(page);
    await page
      .getByPlaceholder("New password (8+ characters)")
      .fill(NEW_PASSWORD);
    await page.getByPlaceholder("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(page.getByText("Password updated.")).toBeVisible();

    // resetPassword doesn't sign the user in (PHASE5_PLAN_5.2.md's docs finding) — the old
    // password must now be rejected and the new one must work, the actual proof the reset took
    // effect rather than just that the endpoint returned success.
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL("/");
    await waitForHydration(page);
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("auth-error")).toContainText(
      "That email and password don't match.",
    );

    await page.getByPlaceholder("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/feed");
  });
});
