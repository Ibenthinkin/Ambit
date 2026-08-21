// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markFeedOrigin } from "~/components/feed/feed-origin";
import { useLeaveToFeed } from "./use-leave-to-feed";

const { backMock, pushMock } = vi.hoisted(() => ({
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

// `markFeedOrigin` is the real thing against jsdom's real sessionStorage — the marker's write and
// read are two halves of one contract, and mocking either half would test only itself.
describe("useLeaveToFeed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    backMock.mockClear();
    pushMock.mockClear();
  });

  const leave = (itemId: string) => {
    const { result } = renderHook(() => useLeaveToFeed(itemId));
    act(() => result.current());
  };

  it("pops history when the reader came from the feed", () => {
    markFeedOrigin("item-1");

    leave("item-1");

    expect(backMock).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  // A cold-opened shared link has no feed behind it — popping would leave Ambit altogether.
  it("builds a focused feed when there's no marker at all", () => {
    leave("item-1");

    expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
    expect(backMock).not.toHaveBeenCalled();
  });

  // The marker names one item. Arriving at a *different* item (following a wander-next link, say)
  // means the feed is no longer the previous entry.
  it("builds a focused feed when the marker names another item", () => {
    markFeedOrigin("item-other");

    leave("item-1");

    expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
    expect(backMock).not.toHaveBeenCalled();
  });
});
