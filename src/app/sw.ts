/// <reference lib="esnext" />
/// <reference lib="webworker" />

// This file is NOT part of the app's normal React/Node code — it's compiled separately (by the
// route handler in src/app/serwist/sw.js/route.ts) into a script the *browser* runs in its own
// background thread, outside any page, even outside any tab. That's what "service worker" means:
// once registered (see the <SerwistProvider> in src/app/layout.tsx), the browser keeps it running
// between visits and can wake it up to handle network requests before they even reach the
// network — which is how offline support and instant-repeat-load caching both work. The two
// triple-slash directives above tell TypeScript to load the WebWorker ambient types (`self`,
// `caches`, `fetch` events, etc.) for *this file only*, instead of the DOM types (`window`,
// `document`) every other file in the app uses — a page and a service worker run in genuinely
// different JS environments, so they get different global type declarations.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import {
  IMAGES_CACHE,
  isAuthApi,
  isFeedDocument,
  isImageProxy,
  isNextStatic,
  isStaticAsset,
  isTrpc,
  NEXT_STATIC_CACHE,
  PAGES_CACHE,
  STATIC_CACHE,
} from "~/lib/sw-rules";

/** Seconds in a day — the expiration plugin counts in seconds, which reads badly inline. */
const DAY = 24 * 60 * 60;

// `__SW_MANIFEST` doesn't exist yet at the time you're reading this source — the build step
// (createSerwistRoute, in the route handler) generates it: a list of every static asset Next
// produced (JS chunks, CSS) paired with a content hash, then rewrites this exact identifier in
// the compiled output to that literal array. This `declare global` block is purely so
// TypeScript knows the shape of the value that will be there at runtime; it adds no code.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  // Precaching = downloading these files into a Cache Storage bucket the moment the service
  // worker installs, before the user ever requests them — so the very first load after a repeat
  // visit can be served from disk instead of the network.
  precacheEntries: self.__SW_MANIFEST,
  // A new service worker version normally waits for every open tab of the old version to close
  // before taking over (so nobody hits a mismatched mix of old page + new worker mid-session).
  // `skipWaiting` + `clientsClaim` opt out of that caution and activate immediately — reasonable
  // here since Ambit has no multi-tab state that a version skew would corrupt.
  skipWaiting: true,
  clientsClaim: true,
  // Lets the browser start a navigation's network request in parallel with waking the service
  // worker, instead of waiting for the worker to boot first — shaves latency off every page load
  // once the SW is installed.
  navigationPreload: true,
  // **Hand-written, and first match wins.** Phase 1 used Serwist's `defaultCache`; 5.11 replaced
  // it because that default routed every same-origin `/api/*` except auth through `NetworkFirst`
  // into one shared 16-entry bucket — which meant the personalized feed was being cached, and was
  // evicting the image proxy while it did. The predicates live in `~/lib/sw-rules` so they can be
  // unit-tested outside a worker; the invariant "no tRPC request reaches a caching rule" is
  // asserted there directly.
  //
  // Anything no rule matches is served from the network and never stored. That is the deliberate
  // default: RSC payload fetches, item pages, and everything not listed here are better
  // slow-and-correct than fast-and-stale.
  //
  // It is spelled as an explicit trailing `NetworkOnly` rather than by omission, and that
  // distinction is load-bearing: a request no rule matches never enters Serwist's routing at all,
  // and `fallbacks` (below) only applies to requests Serwist itself handled. Leaving the list
  // unterminated therefore doesn't just skip caching — it silently disables the offline page for
  // every route except `/feed`, which a browser then answers with its own connection error.
  // Verified the hard way against a production build during 5.11.
  runtimeCaching: [
    { matcher: isAuthApi, handler: new NetworkOnly() },
    // Never stored. Every tRPC response is per-reader, and a feed page is *spent* when received
    // (the client acks it as seen), so replaying one would show items the server thinks are done.
    { matcher: isTrpc, handler: new NetworkOnly() },
    {
      // Immutable by construction — the route serves `max-age=31536000, immutable` — and the
      // single most expensive thing the app fetches. 150 entries is roughly six feed pages'
      // worth, which is what makes an offline feed look like a feed.
      matcher: isImageProxy,
      handler: new CacheFirst({
        cacheName: IMAGES_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 7 * DAY,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // The feed document only, and network-first with no timeout: a live network always wins, and
      // the cache is purely for being genuinely offline. `/feed` is an RSC page with its first
      // page of items dehydrated into the HTML, so this one entry is the whole of "reopening
      // offline shows the last feed" — no API response is cached to achieve it.
      matcher: isFeedDocument,
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        plugins: [
          {
            // A signed-out reader's `/feed` is a redirect to `/`. Storing that would cache the
            // wrong page *and* produce a response a navigation request may not be served at all.
            cacheWillUpdate: async ({ response }) =>
              response.status === 200 && !response.redirected ? response : null,
          },
          new ExpirationPlugin({ maxEntries: 4 }),
        ],
      }),
    },
    {
      matcher: isNextStatic,
      handler: new CacheFirst({
        cacheName: NEXT_STATIC_CACHE,
        plugins: [
          new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: 30 * DAY }),
        ],
      }),
    },
    {
      matcher: isStaticAsset,
      handler: new StaleWhileRevalidate({
        cacheName: STATIC_CACHE,
        plugins: [
          new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 30 * DAY }),
        ],
      }),
    },
    // The terminator. See the note above: this is what keeps the offline fallback reachable.
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  // When a request fails outright (fully offline, DNS down — not just a slow network), this is
  // the last resort: serve the precached offline shell instead of the browser's own "no
  // internet" error page. Only for `document` requests (actual page navigations) — a failed
  // image or API call should still fail visibly, not silently swap in unrelated offline content.
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
