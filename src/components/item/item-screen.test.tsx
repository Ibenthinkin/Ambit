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

import { markExploreOrigin } from "~/components/feed/feed-origin";
import type * as ExploreConfig from "~/config/explore";
import { EXPLORE_BLOCKS } from "~/config/explore";
import { DESKTOP_QUERY } from "~/hooks/use-media-query";
import { HERO_LAYOUT_KEY } from "~/lib/hero-layout";
import { stubMatchMedia } from "~/test/match-media";
import type { RailItem } from "~/server/services/gallery-rail";
import { ItemScreen } from "./item-screen";

// A three-step rail cap for `/explore`'s visitors, so the tests reach it in three key presses.
vi.mock("~/config/explore", async (importOriginal) => ({
  ...(await importOriginal<typeof ExploreConfig>()),
  EXPLORE_RAIL_CAP: 3,
}));

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
// The real card needs Better Auth's client; what matters here is which mode it was opened in.
vi.mock("~/components/landing/auth-card", () => ({
  AuthCard: ({ initialMode }: { initialMode?: string }) => (
    <div data-testid="auth-card">{initialMode ?? "signin"}</div>
  ),
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
    const facts = screen.getByRole("list", { name: "About this work" });
    expect(facts).toBeInTheDocument();
    // "Some automatic spacing between the image and the description" (Ben, 09-11-26): the
    // reader column starts a clear 28px under the strip, on every width.
    const column = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.className.includes?.("pt-[28px]") && el.contains(facts),
    );
    expect(column).toBeDefined();
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

    it("leaves modifier chords to the browser — Alt/⌘+← is Back, not a page of the rail", () => {
      renderScreen();
      act(
        () =>
          void fireEvent.keyDown(window, { key: "ArrowRight", altKey: true }),
      );
      act(
        () =>
          void fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true }),
      );
      expect(heading()).toHaveTextContent("Plate entry");
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
    // Since 09-26-26 a stranger gets the toolbar too: Share is Share, Profile and Save ask for
    // the account in place, and nothing protected is ever requested for them.
    it("gives a signed-out visitor the picture, the facts and the pill, and fires no protected query", () => {
      renderScreen({ authed: false });
      tap();
      expect(screen.getByAltText("Plate entry")).toBeInTheDocument();
      expect(
        screen.getByRole("list", { name: "About this work" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
      expect(savedForItemMock).toHaveBeenCalledWith(
        { itemId: "entry" },
        expect.objectContaining({ enabled: false }),
      );
    });

    it("a stranger's Profile and Save raise the sign-up sheet over the picture", () => {
      renderScreen({ authed: false });
      tap();
      const sheet = screen.getByTestId("auth-sheet");
      expect(sheet).toHaveAttribute("data-open", "false");

      fireEvent.click(
        screen.getByRole("button", { name: "Save to collection" }),
      );
      expect(sheet).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("auth-card")).toHaveTextContent("signup");
      // In place: the picture is still there, nothing navigated.
      expect(heading()).toHaveTextContent("Plate entry");
      expect(pushMock).not.toHaveBeenCalled();

      // Escape closes the sheet rather than leaving the page.
      key("Escape");
      expect(sheet).toHaveAttribute("data-open", "false");
      expect(pushMock).not.toHaveBeenCalled();
      expect(backMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Profile" }));
      expect(sheet).toHaveAttribute("data-open", "true");
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("a stranger's Feed goes to /, never /feed", () => {
      renderScreen({ authed: false });
      tap();
      fireEvent.click(screen.getByRole("button", { name: "Feed" }));
      expect(pushMock).toHaveBeenCalledWith("/");
    });

    it("a signed-in reader's Profile is the pill's own default, and no auth sheet is mounted", () => {
      renderScreen();
      tap();
      fireEvent.click(screen.getByRole("button", { name: "Profile" }));
      expect(pushMock).toHaveBeenCalledWith("/profile");
      expect(screen.queryByTestId("auth-sheet")).toBeNull();
    });

    // Ben's review (09-11-26): "the UI bar is all over the place on the phone" — it rode inside
    // the caption, whose position followed the picture's height. Now it is fixed at the bottom
    // like every other screen's, outside the caption, and fades with the chrome.
    it("gives a signed-in reader a fixed pill outside the caption, fading with the chrome", () => {
      renderScreen();
      const pill = screen.getByTestId("pill-toolbar");
      expect(pill).toHaveClass("fixed");
      // Hidden with the chrome: inert, so not even findable as a control.
      expect(pill).toHaveAttribute("aria-hidden", "true");
      expect(
        screen.queryByRole("button", { name: "Save to collection" }),
      ).toBeNull();

      tap();
      expect(pill).toHaveAttribute("aria-hidden", "false");
      const save = screen.getByRole("button", { name: "Save to collection" });
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
      expect(pill).toContainElement(save);
      expect(screen.getByTestId("gallery-chrome")).not.toContainElement(save);

      tap();
      expect(pill).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("names the sharer when the link carried one", () => {
    renderScreen({ sharedBy: "Mara" });
    expect(screen.getByText(/Mara/)).toBeInTheDocument();
  });
});

// `/explore` (09-26-26): a signed-out visitor who came from the explore feed gets a capped rail
// that ends on the taste's end card. Everyone else keeps the endless rail.
describe("the explore rail cap", () => {
  const right = (n: number) => {
    for (let i = 0; i < n; i++) key("ArrowRight");
  };
  const endCard = () => screen.queryByText(EXPLORE_BLOCKS.end.title);

  it("ends an explore visitor's rail on the end card after the cap", () => {
    markExploreOrigin();
    renderScreen({ authed: false });
    right(3);
    expect(heading()).toHaveTextContent("Plate r2");
    // The end card waits in the next cell, and the fourth step lands on it.
    right(1);
    expect(endCard()).toBeInTheDocument();
    expect(track().querySelectorAll("img")).toHaveLength(1);
    // No further: the end card is the end.
    right(1);
    expect(heading()).toHaveTextContent("Plate r2");
    expect(sessionStorage.getItem("ambit.explore.railCount")).toBe("3");
  });

  it("steps back off the end card to the last picture", () => {
    markExploreOrigin();
    renderScreen({ authed: false });
    right(4);
    key("ArrowLeft");
    expect(track().querySelectorAll("img").length).toBeGreaterThan(1);
    expect(heading()).toHaveTextContent("Plate r2");
    key("ArrowLeft");
    expect(heading()).toHaveTextContent("Plate r1");
  });

  it("counts across item pages in the same visit", () => {
    markExploreOrigin();
    sessionStorage.setItem("ambit.explore.railCount", "2");
    renderScreen({ authed: false });
    right(2);
    expect(heading()).toHaveTextContent("Plate r0");
    expect(endCard()).toBeInTheDocument();
  });

  it("the end card's sign-up opens the card in place; its 'what is this?' goes to /", () => {
    markExploreOrigin();
    renderScreen({ authed: false });
    right(4);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByTestId("auth-sheet")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getByTestId("auth-card")).toHaveTextContent("signup");
    expect(pushMock).not.toHaveBeenCalled();
    key("Escape");
    fireEvent.click(screen.getByRole("button", { name: "What is this?" }));
    expect(pushMock).toHaveBeenCalledWith("/?open=about");
  });

  it("leaves a signed-in reader's rail endless", () => {
    markExploreOrigin();
    renderScreen({ authed: true });
    right(4);
    expect(heading()).toHaveTextContent("Plate r3");
    expect(endCard()).not.toBeInTheDocument();
  });

  it("leaves a cold-opened shared link's rail endless", () => {
    renderScreen({ authed: false });
    right(4);
    expect(heading()).toHaveTextContent("Plate r3");
    expect(endCard()).not.toBeInTheDocument();
  });

  it("offers a way back to the taste under the picture", () => {
    markExploreOrigin();
    renderScreen({ authed: false });
    expect(
      screen.getByRole("link", { name: "Keep exploring" }),
    ).toHaveAttribute("href", "/");
  });

  it("offers no such link to a cold visitor", () => {
    renderScreen({ authed: false });
    expect(
      screen.queryByRole("link", { name: "Keep exploring" }),
    ).not.toBeInTheDocument();
  });
});

// docs/DESIGN_spread-mode.md — two rail pictures side by side on the desktop item screen.
describe("spread mode", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia([DESKTOP_QUERY]);
  });
  afterEach(() => vi.unstubAllGlobals());

  const spreadOn = () => localStorage.setItem(HERO_LAYOUT_KEY, "spread");
  /** The rail fades with the chrome, so the toggle is found the way a reader finds it: a mouse
   *  moving over the picture brings it up. */
  const toggle = () => {
    act(
      () => void track().dispatchEvent(pointer("pointermove", 10, 10, "mouse")),
    );
    return screen.getByRole("button", { name: "Magazine view" });
  };
  /** Summon first, click after: summoning inside the click's `act` would batch the summon's
   *  render behind the query and the rail would still be hidden when it is looked for. */
  const clickToggle = () => {
    const button = toggle();
    act(() => void fireEvent.click(button));
  };
  /** The pictures in the cell under the reader — the middle child of the track. */
  const currentPages = () =>
    [...track().children[1]!.querySelectorAll("img")].map((i) =>
      i.getAttribute("alt"),
    );
  /** A press with no travel, released at `x` — jsdom's window is 1024 wide. */
  const tapAt = (x: number) => {
    send("pointerdown", x, 300);
    send("pointerup", x, 300);
  };

  it("offers the toggle on the desktop rail, and starts single", () => {
    renderScreen();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(currentPages()).toEqual(["Plate entry"]);
  });

  it("the toggle flips to a two-page spread and remembers it on this device", () => {
    renderScreen();
    clickToggle();
    expect(currentPages()).toEqual(["Plate entry", "Plate r0"]);
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(HERO_LAYOUT_KEY)).toBe("spread");
  });

  it("M flips the spread, both ways", () => {
    renderScreen();
    key("m");
    expect(currentPages()).toEqual(["Plate entry", "Plate r0"]);
    expect(localStorage.getItem(HERO_LAYOUT_KEY)).toBe("spread");
    key("M");
    expect(currentPages()).toEqual(["Plate entry"]);
  });

  it("opens in a spread when the device remembers one", () => {
    spreadOn();
    renderScreen();
    expect(currentPages()).toEqual(["Plate entry", "Plate r0"]);
  });

  it("turns two pictures at a time, both ways", () => {
    spreadOn();
    renderScreen();
    key("ArrowRight");
    expect(currentPages()).toEqual(["Plate r1", "Plate r2"]);
    expect(heading()).toHaveTextContent("Plate r1");
    key("ArrowLeft");
    expect(currentPages()).toEqual(["Plate entry", "Plate r0"]);
  });

  // D2: with step-by-two the right page never becomes the left one, so without a focus its
  // picture could never be saved or shared.
  it("a click on the right page makes it the item — title, facts, address bar, save target", () => {
    spreadOn();
    renderScreen();
    tapAt(800);
    expect(heading()).toHaveTextContent("Plate r0");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/i/r0");
    expect(savedForItemMock).toHaveBeenLastCalledWith(
      { itemId: "r0" },
      expect.anything(),
    );
    // Focusing is not a chrome toggle.
    expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("a click on the focused page toggles the chrome, as a tap always has", () => {
    spreadOn();
    renderScreen();
    tapAt(200);
    expect(screen.getByTestId("gallery-chrome")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    expect(heading()).toHaveTextContent("Plate entry");
  });

  it("a turn puts the focus back on the left page", () => {
    spreadOn();
    renderScreen();
    tapAt(800);
    key("ArrowRight");
    expect(heading()).toHaveTextContent("Plate r1");
  });

  it("turning the spread off lands on the page that was focused", () => {
    spreadOn();
    renderScreen();
    tapAt(800);

    clickToggle();
    expect(currentPages()).toEqual(["Plate r0"]);
    expect(heading()).toHaveTextContent("Plate r0");
  });

  it("captions both pages, the unfocused one dimmed", () => {
    spreadOn();
    renderScreen();
    const chrome = screen.getByTestId("gallery-chrome");
    const titles = [...chrome.querySelectorAll("h2")];
    expect(titles.map((t) => t.textContent)).toEqual([
      "Plate entry",
      "Plate r0",
    ]);
    expect(titles[1]!.parentElement).toHaveClass("opacity-55");
    expect(titles[0]!.parentElement).not.toHaveClass("opacity-55");
  });

  it("fetches ahead twice as early, since a turn eats two", () => {
    spreadOn();
    renderScreen();
    railFetchMock.mockClear();
    key("ArrowRight");
    expect(railFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "r7" }),
    );
  });

  it("is single, with no toggle, below the desktop breakpoint", () => {
    stubMatchMedia([]);
    spreadOn();
    renderScreen();
    expect(screen.queryByRole("button", { name: "Magazine view" })).toBeNull();
    expect(currentPages()).toEqual(["Plate entry"]);
  });

  it("counts two pictures a turn against the explore cap", () => {
    markExploreOrigin();
    spreadOn();
    renderScreen({ authed: false });
    key("ArrowRight");
    expect(sessionStorage.getItem("ambit.explore.railCount")).toBe("2");
  });
});
