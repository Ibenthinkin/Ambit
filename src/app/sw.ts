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
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  // `defaultCache` is Serwist's opinionated, framework-aware set of runtime caching rules for
  // everything precaching doesn't cover: Next's on-demand JS chunks, fonts, images, API calls.
  // Phase 1 keeps the default rather than hand-tuning per-route strategies; SPEC's feed/item
  // routes may want a bespoke strategy later (e.g. never cache a personalized feed page).
  runtimeCaching: defaultCache,
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
