// Next.js 16 renamed the request-interception layer from "Middleware" (middleware.ts, exporting
// `middleware()`) to "Proxy" (proxy.ts, exporting `proxy()`) — same matcher/config shape, clearer
// name for what it actually does (runs on every matched request, in front of routing/rendering).
// It runs on the Node.js runtime here, not Edge, since the app has no Edge dependency anywhere
// else.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { buildCsp } from "~/config/security-headers";

// **This file now does two unrelated jobs, and the matcher belongs to the second one.**
//
// 1. *The optimistic auth bounce* (since Phase 4). `getSessionCookie` looks at whether a session
//    cookie exists and is well-formed, not whether it's still valid (not expired, not revoked). It
//    cannot make a database call — proxies run before most of the request pipeline and need to
//    stay fast. Its job is purely UX: bounce an obviously-signed-out visitor away from authed
//    routes before they even render, so they don't see a flash of protected UI. The *real* check —
//    did the session actually verify against the DB — happens per-request wherever it matters:
//    server components/pages call `auth.api.getSession({ headers })`, and tRPC's
//    `protectedProcedure` does the same. Nothing downstream of this file may treat "cookie
//    present" as "user authenticated".
//
// 2. *Minting the CSP nonce* (Phase 7.2). A Content-Security-Policy with a per-request nonce can
//    only be built somewhere that has a request, which `next.config.js`'s `headers()` does not —
//    so the policy is set here and everything static is set there. This is Next's documented
//    mechanism: set `x-nonce` on the **request** headers passed to `NextResponse.next()` and Next
//    stamps that nonce onto its own inline scripts; set `Content-Security-Policy` on the request
//    *and* the response, because Next reads the request copy when rendering and the browser reads
//    the response copy.
//
// Job 2 needs to run on every HTML and API route, which is why the matcher below is now an
// exclusion list rather than the five authed prefixes it used to be. Job 1 therefore can no longer
// rely on the matcher to scope itself, and says which paths it guards explicitly (AUTHED_PREFIXES).

/**
 * The routes that require a session. Previously this list *was* the matcher; now the matcher is
 * wide (for the CSP) and the redirect is scoped here instead. `/profile` covers `/profile/edit`
 * the same way the old `/profile/:path*` pattern did.
 */
const AUTHED_PREFIXES = [
  "/feed",
  "/saved",
  "/onboarding",
  "/profile",
  "/settings",
];

/** True for `/feed` and `/feed/anything`, false for `/feedback`. */
function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function proxy(request: NextRequest) {
  // A fresh nonce per request — the whole point being that an injected inline script can't guess
  // it. `randomUUID()` is a CSPRNG; base64 is just the shape a CSP nonce is conventionally in.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
  });

  // The headers the *rendering* pipeline will see. `x-nonce` is what Next reads to nonce its own
  // inline bootstrap scripts, and what `app/layout.tsx` reads for the pre-paint accent script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;

  if (isAuthedPath(pathname) && !getSessionCookie(request)) {
    // A redirect renders nothing, so it needs no nonce — but it still carries the policy, because
    // a response without one is a response an injection could live in.
    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except the paths that are served as static bytes and never contain a script the
  // policy could protect — running the proxy on them would cost a nonce mint per asset for nothing:
  //
  //   _next/static      — the build's own JS/CSS chunks (hashed, immutable)
  //   _next/image       — Next's image optimizer (unused today, excluded for completeness)
  //   favicon.ico,      — icons served straight out of `public/`
  //   icon-, apple-icon
  //   landing/          — the landing slideshow's JPEGs, also `public/`
  //   manifest.webmanifest — the PWA manifest, a static JSON document
  //   serwist/          — the compiled service worker; it is a *classic worker script*, not an
  //                       inline one, and giving it a CSP of its own here helps nothing
  //
  // Note this list is about the *CSP*: the four static headers from next.config.js still apply to
  // every one of these paths, because `headers()` matches `/(.*)`.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|landing/|manifest.webmanifest|serwist/).*)",
  ],
};
