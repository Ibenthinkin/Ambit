import { describe, expect, it } from "vitest";

import { planMembershipTrim } from "./membership-trim";

// The one-off behind `bun run trim:memberships` (09-07-26): which `item_topic` rows to delete for
// an item the classifier over-filed before MAX_TOPICS existed. Pure, so the rules that make this
// the FIRST code ever to remove a membership can be pinned without a database.
describe("planMembershipTrim", () => {
  const curator = (ids: string[]) =>
    ids.map((topicId) => ({ topicId, origin: "curator" as const }));

  it("keeps the first three of the cached answer's order and deletes the rest", () => {
    const plan = planMembershipTrim({
      memberships: curator(["a", "b", "c", "d", "e"]),
      cachedOrder: ["e", "d", "c", "b", "a"],
      displayTopic: "e",
    });
    expect(plan).toEqual({ keep: ["e", "d", "c"], remove: ["b", "a"] });
  });

  it("never touches a seed or tag membership — those did not come from the runaway", () => {
    const plan = planMembershipTrim({
      memberships: [
        ...curator(["a", "b", "c", "d"]),
        { topicId: "promoted", origin: "tag" },
        { topicId: "seeded", origin: "seed" },
      ],
      cachedOrder: ["a", "b", "c", "d"],
      displayTopic: "a",
    });
    expect(plan.remove).toEqual(["d"]);
    expect(plan.keep).toContain("promoted");
    expect(plan.keep).toContain("seeded");
  });

  it("always keeps the display topic, even if the cache order somehow demotes it", () => {
    const plan = planMembershipTrim({
      memberships: curator(["a", "b", "c", "d"]),
      cachedOrder: ["b", "c", "d", "a"],
      displayTopic: "a",
    });
    expect(plan.keep).toContain("a");
    expect(plan.remove).not.toContain("a");
    expect(plan.keep).toHaveLength(3);
  });

  it("removes nothing without a cached answer — no order means no honest choice", () => {
    const plan = planMembershipTrim({
      memberships: curator(["a", "b", "c", "d", "e"]),
      cachedOrder: null,
      displayTopic: "a",
    });
    expect(plan.remove).toEqual([]);
  });

  it("removes nothing for an item already inside the cap", () => {
    const plan = planMembershipTrim({
      memberships: curator(["a", "b"]),
      cachedOrder: ["a", "b"],
      displayTopic: "a",
    });
    expect(plan.remove).toEqual([]);
  });

  it("a curator membership the cache does not mention is removed only after the cap is full", () => {
    // A stale-but-real row (cache rewritten since) ranks after everything the cache names.
    const plan = planMembershipTrim({
      memberships: curator(["a", "b", "x"]),
      cachedOrder: ["a", "b"],
      displayTopic: "a",
    });
    expect(plan.remove).toEqual([]);
    const plan2 = planMembershipTrim({
      memberships: curator(["a", "b", "c", "x"]),
      cachedOrder: ["a", "b", "c"],
      displayTopic: "a",
    });
    expect(plan2.remove).toEqual(["x"]);
  });
});
