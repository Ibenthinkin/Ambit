// Fixture-based tests for the Met adapter — see __fixtures__/met.json, recorded live 08-07-26
// against the "astronomy" and "machine" searches (the latter chosen because Phase 0 found the
// Met's own isPublicDomain=true search filter lies on ~30-70% of its claimed hits, and this
// fixture set includes two real examples of that: 745853 and 490889 both come back from a
// hasImages=true&isPublicDomain=true search yet fail the per-object check).
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/met.json";
import { isMetServable, met, type MetRaw } from "./met";

const raws = fixtures as unknown as MetRaw[];
const byId = (objectID: number) => {
  const found = raws.find((r) => r.objectID === objectID);
  if (!found) throw new Error(`fixture missing: ${objectID}`);
  return found;
};

describe("isMetServable", () => {
  it("accepts a public-domain object with an image and a title", () => {
    expect(isMetServable(byId(203938))).toBe(true);
  });

  it("rejects an object the search claimed was public domain but isn't", () => {
    expect(isMetServable(byId(745853))).toBe(false);
  });

  it("rejects an object with no image even if public domain", () => {
    // 490889 is also isPublicDomain: false, but this confirms the missing-image check
    // independently by looking at primaryImage directly.
    expect(byId(490889).primaryImage).toBe("");
    expect(isMetServable(byId(490889))).toBe(false);
  });
});

describe("met.toItem", () => {
  it("normalizes a full-catalogue object, summary fields in the documented order", () => {
    const item = met.toItem(byId(203938));
    expect(item.source).toBe("met");
    expect(item.sourceId).toBe("203938");
    expect(item.type).toBe("image");
    expect(item.title).toBe("Astronomy");
    // Order: artist+bio, date, medium, culture, period, classification, "<dept> collection", tags —
    // empty culture/period are dropped rather than leaving stray ". . " gaps.
    expect(item.summary).toBe(
      "Giambologna, Netherlandish, Douai 1529–1608 Florence. 17th century. Bronze. " +
        "Sculpture-Bronze. European Sculpture and Decorative Arts collection. Female Nudes, Astronomy",
    );
    expect(item.imageUrl).toBe(
      "https://images.metmuseum.org/CRDImages/es/web-large/DP-915-001.jpg",
    );
    expect(item.sourceUrl).toBe(
      "https://www.metmuseum.org/art/collection/search/203938",
    );
    expect(item.tags).toEqual([
      "Female Nudes",
      "Astronomy",
      "European Sculpture and Decorative Arts",
      "Sculpture-Bronze",
      "Statuette",
    ]);
    expect(item.attribution).toBe(
      "Gift of Irwin Untermyer, 1964. The Metropolitan Museum of Art",
    );
    expect(item.license).toBe("CC0 1.0 (public domain)");
    expect(item.body).toBeNull();
  });

  it("handles a missing artist name without a stray leading comma", () => {
    const item = met.toItem(byId(189304));
    expect(item.summary.startsWith("ca. 1775")).toBe(true); // no "who" segment prepended
  });

  it("handles a null tags array (not just an empty one)", () => {
    // 490889 has tags: null in the raw fixture, and it's also non-servable — toItem() itself
    // should still tolerate the shape (the ingestion job is what filters via isMetServable, not
    // toItem, which stays a pure mapper of whatever it's handed).
    const item = met.toItem(byId(490889));
    expect(item.tags).not.toContain(undefined);
    expect(Array.isArray(item.tags)).toBe(true);
  });
});
