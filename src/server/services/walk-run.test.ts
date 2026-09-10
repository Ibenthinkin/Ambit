// The corpus-walk loop's bounds (09-06-26, docs/PLAN_caption-less-and-wild.md T1b). What matters
// here is not that the loop walks — probe:walk and the adapters' own fixtures cover that — but
// that a BOUNDED walk is honest about being bounded: it stops where it said it would, it says
// where to carry on from, and it never claims completeness, because --prune reads that claim and
// deletes rows on the strength of it.
import { describe, expect, it } from "vitest";

import { runWalk } from "./walk-run";
import type { CorpusWalkAdapter, NormalizedItem } from "./sources/types";

/** A fake archive of `total` items, `perPage` at a time, cursors being plain offsets. */
function fakeWalker(total: number, perPage = 10): CorpusWalkAdapter<string> {
  return {
    source: "pdr",
    walk: (cursor) => {
      const start = Number(cursor ?? 0);
      const raw = Array.from(
        { length: Math.min(perPage, Math.max(0, total - start)) },
        (_, i) => String(start + i),
      );
      const next = start + raw.length;
      return Promise.resolve({
        raw,
        next: raw.length > 0 && next < total ? String(next) : undefined,
      });
    },
    toItem: (raw: string) =>
      ({ source: "pdr", sourceId: raw, type: "image" }) as NormalizedItem,
  };
}

describe("runWalk — an unbounded walk", () => {
  it("walks the archive to its end and reports complete", async () => {
    const stats = await runWalk(fakeWalker(35));
    expect(stats.offered).toBe(35);
    expect(stats.walked).toBe(4);
    expect(stats.complete).toBe(true);
    expect(stats.resumeCursor).toBeUndefined();
  });
});

describe("runWalk — a quota'd walk", () => {
  it("stops at the quota and names the cursor to resume from", async () => {
    const stats = await runWalk(fakeWalker(100), { quotaItems: 25 });
    expect(stats.offered).toBe(25);
    // Stopped inside page 3 (items 20-29), so the next page to fetch starts at 30.
    expect(stats.resumeCursor).toBe("30");
  });

  it("is never complete, so --prune can never act on it", async () => {
    // Even when the quota happens to cover the whole archive.
    const stats = await runWalk(fakeWalker(20), { quotaItems: 500 });
    expect(stats.offered).toBe(20);
    expect(stats.complete).toBe(false);
  });
});

describe("runWalk — a resumed walk", () => {
  it("starts at the given cursor and skips everything before it", async () => {
    const stats = await runWalk(fakeWalker(50), { startCursor: "30" });
    expect(stats.offered).toBe(20);
    expect(stats.items[0]!.sourceId).toBe("30");
  });

  it("is never complete either — it did not see the archive's newest end", async () => {
    const stats = await runWalk(fakeWalker(50), { startCursor: "30" });
    expect(stats.complete).toBe(false);
    // It DID reach the far end, so there is nothing left to resume from.
    expect(stats.resumeCursor).toBeUndefined();
  });

  it("carries a budgeted walk on from exactly where it stopped, with no gap or overlap", async () => {
    const first = await runWalk(fakeWalker(100), { quotaItems: 25 });
    const second = await runWalk(fakeWalker(100), {
      startCursor: first.resumeCursor,
      quotaItems: 25,
    });
    const ids = [...first.seenSourceIds, ...second.seenSourceIds];
    expect(new Set(ids).size).toBe(ids.length);
    // The gap is the tail of the page the first run stopped inside — offsets 25-29. That is the
    // cost of a cursor the adapter defines in pages, and it is why a resumed walk is not complete.
    expect(second.seenSourceIds[0]).toBe("30");
  });
});

describe("runWalk — failures", () => {
  it("counts a toItem throw, keeps walking, and stays complete", async () => {
    const walker = fakeWalker(20);
    const stats = await runWalk({
      ...walker,
      toItem: (raw: string) => {
        if (raw === "5") throw new Error("no picture");
        return walker.toItem(raw);
      },
    });
    expect(stats.errors).toBe(1);
    expect(stats.offered).toBe(19);
    // A rejected post is not a failed page: doorofperception has one permanently.
    expect(stats.complete).toBe(true);
  });

  it("stops on a page that keeps failing, counts it once, and refuses completeness", async () => {
    const walker = fakeWalker(50);
    const stats = await runWalk(
      {
        ...walker,
        walk: (cursor) =>
          cursor === "20"
            ? Promise.reject(new Error("502"))
            : walker.walk(cursor),
      },
      { sleep: () => Promise.resolve() },
    );
    expect(stats.pageErrors).toBe(1);
    expect(stats.offered).toBe(20);
    expect(stats.complete).toBe(false);
  });

  // 09-10-26: the 09-09 nightly's four Tumblr walks all stopped at a fraction of their budgets
  // (0 / 11 / 1,924 / 2,075 rows against 27,500 / 19,000 / 32,000 / 21,700). One bad answer from
  // Tumblr ended a whole night's walk, because a failed page was final. It is not: the cursor
  // is an offset, so the same page can simply be asked for again after a pause.
  it("retries a page that fails once, and the walk is still complete", async () => {
    const walker = fakeWalker(50);
    let failuresLeft = 1;
    const slept: number[] = [];
    const stats = await runWalk(
      {
        ...walker,
        walk: (cursor) => {
          if (cursor === "20" && failuresLeft-- > 0)
            return Promise.reject(new Error("502"));
          return walker.walk(cursor);
        },
      },
      {
        sleep: (ms) => {
          slept.push(ms);
          return Promise.resolve();
        },
      },
    );
    expect(stats.offered).toBe(50);
    expect(stats.pageErrors).toBe(0);
    expect(stats.retries).toBe(1);
    expect(stats.complete).toBe(true);
    expect(slept).toEqual([5_000]);
  });

  it("gives up after three retries, each waiting twice as long as the last", async () => {
    const walker = fakeWalker(50);
    let attempts = 0;
    const slept: number[] = [];
    const stats = await runWalk(
      {
        ...walker,
        walk: (cursor) => {
          if (cursor === "20") {
            attempts++;
            return Promise.reject(new Error("502"));
          }
          return walker.walk(cursor);
        },
      },
      {
        sleep: (ms) => {
          slept.push(ms);
          return Promise.resolve();
        },
      },
    );
    expect(attempts).toBe(4);
    expect(slept).toEqual([5_000, 10_000, 20_000]);
    expect(stats.retries).toBe(3);
    expect(stats.pageErrors).toBe(1);
    expect(stats.complete).toBe(false);
  });
});
