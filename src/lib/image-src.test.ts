import { describe, expect, it } from "vitest";

import { imageSrc } from "./image-src";

// The one rule for what an `<img src>` for an item may be. CSP is `img-src 'self' data: blob:`
// (src/config/security-headers.js), so anything else is blocked by the browser outright.
describe("imageSrc", () => {
  it("routes a remote image through Ambit's own proxy, keyed by item id", () => {
    expect(imageSrc("item-1", "https://images.metmuseum.org/a.jpg")).toBe(
      "/api/img/item-1",
    );
  });

  it("passes an inline data: URI through untouched — there is nothing to proxy", () => {
    const pixel = "data:image/png;base64,iVBORw0KGgo=";
    expect(imageSrc("item-1", pixel)).toBe(pixel);
  });
});
