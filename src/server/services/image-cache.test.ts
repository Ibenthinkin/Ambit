// Unit tests for the image cache (Phase 7.3, T3.5). **No test here touches the network**: every
// case injects `fetchImpl`, and the "upstream" bytes are real images `sharp` makes on the spot, so
// the resize/encode path is genuinely exercised rather than mocked around.
//
// Each test gets its own `mkdtemp` directory, which is what makes them safe to run in parallel and
// what keeps the developer's real `.cache/img` out of it.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachePathFor,
  fillCache,
  getOrFill,
  ImageFillError,
  MAX_EDGE,
  MAX_UPSTREAM_BYTES,
  readCached,
} from "./image-cache";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ambit-img-cache-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A real PNG, deliberately bigger than MAX_EDGE on both axes so the resize has work to do. */
async function png(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 90, b: 140 },
    },
  })
    .png()
    .toBuffer();
}

/** A `fetch` that answers with these bytes, and counts how many times it was asked. */
function fetchReturning(bytes: Buffer, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    Promise.resolve(
      new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { "content-type": "image/png", ...headers },
      }),
    ),
  ) as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

const item = { id: "item-abc", imageUrl: "https://museum.test/plate.png" };

describe("fillCache", () => {
  it("writes exactly one .webp and leaves no temp file behind", async () => {
    const fetchImpl = fetchReturning(await png());

    const result = await fillCache(item, { dir, fetchImpl });

    expect(result.contentType).toBe("image/webp");
    const files = await readdir(dir);
    expect(files).toEqual(["item-abc.webp"]);
    // The atomic write is temp-then-rename; a leftover `.tmp` would mean the rename didn't happen.
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("produces real WebP, resized to MAX_EDGE with the aspect ratio kept", async () => {
    const fetchImpl = fetchReturning(await png(3000, 2000));

    const { bytes } = await fillCache(item, { dir, fetchImpl });

    // The RIFF container's magic: "RIFF" ... "WEBP".
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");

    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(MAX_EDGE);
    // Rounded to a whole pixel by libvips — the assertion is that the 3:2 ratio survived, not
    // that it landed on a fraction of a pixel.
    expect(meta.height).toBe(Math.round(MAX_EDGE * (2000 / 3000)));
  });

  it("never enlarges an image that is already smaller than MAX_EDGE", async () => {
    const fetchImpl = fetchReturning(await png(400, 300));

    const { bytes } = await fillCache(item, { dir, fetchImpl });

    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  // Decision D4, three ways. In every one of them the invariant is the same: nothing is written,
  // so the next request tries again rather than serving a failure for a year.
  it("rejects an upstream error without caching anything", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response("nope", { status: 404 })),
    ) as unknown as typeof fetch;

    await expect(fillCache(item, { dir, fetchImpl })).rejects.toMatchObject({
      kind: "upstream",
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("rejects bytes sharp cannot decode without caching anything", async () => {
    const fetchImpl = fetchReturning(
      Buffer.from("this is not an image at all"),
    );

    await expect(fillCache(item, { dir, fetchImpl })).rejects.toMatchObject({
      kind: "decode",
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("refuses an over-large image on the declared content-length, before reading the body", async () => {
    const body = await png(64, 64);
    const fetchImpl = fetchReturning(body, {
      "content-length": String(MAX_UPSTREAM_BYTES + 1),
    });

    await expect(fillCache(item, { dir, fetchImpl })).rejects.toMatchObject({
      kind: "too-large",
    });
    expect(await readdir(dir)).toEqual([]);
  });

  // **The no-referer contract, which is the whole reason the proxy exists.** This assertion used
  // to live in `route.test.ts`, back when the route did its own `fetch`; it moved here with the
  // fetch itself (Phase 7.3) rather than being dropped. AIC's Cloudflare rules 403 anything
  // carrying a `localhost` referer (HANDOFF_aic-images.md §2.2); a server-side fetch that sends no
  // referer at all sidesteps them.
  it("fetches the stored URL with Ambit's UA and no referer", async () => {
    const fetchImpl = fetchReturning(await png(64, 64));
    const url = "https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg";

    await fillCache({ id: "aic-item", imageUrl: url }, { dir, fetchImpl });

    const [calledUrl, init] = vi.mocked(fetchImpl).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe(url);
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Ambit/");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain(
      "referer",
    );
  });

  // **The bug the first real `img:warm` run found.** `AbortSignal.timeout` covers the whole
  // exchange, so a host that answers its headers promptly and then stalls on the body rejects
  // *after* the fetch call has already returned. Unwrapped, that rejection escaped `fillCache`
  // entirely — as a `DOMException`, which under Bun is not an `instanceof Error` — and took the
  // warm script down with it. In the route it would have been a 500 instead of a 502.
  it("turns a body-read failure into an ImageFillError rather than letting it escape", async () => {
    const stalled = new Response(
      new ReadableStream({
        start(controller) {
          const timeout = new DOMException(
            "The operation timed out.",
            "TimeoutError",
          );
          controller.error(timeout);
        },
      }),
      { status: 200 },
    );
    const fetchImpl = vi.fn(async () => stalled) as unknown as typeof fetch;

    await expect(fillCache(item, { dir, fetchImpl })).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(await readdir(dir)).toEqual([]);
  });

  it("throws an ImageFillError, so the route can tell it from a programming mistake", async () => {
    const fetchImpl = fetchReturning(Buffer.from("garbage"));
    await expect(fillCache(item, { dir, fetchImpl })).rejects.toBeInstanceOf(
      ImageFillError,
    );
  });
});

describe("getOrFill", () => {
  it("fills on the first call and reads from disk on the second", async () => {
    const fetchImpl = fetchReturning(await png());

    const first = await getOrFill(item, { dir, fetchImpl });
    const second = await getOrFill(item, { dir, fetchImpl });

    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    // The whole point: the museum was asked exactly once.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.bytes.equals(first.bytes)).toBe(true);
  });

  // Decision D5. A feed page asks for ~24 images at once and the gallery re-requests the hero;
  // without the in-flight map, the first load of a page would fetch each image several times.
  it("shares one upstream fetch between concurrent misses", async () => {
    const bytes = await png();
    const fetchImpl = vi.fn(async () => {
      // A tick of latency, so the second caller genuinely arrives while the first is in flight.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(new Uint8Array(bytes), { status: 200 });
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      getOrFill(
        { id: "shared-item", imageUrl: item.imageUrl },
        { dir, fetchImpl },
      ),
      getOrFill(
        { id: "shared-item", imageUrl: item.imageUrl },
        { dir, fetchImpl },
      ),
      getOrFill(
        { id: "shared-item", imageUrl: item.imageUrl },
        { dir, fetchImpl },
      ),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(b.bytes.equals(c.bytes)).toBe(true);
  });

  // A failed fill must not be remembered — in memory either. The in-flight entry is cleared on
  // rejection as well as on success, so a museum having a bad minute doesn't poison the item.
  it("retries after a failure rather than remembering it", async () => {
    const good = await png(100, 100);
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      return call === 1
        ? new Response("nope", { status: 503 })
        : new Response(new Uint8Array(good), { status: 200 });
    }) as unknown as typeof fetch;

    const target = { id: "retry-item", imageUrl: item.imageUrl };
    await expect(getOrFill(target, { dir, fetchImpl })).rejects.toBeInstanceOf(
      ImageFillError,
    );
    const second = await getOrFill(target, { dir, fetchImpl });

    expect(second.hit).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("cachePathFor / readCached", () => {
  it("names the file after the item id", () => {
    expect(cachePathFor("abc123", dir)).toBe(join(dir, "abc123.webp"));
  });

  it("reads a miss as null rather than throwing", async () => {
    expect(await readCached("never-filled", dir)).toBeNull();
  });
});
