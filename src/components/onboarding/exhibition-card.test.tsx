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
  it("is square-cornered, like the cards above it (Ben's critique, 10-05-26)", () => {
    render(<ExhibitionCard taste={taste} topicLabels={labels} />);
    expect(
      screen.getByRole("region", { name: "Your first exhibition" }).className,
    ).not.toMatch(/rounded/);
  });

  it("names the show, the wings and mediums, and shows the strip, the compass and what you'd open", () => {
    render(<ExhibitionCard taste={taste} topicLabels={labels} />);
    expect(
      screen.getByRole("heading", { name: "Quiet Weathers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Land, sea & sky, growing things and creatures. Mostly photography and engraving.",
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
    expect(
      screen.getByText(
        "You like a long read, and you went for essays and the archive.",
      ),
    ).toBeInTheDocument();
  });
  it("sets the pole the reader leans to in ink and leaves the other grey", () => {
    render(
      <ExhibitionCard
        taste={{
          ...taste,
          compass: { wild: 0.6, old: -0.5, still: 0.1, far: 0 },
        }}
        topicLabels={labels}
      />,
    );
    const on = (name: string) => screen.getByText(name).getAttribute("data-on");
    expect([on("Wild"), on("Built")]).toEqual(["true", "false"]);
    expect([on("Old"), on("New")]).toEqual(["false", "true"]);
    // Inside the threshold neither pole is claimed — as the sentence claims neither.
    expect([on("Still"), on("Lively")]).toEqual(["false", "false"]);
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
    // …but what declining both cards said is still said.
    expect(
      screen.getByText("You’d rather look than read."),
    ).toBeInTheDocument();
  });
  it("says 'something short' for a short reader and nothing in between", () => {
    const { rerender } = render(
      <ExhibitionCard
        taste={{ ...taste, readingMinutes: 3 }}
        topicLabels={labels}
      />,
    );
    expect(
      screen.getByText(/^You like something short, and you went for/),
    ).toBeInTheDocument();
    rerender(
      <ExhibitionCard
        taste={{ ...taste, readingMinutes: 9 }}
        topicLabels={labels}
      />,
    );
    expect(screen.queryByText(/You like/)).toBeNull();
    expect(
      screen.getByText("You went for essays and the archive."),
    ).toBeInTheDocument();
  });
});
