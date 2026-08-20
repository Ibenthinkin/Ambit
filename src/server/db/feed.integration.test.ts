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
import { getTopicPools } from "./feed";
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
        ["met", ...SUSPENDED_SOURCES].map((source, i) => ({
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
      for (const suspended of SUSPENDED_SOURCES) {
        expect(sources).not.toContain(suspended);
      }
    });
  },
);
