import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The global reduced-motion rule collapses every duration in the app to 0.01 ms. The landing's
// reel and overture opt out (docs/DESIGN_landing-redo.md D6, 09-26-26): their reduced-motion
// version is opacity-only fades that *are* the accessible behaviour, and a selector slip here would
// make them instant — indistinguishable from the bug it replaced. The e2e suite measures the
// computed durations (e2e/home.spec.ts); this pins the selector so a stylesheet edit can't drop it
// unnoticed.
describe("globals.css reduced motion", () => {
  const css = readFileSync(join(__dirname, "globals.css"), "utf8");
  const block = css.slice(
    css.indexOf("@media (prefers-reduced-motion: reduce)"),
  );

  it("exempts the .motion-gentle subtrees from the 0.01 ms collapse", () => {
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *),");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::before");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::after");
    expect(block).not.toMatch(/^\s*\*,\s*$/m);
  });
});
