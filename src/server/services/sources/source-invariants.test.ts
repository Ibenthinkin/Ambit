// D5, as something CI refuses (docs/PHASE6_DESIGN_6.3.md §7): a BLOG item is an image item with
// NO body, always — which is what makes "Ambit never renders blog article text" an invariant
// rather than a policy. Two halves: every designated blog's walker normalizes that way, and no
// blog row in the DB says otherwise. Walk sources that are not blogs (`pdr`, whose text is
// CC BY-SA and whose collections carry their body essay by design) are outside D5 and are
// deliberately not iterated here — their contract is their own adapter test.
import { and, inArray, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { BLOGS, isBlogSource } from "~/server/config/blogs";
import dopFixtures from "./__fixtures__/doorofperception.json";
import mafFixtures from "./__fixtures__/mossandfog.json";
import pdrFixtures from "./__fixtures__/pdr.json";
import tonFixtures from "./__fixtures__/things-organized-neatly.json";
import ticFixtures from "./__fixtures__/thisiscolossal.json";
import { walkers } from "./index";

const fixturesByWalker: Record<string, unknown[]> = {
  doorofperception: dopFixtures,
  thingsorganizedneatly: tonFixtures,
  mossandfog: mafFixtures,
  thisiscolossal: ticFixtures,
  pdr: pdrFixtures,
};

describe("walk-source invariants (unit)", () => {
  it("every registered walker has a fixture here", () => {
    for (const id of Object.keys(walkers)) {
      expect(fixturesByWalker).toHaveProperty(id);
    }
  });

  it("every blog walker normalizes to type image with body null", () => {
    for (const [id, walker] of Object.entries(walkers)) {
      if (!isBlogSource(id)) continue;
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
          and(
            inArray(
              item.source,
              BLOGS.map((b) => b.id),
            ),
            isNotNull(item.body),
          ),
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
    // The pattern wants `<p>`, `<a href=…>`, `</div>`, `<br/>` — a real tag NAME after the `<`,
    // then either `>` or an attribute run. It deliberately does not fire on a bare `<` in "a < b",
    // on the `<3` in a caption, or on an **email address in angle brackets** — see the PDR finding
    // below, which is what tightened it from the original `'<[a-zA-Z/][^>]*>'` on 09-02-26.
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
    //  * **`body` — one PDR row that is a false positive, and the reason the pattern is now
    //    stricter (09-02-26).** `essay/the-primordial-gound` reproduces a forwarded email, headers
    //    and all, and PDR writes the addresses the way email does: `From: Ivars Skrastins
    //    <i** @du.lv >`. The old pattern read `<i** @du.lv >` as a tag. Nothing is stored as HTML
    //    there — `bodyText()` had no tag to strip — so the honest fix was to require a valid tag
    //    name rather than to exclude PDR and lose the check over its 1,547 bodies. The stricter
    //    pattern still matches every real tag shape and finds 0 offenders corpus-wide.
    //  * **`body` — 14 wikipedia rows that are false positives.** Wikipedia has articles *about*
    //    markup, and their plain-text extracts legitimately contain the strings `<section>`,
    //    `<ref>`, `<b>` and `<ul>` as prose. Nothing is stored as HTML there; the regex simply
    //    cannot tell an article about a tag from a tag. Blog bodies are covered by the test above
    //    (there are none, by D5). Since 09-02-26 wikipedia is no longer the only source carrying a
    //    `body`: PDR's collections and CC BY-SA essays do too, and they are deliberately NOT
    //    excluded here — `bodyText()` is supposed to leave no tag standing, and this is what says so.
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
          where title ~ '<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?\/?>'
        union all
        select source, id, 'summary' as field from item
          where summary ~ '<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?\/?>'
        union all
        select source, id, 'body' as field from item
          where body ~ '<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?\/?>'
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
