import { describe, expect, it } from "vitest";

import {
  draftPicks,
  reseed,
  sameProposal,
  seedDraft,
  withLevel,
  withOff,
} from "./reveal-draft";

const PROPOSED = [
  { topicId: "astronomy", weight: 2 },
  { topicId: "botany", weight: 1 },
  { topicId: "music", weight: 0.5 },
];

describe("the reveal's draft", () => {
  it("opens on the proposal and submits it unchanged, best first", () => {
    expect(draftPicks(seedDraft(PROPOSED))).toEqual(PROPOSED);
  });

  it("an edited level is submitted; a switched-off row stays on the page and is not", () => {
    let d = seedDraft(PROPOSED);
    d = withLevel(d, "botany", 2);
    d = withOff(d, "music");
    expect(draftPicks(d)).toEqual([
      { topicId: "astronomy", weight: 2 },
      { topicId: "botany", weight: 2 },
    ]);
    expect([...d.off]).toEqual(["music"]);
    // …and can be switched back on.
    expect(draftPicks(withLevel(d, "music", 1))).toHaveLength(3);
    expect(withLevel(d, "music", 1).off.size).toBe(0);
  });

  it("never mutates the draft it was given", () => {
    const d = seedDraft(PROPOSED);
    withOff(withLevel(d, "botany", 2), "music");
    expect(draftPicks(d)).toEqual(PROPOSED);
    expect(d.edited.size).toBe(0);
  });
});

describe("reseed", () => {
  it("keeps what the reader set by hand and takes the new proposal for the rest", () => {
    let d = seedDraft(PROPOSED);
    d = withLevel(d, "botany", 2); // set by hand
    d = withOff(d, "music"); // set by hand
    const next = reseed(d, [
      { topicId: "insects", weight: 1 }, // let back in, new
      { topicId: "astronomy", weight: 1 }, // untouched: follows the proposal down
      { topicId: "botany", weight: 0.5 }, // touched: stays at the reader's 2
      { topicId: "music", weight: 1 }, // touched: stays off
    ]);
    expect(draftPicks(next)).toEqual([
      { topicId: "insects", weight: 1 },
      { topicId: "astronomy", weight: 1 },
      { topicId: "botany", weight: 2 },
    ]);
    expect([...next.off]).toEqual(["music"]);
  });

  it("drops an untouched row the new proposal no longer holds, and keeps a touched one", () => {
    let d = seedDraft(PROPOSED);
    d = withLevel(d, "music", 2);
    const next = reseed(d, [{ topicId: "insects", weight: 1 }]);
    // astronomy and botany were never touched and fell out; music was, and stays — after the
    // proposal's own rows.
    expect(draftPicks(next)).toEqual([
      { topicId: "insects", weight: 1 },
      { topicId: "music", weight: 2 },
    ]);
  });

  it("is the identity for the proposal the draft already holds", () => {
    const d = withLevel(seedDraft(PROPOSED), "botany", 2);
    expect(draftPicks(reseed(d, PROPOSED))).toEqual(draftPicks(d));
  });
});

describe("sameProposal", () => {
  it("compares by content, not by array", () => {
    expect(sameProposal(PROPOSED, [...PROPOSED.map((p) => ({ ...p }))])).toBe(
      true,
    );
    expect(sameProposal(PROPOSED, PROPOSED.slice(0, 2))).toBe(false);
    expect(
      sameProposal(PROPOSED, [
        PROPOSED[0]!,
        { topicId: "botany", weight: 2 },
        PROPOSED[2]!,
      ]),
    ).toBe(false);
  });
});
