import { describe, expect, it } from "vitest";

import {
  isWritingKind,
  READING_WPM,
  readingMinutes,
  WRITING_KIND_LABELS,
  WRITING_KINDS,
  writingText,
} from "./writing";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("WRITING_KINDS", () => {
  it("is the four kinds of D2, each with a label", () => {
    expect([...WRITING_KINDS]).toEqual([
      "essay",
      "curiosity",
      "criticism",
      "archive",
    ]);
    for (const k of WRITING_KINDS) expect(WRITING_KIND_LABELS[k]).toBeTruthy();
  });

  it("isWritingKind accepts the four and nothing else", () => {
    expect(isWritingKind("essay")).toBe(true);
    expect(isWritingKind("news")).toBe(false);
    expect(isWritingKind(3)).toBe(false);
  });
});

describe("writingText — apparatus stripped", () => {
  it("drops References / See also and everything under them", () => {
    const body = [
      "The lead paragraph.",
      "== History ==",
      "A real section.",
      "== See also ==",
      "Some other article",
      "== References ==",
      "Smith, J. (1901). A citation.",
    ].join("\n");
    const text = writingText(body);
    expect(text).toContain("The lead paragraph.");
    expect(text).toContain("A real section.");
    expect(text).not.toContain("Some other article");
    expect(text).not.toContain("citation");
  });

  it("returns an empty string for empty input", () => {
    expect(writingText("")).toBe("");
  });
});

describe("readingMinutes", () => {
  it(`is words / ${READING_WPM}, rounded up`, () => {
    expect(readingMinutes(words(READING_WPM))).toBe(1);
    expect(readingMinutes(words(READING_WPM + 1))).toBe(2);
    expect(readingMinutes(words(READING_WPM * 12))).toBe(12);
  });

  it("does not count the apparatus", () => {
    const body = `${words(READING_WPM)}\n== References ==\n${words(READING_WPM * 5)}`;
    expect(readingMinutes(body)).toBe(1);
  });

  it("is at least one minute for any real text", () => {
    expect(readingMinutes("A short paragraph of text.")).toBe(1);
  });

  it("is null with no body (a dek alone reads `READ`, D5)", () => {
    expect(readingMinutes(null)).toBeNull();
    expect(readingMinutes(undefined)).toBeNull();
    expect(readingMinutes("   ")).toBeNull();
  });
});
