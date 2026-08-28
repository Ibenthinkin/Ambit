import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The typed, validated home for every environment variable the app reads (SPEC §13's
// `.env.example` documents the full set as Phase 2+ features land — Better Auth, mail, the
// ingest-time LLM curator). Two things this buys over raw `process.env.FOO`:
//   1. A Zod schema, so a missing/malformed var fails fast at boot (see next.config.js) instead of
//      producing `undefined` deep in some request handler.
//   2. A hard split between `server` and `client` vars — importing this module from a "use client"
//      component only exposes what's listed under `client`, so a server secret can't leak into the
//      browser bundle by accident.
// Add a var here (and to `runtimeEnv` below) before reading it anywhere in the app; the schema and
// `.env`/`.env.example` should always be updated together.
export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    // Better Auth (Phase 2.2): the secret signs session tokens/cookies — generate with
    // `openssl rand -base64 32` and never commit it. BETTER_AUTH_URL is the app's own origin,
    // used to build absolute callback/reset-password links.
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),
    // Optional: unset in dev (server/services/mailer.ts falls back to Mailpit), required for
    // ResendMailer to activate in production.
    RESEND_API_KEY: z.string().min(1).optional(),
    // The envelope sender for every transactional mail (Phase 8.1). It has to be an address on a
    // domain verified in Resend — anything else is rejected at send time, and the send is
    // fire-and-forget (see auth.ts's sendResetPassword), so a wrong value here is *silent*. The
    // default is the deployed domain; a different deployment overrides it rather than editing
    // mailer.ts, which is why this is a var at all.
    MAIL_FROM: z.string().min(1).default("Ambit <noreply@ambit.benreilly.io>"),
    // Optional here (unlike the two above): only the ingest-time curator (server/services/
    // curator.ts, Phase 3.3) and offline embedding tooling read it, never a request path, so
    // there's no reason to fail app boot over it. curator.ts checks for its own presence at call
    // time and throws a clear error there instead.
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // Ben's personal-archive service (Phase A.5; the ambit-archive repo). Optional for the same
    // reason as the key above, and one more: a machine without the archive running — CI, or any
    // clone that isn't Ben's — must still boot and run `bun run ingest` cleanly for the other five
    // sources. sources/archive.ts checks both at search() time and throws its own clear error
    // there, rather than failing app boot over an ingest-only dependency. Registered here anyway,
    // for validation and because this file is where the app's env surface is documented.
    ARCHIVE_URL: z.string().url().optional(),
    ARCHIVE_API_KEY: z.string().min(1).optional(),
    // Smithsonian Open Access (Phase 6.2 trial) — a free api.data.gov key. Optional for exactly
    // the reasons above: ingest-only, and a clone without one must still boot and ingest every
    // other source. sources/smithsonian.ts reads process.env at search() time and throws its own
    // "not configured" error there.
    SMITHSONIAN_API_KEY: z.string().min(1).optional(),
    // Where the image proxy keeps its cache (Phase 7.3). One `<itemId>.webp` file per item, so
    // every source image is fetched from upstream exactly once, ever. Relative paths resolve
    // against `process.cwd()`. Safe to delete at any time — the next request refills it.
    // **8.1 mounts this as a persistent volume** so a deploy doesn't send the whole corpus back to
    // the museums.
    IMAGE_CACHE_DIR: z.string().min(1).default(".cache/img"),
    // Optional (Phase 4.1 decision): gates the feed engine's debug affordances (SPEC §9's "dev
    // affordances stay in" — the debug overlay's `why`/`curationScore` on each card, and whether
    // `feed.page` honors ad hoc knob overrides at all). Left unset, it defaults to "on" in
    // development and "off" elsewhere — see the `env.FEED_DEBUG ?? env.NODE_ENV === "development"`
    // fallback in server/services/feed.ts, which is why this schema field itself stays a plain
    // optional boolean rather than baking the NODE_ENV-aware default in here.
    FEED_DEBUG: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ARCHIVE_URL: process.env.ARCHIVE_URL,
    ARCHIVE_API_KEY: process.env.ARCHIVE_API_KEY,
    SMITHSONIAN_API_KEY: process.env.SMITHSONIAN_API_KEY,
    IMAGE_CACHE_DIR: process.env.IMAGE_CACHE_DIR,
    FEED_DEBUG: process.env.FEED_DEBUG,
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
