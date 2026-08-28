// Retire the users the e2e suite leaves behind (`e2e/*.spec.ts` sign up a fresh, timestamped
// `ambit-…@example.com` address per run by design) and every row that hangs off them. Dry-run by
// default; `--confirm` deletes. Run with `bun run e2e:clean [--confirm]`.
//
// Local only. CI gets a fresh database per run (Phase 7.1) and never needs this. Locally it is the
// remedy for the accumulation CLAUDE.md's gallery.spec:193 note describes — hundreds of users and
// thousands of `seen_item` rows from repeated suites, on a box that also runs the dev server.
//
// **Delete order matters.** Only `session` and `account` cascade from `user`; `user_topic`,
// `collection`, `saved_item` and `seen_item` reference it without `onDelete`, so they go first.
// `verification` rows (reset tokens) carry no FK and expire on their own — left alone. The
// `invite` row for each address goes too, so a rerun of the same timestamp could never be "already
// invited" (it can't happen — `Date.now()` — but the table should not keep a stub per run either).
import { inArray, like } from "drizzle-orm";

import { db } from "~/server/db/client";
import {
  collection,
  invite,
  savedItem,
  seenItem,
  user,
  userTopic,
} from "~/server/db/schema";

/** Every e2e spec's address shape. Real readers never sign up under example.com. */
const PATTERN = "ambit-%@example.com";

async function main() {
  const confirm = process.argv.includes("--confirm");

  const users = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(like(user.email, PATTERN));
  const ids = users.map((u) => u.id);

  // `db.$count` (drizzle-orm ≥ 0.36; the repo is on 0.45) — a `SELECT count(*)`, so it works for
  // the two tables with composite primary keys and no `id` column (`user_topic`, `seen_item`).
  const [seen, saved, topics, collections] =
    ids.length === 0
      ? [0, 0, 0, 0]
      : await Promise.all([
          db.$count(seenItem, inArray(seenItem.userId, ids)),
          db.$count(savedItem, inArray(savedItem.userId, ids)),
          db.$count(userTopic, inArray(userTopic.userId, ids)),
          db.$count(collection, inArray(collection.userId, ids)),
        ]);

  console.log(
    `e2e users: ${users.length} · seen_item ${seen} · saved_item ${saved} · user_topic ${topics} · collection ${collections}`,
  );
  if (!confirm) {
    console.log("Dry run. Re-run with --confirm to delete.");
    process.exit(0);
  }
  if (ids.length === 0) process.exit(0);

  await db.delete(seenItem).where(inArray(seenItem.userId, ids));
  await db.delete(savedItem).where(inArray(savedItem.userId, ids));
  await db.delete(collection).where(inArray(collection.userId, ids));
  await db.delete(userTopic).where(inArray(userTopic.userId, ids));
  await db.delete(user).where(inArray(user.id, ids)); // session + account cascade
  await db.delete(invite).where(like(invite.email, PATTERN));
  console.log(`Deleted ${users.length} users and their rows.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("e2e-clean failed:", err);
  process.exit(1);
});
