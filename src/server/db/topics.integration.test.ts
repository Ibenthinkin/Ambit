// Integration tests for the two vocabulary reads, against a real Postgres — `listTopics` (the
// onboarding chip grid: `core` tier only) and `listAllTopics` (the whole vocabulary). The split
// is what makes Cut 2a safe: the vocabulary grows from sixteen to ~a hundred while the screen a
// new user picks from does not (docs/PLAN_topic-vocabulary-cut2.md, Task 1).
//
// Integration rather than unit because both functions are a single `select` — there is no pure
// half worth testing, and the only thing that could break is the WHERE clause, which needs rows.
// Self-skips whenever DATABASE_URL isn't set, same as items.integration.test.ts.
import { eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ERA_TOPICS, TOPIC_FACETS } from "~/server/config/topic-facets";

import { listAllTopics, listTopics } from "./topics";
import { topic } from "./schema";

describe.skipIf(!process.env.DATABASE_URL)("listTopics / listAllTopics", () => {
  // A throwaway `grown` row, unique per run, so repeated or parallel runs never collide with each
  // other or with the real seeded vocabulary.
  const grownId = `test-grown-topic-${nanoid(8)}`;
  // Its unfaceted twin: a real row no picker may offer (09-10-26).
  const unfacetedId = `test-grown-topic-unfaceted-${nanoid(8)}`;

  afterAll(async () => {
    const { db } = await import("./client");
    await db.delete(topic).where(like(topic.id, "test-grown-topic-%"));
  });

  it("listTopics returns faceted topics of either tier and hides unfaceted ones", async () => {
    // Until 09-10-26 this asserted the opposite — that the grid stays at sixteen while the
    // vocabulary grows. Facets are what made the other answer possible: a hundred chips is a
    // broken screen, but a hundred chips in four grouped stages is not (docs/DESIGN_topic-facets-
    // and-personas.md §1). What is still hidden is what has no facet — unclassified or era.
    const { db } = await import("./client");
    await db
      .insert(topic)
      .values([
        {
          id: grownId,
          label: "Test Grown",
          seedQueries: {},
          tier: "grown",
          facet: "look",
        },
        {
          id: unfacetedId,
          label: "Test Unfaceted",
          seedQueries: {},
          tier: "grown",
        },
      ])
      .onConflictDoNothing();

    const pickable = await listTopics();
    const ids = pickable.map((t) => t.id);
    expect(ids).toContain(grownId);
    expect(ids).not.toContain(unfacetedId);
    // Every row that comes back is faceted — that is the contract the pickers rely on.
    for (const t of pickable) expect(t.facet).not.toBeNull();
    // Still ordered by label (Cut 2a).
    expect(ids).toEqual(
      [...pickable]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((t) => t.id),
    );

    const all = await listAllTopics();
    expect(all.map((t) => t.id)).toEqual(
      expect.arrayContaining([grownId, unfacetedId]),
    );
    expect(all.length).toBeGreaterThan(pickable.length);
  });

  it("orders both reads by label, so the grid reads the same on every visit", async () => {
    // Neither read carried an ORDER BY before Cut 2a, which left the onboarding grid at the mercy
    // of Postgres's row order — a latent bug settings-screen.tsx flagged and worked around by
    // sorting client-side. Fixed here rather than papered over again.
    const labels = (await listTopics()).map((t) => t.label);
    expect(labels).toEqual([...labels].sort());
  });

  it("has no non-original rows hiding in the seeded sixteen", async () => {
    const { db } = await import("./client");
    const seeded = await db
      .select()
      .from(topic)
      .where(eq(topic.tier, "original"));
    expect(seeded.length).toBeGreaterThanOrEqual(16);
  });

  it("gives every config topic an `original` tier row — the feed's CORE_TOPIC_IDS shortcut relies on it", async () => {
    // The feel levers (dev knob panel, 09-05-26) decide "is this topic grown?" from `TOPICS`,
    // not from this column, because a hop must not cost a query. Inclusion, not equality: `tier`
    // defaults to "original", so other suites' throwaway topics can legitimately sit here too.
    const { db } = await import("./client");
    const { TOPICS } = await import("~/server/config/topics");
    const originalIds = new Set(
      (await db.select().from(topic).where(eq(topic.tier, "original"))).map(
        (t) => t.id,
      ),
    );
    for (const t of TOPICS) expect(originalIds.has(t.id)).toBe(true);
  });
});

describe.skipIf(!process.env.DATABASE_URL)(
  "applyTopicFacets (integration)",
  () => {
    it("writes the map to every topic in the database and reports the unfaceted remainder", async () => {
      const { applyTopicFacets, listAllTopics } = await import("./topics");
      const result = await applyTopicFacets();

      const all = await listAllTopics();
      const byId = new Map(all.map((t) => [t.id, t]));
      // Every key that exists in this database carries its facet.
      for (const [id, facet] of Object.entries(TOPIC_FACETS)) {
        const row = byId.get(id);
        if (row) expect(row.facet, id).toBe(facet);
      }
      // `applied` counts the keys that were present, never the keys that were not.
      expect(result.applied).toBe(
        Object.keys(TOPIC_FACETS).filter((id) => byId.has(id)).length,
      );
      // The remainder is whatever real topic is unfaceted and not an era topic. On a fully
      // classified vocabulary it is only test fixtures, which all start `test-`.
      for (const id of result.unfaceted) {
        expect(ERA_TOPICS.has(id)).toBe(false);
        expect(byId.get(id)?.facet).toBeNull();
      }
    });
  },
);

describe.skipIf(!process.env.DATABASE_URL)(
  "resetUserTopicWeights (integration)",
  () => {
    // Its own fixtures: nothing else in this file needs a user, and a reset that hit a shared one
    // would be a suite-ordering trap the moment another describe learned to bump a weight.
    const userId = `test-weights-user-${nanoid(8)}`;
    const topicA = `test-weights-topic-a-${nanoid(8)}`;
    const topicB = `test-weights-topic-b-${nanoid(8)}`;

    beforeAll(async () => {
      const { db } = await import("./client");
      const { user } = await import("./schema");
      await db.insert(topic).values([
        { id: topicA, label: "Weights A", seedQueries: {}, facet: "subject" },
        { id: topicB, label: "Weights B", seedQueries: {}, facet: "subject" },
      ]);
      await db.insert(user).values({
        id: userId,
        name: "Test weights user",
        email: `${userId}@example.com`,
        emailVerified: false,
      });
    });

    afterAll(async () => {
      const { db } = await import("./client");
      const { user, userTopic } = await import("./schema");
      await db.delete(userTopic).where(eq(userTopic.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(topic).where(inArray(topic.id, [topicA, topicB]));
    });

    it("puts every weight back to 1.0 and reports how many", async () => {
      const {
        bumpTopicWeight,
        getUserTopicWeights,
        resetUserTopicWeights,
        setUserTopics,
      } = await import("./topics");
      await setUserTopics(userId, [topicA, topicB]);
      await bumpTopicWeight(userId, topicA);
      expect((await getUserTopicWeights(userId)).get(topicA)).toBeCloseTo(1.5);

      expect(await resetUserTopicWeights(userId)).toBe(2);
      const after = await getUserTopicWeights(userId);
      expect(after.get(topicA)).toBe(1);
      expect(after.get(topicB)).toBe(1);
    });
  },
);
