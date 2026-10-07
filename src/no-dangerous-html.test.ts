// **SPEC §11's "never raw `dangerouslySetInnerHTML` on source data", made executable** (Phase 7.2,
// T5, decision D7).
//
// Ambit's whole corpus is text somebody else wrote — museum object descriptions, Wikipedia
// extracts, blog article bodies. Rendered as HTML, any one of them is a stored-XSS vector. The app
// renders every one of them as a React text node instead (`reader-item-body.tsx` walks
// `parseReaderBlocks()` output; blogs pass through `htmlToText()` at ingest), and this test is what
// keeps it that way: a source scan, not a lint plugin, because the rule is a whitelist of exactly
// one file and a whitelist is cheaper to read than a plugin is to write.
//
// There is no permitted use. The one exception (the pre-paint accent script in `app/layout.tsx`)
// went with the accent knob in redesign Task 1.3. If a use ever becomes genuinely necessary,
// adding it to ALLOWED should feel like the deliberate decision it is.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src", import.meta.url).pathname;

/**
 * Files allowed to contain `dangerouslySetInnerHTML` — none. Paths are repo-relative with forward
 * slashes so the assertion message reads the same on any platform.
 */
const ALLOWED: string[] = [];

/** Every `.tsx`/`.ts` file under `src/`, minus this file itself. A small recursive walk — no glob dependency. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/** `/Users/…/src/app/layout.tsx` → `src/app/layout.tsx`. */
function repoPath(absolute: string): string {
  return "src/" + relative(SRC, absolute).split(sep).join("/");
}

describe("no source text is ever rendered as HTML", () => {
  it("no file uses dangerouslySetInnerHTML", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith("no-dangerous-html.test.ts"))
      .filter((file) =>
        readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"),
      )
      .map(repoPath)
      .sort();

    expect(offenders).toEqual(ALLOWED);
  });
});
