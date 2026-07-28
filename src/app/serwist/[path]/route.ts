import { spawnSync } from "node:child_process";

import { createSerwistRoute } from "@serwist/turbopack";

// A Route Handler, not a static file — this is what lets Serwist run under Turbopack: the
// service worker's JS gets compiled through Next's normal per-request route pipeline instead of
// a separate webpack build pass. The `[path]` dynamic segment is required by Serwist itself (not
// a choice made here) — it's what lets one handler serve every path under /serwist/* (the SW
// script, its sourcemap, etc.) rather than just one literal file. `GET` is a real Next.js route
// export; visiting /serwist/sw.js in a browser returns the compiled worker script (see
// src/app/sw.ts for its source), and the `dynamic`/`revalidate`/etc. exports tell Next how to
// treat this route (uncached, no static params) so it recompiles when src/app/sw.ts changes.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout ??
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    // Precaches the offline fallback page by name so it's already in the cache before a real
    // outage happens — see src/app/sw.ts's `fallbacks` option, which serves this when a
    // navigation request fails. `revision` busts that cache entry whenever the app is
    // redeployed (falls back to a random UUID if `git` isn't available, e.g. some CI images).
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    useNativeEsbuild: true,
  });
