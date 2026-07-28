// Next.js reads this file at boot to configure the framework itself — bundler options, image
// domains, redirects, headers, etc. (Everything here runs in Node before any request is served;
// it is not part of the app bundle.) Importing env.js at the top means an invalid/missing env var
// fails the build immediately instead of surfacing as a confusing runtime crash later.
//
// This file stays sparse today; Phase 1.3 adds the `@serwist/next` PWA wrapper here.

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {};

export default config;
