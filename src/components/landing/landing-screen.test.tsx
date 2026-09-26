// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReelPicture } from "~/server/services/landing-pool";

import { LandingScreen } from "./landing-screen";
import { TEMPOS, type Tempo } from "./tempos";
import { OVERTURE_MS } from "./use-overture";

vi.mock("~/lib/fonts", () => ({ inter: { className: "font-inter-test" } }));

/**
 * jsdom implements neither `matchMedia` nor image decoding, and the screen uses both on mount.
 * `Image` is replaced by one whose `decode` resolves at once, so every requested picture becomes
 * ready on the next microtask. Stubbing is setup, not assertion — except `reduce`, which some
 * tests flip on purpose.
 */
function stubEnvironment({
  reduce = false,
  portrait = true,
}: { reduce?: boolean; portrait?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      (reduce && query.includes("prefers-reduced-motion")) ||
      (portrait && query.includes("orientation: portrait")),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      srcset = "";
      sizes = "";
      decode = () => Promise.resolve();
    },
  );
}

const pics = (n: number): ReelPicture[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    src: `/api/img/p${i}?w=960`,
    srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w`,
  }));

/** Renders and lets the decode promises settle, so the pictures are ready. */
async function renderScreen(
  mode: "cycle" | "static" = "cycle",
  tempo: Tempo = TEMPOS.cut,
  pictures: ReelPicture[] = pics(12),
) {
  const view = render(
    <LandingScreen
      mode={mode}
      reels={{ portrait: pictures, landscape: pictures }}
      initialShape="portrait"
      tempo={tempo}
    >
      <form data-testid="auth-child" />
    </LandingScreen>,
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

const sheet = () => screen.getByTestId("auth-sheet");

/** The id of the picture on screen — exactly one layer carries `opacity: 1` once the reel runs. */
const currentId = () =>
  Array.from(
    document.querySelectorAll<HTMLImageElement>(
      "[data-testid='landing-reel'] img",
    ),
  ).find((i) => i.style.opacity === "1")?.dataset.id ?? null;

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(window, { key: k, ...init }));

/** One `act` per call: an automatic step's timer is armed by an effect that runs only after the
 *  previous step has flushed, so multi-frame runs go through `steps`. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function steps(n: number, ms: number) {
  for (let i = 0; i < n; i++) advance(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubEnvironment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "connection");
});

describe("LandingScreen — cycle", () => {
  it("opens on the overture with no picture showing, the sheet down, the glyph offered", async () => {
    await renderScreen();
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    expect(currentId()).toBeNull();
    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(
      screen.getByRole("button", { name: "Open sign-in" }),
    ).toBeInTheDocument();
  });

  it("keeps the form mounted while the sheet is down — the e2e suite waits on it", async () => {
    await renderScreen();
    expect(screen.getByTestId("auth-child")).toBeInTheDocument();
    expect(sheet().className).toContain("translate-y-full");
  });

  // Ben, 09-26-26: no text hovering over the slideshow — the whole line goes with the cut.
  it("cuts into the reel when the overture ends, and the line goes with it", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    expect(currentId()).toBe("p0");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
  });

  it("cut: after 12 frames the sheet rises, the mark goes, and the reel relaxes to the dissolve", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    steps(12, 350);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    const before = currentId();
    advance(350);
    expect(currentId()).toBe(before); // no longer 350 ms frames
    advance(6000);
    expect(currentId()).not.toBe(before);
  });

  it("dissolve: its first pass of pictures, then the sheet", async () => {
    const { firstPass, frameMs } = TEMPOS.dissolve;
    await renderScreen("cycle", TEMPOS.dissolve);
    advance(OVERTURE_MS);
    steps(firstPass - 1, frameMs);
    expect(sheet()).toHaveAttribute("data-open", "false");
    steps(1, frameMs);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("the glyph raises the sheet early and retires; the disc collapses it and the reel carries on from the same picture", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    steps(3, 350);
    const showing = currentId();
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(
      screen.queryByRole("button", { name: "Open sign-in" }),
    ).not.toBeInTheDocument();
    act(() =>
      screen.getByRole("button", { name: "Back to the slideshow" }).click(),
    );
    expect(sheet()).toHaveAttribute("data-open", "false");
    // Not back to p0 (Ben, 09-26-26: "the image quickly changes back to a specific image").
    expect(showing).not.toBe("p0");
    expect(currentId()).toBe(showing);
  });

  it("is a centered 520px card above md, transparent and inert when closed", async () => {
    await renderScreen();
    expect(sheet()).toHaveClass(
      "md:inset-auto",
      "md:left-1/2",
      "md:top-1/2",
      "md:w-[520px]",
      "md:-translate-x-1/2",
      "md:rounded-[28px]",
    );
    expect(sheet()).toHaveClass("md:opacity-0", "md:pointer-events-none");
  });

  it("a tap on the imagery is next and does not raise the sheet; ←/→ step; a field or a modifier keeps its arrows", async () => {
    await renderScreen();
    advance(OVERTURE_MS);
    act(() => void fireEvent.click(screen.getByTestId("landing-reel")));
    expect(currentId()).toBe("p1");
    expect(sheet()).toHaveAttribute("data-open", "false");
    key("ArrowRight");
    expect(currentId()).toBe("p2");
    key("ArrowLeft");
    expect(currentId()).toBe("p1");
    key("ArrowRight", { altKey: true });
    expect(currentId()).toBe("p1");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    key("ArrowRight");
    expect(currentId()).toBe("p1");
    input.remove();
  });

  it("the one-picture fallback still hands off to the sheet", async () => {
    await renderScreen("cycle", TEMPOS.cut, [
      { id: "fallback", src: "/landing/fallback.webp", srcSet: null },
    ]);
    advance(OVERTURE_MS);
    expect(currentId()).toBe("fallback");
    steps(13, 350);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("shows the pitch", async () => {
    await renderScreen();
    expect(
      screen.getByText("A quieter way to be curious."),
    ).toBeInTheDocument();
  });

  it("Save-Data: the overture plays, then the first picture holds and the sheet still rises", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    await renderScreen();
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    advance(OVERTURE_MS);
    expect(currentId()).toBe("p0");
    steps(13, 350);
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
  });
});

describe("LandingScreen — static (/reset-password)", () => {
  it("one still, no overture, sheet up, no glyph, no collapse disc", async () => {
    await renderScreen("static");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(
      screen.queryByRole("button", { name: "Open sign-in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to the slideshow" }),
    ).not.toBeInTheDocument();
  });

  it("drops the marketing hero — a reset link lands mid-task, not mid-pitch", async () => {
    await renderScreen("static");
    expect(
      screen.queryByText("A quieter way to be curious."),
    ).not.toBeInTheDocument();
  });
});

// Reduced motion (D6, 09-26-26): not a still any more. The overture plays as it does for everyone,
// the reel runs the gentle tempo, and the sheet rises on the gentle tempo's first pass. Diagnosed on
// Ben's own devices, both with Reduce Motion on: the old "one still" path was the whole bug.
describe("LandingScreen — reduced motion", () => {
  it("plays the overture's collapse, then runs the gentle tempo and raises the sheet on its first pass", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    // The overture is there, and its collapse is the same as everyone's (Ben, 09-26-26): the tail
    // clips away and the wordmark drifts to centre.
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    expect(sheet()).toHaveAttribute("data-open", "false");
    advance(OVERTURE_MS - 1);
    expect(
      screen.getByTestId("overture-tail").style.getPropertyValue("clip-path"),
    ).toBe("inset(0 100% 0 0)");
    expect(screen.getByTestId("overture-mark").style.transform).toBe(
      "translateX(var(--drift, 0px))",
    );
    // The reel starts on the gentle tempo, not the server's cut: the first frame fades in.
    advance(1);
    expect(currentId()).toBe("p0");
    const first = document.querySelector<HTMLImageElement>(
      "[data-testid='landing-reel'] img[data-id='p0']",
    )!;
    expect(first.style.transition).toContain(
      `opacity ${TEMPOS.dissolve.fadeMs}ms`,
    );
    expect(first.style.animation).toBe("");
    // Gentle frames are the dissolve's 3 s, not 350 ms.
    advance(TEMPOS.cut.frameMs * 2);
    expect(currentId()).toBe("p0");
    steps(1, TEMPOS.gentle.frameMs);
    expect(currentId()).toBe("p1");
    expect(sheet()).toHaveAttribute("data-open", "false");
    // Sheet after the gentle first pass, not the cut's 12.
    steps(TEMPOS.gentle.firstPass - 2, TEMPOS.gentle.frameMs);
    expect(sheet()).toHaveAttribute("data-open", "false");
    steps(1, TEMPOS.gentle.frameMs);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
  });

  it("the glyph opens, the disc collapses it back to the reel, ←/→ step, the glyph reopens", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    advance(OVERTURE_MS);
    const collapse = () =>
      act(() =>
        screen.getByRole("button", { name: "Back to the slideshow" }).click(),
      );
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
    collapse();
    expect(sheet()).toHaveAttribute("data-open", "false");
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
    collapse();
    expect(currentId()).toBe("p0");
    key("ArrowRight");
    expect(currentId()).toBe("p1");
    expect(sheet()).toHaveAttribute("data-open", "false");
    key("ArrowLeft");
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "false");
    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  // Both preferences at once. Save-Data still wins on bytes (one picture); the overture still
  // plays; the one-picture reel still owes the sheet its cue.
  it("with Save-Data too: the overture plays, one picture, and the sheet still rises on its own", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    stubEnvironment({ reduce: true });
    await renderScreen("cycle", TEMPOS.cut);
    expect(screen.getByTestId("overture")).toBeInTheDocument();
    advance(OVERTURE_MS);
    expect(currentId()).toBe("p0");
    expect(
      document.querySelectorAll("[data-testid='landing-reel'] img"),
    ).toHaveLength(1);
    steps(TEMPOS.gentle.firstPass, TEMPOS.gentle.frameMs);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  // The reset-password screen is static by route, and stays a still.
  it("static mode is unchanged by the preference: one still, no overture, sheet up", async () => {
    stubEnvironment({ reduce: true });
    await renderScreen("static");
    expect(screen.queryByTestId("overture")).not.toBeInTheDocument();
    expect(currentId()).toBe("p0");
    expect(sheet()).toHaveAttribute("data-open", "true");
    advance(60_000);
    key("ArrowRight");
    expect(currentId()).toBe("p0");
  });
});

// Review finding 2 (09-25-26): the decode tracker must not start on the hydration commit, where
// every client-only store still reads its server snapshot (saveData false, reduced motion false,
// so all twelve pictures at `Infinity` ahead). A plain `render` can't see this — its first render
// already has the client answers — so this hydrates real server markup.
describe("LandingScreen — hydration", () => {
  it("a Save-Data reader's hydration requests one picture, not the whole reel", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    let requested = 0;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        srcset = "";
        sizes = "";
        constructor() {
          requested += 1;
        }
        decode = () => Promise.resolve();
      },
    );
    const el = (
      <LandingScreen
        mode="cycle"
        reels={{ portrait: pics(12), landscape: pics(12) }}
        initialShape="portrait"
        tempo={TEMPOS.cut}
      >
        <form data-testid="auth-child" />
      </LandingScreen>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(el);
    document.body.appendChild(container);
    render(el, { container, hydrate: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requested).toBe(1);
    container.remove();
  });

  // A reduced-motion reader hydrates with `reduce` false (the server snapshot), i.e. the cut tempo
  // and `Infinity` ahead. The tracker must wait for the corrective render, where the tempo is
  // gentle and one-ahead: two pictures requested, never twelve.
  it("a reduced-motion reader's hydration requests one picture ahead, not the whole reel", async () => {
    stubEnvironment({ reduce: true });
    let requested = 0;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        srcset = "";
        sizes = "";
        constructor() {
          requested += 1;
        }
        decode = () => Promise.resolve();
      },
    );
    const el = (
      <LandingScreen
        mode="cycle"
        reels={{ portrait: pics(12), landscape: pics(12) }}
        initialShape="portrait"
        tempo={TEMPOS.cut}
      >
        <form data-testid="auth-child" />
      </LandingScreen>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(el);
    document.body.appendChild(container);
    render(el, { container, hydrate: true });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requested).toBe(2);
    container.remove();
  });
});

// 09-25-26: a phone held upright gets the tall reel, a computer the wide one. The server guesses
// from the browser (`initialShape`) so hydration agrees; the screen's real orientation wins after.
describe("LandingScreen — shape", () => {
  const tall = pics(12).map((p) => ({ ...p, id: `tall-${p.id}` }));
  const wide = pics(12).map((p) => ({ ...p, id: `wide-${p.id}` }));

  async function renderShaped(initialShape: "portrait" | "landscape") {
    render(
      <LandingScreen
        mode="cycle"
        reels={{ portrait: tall, landscape: wide }}
        initialShape={initialShape}
        tempo={TEMPOS.cut}
      >
        <form />
      </LandingScreen>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    advance(OVERTURE_MS);
  }

  it("an upright phone shows the tall reel", async () => {
    stubEnvironment({ portrait: true });
    await renderShaped("portrait");
    expect(currentId()).toBe("tall-p0");
  });

  it("a wide screen shows the wide reel", async () => {
    stubEnvironment({ portrait: false });
    await renderShaped("landscape");
    expect(currentId()).toBe("wide-p0");
  });

  it("the screen's real shape wins over the server's guess", async () => {
    stubEnvironment({ portrait: false });
    await renderShaped("portrait");
    expect(currentId()).toBe("wide-p0");
  });
});
