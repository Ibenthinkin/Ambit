// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachInstallListeners,
  bannerEligible,
  dismissForever,
  INSTALL_KEY,
  isStandalone,
  markConfirmed,
  MIN_VISITS,
  readInstallState,
  recordFeedVisit,
  resetInstallStoreForTests,
  SNOOZE_MS,
  snooze,
  useInstall,
  VISIT_GAP_MS,
  writeInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from "./install-store";

const NOW = 1_780_000_000_000;

function state(overrides: Partial<InstallState> = {}): InstallState {
  return { v: 1, feedVisits: 0, lastVisitAt: 0, ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  resetInstallStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readInstallState", () => {
  it("returns an empty state when nothing is stored", () => {
    expect(readInstallState()).toEqual(state());
  });

  it("round-trips through writeInstallState", () => {
    const stored = state({ feedVisits: 3, lastVisitAt: NOW, dismissed: true });
    writeInstallState(stored);
    expect(readInstallState()).toEqual(stored);
  });

  it("falls back to empty on unparseable JSON rather than throwing", () => {
    localStorage.setItem(INSTALL_KEY, "{not json");
    expect(readInstallState()).toEqual(state());
  });

  it("discards a value from a schema it doesn't know", () => {
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ v: 2, feedVisits: 99 }));
    expect(readInstallState()).toEqual(state());
  });

  it("survives storage that throws outright — Safari's Lockdown mode does", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(readInstallState()).toEqual(state());
  });

  it("does not throw when a write is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => writeInstallState(state({ feedVisits: 1 }))).not.toThrow();
  });
});

describe("recordFeedVisit", () => {
  it("counts a first visit", () => {
    expect(recordFeedVisit(state(), NOW)).toEqual(
      state({ feedVisits: 1, lastVisitAt: NOW }),
    );
  });

  it("ignores a reload inside the same session window", () => {
    const first = recordFeedVisit(state(), NOW);
    const second = recordFeedVisit(first, NOW + VISIT_GAP_MS - 1);
    expect(second).toBe(first);
    expect(second.feedVisits).toBe(1);
  });

  it("counts a return after the gap has passed", () => {
    const first = recordFeedVisit(state(), NOW);
    const second = recordFeedVisit(first, NOW + VISIT_GAP_MS);
    expect(second.feedVisits).toBe(2);
    expect(second.lastVisitAt).toBe(NOW + VISIT_GAP_MS);
  });
});

describe("bannerEligible", () => {
  it("stays quiet on the first visit", () => {
    expect(bannerEligible(state({ feedVisits: 1 }), NOW, false)).toBe(false);
  });

  it("offers on the visit it was told to", () => {
    expect(bannerEligible(state({ feedVisits: MIN_VISITS }), NOW, false)).toBe(
      true,
    );
  });

  it("never offers when the app is already installed", () => {
    expect(bannerEligible(state({ feedVisits: 9 }), NOW, true)).toBe(false);
  });

  it("respects a permanent dismissal for good", () => {
    const dismissed = dismissForever(state({ feedVisits: 9 }));
    expect(bannerEligible(dismissed, NOW, false)).toBe(false);
    expect(bannerEligible(dismissed, NOW + SNOOZE_MS * 12, false)).toBe(false);
  });

  it("holds its tongue for a month after 'Not now', then asks again", () => {
    const snoozed = snooze(state({ feedVisits: 9 }), NOW);
    expect(bannerEligible(snoozed, NOW + SNOOZE_MS - 1, false)).toBe(false);
    expect(bannerEligible(snoozed, NOW + SNOOZE_MS + 1, false)).toBe(true);
  });
});

describe("markConfirmed", () => {
  it("records that the confirmation has been shown", () => {
    expect(markConfirmed(state()).confirmed).toBe(true);
  });
});

describe("isStandalone", () => {
  it("is false in an ordinary tab", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(isStandalone()).toBe(false);
  });

  it("is true when the display mode says so (Chromium/Android)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("standalone"),
    }));
    expect(isStandalone()).toBe(true);
  });

  it("is true on an iOS home-screen app, which has no display-mode support", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    expect(isStandalone()).toBe(true);
    Reflect.deleteProperty(navigator, "standalone");
  });
});

describe("useInstall", () => {
  /** Dispatches an event shaped like Chromium's, with a controllable outcome. */
  function fireBeforeInstallPrompt(outcome: "accepted" | "dismissed") {
    const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    const prompt = vi.fn().mockResolvedValue(undefined);
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return prompt;
  }

  it("reports nothing to prompt with before the browser offers", () => {
    attachInstallListeners();
    const { result } = renderHook(() => useInstall());

    expect(result.current.canPrompt).toBe(false);
    expect(result.current.installed).toBe(false);
  });

  it("picks up a prompt the browser fires, even one that arrives before a listener mounts", () => {
    attachInstallListeners();
    fireBeforeInstallPrompt("accepted");

    // Rendered only *after* the event — the whole reason the store isn't component state.
    const { result } = renderHook(() => useInstall());
    expect(result.current.canPrompt).toBe(true);
  });

  it("returns the reader's answer and spends the prompt", async () => {
    attachInstallListeners();
    const prompt = fireBeforeInstallPrompt("accepted");
    const { result } = renderHook(() => useInstall());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.prompt();
    });

    expect(prompt).toHaveBeenCalledOnce();
    expect(outcome).toBe("accepted");
    // Single-use: the browser will not accept the same event twice.
    expect(result.current.canPrompt).toBe(false);
  });

  it("reports a declined prompt as dismissed", async () => {
    attachInstallListeners();
    fireBeforeInstallPrompt("dismissed");
    const { result } = renderHook(() => useInstall());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.prompt();
    });

    expect(outcome).toBe("dismissed");
  });

  it("says 'unavailable' when there is no prompt to show — every iOS reader", async () => {
    attachInstallListeners();
    const { result } = renderHook(() => useInstall());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.prompt();
    });

    expect(outcome).toBe("unavailable");
  });

  it("notices an install the browser reports", () => {
    attachInstallListeners();
    const { result } = renderHook(() => useInstall());

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.installed).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });

  it("attaches its listeners only once however many components ask", () => {
    const add = vi.spyOn(window, "addEventListener");
    attachInstallListeners();
    attachInstallListeners();
    attachInstallListeners();

    const installEvents = add.mock.calls.filter(([type]) => {
      // Widened to string: `addEventListener`'s overloads narrow the parameter to a known event
      // map, and neither of these two is in it.
      const name: string = type;
      return name === "beforeinstallprompt" || name === "appinstalled";
    });
    expect(installEvents).toHaveLength(2);
  });
});
