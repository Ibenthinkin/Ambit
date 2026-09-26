import { readFileSync } from "node:fs";
import { join } from "node:path";

import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
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

// Tailwind v4 emits a `@keyframes` declared inside `@theme` only when an `--animate-*` token uses
// it. The landing's two were declared there with no token, so the production CSS never had them:
// the overture's fade-in and the dissolve's drift were animation names pointing at nothing, from
// 8.3's first build until the 09-26-26 final review found the wordmark sitting at opacity 1 on
// its first frame. Compiled here the way the build compiles it, because only the output can say.
describe("globals.css keyframes survive the Tailwind build", () => {
  it("emits overture-in and reel-drift", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toContain("@keyframes overture-in");
    expect(out.css).toContain("@keyframes reel-drift");
  }, 60_000);
});
