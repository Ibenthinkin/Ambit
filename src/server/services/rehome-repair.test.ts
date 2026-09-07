import { describe, expect, it } from "vitest";

import { planRehome } from "./rehome-repair";

// The pure core of scripts/repair-rehome.ts (09-07-26): one item whose own tags name a topic the
// vocabulary lacked when it was classified (`science-fiction`), and which the classifier filed
// under the nearest word it had (`science`). Give it the honest membership; take back the
// curator's guess; move the display if the guess was the display.
describe("planRehome", () => {
  const rule = { from: "science", to: "science-fiction" };
  const curatorScience = { topicId: "science", origin: "curator" as const };
  const curatorIllustration = {
    topicId: "illustration",
    origin: "curator" as const,
  };

  it("does nothing without evidence", () => {
    expect(
      planRehome({
        rule,
        memberships: [curatorScience],
        displayTopic: "science",
        evidence: false,
      }),
    ).toEqual({
      addMembership: false,
      removeFrom: false,
      newDisplay: undefined,
    });
  });

  it("adds the membership, removes the curator's guess, and moves the display", () => {
    expect(
      planRehome({
        rule,
        memberships: [curatorScience, curatorIllustration],
        displayTopic: "science",
        evidence: true,
      }),
    ).toEqual({
      addMembership: true,
      removeFrom: true,
      newDisplay: "science-fiction",
    });
  });

  it("leaves the display alone when the guess was not the display", () => {
    expect(
      planRehome({
        rule,
        memberships: [curatorScience, curatorIllustration],
        displayTopic: "illustration",
        evidence: true,
      }),
    ).toEqual({ addMembership: true, removeFrom: true, newDisplay: undefined });
  });

  it("never removes a tag- or seed-origin row — those are evidence, not guesses", () => {
    expect(
      planRehome({
        rule,
        memberships: [{ topicId: "science", origin: "tag" }],
        displayTopic: "science",
        evidence: true,
      }),
    ).toEqual({
      addMembership: true,
      removeFrom: false,
      newDisplay: undefined,
    });
  });

  it("does not add a membership the item already has", () => {
    expect(
      planRehome({
        rule,
        memberships: [
          curatorScience,
          { topicId: "science-fiction", origin: "tag" },
        ],
        displayTopic: "science",
        evidence: true,
      }),
    ).toEqual({
      addMembership: false,
      removeFrom: true,
      newDisplay: "science-fiction",
    });
  });

  it("homes an un-homed item, the way promotion does", () => {
    expect(
      planRehome({
        rule,
        memberships: [],
        displayTopic: null,
        evidence: true,
      }),
    ).toEqual({
      addMembership: true,
      removeFrom: false,
      newDisplay: "science-fiction",
    });
  });

  it("adds the membership without touching a display that is neither the guess nor null", () => {
    expect(
      planRehome({
        rule,
        memberships: [curatorIllustration],
        displayTopic: "illustration",
        evidence: true,
      }),
    ).toEqual({
      addMembership: true,
      removeFrom: false,
      newDisplay: undefined,
    });
  });
});
