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
  /**
   * A per-run handle for the profile tests. `user.handle` is **globally** unique and this suite's
   * users are the only rows deleted afterwards — so a literal like "bentest" collides with any
   * leftover from a previous run (or from e2e/settings.spec.ts, which claims one of its own). Same
   * discipline as the ids above, adapted to the handle pattern: `^[a-z0-9_]{2,24}$` has no room for
   * nanoid's uppercase or `-`.
   */
  const testHandle = `t${nanoid(10)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "0")}`;
  const topicA = `test-router-topic-a-${nanoid(8)}`;
  const topicB = `test-router-topic-b-${nanoid(8)}`;
  let itemOneId: string;
  let itemTwoId: string;
  let itemThreeId: string;
  let itemFourId: string;
  /** The one *image* item in topicA — 5.10's collection-cover query only ever picks these. */
  let itemFiveId: string;

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
    const [itemOne, itemTwo, s3, s4, s5] = await db
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
        // Items three and four back the 6.1 describe below — both in topicA (so the afterAll
        // item sweep, which deletes by topicA, cleans them up for free), with overlapping
        // aesthetic tags so the taste-keyword derivation has a dedupe case to prove.
        {
          source: "wikipedia",
          sourceId: `test-router-item-3-${nanoid(8)}`,
          type: "article" as const,
          title: "Integration test item three",
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/test-router-item-3-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: ["etching", "botanical plate"],
        },
        {
          source: "wikipedia",
          sourceId: `test-router-item-4-${nanoid(8)}`,
          type: "article" as const,
          title: "Integration test item four",
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/test-router-item-4-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: ["botanical plate", "sepia"],
        },
        // Item five backs 5.10's collection-cover assertions: the only one here with an
        // `imageUrl`, and in topicA so the afterAll sweep cleans it up with the rest.
        {
          source: "met",
          sourceId: `test-router-item-5-${nanoid(8)}`,
          type: "image" as const,
          title: "Integration test item five",
          summary: "A summary long enough to be unremarkable.",
          imageUrl: "https://example.com/test-router-item-5.jpg",
          sourceUrl: `https://example.com/test-router-item-5-${nanoid(8)}`,
          topicId: topicA,
          curationScore: 7,
          aestheticTags: [],
        },
      ])
      .returning();
    itemOneId = itemOne!.id;
    itemTwoId = itemTwo!.id;
    itemThreeId = s3!.id;
    itemFourId = s4!.id;
    itemFiveId = s5!.id;
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
    await db.delete(userTopic).where(inArray(userTopic.userId, BOTH_USERS));
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

    // 5.10: what Settings' "What you see" row reads. Runs after the re-pick above, so the
    // expected answer is that re-pick's survivor — proving `mine` reflects the *current*
    // selection rather than everything ever picked.
    it("topics.mine returns exactly what the last setMine wrote", async () => {
      const caller = createCaller(authedContext(userId));
      expect(await caller.topics.mine()).toEqual([topicA]);

      await caller.topics.setMine({ topicIds: [topicA, topicB] });
      expect((await caller.topics.mine()).sort()).toEqual(
        [topicA, topicB].sort(),
      );
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
      expect(saved).toEqual({
        collectionName: "Articles",
        drift: { topicLabel: "Test router topic A", isNew: false },
      });

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

    it("saving an un-homed item records the save and reports no drift (Cut 1)", async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");
      // A walk post no topic fits: `topicId: null` is legal since Cut 1. Inserted here rather than
      // in beforeAll so the fixture's cleanup-by-topic never has to know about it.
      const [unhomed] = await db
        .insert(item)
        .values({
          source: "doorofperception",
          sourceId: `test-router-unhomed-${nanoid(8)}`,
          type: "image" as const,
          title: "Integration test un-homed item",
          summary: "A walk post that no current topic fits.",
          sourceUrl: "https://example.com/unhomed",
          imageUrl: "https://example.com/unhomed.jpg",
          topicId: null,
          curationScore: 8,
          aestheticTags: ["mural"],
        })
        .returning({ id: item.id });

      const caller = createCaller(authedContext(userId));
      const [, art] = await caller.saves.collections();
      const saved = await caller.saves.saveToCollection({
        itemId: unhomed!.id,
        collectionId: art!.id,
      });
      expect(saved).toEqual({ collectionName: "Art", drift: null });

      await caller.saves.unsave({ itemId: unhomed!.id });
      await db.delete(item).where(eq(item.id, unhomed!.id));
    });

    it("re-filing an item MOVES it rather than adding a second membership", async () => {
      const caller = createCaller(authedContext(userId));
      const collections = await caller.saves.collections();
      const art = collections.find((c) => c.name === "Art")!;

      const moved = await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: art.id,
      });
      expect(moved).toEqual({ collectionName: "Art", drift: null });

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

    // 5.9's chips display `collections()` counts but *filter to* `list({collectionId})` — two
    // different queries whose agreement nothing else enforces. This pins it: every count matches
    // its filtered list's length, and the All chip's number (`count()`) matches the unfiltered
    // list. Runs against whatever save state the tests above left behind, plus two fresh saves
    // spread across two collections so neither side of the arithmetic is trivially zero.
    it("5.9 — the chips' arithmetic: every collection count matches its filtered list, and All matches the unfiltered list", async () => {
      const caller = createCaller(authedContext(userId));
      const collections = await caller.saves.collections();
      const articles = collections.find((c) => c.name === "Articles")!;
      const art = collections.find((c) => c.name === "Art")!;

      await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: articles.id,
      });
      await caller.saves.saveToCollection({
        itemId: itemTwoId,
        collectionId: art.id,
      });

      for (const c of await caller.saves.collections()) {
        const filtered = await caller.saves.list({ collectionId: c.id });
        expect(filtered).toHaveLength(c.itemCount);
      }
      const everything = await caller.saves.list();
      expect(everything).toHaveLength(await caller.saves.count());
    });

    // ── 5.10 ────────────────────────────────────────────────────────────────────────────────────

    it("createCollection appends a new empty collection, and refuses a duplicate name", async () => {
      const caller = createCaller(authedContext(userId));

      const made = await caller.saves.createCollection({ name: "Maps" });
      expect(made.name).toBe("Maps");

      const all = await caller.saves.collections();
      // Ordered by `createdAt`, so a collection made now sorts after the three staggered defaults
      // — the whole reason `seedDefaultCollections` bothers to offset their timestamps.
      expect(all.map((c) => c.name)).toEqual([
        "Articles",
        "Art",
        "Photos",
        "Maps",
      ]);
      expect(all.find((c) => c.name === "Maps")?.itemCount).toBe(0);

      // Both flavours of duplicate hit the same `(user_id, name)` unique constraint: a name the
      // user made themselves, and one the seeding gave them.
      await expect(
        caller.saves.createCollection({ name: "Maps" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller.saves.createCollection({ name: "Articles" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("covers report the newest saved image per collection, and null when there is none", async () => {
      const caller = createCaller(authedContext(userId));
      const maps = (await caller.saves.collections()).find(
        (c) => c.name === "Maps",
      )!;

      // Two saves into one collection: the image item first, then an article. The cover has to
      // stay the image even though the article is the *newer* save — which is what the
      // `imageUrl IS NOT NULL` filter inside the DISTINCT ON buys, and what a plain
      // "newest save in this collection" query would get wrong.
      await caller.saves.saveToCollection({
        itemId: itemFiveId,
        collectionId: maps.id,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: maps.id,
      });

      const after = await caller.saves.collections();
      expect(after.find((c) => c.name === "Maps")?.cover).toBe(
        "https://example.com/test-router-item-5.jpg",
      );
      // Art holds itemTwo, an article — a collection with saves but no pictures still reports
      // null, and the Profile tile falls back to its bookmark placeholder.
      expect(after.find((c) => c.name === "Art")?.cover).toBeNull();
      // And an empty collection, likewise.
      expect(after.find((c) => c.name === "Photos")?.cover).toBeNull();
    });
  });

  // Phase 5.10 — the profile row behind `/profile`, `/profile/edit` and `/settings`. The whole
  // reason this router exists is that `ctx.user` can't answer these questions (Better Auth only
  // returns the columns it declares), so every assertion here is deliberately a real round trip
  // to Postgres rather than anything the mocked-context unit tests could fake.
  describe("5.10 — user.me + user.updateProfile", () => {
    it("me returns the row, with both new columns null on a user who has never edited", async () => {
      const caller = createCaller(authedContext(userId));
      expect(await caller.user.me()).toEqual({
        id: userId,
        name: "Test router user",
        email: `${userId}@example.com`,
        handle: null,
        bio: null,
      });
    });

    it("updateProfile round-trips, storing a mixed-case handle lowercased", async () => {
      const caller = createCaller(authedContext(userId));

      const saved = await caller.user.updateProfile({
        name: "Ben R",
        handle: testHandle.toUpperCase(),
        bio: "  Curious about maps.  ",
      });
      expect(saved).toMatchObject({
        name: "Ben R",
        handle: testHandle,
        // `.trim()` runs in the zod schema, so what lands in the column is already tidy.
        bio: "Curious about maps.",
      });
      // And it is genuinely in the table, not just in the mutation's return value.
      expect(await caller.user.me()).toMatchObject({
        name: "Ben R",
        handle: testHandle,
      });
    });

    it("a handle held by someone else is a CONFLICT, but re-saving your own is fine", async () => {
      const mine = createCaller(authedContext(userId));
      const theirs = createCaller(authedContext(otherUserId));

      await expect(
        theirs.user.updateProfile({
          // Different case again — the lowercasing is what makes the constraint uncheatable.
          handle: testHandle.toUpperCase(),
          name: "Test router other user",
          bio: null,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      // The `excludeUserId` half of `isHandleTaken`: without it, every save of an unchanged
      // profile would report the user's own handle as taken.
      await expect(
        mine.user.updateProfile({
          name: "Ben R",
          handle: testHandle,
          bio: null,
        }),
      ).resolves.toMatchObject({ handle: testHandle });
    });

    it("a null handle clears the column, freeing it for someone else", async () => {
      const mine = createCaller(authedContext(userId));
      const theirs = createCaller(authedContext(otherUserId));

      await mine.user.updateProfile({ name: "Ben R", handle: null, bio: null });
      expect(await mine.user.me()).toMatchObject({ handle: null, bio: null });

      // Postgres treats NULLs as distinct, so the name is genuinely free now.
      await expect(
        theirs.user.updateProfile({
          name: "Test router other user",
          handle: testHandle,
          bio: null,
        }),
      ).resolves.toMatchObject({ handle: testHandle });
    });
  });

  // Phase 6.1: a *new* save bumps the saved item's topic weight (and creates the row when the
  // user never picked that topic). Driven as `otherUserId` deliberately — they have no
  // `user_topic` rows at all, so the row-creation path is what's exercised, and the topics-block
  // fixture that hand-sets `userId`'s topicA weight to 7.0 can't contaminate the arithmetic.
  // Weight assertions use toBeCloseTo throughout: the column is `real` (float4).
  describe("6.1 — a save teaches the feed", () => {
    it("a first save creates the topic row at default + bump and reports it as new", async () => {
      const caller = createCaller(authedContext(otherUserId));
      const { getUserTopicWeights } = await import("~/server/db/topics");
      const [articles] = await caller.saves.collections();

      const saved = await caller.saves.saveToCollection({
        itemId: itemThreeId,
        collectionId: articles!.id,
      });
      expect(saved.drift).toEqual({
        topicLabel: "Test router topic A",
        isNew: true,
      });

      const weights = await getUserTopicWeights(otherUserId);
      expect(weights.get(topicA)).toBeCloseTo(1.5);
    });

    it("moving a saved item to another collection does not re-bump", async () => {
      const caller = createCaller(authedContext(otherUserId));
      const { getUserTopicWeights } = await import("~/server/db/topics");
      const collections = await caller.saves.collections();
      const art = collections.find((c) => c.name === "Art")!;

      const moved = await caller.saves.saveToCollection({
        itemId: itemThreeId,
        collectionId: art.id,
      });
      expect(moved).toEqual({ collectionName: "Art", drift: null });

      const weights = await getUserTopicWeights(otherUserId);
      expect(weights.get(topicA)).toBeCloseTo(1.5);
    });

    it("repeated saves cap the weight at 3.0", async () => {
      // Direct db-fn calls (established precedent in this file) — driving this through the
      // router would need a fresh fixture item per bump, since only *new* saves bump.
      const { bumpTopicWeight, getUserTopicWeights } =
        await import("~/server/db/topics");

      const second = await bumpTopicWeight(otherUserId, topicA);
      expect(second.isNew).toBe(false);
      expect(second.weight).toBeCloseTo(2.0);

      const third = await bumpTopicWeight(otherUserId, topicA);
      expect(third.weight).toBeCloseTo(2.5);

      const fourth = await bumpTopicWeight(otherUserId, topicA);
      expect(fourth.weight).toBeCloseTo(3.0);

      // At the cap: a further bump must stay clamped, not creep past it.
      const fifth = await bumpTopicWeight(otherUserId, topicA);
      expect(fifth.isNew).toBe(false);
      expect(fifth.weight).toBeCloseTo(3.0);

      const weights = await getUserTopicWeights(otherUserId);
      expect(weights.get(topicA)).toBeCloseTo(3.0);
    });

    it("taste keywords derive from the most recent saves, deduped in recency order", async () => {
      const caller = createCaller(authedContext(otherUserId));
      const { getTasteKeywords } = await import("~/server/db/saves");
      const [articles] = await caller.saves.collections();

      // itemThree ("etching", "botanical plate") is already saved from the tests above; a short
      // delay before saving itemFour so the two saved_at timestamps are unambiguously ordered
      // (same precedent as the saves.list test).
      await new Promise((resolve) => setTimeout(resolve, 5));
      await caller.saves.saveToCollection({
        itemId: itemFourId,
        collectionId: articles!.id,
      });

      // Most-recent save first (itemFour), each item's stored tag order preserved, and
      // "botanical plate" — present on both — kept only at its first-seen (most recent) slot.
      expect(await getTasteKeywords(otherUserId)).toEqual([
        "botanical plate",
        "sepia",
        "etching",
      ]);
    });

    it("unsave leaves the learned weight untouched", async () => {
      const caller = createCaller(authedContext(otherUserId));
      const { getUserTopicWeights } = await import("~/server/db/topics");

      await caller.saves.unsave({ itemId: itemThreeId });

      // Weights record demonstrated interest; unsave is collection housekeeping, not a
      // retraction (locked 6.1 decision — no decrement).
      const weights = await getUserTopicWeights(otherUserId);
      expect(weights.get(topicA)).toBeCloseTo(3.0);
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

  describe("items.wanderNext", () => {
    // The fixture topic has no row in the checked-in topic graph, so every pick lands on the
    // own-topic fallback — which is exactly the shape the e2e corpus has, and the reason that
    // fallback exists.
    it("offers real neighbours to an anonymous caller, never the item itself", async () => {
      const rows = await createCaller(anonContext()).items.wanderNext({
        itemId: itemOneId,
      });

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(3);
      for (const row of rows) {
        expect(row.id).not.toBe(itemOneId);
        expect(Object.keys(row).sort()).toEqual(["id", "reason", "title"]);
      }
    });

    it("returns an empty teaser for an unknown item rather than throwing", async () => {
      const rows = await createCaller(anonContext()).items.wanderNext({
        itemId: "definitely-not-a-real-item",
      });
      expect(rows).toEqual([]);
    });
  });

  describe("items.galleryRail", () => {
    // Images of its own: the two shared fixture items are articles, and the rail is images-only by
    // construction. They live in `topicA` so the outer afterAll's topic-scoped delete sweeps them
    // up with everything else.
    let plateOneId: string;
    let plateTwoId: string;

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");
      const [one, two] = await db
        .insert(item)
        .values(
          [1, 2].map((n) => ({
            source: "met",
            sourceId: `test-router-plate-${n}-${nanoid(8)}`,
            type: "image" as const,
            title: `Integration test plate ${n}`,
            summary: "A caption long enough to be unremarkable.",
            imageUrl: `https://example.com/test-router-plate-${n}.jpg`,
            sourceUrl: `https://example.com/test-router-plate-${n}-${nanoid(8)}`,
            topicId: topicA,
            curationScore: 9,
            aestheticTags: [],
          })),
        )
        .returning();
      plateOneId = one!.id;
      plateTwoId = two!.id;
    });

    it("serves an anonymous caller image rows only, never the anchor", async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");

      const rail = await createCaller(anonContext()).items.galleryRail({
        itemId: plateOneId,
      });

      expect(rail.length).toBeGreaterThan(0);
      expect(rail.map((r) => r.id)).not.toContain(plateOneId);

      // Asserted against the rows themselves rather than trusted from the wire shape: `type` is
      // deliberately not part of `RailItem`, so the only honest check is to look them back up.
      const drawn = await db
        .select({ id: item.id, type: item.type })
        .from(item)
        .where(
          inArray(
            item.id,
            rail.map((r) => r.id),
          ),
        );
      expect(drawn.length).toBe(rail.length);
      expect(drawn.every((row) => row.type === "image")).toBe(true);
    });

    it("respects `exclude` and caps the batch at `count`", async () => {
      const rail = await createCaller(anonContext()).items.galleryRail({
        itemId: plateOneId,
        count: 3,
        exclude: [plateTwoId],
      });

      expect(rail.length).toBeLessThanOrEqual(3);
      expect(rail.map((r) => r.id)).not.toContain(plateTwoId);
    });

    // The sentence the whole rail design turns on (decision 1, and the 08-20-26 corpus-burn
    // postmortem): swiping the gallery is free. There is no user on this path at all, so *any*
    // new row here would be a bug, not merely a mis-attributed one — hence the unscoped count.
    it("writes no seen_item rows at all", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const countRows = async () =>
        (await db.select({ itemId: seenItem.itemId }).from(seenItem)).length;

      const before = await countRows();
      await createCaller(anonContext()).items.galleryRail({
        itemId: plateOneId,
        count: 8,
      });
      expect(await countRows()).toBe(before);
    });

    it("returns an empty rail for an unknown anchor rather than throwing", async () => {
      const rail = await createCaller(anonContext()).items.galleryRail({
        itemId: "definitely-not-a-real-item",
      });
      expect(rail).toEqual([]);
    });
  });

  describe("saves.forItem", () => {
    it("round-trips across save and unsave", async () => {
      const caller = createCaller(authedContext(userId));
      const [articles] = await caller.saves.collections();

      await caller.saves.unsave({ itemId: itemTwoId });
      expect(await caller.saves.forItem({ itemId: itemTwoId })).toEqual({
        saved: false,
        collectionId: null,
      });

      await caller.saves.saveToCollection({
        itemId: itemTwoId,
        collectionId: articles!.id,
      });
      expect(await caller.saves.forItem({ itemId: itemTwoId })).toEqual({
        saved: true,
        collectionId: articles!.id,
      });

      await caller.saves.unsave({ itemId: itemTwoId });
      expect(await caller.saves.forItem({ itemId: itemTwoId })).toEqual({
        saved: false,
        collectionId: null,
      });
    });

    it("is scoped to the caller — another user's save is invisible", async () => {
      const caller = createCaller(authedContext(userId));
      const [articles] = await caller.saves.collections();
      await caller.saves.saveToCollection({
        itemId: itemOneId,
        collectionId: articles!.id,
      });

      const other = createCaller(authedContext(otherUserId));
      expect(await other.saves.forItem({ itemId: itemOneId })).toEqual({
        saved: false,
        collectionId: null,
      });

      await caller.saves.unsave({ itemId: itemOneId });
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
  // **Phase 7.2, T5/D8 — the authorization boundary, proven with two real users.**
  //
  // SPEC §11's line is "all user-scoped queries filter by `userId`". Every router does it by
  // pulling `ctx.user.id` straight through to a repo call, and reading the code is how that has
  // been checked until now. This describe checks it the other way round: give two users a real
  // database, have one of them do things, and assert the other sees none of it. A repo function
  // that ever forgot its `userId` predicate would fail here rather than in production.
  //
  // Runs last on purpose — it reads the save/topic state the describes above built, and only adds
  // to it. `otherUserId` (B below) is the same second user 5.5's cross-collection test introduced.
  describe("7.2 — user isolation", () => {
    it("a save by A is invisible to B, and B cannot unsave it", async () => {
      const a = createCaller(authedContext(userId));
      const b = createCaller(authedContext(otherUserId));

      // B is **not** a blank slate by the time this runs — the 6.1 describe above drives its
      // saves and topic weights as B. So every assertion here is against B's own state *before*
      // A acts, which is the honest form of the question anyway: did anything A did move?
      const bCountBefore = await b.saves.count();

      const [aArticles] = await a.saves.collections();
      await a.saves.saveToCollection({
        itemId: itemThreeId,
        collectionId: aArticles!.id,
      });

      const bList = await b.saves.list();
      expect(bList.map((i) => i.id)).not.toContain(itemThreeId);
      expect(await b.saves.count()).toBe(bCountBefore);
      expect(await b.saves.forItem({ itemId: itemThreeId })).toMatchObject({
        saved: false,
      });

      // `unsave` is a delete scoped by `(userId, itemId)`, so B's attempt is a silent no-op rather
      // than an error — the assertion that matters is the one after it.
      await b.saves.unsave({ itemId: itemThreeId });
      const aList = await a.saves.list();
      expect(aList.map((i) => i.id)).toContain(itemThreeId);
    });

    it("A's topic selection leaves B's empty", async () => {
      const a = createCaller(authedContext(userId));
      const b = createCaller(authedContext(otherUserId));

      // Same reason as above: B already has topicA, from the 6.1 saves that bumped its weight.
      const bTopicsBefore = await b.topics.mine();

      await a.topics.setMine({ topicIds: [topicA, topicB] });

      expect(await a.topics.mine()).toEqual(
        expect.arrayContaining([topicA, topicB]),
      );
      // B never picked topicB, and A picking it must not put it there.
      expect(await b.topics.mine()).toEqual(bTopicsBefore);
      expect(await b.topics.mine()).not.toContain(topicB);
    });

    it("user.me answers with the caller's own row and nothing of A's", async () => {
      const a = createCaller(authedContext(userId));
      const b = createCaller(authedContext(otherUserId));

      const aMe = await a.user.me();
      const bMe = await b.user.me();

      expect(bMe.id).toBe(otherUserId);
      expect(bMe.email).toBe(`${otherUserId}@example.com`);
      expect(bMe.id).not.toBe(aMe.id);
      expect(bMe.email).not.toBe(aMe.email);
      // A set a handle in the 5.10 describe above; B never did, so this also proves the profile
      // read is not falling back to "some user row".
      expect(bMe.name).toBe("Test router other user");
      expect(bMe.handle).not.toBe(aMe.handle);
    });

    // **Seen-ness is per reader.** `seen_item` is the one table that decides what the feed is
    // *allowed* to show, so a missing `userId` filter there would be the worst of these bugs: one
    // reader's browsing would silently burn everyone else's corpus. Seeded directly rather than by
    // paging A's feed, so the assertion is about exactly one row.
    it("A's seen rows do not exclude anything from B's pools", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const { getTopicPools } = await import("~/server/db/feed");

      await db
        .insert(seenItem)
        .values({ userId, itemId: itemFourId, servedAt: new Date() })
        .onConflictDoNothing();

      const opts = {
        anchor: new Date(),
        scoreFloor: 4,
        excludeIds: [] as string[],
      };
      const aPools = await getTopicPools([topicA], { ...opts, userId });
      const bPools = await getTopicPools([topicA], {
        ...opts,
        userId: otherUserId,
      });

      expect(aPools.get(topicA)!.map((i) => i.id)).not.toContain(itemFourId);
      expect(bPools.get(topicA)!.map((i) => i.id)).toContain(itemFourId);
    });
  });
});
