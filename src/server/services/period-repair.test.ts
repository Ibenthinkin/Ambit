import { describe, expect, it } from "vitest";

import { planPeriodRepair } from "./period-repair";

// The pure core of scripts/repair-period-topics.ts (09-07-26): one item that the classifier filed
// under a period topic. Keep the row if the item's own text carries the period; otherwise remove
// it — and if it was the DISPLAY topic, move the display to the next honest membership, or to
// null (un-homed → the WILD tier) when nothing is left.
describe("planPeriodRepair", () => {
  const base = {
    periodTopic: "19th-century",
    memberships: [
      { topicId: "19th-century", origin: "curator" as const },
      { topicId: "photography", origin: "curator" as const },
      { topicId: "architecture", origin: "curator" as const },
    ],
    cachedOrder: ["19th-century", "photography", "architecture"],
  };

  it("keeps the row when the item carries period evidence", () => {
    expect(
      planPeriodRepair({
        ...base,
        displayTopic: "19th-century",
        evidence: true,
      }),
    ).toEqual({ remove: false, newDisplay: undefined });
  });

  it("removes the row and leaves the display alone when it was not the display", () => {
    expect(
      planPeriodRepair({
        ...base,
        displayTopic: "photography",
        evidence: false,
      }),
    ).toEqual({ remove: true, newDisplay: undefined });
  });

  it("moves the display to the next membership in the cached order", () => {
    expect(
      planPeriodRepair({
        ...base,
        displayTopic: "19th-century",
        evidence: false,
      }),
    ).toEqual({ remove: true, newDisplay: "photography" });
  });

  it("prefers a curator membership in cached order over a tag one, but takes a tag one over nothing", () => {
    const withTag = {
      ...base,
      memberships: [
        { topicId: "19th-century", origin: "curator" as const },
        { topicId: "books", origin: "tag" as const },
        { topicId: "architecture", origin: "curator" as const },
      ],
      cachedOrder: ["19th-century", "architecture"],
    };
    expect(
      planPeriodRepair({
        ...withTag,
        displayTopic: "19th-century",
        evidence: false,
      }).newDisplay,
    ).toBe("architecture");
    const onlyTag = {
      ...withTag,
      memberships: withTag.memberships.filter(
        (m) => m.topicId !== "architecture",
      ),
      cachedOrder: ["19th-century"],
    };
    expect(
      planPeriodRepair({
        ...onlyTag,
        displayTopic: "19th-century",
        evidence: false,
      }).newDisplay,
    ).toBe("books");
  });

  it("sets the display to null when the period row was the only membership", () => {
    expect(
      planPeriodRepair({
        ...base,
        memberships: [{ topicId: "19th-century", origin: "curator" }],
        cachedOrder: ["19th-century"],
        displayTopic: "19th-century",
        evidence: false,
      }),
    ).toEqual({ remove: true, newDisplay: null });
  });

  it("never removes a tag- or seed-origin period row — those were filed by evidence", () => {
    expect(
      planPeriodRepair({
        ...base,
        memberships: [{ topicId: "19th-century", origin: "tag" }],
        cachedOrder: [],
        displayTopic: "19th-century",
        evidence: false,
      }),
    ).toEqual({ remove: false, newDisplay: undefined });
  });
});
