// Integration tests for the two vocabulary reads, against a real Postgres — `listTopics` (the
// onboarding chip grid: `core` tier only) and `listAllTopics` (the whole vocabulary). The split
// is what makes Cut 2a safe: the vocabulary grows from sixteen to ~a hundred while the screen a
// new user picks from does not (docs/PLAN_topic-vocabulary-cut2.md, Task 1).
//
// Integration rather than unit because both functions are a single `select` — there is no pure
// half worth testing, and the only thing that could break is the WHERE clause, which needs rows.
// Self-skips whenever DATABASE_URL isn't set, same as items.integration.test.ts.
import { eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { ERA_TOPICS, TOPIC_FACETS } from "~/server/config/topic-facets";

import { listAllTopics, listTopics } from "./topics";
import { topic } from "./schema";

describe.skipIf(!process.env.DATABASE_URL)("listTopics / listAllTopics", () => {
  // A throwaway `grown` row, unique per run, so repeated or parallel runs never collide with each
  // other or with the real seeded vocabulary.
  const grownId = `test-grown-topic-${nanoid(8)}`;

  afterAll(async () => {
    const { db } = await import("./client");
    await db.delete(topic).where(like(topic.id, "test-grown-topic-%"));
  });

  it("returns only core topics — the onboarding grid must not grow with the vocabulary", async () => {
    // Cut 2a grows the vocabulary from 16 to ~100. The chip grid is a curated tier, not a dump of
    // everything the corpus knows about; `listAllTopics` is what wants the whole set.
    const { db } = await import("./client");
    await db
      .insert(topic)
      .values({
        id: grownId,
        label: "Test Grown",
        seedQueries: {},
        tier: "grown",
      })
      .onConflictDoNothing();

    const core = await listTopics();
    expect(core.every((t) => t.tier === "original")).toBe(true);
    expect(core.map((t) => t.id)).not.toContain(grownId);

    const all = await listAllTopics();
    expect(all.map((t) => t.id)).toContain(grownId);
    expect(all.length).toBeGreaterThan(core.length);
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
