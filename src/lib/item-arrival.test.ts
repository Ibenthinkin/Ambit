// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markArrival, resetArrivalForTests, takeArrival } from "./item-arrival";

function navType(type: string | null, path = "/i/a") {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    type === null
      ? []
      : ([
          { type, name: `https://ambit.test${path}` },
        ] as unknown as PerformanceEntryList),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  resetArrivalForTests();
  navType(null);
});
afterEach(() => vi.restoreAllMocks());

describe("item arrival note", () => {
  it("hands back the origin written for that item, once", () => {
    markArrival("a", "explore");
    expect(takeArrival("a")).toBe("explore");
    expect(takeArrival("a")).toBeNull();
  });

  it("leaves another item's note alone and reads this one as a cold link", () => {
    markArrival("a", "feed");
    expect(takeArrival("b")).toBeNull();
    expect(takeArrival("a")).toBe("feed");
  });

  it("refuses an origin outside the closed set", () => {
    sessionStorage.setItem(
      "ambit.itemArrival.v1",
      JSON.stringify({ id: "a", from: "https://evil.example" }),
    );
    expect(takeArrival("a")).toBeNull();
  });

  it("first route of a navigated document is a link", () => {
    navType("navigate");
    expect(takeArrival("a")).toBe("link");
  });

  it("first route of a reload records nothing", () => {
    navType("reload");
    expect(takeArrival("a")).toBeNull();
  });

  it("a later no-note arrival (Back) records nothing, even in a navigated document", () => {
    navType("navigate");
    takeArrival("a");
    expect(takeArrival("a")).toBeNull();
  });

  it("a document that is not this item's is not a cold link", () => {
    navType("navigate", "/feed");
    expect(takeArrival("a")).toBeNull();
  });
});
