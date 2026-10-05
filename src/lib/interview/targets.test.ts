import { describe, expect, it } from "vitest";

import { optionAdds, optionTargets, targetsOf } from "./targets";

const listed = new Set(["astronomy", "moon", "music", "eerie"]);

describe("targetsOf", () => {
  it("keeps only listed topics", () => {
    expect(targetsOf({ topics: ["music", "sound"], score: 1 }, listed)).toEqual(
      ["music"],
    );
  });

  it("flattens a group to its listed members", () => {
    expect(
      targetsOf({ groups: ["space-and-science-fiction"], score: 1 }, listed),
    ).toEqual(["astronomy", "moon"]);
  });

  it("names a topic once when a topic and its own group are both given", () => {
    expect(
      targetsOf(
        {
          topics: ["astronomy"],
          groups: ["space-and-science-fiction"],
          score: 1,
        },
        listed,
      ),
    ).toEqual(["astronomy", "moon"]);
  });

  it("is empty for an unknown group rather than throwing", () => {
    expect(targetsOf({ groups: ["no-such-group"], score: 1 }, listed)).toEqual(
      [],
    );
  });
});

describe("optionTargets / optionAdds", () => {
  const option = {
    key: "k",
    label: "K",
    effects: [
      { topics: ["music"], score: 1 },
      { topics: ["eerie"], score: -0.5 },
    ],
  };

  it("optionTargets is every listed topic the answer touches, either sign", () => {
    expect(optionTargets(option, listed)).toEqual(["music", "eerie"]);
  });

  it("optionAdds is only what the answer would add", () => {
    expect(optionAdds(option, listed)).toEqual(["music"]);
  });
});
