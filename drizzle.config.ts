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
  // Every table Drizzle manages is prefixed `ambit_` (set in schema.ts's `createTable`) so this DB
  // could share a Postgres instance with other apps without name collisions — drizzle-kit needs
  // the same prefix here so it only ever touches tables this project owns.
  tablesFilter: ["ambit_*"],
} satisfies Config;
