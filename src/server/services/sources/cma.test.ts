// Fixture-based tests for the CMA adapter — see __fixtures__/cma.json, recorded live 08-07-26
// against the "astronomy" and "machine" searches. New finding this task made (not in
// phase0/NOTES.md): CMA's `description` field carries raw HTML (`<em>`, `<br>`) — the fixture set
// includes real examples, and toItem() must strip it before the text becomes item.summary
// (CLAUDE.md: never render unsanitized source HTML — summary is meant to be safe plain text).
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/cma.json";
import { cma, isCmaServable, type CmaRaw } from "./cma";

const raws = fixtures as unknown as CmaRaw[];
const byId = (id: number) => {
  const found = raws.find((r) => r.id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("isCmaServable", () => {
  it("accepts a CC0 record with a web image and a title", () => {
    expect(isCmaServable(byId(163042))).toBe(true);
  });

  it("rejects a record whose images object is present but empty (no web.url)", () => {
    expect(byId(97763).images).toEqual({});
    expect(isCmaServable(byId(97763))).toBe(false);
  });

  it("rejects a non-CC0 record even with a full image + title", () => {
    expect(isCmaServable(byId(106386))).toBe(false);
  });
});

describe("cma.toItem", () => {
  it("strips HTML tags from the description before it lands in summary", () => {
    const item = cma.toItem(byId(163042));
    expect(item.summary).not.toMatch(/<[^>]+>/);
    expect(
      item.summary.startsWith("A recipient of the Grand Prix de Rome"),
    ).toBe(true);
  });

  it("collapses adjacent tags (e.g. <br><br>) into whitespace, not jammed-together words", () => {
    const item = cma.toItem(byId(106391));
    expect(item.summary).not.toContain("originated.Here"); // the <br><br> jam this test guards
    expect(item.summary).toContain("originated. Here");
  });

  it("leads the summary with description (prose-first, the source-level fix for the 0.2 lesson)", () => {
    const item = cma.toItem(byId(106354));
    const descIdx = item.summary.indexOf(
      "This engraving is part of the Tarocchi",
    );
    const creatorIdx = item.summary.indexOf("Master of the E-Series Tarocchi");
    expect(descIdx).toBe(0);
    expect(creatorIdx).toBeGreaterThan(descIdx);
  });

  it("normalizes the rest of the fields", () => {
    const item = cma.toItem(byId(163042));
    expect(item.source).toBe("cma");
    expect(item.sourceId).toBe("163042");
    expect(item.type).toBe("image");
    expect(item.title).toBe(
      "Apollo, God of Light, Eloquence, Poetry, and the Fine Arts with Urania, Muse of Astronomy",
    );
    expect(item.imageUrl).toBe(
      "https://openaccess-cdn.clevelandart.org/2003.6.3/2003.6.3_web.jpg",
    );
    expect(item.sourceUrl).toBe("https://clevelandart.org/art/2003.6.3");
    expect(item.tags).toEqual([
      "Painting",
      "Modern European Painting and Sculpture",
      "oil on canvas",
      "France, late 18th century",
    ]);
    expect(item.attribution).toBe(
      "Charles Meynier (French, 1768–1832). The Cleveland Museum of Art",
    );
    expect(item.license).toBe("CC0 1.0 (public domain)");
    expect(item.body).toBeNull();
  });

  it("handles an empty creators array without a stray leading '; '", () => {
    const item = cma.toItem(byId(97763));
    expect(item.attribution.startsWith("The Cleveland Museum of Art")).toBe(
      true,
    );
  });
});
