// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Rise } from "./rise";

describe("Rise", () => {
  it("lands delayMs as an inline animation-delay", () => {
    render(
      <Rise delayMs={150}>
        <p>Card</p>
      </Rise>,
    );
    expect(screen.getByText("Card").parentElement).toHaveStyle({
      animationDelay: "150ms",
    });
  });

  it("defaults to no delay", () => {
    render(
      <Rise>
        <p>Card</p>
      </Rise>,
    );
    expect(screen.getByText("Card").parentElement).toHaveStyle({
      animationDelay: "0ms",
    });
  });
});
