// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TasteV1 } from "~/lib/interview/taste";

import { ExhibitionCard } from "./exhibition-card";

const labels = new Map([
  ["photography", "Photography"],
  ["engraving", "Engraving"],
]);
const taste: TasteV1 = {
  v: 1,
  title: { adjective: "Quiet", noun: "Weathers" },
  wings: ["land", "growing", "creatures"],
  mediums: ["photography", "engraving"],
  temperament: {
    communal: 0.2,
    aesthetic: 1,
    dark: 0.1,
    thrilling: 0.3,
    cerebral: 0.6,
  },
  compass: { wild: 0.6, old: 0.5, still: 0.4, far: 0.3 },
  opened: [
    {
      itemId: "a",
      title: "The case for boring buildings",
      kind: "essay",
      minutes: 18,
    },
    { itemId: "b", title: "A tide table", kind: "archive", minutes: 12 },
  ],
  readingMinutes: 15,
};

describe("ExhibitionCard", () => {
  it("names the show, the wings and mediums, and shows the strip, the compass and what you'd open", () => {
    render(<ExhibitionCard taste={taste} topicLabels={labels} />);
    expect(
      screen.getByRole("heading", { name: "Quiet Weathers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Land, sea & sky · Growing things · Creatures · Photography · Engraving",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Temperament" }),
    ).toHaveTextContent("Aesthetic");
    expect(screen.getByRole("meter", { name: "Aesthetic" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(
      screen.getByText(/You’d travel for wild places over cities/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The case for boring buildings"),
    ).toBeInTheDocument();
    expect(screen.getByText("You like a long read.")).toBeInTheDocument();
  });
  it("omits the compass and the opened block when there is nothing to show", () => {
    render(
      <ExhibitionCard
        taste={{ ...taste, compass: null, opened: [], readingMinutes: null }}
        topicLabels={labels}
      />,
    );
    expect(screen.queryByRole("group", { name: "Travel compass" })).toBeNull();
    expect(screen.queryByText(/You’d open/)).toBeNull();
  });
  it("says 'something short' for a short reader and nothing in between", () => {
    const { rerender } = render(
      <ExhibitionCard
        taste={{ ...taste, readingMinutes: 3 }}
        topicLabels={labels}
      />,
    );
    expect(screen.getByText("You like something short.")).toBeInTheDocument();
    rerender(
      <ExhibitionCard
        taste={{ ...taste, readingMinutes: 9 }}
        topicLabels={labels}
      />,
    );
    expect(screen.queryByText(/You like/)).toBeNull();
  });
});
