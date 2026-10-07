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
    expect(block).toContain(
      ":not(.motion-gentle, .motion-gentle *, .motion-lift),",
    );
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::before");
    expect(block).toContain(":not(.motion-gentle, .motion-gentle *)::after");
    expect(block).not.toMatch(/^\s*\*,\s*$/m);
  });

  // The feed tile's lift (docs/PLAN_tile-hover.md, 10-04-26) runs under Reduce Motion by the
  // design's own rule: a 3.5% scale is not the motion that setting targets, and Ben — who has it
  // on — would read a snap as a bug. Only the element itself is exempt, never its subtree: the
  // strip's fade, the badge's fill and the ring still collapse.
  it("exempts the .motion-lift element itself, and not its children", () => {
    expect(block).toContain(".motion-lift)");
    expect(block).not.toContain(".motion-lift *");
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

  // The loader's three motions (docs/LoaderAnimation/). Without them it is a static dot, and
  // nothing in jsdom would notice.
  it("emits the loader's ring, orbit and reach", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toContain("@keyframes loader-ring");
    expect(out.css).toContain("@keyframes loader-orbit");
    expect(out.css).toContain("@keyframes loader-reach");
  }, 60_000);

  // The Lift's three tokens (docs/PLAN_tile-hover.md Task 1). A theme token Tailwind sees no
  // utility for is dropped from the build, so this fails if nothing in src uses them. The shadow
  // is INLINED by `shadow-*` (into `--tw-shadow`), so its value is what to look for, not its
  // variable name; the ease and colour come through as variables.
  it("emits the tile lift's shadow, ease and focus-ring tokens", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toContain("0 14px 34px");
    expect(out.css).toContain("--ease-lift");
    expect(out.css).toContain("--color-focus-ring");
  }, 60_000);

  // Task 1.4: one base rule gives every control a keyboard ring; the tile's utility overrides only
  // the offset because utilities are a later layer than base.
  it("emits the base keyboard-focus ring", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    expect(out.css).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*3px/);
    expect(out.css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  }, 60_000);

  // The 1b tokens (docs/DESIGN_redesign.md 3.1, 3.4). Tailwind emits a theme variable only when a
  // utility uses it, so this proves the tokens are declared and emitted (not that every use is correct).
  it("emits the 1b surfaces, dialog/popover shadows and the mono face", async () => {
    const from = join(__dirname, "globals.css");
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8"),
      { from },
    );
    for (const token of [
      "--color-dialog",
      "--color-card",
      "--shadow-dialog",
      "--shadow-popover",
      "--font-mono",
    ]) {
      expect(out.css).toContain(token);
    }
  }, 60_000);
});

// One accent (redesign Task 1.3). The knob was deleted from `@theme inline` and the plain-`@theme`
// replacement was initially forgotten, so `bg-accent` & co. resolved to nothing and no test noticed.
// Tailwind emits a theme variable only when something uses it, so the probe rule below references
// all three — then the compiled output must carry the real values.
describe("globals.css accent tokens", () => {
  it("defines accent, on-accent and a focus ring that is the accent", async () => {
    const from = join(__dirname, "globals.css");
    const probe =
      ".probe{color:var(--color-accent);background:var(--color-on-accent);outline-color:var(--color-focus-ring)}";
    const out = await postcss([tailwind()]).process(
      readFileSync(from, "utf8") + probe,
      { from },
    );
    expect(out.css).toMatch(/--color-accent:\s*#2bb24c/i);
    expect(out.css).toMatch(/--color-on-accent:\s*#0e0e0e/i);
    expect(out.css).toMatch(/--color-focus-ring:\s*var\(--color-accent\)/);
  }, 60_000);
});
