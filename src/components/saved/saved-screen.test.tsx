// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
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
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock, setData: setDataMock },
        count: { invalidate: invalidateMock },
      },
    }),
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
  { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 1 },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0 },
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
});

afterEach(() => vi.unstubAllGlobals());

describe("SavedScreen", () => {
  it("renders both tile kinds across the two columns", () => {
    const { container } = render(<SavedScreen />);

    expect(document.querySelectorAll("[data-saved-id]")).toHaveLength(2);
    // The image tile is an <img> through the proxy; the article tile is its headline.
    expect(document.querySelector('[data-saved-id="img1"] img')).not.toBeNull();
    expect(screen.getByText("The Heron")).toBeInTheDocument();

    const columns = container.querySelectorAll(".grid > div");
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

  it("opens the gallery from an image tile, with the origin marked for the close gesture", () => {
    render(<SavedScreen />);
    const tile = document.querySelector(
      '[data-saved-id="img1"]',
    )!.firstElementChild!;

    fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(tile, { button: 0, clientX: 5, clientY: 5 });

    expect(pushMock).toHaveBeenCalledWith("/g/img1");
    expect(sessionStorage.getItem("ambit.galleryOrigin.v1")).toBe("img1");
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
    fireEvent.click(screen.getByRole("button", { name: "Back to feed" }));
    expect(backMock).toHaveBeenCalledOnce();
    expect(pushMock).not.toHaveBeenCalled();
    unmount();

    sessionStorage.clear();
    render(<SavedScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Back to feed" }));
    expect(pushMock).toHaveBeenCalledWith("/feed");
  });
});
