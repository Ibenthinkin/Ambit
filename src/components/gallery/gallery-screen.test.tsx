// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { GalleryScreen } from "./gallery-screen";

// The screen's job is composition — a rail of images, a fading caption, two sheets and a pill — so
// everything below the query layer is mocked and the assertions are about wiring. The rail's own
// logic is `services/gallery-rail.test.ts`'s; the gestures are `use-rail-gestures.test.tsx`'s.
const { railFetchMock, savedForItemMock, invalidateMock, backMock, pushMock } =
  vi.hoisted(() => ({
    railFetchMock: vi.fn(),
    savedForItemMock: vi.fn(),
    invalidateMock: vi.fn().mockResolvedValue(undefined),
    backMock: vi.fn(),
    pushMock: vi.fn(),
  }));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      items: { galleryRail: { fetch: railFetchMock } },
      saves: { forItem: { invalidate: invalidateMock } },
    }),
    saves: {
      forItem: { useQuery: savedForItemMock },
      collections: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const railItem = (id: string, over: Partial<RailItem> = {}): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: `Engraver ${id}`,
  imageUrl: `https://example.test/${id}.jpg`,
  summary: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: "botany",
  ...over,
});

const ENTRY = railItem("entry");
/** Nine cells — a full server batch behind the entry, so neither end starts exhausted by accident. */
const RAIL = [ENTRY, ...Array.from({ length: 8 }, (_, i) => railItem(`r${i}`))];

function renderScreen(
  over: Partial<React.ComponentProps<typeof GalleryScreen>> = {},
) {
  return render(
    <GalleryScreen
      entryItem={ENTRY}
      initialRail={RAIL}
      authed
      appUrl="https://ambit.test"
      {...over}
    />,
  );
}

const track = () => screen.getByTestId("gallery-track");

/** jsdom has no `PointerEvent`; a MouseEvent with the right type name is indistinguishable. */
function pointer(type: string, x: number, y: number) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: 0 });
  return e;
}

const send = (type: string, x: number, y: number) =>
  act(() => void track().dispatchEvent(pointer(type, x, y)));

/** A press that never moved — the gallery's tap. */
const tap = () => {
  send("pointerdown", 100, 100);
  send("pointerup", 100, 100);
};

/** A committed horizontal swipe. The track is stubbed at 400px wide, so 120px clears the fifth. */
const swipe = (dx: number) => {
  send("pointerdown", 200, 400);
  send("pointermove", 200 + dx, 400);
  send("pointerup", 200 + dx, 400);
};

beforeEach(() => {
  railFetchMock.mockReset();
  railFetchMock.mockResolvedValue([]);
  savedForItemMock.mockReturnValue({ data: undefined });
  invalidateMock.mockClear();
  backMock.mockClear();
  pushMock.mockClear();
  sessionStorage.clear();

  // jsdom reports every box as 0×0, and the advance threshold is a fraction of the track's width.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    value: 400,
    configurable: true,
  });
});

afterEach(() => vi.useRealTimers());

describe("GalleryScreen", () => {
  it("opens on the entry image, full-bleed and alt-labelled", () => {
    renderScreen();

    const img = screen.getByAltText("Plate entry");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/img/entry");
  });

  it("renders only the three cells around the reader, not the whole rail", () => {
    renderScreen();

    // Entry plus its one loaded neighbour; there is nothing before the entry yet.
    expect(track().querySelectorAll("img")).toHaveLength(2);
  });

  describe("chrome", () => {
    it("starts hidden — the picture is the screen", () => {
      renderScreen();
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("a tap brings it up; a second tap opens details instead", () => {
      renderScreen();

      tap();
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "false",
      );
      expect(
        screen.queryByTestId("bottom-sheet-panel"),
      ).not.toBeInTheDocument();

      tap();
      expect(screen.getByTestId("bottom-sheet-panel")).toBeInTheDocument();
    });

    it("tapping the title block opens details directly", () => {
      renderScreen();

      tap(); // bring the chrome up so the block is on screen
      fireEvent.click(screen.getByTestId("gallery-title-block"));

      expect(screen.getByTestId("bottom-sheet-panel")).toBeInTheDocument();
    });

    it("hides again on every advance — a new picture, a fresh look at it", () => {
      renderScreen();

      tap();
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "false",
      );

      swipe(-120);
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });
  });

  describe("the rail", () => {
    it("advances to the next cell and retitles the chrome", () => {
      renderScreen();

      swipe(-120);
      tap(); // chrome up, so the title is assertable

      expect(
        screen.getByRole("heading", { name: "Plate r0", level: 1 }),
      ).toBeInTheDocument();
    });

    it("clamps at a loaded end rather than wrapping", () => {
      renderScreen();

      // Backwards from the entry, which is cell zero: nothing there.
      swipe(120);
      tap();

      expect(
        screen.getByRole("heading", { name: "Plate entry", level: 1 }),
      ).toBeInTheDocument();
    });

    it("fetches more from the outermost cell, with a capped exclude list", async () => {
      renderScreen();
      await act(async () => void (await Promise.resolve()));

      // Mount alone puts the reader within the margin of the head, so that end fetches at once,
      // anchored on cell zero — the entry item.
      expect(railFetchMock).toHaveBeenCalledWith({
        itemId: "entry",
        count: 8,
        exclude: RAIL.map((i) => i.id),
      });
    });

    it("stops asking an end that came back short", async () => {
      railFetchMock.mockResolvedValue([]); // a short batch: this end is exhausted
      renderScreen();
      await act(async () => void (await Promise.resolve()));
      const afterMount = railFetchMock.mock.calls.length;

      swipe(-120);
      swipe(-120);
      await act(async () => void (await Promise.resolve()));

      // The head is done and never asked again; only the tail can still be asking.
      const headCalls = railFetchMock.mock.calls.filter(
        ([input]) => (input as { itemId: string }).itemId === "entry",
      );
      expect(headCalls).toHaveLength(1);
      expect(railFetchMock.mock.calls.length).toBeGreaterThanOrEqual(
        afterMount,
      );
    });
  });

  describe("the auth boundary", () => {
    it("gives a signed-out visitor the picture and no pill, and fires no protected query", () => {
      renderScreen({ authed: false });

      expect(screen.getByAltText("Plate entry")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save to collection" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Share" }),
      ).not.toBeInTheDocument();

      // The query is still *called* — it's a hook — but always disabled.
      expect(savedForItemMock).toHaveBeenCalledWith(
        { itemId: "entry" },
        { enabled: false },
      );
    });

    it("gives a signed-in reader the pill", () => {
      renderScreen();
      tap(); // the pill lives inside the chrome

      expect(
        screen.getByRole("button", { name: "Save to collection" }),
      ).toBeInTheDocument();
      expect(savedForItemMock).toHaveBeenCalledWith(
        { itemId: "entry" },
        { enabled: true },
      );
    });
  });

  describe("share", () => {
    // Decision 4: `/i/` is the canonical share surface, never `/g/`.
    it("shares the item page for whatever is currently on screen", () => {
      renderScreen({ viewerName: "Mara" });

      swipe(-120);
      tap();
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Share" }));
      });

      // The sheet shows a bare host + path — the scheme is noise in a share sheet.
      expect(screen.getByText("ambit.test/i/r0?from=Mara")).toBeInTheDocument();
    });
  });

  describe("exits", () => {
    it("a hard swipe up pushes the item page when nothing is behind", () => {
      renderScreen();

      send("pointerdown", 200, 300);
      send("pointermove", 200, 100);
      send("pointerup", 200, 100);

      expect(pushMock).toHaveBeenCalledWith("/i/entry");
    });
  });
});
