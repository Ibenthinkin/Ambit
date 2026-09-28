import { describe, expect, it } from "vitest";

import { weightOf } from "~/server/config/topic-levels";

import { groupState, toggleGroup, toggleTopic } from "./picks";

// docs/DESIGN_onboarding-interview.md §2 "What a list pick writes" — these tests pin the pure
// group/member rule `picks.ts` implements, so weights are always read off `weightOf`, never
// written as literals here.

describe("toggleGroup", () => {
  it("on a group none of whose members are present adds every member at pickWeight(members.length)", () => {
    // Two members → the "taking a bundle" case → both at "some".
    const twoUp = toggleGroup(new Map(), ["astronomy", "moon"]);
    expect(twoUp.get("astronomy")).toBe(weightOf("some"));
    expect(twoUp.get("moon")).toBe(weightOf("some"));

    // One member → naming a single topic → "lot" (pickWeight's sibling rule, review focus 3).
    const oneUp = toggleGroup(new Map(), ["japan"]);
    expect(oneUp.get("japan")).toBe(weightOf("lot"));
  });

  it("on a mixed group adds only the absent members at pickWeight(n) and leaves the present member's weight", () => {
    const start = new Map([["moon", weightOf("lot")]]);
    const next = toggleGroup(start, ["astronomy", "moon"]);
    expect(next.get("moon")).toBe(weightOf("lot"));
    expect(next.get("astronomy")).toBe(weightOf("some"));
  });

  it("on a full group removes every member and nothing else", () => {
    const start = new Map([
      ["astronomy", weightOf("some")],
      ["moon", weightOf("some")],
      ["botany", weightOf("lot")],
    ]);
    const next = toggleGroup(start, ["astronomy", "moon"]);
    expect(next.has("astronomy")).toBe(false);
    expect(next.has("moon")).toBe(false);
    expect(next.get("botany")).toBe(weightOf("lot"));
  });

  it("on a singleton group whose member is present removes it", () => {
    const start = new Map([["japan", weightOf("lot")]]);
    const next = toggleGroup(start, ["japan"]);
    expect(next.has("japan")).toBe(false);
  });

  it("returns a new Map and never mutates its input", () => {
    const start = new Map([["moon", weightOf("some")]]);
    const size = start.size;
    toggleGroup(start, ["astronomy", "moon"]);
    expect(start.size).toBe(size);
  });
});

describe("toggleTopic", () => {
  it("adds an absent topic at weightOf('lot')", () => {
    const next = toggleTopic(new Map(), "astronomy");
    expect(next.get("astronomy")).toBe(weightOf("lot"));
  });

  it("removes a present topic", () => {
    const start = new Map([["astronomy", weightOf("some")]]);
    const next = toggleTopic(start, "astronomy");
    expect(next.has("astronomy")).toBe(false);
  });

  it("returns a new Map and never mutates its input", () => {
    const start = new Map([["astronomy", weightOf("some")]]);
    const size = start.size;
    toggleTopic(start, "astronomy");
    expect(start.size).toBe(size);
  });
});

describe("groupState", () => {
  it("is false when none of the members are present", () => {
    expect(groupState(new Map(), ["astronomy", "moon"])).toBe(false);
  });

  it("is true when every member is present", () => {
    const picks = new Map([
      ["astronomy", weightOf("some")],
      ["moon", weightOf("some")],
    ]);
    expect(groupState(picks, ["astronomy", "moon"])).toBe(true);
  });

  it("is 'mixed' when some but not all members are present", () => {
    const picks = new Map([["astronomy", weightOf("some")]]);
    expect(groupState(picks, ["astronomy", "moon"])).toBe("mixed");
  });

  it("is false for an empty member list", () => {
    const picks = new Map([["astronomy", weightOf("some")]]);
    expect(groupState(picks, [])).toBe(false);
  });
});
