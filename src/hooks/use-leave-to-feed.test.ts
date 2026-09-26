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

  const leave = (itemId: string, signedOut = false) => {
    const { result } = renderHook(() => useLeaveToFeed(itemId, { signedOut }));
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

  // (09-26-26) A signed-out visitor — from the explore feed at `/` or a shared link — goes to `/`;
  // /feed would only bounce them there anyway, and would draw a page on the way.
  it("goes to /, not /feed, for a signed-out visitor", () => {
    markExploreOrigin();
    markFeedOrigin("item-other");

    leave("item-1", true);

    expect(pushMock).toHaveBeenCalledWith("/");
  });

  // The marker outlives a sign-in in the same tab. A signed-in reader (the item screen passes
  // `signedOut: false` for anyone authed) must be sent to their feed, not to `/`'s redirect.
  it("ignores a stale explore marker when the screen says the reader is signed in", () => {
    markExploreOrigin();

    leave("item-1", false);

    expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
  });

  it("goes to / on a cold-opened shared link too, with no marker at all", () => {
    leave("item-1", true);

    expect(pushMock).toHaveBeenCalledWith("/");
    expect(backMock).not.toHaveBeenCalled();
  });

  it("still pops when the explore tile is the one that opened it", () => {
    markExploreOrigin();
    markFeedOrigin("item-1");

    leave("item-1", true);

    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
