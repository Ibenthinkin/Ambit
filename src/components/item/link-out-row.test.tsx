// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LinkOutRow } from "./link-out-row";

const track = vi.fn();
vi.mock("~/components/usage/usage-provider", () => ({
  useUsage: () => ({ track }),
}));

describe("LinkOutRow", () => {
  it("renders a prominent link to the post for a blog source", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/"
        itemId="i1"
      />,
    );
    const link = screen.getByRole("link", { name: "Original post" });
    expect(link).toHaveAttribute(
      "href",
      "https://doorofperception.com/2026/08/the-geologic-atlas-of-the-moon/",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  // Ben's 10-08-26 phone look: the full-width 50 px block with the blog's name and an arrow read as
  // "a whole page section", not a button. It is a button now: inline, 40 px, two words, no glyph.
  it("is an inline button, not a full-width block, and carries no arrow", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/p/"
        itemId="i1"
      />,
    );
    const link = screen.getByRole("link", { name: "Original post" });
    expect(link).toHaveClass("inline-flex", "h-[40px]");
    expect(link).not.toHaveClass("w-full", "justify-between");
    expect(link.textContent).not.toContain("↗");
  });

  it("calls a Public Domain Review item's link-out the source, not a post", () => {
    render(
      <LinkOutRow
        source="pdr"
        sourceUrl="https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/"
        itemId="i1"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Original source" }),
    ).toHaveAttribute(
      "href",
      "https://publicdomainreview.org/collection/atlantic-city-sand-sculpture/",
    );
  });

  it("renders the source link for a museum too", () => {
    render(
      <LinkOutRow
        source="met"
        sourceUrl="https://www.metmuseum.org/art/collection/search/1"
        itemId="i1"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Original source" }),
    ).toHaveAttribute(
      "href",
      "https://www.metmuseum.org/art/collection/search/1",
    );
  });

  it("renders nothing without a source URL", () => {
    const { container } = render(
      <LinkOutRow source="met" sourceUrl="" itemId="i1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The class string used to be concatenated without spaces, so `duration-150` and
  // `duration-150` fused into one bogus class and the caller's class glued onto the last one.
  it("keeps its classes separate, the caller's included", () => {
    render(
      <LinkOutRow
        source="doorofperception"
        sourceUrl="https://doorofperception.com/p/"
        itemId="i1"
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

  it("records item.linkout (the item, never the URL) on a click", () => {
    track.mockClear();
    render(
      <LinkOutRow source="met" sourceUrl="https://example.org/x" itemId="i1" />,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(track).toHaveBeenCalledWith("item.linkout", { itemId: "i1" });
  });
});
