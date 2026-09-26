// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ItemShell } from "./item-shell";

// The article page's client layer. Its sheets and pill are the same components the merged image
// screen uses, tested there; what is pinned here is Escape, and the signed-out toolbar's wiring.
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

vi.mock("~/components/landing/auth-card", () => ({
  AuthCard: ({ initialMode }: { initialMode?: string }) => (
    <div data-testid="auth-card">{initialMode ?? "signin"}</div>
  ),
}));

const escape = () =>
  act(() => void fireEvent.keyDown(window, { key: "Escape" }));

function renderShell(
  over: Partial<React.ComponentProps<typeof ItemShell>> = {},
) {
  return render(
    <ItemShell
      itemId="a1"
      title="An article"
      hasImage={false}
      authed
      appUrl="https://ambit.test"
      {...over}
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

  // Since 09-26-26 a stranger gets the toolbar: Share as anyone's, Profile and Save the sign-up
  // sheet in place, Feed to /explore.
  describe("signed out", () => {
    it("Profile and Save raise the sign-up sheet in place, and Escape closes it", () => {
      renderShell({ authed: false });
      const sheet = screen.getByTestId("auth-sheet");
      expect(sheet).toHaveAttribute("data-open", "false");
      fireEvent.click(
        screen.getByRole("button", { name: "Save to collection" }),
      );
      expect(sheet).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("auth-card")).toHaveTextContent("signup");
      escape();
      expect(sheet).toHaveAttribute("data-open", "false");
      expect(pushMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Profile" }));
      expect(sheet).toHaveAttribute("data-open", "true");
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("Share is still Share, and Escape leaves for /", () => {
      renderShell({ authed: false });
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
      escape();
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });
});
