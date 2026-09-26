// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  markExploreOrigin,
  markFeedOrigin,
} from "~/components/feed/feed-origin";
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

  const leave = (itemId: string, exploring = false) => {
    const { result } = renderHook(() => useLeaveToFeed(itemId, { exploring }));
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

  // `/explore` (09-26-26): a visitor who reached this item from the signed-out feed, then wandered
  // off it, goes back to /explore — /feed would only bounce them to the landing.
  it("goes to /explore, not /feed, when the visit began on /explore", () => {
    markExploreOrigin();
    markFeedOrigin("item-other");

    leave("item-1", true);

    expect(pushMock).toHaveBeenCalledWith("/explore");
  });

  // The marker outlives a sign-in in the same tab. A signed-in reader (the item screen passes
  // `exploring: false` for anyone authed) must be sent to their feed, not to /explore's redirect.
  it("ignores a stale explore marker when the screen says the reader isn't exploring", () => {
    markExploreOrigin();

    leave("item-1", false);

    expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
  });

  it("still pops when the explore tile is the one that opened it", () => {
    markExploreOrigin();
    markFeedOrigin("item-1");

    leave("item-1", true);

    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
