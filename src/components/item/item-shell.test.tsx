// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ItemShell } from "./item-shell";

// The article page's client layer. Its sheets and pill are the same components the merged image
// screen uses, tested there; what is pinned here is the one thing only this shell does: Escape.
const { backMock, pushMock } = vi.hoisted(() => ({
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        forItem: { invalidate: vi.fn() },
        collections: { invalidate: vi.fn() },
      },
    }),
    saves: {
      forItem: { useQuery: () => ({ data: undefined }) },
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

const escape = () =>
  act(() => void fireEvent.keyDown(window, { key: "Escape" }));

function renderShell() {
  return render(
    <ItemShell
      itemId="a1"
      title="An article"
      hasImage={false}
      authed
      appUrl="https://ambit.test"
    >
      <p>body</p>
    </ItemShell>,
  );
}

beforeEach(() => {
  backMock.mockClear();
  pushMock.mockClear();
  sessionStorage.clear();
});

describe("ItemShell", () => {
  it("Escape leaves — pushes a focused feed on a cold open", () => {
    renderShell();
    escape();
    expect(pushMock).toHaveBeenCalledWith("/feed?focus=a1");
    expect(backMock).not.toHaveBeenCalled();
  });

  it("Escape pops when the visit came from the feed", () => {
    sessionStorage.setItem("ambit.feedOrigin.v1", "a1");
    renderShell();
    escape();
    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("leaves Escape to a sheet while one is open", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    escape();
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });
});
