// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INSTALL_KEY,
  SNOOZE_MS,
  VISIT_GAP_MS,
  type InstallState,
  type PromptResult,
} from "~/lib/install-store";

import { InstallFlow } from "./install-flow";

const NOW = 1_780_000_000_000;

// The store's pure half stays real — the eligibility arithmetic under test here is the same code
// the app runs. Only the two things that read the *browser* are stubbed: display mode, and the
// prompt event that no test environment fires.
const stubs = vi.hoisted(() => ({
  standalone: false,
  canPrompt: false,
  installed: false,
  prompt: vi.fn<() => Promise<PromptResult>>(),
}));

vi.mock("~/lib/install-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/install-store")>();
  return {
    ...actual,
    isStandalone: () => stubs.standalone,
    useInstall: () => ({
      canPrompt: stubs.canPrompt,
      installed: stubs.installed,
      prompt: stubs.prompt,
    }),
  };
});

function seed(state: Partial<InstallState>) {
  localStorage.setItem(
    INSTALL_KEY,
    JSON.stringify({ v: 1, feedVisits: 0, lastVisitAt: 0, ...state }),
  );
}

function stored(): InstallState {
  return JSON.parse(localStorage.getItem(INSTALL_KEY) ?? "{}") as InstallState;
}

function renderFlow() {
  return render(<InstallFlow now={() => NOW} />);
}

const banner = () => screen.queryByTestId("install-banner");
const confirmation = () => screen.queryByTestId("install-done");
const instructions = () => screen.queryByText("Add to home screen");

beforeEach(() => {
  localStorage.clear();
  stubs.standalone = false;
  stubs.canPrompt = false;
  stubs.installed = false;
  stubs.prompt = vi.fn<() => Promise<PromptResult>>();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallFlow — when it asks", () => {
  it("says nothing on a first visit, but remembers the visit", () => {
    renderFlow();

    expect(banner()).not.toBeInTheDocument();
    expect(stored().feedVisits).toBe(1);
  });

  it("offers the banner on a return visit", () => {
    seed({ feedVisits: 1, lastVisitAt: NOW - VISIT_GAP_MS - 1 });
    renderFlow();

    expect(banner()).toBeInTheDocument();
    expect(stored().feedVisits).toBe(2);
  });

  it("treats a reload minutes later as the same visit", () => {
    seed({ feedVisits: 1, lastVisitAt: NOW - 60_000 });
    renderFlow();

    expect(banner()).not.toBeInTheDocument();
    expect(stored().feedVisits).toBe(1);
  });

  it("never asks a reader who already installed", () => {
    stubs.standalone = true;
    seed({ feedVisits: 9, lastVisitAt: 0, confirmed: true });
    renderFlow();

    expect(banner()).not.toBeInTheDocument();
    expect(confirmation()).not.toBeInTheDocument();
  });
});

describe("InstallFlow — answering the banner", () => {
  beforeEach(() => {
    seed({ feedVisits: 1, lastVisitAt: NOW - VISIT_GAP_MS - 1 });
  });

  it("shows instructions when the browser has no prompt to offer", async () => {
    renderFlow();

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });

    expect(instructions()).toBeInTheDocument();
    expect(stubs.prompt).not.toHaveBeenCalled();
  });

  it("fires the real browser prompt when there is one, and shows no instructions", async () => {
    stubs.canPrompt = true;
    stubs.prompt.mockResolvedValue("accepted");
    renderFlow();

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });

    expect(stubs.prompt).toHaveBeenCalledOnce();
    expect(instructions()).not.toBeInTheDocument();
    // The confirmation is the `appinstalled` effect's job, not this handler's — nothing is claimed
    // here that the browser hasn't reported.
    expect(confirmation()).not.toBeInTheDocument();
  });

  it("snoozes rather than nags when the browser prompt is declined", async () => {
    stubs.canPrompt = true;
    stubs.prompt.mockResolvedValue("dismissed");
    renderFlow();

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });

    expect(banner()).not.toBeInTheDocument();
    expect(instructions()).not.toBeInTheDocument();
    expect(stored().snoozedUntil).toBe(NOW + SNOOZE_MS);
  });

  it("snoozes for a month when the instruction sheet is closed", async () => {
    renderFlow();

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
    });
    // BottomSheet has no close button — it closes on the scrim or Escape, like every other sheet
    // in the app.
    await act(async () => {
      fireEvent.click(screen.getByTestId("bottom-sheet-scrim"));
    });

    expect(stored().snoozedUntil).toBe(NOW + SNOOZE_MS);
    expect(stored().dismissed).toBeUndefined();
  });

  it("takes the X as a permanent answer", () => {
    renderFlow();

    act(() => {
      screen.getByRole("button", { name: "Not now" }).click();
    });

    expect(banner()).not.toBeInTheDocument();
    expect(stored().dismissed).toBe(true);
    expect(stored().snoozedUntil).toBeUndefined();
  });
});

describe("InstallFlow — the confirmation", () => {
  it("celebrates an install the browser actually reported", () => {
    stubs.installed = true;
    renderFlow();

    expect(confirmation()).toBeInTheDocument();
    expect(stored().confirmed).toBe(true);
  });

  it("celebrates the first standalone launch — the only signal iOS ever gives", () => {
    stubs.standalone = true;
    renderFlow();

    expect(confirmation()).toBeInTheDocument();
    expect(stored().confirmed).toBe(true);
  });

  it("does not celebrate twice", () => {
    stubs.standalone = true;
    seed({ feedVisits: 3, lastVisitAt: 0, confirmed: true });
    renderFlow();

    expect(confirmation()).not.toBeInTheDocument();
  });

  it("dismisses into the feed", () => {
    stubs.standalone = true;
    renderFlow();

    act(() => {
      screen.getByRole("button", { name: "Start exploring" }).click();
    });

    expect(confirmation()).not.toBeInTheDocument();
  });
});
