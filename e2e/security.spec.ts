import { expect, test, type Cookie, type Page } from "@playwright/test";

import {
  cleanupSeeded,
  connect,
  inviteUser,
  openAuthSheet,
  restoreSession,
  saveSession,
  seedFeedCorpus,
  waitForHydration,
  type Connection,
} from "./support";

// **SPEC §11's header checklist, asserted against the running app** (Phase 7.2, T4).
//
// `security-headers.test.ts` proves the *values* are built correctly; this file proves they
// actually reach a browser on every kind of route the app serves — public and authed, HTML and
// API — and, just as important, that the Content-Security-Policy those headers carry doesn't
// break anything. A policy nobody violates is only worth having if the page still works under it,
// so every navigation below collects two things:
//
//   * `securitypolicyviolation` events, which fire in the page for every directive the browser
//     actually enforced against something. This is the assertion that would catch a script, style,
//     font or image the policy forgot about.
//   * console errors, with the same image-load exclusion `feed.spec.ts` uses — a CSP violation
//     logs one of these too, so the two collectors back each other up.
//
// **Under `next dev` as well as the production build.** The dev CSP is deliberately looser
// (`'unsafe-eval'` and `ws:` for Turbopack's HMR — see `security-headers.js`), so the nonce
// assertions here are written to hold under both.
const EMAIL = `ambit-security-e2e-${Date.now()}@example.com`;
const PASSWORD = "correcthorse123";
const PREFIX = "ambit-security-e2e-";
const TOPICS = ["astronomy", "botany", "music"] as const;

// Three feed loads in this file (the sign-up landing, `/feed`, and `/saved`'s empty state), each
// costing this reader up to a page of 12 it can never be served again — plus headroom. See
// support.ts's seedFeedCorpus() for why CI's empty database makes the sizing matter.
const SEED_COUNT = 60;

/** A same-origin image so `/api/img/[itemId]` has a real 200 to answer with — see pwa.prod.spec.ts. */
const IMAGE_URL = "http://localhost:3000/icon-192.png";

let conn: Connection;
let session: Cookie[] = [];
/** The seeded item `/i/[itemId]` and `/api/img/[itemId]` are exercised against. */
let publicItemId = "";

/** What a page collected while it loaded: CSP violations and console errors. */
interface PageProblems {
  violations: string[];
  consoleErrors: string[];
}

/**
 * Arms both collectors on a fresh page, before any navigation.
 *
 * `addInitScript` runs before the document's own scripts on every navigation in this page, which
 * is the only place a violation listener can be installed early enough to see the ones a policy
 * raises during initial parse.
 */
async function watchForProblems(page: Page): Promise<PageProblems> {
  const problems: PageProblems = { violations: [], consoleErrors: [] };

  await page.exposeFunction("__ambitReportViolation", (detail: string) => {
    problems.violations.push(detail);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      // `blockedURI` is "inline" for an inline script/style, or the URL otherwise — between it and
      // the directive, a failure message says exactly what to widen (or, more often, what not to).
      (
        window as unknown as {
          __ambitReportViolation: (detail: string) => void;
        }
      ).__ambitReportViolation(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });

  page.on("console", (msg) => {
    // Same exclusion as feed.spec.ts: image bytes come from a museum CDN at the far end, and a box
    // with no outbound network gets a failed load rather than a picture. That is designed for
    // (the tile says "Image unavailable"); everything else still fails the test.
    const text = msg.text();
    const isImageLoad =
      text.includes("Failed to load resource") ||
      text.includes("ERR_NAME_NOT_RESOLVED");
    if (msg.type() === "error" && !isImageLoad)
      problems.consoleErrors.push(text);
  });

  return problems;
}

/** Every header assertion, in one place, for a response from any route. */
function expectSecurityHeaders(
  headers: Record<string, string>,
  where: string,
): void {
  const csp = headers["content-security-policy"];
  expect(csp, `no CSP on ${where}`).toBeTruthy();
  // The nonce and 'strict-dynamic' are decision D1: an inline script runs only if it carries this
  // request's nonce. If this ever has to be relaxed, D2 in the plan says exactly how — and this
  // assertion is what would have to change with it.
  expect(csp, where).toContain("'strict-dynamic'");
  expect(csp, where).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp, where).toContain("frame-ancestors 'none'");
  expect(csp, where).toContain("object-src 'none'");

  expect(headers["x-content-type-options"], where).toBe("nosniff");
  expect(headers["x-frame-options"], where).toBe("DENY");
  expect(headers["referrer-policy"], where).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(headers["permissions-policy"], where).toContain("camera=()");

  // **Deliberately asserting an absence.** HSTS is gated on the app being served over TLS
  // (decision D5), and both the dev server and the production build under test here are plain
  // http. A header that showed up anyway would mean the gate reads `NODE_ENV` — the exact mistake
  // D5 exists to prevent.
  expect(headers["strict-transport-security"], where).toBeUndefined();
}

test.describe.serial("security headers", () => {
  test.beforeAll(async () => {
    conn = await connect();
    await seedFeedCorpus(conn, PREFIX, SEED_COUNT, TOPICS);

    // One extra row with a same-origin http image, so `/api/img/[itemId]` can be exercised for
    // real (the corpus above uses a `data:` pixel, which the tile renders directly and the proxy
    // never sees).
    const [row] = await conn.db
      .insert(conn.item)
      .values({
        source: "e2e",
        sourceId: `${PREFIX}proxied`,
        type: "image" as const,
        title: "Security fixture with a proxied image",
        summary: "A caption long enough to occupy a couple of lines.",
        imageUrl: IMAGE_URL,
        sourceUrl: "https://example.test/security/proxied",
        topicId: TOPICS[0],
        curationScore: 9,
      })
      .returning({ id: conn.item.id });
    publicItemId = row!.id;

    inviteUser(EMAIL);
  });

  test.afterAll(async () => {
    await cleanupSeeded(conn, PREFIX);
  });

  test("a new user signs up, and the landing page is clean under the policy", async ({
    page,
  }) => {
    const problems = await watchForProblems(page);

    const res = await page.goto("/");
    expectSecurityHeaders(res!.headers(), "/");
    await waitForHydration(page);
    expect(problems.violations, "CSP violations on /").toEqual([]);
    expect(problems.consoleErrors, "console errors on /").toEqual([]);

    await openAuthSheet(page);
    await page
      .getByRole("button", { name: "First time? Create your account" })
      .click();
    await page
      .getByPlaceholder("What should we call you?")
      .fill("Security E2E");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password (8+ characters)").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.waitForURL("/onboarding");
    for (const label of ["Astronomy", "Botany", "Music"]) {
      await page.getByRole("button", { name: label, pressed: false }).click();
    }
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.waitForURL("/feed");

    session = await saveSession(page);

    // Onboarding and the feed navigation that followed are covered by the same two collectors.
    expect(problems.violations, "CSP violations through sign-up").toEqual([]);
  });

  test("the public item page carries the headers and violates nothing", async ({
    page,
  }) => {
    const problems = await watchForProblems(page);

    const res = await page.goto(`/i/${publicItemId}`);
    expectSecurityHeaders(res!.headers(), "/i/[itemId]");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(problems.violations, "CSP violations on /i/[itemId]").toEqual([]);
    expect(problems.consoleErrors, "console errors on /i/[itemId]").toEqual([]);
  });

  test("the authed screens carry the headers and violate nothing", async ({
    page,
  }) => {
    const problems = await watchForProblems(page);
    await restoreSession(page, session);

    for (const path of ["/feed", "/settings", "/saved"]) {
      const res = await page.goto(path);
      expectSecurityHeaders(res!.headers(), path);
      // Every one of these screens has interactive controls; waiting for hydration is what makes
      // "no violations" mean the *client* ran too, not just that the HTML arrived.
      await waitForHydration(page, "main");
      expect(problems.violations, `CSP violations on ${path}`).toEqual([]);
      expect(problems.consoleErrors, `console errors on ${path}`).toEqual([]);
    }
  });

  // Not every response is a document. `nosniff` matters most on the two that stream bytes and JSON
  // — a mislabelled image and a JSON payload a browser might otherwise try to render.
  test("the API routes carry nosniff too", async ({ request }) => {
    const image = await request.get(`/api/img/${publicItemId}`);
    expect(image.status(), "the proxied image should be served").toBe(200);
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");

    // tRPC's GET shape: `input` is a superjson-encoded JSON object, URL-encoded.
    const input = encodeURIComponent(
      JSON.stringify({ json: { id: publicItemId } }),
    );
    const trpc = await request.get(`/api/trpc/items.byId?input=${input}`);
    expect(trpc.status(), "items.byId is the public surface").toBe(200);
    expect(trpc.headers()["x-content-type-options"]).toBe("nosniff");

    // The readiness probe (8.1, D10) is public, unauthenticated JSON and answers through the
    // Cloudflare Tunnel, so it is in the sweep for the same reason the other two are.
    const health = await request.get("/api/health");
    expect(health.status(), "the health probe should be ready").toBe(200);
    expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
