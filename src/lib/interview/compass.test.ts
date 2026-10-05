import { describe, expect, it } from "vitest";

import { compassFrom, compassSentence } from "./compass";

describe("compassFrom", () => {
  it("is null with nothing chosen", () => {
    expect(compassFrom([])).toBeNull();
  });
  it("averages each axis", () => {
    expect(
      compassFrom([
        { wild: 1, old: 0.5, still: 0, far: -1 },
        { wild: 0, old: 0.5, still: 1, far: 0 },
      ]),
    ).toEqual({ wild: 0.5, old: 0.5, still: 0.5, far: -0.5 });
  });
});

describe("compassSentence", () => {
  it("names only the axes past the threshold, in order, joined with commas and 'and'", () => {
    expect(compassSentence({ wild: 0.6, old: 0.5, still: 0.4, far: 0.3 })).toBe(
      "You’d travel for wild places over cities, the old over the new, quiet over crowds and a long way from home.",
    );
    expect(compassSentence({ wild: -0.5, old: 0.1, still: -0.2, far: 0 })).toBe(
      "You’d travel for cities over wild places and crowds over quiet.",
    );
  });
  it("is empty when every axis is within the threshold", () => {
    expect(compassSentence({ wild: 0.1, old: -0.1, still: 0, far: 0.15 })).toBe(
      "",
    );
  });
  it("one axis reads as a plain sentence", () => {
    expect(compassSentence({ wild: 0, old: 0, still: 0, far: 0.9 })).toBe(
      "You’d travel for a long way from home.",
    );
  });
});
