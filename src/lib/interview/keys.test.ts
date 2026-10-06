import { describe, expect, it } from "vitest";
import { keyAction, type KeyAction, type KeyKind } from "./keys";

const IGNORE: KeyAction = { type: "ignore" };
const cursor = (index: number): KeyAction => ({ type: "cursor", index });
const pick = (index: number): KeyAction => ({ type: "pick", index });

type Row = [key: string, cur: number | null, count: number, want: KeyAction];

function table(kind: KeyKind, rows: Row[]) {
  it.each(rows)(`${kind}: %s, cursor %s of %s`, (key, cur, count, want) => {
    expect(keyAction(kind, key, cur, count)).toEqual(want);
  });
}

describe("rooms (four cards, 1-4, N)", () => {
  table("rooms", [
    ["ArrowRight", null, 4, cursor(0)], // first press lands on the first card
    ["ArrowDown", null, 4, cursor(0)],
    ["ArrowLeft", null, 4, cursor(3)], // backwards from nowhere lands on the last
    ["ArrowUp", null, 4, cursor(3)],
    ["ArrowRight", 0, 4, cursor(1)],
    ["ArrowDown", 1, 4, cursor(2)],
    ["ArrowLeft", 2, 4, cursor(1)],
    ["ArrowRight", 3, 4, cursor(0)], // wraps at the end
    ["ArrowLeft", 0, 4, cursor(3)], // wraps at the start
    ["Enter", 2, 4, pick(2)],
    ["Enter", null, 4, IGNORE], // nothing under the cursor
    ["1", null, 4, pick(0)],
    ["4", 1, 4, pick(3)],
    ["5", null, 4, IGNORE],
    ["0", null, 4, IGNORE],
    ["n", 2, 4, { type: "none" }],
    ["N", null, 4, { type: "none" }],
    ["b", 0, 4, IGNORE],
    ["x", 0, 4, IGNORE],
    ["Tab", 0, 4, IGNORE],
    [" ", 0, 4, IGNORE],
  ]);
  it("a three-card face refuses 4", () => {
    expect(keyAction("rooms", "4", null, 3)).toEqual(IGNORE);
  });
  it("an empty face ignores everything", () => {
    expect(keyAction("rooms", "ArrowRight", null, 0)).toEqual(IGNORE);
    expect(keyAction("rooms", "1", null, 0)).toEqual(IGNORE);
  });
});

describe("read (four article cards, same keys as rooms)", () => {
  table("read", [
    ["ArrowRight", null, 4, cursor(0)],
    ["ArrowLeft", 0, 4, cursor(3)],
    ["Enter", 1, 4, pick(1)],
    ["3", null, 4, pick(2)],
    ["n", null, 4, { type: "none" }],
    ["b", null, 4, IGNORE],
  ]);
});

describe("pairs (left, right, both)", () => {
  table("pairs", [
    ["ArrowLeft", null, 2, pick(0)],
    ["ArrowRight", null, 2, pick(1)],
    ["ArrowLeft", 1, 2, pick(0)], // a cursor changes nothing here
    ["b", null, 2, { type: "both" }],
    ["B", 0, 2, { type: "both" }],
    ["ArrowUp", null, 2, IGNORE],
    ["ArrowDown", null, 2, IGNORE],
    ["Enter", 0, 2, IGNORE],
    ["1", null, 2, IGNORE],
    ["n", null, 2, IGNORE],
  ]);
});

describe("keep (left passes, right keeps)", () => {
  table("keep", [
    ["ArrowLeft", null, 1, { type: "pass" }],
    ["ArrowRight", null, 1, { type: "keep" }],
    ["ArrowUp", null, 1, IGNORE],
    ["Enter", null, 1, IGNORE],
    ["b", null, 1, IGNORE],
    ["1", null, 1, IGNORE],
  ]);
});

describe("travel and avoid (a long list: arrows wrap, Enter toggles)", () => {
  for (const kind of ["travel", "avoid"] as const) {
    table(kind, [
      ["ArrowRight", null, 9, cursor(0)],
      ["ArrowLeft", null, 9, cursor(8)],
      ["ArrowRight", 8, 9, cursor(0)],
      ["ArrowLeft", 0, 9, cursor(8)],
      ["ArrowDown", 4, 9, cursor(5)],
      ["Enter", 4, 9, pick(4)],
      ["Enter", null, 9, IGNORE],
      ["1", null, 9, IGNORE], // digits are for the four-card screens only
      ["n", null, 9, IGNORE],
    ]);
  }
});

describe("keys a kind does not own", () => {
  for (const kind of ["text", "bonus", "none"] as const) {
    it.each([
      "a",
      "n",
      "b",
      "1",
      "Enter",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "Backspace",
    ])(`${kind} ignores %s`, (key) => {
      expect(keyAction(kind, key, 0, 4)).toEqual(IGNORE);
    });
  }
});

describe("intro, stale cursors and tiny lists", () => {
  it.each(["Enter", "1", "2", "3", "4"])("intro: %s is next", (key) => {
    expect(keyAction("intro", key, null, 0)).toEqual({ type: "next" });
  });
  it.each(["5", "n", "b", "ArrowRight", "a"])("intro ignores %s", (key) => {
    expect(keyAction("intro", key, null, 0)).toEqual(IGNORE);
  });
  it("Enter on a cursor beyond count is ignored", () => {
    expect(keyAction("rooms", "Enter", 5, 4)).toEqual(IGNORE);
    expect(keyAction("travel", "Enter", 9, 9)).toEqual(IGNORE);
  });
  it("count 1 wraps to 0", () => {
    expect(keyAction("rooms", "ArrowRight", 0, 1)).toEqual(cursor(0));
    expect(keyAction("rooms", "ArrowLeft", 0, 1)).toEqual(cursor(0));
  });
});
