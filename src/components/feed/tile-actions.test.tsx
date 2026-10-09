// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeLastCollectionId } from "~/lib/last-collection";
import type { Item } from "~/server/db/items";
import type { FeedCard } from "~/server/services/feed";
import { TileActions } from "./tile-actions";

const {
  mutateMock,
  mutationOpts,
  idsData,
  setDataMock,
  getDataMock,
  invalidateMock,
  fb,
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  mutationOpts: {
    current: undefined as
      | undefined
      | {
          onMutate: (vars: {
            itemId: string;
          }) => Promise<{ previous?: string[] }>;
          onError: (
            err: unknown,
            vars: unknown,
            ctx?: { previous?: string[] },
          ) => void;
          onSuccess: (
            result: { collectionName: string; drift: null },
            vars: { collectionId: string },
          ) => void;
        },
  },
  idsData: { current: [] as string[] },
  setDataMock: vi.fn(),
  getDataMock: vi.fn(() => ["z"]),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  // More or less: `feedback.mine`'s cache, the two writes, and the options each was built with.
  fb: {
    mine: { current: { more: [] as string[], less: [] as string[] } },
    setMutate: vi.fn(),
    clearMutate: vi.fn(),
    setData: vi.fn(),
    getData: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- vi.hoisted widens
    setOpts: { current: null } as { current: unknown },
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        ids: {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: getDataMock,
          setData: setDataMock,
          invalidate: invalidateMock,
        },
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
        count: { invalidate: invalidateMock },
      },
      feedback: {
        mine: {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: fb.getData,
          setData: fb.setData,
          invalidate: invalidateMock,
        },
        list: { invalidate: invalidateMock },
      },
      topics: {
        cools: { invalidate: invalidateMock },
        mine: { invalidate: invalidateMock },
      },
    }),
    feedback: {
      mine: { useQuery: () => ({ data: fb.mine.current }) },
      set: {
        useMutation: (o: unknown) => {
          fb.setOpts.current = o;
          return { mutate: fb.setMutate };
        },
      },
      clear: { useMutation: () => ({ mutate: fb.clearMutate }) },
    },
    saves: {
      collections: {
        useQuery: () => ({
          data: [
            {
              id: "c1",
              name: "Articles",
              createdAt: new Date(),
              itemCount: 2,
              covers: [],
            },
            {
              id: "c2",
              name: "Art",
              createdAt: new Date(),
              itemCount: 0,
              covers: [],
            },
          ],
          isLoading: false,
        }),
      },
      ids: { useQuery: () => ({ data: idsData.current }) },
      forItem: { useQuery: () => ({ data: undefined }) },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      saveToCollection: {
        useMutation: (opts: NonNullable<typeof mutationOpts.current>) => {
          // The strip's own options, not the picker's: `TileActions` mounts a
          // `SaveToCollectionSheet`, which calls this hook too (after the strip, in render order).
          // Only the strip's carries `onMutate` — the optimistic patch under test.
          if ("onMutate" in opts) mutationOpts.current = opts;
          return { mutate: mutateMock, isPending: false };
        },
      },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const card = (id: string): FeedCard => ({
  item: {
    id,
    source: "met",
    sourceId: `src-${id}`,
    type: "image",
    title: "A title",
    summary: null,
    body: null,
    imageUrl: "https://example.test/i.jpg",
    imageWidth: null,
    imageHeight: null,
    kind: null,
    readingMinutes: null,
    sourceUrl: "https://example.test/o",
    attribution: null,
    license: null,
    tags: [],
    topicId: "botany",
    curationScore: 8,
    aestheticTags: [],
    fetchedAt: new Date("2026-08-17T00:00:00Z"),
  } satisfies Item,
  tier: "DRIFT",
  topicId: "surreal", // the slot — not the display topic
});

const renderStrip = (id = "a") => {
  const onToast = vi.fn();
  render(
    <div className="group/tile relative">
      <TileActions card={card(id)} onToast={onToast} />
    </div>,
  );
  return { onToast };
};

beforeEach(() => {
  localStorage.clear();
  mutateMock.mockClear();
  setDataMock.mockClear();
  idsData.current = [];
  fb.mine.current = { more: [], less: [] };
  fb.setMutate.mockClear();
  fb.clearMutate.mockClear();
  fb.setData.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("TileActions — docs/DESIGN_chrome-redesign.md §3", () => {
  it("names the last-used collection, falling back to the first", () => {
    renderStrip();
    expect(
      screen.getByRole("button", { name: "Choose collection" }),
    ).toHaveTextContent("Articles");
    expect(
      screen.getByRole("button", { name: "Save to Articles" }),
    ).toBeInTheDocument();
    act(() => writeLastCollectionId("c2"));
    expect(
      screen.getByRole("button", { name: "Save to Art" }),
    ).toBeInTheDocument();
  });

  it("one click saves to the target, naming the slot topic for the bump", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Save to Articles" }));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "a",
      collectionId: "c1",
      topicId: "surreal",
    });
  });

  it("is optimistic: the id joins saves.ids at once, and comes back out on error", async () => {
    const { onToast } = renderStrip();
    await act(() => mutationOpts.current!.onMutate({ itemId: "a" }));
    expect(setDataMock).toHaveBeenCalledWith(undefined, ["z", "a"]);
    act(() =>
      mutationOpts.current!.onError(new Error("x"), {}, { previous: ["z"] }),
    );
    expect(setDataMock).toHaveBeenLastCalledWith(undefined, ["z"]);
    expect(onToast).toHaveBeenCalledWith("Couldn't save that. Try again.");
  });

  it("a success toasts through saveToastText and remembers the collection", () => {
    const { onToast } = renderStrip();
    act(() =>
      mutationOpts.current!.onSuccess(
        { collectionName: "Art", drift: null },
        { collectionId: "c2" },
      ),
    );
    expect(onToast).toHaveBeenCalledWith("Saved to Art");
    expect(localStorage.getItem("ambit.lastCollection")).toBe("c2");
  });

  it("a saved item shows a lit glyph, and clicking it opens the picker instead of re-saving", () => {
    idsData.current = ["a"];
    renderStrip();
    const glyph = screen.getByRole("button", { name: "Saved to Articles" });
    expect(glyph.querySelector("svg")).toHaveClass("text-accent");
    fireEvent.click(glyph);
    expect(mutateMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Save to collection" }),
    ).toBeInTheDocument();
  });

  it("the chevron opens the picker", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Choose collection" }));
    expect(
      screen.getByRole("heading", { name: "Save to collection" }),
    ).toBeInTheDocument();
  });
});

describe("TileActions — More or less (docs/DESIGN_more-or-less.md D6, hover strip)", () => {
  type Mine = { more: string[]; less: string[] };
  type SetOpts = {
    onMutate: (v: {
      itemId: string;
      verdict: "more" | "less";
    }) => Promise<{ previous?: Mine }>;
    onError: (e: unknown, v: unknown, ctx?: { previous?: Mine }) => void;
  };

  it("right-aligns −, +, then the bookmark", () => {
    renderStrip();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Choose collection",
      "Less of this",
      "More of this",
      "Save to Articles",
    ]);
    // The chip yields half the strip to the three squares.
    expect(
      screen.getByRole("button", { name: "Choose collection" }),
    ).toHaveClass("max-w-[50%]");
  });

  it("a square sets the verdict on the card, under its slot topic", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Less of this" }));
    expect(fb.setMutate).toHaveBeenCalledWith({
      itemId: "a",
      verdict: "less",
      topicId: "surreal",
    });
  });

  it("a marked square is inked, keylined and pressed; clicking it clears", () => {
    fb.mine.current = { more: ["a"], less: [] };
    renderStrip();
    const more = screen.getByRole("button", { name: "More of this" });
    expect(more).toHaveAttribute("aria-pressed", "true");
    expect(more).toHaveClass("bg-ink", "text-on-accent", "hover:bg-ink-hi");
    expect(more.className).toContain("shadow-[0_0_0_0.5px");
    // Glass is the rest state only.
    expect(more.className).not.toContain("backdrop-blur");
    const less = screen.getByRole("button", { name: "Less of this" });
    expect(less).toHaveAttribute("aria-pressed", "false");
    expect(less.className).toContain("backdrop-blur");
    expect(less).toHaveClass("hover:bg-bg/48", "active:scale-[0.94]");
    fireEvent.click(more);
    expect(fb.clearMutate).toHaveBeenCalledWith({ itemId: "a" });
    expect(fb.setMutate).not.toHaveBeenCalled();
  });

  it("is optimistic on feedback.mine, and an error restores it", async () => {
    const { onToast } = renderStrip();
    const opts = fb.setOpts.current as SetOpts;
    const before: Mine = { more: ["z"], less: [] };
    fb.getData.mockReturnValue(before);
    await act(() => opts.onMutate({ itemId: "a", verdict: "more" }));
    expect(fb.setData).toHaveBeenCalledWith(undefined, {
      more: ["z", "a"],
      less: [],
    });
    act(() => opts.onError(new Error("x"), {}, { previous: before }));
    expect(fb.setData).toHaveBeenLastCalledWith(undefined, before);
    expect(onToast).toHaveBeenCalledWith("Couldn't save that. Try again.");
  });

  it("the squares swallow a pointer-down, like every strip control", () => {
    const parent = vi.fn();
    render(
      <div className="group/tile relative" onPointerDown={parent}>
        <TileActions card={card("a")} onToast={vi.fn()} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "More of this" }));
    expect(parent).not.toHaveBeenCalled();
  });
});
