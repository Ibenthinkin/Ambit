// Repository for "More of this" / "Less of this" (docs/DESIGN_more-or-less.md D1, D2): the
// `item_feedback` verdicts and the `user_topic_cool` multipliers they leave behind. Every function
// is user-scoped by design — `userId` is an explicit parameter (SPEC §11's authorization rule).
//
// The one idea the whole file turns on is **exact undo**. A verdict moves two numbers — a pick's
// weight in `user_topic` and a topic's cool in `user_topic_cool` — and both are clamped (the
// weight to [WEIGHT_FLOOR, WEIGHT_CAP], the cool to [COOL_FLOOR, 1]). A clamp makes a step's size
// depend on where the number stood, so "undo" can't simply apply the opposite step: a "more" that
// the cap cut from +0.25 to +0.1 must be undone by −0.1. So each `item_feedback` row stores the
// delta that was *actually* applied (`weight_applied`, `cool_applied`), read back from the rows
// inside the same transaction, and clearing or flipping a verdict reverses exactly that.
//
// Every write here is one `db.transaction` that first takes an advisory lock on (user, item) —
// see `lockItem` — and every number it changes is then read with `SELECT … FOR UPDATE`.
import { and, desc, eq, sql } from "drizzle-orm";

import {
  item,
  itemFeedback,
  seenItem,
  userTopic,
  userTopicCool,
} from "~/server/db/schema";
import {
  SAVED_ITEM_PROJECTION,
  toSavedItemRows,
  type SavedItemRow,
} from "~/server/db/saves";
import {
  COOL_FLOOR,
  COOL_STEP,
  LESS_STEP,
  MORE_STEP,
  WEIGHT_CAP,
  WEIGHT_FLOOR,
  type Tx,
} from "~/server/db/topics";

export type Verdict = "more" | "less";

/** What one verdict did — what `setFeedback`/`clearFeedback` return and the router turns into a
 *  toast (D4, D5). */
export interface FeedbackEffect {
  verdict: Verdict;
  /** The topic charged; null for an un-homed item, which records the verdict with no topic effect. */
  topicId: string | null;
  /** The exact delta written to `user_topic.weight` after the clamp; 0 when no row was touched. */
  weightApplied: number;
  /** The exact factor multiplied into the topic's cool after the clamp; 1 when none was touched. */
  coolApplied: number;
  /** "more" created the `user_topic` row — the topic is a new pick. Never true for a stored effect
   *  read back (the row does not keep it), which is fine: it only matters on the write that did it. */
  isNewPick: boolean;
}

/**
 * Cool values are stored as `real` (float4, ~7 significant digits), so a cool walked down and
 * back up — 1 × 0.6 ÷ 0.6 — comes home as 0.99999994 or 1.00000004, not 1. Anything this close
 * to 1 *is* 1, and a cool of 1 is no row at all (D1: "a row at 1 is deleted, not kept").
 */
const COOL_EPSILON = 1e-5;

/** Clamp `x` into [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Locks and reads one `user_topic` row. `SELECT … FOR UPDATE` takes a row lock that lasts until
 * the transaction ends: any other transaction that wants to change (or itself lock) the same row
 * waits for us to commit. So the weight read here is still the weight when our `UPDATE` lands a
 * moment later — no second tab can slip a change in between and make `new − old` lie. On a row
 * that does not exist it locks nothing and returns undefined.
 */
async function lockWeight(tx: Tx, userId: string, topicId: string) {
  const [row] = await tx
    .select({ weight: userTopic.weight })
    .from(userTopic)
    .where(and(eq(userTopic.userId, userId), eq(userTopic.topicId, topicId)))
    .for("update");
  return row?.weight;
}

/** `lockWeight`'s twin for `user_topic_cool`. */
async function lockCool(tx: Tx, userId: string, topicId: string) {
  const [row] = await tx
    .select({ cool: userTopicCool.cool })
    .from(userTopicCool)
    .where(
      and(eq(userTopicCool.userId, userId), eq(userTopicCool.topicId, topicId)),
    )
    .for("update");
  return row?.cool;
}

/**
 * Serialises every write about one (user, item) — two quick taps, or a tap racing an undo — so
 * they run one after the other instead of interleaved. Called first in `setFeedback` and
 * `clearFeedback`.
 *
 * Why not just `SELECT … FOR UPDATE` on the item_feedback row? Because on a *first* tap that row
 * doesn't exist yet, and FOR UPDATE locks rows, not the absence of one: two first taps would both
 * read "no verdict", both step the weight, and the second feedback write would overwrite the
 * first's delta — the weight moved twice, one step recorded, undo leaves a 0.25 residue.
 *
 * A Postgres *advisory lock* is a lock on an arbitrary number the application chooses, with no
 * row behind it — so it exists before the row does. `hashtext` turns "user:item" into that
 * number (a hash collision only makes two unrelated taps wait for each other, never wrong).
 * The `_xact_` flavour is released automatically when the transaction commits or rolls back, so
 * there is no unlock to forget.
 */
async function lockItem(tx: Tx, userId: string, itemId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${userId} || ':' || ${itemId}))`,
  );
}

/**
 * Reads the reader's verdict on one item — step 1 of D2 — under `lockItem`. The advisory lock is
 * what serialises taps; the `FOR UPDATE` here is kept as a second guard on the row itself, so a
 * future writer of item_feedback that forgets the advisory lock still can't change an existing
 * verdict out from under us. It costs nothing on a row we already hold the only path to.
 */
async function lockFeedback(tx: Tx, userId: string, itemId: string) {
  const [row] = await tx
    .select()
    .from(itemFeedback)
    .where(
      and(eq(itemFeedback.userId, userId), eq(itemFeedback.itemId, itemId)),
    )
    .for("update");
  return row;
}

/** Writes a cool, or deletes the row when the cool has come back to 1. */
async function writeCool(
  tx: Tx,
  userId: string,
  topicId: string,
  cool: number,
): Promise<void> {
  const where = and(
    eq(userTopicCool.userId, userId),
    eq(userTopicCool.topicId, topicId),
  );
  if (cool >= 1 - COOL_EPSILON) {
    await tx.delete(userTopicCool).where(where);
    return;
  }
  await tx
    .insert(userTopicCool)
    .values({ userId, topicId, cool })
    .onConflictDoUpdate({
      target: [userTopicCool.userId, userTopicCool.topicId],
      set: { cool },
    });
}

/**
 * Undoes a stored verdict's deltas — what `clearFeedback` does, and what a flip does first.
 *
 * - Weight: `+= −weightApplied`, clamped to [WEIGHT_FLOOR, WEIGHT_CAP]. Only if the row still
 *   exists: a pick the reader has since turned off on Profile → Topics stays off. And a row that
 *   "more" *created* is not deleted — it comes back to ~1.0 and stays a pick (D2), the same as a
 *   saved-then-unsaved topic sits at 1.5 today.
 * - Cool: `× 1 / coolApplied`, clamped to [COOL_FLOOR, 1], from 1 when there is no row (a "more"
 *   that warmed a cool to 1 deleted it, and undoing that "more" must bring the cool back). At 1
 *   the row is deleted. The floor side is reachable when verdicts interleave — less, less,
 *   more (a3), less, less, then clearing a3 computes 0.1296 — and the clamp raises that to
 *   COOL_FLOOR, keeping the column's (COOL_FLOOR … 1] invariant.
 */
async function reverseTx(
  tx: Tx,
  userId: string,
  stored: {
    topicId: string | null;
    weightApplied: number;
    coolApplied: number;
  },
): Promise<void> {
  const { topicId, weightApplied, coolApplied } = stored;
  if (topicId === null) return;

  if (weightApplied !== 0) {
    const old = await lockWeight(tx, userId, topicId);
    if (old !== undefined) {
      await tx
        .update(userTopic)
        .set({ weight: clamp(old - weightApplied, WEIGHT_FLOOR, WEIGHT_CAP) })
        .where(
          and(eq(userTopic.userId, userId), eq(userTopic.topicId, topicId)),
        );
    }
  }

  if (coolApplied !== 1) {
    const old = (await lockCool(tx, userId, topicId)) ?? 1;
    await writeCool(
      tx,
      userId,
      topicId,
      clamp(old / coolApplied, COOL_FLOOR, 1),
    );
  }
}

/**
 * Step 2 for "more": upsert the pick one `MORE_STEP` up, capped at `WEIGHT_CAP`.
 *
 * The upsert is `INSERT … ON CONFLICT (user_id, topic_id) DO UPDATE`: insert a fresh row, or —
 * if the primary key already exists — run the `SET` against the existing row instead, in one
 * atomic statement. Its `RETURNING` hands back the row as it stands *after* the statement, so we
 * get the new weight without a second read.
 */
async function moreWeight(tx: Tx, userId: string, topicId: string) {
  const locked = await lockWeight(tx, userId, topicId);
  const [row] = await tx
    .insert(userTopic)
    .values({ userId, topicId, weight: 1.0 + MORE_STEP })
    .onConflictDoUpdate({
      target: [userTopic.userId, userTopic.topicId],
      set: {
        weight: sql`LEAST(${WEIGHT_CAP}, ${userTopic.weight} + ${MORE_STEP})`,
      },
    })
    .returning({
      weight: userTopic.weight,
      // Postgres's `xmax` system column is 0 on a row this statement freshly inserted and
      // non-zero when ON CONFLICT updated an existing one — new-vs-existing answered by the same
      // atomic statement (the trick `bumpTopicWeight` uses).
      isNew: sql<boolean>`(xmax = 0)`,
    });
  const { weight, isNew } = row!;
  // The old weight. A row we locked is the honest answer. A row we just created had none, and
  // counts from 1.0 — the cold-start baseline `bumpTopicWeight` assumes too, which is why a fresh
  // row is written at 1.0 + MORE_STEP, so the recorded delta is exactly MORE_STEP. The third case
  // is a race: the row did not exist when we locked (FOR UPDATE locks nothing that isn't there)
  // but another transaction inserted it before our upsert, which then took the update path. Such
  // a row is at most a fresh 1.25, far below the cap, so our step was not clipped and old is
  // simply new − MORE_STEP.
  const old = locked ?? (isNew ? 1.0 : weight - MORE_STEP);
  return { weightApplied: weight - old, isNewPick: isNew };
}

/** Step 2 for "less": one `LESS_STEP` down, floored at `WEIGHT_FLOOR` — and only where a pick
 *  already exists. A "less" never creates a `user_topic` row: a row there means "a pick" to every
 *  reader of that table, and saying "less" about a drift topic must not make it one. */
async function lessWeight(tx: Tx, userId: string, topicId: string) {
  const old = await lockWeight(tx, userId, topicId);
  if (old === undefined) return 0;
  const [row] = await tx
    .update(userTopic)
    .set({
      weight: sql`GREATEST(${WEIGHT_FLOOR}, ${userTopic.weight} - ${LESS_STEP})`,
    })
    .where(and(eq(userTopic.userId, userId), eq(userTopic.topicId, topicId)))
    .returning({ weight: userTopic.weight });
  return row!.weight - old;
}

/** Step 3 for "less": the cool × COOL_STEP, floored at COOL_FLOOR; a first cool starts from 1.
 *  Returns the factor actually applied (new / old), which the floor can make anything up to 1. */
async function lessCool(tx: Tx, userId: string, topicId: string) {
  const locked = await lockCool(tx, userId, topicId);
  const [row] = await tx
    .insert(userTopicCool)
    .values({ userId, topicId, cool: COOL_STEP })
    .onConflictDoUpdate({
      target: [userTopicCool.userId, userTopicCool.topicId],
      set: {
        cool: sql`GREATEST(${COOL_FLOOR}, ${userTopicCool.cool} * ${COOL_STEP})`,
      },
    })
    .returning({ cool: userTopicCool.cool, isNew: sql<boolean>`(xmax = 0)` });
  const { cool, isNew } = row!;
  // Same three cases as moreWeight's old weight: locked, freshly inserted (from 1), or a racing
  // insert we then updated — a fresh 0.6 that one step takes to 0.36, never near the floor.
  const old = locked ?? (isNew ? 1 : cool / COOL_STEP);
  return cool / old;
}

/** Step 3 for "more": a cooled topic warms by ÷ COOL_STEP, capped at 1 (where the row goes). No
 *  cool row, nothing to warm: factor 1. */
async function moreCool(tx: Tx, userId: string, topicId: string) {
  const old = await lockCool(tx, userId, topicId);
  if (old === undefined) return 1;
  const cool = Math.min(1, old / COOL_STEP);
  await writeCool(tx, userId, topicId, cool);
  return cool >= 1 - COOL_EPSILON ? 1 / old : cool / old;
}

/**
 * Records the reader's verdict on one item and applies it (D2). One transaction, in D2's order:
 *
 *   1. take the (user, item) lock and read the item's feedback row; the same verdict again is a no-op returning what is stored;
 *      the other verdict is reversed first, so a flip nets to exactly one effect;
 *   2. the weight (`moreWeight` / `lessWeight`);
 *   3. the cool (`moreCool` / `lessCool`);
 *   4. "less" marks the item seen, so it never comes back;
 *   5. the feedback row, carrying the deltas actually applied.
 *
 * `topicId` is the topic to charge, already validated by the caller (the save rule: the slot
 * topic if the item really belongs to it, else the item's display topic). `null` — an un-homed
 * item — skips 2 and 3: the verdict is still recorded and "less" still marks it seen.
 */
export async function setFeedback(
  userId: string,
  itemId: string,
  verdict: Verdict,
  topicId: string | null,
): Promise<FeedbackEffect> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation).
  const { db } = await import("./client");
  return db.transaction(async (tx) => {
    await lockItem(tx, userId, itemId);
    const existing = await lockFeedback(tx, userId, itemId);
    if (existing?.verdict === verdict) return storedEffect(existing);
    if (existing) await reverseTx(tx, userId, existing);

    let weightApplied = 0;
    let coolApplied = 1;
    let isNewPick = false;
    if (topicId !== null) {
      if (verdict === "more") {
        ({ weightApplied, isNewPick } = await moreWeight(tx, userId, topicId));
        coolApplied = await moreCool(tx, userId, topicId);
      } else {
        weightApplied = await lessWeight(tx, userId, topicId);
        coolApplied = await lessCool(tx, userId, topicId);
      }
    }

    if (verdict === "less") {
      await tx
        .insert(seenItem)
        .values({ userId, itemId, servedAt: new Date() })
        .onConflictDoNothing();
    }

    const values = { verdict, topicId, weightApplied, coolApplied };
    await tx
      .insert(itemFeedback)
      .values({ userId, itemId, ...values })
      .onConflictDoUpdate({
        target: [itemFeedback.userId, itemFeedback.itemId],
        // A flip is a new verdict: it moves to the front of the "More of this" shelf.
        set: { ...values, createdAt: sql`now()` },
      });
    return { ...values, isNewPick };
  });
}

/** A stored row read back as the effect it had. */
function storedEffect(row: typeof itemFeedback.$inferSelect): FeedbackEffect {
  return {
    verdict: row.verdict,
    topicId: row.topicId,
    weightApplied: row.weightApplied,
    coolApplied: row.coolApplied,
    isNewPick: false,
  };
}

/**
 * Takes a verdict back (D2): reverses exactly the deltas it applied (`reverseTx`), leaves
 * `seen_item` alone (seen is seen), and deletes the row. Returns the effect that was undone, or
 * null when there was nothing to clear.
 */
export async function clearFeedback(
  userId: string,
  itemId: string,
): Promise<FeedbackEffect | null> {
  const { db } = await import("./client");
  return db.transaction(async (tx) => {
    await lockItem(tx, userId, itemId);
    const existing = await lockFeedback(tx, userId, itemId);
    if (!existing) return null;
    await reverseTx(tx, userId, existing);
    await tx
      .delete(itemFeedback)
      .where(
        and(eq(itemFeedback.userId, userId), eq(itemFeedback.itemId, itemId)),
      );
    return storedEffect(existing);
  });
}

/** Every item the reader has given a verdict, split by verdict — what lights the pair's marked
 *  state everywhere (D4's `feedback.mine`; ids only, the shape `saves.ids` has). */
export async function getFeedbackIds(
  userId: string,
): Promise<{ more: string[]; less: string[] }> {
  const { db } = await import("./client");
  const rows = await db
    .select({ itemId: itemFeedback.itemId, verdict: itemFeedback.verdict })
    .from(itemFeedback)
    .where(eq(itemFeedback.userId, userId));
  const out = { more: [] as string[], less: [] as string[] };
  for (const r of rows) out[r.verdict].push(r.itemId);
  return out;
}

/** The "More of this" shelf on Saved (D4's `feedback.list`): newest verdict first, in the same
 *  projection as `getSavedItems`, so `SavedTile` draws both shelves. */
export async function getMoreItems(userId: string): Promise<SavedItemRow[]> {
  const { db } = await import("./client");
  const rows = await db
    .select(SAVED_ITEM_PROJECTION)
    .from(itemFeedback)
    .innerJoin(item, eq(itemFeedback.itemId, item.id))
    .where(
      and(eq(itemFeedback.userId, userId), eq(itemFeedback.verdict, "more")),
    )
    .orderBy(desc(itemFeedback.createdAt));
  return toSavedItemRows(rows);
}

/** The reader's cooled topics → cool, for the feed engine's DRIFT/JUMP landings (D3) and Profile
 *  → Topics' "Showing less of". A topic with no row is not cooled (1). */
export async function getUserTopicCools(
  userId: string,
): Promise<Map<string, number>> {
  const { db } = await import("./client");
  const rows = await db
    .select({ topicId: userTopicCool.topicId, cool: userTopicCool.cool })
    .from(userTopicCool)
    .where(eq(userTopicCool.userId, userId));
  return new Map(rows.map((r) => [r.topicId, r.cool]));
}

/**
 * "Warm up" on Profile → Topics: forgets a topic's cool outright. The verdicts that made it stay
 * recorded; undoing one of those "less"es later reverses its factor from 1, which the ≤ 1 clamp
 * turns into no cool at all — so a warmed topic is not re-cooled by taking back a "less". Returns
 * whether there was a cool to forget.
 */
export async function warmTopic(
  userId: string,
  topicId: string,
): Promise<boolean> {
  const { db } = await import("./client");
  const rows = await db
    .delete(userTopicCool)
    .where(
      and(eq(userTopicCool.userId, userId), eq(userTopicCool.topicId, topicId)),
    )
    .returning({ topicId: userTopicCool.topicId });
  return rows.length > 0;
}

/** The retake's half (D4): every cool goes, inside `onboarding.complete`'s transaction, after
 *  `replaceUserTopicsTx(…, "overwrite")` has replaced the weights. */
export async function clearUserCools(tx: Tx, userId: string): Promise<void> {
  await tx.delete(userTopicCool).where(eq(userTopicCool.userId, userId));
}
