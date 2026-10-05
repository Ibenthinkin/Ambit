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

  // The Lift (docs/PLAN_tile-hover.md, final review 10-05-26): a finished `fill-mode: both`
  // animation stays "in effect" on transform/opacity, and Firefox keeps a stacking context for
  // it — trapping a lifted tile's z-index inside its Rise, so later tiles paint over its shadow.
  // Backwards-only fill holds the `from` state through the stagger delay and lets go at the end.
  it("fills backwards only, so a finished rise leaves no stacking context", () => {
    render(
      <Rise>
        <p>Card</p>
      </Rise>,
    );
    expect(screen.getByText("Card").parentElement).toHaveStyle({
      animationFillMode: "backwards",
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
