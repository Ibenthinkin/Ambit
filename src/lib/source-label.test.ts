import { describe, expect, it } from "vitest";

import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("names each of the five v1 sources the way the source itself does", () => {
    expect(sourceLabel("wikipedia")).toBe("Wikipedia");
    expect(sourceLabel("met")).toBe("The Met");
    expect(sourceLabel("aic")).toBe("Art Institute of Chicago");
    expect(sourceLabel("cma")).toBe("Cleveland Museum of Art");
    expect(sourceLabel("wellcome")).toBe("Wellcome Collection");
  });

  it("names Phase 6.2's trial sources too", () => {
    // The fallback gets every one of these wrong ("Loc", "Nasa-images", "Poetrydb"), which is why
    // they are in the table rather than left to it.
    expect(sourceLabel("smithsonian")).toBe("Smithsonian Open Access");
    expect(sourceLabel("loc")).toBe("Library of Congress");
    expect(sourceLabel("nasa-images")).toBe("NASA Image Library");
    expect(sourceLabel("poetrydb")).toBe("PoetryDB");
  });

  it("names The Public Domain Review the way its masthead does", () => {
    // Without the table entry the fallback prints "Pdr" — a wrong claim on the credit line.
    expect(sourceLabel("pdr")).toBe("The Public Domain Review");
  });

  // `item.source` is an open set — future adapters and the private ambit-archive/loupe sources
  // will all reach this function before anyone thinks to add them to the table.
  it("title-cases an unknown source rather than rendering nothing", () => {
    expect(sourceLabel("archive")).toBe("Archive");
    expect(sourceLabel("e2e")).toBe("E2e");
    expect(sourceLabel("")).toBe("");
  });
});
