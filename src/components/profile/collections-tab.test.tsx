// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_QUERY, WIDE_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";
import { CollectionsTab } from "./collections-tab";
import { ProfileHubContext } from "./profile-hub";

// Same shape as `saved-screen.test.tsx`: the tab's job is composition — one query in, a grid and a
// sheet out — so everything below the query is mocked and the assertions are about wiring. The
// identity block, nav and toolbar are the hub's (`profile-hub.test.tsx`); the cover query's SQL is
// `routers.integration.test.ts`'s subject; the face's arithmetic is `cover-mosaic.test.tsx`'s.

const {
  collectionsData,
  pushMock,
  backMock,
  createMutateMock,
  createOpts,
  invalidateMock,
} = vi.hoisted(() => ({
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
    saves: {
      collections: {
        useQuery: () => ({ data: collectionsData.current, isLoading: false }),
      },
      createCollection: {
        useMutation: (opts: NonNullable<typeof createOpts.current>) => {
          createOpts.current = opts;
          return { mutate: createMutateMock, isPending: false };
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
}));

const COLLECTIONS = [
  {
    id: "c1",
    name: "Articles",
    createdAt: new Date(),
    itemCount: 3,
    covers: ["/api/img/cover-item"],
  },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 1, covers: [] },
];

beforeEach(() => {
  collectionsData.current = COLLECTIONS;
  sessionStorage.clear();
  pushMock.mockClear();
  backMock.mockClear();
  createMutateMock.mockClear();
  invalidateMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("CollectionsTab", () => {
  it("leads the grid with the dashed tile, then one tile per collection", () => {
    render(<CollectionsTab />);

    expect(screen.getByText("New collection")).toBeInTheDocument();
    expect(screen.getByText("Group what you keep")).toBeInTheDocument();

    // Covers: c1 has an image, c2 falls back to the bookmark placeholder.
    const tiles = document.querySelectorAll("[data-collection-id]");
    expect(tiles).toHaveLength(2);
    expect(
      document.querySelector('[data-collection-id="c1"] img'),
    ).toHaveAttribute("src", "/api/img/cover-item");
    expect(document.querySelector('[data-collection-id="c2"] img')).toBeNull();

    // itemCountLabel, shared with the collection sheets.
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("a tile tap marks the saved-origin and opens the filtered Saved list", () => {
    render(<CollectionsTab />);

    fireEvent.click(document.querySelector('[data-collection-id="c1"]')!);

    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/saved?collection=c1");
  });

  it("creates a collection from the sheet, trimming the typed name", () => {
    const toast = vi.fn();
    render(
      <ProfileHubContext.Provider value={{ toast }}>
        <CollectionsTab />
      </ProfileHubContext.Provider>,
    );

    fireEvent.click(screen.getByText("New collection"));
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "  Maps  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(createMutateMock).toHaveBeenCalledWith({ name: "Maps" });

    // Drive the success lifecycle by hand: the sheet closes, the grid's query is invalidated, and
    // the hub toasts the created name.
    act(() => createOpts.current!.onSuccess({ id: "c9", name: "Maps" }));
    expect(invalidateMock).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Maps created");
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
    render(<CollectionsTab />);

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
    render(<CollectionsTab />);
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

  it("packs the feed's column count — two on the phone, four from xl", () => {
    render(<CollectionsTab />);
    expect(screen.getByTestId("collections-grid")).toHaveClass("grid-cols-2");
    cleanup();
    stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    render(<CollectionsTab />);
    expect(screen.getByTestId("collections-grid")).toHaveClass("grid-cols-4");
  });
});
