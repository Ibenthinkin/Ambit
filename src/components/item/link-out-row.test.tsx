// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkOutRow } from "./link-out-row";

describe("LinkOutRow", () => {
  it("renders a prominent link to the post for a blog source", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/"
      />,
    );
    const link = screen.getByRole("link", {
      name: /Read the post on Door of Perception/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders the link-out for a Public Domain Review item with its own copy", () => {
    render(
      <LinkOutRow
        source="pdr"
        sourceUrl="https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/"
      />,
    );
    expect(
      screen.getByRole("link", { name: /See it on The Public Domain Review/ }),
    ).toHaveAttribute(
      "href",
      "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
    );
  });

  it("renders the plain original link for a museum source too", () => {
    render(
      <LinkOutRow
        source="met"
        sourceUrl="https://www.metmuseum.org/art/collection/search/1"
      />,
    );
    expect(
      screen.getByRole("link", { name: /Read the original on The Met/ }),
    ).toHaveAttribute(
      "href",
      "https://www.metmuseum.org/art/collection/search/1",
    );
  });

  it("renders nothing without a source URL", () => {
    const { container } = render(<LinkOutRow source="met" sourceUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });

  // The class string used to be concatenated without spaces, so `duration-150` and
  // `duration-150` fused into one bogus class and the caller's class glued onto the last one.
  it("keeps its classes separate, the caller's included", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/p/"
        className="mt-0"
      />,
    );
    const classes = screen.getByRole("link").className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["bg-ink", "duration-150", "mt-0"]),
    );
    // `cn` resolves the conflict: the caller's margin wins over the row's own.
    expect(classes).not.toContain("mt-[24px]");
  });
});
