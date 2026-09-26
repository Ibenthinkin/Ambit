// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ExploreConfig from "~/config/explore";
import { EXPLORE_ABOUT, EXPLORE_BLOCKS } from "~/config/explore";
import type { Item } from "~/server/db/items";
import type { FeedCard, FeedPage } from "~/server/services/feed";
import { stubMatchMedia } from "~/test/match-media";
import { ExploreScreen } from "./explore-screen";

// `/explore`'s screen is composition over the grid: the query, the cap, the message blocks and
// the two surfaces they open. The grid and the packing are FeedGrid's and masonry's own tests.
const { feedState, queryInputs, fetchNextPageMock, pushMock } = vi.hoisted(
  () => ({
    feedState: { current: {} },
    queryInputs: [] as unknown[],
    fetchNextPageMock: vi.fn(() => Promise.resolve()),
    pushMock: vi.fn(),
  }),
);

vi.mock("~/trpc/react", () => ({
  api: {
    feed: {
      explore: {
        useInfiniteQuery: (input: unknown) => {
          queryInputs.push(input);
          return feedState.current;
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// The real card needs Better Auth's client; what matters here is which mode it was opened in.
vi.mock("~/components/landing/auth-card", () => ({
  AuthCard: ({ initialMode }: { initialMode?: string }) => (
    <div data-testid="auth-card">{initialMode ?? "signin"}</div>
  ),
}));

// A three-image cap, so the test can reach it with a handful of cards.
vi.mock("~/config/explore", async (importOriginal) => ({
  ...(await importOriginal<typeof ExploreConfig>()),
  EXPLORE_FEED_IMAGE_CAP: 3,
}));

function card(id: string): FeedCard {
  const item = {
    id,
    source: "met",
    sourceId: id,
    type: "image",
    title: `Item ${id}`,
    summary: null,
    body: null,
    imageUrl: `https://example.test/${id}.jpg`,
    imageWidth: null,
    imageHeight: null,
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-09-26T00:00:00Z"),
  } satisfies Item;
  return { item, tier: "CORE", topicId: "botany" };
}

const page = (ids: string[], nextCursor?: string): FeedPage => ({
  cards: ids.map(card),
  nextCursor,
});

function loaded(pages: FeedPage[], over: Record<string, unknown> = {}) {
  return {
    data: { pages },
    hasNextPage: pages.at(-1)?.nextCursor !== undefined,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPending: false,
    isError: false,
    fetchNextPage: fetchNextPageMock,
    refetch: vi.fn(),
    ...over,
  };
}

const authSheet = () => screen.getByTestId("auth-sheet");

beforeEach(() => {
  stubMatchMedia([]);
  queryInputs.length = 0;
  fetchNextPageMock.mockClear();
  pushMock.mockClear();
  sessionStorage.clear();
  // Two cards: under the three-image cap, with a next page to come.
  feedState.current = loaded([page(["a", "b"], "c1")]);
});
afterEach(() => vi.unstubAllGlobals());

describe("ExploreScreen", () => {
  it("queries feed.explore with {} — the RSC prefetch's exact input", () => {
    render(<ExploreScreen topicLabels={{}} />);
    expect(queryInputs[0]).toEqual({});
  });

  it("shows the page's cards and its message block", () => {
    const { container } = render(<ExploreScreen topicLabels={{}} />);
    expect(container.querySelectorAll("[data-feed-id]")).toHaveLength(2);
    expect(screen.getByText(EXPLORE_BLOCKS.about.title)).toBeInTheDocument();
  });

  it("opens the about dialog from the 'what is this?' block", () => {
    render(<ExploreScreen topicLabels={{}} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: EXPLORE_BLOCKS.about.actions[0].label,
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(EXPLORE_ABOUT.title)).toBeInTheDocument();
    expect(
      within(dialog).getByText(EXPLORE_ABOUT.paragraphs[0]),
    ).toBeInTheDocument();
  });

  it("the about dialog's sign-up button opens the card in sign-up", () => {
    render(<ExploreScreen topicLabels={{}} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: EXPLORE_BLOCKS.about.actions[0].label,
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Sign up",
      }),
    );
    expect(authSheet()).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("auth-card")).toHaveTextContent("signup");
  });

  it("the header's Sign in opens the card in sign-in", () => {
    render(<ExploreScreen topicLabels={{}} />);
    expect(authSheet()).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authSheet()).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("auth-card")).toHaveTextContent("signin");
  });

  it("the auth sheet's logo closes it", () => {
    render(<ExploreScreen topicLabels={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to exploring" }));
    expect(authSheet()).toHaveAttribute("data-open", "false");
  });

  it("a tap opens the item page, marking the way back", () => {
    const { container } = render(<ExploreScreen topicLabels={{}} />);
    const tile = container.querySelector('[data-feed-id="a"] > *')!;
    fireEvent.pointerDown(tile, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(tile, { button: 0, clientX: 5, clientY: 5 });
    expect(pushMock).toHaveBeenCalledWith("/i/a");
    expect(sessionStorage.getItem("ambit.feedOrigin.v1")).toBe("a");
  });

  it("at the image cap: trims, closes on the end card, and fetches no more", () => {
    feedState.current = loaded([
      page(["a", "b"], "c1"),
      page(["c", "d"], "c2"),
    ]);
    const { container } = render(<ExploreScreen topicLabels={{}} />);
    expect(
      [...container.querySelectorAll("[data-feed-id]")].map((el) =>
        el.getAttribute("data-feed-id"),
      ),
    ).toEqual(["a", "b", "c"]);
    expect(screen.getByText(EXPLORE_BLOCKS.end.title)).toBeInTheDocument();
    expect(fetchNextPageMock).not.toHaveBeenCalled();
  });
});
