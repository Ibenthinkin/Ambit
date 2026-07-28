// Placeholder schema from the t3 scaffold — replaced by the real tables in SPEC §5 (item,
// user, user_topic, etc.) during Phase 2. Kept for now so Phase 1 has something real to run
// `db:push`/`db:studio` against without inventing throwaway migrations.
// https://orm.drizzle.team/docs/sql-schema-declaration

import { index, pgTableCreator } from "drizzle-orm/pg-core";

// `pgTableCreator` prefixes every table name (here, `ambit_`) so this schema could safely share a
// Postgres instance with other apps — one database, no table-name collisions. drizzle.config.ts's
// `tablesFilter` uses the same prefix so drizzle-kit only ever inspects/migrates our own tables.
// @see https://orm.drizzle.team/docs/goodies#multi-project-schema
export const createTable = pgTableCreator((name) => `ambit_${name}`);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 256 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index("name_idx").on(t.name)],
);
