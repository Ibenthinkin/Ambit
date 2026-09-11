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
  // **Off for Playwright's dev server only.** Next's dev-tools indicator renders into a
  // `<nextjs-portal>` fixed to the bottom-left of the viewport. At the `chromium` project's
  // 402x874 phone viewport (playwright.config.ts) that lands squarely on the floating pill
  // toolbar, and Playwright refuses to click a control another element covers — five specs timed
  // out on it the day the suite went phone-shaped, none of them for a reason the app had
  // anything to do with. A production build has no indicator at all, which is why `e2e:prod` was
  // green throughout.
  //
  // Gated on the env var rather than switched off outright: this is a genuinely useful dev
  // affordance (build activity, static-vs-dynamic route), and an ordinary `bun run dev` keeps it.
  // Playwright's `webServer` sets E2E_HIDE_DEV_INDICATOR=1; nothing else does.
  ...(process.env.E2E_HIDE_DEV_INDICATOR === "1"
    ? { devIndicators: /** @type {const} */ (false) }
    : {}),
  // Next dev blocks its own /_next/* resources for any origin that isn't localhost, so a page
  // opened from a phone (`next dev`'s "Network:" line, or over the tailnet — and what the
  // 08-17-26 dead-buttons incident turned out to be) gets served HTML whose scripts can't
  // finish booting: React never hydrates and nothing on the page responds. Listing the origin
  // here is what makes on-device testing against the dev server work at all.
  //
  // The host list lives in src/config/dev-origins.js because Better Auth needs the same one for a
  // completely different check — see that file for why the two have to agree.
  allowedDevOrigins: DEV_ORIGIN_HOSTS,

  experimental: {
    // **Off, because on it puts `/feed` into a reload loop in Firefox (09-11-26).** Dev-only in
    // effect (Next reads it only under `next dev`), harmless in a production build.
    //
    // What the flag does: in dev, Next 16 sends React's Server Components debug info over the
    // HMR WebSocket ("the debug channel") instead of inside the RSC payload, and the client has
    // to decide at boot whether the document it is hydrating was served fresh or restored from
    // the browser's HTTP cache — a restored one has no live channel, so Next force-reloads it.
    // 16.2.12 makes that call from the navigation-timing entry's `transferSize === 0`
    // (`wasServedFromCache()` in `next/dist/client/dev/debug-channel.js`). Firefox leaves
    // `transferSize` and `encodedBodySize` at 0 until the response has *finished*; Chromium does
    // not trip the check in the same recipe. `/feed`'s response stays open for as long as `feed.page` takes,
    // because `app/feed/page.tsx` prefetches it un-awaited and the pending query streams in
    // after the shell — ~1.2 s in dev since the feed moved onto membership pools, and 1.5-9 s on
    // 09-08 when `getTopicPools` had stopped scaling. Next's client boots at ~400 ms. So in
    // Firefox every direct load of `/feed` reads as "served from cache", finds no stored channel
    // (the request id is minted fresh per render), and calls `location.reload()` before
    // hydration — forever, at ~600 ms a cycle, with not one tRPC call between loads. That is the
    // 33-`GET /feed` signature of 09-08 and 09-11. Reproduced 09-11-26 in a clean Playwright
    // Firefox profile with no service worker (16 navigations in 15 s); Chromium in the same
    // recipe hydrates once. A signed-in reader who reaches `/feed` by client navigation never
    // sees it, which is why it hid from every earlier attempt.
    //
    // Next 16.3.x rewrote the check (`wasServedFromCacheKnownAtExec`): a still-streaming
    // response is treated as undecided, and the size heuristic only applies to back/forward
    // navigations. **Upgrading past 16.3.5 is the durable fix; delete this key when that lands.**
    // What the flag costs while off: the debug info rides in the RSC payload instead, which is
    // how every Next before 16.2 shipped it. `next-config.test.ts` pins the value.
    reactDebugChannel: false,
  },

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
