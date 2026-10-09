import { describe, expect, it } from "vitest";

import {
  feedbackNoteText,
  feedbackToastText,
  UNDONE_TOAST,
} from "./feedback-toast";

describe("feedbackToastText", () => {
  it("more, newly created pick", () => {
    expect(
      feedbackToastText("more", { topicLabel: "Cartography", isNew: true }),
    ).toBe("More of this · Now drifting toward Cartography");
  });

  it("more, nudged existing pick", () => {
    expect(
      feedbackToastText("more", { topicLabel: "Cartography", isNew: false }),
    ).toBe("More of this · Drifting a little more toward Cartography");
  });

  it("more, no drift to report", () => {
    expect(feedbackToastText("more", null)).toBe("More of this · Noted");
  });

  it("less, first cool of the topic", () => {
    expect(
      feedbackToastText("less", { topicLabel: "Cartography", isNew: true }),
    ).toBe("Less of this · Drifting away from Cartography");
  });

  it("less, further cool of the topic", () => {
    expect(
      feedbackToastText("less", { topicLabel: "Cartography", isNew: false }),
    ).toBe("Less of this · Drifting further from Cartography");
  });

  it("less, no drift to report", () => {
    expect(feedbackToastText("less", null)).toBe(
      "Less of this · You won't see it again",
    );
  });
});

describe("UNDONE_TOAST", () => {
  it("is Undone", () => {
    expect(UNDONE_TOAST).toBe("Undone");
  });
});

describe("feedbackNoteText", () => {
  it("more names the shelf and the undo", () => {
    expect(feedbackNoteText("more", "Cartography")).toBe(
      'Added to your "More of this" shelf on Saved. Tap again to undo.',
    );
  });

  it("less with a topic names the cooled topic and where to warm it", () => {
    expect(feedbackNoteText("less", "Cartography")).toBe(
      "This one won't come back. Cartography is cooled — Profile → Topics to warm it up. Tap again to undo.",
    );
  });

  it("less without a topic drops the cooled clause", () => {
    expect(feedbackNoteText("less", null)).toBe(
      "This one won't come back. Tap again to undo.",
    );
  });
});
