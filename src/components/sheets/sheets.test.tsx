// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionsSheet } from "./collections-sheet";
import { ItemSheet } from "./item-sheet";
import { SaveToCollectionSheet } from "./save-to-collection-sheet";
import { ShareSheet } from "./share-sheet";

// vi.mock factories are hoisted above imports, so anything they close over goes through
// vi.hoisted() — the same pattern onboarding-screen.test.tsx established for mocking
// `~/trpc/react`, where the awkward part is that `api.x.y.useQuery()` is a *hook returning an
// object*, not a plain function.
const {
  mutateMock,
  pushMock,
  invalidateMock,
  collectionsData,
  countData,
  countLoading,
  mutationOpts,
  createMock,
  createOpts,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  // The New-collection row's mutation, captured the same way as `mutationOpts` so a test can play
  // the server's "created" answer at the moment it wants.
  createOpts: {
    current: undefined as
      undefined | { onSuccess: (row: { id: string; name: string }) => void },
  },
  mutateMock: vi.fn(),
  pushMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  collectionsData: {
    current: [
      {
        id: "c1",
        name: "Articles",
        createdAt: new Date(),
        itemCount: 2,
        covers: ["https://example.test/c1.jpg"],
      },
      {
        id: "c2",
        name: "Art",
        createdAt: new Date(),
        itemCount: 0,
        covers: [],
      },
    ],
  },
  countData: { current: 7 },
  countLoading: { current: false },
  // Typed rather than `unknown`: the tests drive the sheet's success and failure branches through
  // this, so the shape is the contract under test.
  mutationOpts: {
    current: undefined as
      | undefined
      | {
          onError: (err: { data?: { code?: string } }) => void;
          onSuccess: (
            result: {
              collectionName: string;
              drift: { topicLabel: string; isNew: boolean } | null;
            },
            variables: {
              itemId: string;
              collectionId: string;
              topicId?: string;
            },
          ) => Promise<void>;
        },
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        collections: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
        count: { invalidate: invalidateMock },
      },
    }),
    saves: {
      collections: {
        useQuery: () => ({ data: collectionsData.current, isLoading: false }),
      },
      count: {
        useQuery: () => ({
          data: countLoading.current ? undefined : countData.current,
          isLoading: countLoading.current,
        }),
      },
      createCollection: {
        useMutation: (opts: NonNullable<typeof createOpts.current>) => {
          createOpts.current = opts;
          return { mutate: createMock, isPending: false };
        },
      },
      saveToCollection: {
        // Captures the caller's onSuccess/onError so a test can drive either branch — the sheet's
        // whole failure story lives in the options object, not in the mutate call.
        useMutation: (opts: NonNullable<typeof mutationOpts.current>) => {
          mutationOpts.current = opts;
          return { mutate: mutateMock, isPending: false };
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const DEFAULT_COLLECTIONS = [
  {
    id: "c1",
    name: "Articles",
    createdAt: new Date(),
    itemCount: 2,
    covers: ["https://example.test/c1.jpg"],
  },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0, covers: [] },
];

beforeEach(() => {
  mutateMock.mockClear();
  pushMock.mockClear();
  createMock.mockClear();
});

/** Opens a sheet's New-collection row, names it, submits, and plays the server's "created". */
function makeCollection(name: string, id: string) {
  fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
  const field = screen.getByLabelText("Collection name");
  fireEvent.change(field, { target: { value: name } });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(createMock).toHaveBeenCalledWith({ name });
  act(() => createOpts.current!.onSuccess({ id, name }));
}

/** Every button's text, in document order — the rows' order is part of the design. */
const buttonLabels = () =>
  screen.getAllByRole("button").map((b) => b.textContent ?? "");

// Restoring shared fixture state in a TEARDOWN hook, not at the end of the test body: a test that
// mutates `collectionsData` and restores it inline leaves the mutation in place for every
// subsequent test in the file if one of its own expects throws first — turning a single failure
// into a cascade of unrelated ones.
afterEach(() => {
  collectionsData.current = DEFAULT_COLLECTIONS;
  countLoading.current = false;
});

describe("SaveToCollectionSheet", () => {
  it("renders a row per collection under the save title", () => {
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Save to collection" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Articles")).toBeInTheDocument();
    expect(screen.getByText("Art")).toBeInTheDocument();
  });

  it("labels the item's current collection instead of counting it", () => {
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        currentCollectionId="c2"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("Already saved here")).toBeInTheDocument();
    // ...and only on that row: Articles still shows its count.
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("leads every row with the collection's face, the current one ringed", () => {
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        currentCollectionId="c2"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    const faces = screen.getAllByTestId("cover-mosaic");
    // Articles has one picture, Art none, and the New-collection row is a glyph, not a face.
    expect(faces.map((f) => f.getAttribute("data-count"))).toEqual(["1", "0"]);
    expect(faces[1]!.parentElement).toHaveClass("ring-accent");
    expect(faces[0]!.parentElement).not.toHaveClass("ring-accent");
  });

  it("uses the singular for a collection holding one item", () => {
    collectionsData.current = [
      {
        id: "c1",
        name: "Articles",
        createdAt: new Date(),
        itemCount: 1,
        covers: [],
      },
    ];
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("saves into the picked collection and closes", () => {
    const onClose = vi.fn();
    render(
      <SaveToCollectionSheet
        open
        onClose={onClose}
        itemId="item-1"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Art"));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "item-1",
      collectionId: "c2",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // The sheet dismisses the instant a row is picked, so a failed write is otherwise
  // indistinguishable from a successful one — the user walks away believing the item was filed.
  it("reports a failed save instead of dismissing silently", () => {
    const onError = vi.fn();
    const onSaved = vi.fn();
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        onSaved={onSaved}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByText("Art"));

    mutationOpts.current!.onError({ data: { code: "INTERNAL_SERVER_ERROR" } });

    expect(onError).toHaveBeenCalledWith("Couldn't save that. Try again.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("names an expired session specifically, since that one is actionable", () => {
    const onError = vi.fn();
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        onSaved={vi.fn()}
        onError={onError}
      />,
    );
    fireEvent.click(screen.getByText("Art"));

    mutationOpts.current!.onError({ data: { code: "UNAUTHORIZED" } });

    expect(onError).toHaveBeenCalledWith(
      "Your session expired — sign in and try again.",
    );
  });
});

// The feed's long-press sheet (5.6) — the third sibling. Same collections backend as the save
// sheet, plus the "Closer Look" peek, minus the "Already saved here" state.
describe("SaveToCollectionSheet's New collection row", () => {
  const renderSave = () =>
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="i1"
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    );

  it("ends the list", () => {
    renderSave();
    expect(buttonLabels().at(-1)).toContain("New collection");
  });

  it("files the item into the collection it makes", () => {
    renderSave();
    makeCollection("Maps", "c9");
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "i1",
      collectionId: "c9",
    });
  });
});

describe("ItemSheet", () => {
  const ITEM = { id: "item-9", title: "Study of a Heron" };

  const renderSheet = (
    props: Partial<React.ComponentProps<typeof ItemSheet>> = {},
  ) =>
    render(
      <ItemSheet
        open
        onClose={vi.fn()}
        item={ITEM}
        onSaved={vi.fn()}
        onError={vi.fn()}
        appUrl="https://ambit.test"
        onToast={vi.fn()}
        {...props}
      />,
    );

  it("shows each collection's face on its compact row", () => {
    renderSheet();
    expect(screen.getAllByTestId("cover-mosaic")).toHaveLength(2);
  });

  it("offers a Share row that opens the share sheet for the item's own page", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    // This menu steps aside for the share sheet, which shows the url without its scheme.
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("ambit.test/i/item-9")).toBeInTheDocument();
  });

  it("puts the sharer's first name on the link", () => {
    renderSheet({ viewerName: "Mara" });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(
      screen.getByText("ambit.test/i/item-9?from=Mara"),
    ).toBeInTheDocument();
  });

  it("ends with a New collection row that files the tile into what it makes", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    expect(buttonLabels().at(-1)).toContain("New collection");
    makeCollection("Maps", "c9");
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "item-9",
      collectionId: "c9",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // docs/DESIGN_chrome-redesign.md §5: the feed tells the sheet which topic the card was served
  // under, and the save carries it so the server can bump that topic (for a member only).
  it("passes the slot topic along with the save", () => {
    renderSheet({ item: { ...ITEM, topicId: "surreal" } });
    fireEvent.click(screen.getByRole("button", { name: "Articles" }));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "item-9",
      collectionId: "c1",
      topicId: "surreal",
    });
  });

  it("shows the item's title, the peek action, and a row per collection", () => {
    renderSheet();
    expect(screen.getByText("Study of a Heron")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Closer Look" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Save to collection")).toBeInTheDocument();
    expect(screen.getByText("Articles")).toBeInTheDocument();
    expect(screen.getByText("Art")).toBeInTheDocument();
  });

  it("closes and navigates to the item page on Closer Look", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Closer Look" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith("/i/item-9");
  });

  it("saves the long-pressed item into the picked collection and closes", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByText("Art"));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "item-9",
      collectionId: "c2",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hands the caller the collection it landed in, so the feed can toast it", async () => {
    const onSaved = vi.fn();
    renderSheet({ onSaved });
    fireEvent.click(screen.getByText("Art"));

    await mutationOpts.current!.onSuccess(
      { collectionName: "Art", drift: null },
      { itemId: "item-9", collectionId: "c2" },
    );

    expect(onSaved).toHaveBeenCalledWith({ id: "c2", name: "Art" }, null);
  });

  // Phase 6.1: what the save taught the feed rides along to the caller, whose toast says it.
  it("passes the drift through to onSaved", async () => {
    const onSaved = vi.fn();
    renderSheet({ onSaved });
    fireEvent.click(screen.getByText("Art"));

    await mutationOpts.current!.onSuccess(
      {
        collectionName: "Art",
        drift: { topicLabel: "Cartography", isNew: true },
      },
      { itemId: "item-9", collectionId: "c2" },
    );

    expect(onSaved).toHaveBeenCalledWith(
      { id: "c2", name: "Art" },
      { topicLabel: "Cartography", isNew: true },
    );
  });

  // Same hazard as the save sheet: this one dismisses on pick too, so a silent failure reads as
  // success.
  it("reports a failed save instead of dismissing silently", () => {
    const onError = vi.fn();
    renderSheet({ onError });
    fireEvent.click(screen.getByText("Art"));

    mutationOpts.current!.onError({ data: { code: "INTERNAL_SERVER_ERROR" } });

    expect(onError).toHaveBeenCalledWith("Couldn't save that. Try again.");
  });

  // The sheet outlives the item selection by one exit animation, so `item: null` is a real state
  // it renders in — not a defensive branch.
  it("survives a null item without firing anything", () => {
    renderSheet({ item: null });
    fireEvent.click(screen.getByRole("button", { name: "Closer Look" }));
    fireEvent.click(screen.getByText("Art"));
    expect(pushMock).not.toHaveBeenCalled();
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

describe("CollectionsSheet", () => {
  it("brackets the collections with the two pseudo-rows, in order", () => {
    render(<CollectionsSheet open onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Your collections" }),
    ).toBeInTheDocument();

    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(labels[0]).toContain("Everything kept");
    expect(labels[labels.length - 1]).toContain("New collection");
    expect(labels[labels.length - 1]).toContain("Name it and it's made");
  });

  it("leads Everything kept with the bookmark square and each collection with its face", () => {
    render(<CollectionsSheet open onClose={vi.fn()} />);
    expect(
      screen
        .getAllByTestId("row-glyph")
        .map((g) => g.getAttribute("data-glyph")),
    ).toEqual(["bookmark", "plus"]);
    expect(screen.getAllByTestId("cover-mosaic")).toHaveLength(2);
  });

  it("counts everything kept from saves.count, not the collection rows", () => {
    render(<CollectionsSheet open onClose={vi.fn()} />);
    // 7 total, while the two collections hold 2 and 0 — proving the total isn't derived from them
    // (an item saved outside any collection only shows up here).
    expect(screen.getByText("7 items")).toBeInTheDocument();
  });

  // `collections` and `count` are independent queries with no ordering guarantee between them, so
  // gating only on the first showed "Everything kept · 0 items" to a user with plenty saved, then
  // flipped it a moment later.
  it("waits for the count rather than flashing a wrong one", () => {
    countLoading.current = true;
    render(<CollectionsSheet open onClose={vi.fn()} />);
    expect(screen.queryByText("0 items")).not.toBeInTheDocument();
    expect(screen.queryByText("Everything kept")).not.toBeInTheDocument();
  });

  // The behavioral difference from its look-alike sibling: these rows navigate, they never save.
  it("navigates rather than saving", () => {
    render(<CollectionsSheet open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Articles"));
    expect(pushMock).toHaveBeenCalledWith("/saved?collection=c1");
    expect(mutateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Everything kept"));
    expect(pushMock).toHaveBeenCalledWith("/saved");
  });

  // 09-10-26: the row makes the collection here rather than sending the reader to Profile to do
  // it — and then goes where every other row goes, Saved filtered to it, origin marked.
  it("makes a collection in place, then opens its (empty) Saved list", () => {
    sessionStorage.clear();
    render(<CollectionsSheet open onClose={vi.fn()} />);
    makeCollection("Maps", "c9");
    expect(pushMock).toHaveBeenCalledWith("/saved?collection=c9");
    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBe("1");
    expect(pushMock).not.toHaveBeenCalledWith("/profile");
  });

  // 5.9: the marker is what lets the Saved screen pop back here instead of rebuilding the feed
  // (two pages of corpus per trip — see saved-origin.ts). Written before the push, so it's already
  // there when /saved mounts.
  it("marks the saved-origin before navigating to Saved", () => {
    sessionStorage.clear();
    render(<CollectionsSheet open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Everything kept"));
    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/saved");
  });
});
