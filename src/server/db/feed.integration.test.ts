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
import {
  forgetSeenSince,
  getTopicPools,
  getWildPool,
  TOPIC_POOL_PER_SOURCE,
  TOPIC_POOL_SAMPLE,
} from "./feed";
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
        sampleKey: "pools-test:0",
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

// The WILD tier's pool (09-06-26, docs/PLAN_caption-less-and-wild.md T2). Every property here is
// SQL — a NULL predicate, an md5 ordering, and the same eligibility clauses getTopicPools uses —
// so a mocked test would be checking a mock. What matters: it returns un-homed rows and ONLY
// un-homed rows, it refuses everything a topic pool would refuse, and the sample it draws is a
// pure function of `sampleKey`, because a cursor's promise of an identical page depends on it.
describe.skipIf(!process.env.DATABASE_URL)("getWildPool (integration)", () => {
  const userId = `test-wild-user-${nanoid(8)}`;
  const topicId = `test-wild-topic-${nanoid(8)}`;
  const prefix = `test-wild-${nanoid(8)}-`;
  const unhomedIds: string[] = [];
  let homedId: string;
  let lowScoreId: string;
  let suspendedId: string;
  const anchor = new Date();

  beforeAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, topic, user } = await import("~/server/db/schema");
    await db.insert(topic).values({
      id: topicId,
      label: "Test wild topic",
      seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
    });
    await db.insert(user).values({
      id: userId,
      name: "Test wild user",
      email: `${userId}@example.com`,
      emailVerified: false,
    });

    const row = (i: number, over: Record<string, unknown>) => ({
      source: "met",
      sourceId: `${prefix}${i}`,
      type: "image" as const,
      title: `Wild item ${i}`,
      sourceUrl: `https://example.com/${prefix}${i}`,
      imageUrl: `https://example.com/${prefix}${i}.jpg`,
      topicId: null,
      curationScore: 9,
      aestheticTags: [],
      ...over,
    });

    // 30 un-homed rows to sample from, plus one of each thing the pool must refuse.
    const inserted = await db
      .insert(item)
      .values([
        ...Array.from({ length: 30 }, (_, i) => row(i, {})),
        row(30, { topicId }), // homed
        row(31, { curationScore: 2 }), // below the floor
        // A suspended source, if there is one to test with — SUSPENDED_SOURCES can be empty.
        ...(SUSPENDED_SOURCES.length > 0
          ? [row(32, { source: SUSPENDED_SOURCES[0]! })]
          : []),
      ])
      .returning({ id: item.id, sourceId: item.sourceId });

    const byIndex = (i: number) =>
      inserted.find((r) => r.sourceId === `${prefix}${i}`)!.id;
    unhomedIds.push(...Array.from({ length: 30 }, (_, i) => byIndex(i)));
    homedId = byIndex(30);
    lowScoreId = byIndex(31);
    suspendedId = SUSPENDED_SOURCES.length > 0 ? byIndex(32) : "";
  });

  afterAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, seenItem, topic, user } = await import("~/server/db/schema");
    await db.delete(seenItem).where(inArray(seenItem.userId, [userId]));
    const rows = await db.query.item.findMany({
      where: (t, { like }) => like(t.sourceId, `${prefix}%`),
      columns: { id: true },
    });
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      // These fixtures are UN-HOMED, so any other suite running a real `getFeedPage` at the same
      // time can draw them through WILD and write `seen_item` rows for ITS user — rows this
      // suite never made and the FK would otherwise trip on (seen 09-07-26 running the feed
      // suites together). Clear them by item id, not by this suite's user id.
      await db.delete(seenItem).where(inArray(seenItem.itemId, ids));
      await db.delete(item).where(inArray(item.id, ids));
    }
    await db.delete(user).where(inArray(user.id, [userId]));
    await db.delete(topic).where(inArray(topic.id, [topicId]));
  });

  // A limit far above the corpus's own un-homed count (~1,000 on this laptop, 0 on CI's fresh
  // database), so these assertions are about the pool's PREDICATES rather than about which rows
  // an md5 sample happened to pick. `limit` gets its own test below.
  const draw = (over: Partial<Parameters<typeof getWildPool>[0]> = {}) =>
    getWildPool({
      userId,
      anchor,
      scoreFloor: 4,
      excludeIds: [],
      sampleKey: "seed:0",
      limit: 100_000,
      ...over,
    });

  it("returns un-homed rows, and never a homed one", async () => {
    const pool = await draw();
    const ids = new Set(pool.map((r) => r.id));
    expect(pool.every((r) => r.topicId === null)).toBe(true);
    expect(ids.has(homedId)).toBe(false);
    // All 30 of ours are in there; the corpus's own un-homed rows are too, which is correct —
    // the pool is corpus-wide by design, since a WILD card belongs to no reader's topics.
    for (const id of unhomedIds) expect(ids.has(id)).toBe(true);
  });

  it("refuses everything a topic pool refuses: below the floor, excluded, suspended", async () => {
    const pool = await draw({ excludeIds: [unhomedIds[0]!] });
    const ids = new Set(pool.map((r) => r.id));
    expect(ids.has(lowScoreId)).toBe(false);
    expect(ids.has(unhomedIds[0]!)).toBe(false);
    if (suspendedId) expect(ids.has(suspendedId)).toBe(false);
  });

  it("refuses an item this user was served before the anchor", async () => {
    const { db } = await import("~/server/db/client");
    const { seenItem } = await import("~/server/db/schema");
    await db.insert(seenItem).values({
      userId,
      itemId: unhomedIds[1]!,
      servedAt: new Date(anchor.getTime() - 60_000),
    });
    const ids = new Set((await draw()).map((r) => r.id));
    expect(ids.has(unhomedIds[1]!)).toBe(false);
  });

  it("orders by sampleKey: the same key twice is identical, a different key is not", async () => {
    const a = (await draw({ sampleKey: "seed-a:0" })).map((r) => r.id);
    const again = (await draw({ sampleKey: "seed-a:0" })).map((r) => r.id);
    const b = (await draw({ sampleKey: "seed-b:3" })).map((r) => r.id);
    expect(again).toEqual(a);
    // Same membership, different order — which is what makes `limit` a *sample* rather than
    // always the same 200 rows.
    expect(b).not.toEqual(a);
    expect([...b].sort()).toEqual([...a].sort());
  });

  it("respects limit", async () => {
    expect(await draw({ limit: 5 })).toHaveLength(5);
  });
});

// The topic pools sample (09-08-26, docs/DESIGN_feed-pool-sampling.md). Every property here is
// SQL — two window functions and an md5 ordering — so a mocked test would be checking a mock.
// What matters: no topic returns more than TOPIC_POOL_SAMPLE rows, no (topic, source) more than
// TOPIC_POOL_PER_SOURCE, the sample is a pure function of `sampleKey` (SPEC §7's cursor promise
// rides on it), and a topic with nothing eligible is still a key with an empty array.
describe.skipIf(!process.env.DATABASE_URL)(
  "getTopicPools sampling (integration)",
  () => {
    const topicId = `test-sample-topic-${nanoid(8)}`;
    const emptyTopicId = `test-sample-empty-${nanoid(8)}`;
    const userId = `test-sample-user-${nanoid(8)}`;
    const prefix = `test-sample-${nanoid(8)}-`;
    // Four sources × 30 rows = 120 eligible. The per-source cap (20) binds first → 80, then
    // the per-topic cap (60) binds → 60. Both caps are therefore exercised by one seed.
    // Every one of the four must be absent from SUSPENDED_SOURCES — `eligibilityConditions`
    // filters those out before the sample sees them, and 30 vanished rows would quietly turn
    // this into a three-source fixture (`aic` was in the first draft of this test and is
    // suspended, which is exactly how that was found).
    const SOURCES = ["met", "cma", "wellcome", "smithsonian"] as const;
    const PER_SOURCE = 30;

    const base = () => ({
      userId,
      anchor: new Date(),
      scoreFloor: 1,
      excludeIds: [] as string[],
    });

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      await db.insert(topic).values([
        {
          id: topicId,
          label: "Test sample topic",
          seedQueries: {
            wikipedia: [],
            met: [],
            aic: [],
            cma: [],
            wellcome: [],
          },
        },
        {
          id: emptyTopicId,
          label: "Test sample empty topic",
          seedQueries: {
            wikipedia: [],
            met: [],
            aic: [],
            cma: [],
            wellcome: [],
          },
        },
      ]);
      await db.insert(user).values({
        id: userId,
        name: "Test sample user",
        email: `${userId}@example.com`,
        emailVerified: false,
      });
      await db.insert(item).values(
        SOURCES.flatMap((source, s) =>
          Array.from({ length: PER_SOURCE }, (_, i) => ({
            source,
            sourceId: `${prefix}${s}-${i}`,
            type: "image" as const,
            title: `Sample item ${source} ${i}`,
            sourceUrl: `https://example.com/${prefix}${s}-${i}`,
            imageUrl: `https://example.com/${prefix}${s}-${i}.jpg`,
            topicId,
            curationScore: 9,
            aestheticTags: [],
          })),
        ),
      );
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic, user } = await import("~/server/db/schema");
      const rows = await db.query.item.findMany({
        where: (t, { like }) => like(t.sourceId, `${prefix}%`),
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
      await db.delete(topic).where(inArray(topic.id, [topicId, emptyTopicId]));
    });

    it("caps a topic at TOPIC_POOL_SAMPLE and each source within it at TOPIC_POOL_PER_SOURCE", async () => {
      const pools = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:0",
      });
      const pool = pools.get(topicId)!;
      expect(pool).toHaveLength(TOPIC_POOL_SAMPLE);

      const bySource = new Map<string, number>();
      for (const row of pool)
        bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
      for (const source of SOURCES) {
        expect(bySource.get(source) ?? 0).toBeLessThanOrEqual(
          TOPIC_POOL_PER_SOURCE,
        );
      }
      // 60 from four sources capped at 20 each: no source can be shut out, so all four appear.
      expect(bySource.size).toBe(SOURCES.length);
    });

    // The regression that shipped and was caught the same night. Written as one
    // `WHERE n <= 60 AND n_src <= 20` over a single ranking, the two caps are an *intersection* —
    // a row needs the topic's global top sixty AND its own source's top twenty — so a dominated
    // source buys the sample nothing and the pool comes back short and no more diverse. The even
    // fixture above cannot tell the two forms apart; this lopsided one can, which is why it plants
    // its own topic instead of reusing that one.
    it("caps each source BEFORE taking the topic's sixty, so a dominated source is not squeezed out", async () => {
      const { db } = await import("~/server/db/client");
      const { item, topic } = await import("~/server/db/schema");
      const lopsidedTopic = `test-sample-lop-${nanoid(8)}`;
      const lopPrefix = `${prefix}lop-`;
      const SMALL = ["cma", "wellcome", "smithsonian"] as const;
      const SMALL_EACH = 10;

      await db.insert(topic).values({
        id: lopsidedTopic,
        label: "Test lopsided topic",
        seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
      });
      // 120 rows from one source against 10 each from three others — 80 % of the topic in one
      // place, which is what a walked blog does to a topic in the real corpus.
      const planted = [
        ...Array.from({ length: 120 }, (_, i) => ["met", `dom-${i}`] as const),
        ...SMALL.flatMap((src) =>
          Array.from(
            { length: SMALL_EACH },
            (_, i) => [src, `${src}-${i}`] as const,
          ),
        ),
      ];
      await db.insert(item).values(
        planted.map(([source, key]) => ({
          source,
          sourceId: `${lopPrefix}${key}`,
          type: "image" as const,
          title: `Lopsided ${key}`,
          sourceUrl: `https://example.com/${lopPrefix}${key}`,
          imageUrl: `https://example.com/${lopPrefix}${key}.jpg`,
          topicId: lopsidedTopic,
          curationScore: 9,
          aestheticTags: [],
        })),
      );

      try {
        const pool = (
          await getTopicPools([lopsidedTopic], {
            ...base(),
            sampleKey: "sample-test:lopsided",
          })
        ).get(lopsidedTopic)!;

        const bySource = new Map<string, number>();
        for (const row of pool)
          bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);

        // The dominant source is held to its twenty despite holding 80 % of the topic…
        expect(bySource.get("met")).toBe(TOPIC_POOL_PER_SOURCE);
        // …and each small source, being under the cap, arrives WHOLE. Under the intersection form
        // they contributed only the ~4 rows apiece that placed in the global sixty.
        for (const src of SMALL) expect(bySource.get(src)).toBe(SMALL_EACH);
        // 20 + 3×10 — everything stage one leaves, since that is under TOPIC_POOL_SAMPLE. The
        // intersection form returned ~32 here.
        expect(pool).toHaveLength(
          TOPIC_POOL_PER_SOURCE + SMALL.length * SMALL_EACH,
        );
      } finally {
        const rows = await db.query.item.findMany({
          where: (t, { like }) => like(t.sourceId, `${lopPrefix}%`),
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
        await db.delete(topic).where(inArray(topic.id, [lopsidedTopic]));
      }
    });

    it("is a pure function of sampleKey — same key, same rows, same order", async () => {
      const a = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:1",
      });
      const b = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:1",
      });
      expect(b.get(topicId)!.map((r) => r.id)).toEqual(
        a.get(topicId)!.map((r) => r.id),
      );

      const c = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:2",
      });
      // 60 of 120 under a different hash: the two sets differing is what "the next page gets
      // fresh candidates" means, and identical sets would be a broken hash, not luck.
      expect(new Set(c.get(topicId)!.map((r) => r.id))).not.toEqual(
        new Set(a.get(topicId)!.map((r) => r.id)),
      );
    });

    it("keeps every requested topic as a key, an empty array for one with nothing eligible", async () => {
      const pools = await getTopicPools([topicId, emptyTopicId], {
        ...base(),
        sampleKey: "sample-test:3",
      });
      expect(pools.has(emptyTopicId)).toBe(true);
      expect(pools.get(emptyTopicId)).toEqual([]);
      expect(pools.get(topicId)!.length).toBeGreaterThan(0);
    });

    it("still refuses what eligibility refuses — a seen row never enters the sample", async () => {
      const { db } = await import("~/server/db/client");
      const { seenItem } = await import("~/server/db/schema");
      const first = await getTopicPools([topicId], {
        ...base(),
        sampleKey: "sample-test:4",
      });
      const victim = first.get(topicId)![0]!.id;
      const before = new Date(Date.now() - 60_000);
      await db
        .insert(seenItem)
        .values({ userId, itemId: victim, servedAt: before });
      try {
        const after = await getTopicPools([topicId], {
          ...base(),
          anchor: new Date(),
          sampleKey: "sample-test:4",
        });
        expect(after.get(topicId)!.map((r) => r.id)).not.toContain(victim);
        // Still a full sample: the cap applies after eligibility, so one exclusion is backfilled.
        expect(after.get(topicId)).toHaveLength(TOPIC_POOL_SAMPLE);
      } finally {
        await db.delete(seenItem).where(inArray(seenItem.userId, [userId]));
      }
    });
  },
);
