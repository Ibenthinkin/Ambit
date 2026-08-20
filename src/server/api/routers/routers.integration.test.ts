// Integration tests for the SPEC §7 tRPC surface against a real Postgres — the parts
// routers.test.ts's mocked-ctx unit tests can't reach: real DB round trips through
// `topics.setMine`/`saves.*`/`feed.page`, called through `createCaller` exactly
// the way a real request would (contexts are hand-built rather than produced by
// `createTRPCContext`, since standing up a real Better Auth session cookie isn't this file's job —
// that's the manual curl verification in docs/PHASE4_WALKTHROUGH_4.2.md). Self-skips whenever
// DATABASE_URL isn't set (same pattern as db/items.integration.test.ts and
// services/feed.integration.test.ts); run locally with `docker compose up -d` then `bun run test`.
import { and, eq, inArray } from "drizzle-orm";
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
  // A second, unrelated user — exists solely so the `saveToCollection` authorization test has a
  // real collection id belonging to someone else to attack with (Phase 5.5).
  const otherUserId = `test-router-other-${nanoid(8)}`;
  const BOTH_USERS = [userId, otherUserId];
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
    await db.insert(user).values([
      {
        id: userId,
        name: "Test router user",
        email: `${userId}@example.com`,
        emailVerified: false,
      },
      {
        id: otherUserId,
        name: "Test router other user",
        email: `${otherUserId}@example.com`,
        emailVerified: false,
      },
    ]);
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
    const { collection, item, savedItem, seenItem, topic, user, userTopic } =
      await import("~/server/db/schema");
    // FK-safe order: rows that reference item/topic/user/collection go first. `saved_item` before
    // `collection` specifically — its `collection_id` FK is ON DELETE SET NULL, so the delete
    // would succeed either way, but doing it in dependency order keeps this readable as the
    // graph it is.
    await db.delete(savedItem).where(inArray(savedItem.userId, BOTH_USERS));
    await db.delete(seenItem).where(eq(seenItem.userId, userId));
    await db.delete(userTopic).where(eq(userTopic.userId, userId));
    await db.delete(collection).where(inArray(collection.userId, BOTH_USERS));
    await db.delete(item).where(and(eq(item.topicId, topicA)));
    await db.delete(user).where(inArray(user.id, BOTH_USERS));
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

    it("hasCompletedOnboarding is false before any topics are picked", async () => {
      const { hasCompletedOnboarding } = await import("~/server/db/topics");
      expect(await hasCompletedOnboarding(userId)).toBe(false);
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

    it("hasCompletedOnboarding is true once a setMine has landed", async () => {
      const { hasCompletedOnboarding } = await import("~/server/db/topics");
      expect(await hasCompletedOnboarding(userId)).toBe(true);
    });
  });

  describe("saves.collections + saveToCollection + list + unsave", () => {
    it("seeds the three default collections on first read, idempotently", async () => {
      const caller = createCaller(authedContext(userId));

      const first = await caller.saves.collections();
      expect(first.map((c) => c.name)).toEqual(["Articles", "Art", "Photos"]);
      expect(first.every((c) => c.itemCount === 0)).toBe(true);

      // Second call must not seed again — the whole point of the (user_id, name) unique
      // constraint plus onConflictDoNothing.
      const second = await caller.saves.collections();
      expect(second.map((c) => c.id)).toEqual(first.map((c) => c.id));
    });

    it("saves into a collection, lists most-recent-first, and counts", async () => {
      const caller = createCaller(authedContext(userId));
      const [articles] = await caller.saves.collections();

      const saved = await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: articles!.id,
      });
      expect(saved).toEqual({ collectionName: "Articles" });

      // A short delay so the two `saved_at` timestamps are unambiguously ordered — real distinct
      // user actions are never sub-millisecond apart in practice, but a test can be.
      await new Promise((resolve) => setTimeout(resolve, 5));

      await caller.saves.saveToCollection({
        itemId: itemTwoId,
        collectionId: articles!.id,
      });

      const list = await caller.saves.list();
      expect(list.map((i) => i.id)).toEqual([itemTwoId, itemOneId]); // most-recent first
      expect(await caller.saves.count()).toBe(2);

      const withCounts = await caller.saves.collections();
      expect(withCounts.find((c) => c.name === "Articles")?.itemCount).toBe(2);
      // An empty collection must still report 0 rather than dropping out of the result — the
      // LEFT JOIN in getCollections is what guarantees that.
      expect(withCounts.find((c) => c.name === "Art")?.itemCount).toBe(0);
    });

    it("re-filing an item MOVES it rather than adding a second membership", async () => {
      const caller = createCaller(authedContext(userId));
      const collections = await caller.saves.collections();
      const art = collections.find((c) => c.name === "Art")!;

      const moved = await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: art.id,
      });
      expect(moved).toEqual({ collectionName: "Art" });

      // The one-collection-per-item rule (SPEC §5.4): still exactly two saves overall, and the
      // item now counts against Art instead of Articles.
      expect(await caller.saves.count()).toBe(2);
      const after = await caller.saves.collections();
      expect(after.find((c) => c.name === "Articles")?.itemCount).toBe(1);
      expect(after.find((c) => c.name === "Art")?.itemCount).toBe(1);

      // And the filtered list reflects the move.
      const inArt = await caller.saves.list({ collectionId: art.id });
      expect(inArt.map((i) => i.id)).toEqual([itemOneId]);
    });

    it("unsave removes the item from the list and the count", async () => {
      const caller = createCaller(authedContext(userId));
      expect(await caller.saves.unsave({ itemId: itemOneId })).toEqual({
        saved: false,
      });
      const list = await caller.saves.list();
      expect(list.map((i) => i.id)).toEqual([itemTwoId]);
      expect(await caller.saves.count()).toBe(1);
    });

    it("throws NOT_FOUND when saving an item that doesn't exist", async () => {
      const caller = createCaller(authedContext(userId));
      const [articles] = await caller.saves.collections();
      await expect(
        caller.saves.saveToCollection({
          itemId: "definitely-not-a-real-item",
          collectionId: articles!.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    // The phase's most important test: `collectionId` is the only client-supplied id in the API
    // that points at a *user-owned* row, so this is the only place an authorization check can be
    // missed. NOT_FOUND rather than FORBIDDEN is deliberate — a probe must not be able to tell a
    // real collection id from a fake one.
    it("throws NOT_FOUND when saving into another user's collection", async () => {
      const otherCaller = createCaller(authedContext(otherUserId));
      const otherCollections = await otherCaller.saves.collections();
      const theirs = otherCollections[0]!;

      const caller = createCaller(authedContext(userId));
      await expect(
        caller.saves.saveToCollection({
          itemId: itemTwoId,
          collectionId: theirs.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // And nothing leaked into their collection.
      expect(await otherCaller.saves.count()).toBe(0);
    });

    it("throws NOT_FOUND for a collection id that doesn't exist at all", async () => {
      const caller = createCaller(authedContext(userId));
      await expect(
        caller.saves.saveToCollection({
          itemId: itemTwoId,
          collectionId: "definitely-not-a-real-collection",
        }),
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

    /** How many items this fixture user has been marked as having seen. */
    const seenCount = async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const rows = await db
        .select({ itemId: seenItem.itemId })
        .from(seenItem)
        .where(eq(seenItem.userId, feedUserId));
      return rows.length;
    };

    // The 5.7 boundary, asserted from the outside: asking for a page costs the reader nothing.
    // Only the ack does. Through 5.6 this call inserted a full page of `seen_item` rows, which is
    // how a prefetch or a back-pop re-render could quietly spend someone's corpus.
    it("feed.page composes without writing a single seen_item row", async () => {
      const caller = createCaller(authedContext(feedUserId));
      const before = await seenCount();

      const page = await caller.feed.page({});

      expect(page.cards.length).toBeGreaterThan(0);
      expect(await seenCount()).toBe(before);
    });

    it("feed.markSeen writes rows that read back, and rejects an unauthed ack", async () => {
      await expect(
        createCaller(anonContext()).feed.markSeen({ itemIds: ["whatever"] }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      const caller = createCaller(authedContext(feedUserId));
      const page = await caller.feed.page({});
      const ids = page.cards.map((c) => c.item.id);
      const before = await seenCount();

      expect(await caller.feed.markSeen({ itemIds: ids })).toEqual({
        ok: true,
      });

      expect(await seenCount()).toBe(before + ids.length);
      // And re-acking is a no-op rather than an error — a remount replaying cached pages does
      // exactly this (`onConflictDoNothing`).
      await caller.feed.markSeen({ itemIds: ids });
      expect(await seenCount()).toBe(before + ids.length);
    });

    it("page 1 -> ack -> page 2 returns disjoint cards, and an unauthed call is rejected", async () => {
      await expect(
        createCaller(anonContext()).feed.page({}),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      const caller = createCaller(authedContext(feedUserId));
      const page1 = await caller.feed.page({});
      expect(page1.cards.length).toBeGreaterThan(0);
      expect(page1.nextCursor).toBeDefined();

      // The client's half of the contract. Without it page 2 is free to repeat page 1 — correct
      // behavior for an unacknowledged page, and not what this test is about.
      await caller.feed.markSeen({
        itemIds: page1.cards.map((c) => c.item.id),
      });

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
