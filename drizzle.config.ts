import type { Config } from "drizzle-kit";

import { env } from "~/env";

// Config for the `drizzle-kit` CLI (`db:generate`/`db:push`/`db:migrate`/`db:studio` in
// package.json) — the tool that reads schema.ts and talks to Postgres. This file is never
// imported by the app itself at runtime.
export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // No `tablesFilter`: this compose Postgres is dedicated to Ambit alone, so drizzle-kit is free
  // to manage every table in the database — no shared-instance table-name collisions to guard
  // against (see schema.ts's file header for the fuller reasoning).
} satisfies Config;
