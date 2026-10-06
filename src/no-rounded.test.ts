// **DESIGN_redesign.md §3.4's "no radius except the nav pill and circular things", made
// executable** (redesign Task 1.5). Modelled on `no-dangerous-html.test.ts`: a source scan, not a
// lint plugin, because the rule is a short allow-list and a list is cheaper to read than a plugin
// is to write.
//
// The 1b look is square-cornered. Every `--radius-*` token in globals.css is now `0` except
// `--radius-pill`, so the ~40 files that still write `rounded-card`, `rounded-sheet`, `rounded-[14px]`
// and friends already *render* square — but they still carry the class, and Phase 2 deletes those
// classes component by component. This test is what proves Phase 2 finished the job: once it is
// switched on, a new `rounded-*` in a file that isn't listed below fails the build.
//
// STATUS: the assertion is `it.skip` until Task 2.9 (the end of the Phase 2 sweep) turns it on
// (skip -> it). It is written in full now so that (a) the allow-list and its reasons get reviewed
// today and (b) the offender count is measurable: run it with `it` instead of `it.skip` and the
// failure message lists every file still to clean. At the time of writing (Task 1.5):
//   30 files outside ALLOWED at Task 1.5:
//   src/components/dev/marks-bench.tsx
//   src/components/feed/dev/knob-panel.tsx
//   src/components/feed/tile-actions.tsx
//   src/components/install/install-banner.tsx
//   src/components/install/install-confirmation.tsx
//   src/components/install/install-sheet.tsx
//   src/components/item/join-cta.tsx
//   src/components/item/link-out-row.tsx
//   src/components/item/shared-by-row.tsx
//   src/components/item/wander-next.tsx
//   src/components/landing/auth-card.tsx
//   src/components/landing/auth-sheet.tsx
//   src/components/landing/landing-screen.tsx
//   src/components/onboarding/exhibition-card.tsx
//   src/components/profile/topics-screen.tsx
//   src/components/saved/saved-screen.tsx
//   src/components/saved/saved-tile.tsx
//   src/components/settings/settings-row.tsx
//   src/components/sheets/collection-rows.tsx
//   src/components/sheets/item-sheet.tsx
//   src/components/sheets/share-sheet.tsx
//   src/components/ui/bottom-sheet.tsx
//   src/components/ui/button.tsx
//   src/components/ui/card.tsx
//   src/components/ui/chip.tsx
//   src/components/ui/icon-button.tsx
//   src/components/ui/input.tsx
//   src/components/ui/segmented.tsx
//   src/components/ui/textarea.tsx
//   src/components/ui/toast.tsx
// The scan also matches `rounded-` inside comments, so a comment that merely mentions the
// utility (ui/button.tsx's does) counts as an offender until it is reworded.
// A live `it` below proves the walker itself works, so this file isn't dead weight meanwhile.
//
// Test files (`*.test.tsx`) are skipped: they assert on class names (`expect(el).toHaveClass(
// "rounded-pill")`) and are rewritten together with the component they cover.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src", import.meta.url).pathname;

/**
 * Files allowed to contain a `rounded-*` utility, each with the reason. Repo-relative paths with
 * forward slashes. Adding to this list should feel like the deliberate decision it is.
 */
const ALLOWED: Record<string, string> = {
  "src/components/ui/pill-toolbar.tsx":
    "the phone nav toolbar — the one pill the design keeps (production, not restyled)",
  "src/components/ui/rail-toolbar.tsx":
    "the desktop nav rail — the same pill, rotated; its detached share disc is circular too",
  "src/components/ui/avatar-chip.tsx": "the profile avatar — a circle",
  "src/components/ui/loader.tsx":
    "the loader's orbiting dot and ring — circular things",
  "src/components/item/spread-toggle.tsx":
    "lives inside the rail, so it wears the rail's round chrome",
};

/**
 * `rounded-full` is also fine on a 6 / 7 / 9 px dot (the accent bullet, wander-row markers, the
 * progress tick). A dot is recognised by its own size classes appearing in the same class string.
 */
const DOT_SIZES = ["size-[6px]", "size-[7px]", "size-[9px]"];

/** Every `.tsx` file under `src/` that isn't a test. A small recursive walk — no glob dependency. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      found.push(full);
    }
  }
  return found;
}

/** `/Users/…/src/app/layout.tsx` → `src/app/layout.tsx`. */
function repoPath(absolute: string): string {
  return "src/" + relative(SRC, absolute).split(sep).join("/");
}

// A rounding utility: `rounded-card`, `md:rounded-[14px]`, `rounded-t-sheet`, `rounded-full`.
// `rounded-none` is the absence of rounding, so it is never an offence.
const ROUNDED = /(?<![\w-])rounded-(?!none\b)[\w[\]./%-]*/g;

/**
 * The `rounded-*` utilities in a file that are NOT excused by the DOTS allowance. Works line by
 * line: Prettier never splits a string literal, so a dot's `rounded-full` and `size-[6px]` share a
 * line.
 */
function roundedUses(source: string): string[] {
  const uses: string[] = [];
  for (const line of source.split("\n")) {
    for (const match of line.matchAll(ROUNDED)) {
      const isDot =
        match[0] === "rounded-full" &&
        DOT_SIZES.some((size) => line.includes(size));
      if (!isDot) uses.push(match[0]);
    }
  }
  return uses;
}

/** Files outside ALLOWED that still carry a rounding utility, with what they carry. */
function offenders(): string[] {
  return sourceFiles(SRC)
    .map((file) => ({
      path: repoPath(file),
      uses: roundedUses(readFileSync(file, "utf8")),
    }))
    .filter(({ path, uses }) => uses.length > 0 && !(path in ALLOWED))
    .map(({ path, uses }) => `${path}: ${[...new Set(uses)].join(", ")}`)
    .sort();
}

describe("1b is square-cornered", () => {
  it("the walker finds rounded- uses in the allow-listed files", () => {
    // Proves the scan is reading real source: the pill toolbar must contain a rounding utility,
    // and a dot must be excused while a bare `rounded-full` is not.
    const pill = readFileSync(
      join(SRC, "components/ui/pill-toolbar.tsx"),
      "utf8",
    );
    expect(roundedUses(pill).length).toBeGreaterThan(0);
    expect(roundedUses('<i className="size-[6px] rounded-full" />')).toEqual(
      [],
    );
    expect(roundedUses('<i className="size-4 rounded-full" />')).toEqual([
      "rounded-full",
    ]);
    expect(roundedUses('<i className="rounded-none" />')).toEqual([]);
    for (const path of Object.keys(ALLOWED)) {
      expect(sourceFiles(SRC).map(repoPath)).toContain(path);
    }
  });

  // Task 2.9 turns this on (skip -> it). Currently 30 files offend (listed in the header).
  it.skip("no file outside ALLOWED uses a rounded-* utility", () => {
    const found = offenders();
    expect(
      found,
      `rounded-* outside the allow-list (DESIGN §3.4) — remove it, or add the file to ALLOWED with a reason:\n${found.join("\n")}`,
    ).toEqual([]);
  });
});
