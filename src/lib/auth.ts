import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "~/env";
import { db } from "~/server/db/client";

// The Better Auth server instance. Two audiences read this file:
//   1. The app itself, at request time (session checks, the /api/auth/[...all] route handler —
//      wired up in Phase 2.2).
//   2. The `@better-auth/cli` schema generator (`bunx @better-auth/cli generate`), which imports
//      this exact config to figure out which core tables/columns it owns (user, session, account,
//      verification) — that's why this file has to exist and be runnable *before* those tables are
//      in schema.ts, not after.
// This is intentionally minimal for now: just enough shape for the generator to walk. Invite
// gating, the mailer, and the route/client wiring land in Phase 2.2.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});
