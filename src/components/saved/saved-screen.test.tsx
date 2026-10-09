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
import type { Item } from "~/server/db/items";
import { stubMatchMedia } from "~/test/match-media";
import { SavedScreen } from "./saved-screen";

// Like `feed-screen.test.tsx`, the screen's job is composition — three queries in, a chip row and
// two packed columns plus a pill and a toast out — so everything below the queries is mocked and
// the assertions are about wiring. Packing is `masonry.test.ts`'s; the chips' count arithmetic
// against the real DB is `routers.integration.test.ts`'s.
const {
  listState,
  listInputs,
  collectionsData,
  countData,
  searchParams,
  pushMock,
  replaceMock,
  backMock,
  unsaveMutateMock,
  unsaveOpts,
  invalidateMock,
  setDataMock,
  shelfState,
  clearMutateMock,
  clearOpts,
  shelfSetDataMock,
  shelfEnabled,
} = vi.hoisted(() => ({
  listState: {
    current: { data: [] as unknown[], isPending: false, isError: false },
  },
  /** Every input `saves.list.useQuery` was called with — the hydration-contract assertions. */
  listInputs: { current: [] as unknown[] },
  collectionsData: { current: [] as unknown[] },
  countData: { current: 0 },
  searchParams: { current: new URLSearchParams() },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  unsaveMutateMock: vi.fn(),
  // Captures the mutation options so a test can drive onMutate/onSettled by hand — the mocked
  // `mutate` doesn't run the lifecycle the way real React Query does (same move as sheets.test).
  unsaveOpts: {
    current: undefined as
      | undefined
      | {
          onMutate: (vars: { itemId: string }) => void;
          onError: () => void;
          onSettled: () => Promise<unknown>;
        },
  },
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  setDataMock: vi.fn(),
  // The "More of this" shelf (`api.feedback.list`) and its undo (`api.feedback.clear`).
  shelfState: {
    current: { data: [] as unknown[], isPending: false, isError: false },
  },
  clearMutateMock: vi.fn(),
  clearOpts: {
    current: undefined as
      | undefined
      | {
          onMutate: (vars: { itemId: string }) => void;
          onError: () => void;
          onSettled: () => Promise<unknown>;
        },
  },
  shelfSetDataMock: vi.fn(),
  /** The `enabled` flag each `feedback.list.useQuery` call was given. */
  shelfEnabled: { current: [] as unknown[] },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock, setData: setDataMock },
        count: { invalidate: invalidateMock },
      },
      feedback: {
        list: { invalidate: invalidateMock, setData: shelfSetDataMock },
      },
    }),
    feedback: {
      list: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) => {
          shelfEnabled.current.push(opts?.enabled);
          return { ...shelfState.current, refetch: vi.fn() };
        },
      },
      clear: {
        useMutation: (opts: NonNullable<typeof clearOpts.current>) => {
          clearOpts.current = opts;
          return { mutate: clearMutateMock, isPending: false };
        },
      },
    },
    saves: {
      list: {
        useQuery: (input: unknown) => {
          listInputs.current.push(input);
          return { ...listState.current, refetch: vi.fn() };
        },
      },
      collections: {
        useQuery: () => ({ data: collectionsData.current, isLoading: false }),
      },
      count: {
        useQuery: () => ({ data: countData.current, isLoading: false }),
      },
      unsave: {
        useMutation: (opts: NonNullable<typeof unsaveOpts.current>) => {
          unsaveOpts.current = opts;
          return { mutate: unsaveMutateMock, isPending: false };
        },
      },
      // `CollectionsSheet` mounts closed and queries with `enabled: false`; it still calls the
      // hook, so the mock has to exist even though nothing here opens the sheet.
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
  useSearchParams: () => searchParams.current,
}));

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
function makeItem(over: Partial<Item> & { id: string }): Item {
  return {
    source: "met",
    sourceId: `src-${over.id}`,
    type: "image",
    title: `Item ${over.id}`,
    summary: null,
    body: null,
    imageUrl: `https://example.test/${over.id}.jpg`,
    imageWidth: null,
    imageHeight: null,
    kind: null,
    readingMinutes: null,
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
    ...over,
  };
}

const IMAGE_ITEM = makeItem({ id: "img1" });
const ARTICLE_ITEM = makeItem({
  id: "art1",
  type: "article",
  title: "The Heron",
  summary: "A lede.",
});

const COLLECTIONS = [
  {
    id: "c1",
    name: "Articles",
    createdAt: new Date(),
    itemCount: 1,
    covers: [],
  },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0, covers: [] },
];

/** Two saves across both tile kinds, both collections rendered, total of 2. */
function populated() {
  listState.current = {
    data: [IMAGE_ITEM, ARTICLE_ITEM],
    isPending: false,
    isError: false,
  };
  collectionsData.current = COLLECTIONS;
  countData.current = 2;
}

beforeEach(() => {
  populated();
  searchParams.current = new URLSearchParams();
  listInputs.current = [];
  sessionStorage.clear();
  pushMock.mockClear();
  replaceMock.mockClear();
  backMock.mockClear();
  unsaveMutateMock.mockClear();
  invalidateMock.mockClear();
  setDataMock.mockClear();
  shelfSetDataMock.mockClear();
  clearMutateMock.mockClear();
  shelfEnabled.current = [];
  shelfState.current = { data: [], isPending: false, isError: false };
});

afterEach(() => vi.unstubAllGlobals());

describe("SavedScreen", () => {
  it("renders both tile kinds across the two columns", () => {
    render(<SavedScreen />);

    expect(document.querySelectorAll("[data-saved-id]")).toHaveLength(2);
    // The image tile is an <img> through the proxy; the article tile is its headline.
    expect(document.querySelector('[data-saved-id="img1"] img')).not.toBeNull();
    expect(screen.getByText("The Heron")).toBeInTheDocument();

    // The Lift (docs/PLAN_tile-hover.md Task 5): the same tiles as the feed, on the same wall —
    // Saved's wrapper carries the same classes as FeedGrid's, so one wall never lifts beside one
    // that doesn't. The unsave badge is inside the wrapper and rises with it.
    const wrapper = document.querySelector('[data-saved-id="img1"]')!;
    expect(wrapper).toHaveClass(
      "group/tile",
      "relative",
      "motion-lift",
      "hover:scale-[1.035]",
      "hover:shadow-lift",
      "has-[:focus-visible]:scale-[1.035]",
    );

    const columns = screen
      .getByTestId("saved-columns")
      .querySelectorAll(":scope > div");
    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column.querySelectorAll("[data-saved-id]")).toHaveLength(1);
    }
  });

  it("captions the title with the total and labels the chips with live counts", () => {
    render(<SavedScreen />);

    expect(screen.getByText("2 things kept")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All · 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Articles · 1" }),
    ).toBeInTheDocument();
    // Zero-count collections render the bare label — the prototype's rule.
    expect(screen.getByRole("button", { name: "Art" })).toBeInTheDocument();
  });

  it("singularizes the count line", () => {
    listState.current = {
      data: [IMAGE_ITEM],
      isPending: false,
      isError: false,
    };
    countData.current = 1;
    render(<SavedScreen />);
    expect(screen.getByText("1 thing kept")).toBeInTheDocument();
  });

  it("derives the active chip and the list filter from the URL", () => {
    searchParams.current = new URLSearchParams("collection=c1");
    render(<SavedScreen />);

    expect(
      screen.getByRole("button", { name: "Articles · 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All · 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // The query input carries the filter — the RSC prefetch must key identically.
    expect(listInputs.current[0]).toEqual({ collectionId: "c1" });
  });

  it("marks the All chip active and queries unfiltered when there is no param", () => {
    render(<SavedScreen />);
    expect(screen.getByRole("button", { name: "All · 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(listInputs.current[0]).toEqual({});
  });

  it("chip taps rewrite the URL rather than holding filter state", () => {
    render(<SavedScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Articles · 1" }));
    expect(replaceMock).toHaveBeenCalledWith("/saved?collection=c1");

    fireEvent.click(screen.getByRole("button", { name: "All · 2" }));
    expect(replaceMock).toHaveBeenCalledWith("/saved");
  });

  it("unsaves from the badge: optimistic removal, toast, then the invalidation trio", async () => {
    render(<SavedScreen />);

    const badge = document
      .querySelector('[data-saved-id="img1"]')!
      .parentElement!.querySelector('[aria-label="Remove from Saved"]');
    fireEvent.click(badge!);
    expect(unsaveMutateMock).toHaveBeenCalledWith({ itemId: "img1" });

    // The mocked mutate doesn't run the lifecycle — drive it the way React Query would.
    act(() => unsaveOpts.current!.onMutate({ itemId: "img1" }));
    expect(setDataMock).toHaveBeenCalledWith({}, expect.any(Function));
    expect(screen.getByText("Removed from Saved")).toBeInTheDocument();

    await act(async () => void (await unsaveOpts.current!.onSettled()));
    expect(invalidateMock).toHaveBeenCalledTimes(3);
  });

  it("says so when the unsave write fails, instead of letting the removal stand silently", () => {
    render(<SavedScreen />);
    act(() => unsaveOpts.current!.onError());
    expect(
      screen.getByText("Couldn't remove that — it's still here."),
    ).toBeInTheDocument();
  });

  it("opens the item screen from an image tile, without claiming the feed is one entry down", () => {
    render(<SavedScreen />);
    const tile = document.querySelector(
      '[data-saved-id="img1"]',
    )!.firstElementChild!;

    fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(tile, { button: 0, clientX: 5, clientY: 5 });

    // The merged screen since 09-10-26 — `/g/` is a redirect now, and nothing marks an origin.
    expect(pushMock).toHaveBeenCalledWith("/i/img1");
    expect(sessionStorage.getItem("ambit.feedOrigin.v1")).toBeNull();
  });

  it("opens the reader from an article tile, without claiming the feed is one entry down", () => {
    render(<SavedScreen />);
    const tile = document.querySelector(
      '[data-saved-id="art1"]',
    )!.firstElementChild!;

    fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(tile, { button: 0, clientX: 5, clientY: 5 });

    expect(pushMock).toHaveBeenCalledWith("/i/art1");
    // Decision 3: no feed-origin marker from Saved — the item page's Feed button must not pop
    // back here under a Feed label.
    expect(sessionStorage.getItem("ambit.feedOrigin.v1")).toBeNull();
  });

  it("renders the zero-saves empty state with no chips", () => {
    listState.current = { data: [], isPending: false, isError: false };
    countData.current = 0;
    render(<SavedScreen />);

    expect(screen.getByText("Nothing kept yet")).toBeInTheDocument();
    expect(screen.getByText("Your quiet collection")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to exploring" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^All/ })).toBeNull();
  });

  it("distinguishes an empty collection from an empty account", () => {
    searchParams.current = new URLSearchParams("collection=c2");
    listState.current = { data: [], isPending: false, isError: false };
    render(<SavedScreen />);

    expect(
      screen.getByText("Nothing in this collection yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing kept yet")).toBeNull();
  });

  // A failed load must never read as an empty collection — same house rule as the feed.
  it("reports a failed load instead of claiming nothing is kept", () => {
    listState.current = { data: [], isPending: false, isError: true };
    countData.current = 0;
    render(<SavedScreen />);

    expect(
      screen.getByText("Couldn't load your saved things."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing kept yet")).toBeNull();
  });

  it("mounts the pill with the white-filled on-saved bookmark and no share control", () => {
    render(<SavedScreen />);

    const bookmark = screen
      .getByRole("button", { name: "Save to collection" })
      .querySelector("svg");
    expect(bookmark).toHaveClass("text-white");
    expect(bookmark!.querySelector("path")).toHaveAttribute(
      "fill",
      "currentColor",
    );
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("pops back when an in-app surface brought us here, pushes /feed on a cold open", () => {
    sessionStorage.setItem("ambit.savedOrigin.v1", "1");
    const { unmount } = render(<SavedScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(backMock).toHaveBeenCalledOnce();
    expect(pushMock).not.toHaveBeenCalled();
    unmount();

    sessionStorage.clear();
    render(<SavedScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(pushMock).toHaveBeenCalledWith("/feed");
  });

  // The desktop pass, revised (docs/DESIGN_list-screens.md §6): Saved takes the feed's wide
  // column — header content and body both — and packs the feed's column count.
  it("takes the wide column above md, header and body", () => {
    render(<SavedScreen />);
    expect(
      document.querySelectorAll(".md\\:max-w-\\[1120px\\]").length,
    ).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).toBeNull();
  });

  it("packs two stacks on the phone and four from xl", () => {
    render(<SavedScreen />);
    expect(screen.getByTestId("saved-columns")).toHaveClass("grid-cols-2");
    cleanup();
    stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    render(<SavedScreen />);
    expect(screen.getByTestId("saved-columns")).toHaveClass("grid-cols-4");
    expect(
      screen.getByTestId("saved-columns").querySelectorAll(":scope > div"),
    ).toHaveLength(4);
  });

  // The "More of this" shelf (docs/DESIGN_more-or-less.md D6): a chip beside All, `?shelf=more`
  // in the URL, the same wall of tiles fed by `feedback.list`.
  describe("the More of this shelf", () => {
    it("puts a More of this chip straight after All, then a divider, then the collections", () => {
      render(<SavedScreen />);
      const chip = screen.getByRole("button", { name: "More of this" });
      expect(chip).toHaveAttribute("aria-pressed", "false");
      // No count — the drawing has none.
      expect(chip.textContent).toBe("More of this");
      // Order: All, More of this, divider, Articles.
      const row = chip.parentElement!;
      const kids = Array.from(row.children);
      expect(kids[0]).toHaveTextContent("All · 2");
      expect(kids[1]).toBe(chip);
      expect(kids[2]).toHaveAttribute("aria-hidden", "true");
      expect(kids[2]).toHaveClass("border-l", "self-stretch");
      expect(kids[3]).toHaveTextContent("Articles · 1");
    });

    it("navigates to ?shelf=more", () => {
      render(<SavedScreen />);
      fireEvent.click(screen.getByRole("button", { name: "More of this" }));
      expect(replaceMock).toHaveBeenCalledWith("/saved?shelf=more");
    });

    it("selects the chip, deselects All, and renders the shelf's rows", () => {
      searchParams.current = new URLSearchParams("shelf=more");
      shelfState.current = {
        data: [makeItem({ id: "m1", title: "Shelved" })],
        isPending: false,
        isError: false,
      };
      render(<SavedScreen />);

      expect(
        screen.getByRole("button", { name: "More of this" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "All · 2" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      // The wall shows the shelf, not the saves; the count line stays saves.count.
      expect(document.querySelectorAll("[data-saved-id]")).toHaveLength(1);
      expect(document.querySelector('[data-saved-id="m1"]')).not.toBeNull();
      expect(screen.getByText("2 things kept")).toBeInTheDocument();
    });

    it("only fetches the shelf when it is the open view", () => {
      render(<SavedScreen />);
      expect(shelfEnabled.current.every((e) => e === false)).toBe(true);
      cleanup();
      shelfEnabled.current = [];
      searchParams.current = new URLSearchParams("shelf=more");
      render(<SavedScreen />);
      expect(shelfEnabled.current.every((e) => e === true)).toBe(true);
    });

    it("undoes from the badge: Undo More of this label, optimistic filter, Undone toast", async () => {
      searchParams.current = new URLSearchParams("shelf=more");
      shelfState.current = {
        data: [makeItem({ id: "m1" })],
        isPending: false,
        isError: false,
      };
      render(<SavedScreen />);

      expect(
        screen.queryByRole("button", { name: "Remove from Saved" }),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Undo More of this" }),
      );
      expect(clearMutateMock).toHaveBeenCalledWith({ itemId: "m1" });
      expect(unsaveMutateMock).not.toHaveBeenCalled();

      act(() => clearOpts.current!.onMutate({ itemId: "m1" }));
      expect(shelfSetDataMock).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
      );
      expect(screen.getByText("Undone")).toBeInTheDocument();

      await act(async () => void (await clearOpts.current!.onSettled()));
      expect(invalidateMock).toHaveBeenCalled();
    });

    it("says so when the shelf is empty", () => {
      searchParams.current = new URLSearchParams("shelf=more");
      render(<SavedScreen />);
      expect(
        screen.getByText("Nothing marked More of this yet."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Nothing kept yet")).toBeNull();
    });
  });
});
