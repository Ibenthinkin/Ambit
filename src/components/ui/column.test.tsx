// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Column } from "./column";

describe("Column", () => {
  it.each([
    ["narrow", "md:max-w-[600px]"],
    ["reader", "md:max-w-[720px]"],
    ["wide", "md:max-w-[1120px]"],
  ] as const)("%s caps at %s only above md", (width, cls) => {
    render(
      <Column width={width} data-testid="col">
        x
      </Column>,
    );
    const el = screen.getByTestId("col");
    expect(el).toHaveClass("mx-auto", "w-full", cls);
    // Nothing un-prefixed constrains the phone layout.
    expect([...el.classList].filter((c) => c.startsWith("max-w"))).toEqual([]);
  });

  it("merges the caller's className", () => {
    render(
      <Column width="narrow" className="px-5" data-testid="col">
        x
      </Column>,
    );
    expect(screen.getByTestId("col")).toHaveClass("px-5", "md:max-w-[600px]");
  });
});
