// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubMatchMedia } from "~/test/match-media";
import {
  DESKTOP_QUERY,
  useColumnCount,
  useMediaQuery,
  WIDE_QUERY,
} from "./use-media-query";

// Rendered rather than `renderHook`ed, for consistency with the other hook tests in this
// directory: what matters is that a *component* re-renders when the query flips.
function Probe({ query }: { query: string }) {
  const matches = useMediaQuery(query);
  return <span data-testid="probe">{matches ? "yes" : "no"}</span>;
}

function Columns() {
  return <span data-testid="cols">{useColumnCount()}</span>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("reads the current match on mount", () => {
    stubMatchMedia([DESKTOP_QUERY]);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("yes");
  });

  it("re-renders when the query flips", () => {
    const media = stubMatchMedia([]);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("no");

    media.fire(DESKTOP_QUERY, true);
    expect(screen.getByTestId("probe")).toHaveTextContent("yes");
  });

  it("falls back to the server value where matchMedia is absent", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<Probe query={DESKTOP_QUERY} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("no");
  });
});

describe("useColumnCount", () => {
  it.each([
    [[], 2],
    [[DESKTOP_QUERY], 3],
    [[DESKTOP_QUERY, WIDE_QUERY], 4],
  ])("maps %j to %i columns", (matching, expected) => {
    stubMatchMedia(matching);
    render(<Columns />);
    expect(screen.getByTestId("cols")).toHaveTextContent(String(expected));
  });
});
