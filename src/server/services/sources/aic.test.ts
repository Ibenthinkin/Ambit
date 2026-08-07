// Fixture-based tests for the AIC adapter — see __fixtures__/aic.json, recorded live 08-07-26
// against the "astronomy" search. AIC's search has no public-domain filter at all (unlike the
// Met's unreliable one), so every hit needs the same per-record check; the fixture set includes
// one record where `is_public_domain` is simply ABSENT (undefined, not false) to make sure the
// servability check treats that as "no" rather than accidentally passing.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/aic.json";
import { isAicServable, aic, aicImageUrl, type AicRaw } from "./aic";

const raws = fixtures as unknown as AicRaw[];
const byId = (id: number) => {
  const found = raws.find((r) => r.id === id);
  if (!found) throw new Error(`fixture missing: ${id}`);
  return found;
};

describe("isAicServable", () => {
  it("accepts a public-domain record with an image_id and a title", () => {
    expect(isAicServable(byId(80192))).toBe(true);
  });

  it("rejects a record where is_public_domain is explicitly false", () => {
    expect(isAicServable(byId(200358))).toBe(false);
  });

  it("rejects a record where is_public_domain is simply absent", () => {
    expect("is_public_domain" in byId(158950)).toBe(false);
    expect(isAicServable(byId(158950))).toBe(false);
  });
});

describe("aicImageUrl", () => {
  it("constructs a fit-in-box IIIF URL, never the plain-width form", () => {
    const url = aicImageUrl("214ecedb-77b1-6108-5e4a-7b7e961232ca");
    expect(url).toBe(
      "https://www.artic.edu/iiif/2/214ecedb-77b1-6108-5e4a-7b7e961232ca/full/!843,843/0/default.jpg",
    );
    // The trap from phase0/NOTES.md: a plain width request ("843,") 403s on any original
    // narrower than 843px because IIIF servers reject upscales — "!843,843" (fit-in-box) doesn't.
    expect(url).not.toContain("/full/843,/");
  });
});

describe("aic.toItem", () => {
  it("normalizes a record, summary fields in the documented order, newline-joined artist collapsed", () => {
    const item = aic.toItem(byId(80192));
    expect(item.source).toBe("aic");
    expect(item.sourceId).toBe("80192");
    expect(item.type).toBe("image");
    expect(item.title).toBe("Astronomy");
    expect(item.summary).toBe(
      "Eloy Bonnejonne (Flemish, c. 1630-1695), after Francesco Primaticcio (Italian, 1504-1570). " +
        "n.d.. Etching printed in black on paper. Flanders. print. Prints and Drawings collection. " +
        "print, paper (fiber product), prints and drawing",
    );
    expect(item.imageUrl).toBe(
      "https://www.artic.edu/iiif/2/214ecedb-77b1-6108-5e4a-7b7e961232ca/full/!843,843/0/default.jpg",
    );
    expect(item.sourceUrl).toBe("https://www.artic.edu/artworks/80192");
    expect(item.tags).toEqual([
      "print",
      "paper (fiber product)",
      "prints and drawing",
      "Prints and Drawings",
    ]);
    expect(item.attribution).toBe(
      "Eloy Bonnejonne (Flemish, c. 1630-1695), after Francesco Primaticcio (Italian, 1504-1570). " +
        "The Art Institute of Chicago",
    );
    expect(item.license).toBe("CC0 1.0 (public domain)");
    expect(item.body).toBeNull();
  });
});
