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

  // `item.source` is an open set — Phase 6 adapters and the private ambit-archive/loupe sources
  // will all reach this function before anyone thinks to add them to the table.
  it("title-cases an unknown source rather than rendering nothing", () => {
    expect(sourceLabel("smithsonian")).toBe("Smithsonian");
    expect(sourceLabel("e2e")).toBe("E2e");
    expect(sourceLabel("")).toBe("");
  });
});
