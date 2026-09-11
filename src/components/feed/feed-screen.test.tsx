// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard, FeedPage, Tier } from "~/server/services/feed";
import { DESKTOP_QUERY, WIDE_QUERY } from "~/hooks/use-media-query";
import { stubMatchMedia } from "~/test/match-media";
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
  ackSeenMock,
  invalidateMock,
  queryInputs,
  forgetMock,
} = vi.hoisted(() => ({
  feedState: {
    current: {},
  },
  searchParams: { current: new URLSearchParams() },
  fetchNextPageMock: vi.fn(),
  refetchMock: vi.fn(),
  pushMock: vi.fn(),
  saveMutateMock: vi.fn(),
  ackSeenMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  // Every input `feed.page.useInfiniteQuery` was called with, in render order — the dev knob
  // panel (09-05-26) made the input vary, and /feed's `{}` contract is pinned by reading it.
  queryInputs: [] as unknown[],
  forgetMock: vi.fn(),
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
    feed: {
      page: {
        useInfiniteQuery: (input: unknown) => {
          queryInputs.push(input);
          return feedState.current;
        },
      },
      markSeen: { useMutation: () => ({ mutate: ackSeenMock }) },
      forgetSince: {
        useMutation: () => ({ mutateAsync: forgetMock, isPending: false }),
      },
    },
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
      // The New-collection row every picker ends with (09-10-26) — the item sheet and the browse
      // sheet both mount one.
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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

/**
 * Where the sentinel sits, as the screen measures it. jsdom has no layout, so `getBoundingClientRect`
 * is stubbed: the element marked `feed-sentinel` reports `top` = `sentinelTop.current` (px from the
 * top of the viewport; jsdom's viewport is 768 tall and the trip wire's margin is 500, so anything
 * under 1268 is "in range"). Everything else gets jsdom's zero rect. Defaults to far away, so a test
 * that doesn't care about geometry never loads a page by accident.
 */
const sentinelTop = { current: 10_000 };
function stubSentinelGeometry() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const top =
        this.getAttribute("data-testid") === "feed-sentinel"
          ? sentinelTop.current
          : 0;
      // jsdom's own rect is all zeros; only the sentinel's `top` means anything here.
      return {
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    },
  );
}

// jsdom implements no scrolling at all — `window.scrollTo` logs a "Not implemented" error and does
// nothing. Stubbing it keeps the noise out and, more usefully, makes "did the feed try to scroll?"
// assertable.
const scrollToMock = vi.fn();

beforeEach(() => {
  feedState.current = loaded();
  sentinelTop.current = 10_000;
  stubSentinelGeometry();
  searchParams.current = new URLSearchParams();
  window.scrollTo = scrollToMock;
  sessionStorage.clear();
  scrollToMock.mockClear();
  fetchNextPageMock.mockClear();
  pushMock.mockClear();
  saveMutateMock.mockClear();
  ackSeenMock.mockClear();
  queryInputs.length = 0;
  forgetMock.mockReset().mockResolvedValue({ forgotten: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FeedScreen", () => {
  it("renders every card across both pages, plus the page's Because tile", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

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
    const { container } = render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />,
    );
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
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    act(() => observer.fire!(true));
    expect(fetchNextPageMock).toHaveBeenCalledOnce();
  });

  // The observer keeps firing all the way through a fetch (the sentinel stays on screen), so
  // without the guard one long scroll to the bottom requests the same page repeatedly — and every
  // one of those permanently consumes items.
  it("does not stack fetches while one is already in flight", () => {
    feedState.current = loaded({ hasNextPage: true, isFetchingNextPage: true });
    const observer = captureObserver();
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    act(() => observer.fire!(true));
    act(() => observer.fire!(true));
    expect(fetchNextPageMock).not.toHaveBeenCalled();
  });

  it("ignores the sentinel leaving the viewport", () => {
    feedState.current = loaded({ hasNextPage: true });
    const observer = captureObserver();
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    act(() => observer.fire!(false));
    expect(fetchNextPageMock).not.toHaveBeenCalled();
  });

  // The trip wire (09-10-26). An IntersectionObserver calls back only on a *crossing*. On a first
  // load its one callback lands while the feed is still empty — "intersecting", with nothing to
  // load yet — and if the page that then arrives is short enough to leave the sentinel inside the
  // margin, nothing ever crosses again: page 2 never loads, a scroll to the bottom never appends,
  // and the next remount (the reader popping back from an item) loads it instead. Measured in a
  // production build: first callback at 816px above the fold with zero pages, then the sentinel
  // parked 505–533px below it — a hair outside the 500px margin on the runs that passed.
  describe("the trip wire, decided from where the sentinel is rather than from a crossing", () => {
    it("loads the next page once it arrives if the sentinel is still in range — no fresh crossing needed", () => {
      feedState.current = loaded({
        isPending: true,
        data: undefined,
        hasNextPage: false,
      });
      sentinelTop.current = 300;
      const observer = captureObserver();
      const { rerender } = render(
        <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />,
      );

      // The first load's one callback: in range, but there is nothing to load yet.
      act(() => observer.fire!(true));
      expect(fetchNextPageMock).not.toHaveBeenCalled();

      // Page one arrives, short: the sentinel is still in range, and the observer says nothing.
      feedState.current = loaded({ hasNextPage: true });
      rerender(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
      expect(fetchNextPageMock).toHaveBeenCalledOnce();
    });

    it("keeps filling when a page lands and the sentinel is still in range", () => {
      feedState.current = loaded({
        hasNextPage: true,
        isFetchingNextPage: true,
      });
      sentinelTop.current = 300;
      captureObserver();
      const { rerender } = render(
        <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />,
      );
      expect(fetchNextPageMock).not.toHaveBeenCalled();

      feedState.current = loaded({
        hasNextPage: true,
        isFetchingNextPage: false,
      });
      rerender(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
      expect(fetchNextPageMock).toHaveBeenCalledOnce();
    });

    // The corpus guard: every page received is a page spent (it is acked), so a landing page must
    // never pull the next one unless the reader is genuinely near the bottom.
    it("stays still when the page lands with the sentinel out of range", () => {
      feedState.current = loaded({
        hasNextPage: true,
        isFetchingNextPage: true,
      });
      sentinelTop.current = 2_000;
      captureObserver();
      const { rerender } = render(
        <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />,
      );

      feedState.current = loaded({
        hasNextPage: true,
        isFetchingNextPage: false,
      });
      rerender(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
      expect(fetchNextPageMock).not.toHaveBeenCalled();
    });

    // A next page that failed must not be retried in a loop by the re-check — the reader's own
    // scroll (a real crossing) is what asks again, exactly as before.
    it("does not retry a failed next page on its own; a crossing still does", () => {
      feedState.current = loaded({
        hasNextPage: true,
        isFetchNextPageError: true,
      });
      sentinelTop.current = 300;
      const observer = captureObserver();
      render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
      expect(fetchNextPageMock).not.toHaveBeenCalled();

      act(() => observer.fire!(true));
      expect(fetchNextPageMock).toHaveBeenCalledOnce();
    });
  });

  it("opens the item page on a tap", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
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
      render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
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

  // Receipt, not render, is what spends an item (5.7). The server composes a page and writes
  // nothing; this effect is the only thing that tells the DB the reader got it.
  it("acks each received page exactly once", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    expect(ackSeenMock).toHaveBeenCalledTimes(2);
    expect(ackSeenMock).toHaveBeenNthCalledWith(1, {
      itemIds: ["i1", "a1", "i2", "j1"],
    });
    expect(ackSeenMock).toHaveBeenNthCalledWith(2, { itemIds: ["i3", "i4"] });
  });

  it("does not re-ack a page it has already acked on a re-render", () => {
    const { rerender } = render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />,
    );
    ackSeenMock.mockClear();

    rerender(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    expect(ackSeenMock).not.toHaveBeenCalled();
  });

  // Every http(s) image goes through Ambit's own origin as of 5.7 — that single fact is what
  // unblocked AIC's 1,338 images (see api/img/[itemId]/route.ts).
  it("loads tile images through the proxy, not the source CDN", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    const img = document.querySelector('[data-feed-id="i1"] img')!;
    expect(img.getAttribute("src")).toBe("/api/img/i1");
  });

  // A proxied image can still fail — a flaky network, a source CDN that's down.
  //
  // The retry matters more on a phone than it looks on a desktop: a single dropped request used to
  // latch the tile into `Image unavailable` for the life of the page, with no way back, so a brief
  // dead spot in mobile coverage permanently pocked the wall (found 08-18-26 on-device).
  it("retries a failed image rather than giving up on the first error", () => {
    vi.useFakeTimers();
    try {
      render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
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
      render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

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
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(
      screen.getByText("You've reached the edge, for now."),
    ).toBeInTheDocument();
  });

  it("shows the empty state, not the end-of-feed line, when there is nothing at all", () => {
    feedState.current = loaded({
      data: { pages: [{ cards: [], nextCursor: undefined }] },
    });
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

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
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

    expect(screen.getByText("Couldn't load the feed.")).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing here yet. Check back soon."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it("shows the loader while a page is on its way", () => {
    feedState.current = loaded({ hasNextPage: true, isFetchingNextPage: true });
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(
      screen.getByText("finding something interesting…"),
    ).toBeInTheDocument();
  });

  // Share has no referent on a feed — there is no "current item" for it to act on.
  it("mounts the pill without a share control", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share" }),
    ).not.toBeInTheDocument();
  });

  it("opens the browse-collections sheet from the pill's bookmark", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
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
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(scrollToMock).toHaveBeenCalledOnce();
  });

  it("retries for a tile that isn't there yet, then gives up on the saved offset", () => {
    vi.useFakeTimers();
    try {
      searchParams.current = new URLSearchParams("focus=not-on-this-page");
      sessionStorage.setItem("ambit.feedScroll.v1", "1200");
      render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);

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
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(scrollToMock).toHaveBeenCalledWith({ top: 640 });
  });

  it("stays put when nothing was remembered", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});

// ── the dev knob panel (plan 09-05-26) ──────────────────────────────────────────────────────────
describe("FeedScreen without `dev` — the /feed contract", () => {
  it("queries with the literal input {} so the RSC prefetch key matches", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(queryInputs[0]).toEqual({});
    // Not `{ knobs: undefined }` — React Query hashes that differently from `{}`.
    expect(Object.keys(queryInputs[0] as object)).toEqual([]);
  });

  it("renders no knob panel", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(screen.queryByTestId("knob-panel")).not.toBeInTheDocument();
  });
});

describe("FeedScreen with `dev`", () => {
  // Botany is core, astronomy is grown, as far as this fixture is concerned — the split is decided
  // by the ids the shell passes, not by anything the screen knows on its own.
  const dev = { originalTopicIds: ["botany"] };

  beforeEach(() => {
    localStorage.clear();
  });

  it("mounts the panel and sends the default knobs in the query input", () => {
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    expect(screen.getByTestId("knob-panel")).toBeInTheDocument();
    const input = queryInputs[0] as {
      knobs: Record<string, number>;
      nonce: number;
    };
    expect(input.knobs.tierCore).toBe(40);
    expect(input.knobs.grownEdgeScale).toBe(1);
    expect(input.nonce).toBe(0);
  });

  it("still acks pages (tuning must exercise the real seen filter)", () => {
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    expect(ackSeenMock).toHaveBeenCalledWith({
      itemIds: PAGE_ONE.cards.map((c) => c.item.id),
    });
  });

  it("committing a slider forgets the session, then queries again with the new knob and a new nonce", async () => {
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    const before = queryInputs.at(-1) as { nonce: number };
    const slider = screen.getByRole("slider", { name: /CORE/ });
    fireEvent.change(slider, { target: { value: "70" } });
    await act(async () => {
      fireEvent.pointerUp(slider);
    });
    expect(forgetMock).toHaveBeenCalledTimes(1);
    expect(forgetMock.mock.calls[0]![0]).toHaveProperty("since");
    const after = queryInputs.at(-1) as {
      knobs: Record<string, number>;
      nonce: number;
    };
    expect(after.knobs.tierCore).toBe(70);
    expect(after.nonce).not.toBe(before.nonce);
  });

  it("shows per-page and session tier counts, and the core/grown split", () => {
    // The fixture: PAGE_TWO (the last page) is two CORE cards; the session is five CORE and one
    // JUMP, five on botany (core here) and one on astronomy (grown here).
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    const panel = screen.getByTestId("knob-panel");
    expect(panel).toHaveTextContent("CORE 2 · DRIFT 0 · JUMP 0");
    expect(panel).toHaveTextContent("CORE 5 · DRIFT 0 · JUMP 1");
    expect(panel).toHaveTextContent("5 (83%) / 1 (17%)");
  });

  it("picks up a persisted session mark, so a reopened tab forgets the cycle a closed one left behind", async () => {
    // A closed tab never runs the unmount forget. The mark it last set is in localStorage, and
    // the next mount must forget from *there*, not from its own `new Date()`.
    const earlier = "2026-09-05T10:00:00.000Z";
    localStorage.setItem("ambit.devKnobs.mark", earlier);
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    const slider = screen.getByRole("slider", { name: /Page size/ });
    fireEvent.change(slider, { target: { value: "8" } });
    await act(async () => {
      fireEvent.pointerUp(slider);
    });
    expect(forgetMock).toHaveBeenCalledWith({ since: new Date(earlier) });
    // …and the mark moved forward, so the next mount does not forget this cycle twice over.
    expect(localStorage.getItem("ambit.devKnobs.mark")).not.toBe(earlier);
  });

  it("persists knobs to localStorage under the versioned key", async () => {
    render(
      <FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} dev={dev} />,
    );
    const slider = screen.getByRole("slider", { name: /Page size/ });
    fireEvent.change(slider, { target: { value: "8" } });
    await act(async () => {
      fireEvent.pointerUp(slider);
    });
    expect(
      JSON.parse(localStorage.getItem("ambit.devKnobs.v1") ?? "{}"),
    ).toMatchObject({ pageSize: 8 });
  });
});

// The desktop pass (docs/DESIGN_desktop-polish.md §2). The count comes from `useColumnCount`,
// which reads `matchMedia` — absent in jsdom, so every test above renders the phone's two
// columns and only these stub it.
describe("desktop columns", () => {
  it("packs two columns where matchMedia is absent (the phone, and the server)", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    const grid = screen.getByTestId("feed-columns");
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid.children).toHaveLength(2);
  });

  it("packs four columns above xl, three above md", () => {
    const media = stubMatchMedia([DESKTOP_QUERY, WIDE_QUERY]);
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    const grid = screen.getByTestId("feed-columns");
    expect(grid).toHaveClass("grid-cols-4");
    expect(grid.children).toHaveLength(4);

    media.fire(WIDE_QUERY, false);
    expect(screen.getByTestId("feed-columns")).toHaveClass("grid-cols-3");
    expect(screen.getByTestId("feed-columns").children).toHaveLength(3);
  });

  it("centers the masonry in the wide column", () => {
    render(<FeedScreen appUrl="https://ambit.test" topicLabels={LABELS} />);
    expect(screen.getByTestId("feed-columns").parentElement).toHaveClass(
      "md:max-w-[1120px]",
    );
  });
});
