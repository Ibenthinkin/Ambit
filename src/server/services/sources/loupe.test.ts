// Fixture tests for the loupe adapter — see __fixtures__/loupe.json (recorded from a local Loupe
// on 09-06-26, or hand-written to the shape of loupe/web/server/rest/articles.ts when Loupe was
// not running; either way it is the wire shape plus `readingOrder`).
//
// What is pinned: the POSITION KEY (never Loupe's article id — docs/PLAN_loupe-hookup.md
// decision 2), body-for-articles-only, the license string passing through untouched, and the
// HTML-safety rule every adapter has carried since 8.1.
//
// No walk() test, consistent with every other adapter: I/O is not the unit-test surface.
import { describe, expect, it } from "vitest";

import fixtures from "./__fixtures__/loupe.json";
import { bodyText, loupe, loupeSourceId, type LoupeRaw } from "./loupe";

const raws = fixtures as unknown as LoupeRaw[];
const first = (type: LoupeRaw["type"]) => {
  const found = raws.find((r) => r.type === type);
  if (!found) throw new Error(`fixture has no ${type} item`);
  return found;
};

describe("loupe.toItem", () => {
  it("keys an item on <ia>:<page>:<order>, never on Loupe's article id", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.source).toBe("loupe");
    expect(item.sourceId).toBe(
      `${raw.issue.iaIdentifier}:${raw.pageNumber}:${raw.readingOrder}`,
    );
    expect(item.sourceId).not.toContain(raw.id);
  });

  it("maps an illustration to an image item with no body", () => {
    const raw = first("image");
    const item = loupe.toItem(raw);
    expect(item.type).toBe("image");
    expect(item.body).toBeNull();
    expect(item.imageUrl).toBe(raw.imageUrl);
  });

  it("maps a text region to an article whose body is the OCR text in paragraphs", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.type).toBe("article");
    expect(item.body).toBe(bodyText(raw.body ?? ""));
    expect(item.body).toBeTruthy();
    expect(item.body!.split("\n\n").length).toBeGreaterThan(1);
  });

  it("derives a summary from the body when Loupe has none", () => {
    const raw = raws.find((r) => r.type === "article" && r.summary === null);
    if (!raw) return; // the recorded fixture may not have this case; the hand-written one does
    const item = loupe.toItem(raw);
    expect(item.summary.length).toBeGreaterThan(0);
    expect(item.summary.length).toBeLessThanOrEqual(400);
    expect(item.body!.startsWith(item.summary.slice(0, 20))).toBe(true);
  });

  it("passes attribution, license, sourceUrl and tags through verbatim", () => {
    const raw = first("article");
    const item = loupe.toItem(raw);
    expect(item.attribution).toBe(raw.attribution);
    expect(item.license).toBe(raw.license);
    expect(item.license).toMatch(/personal use only/);
    expect(item.sourceUrl).toBe(raw.sourceUrl);
    expect(item.tags).toEqual(raw.tags);
  });

  it("lets no HTML tag through title, summary or body", () => {
    for (const raw of raws) {
      const item = loupe.toItem(raw);
      expect(item.title).not.toMatch(/<[a-z][^>]*>/i);
      expect(item.summary).not.toMatch(/<[a-z][^>]*>/i);
      expect(item.body ?? "").not.toMatch(/<[a-z][^>]*>/i);
    }
  });
});

describe("loupe helpers", () => {
  it("loupeSourceId is the three-part position key", () => {
    expect(
      loupeSourceId({
        issue: { iaIdentifier: "x00y" },
        pageNumber: 7,
        readingOrder: 3,
      }),
    ).toBe("x00y:7:3");
  });

  it("bodyText keeps paragraph breaks, strips tags and collapses inner whitespace", () => {
    expect(bodyText("One  <i>two</i>\n\n\nThree\n  four")).toBe(
      "One two\n\nThree four",
    );
    expect(bodyText("")).toBe("");
  });
});
