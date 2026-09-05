// Integration tests for the suspended-source filter against a real Postgres, across **both** draw
// paths — `getTopicPools` (the feed) and `drawFromTopic` (the wander teaser and probe-feed). The
// filter is a SQL clause, so a fixture-mocked test would only be checking that a mock was called;
// the thing worth pinning is that a suspended source's rows genuinely cannot come back.
//
// `SUSPENDED_SOURCES` is empty as of 5.7 (aic came back with the image proxy), so the loops below
// currently assert nothing. That is the point: the day a source is switched off again, this is
// what fails if one of the two draw paths forgot to filter — which is exactly the half-suspended
// state suspended-sources.ts's header warns about.
//
// Self-skips whenever DATABASE_URL isn't set (same pattern as db/items.integration.test.ts); run
// locally with `docker compose up -d` then `bun run test`.
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SUSPENDED_SOURCES } from "~/server/config/suspended-sources";
import { forgetSeenSince, getTopicPools } from "./feed";
import { drawFromTopic } from "./items";

describe.skipIf(!process.env.DATABASE_URL)(
  "suspended-source filtering (integration)",
  () => {
    const topicId = `test-pools-topic-${nanoid(8)}`;
    const userId = `test-pools-user-${nanoid(8)}`;
    const sourceIdPrefix = `test-pools-${nanoid(8)}-`;

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");

      await db.insert(topic).values({
        id: topicId,
        label: "Test pools topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      });
      await db.insert(user).values({
        id: userId,
        name: "Test pools user",
        email: `test-pools-${nanoid(8)}@example.com`,
        emailVerified: false,
      });

      // One row per suspended source plus a live one, all otherwise identical and all comfortably
      // above any score floor — so anything missing from the pool is missing because of the source
      // filter and nothing else.
      await db.insert(item).values(
        ["met", "doorofperception", ...SUSPENDED_SOURCES].map((source, i) => ({
          source,
          sourceId: `${sourceIdPrefix}${i}`,
          type: "image" as const,
          title: `Pool item from ${source}`,
          sourceUrl: `https://example.com/${sourceIdPrefix}${i}`,
          imageUrl: `https://example.com/${sourceIdPrefix}${i}.jpg`,
          topicId,
          curationScore: 9,
          aestheticTags: [],
        })),
      );
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      const rows = await db.query.item.findMany({
        where: (t, { eq }) => eq(t.topicId, topicId),
        columns: { id: true },
      });
      if (rows.length > 0) {
        await db.delete(item).where(
          inArray(
            item.id,
            rows.map((r) => r.id),
          ),
        );
      }
      await db.delete(user).where(inArray(user.id, [userId]));
      await db.delete(topic).where(inArray(topic.id, [topicId]));
    });

    it("getTopicPools never returns items from a suspended source", async () => {
      const pools = await getTopicPools([topicId], {
        userId,
        anchor: new Date(),
        scoreFloor: 1,
        excludeIds: [],
      });

      const sources = (pools.get(topicId) ?? []).map((row) => row.source);
      expect(sources).toContain("met");
      // Phase 6.3: a walk-source row is an ordinary row to the draw — nothing filters on source
      // except suspension, and a blog is never suspended by default.
      expect(sources).toContain("doorofperception");
      for (const suspended of SUSPENDED_SOURCES) {
        expect(sources).not.toContain(suspended);
      }
    });

    it("drawFromTopic never returns items from a suspended source", async () => {
      const drawn = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 50,
      });

      const sources = drawn.map((row) => row.source);
      expect(sources).toContain("met");
      // Phase 6.3: a walk-source row is an ordinary row to the draw — nothing filters on source
      // except suspension, and a blog is never suspended by default.
      expect(sources).toContain("doorofperception");
      for (const suspended of SUSPENDED_SOURCES) {
        expect(sources).not.toContain(suspended);
      }
    });
  },
);

// The dev knob panel's un-burn (plan 09-05-26). The contract worth a real Postgres: only *this*
// user's rows go, only those served at or after the mark (inclusive — the mark is the instant the
// panel last applied knobs, and the page served in that same instant belongs to the cycle being
// forgotten), and the count comes back honest.
describe.skipIf(!process.env.DATABASE_URL)(
  "forgetSeenSince (integration)",
  () => {
    const userA = `test-forget-a-${nanoid(8)}`;
    const userB = `test-forget-b-${nanoid(8)}`;
    const topicId = `test-forget-topic-${nanoid(8)}`;
    const prefix = `test-forget-${nanoid(8)}-`;
    const itemIds: string[] = [];
    const mark = new Date("2026-09-05T12:00:00Z");

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, seenItem, topic, user } =
        await import("~/server/db/schema");
      await db.insert(topic).values({
        id: topicId,
        label: "Test forget topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      });
      await db.insert(user).values(
        [userA, userB].map((id) => ({
          id,
          name: id,
          email: `${id}@example.com`,
          emailVerified: false,
        })),
      );
      const rows = await db
        .insert(item)
        .values(
          [0, 1, 2].map((i) => ({
            source: "met",
            sourceId: `${prefix}${i}`,
            type: "image" as const,
            title: `Forget item ${i}`,
            sourceUrl: `https://example.com/${prefix}${i}`,
            imageUrl: `https://example.com/${prefix}${i}.jpg`,
            topicId,
            curationScore: 9,
            aestheticTags: [],
          })),
        )
        .returning({ id: item.id });
      itemIds.push(...rows.map((r) => r.id));
      // User A: one row before the mark, one at it, one after. User B: one after the mark.
      await db.insert(seenItem).values([
        {
          userId: userA,
          itemId: itemIds[0]!,
          servedAt: new Date(mark.getTime() - 60_000),
        },
        { userId: userA, itemId: itemIds[1]!, servedAt: mark },
        {
          userId: userA,
          itemId: itemIds[2]!,
          servedAt: new Date(mark.getTime() + 60_000),
        },
        {
          userId: userB,
          itemId: itemIds[2]!,
          servedAt: new Date(mark.getTime() + 60_000),
        },
      ]);
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, seenItem, topic, user } =
        await import("~/server/db/schema");
      await db.delete(seenItem).where(inArray(seenItem.userId, [userA, userB]));
      await db.delete(item).where(inArray(item.id, itemIds));
      await db.delete(user).where(inArray(user.id, [userA, userB]));
      await db.delete(topic).where(inArray(topic.id, [topicId]));
    });

    it("deletes only this user's rows served at or after `since`, and reports the count", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const { eq } = await import("drizzle-orm");

      const forgotten = await forgetSeenSince(userA, mark);
      expect(forgotten).toBe(2);

      const aLeft = await db
        .select()
        .from(seenItem)
        .where(eq(seenItem.userId, userA));
      expect(aLeft.map((r) => r.itemId)).toEqual([itemIds[0]]);
      const bLeft = await db
        .select()
        .from(seenItem)
        .where(eq(seenItem.userId, userB));
      expect(bLeft).toHaveLength(1);
    });
  },
);
