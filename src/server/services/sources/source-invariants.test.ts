// D5, as something CI refuses (docs/PHASE6_DESIGN_6.3.md §7): a blog item is an image item with
// NO body, always — which is what makes "Ambit never renders blog article text" an invariant
// rather than a policy. Two halves: every registered walker's fixture normalizes that way, and no
// row in the DB says otherwise.
import { and, inArray, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { WALK_SOURCES } from "~/server/config/topics";
import dopFixtures from "./__fixtures__/doorofperception.json";
import { walkers } from "./index";

const fixturesByWalker: Record<string, unknown[]> = {
  doorofperception: dopFixtures,
};

describe("walk-source invariants (unit)", () => {
  it("every registered walker has a fixture here", () => {
    for (const id of Object.keys(walkers)) {
      expect(fixturesByWalker).toHaveProperty(id);
    }
  });

  it("every walker normalizes to type image with body null", () => {
    for (const [id, walker] of Object.entries(walkers)) {
      for (const raw of fixturesByWalker[id] ?? []) {
        let item;
        try {
          item = walker.toItem(raw);
        } catch {
          continue; // a fixture row that toItem rejects (no featured image) is not an item
        }
        expect(item.type, id).toBe("image");
        expect(item.body, id).toBeNull();
      }
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)(
  "walk-source invariants (integration)",
  () => {
    it("no blog row in the DB carries a body", async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");
      const rows = await db
        .select({ id: item.id })
        .from(item)
        .where(
          and(inArray(item.source, [...WALK_SOURCES]), isNotNull(item.body)),
        );
      expect(rows).toEqual([]);
    });
  },
);
