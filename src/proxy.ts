// Next.js 16 renamed the request-interception layer from "Middleware" (middleware.ts, exporting
// `middleware()`) to "Proxy" (proxy.ts, exporting `proxy()`) — same matcher/config shape, clearer
// name for what it actually does (runs on every matched request, in front of routing/rendering).
// It runs on the Node.js runtime here, not Edge, since the app has no Edge dependency anywhere
// else.
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// This is an OPTIMISTIC check only: `getSessionCookie` looks at whether a session cookie exists
// and is well-formed, not whether it's still valid (not expired, not revoked). It cannot make a
// database call — proxies run before most of the request pipeline and need to stay fast. Its job
// is purely UX: bounce an obviously-signed-out visitor away from authed routes before they even
// render, so they don't see a flash of protected UI. The *real* check — did the session actually
// verify against the DB — happens per-request wherever it matters: server components/pages call
// `auth.api.getSession({ headers })`, and tRPC's `protectedProcedure` does the same. Both land in
// Phases 4–5; nothing downstream of this file may treat "cookie present" as "user authenticated".
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/feed/:path*", "/saved/:path*", "/onboarding/:path*"],
};
