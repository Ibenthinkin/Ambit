// Integration tests for drawFromTopic (SPEC §9.2) and upsertItem (SPEC §6.4) against a real
// Postgres — the weighted-draw query, the excludeIds/scoreFloor filters, the actual score-skewed
// distribution, and upsertItem's conflict-update behavior can't be verified against fixtures the
// way adapter toItem() tests are. Self-skips whenever DATABASE_URL isn't set — which since Phase
// 7.1 means the `check` job only: CI's `e2e` job gives `bun run test` a Postgres service container
// and this suite runs there (see .github/workflows/ci.yml). Locally: `docker compose up -d`, then
// `bun run test`.
import { and, eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { addItemTopics, drawFromTopic, upsertItem } from "./items";
import { item, itemTopic, topic } from "./schema";

describe.skipIf(!process.env.DATABASE_URL)(
  "drawFromTopic (integration)",
  () => {
    // A throwaway topic id, unique per test run, so repeated/parallel runs never collide with each
    // other or with real seeded data (topics.ts's sixteen real ids are never touched).
    const topicId = `test-draw-from-topic-${nanoid(8)}`;
    // sourceId is prefixed the same way so afterAll's cleanup can find every row this file wrote
    // without tracking ids by hand.
    const sourceIdPrefix = `test-${nanoid(8)}-`;

    // Six items spanning scores 2-9 (2, 3, 5, 6, 8, 9) — floor-4 tests exclude the two lowest,
    // and one item carries an aesthetic tag for the shared-tag boost to have something to bite on.
    const scores = [2, 3, 5, 6, 8, 9];

    beforeAll(async () => {
      const { db } = await import("./client");
      await db.insert(topic).values({
        id: topicId,
        label: "Test draw-from-topic topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      });
      await db.insert(item).values(
        scores.map((score, i) => ({
          source: "wikipedia" as const,
          sourceId: `${sourceIdPrefix}${i}`,
          type: "article" as const,
          title: `Integration test item ${i}`,
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/${sourceIdPrefix}${i}`,
          topicId,
          curationScore: score,
          aestheticTags: score === 9 ? ["quiet portrait"] : [],
        })),
      );
    });

    afterAll(async () => {
      const { db } = await import("./client");
      await db
        .delete(item)
        .where(
          and(
            eq(item.topicId, topicId),
            like(item.sourceId, `${sourceIdPrefix}%`),
          ),
        );
      await db.delete(topic).where(eq(topic.id, topicId));
    });

    it("excludes items below the score floor", async () => {
      const drawn = await drawFromTopic(topicId, {
        scoreFloor: 4,
        excludeIds: [],
        limit: 10,
      });
      // Only the 4 items scoring >= 4 (5, 6, 8, 9) are eligible; the score-2 and score-3 items
      // never appear no matter how many times this draw runs.
      expect(drawn).toHaveLength(4);
      expect(drawn.every((row) => row.curationScore >= 4)).toBe(true);
    });

    it("honors excludeIds", async () => {
      const first = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 6,
      });
      const excludeIds = first.map((row) => row.id);
      const second = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds,
        limit: 6,
      });
      expect(second).toHaveLength(0);
    });

    it("honors limit", async () => {
      const drawn = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 2,
      });
      expect(drawn).toHaveLength(2);
    });

    it("draws a stable, deterministic order for a fixed rng seed", async () => {
      // A trivial LCG so both draws see the exact same pseudo-random sequence — this is testing
      // that drawFromTopic's own logic is deterministic given rng, not that Math.random is.
      const makeRng = () => {
        let state = 42;
        return () => {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };
      };
      const first = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 6,
        rng: makeRng(),
      });
      const second = await drawFromTopic(topicId, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 6,
        rng: makeRng(),
      });
      expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
    });

    it("draws the highest-scored item more often than a mid-scored one over many draws", async () => {
      // Real Math.random, 300 single-item draws — the score-9 item (with a bonus aesthetic-tag
      // boost via a matching taste keyword) should come up meaningfully more than the score-5 item.
      // This is the actual "never similarity-ranked, always curated-weighted-random" behavior
      // (SPEC §9) made testable, not just the weight formula in isolation (see items.test.ts).
      const { db } = await import("./client");
      const pool = await db
        .select()
        .from(item)
        .where(eq(item.topicId, topicId));
      const highId = pool.find((row) => row.curationScore === 9)!.id;
      const midId = pool.find((row) => row.curationScore === 5)!.id;

      let highCount = 0;
      let midCount = 0;
      for (let i = 0; i < 300; i++) {
        const [drawn] = await drawFromTopic(topicId, {
          scoreFloor: 1,
          excludeIds: pool
            .map((row) => row.id)
            .filter((id) => id !== highId && id !== midId),
          limit: 1,
          tasteKeywords: ["quiet portrait"],
        });
        if (drawn?.id === highId) highCount++;
        if (drawn?.id === midId) midCount++;
      }
      expect(highCount).toBeGreaterThan(midCount);
    });
  },
);

describe.skipIf(!process.env.DATABASE_URL)("upsertItem (integration)", () => {
  const topicId = `test-upsert-item-${nanoid(8)}`;
  // A second, genuinely valid topic — used to prove a re-upsert's *different* topicId is
  // discarded rather than applied. Real (not a dangling id): item.topic_id is a NOT NULL FK, so a
  // nonexistent id would only prove the update never happened for the wrong reason (a constraint
  // violation), not that upsertItem's own `set` clause deliberately omits topicId. (item.topic_id
  // is a FK — nullable since Cut 1 — so the constraint still bites on a bogus id.)
  const otherTopicId = `test-upsert-item-other-${nanoid(8)}`;
  const sourceId = `test-${nanoid(8)}`;

  beforeAll(async () => {
    const { db } = await import("./client");
    await db.insert(topic).values([
      {
        id: topicId,
        label: "Test upsertItem topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      },
      {
        id: otherTopicId,
        label: "Test upsertItem other topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      },
    ]);
  });

  afterEach(async () => {
    const { db } = await import("./client");
    await db.delete(item).where(eq(item.sourceId, sourceId));
  });

  afterAll(async () => {
    const { db } = await import("./client");
    await db.delete(topic).where(inArray(topic.id, [topicId, otherTopicId]));
  });

  it("inserts a new item on first sight", async () => {
    const row = await upsertItem({
      source: "wikipedia",
      sourceId,
      type: "article",
      title: "Original title",
      summary: "A summary long enough to be unremarkable.",
      sourceUrl: `https://example.com/${sourceId}`,
      topicId,
      curationScore: 7,
      aestheticTags: ["quiet portrait"],
    });

    expect(row.title).toBe("Original title");
    expect(row.curationScore).toBe(7);
  });

  it("re-running with the same (source, sourceId) updates content but preserves id, topicId, curationScore, and aestheticTags", async () => {
    const first = await upsertItem({
      source: "wikipedia",
      sourceId,
      type: "article",
      title: "Original title",
      summary: "A summary long enough to be unremarkable.",
      sourceUrl: `https://example.com/${sourceId}`,
      topicId,
      curationScore: 7,
      aestheticTags: ["quiet portrait"],
    });

    // A second "sighting" of the same object: the catalog record changed (new title/summary), and
    // — because this call originates from ingestion re-running toItem()+curateItems() from
    // scratch — it carries a DIFFERENT topicId and curationScore too. Neither should stick; only
    // the content fields are live-refreshed (see the doc comment on upsertItem in items.ts).
    const second = await upsertItem({
      source: "wikipedia",
      sourceId,
      type: "article",
      title: "Updated title",
      summary: "A different, still-unremarkable summary text.",
      sourceUrl: `https://example.com/${sourceId}`,
      topicId: otherTopicId,
      curationScore: 2,
      aestheticTags: [],
    });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Updated title");
    expect(second.summary).toBe(
      "A different, still-unremarkable summary text.",
    );
    expect(second.topicId).toBe(topicId); // preserved, not overwritten to otherTopicId
    expect(second.curationScore).toBe(7); // preserved, not overwritten to 2
    expect(second.aestheticTags).toEqual(["quiet portrait"]); // preserved, not cleared
  });
});

describe.skipIf(!process.env.DATABASE_URL)(
  "addItemTopics (integration)",
  () => {
    const topicA = `test-membership-a-${nanoid(8)}`;
    const topicB = `test-membership-b-${nanoid(8)}`;
    const sourceId = `test-membership-${nanoid(8)}`;
    let itemId: string;

    beforeAll(async () => {
      const { db } = await import("./client");
      await db.insert(topic).values(
        [topicA, topicB].map((id) => ({
          id,
          label: `Test membership ${id}`,
          seedQueries: {
            wikipedia: [],
            met: [],
            aic: [],
            cma: [],
            wellcome: [],
          },
        })),
      );
      // An un-homed row: legal since Cut 1, and the shape the walk lane writes before it adds
      // memberships.
      const [row] = await db
        .insert(item)
        .values({
          source: "doorofperception",
          sourceId,
          type: "image" as const,
          title: "Integration test membership item",
          summary: "A summary long enough to be unremarkable.",
          sourceUrl: `https://example.com/${sourceId}`,
          topicId: null,
          curationScore: 8,
          aestheticTags: [],
        })
        .returning({ id: item.id });
      itemId = row!.id;
    });

    afterAll(async () => {
      const { db } = await import("./client");
      // item_topic rows go with the item (ON DELETE CASCADE) — that cascade is itself under test
      // in the last case below.
      await db.delete(item).where(eq(item.id, itemId));
      await db.delete(topic).where(inArray(topic.id, [topicA, topicB]));
    });

    it("inserts one row per distinct topic and reports how many landed", async () => {
      const n = await addItemTopics(
        itemId,
        [topicA, topicB, topicA],
        "curator",
      );
      expect(n).toBe(2);
      const { db } = await import("./client");
      const rows = await db
        .select()
        .from(itemTopic)
        .where(eq(itemTopic.itemId, itemId));
      expect(rows.map((r) => [r.topicId, r.origin]).sort()).toEqual([
        [topicA, "curator"],
        [topicB, "curator"],
      ]);
    });

    it("is additive: a repeat write inserts nothing and never rewrites origin", async () => {
      const n = await addItemTopics(itemId, [topicA], "tag");
      expect(n).toBe(0);
      const { db } = await import("./client");
      const [row] = await db
        .select({ origin: itemTopic.origin })
        .from(itemTopic)
        .where(
          and(eq(itemTopic.itemId, itemId), eq(itemTopic.topicId, topicA)),
        );
      expect(row?.origin).toBe("curator"); // the first writer's fact stands
    });

    it("does nothing for an empty list (no invalid empty INSERT)", async () => {
      expect(await addItemTopics(itemId, [], "seed")).toBe(0);
    });

    it("an un-homed item is never drawn: drawFromTopic and getTopicPools both skip it", async () => {
      // Membership rows exist for topicA now, but the FEED reads item.topic_id (still null) until
      // Cut 2 — design §5's "invisible with no guard at all", pinned here so Cut 2 has to flip this
      // test on purpose.
      const drawn = await drawFromTopic(topicA, {
        scoreFloor: 1,
        excludeIds: [],
        limit: 50,
      });
      expect(drawn.some((r) => r.id === itemId)).toBe(false);

      const { getTopicPools } = await import("./feed");
      const pools = await getTopicPools([topicA], {
        userId: `nobody-${nanoid(6)}`,
        anchor: new Date(),
        scoreFloor: 1,
        excludeIds: [],
      });
      expect(pools.get(topicA)?.some((r) => r.id === itemId)).toBe(false);
    });

    it("membership rows cascade away with the item", async () => {
      const { db } = await import("./client");
      await db.delete(item).where(eq(item.id, itemId));
      const rows = await db
        .select()
        .from(itemTopic)
        .where(eq(itemTopic.itemId, itemId));
      expect(rows).toHaveLength(0);
    });
  },
);
