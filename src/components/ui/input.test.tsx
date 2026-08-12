// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("renders with the shared chrome", () => {
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveClass("border-hairline");
    expect(input).toHaveClass("placeholder:text-ink/32");
    expect(input).toHaveClass("focus:border-accent");
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
