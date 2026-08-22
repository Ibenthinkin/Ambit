// Fixture-based tests for the Library of Congress adapter — see __fixtures__/loc.json, recorded
// live 08-21-26 across four Margolies-scoped searches (diner, neon sign, motel, gas station).
//
// Four rows are untouched API responses. Three are marked `synthetic_*`: every one of the 70 rows
// in the live sample had an image, subjects, a creator and a date, and every one was inside the
// `mrg` collection — so the drop rules and the summary floor have no natural fixtures and are
// constructed by stripping a captured row instead.
import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/loc.json";
import {
  CLEARED_COLLECTIONS,
  isLocServable,
  loc,
  locCollectionOf,
  type LocRaw,
} from "./loc";

const raws = fixtures as unknown as LocRaw[];
const byPk = (pk: string) => {
  const found = raws.find((r) => r.pk === pk);
  if (!found) throw new Error(`fixture missing: ${pk}`);
  return found;
};

describe("CLEARED_COLLECTIONS", () => {
  it("records a rights statement verbatim rather than a public-domain claim", () => {
    // The Library says "no known restrictions", not "public domain" — the license string must not
    // quietly upgrade that. This test is the guard on the whole scoping design.
    const margolies = CLEARED_COLLECTIONS.find((c) => c.token === "mrg");
    expect(margolies?.license).toBe("No known restrictions on publication");
    expect(margolies?.license).not.toMatch(/public domain|CC0/i);
  });
});

describe("locCollectionOf / isLocServable", () => {
  it("accepts a Margolies photograph with a full image", () => {
    const raw = byPk("2017702223");
    expect(locCollectionOf(raw)?.token).toBe("mrg");
    expect(isLocServable(raw)).toBe(true);
  });

  it("rejects a result outside every cleared collection", () => {
    // The reason the guard exists: composing `q=mrg <query>` scoped correctly across every live
    // query sampled, but an item whose own `collection[]` doesn't say `mrg` is one whose rights
    // the constant does not cover, so it cannot be ingested.
    const raw = byPk("synthetic_outside_collection");
    expect(raw.collection).not.toContain("mrg");
    expect(locCollectionOf(raw)).toBeUndefined();
    expect(isLocServable(raw)).toBe(false);
  });

  it("rejects a result with no full image", () => {
    const raw = byPk("synthetic_no_image");
    expect(raw.image).toBeUndefined();
    expect(isLocServable(raw)).toBe(false);
  });
});

describe("loc.toItem", () => {
  it("normalizes a Margolies photograph", () => {
    const item = loc.toItem(byPk("2017702223"));
    expect(item.source).toBe("loc");
    expect(item.sourceId).toBe("2017702223");
    expect(item.type).toBe("image");
    expect(item.title).toMatch(/Scotty's Diner/);
    expect(item.imageUrl).toMatch(/^https:\/\/tile\.loc\.gov\//);
    expect(item.sourceUrl).toBe(
      "https://www.loc.gov/pictures/item/2017702223/",
    );
    expect(item.attribution).toBe("Margolies, John. Library of Congress");
    expect(item.license).toBe("No known restrictions on publication");
    expect(item.body).toBeNull();
  });

  it("unpacks LoC's double-hyphen subject headings into readable tags", () => {
    const item = loc.toItem(byPk("2017702223"));
    // "Diners (Restaurants)--1980-1990." becomes separate, unpunctuated tags.
    expect(item.tags.every((t) => !t.includes("--"))).toBe(true);
    expect(item.tags.every((t) => !t.endsWith("."))).toBe(true);
    expect(item.tags).toContain(
      "John Margolies Roadside America Photograph Archive",
    );
  });

  it("synthesizes a summary that clears the curator's 60-character floor", () => {
    const item = loc.toItem(byPk("2017702215"));
    expect(item.summary.length).toBeGreaterThan(60);
    expect(item.summary).toMatch(/Mickey's Diner/);
    expect(item.summary).toMatch(/John Margolies Roadside America/);
  });

  it("still produces a non-empty summary from a row with nothing but a title", () => {
    const item = loc.toItem(byPk("synthetic_bare"));
    expect(item.summary).toBe(
      "Scotty's Diner sign, Wilkinsburg, Pennsylvania. John Margolies Roadside America Photograph Archive",
    );
  });

  it("states 'unknown' rather than inventing rights for an uncleared row", () => {
    // toItem is a pure mapper and search() never hands it one of these — but if a caller does,
    // the honest answer is that this adapter knows nothing about the item's rights.
    const item = loc.toItem(byPk("synthetic_outside_collection"));
    expect(item.license).toBe("unknown");
    expect(item.attribution).toBe("Unknown. Library of Congress");
  });
});
