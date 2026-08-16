// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionsSheet } from "./collections-sheet";
import { SaveToCollectionSheet } from "./save-to-collection-sheet";
import { ShareSheet } from "./share-sheet";

// vi.mock factories are hoisted above imports, so anything they close over goes through
// vi.hoisted() — the same pattern onboarding-screen.test.tsx established for mocking
// `~/trpc/react`, where the awkward part is that `api.x.y.useQuery()` is a *hook returning an
// object*, not a plain function.
const { mutateMock, pushMock, invalidateMock, collectionsData, countData } =
  vi.hoisted(() => ({
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
      count: { useQuery: () => ({ data: countData.current }) },
      saveToCollection: {
        useMutation: () => ({ mutate: mutateMock, isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  mutateMock.mockClear();
  pushMock.mockClear();
});

describe("SaveToCollectionSheet", () => {
  it("renders a row per collection under the save title", () => {
    render(
      <SaveToCollectionSheet
        open
        onClose={vi.fn()}
        itemId="item-1"
        onSaved={vi.fn()}
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
      />,
    );
    expect(screen.getByText("1 item")).toBeInTheDocument();
    collectionsData.current = [
      { id: "c1", name: "Articles", createdAt: new Date(), itemCount: 2 },
      { id: "c2", name: "Art", createdAt: new Date(), itemCount: 0 },
    ];
  });

  it("saves into the picked collection and closes", () => {
    const onClose = vi.fn();
    render(
      <SaveToCollectionSheet
        open
        onClose={onClose}
        itemId="item-1"
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Art"));
    expect(mutateMock).toHaveBeenCalledWith({
      itemId: "item-1",
      collectionId: "c2",
    });
    expect(onClose).toHaveBeenCalledOnce();
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
});
