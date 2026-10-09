// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { markArrival, takeArrival } from "./item-arrival";

beforeEach(() => sessionStorage.clear());

describe("item arrival note", () => {
  it("hands back the origin written for that item, once", () => {
    markArrival("a", "explore");
    expect(takeArrival("a")).toBe("explore");
    expect(takeArrival("a")).toBe("link");
  });

  it("leaves another item's note alone and reads this one as a cold link", () => {
    markArrival("a", "feed");
    expect(takeArrival("b")).toBe("link");
    expect(takeArrival("a")).toBe("feed");
  });

  it("refuses an origin outside the closed set", () => {
    sessionStorage.setItem(
      "ambit.itemArrival.v1",
      JSON.stringify({ id: "a", from: "https://evil.example" }),
    );
    expect(takeArrival("a")).toBe("link");
  });
});
