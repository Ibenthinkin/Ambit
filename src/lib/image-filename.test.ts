// Phase 7.3, decision D8. Small, but it is the only thing standing between a WebP and a `.jpg`
// name that lies to the reader's operating system.
import { describe, expect, it } from "vitest";

import { imageFileName } from "./image-filename";

describe("imageFileName", () => {
  it("follows the type the proxy actually served", () => {
    expect(imageFileName("abc", "image/webp")).toBe("abc.webp");
    expect(imageFileName("abc", "image/jpeg")).toBe("abc.jpg");
    expect(imageFileName("abc", "image/png")).toBe("abc.png");
  });

  it("ignores parameters and case on the media type", () => {
    expect(imageFileName("abc", "IMAGE/WEBP; charset=binary")).toBe("abc.webp");
  });

  // A blob with no type is what an old service-worker entry (cached before 7.3) or an unusual
  // browser can hand back. A familiar extension beats none.
  it("falls back to .jpg for an unknown or absent type", () => {
    expect(imageFileName("abc", "")).toBe("abc.jpg");
    expect(imageFileName("abc", "application/octet-stream")).toBe("abc.jpg");
  });
});
