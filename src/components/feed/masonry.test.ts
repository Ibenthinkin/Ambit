import { describe, expect, it } from "vitest";

import type { Item } from "~/server/db/items";
import type { FeedCard, FeedPage, Tier } from "~/server/services/feed";
import { buildTiles, IMAGE_ASPECTS, packColumns } from "./masonry";

// Fixtures. The feed contract has a wide `Item` (every column of the table), but the layout only
// reads four of its fields — so build a whole one and let the helpers vary just those.
function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    source: "met",
    sourceId: `src-${overrides.id}`,
    type: "image",
    title: "A title",
    summary: null,
    body: null,
    imageUrl: "https://example.test/i.jpg",
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
    ...overrides,
  };
}

function card(
  id: string,
  opts: {
    type?: "image" | "article";
    tier?: Tier;
    topicId?: string;
    driftPath?: string[];
    title?: string;
    summary?: string | null;
  } = {},
): FeedCard {
  return {
    item: makeItem({
      id,
      type: opts.type ?? "image",
      title: opts.title ?? `Item ${id}`,
      summary: opts.summary ?? null,
      topicId: opts.topicId ?? "botany",
    }),
    tier: opts.tier ?? "CORE",
    topicId: opts.topicId ?? "botany",
    ...(opts.driftPath ? { driftPath: opts.driftPath } : {}),
  };
}

const page = (cards: FeedCard[]): FeedPage => ({ cards, nextCursor: "c" });

const LABELS = {
  botany: "Botany",
  astronomy: "Astronomy",
  music: "Music",
};

describe("buildTiles", () => {
  it("keeps every card, in order, one tile each", () => {
    const tiles = buildTiles(
      [page([card("a"), card("b", { type: "article" }), card("c")])],
      LABELS,
    );
    expect(tiles.map((t) => t.kind)).toEqual(["image", "article", "image"]);
  });

  // The seam infinite scroll exists to hide is the fetch boundary — so the height rotation has to
  // ignore it. A per-page reset would make every 12th tile the same height as the first.
  it("carries the aspect rotation across page boundaries instead of restarting it", () => {
    const pages = [
      page(Array.from({ length: 5 }, (_, i) => card(`p1-${i}`))),
      page(Array.from({ length: 5 }, (_, i) => card(`p2-${i}`))),
    ];
    const classes = buildTiles(pages, LABELS).map((t) =>
      t.kind === "image" ? t.aspectClass : null,
    );

    expect(classes).toEqual(
      Array.from({ length: 10 }, (_, i) => IMAGE_ASPECTS[i % 8]!.className),
    );
    // Specifically: tile 6 (the second page's first image) is NOT back at the top of the cycle.
    expect(classes[5]).toBe(IMAGE_ASPECTS[5].className);
  });

  it("only rotates on images — an article doesn't consume an aspect", () => {
    const tiles = buildTiles(
      [page([card("a"), card("b", { type: "article" }), card("c")])],
      LABELS,
    );
    const images = tiles.filter((t) => t.kind === "image");
    expect(images.map((t) => t.aspectClass)).toEqual([
      IMAGE_ASPECTS[0].className,
      IMAGE_ASPECTS[1].className,
    ]);
  });

  it("puts one Because tile before the page's first qualifying JUMP", () => {
    const tiles = buildTiles(
      [
        page([
          card("a"),
          card("b", {
            tier: "JUMP",
            topicId: "music",
            driftPath: ["botany", "music"],
          }),
          card("c", {
            tier: "JUMP",
            topicId: "astronomy",
            driftPath: ["botany", "astronomy"],
          }),
        ]),
      ],
      LABELS,
    );

    expect(tiles.map((t) => t.kind)).toEqual([
      "image",
      "because",
      "image",
      "image",
    ]);
    const because = tiles[1]!;
    expect(because).toMatchObject({
      kind: "because",
      key: "because-b",
      from: "Botany",
      to: "Music",
    });
  });

  it("collapses a two-hop path to the same single from→to pair", () => {
    const tiles = buildTiles(
      [
        page([
          card("a", {
            tier: "JUMP",
            topicId: "astronomy",
            driftPath: ["botany", "music", "astronomy"],
          }),
        ]),
      ],
      LABELS,
    );
    expect(tiles[0]).toMatchObject({ from: "Botany", to: "Astronomy" });
  });

  it("renders no Because tile when nothing on the page qualifies", () => {
    // A JUMP whose topic has an empty adjacency row gets a one-element path — there's no journey
    // to describe, so there's no tile.
    const tiles = buildTiles(
      [
        page([
          card("a", { tier: "DRIFT", driftPath: ["botany", "music"] }),
          card("b", { tier: "JUMP", driftPath: ["botany"] }),
          card("c", { tier: "CORE" }),
        ]),
      ],
      LABELS,
    );
    expect(tiles.some((t) => t.kind === "because")).toBe(false);
  });

  it("gives each fetched page its own single tile", () => {
    const jump = (id: string) =>
      card(id, {
        tier: "JUMP",
        topicId: "music",
        driftPath: ["botany", "music"],
      });
    const tiles = buildTiles(
      [page([jump("a"), jump("b")]), page([jump("c"), jump("d")])],
      LABELS,
    );
    const becauses = tiles.filter((t) => t.kind === "because");
    expect(becauses.map((t) => t.key)).toEqual(["because-a", "because-c"]);
  });

  it("falls back to the raw topic id when a label is missing", () => {
    const tiles = buildTiles(
      [
        page([
          card("a", {
            tier: "JUMP",
            topicId: "cartography",
            driftPath: ["typography", "cartography"],
          }),
        ]),
      ],
      LABELS,
    );
    expect(tiles[0]).toMatchObject({ from: "typography", to: "cartography" });
  });
});

describe("packColumns", () => {
  it("sends each tile to the shorter column, ties left", () => {
    // Four squares: both columns are level at each step, so they alternate.
    const tiles = buildTiles(
      [page([card("a"), card("b"), card("c"), card("d")])],
      LABELS,
    );
    // Aspects 0..3 are 0.68, 0.78, 1.24, 1.30 — a runs left, b right (left is now taller), then c
    // goes right (still shorter after b) and d left.
    const [left, right] = packColumns(tiles);
    const ids = (col: typeof left) =>
      col.map((t) => (t.kind === "because" ? t.key : t.card.item.id));

    expect(ids(left)).toEqual(["a", "c"]);
    expect(ids(right)).toEqual(["b", "d"]);
  });

  // The reason this is a greedy pack over two flex stacks rather than CSS `columns`: appending a
  // page must never move a tile the user is already looking at.
  it("never reorders already-placed tiles when a page is appended", () => {
    const first = [page(Array.from({ length: 9 }, (_, i) => card(`a${i}`)))];
    const both = [
      ...first,
      page(Array.from({ length: 9 }, (_, i) => card(`b${i}`))),
    ];

    const [l1, r1] = packColumns(buildTiles(first, LABELS));
    const [l2, r2] = packColumns(buildTiles(both, LABELS));

    expect(l2.slice(0, l1.length)).toEqual(l1);
    expect(r2.slice(0, r1.length)).toEqual(r1);
  });

  // The estimate has to agree with what `ArticleCard` actually renders (a five-line clamp), or a
  // long Wikipedia summary reserves most of a screen for a tile five lines tall and the other
  // column runs away.
  it("stops counting lede lines where the card stops drawing them", () => {
    const short = card("short", {
      type: "article",
      title: "T",
      summary: "x".repeat(150), // 5 lines
    });
    const enormous = card("enormous", {
      type: "article",
      title: "T",
      summary: "x".repeat(3000), // 100 lines, if it were counted
    });

    // Same estimated height ⇒ identical packing decisions around them.
    const a = packColumns(buildTiles([page([short, card("i")])], LABELS));
    const b = packColumns(buildTiles([page([enormous, card("i")])], LABELS));
    expect(b.map((col) => col.length)).toEqual(a.map((col) => col.length));
  });

  it("keeps a long article from lopsiding the feed", () => {
    // One very tall article, then several short images: the images should all pile into the other
    // column until it catches up.
    const tiles = buildTiles(
      [
        page([
          card("long", {
            type: "article",
            title: "A".repeat(180),
            summary: "B".repeat(900),
          }),
          card("i1"),
          card("i2"),
        ]),
      ],
      LABELS,
    );
    const [left, right] = packColumns(tiles);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(2);
  });

  it("packs an empty list into two empty columns", () => {
    expect(packColumns([])).toEqual([[], []]);
  });
});
