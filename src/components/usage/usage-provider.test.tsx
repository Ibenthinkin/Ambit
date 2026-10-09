// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  path: "/feed",
  search: "",
  bodies: [] as {
    events: { kind: string; screen?: string; meta?: Record<string, unknown> }[];
  }[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => h.path,
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("~/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/usage")>();
  return { ...actual, browserSend: (b: never) => h.bodies.push(b) };
});

import { UsageProvider, useUsage } from "./usage-provider";

const events = () => h.bodies.flatMap((b) => b.events);

describe("UsageProvider", () => {
  beforeEach(() => {
    h.bodies.length = 0;
    h.path = "/feed";
    h.search = "";
    window.sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_780_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts the visit, records screen.open, and flushes on unmount", () => {
    const { unmount } = render(<UsageProvider />);
    useUsage().track("item.zoom");
    unmount();
    expect(events().map((e) => e.kind)).toEqual([
      "visit.start",
      "screen.open",
      "item.zoom",
    ]);
    expect(events()[1]!.screen).toBe("feed");
  });

  it("labels a desktop-width visit desktop", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q === "(min-width: 768px)",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { unmount } = render(<UsageProvider />);
    unmount();
    expect(events()[0]).toMatchObject({
      kind: "visit.start",
      meta: { device: "desktop", standalone: false },
    });
  });

  it("reports a multi-second visit on unmount, and nothing for a sub-second one", () => {
    const a = render(<UsageProvider />);
    vi.advanceTimersByTime(4_000);
    a.unmount();
    expect(events().find((e) => e.kind === "visit.end")?.meta).toEqual({
      seconds: 4,
    });

    h.bodies.length = 0;
    const b = render(<UsageProvider />);
    vi.advanceTimersByTime(200);
    b.unmount();
    expect(events().some((e) => e.kind === "visit.end")).toBe(false);
  });

  it("records the collection screen when only the query string changes, once", () => {
    h.path = "/saved";
    const { rerender, unmount } = render(<UsageProvider />);
    h.search = "collection=c1";
    rerender(<UsageProvider />);
    h.search = "collection=c2"; // same screen: no repeat
    rerender(<UsageProvider />);
    h.search = "";
    act(() => rerender(<UsageProvider />));
    unmount();
    expect(
      events()
        .filter((e) => e.kind === "screen.open")
        .map((e) => e.screen),
    ).toEqual(["saved", "collection", "saved"]);
  });

  it("useUsage().track is a no-op with no provider", () => {
    h.bodies.length = 0;
    expect(() => useUsage().track("item.zoom")).not.toThrow();
    expect(h.bodies).toEqual([]);
  });
});
