// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markFeedOrigin } from "~/components/feed/feed-origin";
import { BackToFeed } from "./back-to-feed";

const { backMock } = vi.hoisted(() => ({ backMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock }),
}));

// `next/link` renders a plain anchor here; the assertions are about whether the click is allowed to
// reach it, not about Link's own behaviour.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("BackToFeed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    backMock.mockClear();
  });
  afterEach(() => sessionStorage.clear());

  // The whole point of the component. A pushed `/feed?focus=` costs two fresh pages of corpus and
  // lands the reader among cards they've never seen; popping returns the feed they left.
  it("pops history when the feed sent the reader to this item", () => {
    markFeedOrigin("item-1");
    render(<BackToFeed itemId="item-1" />);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: /back/i }), event);

    expect(backMock).toHaveBeenCalledTimes(1);
    // Preventing the default is what stops the anchor from *also* pushing a new feed.
    expect(event.defaultPrevented).toBe(true);
  });

  // `/i/[itemId]` is the app's one public page, so it is routinely opened cold from a shared link.
  // There is no feed behind it and "back" would leave Ambit entirely — the href has to win.
  it("lets the link navigate when the item was opened cold", () => {
    render(<BackToFeed itemId="item-1" />);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: /back/i }), event);

    expect(backMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // A marker left over from a *different* item is not evidence about this one.
  it("does not pop when the marker names another item", () => {
    markFeedOrigin("item-other");
    render(<BackToFeed itemId="item-1" />);

    fireEvent.click(screen.getByRole("link", { name: /back/i }));

    expect(backMock).not.toHaveBeenCalled();
  });

  // Rendered markup must not depend on sessionStorage: the decision happens at click time, so the
  // server and client agree on the DOM. (A component that swapped elements after reading storage
  // would be a hydration mismatch — the exact failure this whole change is cleaning up after.)
  it("renders the same href whether or not the marker is set", () => {
    const { unmount } = render(<BackToFeed itemId="item-1" />);
    const cold = screen
      .getByRole("link", { name: /back/i })
      .getAttribute("href");
    unmount();

    markFeedOrigin("item-1");
    render(<BackToFeed itemId="item-1" />);
    expect(
      screen.getByRole("link", { name: /back/i }).getAttribute("href"),
    ).toBe(cold);
    expect(cold).toBe("/feed?focus=item-1");
  });
});
