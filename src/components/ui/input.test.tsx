// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";
import { Textarea } from "./textarea";

describe("Input (DESIGN §4.4 — underline only)", () => {
  it("is an underline: no box, no radius, no fill", () => {
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("border-0", "border-b", "bg-transparent");
    expect(input).toHaveClass("border-ink/28");
    // The old boxed chrome is gone, and nothing rounds it.
    expect(input.className).not.toMatch(/rounded|bg-ink\/\[/);
  });

  it("states: placeholder, hover and focus (accent underline + 2px total)", () => {
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("placeholder:text-ink/34");
    expect(input).toHaveClass("hover:border-ink/60");
    expect(input).toHaveClass("focus:border-accent");
    expect(input.className).toContain(
      "focus:shadow-[0_1px_0_var(--color-accent)]",
    );
    // Its focus state is its own, so the global ring is switched off on purpose.
    expect(input).toHaveClass("outline-none");
  });

  it("has two sizes: md 18 px (default) and lg 22 px", () => {
    const { rerender } = render(<Input aria-label="Email" />);
    expect(screen.getByLabelText("Email")).toHaveClass("text-[18px]");
    rerender(<Input aria-label="Email" size="lg" />);
    const lg = screen.getByLabelText("Email");
    expect(lg).toHaveClass("text-[22px]");
    // `size` is the display size, never forwarded as the HTML attribute.
    expect(lg).not.toHaveAttribute("size");
  });

  it("disabled dims it and drops hover", () => {
    render(<Input aria-label="Email" disabled />);
    const input = screen.getByLabelText("Email");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("disabled:opacity-50");
  });

  it("forwards arbitrary props like type and placeholder", () => {
    render(
      <Input aria-label="Password" type="password" placeholder="Password" />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("placeholder", "Password");
  });
});

describe("Textarea", () => {
  it("shares the underline and sizes, resize-none, four rows", () => {
    render(<Textarea aria-label="About" />);
    const area = screen.getByLabelText("About");
    expect(area).toHaveClass("border-0", "border-b", "border-ink/28");
    expect(area).toHaveClass(
      "focus:border-accent",
      "resize-none",
      "text-[18px]",
    );
    expect(area).toHaveAttribute("rows", "4");
    expect(area.className).not.toMatch(/rounded/);
  });
});
