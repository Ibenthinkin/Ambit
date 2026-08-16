import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins static class names", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });

  it("drops falsy conditional values", () => {
    expect(cn("px-2", false && "hidden", undefined, "text-sm")).toBe(
      "px-2 text-sm",
    );
  });

  it("resolves conflicting Tailwind utilities, keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  // Regression guards for the two custom utilities in globals.css. Both are classes tailwind-
  // merge can't classify on its own, and in both cases the failure mode is SILENT: it decides the
  // class is a color utility in the same group as the one next to it and drops it, so the element
  // just quietly renders without the 0.5px border / gradient. `border-hairline` shipped broken
  // this way across every primitive in 5.1 and wasn't caught until 5.2.
  it("keeps border-hairline alongside a border color (custom border-w group)", () => {
    const result = cn("border-hairline", "border-ink/12");
    expect(result).toContain("border-hairline");
    expect(result).toContain("border-ink/12");
  });

  it("keeps bg-avatar-gradient alongside a background color (custom bg-image group)", () => {
    const result = cn("bg-avatar-gradient", "bg-ink/5");
    expect(result).toContain("bg-avatar-gradient");
    expect(result).toContain("bg-ink/5");
  });
});
