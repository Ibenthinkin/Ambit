// SPEC §11's header checklist, made executable (Phase 7.2, T2). The module under test is pure —
// no Next, no request, no I/O — so these are exact-string assertions about the policy this app
// ships, and they fail the moment somebody widens a directive without meaning to.
import { describe, expect, it } from "vitest";

import { buildCsp, staticSecurityHeaders } from "~/config/security-headers";

/** The header list as a plain object, which is easier to assert against than an array of pairs. */
function asMap(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("staticSecurityHeaders", () => {
  it("sends the four always-on headers", () => {
    const headers = asMap(staticSecurityHeaders({ https: false }));

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
  });

  // Decision D5: HSTS is a promise about TLS, so it is gated on the app actually being served over
  // TLS — never on NODE_ENV. CI runs a production build over plain http, and `e2e/security.spec.ts`
  // asserts the *absence* of the header there for exactly this reason.
  it("adds HSTS only over https", () => {
    expect(asMap(staticSecurityHeaders({ https: false }))).not.toHaveProperty(
      "Strict-Transport-Security",
    );
    expect(asMap(staticSecurityHeaders({ https: true }))).toHaveProperty(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  });

  // Web Share, the clipboard and notifications are features here (share-sheet.tsx,
  // use-notification-permission.ts). A well-meaning "lock everything down" edit to the
  // Permissions-Policy would break Save-image on a phone without breaking a single other test.
  it("never restricts the features the app actually uses", () => {
    const policy = asMap(staticSecurityHeaders({ https: true }))[
      "Permissions-Policy"
    ]!;

    for (const feature of ["clipboard-write", "web-share", "notifications"]) {
      expect(policy).not.toContain(feature);
    }
  });
});

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "TEST-NONCE", dev: false });

  it("carries this request's nonce and 'strict-dynamic'", () => {
    expect(csp).toContain("'nonce-TEST-NONCE'");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("locks down the directives that have no legitimate use here", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows exactly the image sources the app loads from", () => {
    expect(csp).toContain("img-src 'self' data: blob:");
  });

  // The dev loosenings are Turbopack's, and a production build must never inherit them: HMR
  // evaluates code off a socket, a real page never does.
  it("loosens script-src and connect-src only in dev", () => {
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("ws:");

    const devCsp = buildCsp({ nonce: "TEST-NONCE", dev: true });
    expect(devCsp).toContain("'unsafe-eval'");
    expect(devCsp).toContain("connect-src 'self' ws: wss:");
  });

  // Inline *styles* are permitted by design (D1) — but inline *scripts* are the whole point of the
  // policy, so the blanket allowance must not be there.
  it("permits inline styles but not blanket inline scripts", () => {
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain(
      "script-src 'self' 'nonce-TEST-NONCE' 'strict-dynamic'",
    );
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  // Every byte this app loads comes from its own origin (images included — they are proxied). If a
  // third-party host ever needs allowing, that is a decision worth making deliberately, and this
  // assertion is what forces the conversation.
  it("names no third-party origin", () => {
    expect(csp).not.toContain("http");
  });
});
