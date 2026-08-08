// Integration tests for the SPEC §7 tRPC surface against a real Postgres — the parts
// routers.test.ts's mocked-ctx unit tests can't reach: real DB round trips through
// `topics.setMine`/`saves.toggle`/`saves.list`/`feed.page`, called through `createCaller` exactly
// the way a real request would (contexts are hand-built rather than produced by
// `createTRPCContext`, since standing up a real Better Auth session cookie isn't this file's job —
// that's the manual curl verification in docs/PHASE4_WALKTHROUGH_4.2.md). Self-skips whenever
// DATABASE_URL isn't set (same pattern as db/items.integration.test.ts and
// services/feed.integration.test.ts); run locally with `docker compose up -d` then `bun run test`.
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import type { Context } from "~/server/api/trpc";

/** A well-formed anonymous context — no session cookie at all. */
function anonContext(): Context {
  return { headers: new Headers(), session: null, user: null };
}

/** A well-formed authenticated context for a given (already-inserted) user id. */
function authedContext(userId: string): Context {
  const now = new Date();
  return {
    headers: new Headers(),
    session: {
      id: `test-session-${userId}`,
      token: `test-token-${userId}`,
      userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Test router user",
      email: `${userId}@example.com`,
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe.skipIf(!process.env.DATABASE_URL)("tRPC routers (integration)", () => {
  const userId = `test-router-user-${nanoid(8)}`;
  const topicA = `test-router-topic-a-${nanoid(8)}`;
  const topicB = `test-router-topic-b-${nanoid(8)}`;
  let itemOneId: string;
  let itemTwoId: string;

  beforeAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, topic, user } = await import("~/server/db/schema");

    await db.insert(topic).values([
      {
        id: topicA,
        label: "Test router topic A",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      },
      {
        id: topicB,
        label: "Test router topic B",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      },
    ]);
    await db.insert(user).values({
      id: userId,
      name: "Test router user",
      email: `${userId}@example.com`,
      emailVerified: false,
    });
    const [itemOne, itemTwo] = await db
      .insert(item)
      .values([
        {
          source: "wikipedia",
          sourceId: `test-router-item-1-${nanoid(8)}`,
          type: "article" as const,
          title: "Integration test item one",
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/test-router-item-1-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: [],
        },
        {
          source: "wikipedia",
          sourceId: `test-router-item-2-${nanoid(8)}`,
          type: "article" as const,
          title: "Integration test item two",
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/test-router-item-2-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: [],
        },
      ])
      .returning();
    itemOneId = itemOne!.id;
    itemTwoId = itemTwo!.id;
  });

  afterAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, savedItem, seenItem, topic, user, userTopic } =
      await import("~/server/db/schema");
    // FK-safe order: rows that reference item/topic/user go first.
    await db.delete(savedItem).where(eq(savedItem.userId, userId));
    await db.delete(seenItem).where(eq(seenItem.userId, userId));
    await db.delete(userTopic).where(eq(userTopic.userId, userId));
    await db.delete(item).where(and(eq(item.topicId, topicA)));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(topic).where(eq(topic.id, topicA));
    await db.delete(topic).where(eq(topic.id, topicB));
  });

  describe("topics.list + topics.setMine round trip", () => {
    it("list includes the fixture topics", async () => {
      const caller = createCaller(authedContext(userId));
      const all = await caller.topics.list();
      expect(all.map((t) => t.id)).toEqual(
        expect.arrayContaining([topicA, topicB]),
      );
    });

    it("rejects an unknown topic id with BAD_REQUEST", async () => {
      const caller = createCaller(authedContext(userId));
      await expect(
        caller.topics.setMine({ topicIds: ["definitely-not-a-real-topic"] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("set, re-set with overlap: a retained topic keeps its hand-bumped weight, a dropped one is gone", async () => {
      const caller = createCaller(authedContext(userId));
      const { db } = await import("~/server/db/client");
      const { userTopic } = await import("~/server/db/schema");

      // First pick: both topics, default weight 1.
      await caller.topics.setMine({ topicIds: [topicA, topicB] });
      const afterFirst = await db
        .select()
        .from(userTopic)
        .where(eq(userTopic.userId, userId));
      expect(afterFirst.map((r) => r.topicId).sort()).toEqual(
        [topicA, topicB].sort(),
      );
      expect(afterFirst.every((r) => r.weight === 1)).toBe(true);

      // Simulate the feed having learned a preference for topicA (SPEC §9: saving nudges weight).
      await db
        .update(userTopic)
        .set({ weight: 7 })
        .where(
          and(eq(userTopic.userId, userId), eq(userTopic.topicId, topicA)),
        );

      // Re-pick, keeping only topicA — topicB's row should be gone, topicA's learned weight
      // should survive untouched (not reset to the default 1).
      await caller.topics.setMine({ topicIds: [topicA] });
      const afterSecond = await db
        .select()
        .from(userTopic)
        .where(eq(userTopic.userId, userId));

      expect(afterSecond).toHaveLength(1);
      expect(afterSecond[0]!.topicId).toBe(topicA);
      expect(afterSecond[0]!.weight).toBe(7);
    });
  });

  describe("saves.toggle + saves.list", () => {
    it("toggles on, toggles a second item on, lists most-recent-first, toggles the first off", async () => {
      const caller = createCaller(authedContext(userId));

      const first = await caller.saves.toggle({ itemId: itemOneId });
      expect(first).toEqual({ saved: true });

      // A short delay so the two `saved_at` timestamps are unambiguously ordered — real distinct
      // user actions are never sub-millisecond apart in practice, but a test can be.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const second = await caller.saves.toggle({ itemId: itemTwoId });
      expect(second).toEqual({ saved: true });

      const listAfterBothSaved = await caller.saves.list();
      expect(listAfterBothSaved.map((i) => i.id)).toEqual([
        itemTwoId,
        itemOneId,
      ]); // most-recently-saved first

      const third = await caller.saves.toggle({ itemId: itemOneId });
      expect(third).toEqual({ saved: false }); // toggled back off

      const listAfterUnsave = await caller.saves.list();
      expect(listAfterUnsave.map((i) => i.id)).toEqual([itemTwoId]);
    });

    it("throws NOT_FOUND when saving an item that doesn't exist", async () => {
      const caller = createCaller(authedContext(userId));
      await expect(
        caller.saves.toggle({ itemId: "definitely-not-a-real-item" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("items.byId", () => {
    it("is public: an anonymous caller can fetch a real item", async () => {
      const caller = createCaller(anonContext());
      const found = await caller.items.byId({ id: itemOneId });
      expect(found.id).toBe(itemOneId);
    });

    it("throws NOT_FOUND for an unknown id, even anonymously", async () => {
      const caller = createCaller(anonContext());
      await expect(
        caller.items.byId({ id: "definitely-not-a-real-item" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("feed.page end-to-end", () => {
    const feedUserId = `test-router-feed-user-${nanoid(8)}`;
    const feedTopicId = `test-router-feed-topic-${nanoid(8)}`;
    const ITEM_COUNT = 10;

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user, userTopic } =
        await import("~/server/db/schema");

      await db.insert(topic).values({
        id: feedTopicId,
        label: "Test router feed topic",
        seedQueries: {
          wikipedia: [],
          met: [],
          aic: [],
          cma: [],
          wellcome: [],
        },
      });
      await db.insert(user).values({
        id: feedUserId,
        name: "Test router feed user",
        email: `${feedUserId}@example.com`,
        emailVerified: false,
      });
      await db
        .insert(userTopic)
        .values({ userId: feedUserId, topicId: feedTopicId, weight: 1 });
      await db.insert(item).values(
        Array.from({ length: ITEM_COUNT }, (_, i) => ({
          source: i % 2 === 0 ? "wikipedia" : "met",
          sourceId: `test-router-feed-item-${i}-${nanoid(8)}`,
          type: "article" as const,
          title: `Integration test feed item ${i}`,
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/test-router-feed-item-${i}-${nanoid(8)}`,
          topicId: feedTopicId,
          curationScore: 5 + (i % 5),
          aestheticTags: [],
        })),
      );
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, seenItem, topic, user, userTopic } =
        await import("~/server/db/schema");
      await db.delete(seenItem).where(eq(seenItem.userId, feedUserId));
      await db.delete(userTopic).where(eq(userTopic.userId, feedUserId));
      await db.delete(item).where(eq(item.topicId, feedTopicId));
      await db.delete(user).where(eq(user.id, feedUserId));
      await db.delete(topic).where(eq(topic.id, feedTopicId));
    });

    it("page 1 -> cursor -> page 2 returns disjoint cards, and an unauthed call is rejected", async () => {
      await expect(
        createCaller(anonContext()).feed.page({}),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      const caller = createCaller(authedContext(feedUserId));
      const page1 = await caller.feed.page({});
      expect(page1.cards.length).toBeGreaterThan(0);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await caller.feed.page({ cursor: page1.nextCursor });
      const page1Ids = new Set(page1.cards.map((c) => c.item.id));
      for (const card of page2.cards) {
        expect(page1Ids.has(card.item.id)).toBe(false);
      }
    });

    it("rejects a malformed cursor with BAD_REQUEST", async () => {
      const caller = createCaller(authedContext(feedUserId));
      await expect(
        caller.feed.page({ cursor: "not-a-real-cursor" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });
});
