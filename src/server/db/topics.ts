// Repository for `topic`/`user_topic` (SPEC §6.3). `listTopics`/`setUserTopics` are real as of
// Phase 4.2, backing the `topics.list`/`topics.setMine` tRPC procedures. Note this is distinct
// from seeding: Phase 2.3's `scripts/seed-topics.ts` upserts the 16 config-defined topic rows
// directly, since that's a one-off config load, not a user-facing repository operation.
// `getUserTopicWeights` is real as of Phase 4.1 — the feed engine's own read of a user's CORE
// weights (SPEC §9.1).
import { and, eq, notInArray, sql } from "drizzle-orm";

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

/**
 * Just the ids of the topics a user has picked (Phase 5.10) — what Settings' "What you see" row
 * needs to label itself, and what its sheet needs to open pre-selected.
 *
 * Deliberately not `getUserTopicWeights`: that returns a Map because the feed engine draws against
 * the weights, and handing a UI a structure it has to strip the values off of invites the next
 * caller to start reading them. A picker cares only about membership.
 */
export async function getUserTopicIds(userId: string): Promise<string[]> {
  // Dynamic import — same CI-has-no-env-vars reason as every other function in this file.
  const { db } = await import("./client");
  const rows = await db
    .select({ topicId: userTopic.topicId })
    .from(userTopic)
    .where(eq(userTopic.userId, userId));
  return rows.map((row) => row.topicId);
}

/**
 * Has this user picked any topics at all? (Phase 5.3.) The single boolean both `/onboarding`
 * (skip the picker, redirect to `/feed`, if true) and `/feed` (bounce to `/onboarding` if false)
 * need — centralized here so the two routes can't independently drift on what "onboarded" means.
 * `getUserTopicWeights(...).size > 0` would answer the same question but pulls every row just to
 * count them; `.limit(1)` only ever fetches at most one.
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  // Dynamic import — same CI-has-no-env-vars reason as every other function in this file.
  const { db } = await import("./client");
  const rows = await db
    .select({ topicId: userTopic.topicId })
    .from(userTopic)
    .where(eq(userTopic.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * How much one *new* save nudges the saved item's topic weight (Phase 6.1). The values are
 * phase0's shipped defaults (`phase0/feed.template.html:398` — SPEC §9's standing rule that the
 * bench's defaults are the app's defaults): +0.5 per save, capped at 3.0 against the 1.0
 * cold-start default. Deliberately NOT part of `FeedKnobs`: knobs are compose-side and
 * zod-mirrored in `routers/feed.ts`; these are save-side *write* constants. `WEIGHT_CAP` is also
 * unrelated to `DEFAULT_KNOBS.topicCap` (a per-page diversity bound) despite the similar name.
 */
export const WEIGHT_BUMP = 0.5;
export const WEIGHT_CAP = 3.0;

/**
 * Bumps a user's weight for one topic — the write half of SPEC §9's "saving an item nudges its
 * topic's weight up". A single atomic upsert:
 *
 *   - No row yet (the user never picked this topic, or never onboarded at all): a fresh row is
 *     created at `1.0 + bump` — the cold default plus the nudge. That row creation *is* the
 *     entire "related topics inferred from saves" mechanism; there is deliberately no
 *     graph-neighbor spillover, because DRIFT/JUMP already spread a raised weight structurally
 *     (weighted draws pick the start of graph walks, and `reachableTopics` widens the fetched
 *     pools two hops out).
 *   - Row exists: `LEAST(cap, weight + bump)`. Note `LEAST` also clamps a hand-set super-cap
 *     weight *down* on its next bump — production writes can't exceed the cap, only test
 *     fixtures can set e.g. 7.0, so that's a fixture-only quirk, not a bug.
 */
export async function bumpTopicWeight(
  userId: string,
  topicId: string,
  opts: { bump?: number; cap?: number } = {},
): Promise<{ isNew: boolean; weight: number }> {
  const bump = opts.bump ?? WEIGHT_BUMP;
  const cap = opts.cap ?? WEIGHT_CAP;
  // Dynamic import — same CI-has-no-env-vars reason as every other function in this file.
  const { db } = await import("./client");
  const [row] = await db
    .insert(userTopic)
    .values({ userId, topicId, weight: 1.0 + bump })
    .onConflictDoUpdate({
      target: [userTopic.userId, userTopic.topicId],
      set: { weight: sql`LEAST(${cap}, ${userTopic.weight} + ${bump})` },
    })
    .returning({
      weight: userTopic.weight,
      // Postgres's `xmax` system column is 0 on a freshly inserted row and non-zero when
      // ON CONFLICT updated an existing one — which answers new-vs-existing in the same atomic
      // statement, with no read-then-write race window.
      isNew: sql<boolean>`(xmax = 0)`,
    });
  return row!;
}

/**
 * One topic's human-readable label — what the save toast needs to say *which* topic is now
 * drifting ("Saved to Art · Now drifting toward Cartography"). Read from the table rather than
 * the static `TOPICS` config because integration-fixture topics exist only as rows; for a real
 * item the FK on `item.topic_id` guarantees a row exists.
 */
export async function getTopicLabel(
  topicId: string,
): Promise<string | undefined> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ label: topic.label })
    .from(topic)
    .where(eq(topic.id, topicId))
    .limit(1);
  return row?.label;
}
