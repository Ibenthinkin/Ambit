// The proxy does two jobs (see its header) and this file asserts both, without a server: build a
// real `NextRequest`, call `proxy()`, read the response.
//
// **Why the `x-middleware-request-*` header is what we assert on.** `NextResponse.next({ request:
// { headers } })` does not mutate the incoming request object — it encodes the overrides onto the
// *response* as `x-middleware-request-<name>` headers, which Next unpacks internally before
// rendering. That encoding is how the nonce reaches `app/layout.tsx`, so reading it back is the
// closest a unit test can get to proving the handoff works. If a future Next version changes the
// encoding, this assertion is the thing that will notice — and the response-header assertions
// below still hold on their own.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "~/proxy";

/** A request for `path`, optionally carrying a Better Auth session cookie. */
function request(path: string, { signedIn = false } = {}) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  if (signedIn) {
    // `getSessionCookie` is a presence-and-shape check, not a validity check (that is the whole
    // point of the optimistic bounce), so any non-empty value stands in for a real session here.
    req.cookies.set("better-auth.session_token", "not-a-real-token.signature");
  }
  return req;
}

const NONCE_PATTERN = /'nonce-([A-Za-z0-9+/=]+)'/;

describe("the CSP nonce", () => {
  it("is on every response, in the policy and in the forwarded request headers", () => {
    for (const path of ["/", "/i/some-item", "/api/trpc/items.byId"]) {
      const res = proxy(request(path));

      const csp = res.headers.get("content-security-policy");
      expect(csp, `no CSP on ${path}`).toBeTruthy();

      const nonce = NONCE_PATTERN.exec(csp!)?.[1];
      expect(nonce, `no nonce in the CSP for ${path}`).toBeTruthy();

      // The same nonce that is in the policy is the one the renderer will see.
      expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    }
  });

  it("is different for every request", () => {
    const first = NONCE_PATTERN.exec(
      proxy(request("/")).headers.get("content-security-policy")!,
    )?.[1];
    const second = NONCE_PATTERN.exec(
      proxy(request("/")).headers.get("content-security-policy")!,
    )?.[1];

    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("carries the locked-down directives, not just the nonce", () => {
    const csp = proxy(request("/")).headers.get("content-security-policy")!;

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("'strict-dynamic'");
  });
});

describe("the optimistic auth bounce", () => {
  // The matcher is wide now (it has to be, for the CSP), so the redirect scopes itself — these are
  // the assertions that keep a public page from becoming accidentally private.
  it("redirects an authed path with no session cookie", () => {
    for (const path of [
      "/feed",
      "/feed/anything",
      "/saved",
      "/onboarding",
      "/profile",
      "/profile/edit",
      "/settings",
    ]) {
      const res = proxy(request(path));
      expect(res.status, `${path} should redirect`).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
      // Even a redirect carries the policy.
      expect(res.headers.get("content-security-policy")).toContain(
        "frame-ancestors 'none'",
      );
    }
  });

  it("lets an authed path through when a session cookie is present", () => {
    const res = proxy(request("/feed", { signedIn: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("never redirects a public path", () => {
    for (const path of [
      "/",
      "/i/some-item",
      "/g/some-item",
      "/reset-password",
      "/api/img/some-item",
      "/api/trpc/items.byId",
      // A path that merely *starts with* an authed prefix's letters is not an authed path.
      "/feedback",
    ]) {
      const res = proxy(request(path));
      expect(res.status, `${path} should not redirect`).toBe(200);
    }
  });
});
