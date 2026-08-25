// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingScreen } from "./landing-screen";
import { SLIDE_MS, SLIDES_PER_RUN } from "./landing-slides";

const END_MS = 260;

/**
 * jsdom implements neither `matchMedia` nor `HTMLImageElement.decode`, and the screen calls both on
 * mount. Stubbing them is setup, not assertion — except for `reduce`, which one test flips on
 * purpose.
 */
function stubEnvironment({ reduce = false }: { reduce?: boolean } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  // jsdom doesn't implement `decode` at all, so there is nothing to spy on — it has to be defined.
  // `preloadRun` copes with its absence (it falls back to the load event), but defining it here
  // exercises the path every real browser takes.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(),
  });
}

/** Renders and lets the mount effect's preload promise settle, so the cycle is enabled. */
async function renderScreen(mode: "cycle" | "static" = "cycle") {
  const view = render(
    <LandingScreen mode={mode}>
      <form data-testid="auth-child" />
    </LandingScreen>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

function sheet() {
  return screen.getByTestId("auth-sheet");
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubEnvironment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LandingScreen — cycle mode", () => {
  it("renders a full run of slides with the sheet closed and the glyph offered", async () => {
    await renderScreen();

    expect(document.querySelectorAll("img")).toHaveLength(SLIDES_PER_RUN);
    expect(
      screen.getByRole("button", { name: "Open sign-in" }),
    ).toBeInTheDocument();
    expect(sheet()).toHaveAttribute("data-open", "false");
  });

  it("shows the pitch on the sign-in route", async () => {
    await renderScreen();

    expect(
      screen.getByText("A quieter way to be curious."),
    ).toBeInTheDocument();
  });

  it("keeps the form mounted while the sheet is down — the e2e suite waits on it", async () => {
    await renderScreen();

    // Off-screen, not absent: `waitForHydration(page, "form")` and password managers both need the
    // fields in the DOM before the sheet has risen.
    expect(screen.getByTestId("auth-child")).toBeInTheDocument();
    expect(sheet().className).toContain("translate-y-full");
  });

  it("raises the sheet when the glyph is tapped, and retires the glyph", async () => {
    await renderScreen();

    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());

    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(sheet().className).toContain("translate-y-0");
    expect(
      screen.queryByRole("button", { name: "Open sign-in" }),
    ).not.toBeInTheDocument();
  });

  it("raises the sheet when the imagery itself is tapped", async () => {
    await renderScreen();

    act(() => screen.getByTestId("landing-slideshow").click());

    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("raises the sheet on its own once the run finishes", async () => {
    await renderScreen();

    expect(sheet()).toHaveAttribute("data-open", "false");

    // Each slide's timer is scheduled by an effect that only runs after the previous advance has
    // been flushed, so the run is stepped rather than skipped forward in one jump.
    for (let i = 0; i < SLIDES_PER_RUN - 1; i++) advance(SLIDE_MS);
    advance(END_MS);

    expect(sheet()).toHaveAttribute("data-open", "true");
  });

  it("collapses back to the slideshow and starts the run over", async () => {
    await renderScreen();

    act(() => screen.getByRole("button", { name: "Open sign-in" }).click());
    act(() =>
      screen.getByRole("button", { name: "Back to the slideshow" }).click(),
    );

    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(
      screen.getByRole("button", { name: "Open sign-in" }),
    ).toBeInTheDocument();

    // The replayed run still resolves into the sheet rather than stalling.
    for (let i = 0; i < SLIDES_PER_RUN - 1; i++) advance(SLIDE_MS);
    advance(END_MS);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });
});

describe("LandingScreen — static mode", () => {
  it("shows one still image with the sheet already up and no controls to open it", async () => {
    await renderScreen("static");

    expect(document.querySelectorAll("img")).toHaveLength(1);
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

  it("never moves — advancing time changes nothing", async () => {
    await renderScreen("static");

    advance(30_000);

    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(sheet()).toHaveAttribute("data-open", "true");
  });
});

describe("LandingScreen — reduced motion", () => {
  it("treats cycle mode as static when the reader has asked for less movement", async () => {
    vi.unstubAllGlobals();
    stubEnvironment({ reduce: true });

    await renderScreen("cycle");

    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(
      screen.queryByRole("button", { name: "Open sign-in" }),
    ).not.toBeInTheDocument();
  });
});
