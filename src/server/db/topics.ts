// Repository for `topic`/`user_topic` (SPEC §6.3). `listTopics`/`setUserTopics` are typed stubs —
// real implementation lands in Phase 4.2 with the `topics.list`/`topics.setMine` tRPC procedures.
// Note this is distinct from seeding: Phase 2.3's `scripts/seed-topics.ts` upserts the 16
// config-defined topic rows directly, since that's a one-off config load, not a user-facing
// repository operation. `getUserTopicWeights` is real as of Phase 4.1 — the feed engine's own
// read of a user's CORE weights (SPEC §9.1).
import { eq } from "drizzle-orm";

import type { topic } from "~/server/db/schema";
import { userTopic } from "~/server/db/schema";

export type Topic = typeof topic.$inferSelect;

export function listTopics(): Promise<Topic[]> {
  throw new Error("listTopics: not implemented until Phase 4.2");
}

export function setUserTopics(
  _userId: string,
  _topicIds: string[],
): Promise<void> {
  throw new Error("setUserTopics: not implemented until Phase 4.2");
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
