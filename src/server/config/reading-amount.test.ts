// The four reading amounts and the share of a page each one buys. "some" is pinned to the
// engine's own default so a reader who answers "Some" gets exactly the feed they'd have had
// without answering — the level is a dial around the default, never a different default.
import { describe, expect, it } from "vitest";

import { DEFAULT_KNOBS } from "~/server/services/feed-knobs";

import {
  READING_AMOUNTS,
  READING_LABELS,
  isReadingAmount,
  readingShare,
} from "./reading-amount";

describe("readingShare", () => {
  it("maps the four amounts to their shares", () => {
    expect(readingShare("none")).toBe(0);
    expect(readingShare("little")).toBe(0.0625);
    expect(readingShare("some")).toBe(0.125);
    expect(readingShare("lot")).toBe(0.25);
  });

  it("keeps 'some' equal to the engine's default writing share", () => {
    expect(readingShare("some")).toBe(DEFAULT_KNOBS.writingShare);
  });
});

describe("READING_AMOUNTS", () => {
  it("lists the four in display order, each with a label", () => {
    expect(READING_AMOUNTS).toEqual(["none", "little", "some", "lot"]);
    for (const a of READING_AMOUNTS) expect(READING_LABELS[a]).toBeTruthy();
  });
});

describe("isReadingAmount", () => {
  it("accepts the four and refuses anything else", () => {
    expect(isReadingAmount("lot")).toBe(true);
    expect(isReadingAmount("loads")).toBe(false);
    expect(isReadingAmount(null)).toBe(false);
  });
});
