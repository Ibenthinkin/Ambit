// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { avatarGradient } from "~/lib/avatar-hue";
import { ProfileHub, useProfileHub } from "./profile-hub";

// The shell every profile tab renders inside (docs/DESIGN_list-screens.md §1): identity block,
// the four-link nav, the toolbar, one raised toast. Everything below the one query is mocked;
// the assertions are about wiring — which link is current, that links replace rather than push,
// that Feed pops or pushes by the marker.
interface QueryState {
  data: unknown;
  isPending: boolean;
  isError: boolean;
}
function blankQuery(): QueryState {
  return { data: undefined, isPending: false, isError: false };
}

const { meState, segment, pushMock, backMock } = vi.hoisted(() => ({
  meState: { current: blankQuery() },
  segment: { current: null as string | null },
  pushMock: vi.fn(),
  backMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({}),
    user: {
      me: { useQuery: () => ({ ...meState.current, refetch: vi.fn() }) },
    },
    saves: {
      // `CollectionsSheet` mounts closed but still calls its hooks.
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      count: { useQuery: () => ({ data: 0, isLoading: false }) },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
  useSelectedLayoutSegment: () => segment.current,
}));

const ME = {
  id: "user_abc123",
  name: "Ben Traverse",
  email: "ben@example.test",
  handle: "bentraverse",
  bio: "Maps, mostly.",
};

beforeEach(() => {
  meState.current = { data: ME, isPending: false, isError: false };
  segment.current = null;
  sessionStorage.clear();
  pushMock.mockClear();
  backMock.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("ProfileHub", () => {
  it("renders name, handle and bio from user.me above the children", () => {
    render(
      <ProfileHub>
        <p>tab body</p>
      </ProfileHub>,
    );
    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    expect(screen.getByText("@bentraverse")).toBeInTheDocument();
    expect(screen.getByText("Maps, mostly.")).toBeInTheDocument();
    expect(screen.getByText("tab body")).toBeInTheDocument();
  });

  it("omits the handle and bio rows entirely when they're null", () => {
    meState.current = {
      data: { ...ME, handle: null, bio: null },
      isPending: false,
      isError: false,
    };
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(screen.queryByText("Maps, mostly.")).not.toBeInTheDocument();
  });

  it("paints the avatar with this user's own deterministic gradient", () => {
    const { container } = render(<ProfileHub>x</ProfileHub>);
    // Two discs on screen: the 88px identity one and the toolbar's generic one. Only the first
    // carries an inline gradient — the toolbar's has no user data (see avatar-chip.tsx).
    const withGradient = [...container.querySelectorAll("span[aria-hidden]")]
      .map((el) => (el as HTMLElement).style.backgroundImage)
      .filter(Boolean);
    // Through a probe element: jsdom's CSS parser rewrites `hsl(...)` stops as `rgb(...)`, so the
    // literal from `avatarGradient` never matches what comes back out of `style`.
    const probe = document.createElement("span");
    probe.style.backgroundImage = avatarGradient(ME.id);
    expect(withGradient).toEqual([probe.style.backgroundImage]);
  });

  it("offers the four tabs in order, as replacing links", () => {
    render(<ProfileHub>x</ProfileHub>);
    const nav = screen.getByRole("navigation", { name: "Profile" });
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual([
      "Collections",
      "Topics",
      "Edit profile",
      "Settings",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/profile",
      "/profile/topics",
      "/profile/edit",
      "/profile/settings",
    ]);
  });

  it("marks the current tab from the selected segment — null is Collections", () => {
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Settings" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("…and 'settings' is Settings", () => {
    segment.current = "settings";
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Collections" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("the toolbar's Feed button pops when marked and pushes when opened cold", () => {
    render(<ProfileHub>x</ProfileHub>);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(pushMock).toHaveBeenCalledWith("/feed");
    expect(backMock).not.toHaveBeenCalled();

    sessionStorage.setItem("ambit.profileOrigin.v1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(backMock).toHaveBeenCalledOnce();
  });

  it("the toolbar's avatar navigates nowhere — you are already here", () => {
    render(<ProfileHub>x</ProfileHub>);
    pushMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("shows the error branch rather than an empty profile when the read fails, tabs intact", () => {
    meState.current = { data: undefined, isPending: false, isError: true };
    render(<ProfileHub>x</ProfileHub>);
    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();
    expect(screen.queryByText("Ben Traverse")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Profile" })).toBeInTheDocument();
  });

  // The desktop pass, revised (docs/DESIGN_list-screens.md §6): the hub is the feed's wide
  // column, not the 600 px list column.
  it("takes the wide column above md", () => {
    render(<ProfileHub>x</ProfileHub>);
    expect(document.querySelector(".md\\:max-w-\\[1120px\\]")).not.toBeNull();
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).toBeNull();
  });

  it("a tab can toast through the context, raised above the toolbar", () => {
    vi.useFakeTimers();
    function Tab() {
      const hub = useProfileHub();
      return (
        <button type="button" onClick={() => hub.toast("Profile saved")}>
          say it
        </button>
      );
    }
    render(
      <ProfileHub>
        <Tab />
      </ProfileHub>,
    );
    fireEvent.click(screen.getByText("say it"));
    expect(screen.getByText("Profile saved")).toBeInTheDocument();
  });
});
