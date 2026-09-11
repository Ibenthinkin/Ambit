// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";
import { Toolbar } from "./toolbar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe("Toolbar", () => {
  it("is the pill on a phone (and on the server)", () => {
    render(<Toolbar onBookmark={vi.fn()} />);
    expect(screen.queryByTestId("rail-toolbar")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Ambit toolbar" }),
    ).toBeInTheDocument();
  });

  it("is the rail from md up", () => {
    stubMatchMedia([DESKTOP_QUERY]);
    render(<Toolbar onBookmark={vi.fn()} />);
    expect(screen.getByTestId("rail-toolbar")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });
});
