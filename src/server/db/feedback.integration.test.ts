// Integration tests for "More of this" / "Less of this"'s write and its exact undo
// (docs/DESIGN_more-or-less.md D2, D7's first bullet), against a real Postgres. Integration
// rather than unit because the whole point of db/feedback.ts is what a transaction does to three
// tables at once — the clamp happens in SQL, the deltas are read back from rows, and the only
// honest witness is the database. Self-skips whenever DATABASE_URL isn't set, same as
// topics.integration.test.ts.
//
// Every test makes its own user (`freshUser`), so no test can see another's weights or cools,
// and the suite can run in any order. The items are shared — a feedback row is per (user, item).
import { and, eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  COOL_FLOOR,
  COOL_STEP,
  LESS_STEP,
  MORE_STEP,
  WEIGHT_CAP,
  WEIGHT_FLOOR,
} from "./topics";

describe.skipIf(!process.env.DATABASE_URL)("db/feedback (integration)", () => {
  const run = nanoid(8);
  const topicA = `test-feedback-a-${run}`; // the reader's pick, in most tests
  const topicB = `test-feedback-b-${run}`; // never picked
  const sourcePrefix = `test-feedback-${run}-`;
  const users: string[] = [];
  // item ids by short name: a1..a6 homed in A, b1..b6 homed in B.
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const { db } = await import("./client");
    const { topic } = await import("./schema");
    const { insertHomedItems } = await import("./test-fixtures");
    await db.insert(topic).values([
      { id: topicA, label: "Feedback A", seedQueries: {}, facet: "subject" },
      { id: topicB, label: "Feedback B", seedQueries: {}, facet: "subject" },
    ]);
    const names = [1, 2, 3, 4, 5, 6].flatMap((n) => [`a${n}`, `b${n}`]);
    const rows = await insertHomedItems(
      db,
      names.map((name) => ({
        source: "wikipedia" as const,
        sourceId: `${sourcePrefix}${name}`,
        type: "article" as const,
        title: `Feedback fixture ${name}`,
        summary: "A summary long enough to be unremarkable.",
        sourceUrl: `https://example.com/${sourcePrefix}${name}`,
        topicId: name.startsWith("a") ? topicA : topicB,
        curationScore: 8,
      })),
    );
    for (const r of rows) ids[r.sourceId.slice(sourcePrefix.length)] = r.id;
  });

  afterAll(async () => {
    const { db } = await import("./client");
    const {
      item,
      itemFeedback,
      seenItem,
      topic,
      user,
      userTopic,
      userTopicCool,
    } = await import("./schema");
    // Children first: every one of these references `user` without a cascade, and seen_item
    // references `item` without one too.
    if (users.length > 0) {
      await db.delete(itemFeedback).where(inArray(itemFeedback.userId, users));
      await db.delete(seenItem).where(inArray(seenItem.userId, users));
      await db.delete(userTopic).where(inArray(userTopic.userId, users));
      await db
        .delete(userTopicCool)
        .where(inArray(userTopicCool.userId, users));
      await db.delete(user).where(inArray(user.id, users));
    }
    await db.delete(item).where(like(item.sourceId, `${sourcePrefix}%`));
    await db.delete(topic).where(inArray(topic.id, [topicA, topicB]));
  });

  /** A user of their own, optionally with picks at given weights. */
  async function freshUser(picks: Record<string, number> = {}) {
    const { db } = await import("./client");
    const { user, userTopic } = await import("./schema");
    const id = `test-feedback-user-${nanoid(8)}`;
    users.push(id);
    await db.insert(user).values({
      id,
      name: "Test feedback user",
      email: `${id}@example.com`,
      emailVerified: false,
    });
    const rows = Object.entries(picks).map(([topicId, weight]) => ({
      userId: id,
      topicId,
      weight,
    }));
    if (rows.length > 0) await db.insert(userTopic).values(rows);
    return id;
  }

  async function weightOf(userId: string, topicId: string) {
    const { getUserTopicWeights } = await import("./topics");
    return (await getUserTopicWeights(userId)).get(topicId);
  }

  async function coolOf(userId: string, topicId: string) {
    const { getUserTopicCools } = await import("./feedback");
    return (await getUserTopicCools(userId)).get(topicId);
  }

  async function seen(userId: string, itemId: string) {
    const { db } = await import("./client");
    const { seenItem } = await import("./schema");
    const rows = await db
      .select()
      .from(seenItem)
      .where(and(eq(seenItem.userId, userId), eq(seenItem.itemId, itemId)));
    return rows.length > 0;
  }

  it("'more' on a picked topic steps its weight by MORE_STEP and records the delta", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    const effect = await setFeedback(u, ids.a1!, "more", topicA);
    expect(effect).toEqual({
      verdict: "more",
      topicId: topicA,
      weightApplied: MORE_STEP,
      coolApplied: 1,
      isNewPick: false,
    });
    expect(await weightOf(u, topicA)).toBeCloseTo(1 + MORE_STEP);
    // "more" never marks seen — only "less" does.
    expect(await seen(u, ids.a1!)).toBe(false);
  });

  it("'more' on an unpicked topic adopts it: isNewPick, weight 1.25", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser();
    const effect = await setFeedback(u, ids.b1!, "more", topicB);
    expect(effect.isNewPick).toBe(true);
    expect(effect.weightApplied).toBeCloseTo(MORE_STEP);
    expect(await weightOf(u, topicB)).toBeCloseTo(1.25);
  });

  it("'more' clipped by the cap applies only what fit", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 2.9 });
    const effect = await setFeedback(u, ids.a1!, "more", topicA);
    expect(effect.weightApplied).toBeCloseTo(WEIGHT_CAP - 2.9, 5);
    expect(await weightOf(u, topicA)).toBeCloseTo(WEIGHT_CAP);
  });

  it("'less' on a picked topic steps the weight down, cools it, and marks the item seen", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    const effect = await setFeedback(u, ids.a1!, "less", topicA);
    expect(effect.verdict).toBe("less");
    expect(effect.weightApplied).toBeCloseTo(-LESS_STEP);
    expect(effect.coolApplied).toBeCloseTo(COOL_STEP);
    expect(effect.isNewPick).toBe(false);
    expect(await weightOf(u, topicA)).toBeCloseTo(1 - LESS_STEP);
    expect(await coolOf(u, topicA)).toBeCloseTo(COOL_STEP);
    expect(await seen(u, ids.a1!)).toBe(true);
  });

  it("'less' on a topic the reader never picked creates no user_topic row — a cool row only", async () => {
    const { setFeedback } = await import("./feedback");
    const { getUserTopicIds } = await import("./topics");
    const u = await freshUser({ [topicA]: 1 });
    const effect = await setFeedback(u, ids.b1!, "less", topicB);
    expect(effect.weightApplied).toBe(0);
    expect(effect.coolApplied).toBeCloseTo(COOL_STEP);
    expect(effect.isNewPick).toBe(false);
    // The picks are exactly what they were: a cooled drift topic is not a pick.
    expect(await getUserTopicIds(u)).toEqual([topicA]);
    expect(await weightOf(u, topicA)).toBe(1);
    expect(await coolOf(u, topicB)).toBeCloseTo(COOL_STEP);
  });

  it("'less' never takes a weight below WEIGHT_FLOOR, and records only what it took", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 0.4 });
    const first = await setFeedback(u, ids.a1!, "less", topicA);
    expect(first.weightApplied).toBeCloseTo(WEIGHT_FLOOR - 0.4, 5);
    const second = await setFeedback(u, ids.a2!, "less", topicA);
    expect(second.weightApplied).toBe(0);
    expect(await weightOf(u, topicA)).toBeCloseTo(WEIGHT_FLOOR);
  });

  it("four 'less' reach COOL_FLOOR, and a fifth applies coolApplied 1", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser();
    for (const name of ["b1", "b2", "b3", "b4"])
      await setFeedback(u, ids[name]!, "less", topicB);
    expect(await coolOf(u, topicB)).toBeCloseTo(COOL_FLOOR);
    const fifth = await setFeedback(u, ids.b5!, "less", topicB);
    expect(fifth.coolApplied).toBeCloseTo(1, 5);
    expect(await coolOf(u, topicB)).toBeCloseTo(COOL_FLOOR);
  });

  it("'more' warms a cooled topic, and deletes the cool row when it reaches 1", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    await setFeedback(u, ids.a1!, "less", topicA); // cool 0.6
    await setFeedback(u, ids.a2!, "less", topicA); // cool 0.36
    const warm = await setFeedback(u, ids.a3!, "more", topicA);
    expect(warm.coolApplied).toBeCloseTo(1 / COOL_STEP, 4);
    expect(await coolOf(u, topicA)).toBeCloseTo(COOL_STEP);
    await setFeedback(u, ids.a4!, "more", topicA);
    // 0.6 / 0.6 = 1 → the row is deleted, not kept at 1.
    expect(await coolOf(u, topicA)).toBeUndefined();
    // A "more" with no cool row to warm touches no cool.
    const plain = await setFeedback(u, ids.a5!, "more", topicA);
    expect(plain.coolApplied).toBe(1);
  });

  it("an un-homed item writes the row with no topic effect, and 'less' still marks it seen", async () => {
    const { db } = await import("./client");
    const { itemFeedback } = await import("./schema");
    const { insertHomedItems } = await import("./test-fixtures");
    const { getFeedbackIds, setFeedback } = await import("./feedback");
    // Made here, not in beforeAll, and below the curation floor: an un-homed row is drawable by
    // any user's WILD slot, and CLAUDE.md records what that does to the feed suite's cursor
    // test when the row lives long. afterAll's sourceId sweep removes it.
    const [orphan] = await insertHomedItems(db, [
      {
        source: "wikipedia",
        sourceId: `${sourcePrefix}orphan`,
        type: "article",
        title: "Feedback fixture orphan",
        summary: "A summary long enough to be unremarkable.",
        sourceUrl: `https://example.com/${sourcePrefix}orphan`,
        topicId: null,
        curationScore: 1,
      },
    ]);
    const u = await freshUser({ [topicA]: 1 });
    const effect = await setFeedback(u, orphan!.id, "less", null);
    expect(effect).toEqual({
      verdict: "less",
      topicId: null,
      weightApplied: 0,
      coolApplied: 1,
      isNewPick: false,
    });
    expect(await seen(u, orphan!.id)).toBe(true);
    expect(await getFeedbackIds(u)).toEqual({ more: [], less: [orphan!.id] });
    expect(await weightOf(u, topicA)).toBe(1);
    expect((await (await import("./feedback")).getUserTopicCools(u)).size).toBe(
      0,
    );
    await db.delete(itemFeedback).where(eq(itemFeedback.itemId, orphan!.id));
  });

  it("setting the same verdict twice is a no-op that returns the stored effect", async () => {
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    const first = await setFeedback(u, ids.a1!, "less", topicA);
    const again = await setFeedback(u, ids.a1!, "less", topicA);
    expect(again.verdict).toBe("less");
    expect(again.topicId).toBe(topicA);
    expect(again.weightApplied).toBeCloseTo(first.weightApplied);
    expect(again.coolApplied).toBeCloseTo(first.coolApplied);
    expect(await weightOf(u, topicA)).toBeCloseTo(1 - LESS_STEP);
    expect(await coolOf(u, topicA)).toBeCloseTo(COOL_STEP);
  });

  it("a flip (more → less on one item) nets to exactly one 'less' effect", async () => {
    const { getFeedbackIds, setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    // A cool already in place, so the flip's reversal has a cool to undo as well as a weight.
    await setFeedback(u, ids.a1!, "less", topicA); // weight 0.75, cool 0.6
    await setFeedback(u, ids.a2!, "more", topicA); // weight 1.0, cool 1 (row deleted)
    const flip = await setFeedback(u, ids.a2!, "less", topicA);
    // Exactly what a2 would have done as a "less" from the start: 0.75 → 0.5, cool 0.6 → 0.36.
    expect(flip.verdict).toBe("less");
    expect(flip.weightApplied).toBeCloseTo(-LESS_STEP);
    expect(flip.coolApplied).toBeCloseTo(COOL_STEP);
    expect(await weightOf(u, topicA)).toBeCloseTo(1 - 2 * LESS_STEP);
    expect(await coolOf(u, topicA)).toBeCloseTo(COOL_STEP * COOL_STEP);
    // One row per (user, item): the verdict was replaced, not added.
    const mine = await getFeedbackIds(u);
    expect(mine.more).toEqual([]);
    expect([...mine.less].sort()).toEqual([ids.a1!, ids.a2!].sort());
  });

  it("concurrent first taps on one item apply one step, and the stored delta matches it", async () => {
    // No item_feedback row exists yet, so a `FOR UPDATE` on it would lock nothing and both taps
    // would step the weight while only one delta survived. The advisory lock serialises them.
    const { db } = await import("./client");
    const { itemFeedback } = await import("./schema");
    const { setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    // Eight at once rather than two: a pair often doesn't overlap at all, eight reliably do.
    await Promise.all(
      Array.from({ length: 8 }, () => setFeedback(u, ids.a6!, "more", topicA)),
    );
    const [row] = await db
      .select()
      .from(itemFeedback)
      .where(and(eq(itemFeedback.userId, u), eq(itemFeedback.itemId, ids.a6!)));
    expect(await weightOf(u, topicA)).toBeCloseTo(1 + row!.weightApplied);
    expect(await weightOf(u, topicA)).toBeCloseTo(1 + MORE_STEP);
  });

  it("clear reverses a 'less' exactly and leaves the item seen", async () => {
    const { clearFeedback, getFeedbackIds, setFeedback } =
      await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    await setFeedback(u, ids.a1!, "less", topicA);
    const cleared = await clearFeedback(u, ids.a1!);
    expect(cleared?.verdict).toBe("less");
    expect(await weightOf(u, topicA)).toBeCloseTo(1);
    // Cool back at 1 → the row is gone, not kept at 1.
    expect(await coolOf(u, topicA)).toBeUndefined();
    expect(await seen(u, ids.a1!)).toBe(true); // seen is seen
    expect(await getFeedbackIds(u)).toEqual({ more: [], less: [] });
  });

  it("clear of a 'more' that created the pick leaves the pick, at the 1.0 baseline", async () => {
    const { clearFeedback, setFeedback } = await import("./feedback");
    const { getUserTopicIds } = await import("./topics");
    const u = await freshUser();
    await setFeedback(u, ids.b1!, "more", topicB);
    await clearFeedback(u, ids.b1!);
    expect(await getUserTopicIds(u)).toEqual([topicB]);
    expect(await weightOf(u, topicB)).toBeCloseTo(1);
  });

  it("clear after the cap clipped a 'more' reverses only what was applied", async () => {
    const { clearFeedback, setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 2.9 });
    await setFeedback(u, ids.a1!, "more", topicA);
    await clearFeedback(u, ids.a1!);
    expect(await weightOf(u, topicA)).toBeCloseTo(2.9, 5);
  });

  it("clear after the floors clipped a 'less' reverses only the clipped amounts", async () => {
    const { clearFeedback, setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 0.5 });
    // Weight: 0.5 → 0.25 (applied −0.25), then 0.25 → 0.25 (applied 0). Cool: 0.6, 0.36,
    // 0.216, then 0.1296 clamped to 0.15 (applied 0.15 / 0.216, not 0.6).
    for (const name of ["a1", "a2", "a3", "a4"])
      await setFeedback(u, ids[name]!, "less", topicA);
    expect(await weightOf(u, topicA)).toBeCloseTo(WEIGHT_FLOOR);
    expect(await coolOf(u, topicA)).toBeCloseTo(COOL_FLOOR);

    await clearFeedback(u, ids.a4!);
    // Undoing the clipped fourth puts the cool back to the third's 0.216, not 0.15 / 0.6 = 0.25.
    expect(await coolOf(u, topicA)).toBeCloseTo(0.216, 4);
    // a2..a4 applied 0 to the weight (the floor had been reached by a1), so it holds at 0.25.
    expect(await weightOf(u, topicA)).toBeCloseTo(WEIGHT_FLOOR);

    await clearFeedback(u, ids.a3!);
    await clearFeedback(u, ids.a2!);
    await clearFeedback(u, ids.a1!);
    expect(await weightOf(u, topicA)).toBeCloseTo(0.5);
    expect(await coolOf(u, topicA)).toBeUndefined();
  });

  it("clear with nothing to clear is null", async () => {
    const { clearFeedback } = await import("./feedback");
    const u = await freshUser();
    expect(await clearFeedback(u, ids.a1!)).toBeNull();
  });

  it("clear never recreates a pick the reader has since dropped", async () => {
    const { db } = await import("./client");
    const { userTopic } = await import("./schema");
    const { clearFeedback, setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    await setFeedback(u, ids.a1!, "more", topicA);
    await db.delete(userTopic).where(eq(userTopic.userId, u)); // Profile → Topics: off
    await clearFeedback(u, ids.a1!);
    expect(await weightOf(u, topicA)).toBeUndefined();
  });

  it("getMoreItems is the 'more' shelf, newest first, as saved-item rows", async () => {
    const { getMoreItems, setFeedback } = await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    await setFeedback(u, ids.a1!, "more", topicA);
    await setFeedback(u, ids.a2!, "less", topicA);
    await setFeedback(u, ids.b1!, "more", topicB);
    const shelf = await getMoreItems(u);
    expect(shelf.map((r) => r.id)).toEqual([ids.b1!, ids.a1!]);
    expect(shelf[0]!.title).toBe("Feedback fixture b1");
  });

  it("warmTopic deletes the cool row and says whether there was one", async () => {
    const { setFeedback, warmTopic } = await import("./feedback");
    const u = await freshUser();
    await setFeedback(u, ids.b1!, "less", topicB);
    expect(await warmTopic(u, topicB)).toBe(true);
    expect(await coolOf(u, topicB)).toBeUndefined();
    expect(await warmTopic(u, topicB)).toBe(false);
  });

  it("clearUserCools (the retake) removes every cool for that user only", async () => {
    const { db } = await import("./client");
    const { clearUserCools, getUserTopicCools, setFeedback } =
      await import("./feedback");
    const u = await freshUser({ [topicA]: 1 });
    const other = await freshUser();
    await setFeedback(u, ids.a1!, "less", topicA);
    await setFeedback(u, ids.b1!, "less", topicB);
    await setFeedback(other, ids.b1!, "less", topicB);
    await db.transaction((tx) => clearUserCools(tx, u));
    expect((await getUserTopicCools(u)).size).toBe(0);
    expect(await coolOf(other, topicB)).toBeCloseTo(COOL_STEP);
    // The weights are the retake's own business (replaceUserTopicsTx), not this function's.
    expect(await weightOf(u, topicA)).toBeCloseTo(1 - LESS_STEP);
  });
});
