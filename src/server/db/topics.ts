// Repository for `topic`/`user_topic` (SPEC §6.3). `listTopics`/`setUserTopics` are real as of
// Phase 4.2, backing the `topics.list`/`topics.setMine` tRPC procedures. Note this is distinct
// from seeding: Phase 2.3's `scripts/seed-topics.ts` upserts the 16 config-defined topic rows
// directly, since that's a one-off config load, not a user-facing repository operation.
// `getUserTopicWeights` is real as of Phase 4.1 — the feed engine's own read of a user's CORE
// weights (SPEC §9.1).
import { and, eq, notInArray } from "drizzle-orm";

import { topic, userTopic } from "~/server/db/schema";

export type Topic = typeof topic.$inferSelect;

/**
 * All sixteen v1 topics (SPEC §3.2), unfiltered — backs the onboarding chip grid and
 * `topics.list`. Small, checked-in-config-sized table; no pagination needed.
 */
export async function listTopics(): Promise<Topic[]> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation): a static "./client"
  // import would crash `bun run test` in CI the moment any test file imports this module, even
  // one that never calls a DB-backed function.
  const { db } = await import("./client");
  return db.select().from(topic);
}

/**
 * Replaces a user's topic selection with exactly `topicIds` (SPEC §7's `topics.setMine`,
 * onboarding + re-pick). Two things this deliberately does NOT do naively:
 *   - It doesn't blind delete-then-reinsert-all: a topic the user keeps across a re-pick retains
 *     whatever `weight` the feed has since learned for it (SPEC §9's "saving an item nudges its
 *     topic's weight up") — only topics actually dropped from the selection lose their row, and
 *     only topics newly added get a fresh row at the default weight.
 *   - `topicIds` is expected to already be validated against real topic ids by the caller (the
 *     `topics.setMine` procedure, which throws `BAD_REQUEST` on an unknown id *before* calling
 *     this) — this function trusts its input and would otherwise fail on the `user_topic.topic_id`
 *     foreign key, not with a clean application-level error.
 *
 * Wrapped in a transaction so a crash between the delete and the insert can never leave a user
 * with neither their old nor new selection.
 */
export async function setUserTopics(
  userId: string,
  topicIds: string[],
): Promise<void> {
  const { db } = await import("./client");

  await db.transaction(async (tx) => {
    // Drop rows for topics no longer selected. `notInArray(col, [])` is invalid SQL (an empty
    // IN-list) — the same footgun items.ts/feed.ts already guard against — so an empty `topicIds`
    // (which the router's `z.array(...).min(1)` should never actually hand us, but this function
    // doesn't rely on that alone) just deletes everything for this user instead.
    if (topicIds.length > 0) {
      await tx
        .delete(userTopic)
        .where(
          and(
            eq(userTopic.userId, userId),
            notInArray(userTopic.topicId, topicIds),
          ),
        );
    } else {
      await tx.delete(userTopic).where(eq(userTopic.userId, userId));
    }

    if (topicIds.length === 0) return;

    // Insert every selected topic at the default weight, but `onConflictDoNothing` on the
    // (userId, topicId) primary key — a topic the user already had keeps its existing row
    // (and thus its existing, possibly-learned weight) untouched rather than being reset to 1.
    await tx
      .insert(userTopic)
      .values(topicIds.map((topicId) => ({ userId, topicId, weight: 1.0 })))
      .onConflictDoNothing();
  });
}

/**
 * A user's `user_topic.weight` rows, keyed by topic id (SPEC §9.1 — CORE's own draw, and the
 * starting point for every DRIFT/JUMP walk). A brand-new user has zero rows here — that's not an
 * error, just the cold-start signal services/feed.ts's `getFeedPage` reacts to by falling back to
 * `coldStartWeights()` (uniform weight 1 across all sixteen topics) rather than erroring or
 * serving an empty feed.
 */
export async function getUserTopicWeights(
  userId: string,
): Promise<Map<string, number>> {
  // Dynamic import for the same CI-has-no-env-vars reason as items.ts's drawFromTopic/upsertItem:
  // "./client" reads "~/env" at module scope, and a static import here would crash any test file
  // that merely imports this module (e.g. feed.ts's pure functions) before a single test runs.
  const { db } = await import("./client");
  const rows = await db
    .select()
    .from(userTopic)
    .where(eq(userTopic.userId, userId));
  return new Map(rows.map((row) => [row.topicId, row.weight]));
}
