// **DESIGN_redesign.md §3.4's "no radius except the nav pill and circular things", made
// executable** (redesign Task 1.5). Modelled on `no-dangerous-html.test.ts`: a source scan, not a
// lint plugin, because the rule is a short allow-list and a list is cheaper to read than a plugin
// is to write.
//
// The 1b look is square-cornered. Every `--radius-*` token is gone except `--radius-pill`, and
// Phase 2 removed the rounding classes component by component; Task 2.9 (the end of the sweep)
// cleared the last 30 offending files and switched the assertion below on. From here a new
// `rounded-*` in a file that isn't listed in ALLOWED (and isn't a DOTS dot) fails the build.
//
// The scan also matches `rounded-` inside comments, so a comment that merely mentions the
// utility counts as an offender — reword it rather than allow-listing the file.
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
  // Added by Task 2.9 — each one a genuine circle, everything else in the file is square:
  "src/components/saved/saved-tile.tsx":
    "the remove-bookmark disc over a saved picture — a circular control, like the share disc",
  "src/components/landing/landing-screen.tsx":
    "the floating 54 px logo disc that re-opens the sign-in sheet — a circular control",
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

  // Live since Task 2.9 (it was `it.skip` through Phase 1 and the primitives).
  it("no file outside ALLOWED uses a rounded-* utility", () => {
    const found = offenders();
    expect(
      found,
      `rounded-* outside the allow-list (DESIGN §3.4) — remove it, or add the file to ALLOWED with a reason:\n${found.join("\n")}`,
    ).toEqual([]);
  });
});
