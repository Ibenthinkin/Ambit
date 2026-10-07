// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextLink } from "./text-link";

// DESIGN §4.6: underlined, offset 3px, ink/78; hover white with an accent underline.
describe("TextLink", () => {
  it("is an underlined, offset, ink/78 link whose hover turns white with an accent underline", () => {
    render(<TextLink href="/profile">Profile</TextLink>);
    const el = screen.getByRole("link", { name: "Profile" });
    expect(el.getAttribute("href")).toBe("/profile");
    for (const c of [
      "underline",
      "underline-offset-3",
      "text-ink/78",
      "hover:text-white",
      "hover:decoration-accent",
    ]) {
      expect(el.className).toContain(c);
    }
    expect(el.hasAttribute("target")).toBe(false);
  });

  it("tone=body uses full ink", () => {
    render(
      <TextLink href="/x" tone="body">
        Body
      </TextLink>,
    );
    const el = screen.getByRole("link", { name: "Body" });
    expect(el.className).toContain("text-ink");
    expect(el.className).not.toContain("text-ink/78");
  });

  it("external opens a new tab safely and appends a hidden-from-AT arrow", () => {
    render(
      <TextLink href="https://example.com" external>
        Example
      </TextLink>,
    );
    const el = screen.getByRole("link", { name: "Example" });
    expect(el.getAttribute("target")).toBe("_blank");
    expect(el.getAttribute("rel")).toBe("noopener noreferrer");
    expect(el.textContent).toBe("Example ↗");
    expect(el.querySelector("[aria-hidden='true']")?.textContent).toBe("↗");
  });

  it("a caller's rel or target cannot drop noopener on an external link", () => {
    render(
      <TextLink href="https://e.com" external rel="" target="_self">
        Ext
      </TextLink>,
    );
    const el = screen.getByRole("link", { name: /Ext/ });
    expect(el.getAttribute("rel")).toBe("noopener noreferrer");
    expect(el.getAttribute("target")).toBe("_blank");
  });

  it("bracket wraps the label as [label..]", () => {
    render(
      <TextLink href="/w" bracket>
        Read on Wikipedia
      </TextLink>,
    );
    const el = screen.getByRole("link");
    expect(el.textContent).toBe("[Read on Wikipedia..]");
  });

  it("passes other anchor props through", () => {
    render(
      <TextLink href="/a" aria-label="Back" className="extra">
        Back
      </TextLink>,
    );
    expect(screen.getByRole("link", { name: "Back" }).className).toContain(
      "extra",
    );
  });
});
