// Next.js reads this file at boot to configure the framework itself — bundler options, image
// domains, redirects, headers, etc. (Everything here runs in Node before any request is served;
// it is not part of the app bundle.) Importing env.js at the top means an invalid/missing env var
// fails the build immediately instead of surfacing as a confusing runtime crash later.

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { env } from "./src/env.js";
import { DEV_ORIGIN_HOSTS } from "./src/config/dev-origins.js";
import { staticSecurityHeaders } from "./src/config/security-headers.js";

import { withSerwist } from "@serwist/turbopack";

/** @type {import("next").NextConfig} */
const config = {
  // Better Auth ships some Node-only internals (crypto, its own DB adapters) that Next's default
  // bundling tries to trace into the client/edge graph and trips over under `--bun` — this tells
  // Next to leave the package as a real Node `require()` at runtime instead of bundling it.
  serverExternalPackages: ["better-auth"],
  // Next dev blocks its own /_next/* resources for any origin that isn't localhost, so a page
  // opened from a phone (`next dev`'s "Network:" line, or over the tailnet — and what the
  // 08-17-26 dead-buttons incident turned out to be) gets served HTML whose scripts can't
  // finish booting: React never hydrates and nothing on the page responds. Listing the origin
  // here is what makes on-device testing against the dev server work at all.
  //
  // The host list lives in src/config/dev-origins.js because Better Auth needs the same one for a
  // completely different check — see that file for why the two have to agree.
  allowedDevOrigins: DEV_ORIGIN_HOSTS,

  /**
   * The security headers every response carries (SPEC §11, Phase 7.2). The values live in
   * `src/config/security-headers.js` so that this file and `src/proxy.ts` cannot drift apart, and
   * so Vitest can assert them without booting a server.
   *
   * **The Content-Security-Policy is deliberately not here.** It carries a nonce that has to be
   * minted per request, and `headers()` runs once at boot with no request in hand — so the CSP is
   * set in `src/proxy.ts` instead. Everything static is set here, where it costs nothing and
   * covers routes the proxy's matcher excludes (static assets included).
   *
   * HSTS is gated on the app actually being served over TLS, read off `BETTER_AUTH_URL`'s scheme
   * (decision D5) — not on `NODE_ENV`, because CI runs a production build over plain http.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticSecurityHeaders({
          https: env.BETTER_AUTH_URL.startsWith("https://"),
        }),
      },
    ];
  },
};

// `@serwist/turbopack` (not the older `@serwist/next`) is the PWA/service-worker integration:
// it compiles the service worker as a Next.js Route Handler (src/app/serwist/sw.js/route.ts)
// instead of a webpack build step, so it works identically under Turbopack in both `next dev`
// and `next build` — this project has no webpack fallback anywhere else, so that match matters.
export default withSerwist(config);
