// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REEL_SIZES, usePictures } from "./use-pictures";

// jsdom never loads images, so `Image` is replaced by a recorder whose decode a test settles by hand.
interface Fake {
  src: string;
  srcset: string;
  sizes: string;
  resolve: () => void;
  reject: () => void;
}
let instances: Fake[] = [];

beforeEach(() => {
  instances = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      srcset = "";
      sizes = "";
      decode: () => Promise<void>;
      constructor() {
        const fake: Fake = {
          src: "",
          srcset: "",
          sizes: "",
          resolve: () => undefined,
          reject: () => undefined,
        };
        const p = new Promise<void>((res, rej) => {
          fake.resolve = res;
          fake.reject = () => rej(new Error("decode"));
        });
        this.decode = () => p;
        instances.push(fake);
        for (const k of ["src", "srcset", "sizes"] as const) {
          Object.defineProperty(this, k, {
            set: (v: string) => {
              fake[k] = v;
            },
            get: () => fake[k],
          });
        }
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const pics = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    src: `/api/img/p${i}?w=960`,
    srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w`,
  }));

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("usePictures", () => {
  it("requests the current picture and `ahead` more, with srcset and sizes matching the <img>", () => {
    renderHook(() => usePictures(pics(6), 0, 1));
    expect(instances.map((i) => i.src)).toEqual([
      "/api/img/p0?w=960",
      "/api/img/p1?w=960",
    ]);
    expect(instances[0]!.srcset).toContain("1600w");
    expect(instances[0]!.sizes).toBe(REEL_SIZES);
    expect(REEL_SIZES).toBe("(min-width: 768px) 100vw, 50vw");
  });

  it("marks a picture ready when it decodes, and bumps version", async () => {
    const { result } = renderHook(() => usePictures(pics(3), 0, 0));
    expect(result.current.ready.has("p0")).toBe(false);
    instances[0]!.resolve();
    await settle();
    expect(result.current.ready.has("p0")).toBe(true);
    expect(result.current.version).toBe(1);
  });

  it("a failed decode is never ready (Review Focus 1)", async () => {
    const { result } = renderHook(() => usePictures(pics(2), 0, 1));
    instances[1]!.reject();
    await settle();
    expect(result.current.ready.has("p1")).toBe(false);
  });

  it("a failure is recorded, bumps version, and does not use up the ahead budget — the next one is requested", async () => {
    const { result } = renderHook(() => usePictures(pics(5), 0, 1));
    expect(instances.map((i) => i.src)).toEqual([
      "/api/img/p0?w=960",
      "/api/img/p1?w=960",
    ]);
    instances[1]!.reject();
    await settle();
    expect(result.current.failed.has("p1")).toBe(true);
    expect(result.current.version).toBe(1);
    expect(instances.map((i) => i.src)).toContain("/api/img/p2?w=960");
  });

  it("Infinity ahead requests the whole reel once", () => {
    renderHook(() => usePictures(pics(12), 0, Infinity));
    expect(instances).toHaveLength(12);
  });

  it("advancing the index requests the next one ahead, and never re-requests", () => {
    const { rerender } = renderHook(({ i }) => usePictures(pics(5), i, 1), {
      initialProps: { i: 0 },
    });
    rerender({ i: 1 });
    expect(instances.map((x) => x.src)).toEqual([
      "/api/img/p0?w=960",
      "/api/img/p1?w=960",
      "/api/img/p2?w=960",
    ]);
  });

  it("wraps: ahead of the last picture is the first", () => {
    const { rerender } = renderHook(({ i }) => usePictures(pics(3), i, 1), {
      initialProps: { i: 0 },
    });
    rerender({ i: 2 });
    expect(instances.map((x) => x.src)).toContain("/api/img/p0?w=960");
    expect(instances).toHaveLength(3);
  });

  it("a data: picture gets no srcset or sizes", () => {
    renderHook(() =>
      usePictures(
        [{ id: "d", src: "data:image/png;base64,AA", srcSet: null }],
        0,
        0,
      ),
    );
    expect(instances[0]!.srcset).toBe("");
    expect(instances[0]!.sizes).toBe("");
  });
});
