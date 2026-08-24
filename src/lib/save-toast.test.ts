import { describe, expect, it } from "vitest";

import { saveToastText } from "./save-toast";

describe("saveToastText", () => {
  it("plain save confirmation when no drift happened (a move between collections)", () => {
    expect(saveToastText("Art", null)).toBe("Saved to Art");
  });

  it("announces a newly created topic weight", () => {
    expect(
      saveToastText("Art", { topicLabel: "Cartography", isNew: true }),
    ).toBe("Saved to Art · Now drifting toward Cartography");
  });

  it("announces a further nudge to an existing topic weight", () => {
    expect(
      saveToastText("Art", { topicLabel: "Cartography", isNew: false }),
    ).toBe("Saved to Art · Drifting a little more toward Cartography");
  });
});
