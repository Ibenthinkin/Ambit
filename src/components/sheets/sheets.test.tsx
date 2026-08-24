// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  pushMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  collectionsData: {
    current: [
      { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 2 },
      { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0 },
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
            variables: { itemId: string; collectionId: string },
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
  { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 2 },
  { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0 },
];

beforeEach(() => {
  mutateMock.mockClear();
  pushMock.mockClear();
});

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

  it("uses the singular for a collection holding one item", () => {
    collectionsData.current = [
      { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 1 },
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
        {...props}
      />,
    );

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
    expect(labels[labels.length - 1]).toContain("Make one on your profile");
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

    fireEvent.click(screen.getByText("New collection"));
    expect(pushMock).toHaveBeenCalledWith("/profile");
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

  // 5.10: the New-collection row writes the *profile* marker and never the saved one — each screen
  // reads only its own, and a stray savedOrigin would make /saved pop somewhere it never came from.
  it("marks the profile-origin, not the saved one, before navigating to Profile", () => {
    sessionStorage.clear();
    render(<CollectionsSheet open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("New collection"));
    expect(sessionStorage.getItem("ambit.profileOrigin.v1")).toBe("1");
    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/profile");
  });
});

describe("ShareSheet", () => {
  const props = {
    open: true,
    url: "https://ambit.test/i/item-1",
    title: "A test item",
  };

  it("shows the url without its scheme, and all six targets", () => {
    render(
      <ShareSheet
        {...props}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText("ambit.test/i/item-1")).toBeInTheDocument();
    for (const name of [
      "Messages",
      "Stories",
      "X",
      "Pinterest",
      "WhatsApp",
      "Email",
    ]) {
      expect(
        screen.getByRole("button", { name: `Share via ${name}` }),
      ).toBeInTheDocument();
    }
  });

  it("retitles for a collection", () => {
    render(
      <ShareSheet
        {...props}
        collection
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Share this collection" }),
    ).toBeInTheDocument();
  });

  it("copies the link and reports it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();

    render(
      <ShareSheet
        {...props}
        onClose={vi.fn()}
        onCopied={onCopied}
        onShareUnavailable={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Copy link"));

    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(props.url));
    expect(writeText).toHaveBeenCalledWith(props.url);
    vi.unstubAllGlobals();
  });

  it("hands every target to the OS share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });

    render(
      <ShareSheet
        {...props}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Share via Pinterest" }),
    );

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: props.title,
        url: props.url,
      }),
    );
    vi.unstubAllGlobals();
  });

  // Dismissing the OS share sheet rejects with AbortError. Reporting that as a failure would put
  // an error toast on screen every time someone changes their mind.
  it("treats a dismissed OS sheet as a normal outcome", async () => {
    const abort = Object.assign(new Error("dismissed"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abort) });
    const onShareUnavailable = vi.fn();

    render(
      <ShareSheet
        {...props}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={onShareUnavailable}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share via X" }));

    await waitFor(() => expect(onShareUnavailable).not.toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  // The path that actually runs on a development laptop, so it had better not throw.
  it("reports unavailability when the platform has no share API", async () => {
    vi.stubGlobal("navigator", {});
    const onShareUnavailable = vi.fn();

    render(
      <ShareSheet
        {...props}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={onShareUnavailable}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share via Messages" }));

    await waitFor(() => expect(onShareUnavailable).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });

  // Both conditions have to hold: an article has no image to save, and an image with no handler
  // would be a dead button.
  it("offers Save image only in an image context with a handler", () => {
    const onSaveImage = vi.fn();
    const { rerender } = render(
      <ShareSheet
        {...props}
        imageContext
        onSaveImage={onSaveImage}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Save image/ }),
    ).toBeInTheDocument();

    // The article share sheet — same props, no image.
    rerender(
      <ShareSheet
        {...props}
        onSaveImage={onSaveImage}
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Save image/ })).toBeNull();

    // And an image with nobody to fetch it.
    rerender(
      <ShareSheet
        {...props}
        imageContext
        onClose={vi.fn()}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Save image/ })).toBeNull();
  });

  it("closes the sheet before handing off the save", () => {
    const onClose = vi.fn();
    const onSaveImage = vi.fn();
    render(
      <ShareSheet
        {...props}
        imageContext
        onSaveImage={onSaveImage}
        onClose={onClose}
        onCopied={vi.fn()}
        onShareUnavailable={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Save image/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSaveImage).toHaveBeenCalledOnce();
  });
});
