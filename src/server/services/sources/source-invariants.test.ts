// D5, as something CI refuses (docs/PHASE6_DESIGN_6.3.md §7): a blog item is an image item with
// NO body, always — which is what makes "Ambit never renders blog article text" an invariant
// rather than a policy. Two halves: every registered walker's fixture normalizes that way, and no
// row in the DB says otherwise.
import { and, inArray, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { WALK_SOURCES } from "~/server/config/topics";
import dopFixtures from "./__fixtures__/doorofperception.json";
import mafFixtures from "./__fixtures__/mossandfog.json";
import tonFixtures from "./__fixtures__/things-organized-neatly.json";
import ticFixtures from "./__fixtures__/thisiscolossal.json";
import { walkers } from "./index";

const fixturesByWalker: Record<string, unknown[]> = {
  doorofperception: dopFixtures,
  thingsorganizedneatly: tonFixtures,
  mossandfog: mafFixtures,
  thisiscolossal: ticFixtures,
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

    // **Phase 7.2, T5/D7 — the other half of "no source HTML is ever rendered".**
    //
    // `no-dangerous-html.test.ts` proves the app never *renders* stored text as markup. This
    // proves the stored text isn't markup in the first place, which is the belt to that
    // suspenders: every adapter is supposed to normalise to plain text (blogs go through
    // `htmlToText()` at ingest — normalize.ts), and a regression there would be silent, because a
    // tag rendered as a text node looks like an oddly-punctuated caption rather than a bug.
    //
    // `~ '<[a-zA-Z/][^>]*>'` is deliberately narrow: it wants `<p>`, `<a href=…>`, `</div>` — not
    // a bare `<` in "a < b", and not the `<3` in a caption.
    //
    // **This test ran on 08-28-26 and found 55 rows** (D7: record it, exclude it, do not rewrite
    // adapters overnight). One of the two findings is now fixed, the other is a permanent exclusion:
    //
    //  * **`title`/`summary` — 41 rows of genuinely stored markup** (smithsonian 35 titles, met 2
    //    titles, wellcome 2 titles + 1 summary, nasa-images 1 summary), all `<i>`/`<em>` italics
    //    the source APIs put in the field and the adapters passed through verbatim. Not a security
    //    bug — nothing renders them as HTML — but a reader-visible one: the item page showed the
    //    literal `Sword Guard (<i>Tsuba</i>) …`. **Fixed in Phase 8.1:** those four adapters now
    //    run both fields through `htmlToText()`, and `bun run renormalize --confirm` rewrote the
    //    41 existing rows (it is the repair tool for any database that ingested before the fix —
    //    production runs it once after that deploy). The exclusion that used to sit here is gone,
    //    so a regression in any adapter fails this test. See docs/PHASE7_WALKTHROUGH_7.2.md.
    //  * **`body` — 14 wikipedia rows that are false positives.** Wikipedia has articles *about*
    //    markup, and their plain-text extracts legitimately contain the strings `<section>`,
    //    `<ref>`, `<b>` and `<ul>` as prose. Nothing is stored as HTML there; the regex simply
    //    cannot tell an article about a tag from a tag. Wikipedia is also the only source that
    //    carries a `body` at all, and blog bodies are covered by the test above.
    //
    // What is left is still worth running: every *other* source — aic, cma, loc, and any source a
    // later phase adds — must keep all three fields tag-free, and this is what says so.
    it("no stored title, summary or body contains an HTML tag", async () => {
      const { db } = await import("~/server/db/client");
      const { sql } = await import("drizzle-orm");

      const offenders = await db.execute<{
        source: string;
        id: string;
        field: string;
      }>(sql`
        select source, id, 'title' as field from item
          where title ~ '<[a-zA-Z/][^>]*>'
        union all
        select source, id, 'summary' as field from item
          where summary ~ '<[a-zA-Z/][^>]*>'
        union all
        select source, id, 'body' as field from item
          where body ~ '<[a-zA-Z/][^>]*>'
            and source <> 'wikipedia'
      `);

      const rows = Array.from(offenders);
      // Printed, not just counted: the whole value of a finding here is knowing which adapter and
      // which field, and a bare row count sends the next reader back to the psql prompt.
      if (rows.length > 0) console.error("stored HTML found:", rows);
      expect(rows).toEqual([]);
    });
  },
);
