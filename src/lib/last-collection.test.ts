// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  LAST_COLLECTION_KEY,
  pickLastCollection,
  readLastCollectionId,
  useLastCollection,
  writeLastCollectionId,
} from "./last-collection";

const COLLECTIONS = [
  { id: "c1", name: "Articles" },
  { id: "c2", name: "Art" },
];

beforeEach(() => localStorage.clear());

describe("pickLastCollection", () => {
  it("returns the remembered collection when it still exists", () => {
    expect(pickLastCollection(COLLECTIONS, "c2")).toEqual(COLLECTIONS[1]);
  });
  it("falls back to the first collection when nothing is remembered, or the remembered one is gone", () => {
    expect(pickLastCollection(COLLECTIONS, null)).toEqual(COLLECTIONS[0]);
    expect(pickLastCollection(COLLECTIONS, "deleted")).toEqual(COLLECTIONS[0]);
  });
  it("returns null with no collections to choose from", () => {
    expect(pickLastCollection([], "c1")).toBeNull();
    expect(pickLastCollection(undefined, "c1")).toBeNull();
  });
});

describe("the store", () => {
  it("round-trips through localStorage under the documented key", () => {
    expect(readLastCollectionId()).toBeNull();
    writeLastCollectionId("c2");
    expect(localStorage.getItem(LAST_COLLECTION_KEY)).toBe("c2");
    expect(readLastCollectionId()).toBe("c2");
  });

  // Every tile on the feed reads this; a save from one of them has to move all of them.
  it("a write re-renders every subscribed hook", () => {
    const { result } = renderHook(() => useLastCollection(COLLECTIONS));
    expect(result.current?.id).toBe("c1");
    act(() => writeLastCollectionId("c2"));
    expect(result.current?.id).toBe("c2");
  });
});
