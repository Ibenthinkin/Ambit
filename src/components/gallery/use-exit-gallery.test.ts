// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markFeedOrigin } from "~/components/feed/feed-origin";
import { markGalleryOrigin } from "./gallery-origin";
import { useExitGallery } from "./use-exit-gallery";

const { backMock, pushMock } = vi.hoisted(() => ({
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

// Both markers are the real thing against jsdom's real sessionStorage — same reasoning as
// `use-leave-to-feed.test.ts`: a marker's write and read are two halves of one contract, and mocking
// either half would test only itself.
describe("useExitGallery", () => {
  const goMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    backMock.mockClear();
    pushMock.mockClear();
    goMock.mockClear();
    vi.spyOn(history, "go").mockImplementation(goMock);
  });

  /**
   * Renders the hook and runs one of its two exits. The render has to happen *outside* `act`, or
   * `result.current` is still null when the callback reaches for it.
   */
  const leave = (entryId: string, which: "exit" | "toFeed") => {
    const { result } = renderHook(() => useExitGallery(entryId));
    act(() => result.current[which]());
  };

  describe("exit — the close gesture", () => {
    it("pops to the entry surface when the gallery was opened from inside the app", () => {
      markGalleryOrigin("item-1");

      leave("item-1", "exit");

      expect(backMock).toHaveBeenCalledTimes(1);
      expect(pushMock).not.toHaveBeenCalled();
    });

    // A cold-opened `/g/` link has nothing behind it — popping would leave Ambit altogether.
    it("pushes the item page when there's no marker at all", () => {
      leave("item-1", "exit");

      expect(pushMock).toHaveBeenCalledWith("/i/item-1");
      expect(backMock).not.toHaveBeenCalled();
    });

    // The marker names one item; arriving at a different gallery means the entry surface for
    // *this* one isn't the previous history entry.
    it("pushes the item page when the marker names another item", () => {
      markGalleryOrigin("item-other");

      leave("item-1", "exit");

      expect(pushMock).toHaveBeenCalledWith("/i/item-1");
      expect(backMock).not.toHaveBeenCalled();
    });
  });

  describe("toFeed — the pill's Feed button", () => {
    // The whole stack is `…feed → /i/x → /g/x`, so two entries get skipped in one go and the feed
    // is reached without a single fresh draw.
    it("goes back two entries when both markers line up", () => {
      markFeedOrigin("item-1");
      markGalleryOrigin("item-1");

      leave("item-1", "toFeed");

      expect(goMock).toHaveBeenCalledWith(-2);
      expect(pushMock).not.toHaveBeenCalled();
    });

    // Deep-linked straight into the gallery: neither entry is on the stack.
    it("builds a focused feed when neither marker is set", () => {
      leave("item-1", "toFeed");

      expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
      expect(goMock).not.toHaveBeenCalled();
    });

    // Opened the item page from a shared link, then tapped the hero: `/i/x → /g/x` is on the stack
    // but there is no feed under it. `go(-2)` here would land outside Ambit.
    it("builds a focused feed when only the gallery marker is set", () => {
      markGalleryOrigin("item-1");

      leave("item-1", "toFeed");

      expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
      expect(goMock).not.toHaveBeenCalled();
    });

    // Came from the feed to the item page, then reloaded or deep-linked the gallery: the feed is on
    // the stack but the item page is not immediately behind this one.
    it("builds a focused feed when only the feed marker is set", () => {
      markFeedOrigin("item-1");

      leave("item-1", "toFeed");

      expect(pushMock).toHaveBeenCalledWith("/feed?focus=item-1");
      expect(goMock).not.toHaveBeenCalled();
    });
  });
});
