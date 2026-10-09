// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  path: "/feed",
  bodies: [] as { events: { kind: string; screen?: string }[] }[],
}));

vi.mock("next/navigation", () => ({ usePathname: () => h.path }));
vi.mock("~/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/usage")>();
  return { ...actual, browserSend: (b: never) => h.bodies.push(b) };
});

import { UsageProvider, useUsage } from "./usage-provider";

describe("UsageProvider", () => {
  beforeEach(() => {
    h.bodies.length = 0;
    window.sessionStorage.clear();
  });

  it("starts the visit, records screen.open, and flushes on unmount", () => {
    const { unmount } = render(<UsageProvider />);
    useUsage().track("item.zoom");
    unmount();
    const events = h.bodies.flatMap((b) => b.events);
    // Unmount also ends the visit (a visit.end if any ms elapsed), so don't pin it.
    expect(events.map((e) => e.kind).filter((k) => k !== "visit.end")).toEqual([
      "visit.start",
      "screen.open",
      "item.zoom",
    ]);
    expect(events[1]!.screen).toBe("feed");
  });

  it("useUsage().track is a no-op with no provider", () => {
    expect(() => useUsage().track("item.zoom")).not.toThrow();
    expect(h.bodies).toEqual([]);
  });
});
