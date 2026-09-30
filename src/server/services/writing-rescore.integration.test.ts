// `recurate:writing`'s write (docs/PLAN_writing.md Phase 1): additive memberships, a display
// topic only where there was none, and the writing fields stored — the score always the curator's. Against a
// real Postgres; self-skips without DATABASE_URL like every *.integration.test.ts.
//
// One fixture is un-homed (topic_id NULL) because that is the case under test. It is scored 1 so
// it is as unlikely a WILD draw as a row can be — CLAUDE.md's note on un-homed fixtures racing
// services/feed.integration.test.ts is why.
import { eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { item, itemTopic, topic } from "~/server/db/schema";
import { insertHomedItems } from "~/server/db/test-fixtures";
import { applyWritingRescore, planWritingRescore } from "./writing-rescore";

describe.skipIf(!process.env.DATABASE_URL)(
  "applyWritingRescore (integration)",
  () => {
    const run = nanoid(8);
    const seedTopic = `test-wr-seed-${run}`;
    const curatorTopic = `test-wr-cur-${run}`;
    const prefix = `test-wr-${run}-`;
    const ids: Record<"homed" | "unhomed", string> = { homed: "", unhomed: "" };

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const seedQueries = {
        wikipedia: [],
        met: [],
        aic: [],
        cma: [],
        wellcome: [],
      };
      await db.insert(topic).values([
        { id: seedTopic, label: "Test seed", seedQueries },
        { id: curatorTopic, label: "Test curator", seedQueries },
      ]);
      const [homed] = await insertHomedItems(db, [
        {
          source: "wikipedia",
          sourceId: `${prefix}homed`,
          type: "article",
          title: "Homed",
          summary: "s",
          sourceUrl: "https://example.com/h",
          topicId: seedTopic,
          curationScore: 4,
        },
      ]);
      const [unhomed] = await db
        .insert(item)
        .values({
          source: "wikipedia",
          sourceId: `${prefix}unhomed`,
          type: "article",
          title: "Unhomed",
          summary: "s",
          sourceUrl: "https://example.com/u",
          topicId: null,
          curationScore: 1,
        })
        .returning();
      ids.homed = homed!.id;
      ids.unhomed = unhomed!.id;
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const rows = await db
        .select({ id: item.id })
        .from(item)
        .where(like(item.sourceId, `${prefix}%`));
      const rowIds = rows.map((r) => r.id);
      if (rowIds.length) {
        await db.delete(itemTopic).where(inArray(itemTopic.itemId, rowIds));
        await db.delete(item).where(inArray(item.id, rowIds));
      }
      await db
        .delete(topic)
        .where(inArray(topic.id, [seedTopic, curatorTopic]));
    });

    const verdict = {
      curationScore: 8,
      aestheticTags: ["odd history"],
      kind: "curiosity" as const,
      topics: [curatorTopic],
      readingMinutes: 7,
    };

    it("writes the writing fields, adds a curator membership, and keeps the display topic", async () => {
      const { db } = await import("~/server/db/client");
      const out = await applyWritingRescore(
        db,
        planWritingRescore(ids.homed, verdict),
      );
      const [row] = await db.select().from(item).where(eq(item.id, ids.homed));
      expect(row).toMatchObject({
        curationScore: 8,
        aestheticTags: ["odd history"],
        kind: "curiosity",
        readingMinutes: 7,
        topicId: seedTopic,
      });
      const members = await db
        .select()
        .from(itemTopic)
        .where(eq(itemTopic.itemId, ids.homed));
      expect(members.map((m) => [m.topicId, m.origin]).sort()).toEqual(
        [
          [curatorTopic, "curator"],
          [seedTopic, "seed"],
        ].sort(),
      );
      expect(out).toEqual({ membershipsAdded: 1, gainedDisplay: false });
    });

    it("gives an un-homed row a display topic — only where it had none", async () => {
      const { db } = await import("~/server/db/client");
      const out = await applyWritingRescore(
        db,
        planWritingRescore(ids.unhomed, verdict),
      );
      const [row] = await db
        .select()
        .from(item)
        .where(eq(item.id, ids.unhomed));
      expect(row?.topicId).toBe(curatorTopic);
      expect(out.gainedDisplay).toBe(true);
    });

    it("is additive — a second pass writes no membership", async () => {
      const { db } = await import("~/server/db/client");
      const out = await applyWritingRescore(
        db,
        planWritingRescore(ids.homed, verdict),
      );
      expect(out.membershipsAdded).toBe(0);
    });
  },
);

describe("planWritingRescore", () => {
  // No news demotion since 09-30-26 (Ben keeps news out by choosing sources): the score written
  // is always the curator's own.
  it("writes the curator's score", () => {
    const p = planWritingRescore("x", {
      curationScore: 9,
      aestheticTags: [],
      kind: null,
      topics: [],
    });
    expect(p).toMatchObject({
      score: 9,
      kind: null,
      readingMinutes: null,
    });
  });
});
