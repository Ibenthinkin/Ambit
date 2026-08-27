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

  it("renders nothing for a museum source — the credit line is their link-out", () => {
    const { container } = render(
      <LinkOutRow
        source="met"
        sourceUrl="https://www.metmuseum.org/art/collection/search/1"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
