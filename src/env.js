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
