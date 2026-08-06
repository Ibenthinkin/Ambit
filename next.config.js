// Next.js reads this file at boot to configure the framework itself — bundler options, image
// domains, redirects, headers, etc. (Everything here runs in Node before any request is served;
// it is not part of the app bundle.) Importing env.js at the top means an invalid/missing env var
// fails the build immediately instead of surfacing as a confusing runtime crash later.

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import { withSerwist } from "@serwist/turbopack";

/** @type {import("next").NextConfig} */
const config = {
  // Better Auth ships some Node-only internals (crypto, its own DB adapters) that Next's default
  // bundling tries to trace into the client/edge graph and trips over under `--bun` — this tells
  // Next to leave the package as a real Node `require()` at runtime instead of bundling it.
  serverExternalPackages: ["better-auth"],
};

// `@serwist/turbopack` (not the older `@serwist/next`) is the PWA/service-worker integration:
// it compiles the service worker as a Next.js Route Handler (src/app/serwist/sw.js/route.ts)
// instead of a webpack build step, so it works identically under Turbopack in both `next dev`
// and `next build` — this project has no webpack fallback anywhere else, so that match matters.
export default withSerwist(config);
