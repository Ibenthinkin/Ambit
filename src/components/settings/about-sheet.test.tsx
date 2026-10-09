// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CONTACT_EMAIL, contactMailto } from "~/config/contact";

import { AboutSheet } from "./about-sheet";

describe("AboutSheet", () => {
  // The removal promise has somewhere to go: a blog owner who wants out gets the address, with
  // the subject prefilled so the inbox sorts it.
  it("links the removal line to the contact address", () => {
    render(<AboutSheet open onClose={vi.fn()} versionLabel="v0.5" />);
    expect(screen.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute(
      "href",
      contactMailto("Removal request"),
    );
  });
});
