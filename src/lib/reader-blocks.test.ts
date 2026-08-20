import { describe, expect, it } from "vitest";

import { parseReaderBlocks } from "./reader-blocks";

describe("parseReaderBlocks", () => {
  it("reads a section's `=` depth as its rank", () => {
    const blocks = parseReaderBlocks(
      ["== Orbit ==", "It goes around.", "=== Perihelion ===", "Closest."].join(
        "\n",
      ),
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "Orbit" },
      { kind: "paragraph", text: "It goes around." },
      { kind: "subheading", text: "Perihelion" },
      { kind: "paragraph", text: "Closest." },
    ]);
  });

  it("drops an apparatus section along with everything under it", () => {
    const blocks = parseReaderBlocks(
      [
        "== Orbit ==",
        "It goes around.",
        "== References ==",
        "Smith, J. (1998). A Book.",
        "Jones, K. (2004). Another Book.",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "Orbit" },
      { kind: "paragraph", text: "It goes around." },
    ]);
  });

  // The drop is a *region*, not a single line — but it has to end, or a "See also" two thirds of
  // the way down would swallow the rest of the article.
  it("ends the dropped region at the next section that isn't apparatus", () => {
    const blocks = parseReaderBlocks(
      [
        "== See also ==",
        "Some other article",
        "== Discovery ==",
        "Found in 1846.",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "Discovery" },
      { kind: "paragraph", text: "Found in 1846." },
    ]);
  });

  it("recognizes apparatus headings at any depth and in any casing", () => {
    const blocks = parseReaderBlocks(
      ["=== external LINKS ===", "https://example.test", "== Life =="].join(
        "\n",
      ),
    );

    expect(blocks).toEqual([{ kind: "heading", text: "Life" }]);
  });

  // What the extract API leaves behind when it flattens a formula.
  it("drops lines with fewer than three characters of actual content", () => {
    const blocks = parseReaderBlocks(
      ["=", "+ -", "( x )", "12.", "Mass is conserved."].join("\n"),
    );

    expect(blocks).toEqual([{ kind: "paragraph", text: "Mass is conserved." }]);
  });

  // Every row ingested before 5.7 looks like this: real prose, no markers anywhere.
  it("degrades a marker-less body to all paragraphs", () => {
    const blocks = parseReaderBlocks(
      "First paragraph.\n\nSecond paragraph.\n   \nThird paragraph.",
    );

    expect(blocks).toEqual([
      { kind: "paragraph", text: "First paragraph." },
      { kind: "paragraph", text: "Second paragraph." },
      { kind: "paragraph", text: "Third paragraph." },
    ]);
  });

  it("returns nothing for an empty or whitespace-only body", () => {
    expect(parseReaderBlocks("")).toEqual([]);
    expect(parseReaderBlocks("  \n\t\n ")).toEqual([]);
  });
});
