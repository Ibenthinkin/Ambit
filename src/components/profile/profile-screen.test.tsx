// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { avatarGradient } from "~/lib/avatar-hue";
import { ProfileScreen } from "./profile-screen";

// Same shape as `saved-screen.test.tsx`: the screen's job is composition — two queries in, an
// identity block, a grid, a pill and two sheets out — so everything below the queries is mocked and
// the assertions are about wiring. The cover query's SQL is `routers.integration.test.ts`'s subject;
// the gradient arithmetic is `avatar-hue.test.ts`'s.
/** The shape of a mocked `useQuery` result — annotated rather than asserted, so `data` can hold a
 * profile in one test and `undefined` in the next. */
interface QueryState {
  data: unknown;
  isPending: boolean;
  isError: boolean;
}

/**
 * The return annotation, not an assertion, is what widens `data` from `undefined` to `unknown` so a
 * test can swap a profile in. Declared as a function because `vi.hoisted` runs before any
 * module-level `const` is initialized — a hoisted factory can call this, but can't read a constant.
 */
function blankQuery(): QueryState {
  return { data: undefined, isPending: false, isError: false };
}

const {
  meState,
  collectionsData,
  pushMock,
  backMock,
  createMutateMock,
  createOpts,
  invalidateMock,
} = vi.hoisted(() => ({
  meState: { current: blankQuery() },
  collectionsData: { current: [] as unknown[] },
  pushMock: vi.fn(),
  backMock: vi.fn(),
  createMutateMock: vi.fn(),
  // Captures the mutation options so a test can drive onSuccess/onError by hand — the mocked
  // `mutate` doesn't run React Query's lifecycle (same move as sheets.test / saved-screen.test).
  createOpts: {
    current: undefined as
      | undefined
      | {
          onSuccess: (row: { id: string; name: string }) => void;
          onError: (err: { data?: { code?: string } }) => void;
        },
  },
  invalidateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
        count: { invalidate: invalidateMock },
      },
    }),
    user: {
      me: { useQuery: () => ({ ...meState.current, refetch: vi.fn() }) },
    },
    saves: {
      collections: {
        useQuery: () => ({ data: collectionsData.current, isLoading: false }),
      },
      count: { useQuery: () => ({ data: 0, isLoading: false }) },
      createCollection: {
        useMutation: (opts: NonNullable<typeof createOpts.current>) => {
          createOpts.current = opts;
          return { mutate: createMutateMock, isPending: false };
        },
      },
      // `CollectionsSheet` mounts closed but still calls its hooks.
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
}));

const ME = {
  id: "user_abc123",
  name: "Ben Traverse",
  email: "ben@example.test",
  handle: "bentraverse",
  bio: "Maps, mostly.",
};

const COLLECTIONS = [
  {
    id: "c1",
    name: "Articles",
    createdAt: new Date(),
    itemCount: 3,
    cover: "https://example.test/cover.jpg",
  },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 1, cover: null },
];

beforeEach(() => {
  meState.current = { data: ME, isPending: false, isError: false };
  collectionsData.current = COLLECTIONS;
  sessionStorage.clear();
  pushMock.mockClear();
  backMock.mockClear();
  createMutateMock.mockClear();
  invalidateMock.mockClear();
});

describe("ProfileScreen", () => {
  it("renders name, handle and bio from user.me", () => {
    render(<ProfileScreen />);

    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    // Stored bare, rendered with the sigil.
    expect(screen.getByText("@bentraverse")).toBeInTheDocument();
    expect(screen.getByText("Maps, mostly.")).toBeInTheDocument();
  });

  it("omits the handle and bio rows entirely when they're null", () => {
    meState.current = {
      data: { ...ME, handle: null, bio: null },
      isPending: false,
      isError: false,
    };
    render(<ProfileScreen />);

    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(screen.queryByText("Maps, mostly.")).not.toBeInTheDocument();
  });

  it("paints the avatar with this user's own deterministic gradient", () => {
    const { container } = render(<ProfileScreen />);

    // Two discs on screen: the 88px identity one and the pill's generic 25px. Only the first
    // carries an inline gradient — the pill's has no user data (see avatar-chip.tsx).
    const withGradient = [...container.querySelectorAll("span[aria-hidden]")]
      .map((el) => (el as HTMLElement).style.backgroundImage)
      .filter(Boolean);

    // Compared through a probe element rather than against the raw string: jsdom's CSS parser
    // rewrites `hsl(...)` stops as `rgb(...)`, so the literal from `avatarGradient` never matches
    // what comes back out of `style`. Round-tripping the expected value through the same parser is
    // what makes this an assertion about the wiring rather than about jsdom's serializer.
    const probe = document.createElement("span");
    probe.style.backgroundImage = avatarGradient(ME.id);
    expect(withGradient).toEqual([probe.style.backgroundImage]);
  });

  it("leads the grid with the dashed tile, then one tile per collection", () => {
    render(<ProfileScreen />);

    expect(screen.getByText("New collection")).toBeInTheDocument();
    expect(screen.getByText("Group what you keep")).toBeInTheDocument();

    // Covers: c1 has an image, c2 falls back to the bookmark placeholder.
    const tiles = document.querySelectorAll("[data-collection-id]");
    expect(tiles).toHaveLength(2);
    expect(
      document.querySelector('[data-collection-id="c1"] img'),
    ).toHaveAttribute("src", "https://example.test/cover.jpg");
    expect(document.querySelector('[data-collection-id="c2"] img')).toBeNull();

    // itemCountLabel, shared with the collection sheets.
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    // The bare count beside the "Collections" heading.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("a tile tap marks the saved-origin and opens the filtered Saved list", () => {
    render(<ProfileScreen />);

    fireEvent.click(document.querySelector('[data-collection-id="c1"]')!);

    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/saved?collection=c1");
  });

  it("the gear and the Edit pill each write their own marker before navigating", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(sessionStorage.getItem("ambit.settingsOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/settings");

    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(sessionStorage.getItem("ambit.profileEditOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/profile/edit");
  });

  it("creates a collection from the sheet, trimming the typed name", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("New collection"));
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "  Maps  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createMutateMock).toHaveBeenCalledWith({ name: "Maps" });

    // Drive the success lifecycle by hand: the sheet closes, the grid's query is invalidated, and
    // the parent toasts the created name.
    act(() => createOpts.current!.onSuccess({ id: "c9", name: "Maps" }));
    expect(invalidateMock).toHaveBeenCalled();
    expect(screen.getByText("Maps created")).toBeInTheDocument();
    // The sheet is closing, not gone: `BottomSheet` keeps a dismissed panel mounted through its
    // exit animation, and jsdom never fires `animationend`, so it lingers until the fallback
    // timer. What's provable here is that the close ran — the field is reset, and the panel is
    // marked inert on its way out.
    expect(screen.getByLabelText("Collection name")).toHaveValue("");
    expect(
      screen.getByTestId("bottom-sheet-panel").closest(".fixed"),
    ).toHaveClass("pointer-events-none");
  });

  it("renders a duplicate name inline and keeps the sheet open", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("New collection"));
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "Articles" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    act(() => createOpts.current!.onError({ data: { code: "CONFLICT" } }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already have a collection with that name.",
    );
    // Still open, with the typed name intact — the user's next move is to edit it.
    expect(screen.getByLabelText("Collection name")).toHaveValue("Articles");
  });

  it("the Create button is disabled on a blank name but not on a duplicate one", () => {
    render(<ProfileScreen />);
    fireEvent.click(screen.getByText("New collection"));

    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "   " },
    });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "Articles" },
    });
    // Submittable: a duplicate has to be *sendable*, or the conflict can never be discovered.
    expect(create).not.toBeDisabled();
  });

  it("the pill's Feed button pops when marked and pushes when opened cold", () => {
    render(<ProfileScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(pushMock).toHaveBeenCalledWith("/feed");
    expect(backMock).not.toHaveBeenCalled();

    sessionStorage.setItem("ambit.profileOrigin.v1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(backMock).toHaveBeenCalledOnce();
  });

  it("the pill's avatar navigates nowhere — you are already here", () => {
    render(<ProfileScreen />);
    pushMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("shows the error branch rather than an empty profile when the read fails", () => {
    meState.current = { data: undefined, isPending: false, isError: true };
    render(<ProfileScreen />);

    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();
    expect(screen.queryByText("Ben Traverse")).not.toBeInTheDocument();
  });
});
