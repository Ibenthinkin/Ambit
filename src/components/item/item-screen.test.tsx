// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import type { RailItem } from "~/server/services/gallery-rail";
import { ItemScreen } from "./item-screen";

// Composition, not logic: the rail's own draw is `services/gallery-rail`'s, the gestures are
// `use-rail-gestures.test.tsx`'s, the strip's sizing is `hero-rail.test.tsx`'s, and the facts
// block is `item-facts.test.tsx`'s. What is pinned here is the wiring between them.
const {
  railFetchMock,
  savedForItemMock,
  wanderQueryMock,
  invalidateMock,
  backMock,
  pushMock,
} = vi.hoisted(() => ({
  railFetchMock: vi.fn(),
  savedForItemMock: vi.fn(),
  wanderQueryMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  backMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      items: { galleryRail: { fetch: railFetchMock } },
      saves: {
        forItem: { invalidate: invalidateMock },
        collections: { invalidate: invalidateMock },
      },
    }),
    items: { wanderNext: { useQuery: wanderQueryMock } },
    saves: {
      forItem: { useQuery: savedForItemMock },
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const railItem = (id: string, over: Partial<RailItem> = {}): RailItem => ({
  id,
  title: `Plate ${id}`,
  attribution: `Engraver ${id}`,
  imageUrl: `https://example.test/${id}.jpg`,
  summary: null,
  body: null,
  source: "met",
  sourceUrl: `https://example.test/o/${id}`,
  license: null,
  topicId: "botany",
  topicLabel: "Botany",
  ...over,
});

const ENTRY = railItem("entry");
/** Nine cells — a full server batch behind the entry, so neither end starts exhausted by accident. */
const RAIL = [ENTRY, ...Array.from({ length: 8 }, (_, i) => railItem(`r${i}`))];

function renderScreen(
  over: Partial<React.ComponentProps<typeof ItemScreen>> = {},
) {
  return render(
    <ItemScreen
      entryItem={ENTRY}
      initialRail={RAIL}
      initialWander={[]}
      authed
      appUrl="https://ambit.test"
      sharedBy={null}
      {...over}
    />,
  );
}

const track = () => screen.getByTestId("gallery-track");
/** jsdom has no PointerEvent; a MouseEvent with the right type name is what the hook reads. */
function pointer(
  type: string,
  x: number,
  y: number,
  pointerType: "touch" | "mouse" = "touch",
) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  Object.defineProperty(e, "timeStamp", { value: 0 });
  return e;
}
const send = (type: string, x: number, y: number) =>
  act(() => void track().dispatchEvent(pointer(type, x, y)));
const tap = () => {
  send("pointerdown", 100, 100);
  send("pointerup", 100, 100);
};
const key = (k: string) =>
  act(() => void fireEvent.keyDown(window, { key: k }));
const swipe = (dx: number) => {
  send("pointerdown", 200, 400);
  send("pointermove", 200 + dx, 400);
  send("pointerup", 200 + dx, 400);
};
const heading = () => screen.getByRole("heading", { level: 1 });

/** Held as a spy of its own so the assertions never pass `history.replaceState` around unbound. */
let replaceState: MockInstance<History["replaceState"]>;

beforeEach(() => {
  railFetchMock.mockReset().mockResolvedValue([]);
  savedForItemMock.mockReturnValue({ data: undefined });
  wanderQueryMock.mockReturnValue({ data: [] });
  invalidateMock.mockClear();
  backMock.mockClear();
  pushMock.mockClear();
  sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  replaceState = vi.spyOn(window.history, "replaceState");
});
afterEach(() => vi.restoreAllMocks());

describe("ItemScreen", () => {
  it("opens on the entry picture with its facts under it", () => {
    renderScreen();
    expect(screen.getByAltText("Plate entry")).toHaveAttribute(
      "src",
      "/api/img/entry",
    );
    expect(heading()).toHaveTextContent("Plate entry");
    expect(
      screen.getByRole("list", { name: "About this work" }),
    ).toBeInTheDocument();
  });

  it("renders only the three cells around the reader", () => {
    renderScreen();
    expect(track().querySelectorAll("img")).toHaveLength(2); // entry + one neighbour
  });

  it("rewrites nothing on a fresh load — the address bar already names the entry", () => {
    renderScreen();
    expect(replaceState).not.toHaveBeenCalled();
  });

  describe("chrome", () => {
    it("starts hidden, a tap brings it up, a second tap puts it away — nothing else opens", () => {
      renderScreen();
      const chrome = screen.getByTestId("gallery-chrome");
      expect(chrome).toHaveAttribute("aria-hidden", "true");
      tap();
      expect(chrome).toHaveAttribute("aria-hidden", "false");
      tap();
      expect(chrome).toHaveAttribute("aria-hidden", "true");
      expect(screen.queryByTestId("bottom-sheet-panel")).toBeNull();
    });

    it("a mouse moving over the picture brings it up too", () => {
      renderScreen();
      act(
        () =>
          void track().dispatchEvent(pointer("pointermove", 10, 10, "mouse")),
      );
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "false",
      );
    });

    // The phone regression this guards: after a tap the browser fires compatibility *mouse*
    // events, `mousemove` included. Had the summon listened for those, the second tap's hide would
    // be undone at once and the chrome could never be put away on a touch screen.
    it("a finger's move, and a tap's compatibility mousemove, summon nothing", () => {
      renderScreen();
      tap();
      tap(); // shown, then put away
      act(
        () => void fireEvent.mouseMove(track(), { clientX: 12, clientY: 12 }),
      );
      send("pointermove", 14, 14); // pointerType "touch"
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    it("hides again on every advance", () => {
      renderScreen();
      tap();
      swipe(-120);
      expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });
  });

  describe("the rail", () => {
    it("advances on a swipe, and the whole page becomes that item — title, facts, address bar", () => {
      renderScreen();
      swipe(-120);
      expect(heading()).toHaveTextContent("Plate r0");
      expect(replaceState).toHaveBeenCalledWith(null, "", "/i/r0");
      expect(document.title).toContain("Plate r0");
      expect(wanderQueryMock).toHaveBeenLastCalledWith(
        { itemId: "r0" },
        expect.objectContaining({}),
      );
    });

    it("ArrowRight advances, ArrowLeft goes back, Escape leaves", () => {
      renderScreen();
      key("ArrowRight");
      expect(heading()).toHaveTextContent("Plate r0");
      key("ArrowLeft");
      expect(heading()).toHaveTextContent("Plate entry");
      key("Escape");
      // No feed marker in sessionStorage: a cold open, so the exit builds a focused feed.
      expect(pushMock).toHaveBeenCalledWith("/feed?focus=entry");
    });

    it("Escape pops when the visit came from the feed — keyed on the entry, however far the rail went", () => {
      sessionStorage.setItem("ambit.feedOrigin.v1", "entry");
      renderScreen();
      swipe(-120);
      swipe(-120);
      key("Escape");
      expect(backMock).toHaveBeenCalledTimes(1);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("a quick downward flick at the top of the page leaves too", () => {
      renderScreen();
      send("pointerdown", 200, 200);
      send("pointermove", 200, 320);
      send("pointerup", 200, 320);
      expect(pushMock).toHaveBeenCalledWith("/feed?focus=entry");
    });

    it("leaves the keys to a sheet while one is open", () => {
      renderScreen();
      tap();
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      expect(screen.getByTestId("bottom-sheet-panel")).toBeInTheDocument();
      key("ArrowRight");
      expect(heading()).toHaveTextContent("Plate entry");
    });

    it("clamps at a loaded end rather than wrapping", () => {
      renderScreen({ initialRail: [ENTRY] });
      swipe(-120);
      expect(heading()).toHaveTextContent("Plate entry");
    });

    it("fetches more from the outermost cell, with a capped exclude list", async () => {
      railFetchMock.mockResolvedValue([railItem("t1")]);
      renderScreen();
      // Nine cells; the tail fetch starts within PREFETCH_MARGIN (3) of the end.
      for (let i = 0; i < 6; i++) swipe(-120);
      // Let the fetch's promise settle.
      await act(() => Promise.resolve());
      expect(railFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "r7", count: 8 }),
      );
    });
  });

  describe("the auth boundary", () => {
    it("gives a signed-out visitor the picture, the facts and no pill, and fires no protected query", () => {
      renderScreen({ authed: false });
      tap();
      expect(screen.getByAltText("Plate entry")).toBeInTheDocument();
      expect(
        screen.getByRole("list", { name: "About this work" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save to collection" }),
      ).toBeNull();
      expect(savedForItemMock).toHaveBeenCalledWith(
        { itemId: "entry" },
        expect.objectContaining({ enabled: false }),
      );
    });

    it("gives a signed-in reader the pill, inside the chrome", () => {
      renderScreen();
      tap();
      expect(
        screen.getByRole("button", { name: "Save to collection" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });
  });

  it("names the sharer when the link carried one", () => {
    renderScreen({ sharedBy: "Mara" });
    expect(screen.getByText(/Mara/)).toBeInTheDocument();
  });
});
