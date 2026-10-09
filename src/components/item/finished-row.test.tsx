// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";

import { FinishedRow } from "./finished-row";
import { ItemShellContext } from "./item-shell";

// The pair itself is tested in feedback/more-or-less.test.tsx; this stub only exposes what the
// row hands it (the size, the auth flag) and lets a test press its callbacks.
vi.mock("~/components/feedback/more-or-less", () => ({
  MoreOrLess: (p: {
    size: string;
    authed: boolean;
    onToast: (m: string) => void;
    onRequireAuth: () => void;
  }) => (
    <div data-testid="pair" data-size={p.size} data-authed={String(p.authed)}>
      <button onClick={() => p.onToast("Less of this noted")}>toast</button>
      <button onClick={p.onRequireAuth}>auth</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(
  over: { readingMinutes?: number | null; authed?: boolean } = {},
) {
  const shell = {
    authed: over.authed ?? true,
    toast: vi.fn(),
    requireAuth: vi.fn(),
  };
  render(
    <ItemShellContext.Provider value={shell}>
      <FinishedRow
        itemId="a1"
        topicId="t1"
        topicLabel="Cartography"
        readingMinutes={"readingMinutes" in over ? over.readingMinutes! : 4}
      />
    </ItemShellContext.Provider>,
  );
  return shell;
}

describe("FinishedRow", () => {
  it("phone: one line, 'Finished · 4 min read', with the phone pair", () => {
    setup();
    expect(screen.getByText("Finished · 4 min read")).toBeInTheDocument();
    expect(screen.getByTestId("pair")).toHaveAttribute("data-size", "phone");
  });

  it("says just 'Finished' when the reading time is unknown", () => {
    setup({ readingMinutes: null });
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.queryByText(/min read/)).toBeNull();
  });

  it("desktop: 'Finished' and '4 min read' as two spans, with the reader pair", () => {
    stubMatchMedia([DESKTOP_QUERY]);
    setup();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("4 min read")).toBeInTheDocument();
    expect(screen.getByTestId("pair")).toHaveAttribute("data-size", "reader");
  });

  it("sends the pair's toast to the shell's toast", () => {
    const shell = setup();
    fireEvent.click(screen.getByText("toast"));
    expect(shell.toast).toHaveBeenCalledWith("Less of this noted");
  });

  it("a signed-out press asks the shell for the sign-up sheet", () => {
    const shell = setup({ authed: false });
    expect(screen.getByTestId("pair")).toHaveAttribute("data-authed", "false");
    fireEvent.click(screen.getByText("auth"));
    expect(shell.requireAuth).toHaveBeenCalled();
  });
});
