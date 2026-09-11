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
    }),
    saves: {
      collections: {
        useQuery: () => ({
          data: [
            {
              id: "c1",
              name: "Articles",
              createdAt: new Date(),
              itemCount: 2,
              cover: null,
            },
            {
              id: "c2",
              name: "Art",
              createdAt: new Date(),
              itemCount: 0,
              cover: null,
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
