// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard, FeedPage, Tier } from "~/server/services/feed";
import { FeedScreen } from "./feed-screen";

// The screen's whole job is composition — infinite query in, two packed columns plus a pill, three
// sheets and a toast out — so everything below the query is mocked and the assertions are about
// wiring. The packing itself is `masonry.test.ts`'s.
const {
  feedState,
  searchParams,
  fetchNextPageMock,
  refetchMock,
  pushMock,
  saveMutateMock,
  invalidateMock,
} = vi.hoisted(() => ({
  feedState: {
    current: {},
  },
  searchParams: { current: new URLSearchParams() },
  fetchNextPageMock: vi.fn(),
  refetchMock: vi.fn(),
  pushMock: vi.fn(),
  saveMutateMock: vi.fn(),
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
    feed: { page: { useInfiniteQuery: () => feedState.current } },
    saves: {
      collections: {
        useQuery: () => ({
          data: [
            { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 2 },
          ],
          isLoading: false,
        }),
      },
      count: { useQuery: () => ({ data: 2, isLoading: false }) },
      saveToCollection: {
        useMutation: () => ({ mutate: saveMutateMock, isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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

function card(
  id: string,
  over: Partial<Item> = {},
  tier: Tier = "CORE",
  driftPath?: string[],
): FeedCard {
  return {
    item: makeItem({ id, ...over }),
    tier,
    topicId: over.topicId ?? "botany",
    ...(driftPath ? { driftPath } : {}),
  };
}

const PAGE_ONE: FeedPage = {
  cards: [
    card("i1"),
    card("a1", { type: "article", title: "The Heron", summary: "A lede." }),
    card("i2"),
    card("j1", { topicId: "astronomy" }, "JUMP", ["botany", "astronomy"]),
  ],
  nextCursor: "cursor-1",
};

const PAGE_TWO: FeedPage = {
  cards: [card("i3"), card("i4")],
  nextCursor: undefined,
};

const LABELS = { botany: "Botany", astronomy: "Astronomy" };

function loaded(over: Record<string, unknown> = {}) {
  return {
    data: { pages: [PAGE_ONE, PAGE_TWO] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    fetchNextPage: fetchNextPageMock,
    refetch: refetchMock,
    ...over,
  };
}

/**
 * Replaces the inert setup.ts stub with one that hands the test the observer's callback, so an
 * intersection can be fired on demand. jsdom has no layout, so nothing ever intersects on its own.
 */
function captureObserver() {
  const captured: { fire?: (isIntersecting: boolean) => void } = {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        captured.fire = (isIntersecting: boolean) =>
          cb(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {
        /* the test fires by hand */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    },
  );
  return captured;
}

// jsdom implements no scrolling at all — `window.scrollTo` logs a "Not implemented" error and does
// nothing. Stubbing it keeps the noise out and, more usefully, makes "did the feed try to scroll?"
// assertable.
const scrollToMock = vi.fn();

beforeEach(() => {
  feedState.current = loaded();
  searchParams.current = new URLSearchParams();
  window.scrollTo = scrollToMock;
  sessionStorage.clear();
  scrollToMock.mockClear();
  fetchNextPageMock.mockClear();
  pushMock.mockClear();
  saveMutateMock.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("FeedScreen", () => {
  it("renders every card across both pages, plus the page's Because tile", () => {
    render(<FeedScreen topicLabels={LABELS} />);

    // Six cards over two pages, each in a `data-feed-id` wrapper.
    expect(document.querySelectorAll("[data-feed-id]")).toHaveLength(6);
    expect(screen.getByText("The Heron")).toBeInTheDocument();
    // The eyebrow is uppercased by CSS, so the text in the DOM is the label as authored.
    expect(screen.getByText("The Met")).toBeInTheDocument();
    expect(
      screen.getByText("you've been exploring Botany"),
    ).toBeInTheDocument();
    expect(screen.getByText("Astronomy")).toBeInTheDocument();
  });

  it("splits the tiles across two columns", () => {
    const { container } = render(<FeedScreen topicLabels={LABELS} />);
    const columns = container.querySelectorAll(".grid > div");
    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column.querySelectorAll("[data-feed-id]").length).toBeGreaterThan(
        0,
      );
    }
  });

  it("fetches the next page when the sentinel comes into view", () => {
    feedState.current = loaded({ hasNextPage: true });
    const observer = captureObserver();
    render(<FeedScreen topicLabels={LABELS} />);

    act(() => observer.fire!(true));
    expect(fetchNextPageMock).toHaveBeenCalledOnce();
  });

  // The observer keeps firing all the way through a fetch (the sentinel stays on screen), so
  // without the guard one long scroll to the bottom requests the same page repeatedly — and every
  // one of those permanently consumes items.
  it("does not stack fetches while one is already in flight", () => {
    feedState.current = loaded({ hasNextPage: true, isFetchingNextPage: true });
    const observer = captureObserver();
    render(<FeedScreen topicLabels={LABELS} />);

    act(() => observer.fire!(true));
    act(() => observer.fire!(true));
    expect(fetchNextPageMock).not.toHaveBeenCalled();
  });

  it("ignores the sentinel leaving the viewport", () => {
    feedState.current = loaded({ hasNextPage: true });
    const observer = captureObserver();
    render(<FeedScreen topicLabels={LABELS} />);

    act(() => observer.fire!(false));
    expect(fetchNextPageMock).not.toHaveBeenCalled();
  });

  it("opens the item page on a tap", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    const tile = document.querySelector(
      '[data-feed-id="i1"]',
    )!.firstElementChild!;

    fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(tile, { button: 0, clientX: 5, clientY: 5 });

    expect(pushMock).toHaveBeenCalledWith("/i/i1");
  });

  it("opens the item sheet, for the pressed item, on a long press", () => {
    vi.useFakeTimers();
    try {
      render(<FeedScreen topicLabels={LABELS} />);
      const tile = document.querySelector(
        '[data-feed-id="a1"]',
      )!.firstElementChild!;

      fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
      act(() => void vi.advanceTimersByTime(450));

      expect(
        screen.getByRole("button", { name: "Closer Look" }),
      ).toBeInTheDocument();
      // The sheet's title is the pressed item's — proof the right card was carried through.
      expect(screen.getAllByText("The Heron").length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Museum CDNs bot-block third-party fetchers, so this path is exercised for real until the 5.7
  // image proxy lands.
  //
  // The retry matters more on a phone than it looks on a desktop: a single dropped request used to
  // latch the tile into `Image unavailable` for the life of the page, with no way back, so a brief
  // dead spot in mobile coverage permanently pocked the wall (found 08-18-26 on-device).
  it("retries a failed image rather than giving up on the first error", () => {
    vi.useFakeTimers();
    try {
      render(<FeedScreen topicLabels={LABELS} />);
      const img = document.querySelector('[data-feed-id="i1"] img')!;

      fireEvent.error(img);
      act(() => void vi.advanceTimersByTime(5_000));

      expect(document.querySelector('[data-feed-id="i1"] img')).not.toBeNull();
      expect(screen.queryByText("Image unavailable")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the tile's slot with a caption once the retries are exhausted", () => {
    vi.useFakeTimers();
    try {
      render(<FeedScreen topicLabels={LABELS} />);

      // One more failure than the retry budget allows.
      for (let i = 0; i < 4; i++) {
        const img = document.querySelector('[data-feed-id="i1"] img');
        if (!img) break;
        fireEvent.error(img);
        act(() => void vi.advanceTimersByTime(5_000));
      }

      expect(screen.getByText("Image unavailable")).toBeInTheDocument();
      expect(document.querySelector('[data-feed-id="i1"] img')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when the corpus is exhausted", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    expect(
      screen.getByText("You've reached the edge, for now."),
    ).toBeInTheDocument();
  });

  it("shows the empty state, not the end-of-feed line, when there is nothing at all", () => {
    feedState.current = loaded({
      data: { pages: [{ cards: [], nextCursor: undefined }] },
    });
    render(<FeedScreen topicLabels={LABELS} />);

    expect(
      screen.getByText("Nothing here yet. Check back soon."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You've reached the edge, for now."),
    ).not.toBeInTheDocument();
  });

  // A failed fetch must never read as an empty feed — same house rule as the sheets' `onError`.
  it("reports a failed load instead of claiming the feed is empty", () => {
    feedState.current = loaded({ isError: true, data: undefined });
    render(<FeedScreen topicLabels={LABELS} />);

    expect(screen.getByText("Couldn't load the feed.")).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing here yet. Check back soon."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it("shows the loader while a page is on its way", () => {
    feedState.current = loaded({ hasNextPage: true, isFetchingNextPage: true });
    render(<FeedScreen topicLabels={LABELS} />);
    expect(
      screen.getByText("finding something interesting…"),
    ).toBeInTheDocument();
  });

  // Share has no referent on a feed — there is no "current item" for it to act on.
  it("mounts the pill without a share control", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("opens the browse-collections sheet from the pill's bookmark", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to collection" }));
    expect(
      screen.getByRole("heading", { name: "Your collections" }),
    ).toBeInTheDocument();
  });
});

// jsdom has no layout — every `getBoundingClientRect()` is zeros — so these can only assert the
// mechanism (did it look, did it retry, did it fall back), never the resulting offset. The offset
// itself is checked by hand and by e2e, through the item stub's Back link.
describe("FeedScreen — returning to the feed", () => {
  it("scrolls to the tile named by ?focus=", () => {
    searchParams.current = new URLSearchParams("focus=i2");
    render(<FeedScreen topicLabels={LABELS} />);
    expect(scrollToMock).toHaveBeenCalledOnce();
  });

  it("retries for a tile that isn't there yet, then gives up on the saved offset", () => {
    vi.useFakeTimers();
    try {
      searchParams.current = new URLSearchParams("focus=not-on-this-page");
      sessionStorage.setItem("ambit.feedScroll.v1", "1200");
      render(<FeedScreen topicLabels={LABELS} />);

      // Nothing yet: the tile might still be laying out.
      expect(scrollToMock).not.toHaveBeenCalled();

      act(() => void vi.advanceTimersByTime(90));
      expect(scrollToMock).not.toHaveBeenCalled();

      act(() => void vi.advanceTimersByTime(1000));
      expect(scrollToMock).toHaveBeenCalledWith({ top: 1200 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the remembered offset when there's no focus id", () => {
    sessionStorage.setItem("ambit.feedScroll.v1", "640");
    render(<FeedScreen topicLabels={LABELS} />);
    expect(scrollToMock).toHaveBeenCalledWith({ top: 640 });
  });

  it("stays put when nothing was remembered", () => {
    render(<FeedScreen topicLabels={LABELS} />);
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
