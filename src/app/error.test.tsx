// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ErrorPage from "./error";

const { trackMock, pathnameMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  pathnameMock: vi.fn(() => "/feed"),
}));
vi.mock("~/components/usage/usage-provider", () => ({
  useUsage: () => ({ track: trackMock }),
}));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

beforeEach(() => {
  trackMock.mockClear();
  pathnameMock.mockReturnValue("/feed");
});

describe("app/error.tsx", () => {
  it("says so plainly, with a way back to the feed and a way to retry", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to the feed" }),
    ).toBeInTheDocument();
  });

  it("Try again calls reset", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("records client.error with the digest and the screen, once — never the message", () => {
    const error = Object.assign(new Error("secret detail"), {
      digest: "abc123",
    });
    const { rerender } = render(<ErrorPage error={error} reset={vi.fn()} />);
    rerender(<ErrorPage error={error} reset={vi.fn()} />);
    expect(trackMock).toHaveBeenCalledExactlyOnceWith("client.error", {
      screen: "feed",
      meta: { digest: "abc123" },
    });
  });

  it("says no-digest for a browser-side error, and truncates a long digest to 32", () => {
    render(<ErrorPage error={new Error("x")} reset={vi.fn()} />);
    expect(trackMock).toHaveBeenLastCalledWith("client.error", {
      screen: "feed",
      meta: { digest: "no-digest" },
    });
    trackMock.mockClear();
    pathnameMock.mockReturnValue("/nowhere");
    render(
      <ErrorPage
        error={Object.assign(new Error("y"), { digest: "d".repeat(50) })}
        reset={vi.fn()}
      />,
    );
    expect(trackMock).toHaveBeenLastCalledWith("client.error", {
      screen: undefined,
      meta: { digest: "d".repeat(32) },
    });
  });
});
