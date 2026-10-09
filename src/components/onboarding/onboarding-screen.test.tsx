// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SKIP } from "~/lib/interview/config";
import { TEST_BANK, WIDE } from "~/lib/interview/fixtures";
import type { Question } from "~/lib/interview/types";

import { OnboardingScreen } from "./onboarding-screen";

// vi.mock factories are hoisted above imports, so the mock functions they close over have to be
// created through vi.hoisted(). Each tRPC procedure is a *hook returning an object*, so the mock
// models that shape rather than a bare vi.fn().
const { completeMock, interpretMock, replaceMock, invalidateMock, trackMock } =
  vi.hoisted(() => ({
    trackMock: vi.fn(),
    completeMock: vi.fn(),
    interpretMock: vi.fn(),
    replaceMock: vi.fn(),
    invalidateMock: vi.fn(),
  }));

vi.mock("~/components/usage/usage-provider", () => ({
  useUsage: () => ({ track: trackMock }),
}));

// The fixture bank's ids are not the real bank's, so they have no step; give them one each.
vi.mock("~/lib/interview/steps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/interview/steps")>();
  return {
    ...actual,
    STEP_OF: {
      ...actual.STEP_OF,
      words: 1,
      "space-or-garden": 2,
      evening: 3,
      unsettle: 4,
    },
  };
});

vi.mock("~/trpc/react", () => ({
  api: {
    onboarding: {
      complete: { useMutation: () => ({ mutateAsync: completeMock }) },
      interpret: { useMutation: () => ({ mutateAsync: interpretMock }) },
    },
    useUtils: () => ({ invalidate: invalidateMock }),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

// The engine's own four-question test bank (a text question, a pair, a multi, a choice — bank
// v3 has no amount question) over a production-shaped topic list — small enough to walk in a test, and independent
// of the real bank's copy, which Ben edits.
const TOPICS = [...WIDE].map((id) => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
}));
const STARTERS = ["astronomy", "botany", "music", "food"];
// The fixture bank also carries First Exhibition's question shapes (a faced choice, a multi with
// an `always` option, reading cards); the walks below are written for the four above, so they
// render the bank without those. Tests of the new shapes pass their own bank.
const V2_FIXTURES = new Set(["rooms", "rather-not", "read"]);
const FOUR = TEST_BANK.filter((q) => !V2_FIXTURES.has(q.id));
const GO = "Continue to your exhibition";

function show(over: Partial<Parameters<typeof OnboardingScreen>[0]> = {}) {
  return render(
    <OnboardingScreen
      topics={TOPICS}
      faces={{}}
      retake={false}
      bank={FOUR}
      starters={STARTERS}
      {...over}
    />,
  );
}
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
/** The auto-advance beat (DESIGN_redesign §5.2): a pick is outlined, then the screen moves on. */
const ADVANCE_MS = 380;
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** A whole-answer press (a pair's side, a choice), then the beat it advances after. */
function pick(name: string | RegExp) {
  click(name);
  wait(ADVANCE_MS);
}
const key = (k: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key: k, ...init });
const pressed = (name: string | RegExp) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed");
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
/** Is the reveal on screen? (Its h1 is the exhibition's title, which the answers choose.) */
const onReveal = () => document.querySelector('[data-step="reveal"]') !== null;
const questionId = () =>
  document
    .querySelector("[data-question-id]")
    ?.getAttribute("data-question-id");
/** Each screen's way on without answering (question-step.tsx): the bonus question's Continue,
 *  a multi's Continue, the Skip of the rooms, the pairs and a word choice, and the declines of
 *  the destinations and the reading screens. */
const LEAVES = [
  "Continue to your exhibition",
  "Continue",
  "Skip",
  "Nowhere in particular",
  "I’d rather look at pictures",
];
function leaveButton() {
  for (const name of LEAVES) {
    const b = screen.queryByRole("button", { name });
    if (b) return b;
  }
  return null;
}
/** Leaves the question on screen without answering it. */
function leave() {
  const b = leaveButton();
  if (!b) throw new Error(`no way on from ${questionId()}`);
  fireEvent.click(b);
}
/** Skips every question until the questions run out — or until the last one is held, busy,
 *  while the model maps the words (the screen stays put then; pressing on would loop forever). */
function skipAll() {
  for (let turns = 0; questionId(); turns++) {
    if (turns > 40) throw new Error(`skipAll is stuck on ${questionId()}`);
    const b = leaveButton();
    if (!b) throw new Error(`no way on from ${questionId()}`);
    if (b.getAttribute("aria-busy") === "true") return;
    fireEvent.click(b);
  }
}
type Complete = {
  picks: { topicId: string; weight: number }[];
  writingAmount: string | null;
  answers: {
    questionId: string;
    keys: string[];
    text?: string;
    topicIds?: string[];
  }[];
  bankVersion: number;
};
const sent = () => completeMock.mock.calls[0]![0] as Complete;

// Fake timers that still move with the wall clock, so `waitFor` polls as usual; the auto-advance
// tests below install strict ones of their own.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  completeMock.mockReset().mockResolvedValue({ runId: "r1" });
  interpretMock.mockReset().mockResolvedValue([]);
  replaceMock.mockReset();
  invalidateMock.mockReset().mockResolvedValue(undefined);
  trackMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("OnboardingScreen", () => {
  // DESIGN_redesign §5.2: no header, no bottom bar, no step count.
  it("opens on an intro, and Begin shows the first question — with no count of how many", () => {
    show();
    expect(questionId()).toBeUndefined();
    click("Begin");
    expect(questionId()).toBe("words");
    expect(screen.queryByText(/\bof 4\b/)).toBeNull();
    expect(screen.queryByText(/^Step \d/)).toBeNull();
  });

  // Nothing is `fixed` any more: the step bar went, and every control sits in the flow under
  // the screen it belongs to.
  it("has no fixed bar on the intro, a question or the reveal", () => {
    const { container } = show();
    expect(container.querySelector(".fixed")).toBeNull();
    click("Begin");
    expect(container.querySelector(".fixed")).toBeNull();
    skipAll();
    expect(onReveal()).toBe(true);
    expect(container.querySelector(".fixed")).toBeNull();
  });

  // One container for every screen (DESIGN §5.2): a size container, max 1120 px — the column no
  // longer steps between 600 and 1120 as the screens change.
  it("sits every screen in one 1120 px size container", () => {
    const { container } = show();
    const box = () => container.querySelector(".\\@container")!;
    const inner = () => box().querySelector(".max-w-\\[1120px\\]");
    expect(inner()).not.toBeNull();
    click("Begin");
    expect(inner()).not.toBeNull();
    leave();
    expect(questionId()).toBe("space-or-garden");
    expect(inner()).not.toBeNull();
    expect(container.querySelector('[class*="max-w-[600px]"]')).toBeNull();
  });

  it("puts a quiet Back link on every question, and none on the intro", () => {
    show();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    click("Begin");
    const back = screen.getByRole("button", { name: "Back" });
    // A text link (Button's `link` variant), not a boxed button: underlined, no border.
    expect(back.className).toMatch(/underline/);
    expect(back.classList.contains("border")).toBe(false);
  });

  it("every question can be skipped; the reveal then proposes the starters, and saving goes to the feed", async () => {
    show();
    click("Begin");
    skipAll();
    expect(onReveal()).toBe(true);
    expect(
      // The level rows only — the exhibition card above them has groups of its own.
      screen
        .getAllByRole("group")
        .flatMap((g) => g.getAttribute("data-topic") ?? []),
    ).toEqual(["astronomy", "botany", "music"]);

    click("Open my feed");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(sent().picks).toEqual(
      ["astronomy", "botany", "music"].map((topicId) => ({
        topicId,
        weight: 1,
      })),
    );
    expect(sent().answers.map((a) => a.keys)).toEqual(FOUR.map(() => [SKIP]));
    // No reading screen was reached and nothing was stored: the Reading row opens on Some.
    expect(sent().writingAmount).toBe("some");
    // About you was removed with its three columns (10-05-26): nothing of it is sent.
    expect("about" in sent()).toBe(false);
    // Nothing was typed, so no model was asked.
    expect(interpretMock).not.toHaveBeenCalled();
    // Everything the old picks fed is stale now.
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("writes nothing until the reveal's button", () => {
    show();
    click("Begin");
    skipAll();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("a tap answers a pair and a choice; a multi and a text box wait for Continue", async () => {
    interpretMock.mockResolvedValue([
      { questionId: "words", topicIds: ["food"] },
    ]);
    show();
    click("Begin");

    // Text: type, then Continue.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click(GO);

    // Pair: one tap and it moves on, after the beat.
    expect(questionId()).toBe("space-or-garden");
    pick("Space");

    // Multi: choose, then Continue.
    expect(questionId()).toBe("evening");
    click("Music");
    expect(questionId()).toBe("evening");
    click("Continue");

    // Choice — one tap, and it was the last question.
    pick("Yes");

    // Leaving the last question asks the model, once — with no screen of its own.
    expect(screen.queryByText("Putting it together…")).toBeNull();
    await waitFor(() => expect(onReveal()).toBe(true));
    expect(interpretMock).toHaveBeenCalledExactlyOnceWith({
      texts: [{ questionId: "words", text: "cookbooks" }],
    });

    // The typed favourite lands at "a lot"; a single-topic answer at "some".
    const row = (id: string) =>
      screen
        .getAllByRole("group")
        .find((g) => g.getAttribute("data-topic") === id)!;
    expect(
      within(row("food")).getByRole("radio", { name: "a lot" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(row("music")).getByRole("radio", { name: "some" }),
    ).toHaveAttribute("aria-checked", "true");

    click("Open my feed");
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    // No amount question in bank v3: the reveal's Reading row sends its value, Some here.
    expect(sent().writingAmount).toBe("some");
    expect(sent().bankVersion).toBeGreaterThan(0);
    expect(sent().answers).toEqual([
      { questionId: "words", keys: [], text: "cookbooks", topicIds: ["food"] },
      { questionId: "space-or-garden", keys: ["space"] },
      { questionId: "evening", keys: ["music"] },
      { questionId: "unsettle", keys: ["yes"] },
    ]);
    expect(sent().picks.map((p) => p.topicId)).toEqual(
      expect.arrayContaining(["food", "music", "astronomy", "eerie"]),
    );
  });

  // DESIGN §5.2: "Putting it together…" is no longer a screen. While the model maps the words,
  // the last question stays where it is with its forward button busy, then the reveal arrives.
  it("holds the last question, busy, while the model maps the words — no interpreting screen", async () => {
    let answer!: (v: { questionId: string; topicIds: string[] }[]) => void;
    interpretMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const words = FOUR.find((q) => q.id === "words")!;
    show({ bank: [words] });
    click("Begin");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click(GO);
    expect(questionId()).toBe("words");
    expect(screen.getByRole("button", { name: GO })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.queryByText("Putting it together…")).toBeNull();
    // A second press while it is in flight asks nothing more.
    click(GO);
    expect(interpretMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer([{ questionId: "words", topicIds: ["food"] }]);
    });
    await waitFor(() => expect(onReveal()).toBe(true));
    expect(
      screen
        .getAllByRole("group")
        .some((g) => g.getAttribute("data-topic") === "food"),
    ).toBe(true);
  });

  it("Back while the model is mapping stays on the questions when its answer lands", async () => {
    let answer!: (v: { questionId: string; topicIds: string[] }[]) => void;
    interpretMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const words = FOUR.find((q) => q.id === "words")!;
    const pair = FOUR.find((q) => q.id === "space-or-garden")!;
    show({ bank: [pair, words] });
    click("Begin");
    click("Skip");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click(GO);
    click("Back");
    expect(questionId()).toBe("space-or-garden");
    await act(async () => {
      answer([{ questionId: "words", topicIds: ["food"] }]);
    });
    expect(questionId()).toBe("space-or-garden");
    expect(onReveal()).toBe(false);
  });

  it("the flow never blocks on the model: a failed interpret still reaches the reveal", async () => {
    interpretMock.mockRejectedValue(new Error("down"));
    show();
    click("Begin");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click(GO);
    skipAll();
    await waitFor(() => expect(onReveal()).toBe(true));
  });

  it("whitespace in a text box is not an answer", async () => {
    const words = FOUR.find((q) => q.id === "words")!;
    show({ bank: [words] });
    click("Begin");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    click(GO);
    expect(onReveal()).toBe(true);
    click("Open my feed");
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    expect(sent().answers).toEqual([{ questionId: "words", keys: [SKIP] }]);
    expect(interpretMock).not.toHaveBeenCalled();
  });

  it("Back returns to the previous question with its answer still showing", () => {
    show();
    click("Begin");
    leave();
    pick("A garden");
    expect(questionId()).toBe("evening");
    click("Back");
    expect(questionId()).toBe("space-or-garden");
    expect(screen.getByRole("button", { name: "A garden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // And from the first question, Back is the intro again.
    click("Back");
    click("Back");
    expect(screen.getByRole("button", { name: "Begin" })).toBeInTheDocument();
  });

  it("records onboarding.step for an answer, a skip and a back, and the reveal's screen.open", () => {
    show();
    click("Begin");
    leave(); // "words", step 1, skipped
    expect(trackMock).toHaveBeenLastCalledWith("onboarding.step", {
      meta: { step: 1, action: "skip" },
    });
    pick("A garden"); // step 2, answered
    expect(trackMock).toHaveBeenLastCalledWith("onboarding.step", {
      meta: { step: 2, action: "answer" },
    });
    click("Back"); // leaving "evening", step 3
    expect(trackMock).toHaveBeenLastCalledWith("onboarding.step", {
      meta: { step: 3, action: "back" },
    });
    expect(trackMock).not.toHaveBeenCalledWith(
      "screen.open",
      expect.anything(),
    );
    leave();
    leave();
    pick("Yes");
    expect(onReveal()).toBe(true);
    expect(trackMock).toHaveBeenCalledWith("screen.open", { screen: "reveal" });
    expect(
      trackMock.mock.calls.filter(([k]) => k === "screen.open"),
    ).toHaveLength(1);
  });

  it("Back from the reveal returns to the last question, with its answer showing", () => {
    show();
    click("Begin");
    leave();
    leave();
    leave();
    pick("Yes");
    expect(onReveal()).toBe(true);
    click("Back");
    expect(questionId()).toBe("unsettle");
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a save that fails shows the error and stays put", async () => {
    completeMock.mockRejectedValue(new Error("boom"));
    show();
    click("Begin");
    skipAll();
    click("Open my feed");
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    expect(replaceMock).not.toHaveBeenCalled();
    // And it can be tried again.
    completeMock.mockResolvedValue({ runId: "r2" });
    click("Open my feed");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
  });

  it("a retake says so up front and lands back on the topics page", async () => {
    show({ retake: true });
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/profile/topics",
    );
    click("Begin");
    skipAll();
    expect(
      screen.getByText(/This replaces your current topics/),
    ).toBeInTheDocument();
    click("Open my feed");
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/profile/topics"),
    );
  });

  it("asks only what this database can answer", () => {
    // Nothing listed but music: the pair, the multi and the choice all lose their answers, and
    // only the text question is left.
    show({ topics: [{ id: "music", label: "Music" }] });
    click("Begin");
    expect(questionId()).toBe("words");
    leave();
    expect(onReveal()).toBe(true);
  });

  // Review finding (10-02-26): a tap that answers a question unmounts it, and focus fell to
  // <body> — a screen-reader user had no cue a new question had arrived.
  it("moves focus to each new question's heading", () => {
    show();
    click("Begin");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "What do you like?" }),
    );
    leave();
    pick("Space");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "What do you lose an evening to?" }),
    );
  });

  // ── Auto-advance (DESIGN_redesign §5.2; the plan's Review focus 5) ─────────────────────────
  // A whole-answer press is outlined at once and the screen moves on 380 ms later. Back inside
  // that window must cancel the pending advance — never advance twice, never land on the wrong
  // question. Strict fake timers here: nothing moves unless the test moves it.
  describe("auto-advance", () => {
    beforeEach(() => {
      vi.useRealTimers();
      vi.useFakeTimers();
    });

    it("outlines a pick at once and moves on after 380 ms, not before", () => {
      show();
      click("Begin");
      leave();
      click("Space");
      expect(questionId()).toBe("space-or-garden");
      expect(pressed("Space")).toBe("true");
      wait(ADVANCE_MS - 1);
      expect(questionId()).toBe("space-or-garden");
      wait(1);
      expect(questionId()).toBe("evening");
      // And only once: the timer that fired is gone.
      wait(5_000);
      expect(questionId()).toBe("evening");
    });

    it("Back inside the window cancels the advance and lands on the previous question, once", () => {
      show();
      click("Begin");
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "cookbooks" },
      });
      click(GO);
      expect(questionId()).toBe("space-or-garden");
      click("Space");
      wait(200);
      click("Back");
      // The question before, with what was said there.
      expect(questionId()).toBe("words");
      expect(screen.getByRole("textbox")).toHaveValue("cookbooks");
      // The cancelled pick never fires — not now, not later.
      wait(5_000);
      expect(questionId()).toBe("words");
      // Forward again: the pair is unanswered (the pick inside the window was never kept).
      click(GO);
      expect(questionId()).toBe("space-or-garden");
      expect(pressed("Space")).toBe("false");
      wait(5_000);
      expect(questionId()).toBe("space-or-garden");
    });

    it("Back inside the window on the first question is the intro, and stays it", () => {
      const pair = TEST_BANK.find((q) => q.id === "space-or-garden")!;
      show({ bank: [pair] });
      click("Begin");
      click("A garden");
      wait(100);
      click("Back");
      expect(screen.getByRole("button", { name: "Begin" })).toBeInTheDocument();
      wait(5_000);
      expect(questionId()).toBeUndefined();
      expect(onReveal()).toBe(false);
    });

    it("a second pick inside the window replaces the first: one advance, with the second", () => {
      show();
      click("Begin");
      leave();
      click("Space");
      wait(200);
      click("A garden");
      expect(pressed("A garden")).toBe("true");
      expect(pressed("Space")).toBe("false");
      // The beat restarts from the second pick.
      wait(ADVANCE_MS - 1);
      expect(questionId()).toBe("space-or-garden");
      wait(1);
      expect(questionId()).toBe("evening");
      wait(5_000);
      expect(questionId()).toBe("evening");
      click("Back");
      expect(pressed("A garden")).toBe("true");
    });

    it("Back on the reveal after a picked last question returns to it once, with its pick", () => {
      const unsettle = TEST_BANK.find((q) => q.id === "unsettle")!;
      show({ bank: [unsettle] });
      click("Begin");
      click("Yes");
      wait(ADVANCE_MS);
      expect(onReveal()).toBe(true);
      click("Back");
      expect(questionId()).toBe("unsettle");
      expect(pressed("Yes")).toBe("true");
      // Coming back shows the answer; it does not re-arm an advance.
      wait(5_000);
      expect(questionId()).toBe("unsettle");
    });

    it("leaving the screen inside the window leaves no advance behind", () => {
      const { unmount } = show();
      click("Begin");
      leave();
      click("Space");
      unmount();
      expect(() => wait(5_000)).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  // ── The bonus question's live mapping (DESIGN §5.2) ────────────────────────────────────────
  // `interpret` runs when the reader pauses, and "again on Continue if the text changed" — so a
  // Continue on words already mapped asks nothing more.
  describe("the bonus question's mapping", () => {
    const words = () => FOUR.find((q) => q.id === "words")!;
    const type = (value: string) =>
      fireEvent.change(screen.getByRole("textbox"), { target: { value } });
    /** Lets settled promises land (the model's answer, the save). */
    const flush = () => act(() => Promise.resolve());
    /** Lets the pause run out and the mapping's promise land. */
    async function pause() {
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
    }
    beforeEach(() => {
      vi.useRealTimers();
      vi.useFakeTimers();
    });

    it("maps the words on a pause, lists the real topics, and Continue asks nothing more", async () => {
      interpretMock.mockResolvedValue([
        { questionId: "words", topicIds: ["food"] },
      ]);
      show({ bank: [words()] });
      click("Begin");
      type("cookbooks");
      await pause();
      expect(interpretMock).toHaveBeenCalledExactlyOnceWith({
        texts: [{ questionId: "words", text: "cookbooks" }],
      });
      expect(screen.getByText("Mapped to one topic.")).toBeInTheDocument();
      expect(screen.getByText("Food")).toBeInTheDocument();

      click(GO);
      await flush();
      expect(onReveal()).toBe(true);
      expect(interpretMock).toHaveBeenCalledTimes(1);
      click("Open my feed");
      await flush();
      expect(sent().answers).toEqual([
        {
          questionId: "words",
          keys: [],
          text: "cookbooks",
          topicIds: ["food"],
        },
      ]);
    });

    it("asks again on Continue when the words changed after their mapping", async () => {
      interpretMock
        .mockResolvedValueOnce([{ questionId: "words", topicIds: ["food"] }])
        .mockResolvedValueOnce([{ questionId: "words", topicIds: ["music"] }]);
      show({ bank: [words()] });
      click("Begin");
      type("cookbooks");
      await pause();
      type("cookbooks and records");
      // The old mapping went with the old words.
      expect(screen.queryByText("Mapped to one topic.")).toBeNull();
      click(GO);
      await flush();
      expect(onReveal()).toBe(true);
      expect(interpretMock).toHaveBeenCalledTimes(2);
      expect(interpretMock).toHaveBeenLastCalledWith({
        texts: [{ questionId: "words", text: "cookbooks and records" }],
      });
      click("Open my feed");
      await flush();
      expect(sent().answers[0]!.topicIds).toEqual(["music"]);
    });

    // Continue pressed while the live call is still out: the shell waits for that call rather
    // than paying for the same words twice, and its topics are the ones sent.
    it("Continue mid-flight waits for the live call — one call, and its topics are used", async () => {
      let land!: (v: { questionId: string; topicIds: string[] }[]) => void;
      interpretMock.mockReturnValue(
        new Promise((resolve) => {
          land = resolve;
        }),
      );
      show({ bank: [words()] });
      click("Begin");
      type("cookbooks");
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(interpretMock).toHaveBeenCalledTimes(1);
      click(GO);
      expect(screen.getByRole("button", { name: GO })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      expect(interpretMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        land([{ questionId: "words", topicIds: ["food"] }]);
      });
      await flush();
      expect(onReveal()).toBe(true);
      expect(interpretMock).toHaveBeenCalledTimes(1);
      click("Open my feed");
      await flush();
      expect(sent().answers).toEqual([
        {
          questionId: "words",
          keys: [],
          text: "cookbooks",
          topicIds: ["food"],
        },
      ]);
    });

    it("Continue before the pause ends asks once, itself", async () => {
      interpretMock.mockResolvedValue([
        { questionId: "words", topicIds: ["food"] },
      ]);
      show({ bank: [words()] });
      click("Begin");
      type("cookbooks");
      act(() => {
        vi.advanceTimersByTime(400);
      });
      click(GO);
      // The pause runs out while the shell is finishing: the screen asks nothing more.
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
      await flush();
      expect(onReveal()).toBe(true);
      expect(interpretMock).toHaveBeenCalledExactlyOnceWith({
        texts: [{ questionId: "words", text: "cookbooks" }],
      });
    });

    it("a mapping that failed is asked for once more on Continue", async () => {
      interpretMock
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce([{ questionId: "words", topicIds: ["food"] }]);
      show({ bank: [words()] });
      click("Begin");
      type("cookbooks");
      await pause();
      expect(screen.queryByText(/Mapped to/)).toBeNull();
      click(GO);
      await flush();
      expect(onReveal()).toBe(true);
      expect(interpretMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── The keyboard (keys.ts's keyAction, one window listener) ────────────────────────────────
  describe("keys", () => {
    const fixture = (id: string) => TEST_BANK.find((q) => q.id === id)!;

    it("Enter on the intro begins", () => {
      show();
      expect(key("Enter")).toBe(false); // handled: default prevented
      expect(questionId()).toBe("words");
    });

    // Ben, 10-06-26: a pair's quiet link is Skip, and N is the same skip.
    it("on a pair, N and the Skip link skip at once, scoring nothing", async () => {
      const pair = fixture("space-or-garden");
      show({ bank: [pair, { ...pair, id: "pair-2" }] });
      click("Begin");
      key("n");
      expect(questionId()).toBe("pair-2");
      click("Skip");
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers.map((a) => a.keys)).toEqual([[SKIP], [SKIP]]);
    });

    it("on a pair, ← and → pick a side and B is both — each advancing after the beat", () => {
      const pair = fixture("space-or-garden");
      show({
        bank: [pair, { ...pair, id: "pair-2" }, { ...pair, id: "pair-3" }],
      });
      click("Begin");
      key("ArrowLeft");
      expect(pressed("Space")).toBe("true");
      wait(ADVANCE_MS);
      expect(questionId()).toBe("pair-2");
      key("ArrowRight");
      wait(ADVANCE_MS);
      expect(questionId()).toBe("pair-3");
      key("b");
      expect(pressed("Both, equally")).toBe("true");
      wait(ADVANCE_MS);
      expect(onReveal()).toBe(true);
      click("Back");
      expect(pressed("Both, equally")).toBe("true");
    });

    it("on the rooms, a digit picks, the arrows walk a cursor that Enter picks, and N skips", async () => {
      const rooms = fixture("rooms");
      const bank: Question[] = [
        rooms,
        { ...rooms, id: "rooms-2" },
        { ...rooms, id: "rooms-3" },
      ];
      show({ bank });
      click("Begin");
      key("2");
      expect(pressed("A garden")).toBe("true");
      wait(ADVANCE_MS);
      expect(questionId()).toBe("rooms-2");

      key("ArrowRight");
      const cursored = () =>
        document
          .querySelector('[data-cursor="true"]')
          ?.getAttribute("aria-label");
      expect(cursored()).toBe("Space");
      key("ArrowRight");
      expect(cursored()).toBe("A garden");
      key("Enter");
      expect(pressed("A garden")).toBe("true");
      wait(ADVANCE_MS);
      expect(questionId()).toBe("rooms-3");
      // The cursor is the screen's, not the run's: a new question starts with none.
      expect(cursored()).toBeUndefined();

      // N is a true skip (Ben, 10-06-26): at once, no beat, and nothing scored.
      key("n");
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers.map((a) => a.keys)).toEqual([
        ["garden"],
        ["garden"],
        [SKIP],
      ]);
    });

    it("on a reading screen, N declines it at once — a skip", () => {
      show({ bank: [fixture("read"), fixture("unsettle")] });
      click("Begin");
      key("n");
      expect(questionId()).toBe("unsettle");
    });

    // A keep question whose cards each add their own topic, so the card under the stack can be
    // read off the Keep button's `data-topics` (what the e2e helper steers by).
    const KEEP: Question = {
      id: "keep",
      kind: "multi",
      prompt: "Keep or pass.",
      options: [
        ["space", "astronomy"],
        ["garden", "botany"],
        ["music", "music"],
      ].map(([k, topic]) => ({
        key: k!,
        label: k!,
        face: { topic: topic! },
        effects: [{ topics: [topic!], score: 1 }],
      })),
    };
    const under = () =>
      screen.getByRole("button", { name: "Keep" }).getAttribute("data-topics");

    it("on the keep stack, → keeps and ← passes the card under it; the last decision advances", async () => {
      show({ bank: [KEEP] });
      click("Begin");
      expect(under()).toBe("astronomy");
      key("ArrowRight");
      expect(under()).toBe("botany");
      key("ArrowLeft");
      expect(under()).toBe("music");
      key("ArrowRight");
      expect(questionId()).toBe("keep");
      wait(ADVANCE_MS);
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers).toEqual([
        { questionId: "keep", keys: ["space", "music"] },
      ]);
    });

    // One model of the answer: the stack's buttons are the shell's `decideCard`, as the keys are.
    it("the stack's Pass and Keep buttons and the arrow keys walk the same stack", async () => {
      show({ bank: [KEEP] });
      click("Begin");
      click("Keep");
      expect(under()).toBe("botany");
      key("ArrowLeft");
      expect(under()).toBe("music");
      click("Pass");
      // The last decision: the stack's answer waits out the beat, then the reveal.
      expect(questionId()).toBe("keep");
      wait(ADVANCE_MS);
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers).toEqual([{ questionId: "keep", keys: ["space"] }]);
    });

    // A screen reader hears the card that's up: its title sits in a polite live region, and
    // both buttons are described by it.
    it("announces the card that's up, and describes Keep and Pass by it", () => {
      show({ bank: [KEEP] });
      click("Begin");
      const region = () => document.querySelector("[data-keep-card]")!;
      expect(region()).toHaveAttribute("aria-live", "polite");
      expect(region()).toHaveTextContent("space");
      const keep = screen.getByRole("button", { name: "Keep" });
      expect(keep).toHaveAccessibleDescription("space");
      expect(
        screen.getByRole("button", { name: "Pass" }),
      ).toHaveAccessibleDescription("space");
      click("Keep");
      expect(region()).toHaveTextContent("garden");
      expect(region()).not.toHaveTextContent("space");
      expect(
        screen.getByRole("button", { name: "Keep" }),
      ).toHaveAccessibleDescription("garden");
    });

    it("passing every card is a skip", async () => {
      show({ bank: [KEEP] });
      click("Begin");
      click("Pass");
      click("Pass");
      click("Pass");
      wait(ADVANCE_MS);
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers).toEqual([{ questionId: "keep", keys: [SKIP] }]);
    });

    it("on a list of chips, the arrows walk and Enter toggles — and nothing advances", () => {
      show({ bank: [fixture("rather-not")] });
      click("Begin");
      key("ArrowDown");
      key("Enter");
      expect(pressed("Horror")).toBe("true");
      key("ArrowDown");
      key("Enter");
      expect(pressed("Nudity")).toBe("true");
      key("Enter");
      expect(pressed("Nudity")).toBe("false");
      wait(5_000);
      expect(questionId()).toBe("rather-not");
    });

    it("leaves a chord to the browser, and a text field to its typing", () => {
      show({ bank: [fixture("space-or-garden")] });
      click("Begin");
      // ⌘B / Ctrl+← / Alt+→ are the browser's.
      expect(key("b", { metaKey: true })).toBe(true);
      key("ArrowLeft", { ctrlKey: true });
      key("ArrowRight", { altKey: true });
      expect(pressed("Space")).toBe("false");
      expect(pressed("A garden")).toBe("false");
      // A key typed into a field is the field's, whatever screen is up.
      const input = document.createElement("input");
      document.body.append(input);
      expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
      expect(pressed("Space")).toBe("false");
      input.remove();
      // An unbound key is not swallowed.
      expect(key("x")).toBe(true);
    });

    // Enter is a focused control's own: the shell does not pick or begin over it.
    it("leaves Enter to a focused button or link", () => {
      show({ retake: true, bank: [fixture("rooms"), fixture("unsettle")] });
      const cancel = screen.getByRole("link", { name: "Cancel" });
      cancel.focus();
      expect(fireEvent.keyDown(cancel, { key: "Enter" })).toBe(true);
      expect(questionId()).toBeUndefined();
      // The body is not a control: Enter begins.
      cancel.blur();
      key("Enter");
      expect(questionId()).toBe("rooms");
      // Walk the cursor, then focus Back: Enter is Back's, not a pick under the cursor.
      key("ArrowRight");
      const back = screen.getByRole("button", { name: "Back" });
      back.focus();
      expect(fireEvent.keyDown(back, { key: "Enter" })).toBe(true);
      expect(pressed("Space")).toBe("false");
      // From the heading (focused on arrival) Enter still picks under the cursor.
      const h = screen.getByRole("heading", { level: 1 });
      h.focus();
      expect(fireEvent.keyDown(h, { key: "Enter" })).toBe(false);
      expect(pressed("Space")).toBe("true");
    });

    it("an extra ← / → after the last card does not restart the beat", async () => {
      const two: Question = { ...KEEP, options: KEEP.options.slice(0, 2) };
      show({ bank: [two, fixture("unsettle")] });
      click("Begin");
      key("ArrowRight");
      key("ArrowRight");
      wait(300);
      key("ArrowLeft"); // inside the window: ignored, the beat is not restarted
      wait(ADVANCE_MS - 300);
      expect(questionId()).toBe("unsettle");
      pick("Yes");
      await waitFor(() => expect(onReveal()).toBe(true));
      click("Open my feed");
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      // Both kept cards survived the extra ←.
      expect(sent().answers[0]).toEqual({
        questionId: "keep",
        keys: ["space", "garden"],
      });
    });

    it("listens no more once the screen is gone", () => {
      const { unmount } = show({ bank: [fixture("space-or-garden")] });
      click("Begin");
      unmount();
      expect(key("ArrowLeft")).toBe(true);
    });
  });

  // ── First Exhibition (bank v2) ────────────────────────────────────────────────────────────
  describe("bank v2", () => {
    const fixture = (id: string) => TEST_BANK.find((q) => q.id === id)!;
    const begin = () => click("Begin");
    /** From the last question's answer to the reveal. */
    async function finishToReveal() {
      await waitFor(() => expect(onReveal()).toBe(true));
    }

    it("shows only the top options of a show.top question, ranked by the answers so far", () => {
      const rooms = fixture("rooms");
      const bank: Question[] = [
        rooms,
        { ...rooms, id: "playoff", show: { top: 1 } },
      ];
      show({ bank });
      begin();
      pick("A garden");
      // The playoff shows one option: the garden the reader just scored.
      expect(questionId()).toBe("playoff");
      expect(
        screen.getByRole("button", { name: "A garden" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Space" })).toBeNull();
    });

    it("sends the taste with the opened cards (Review Focus 3: after Back and a change, the final answers win)", async () => {
      const bank: Question[] = [{ ...fixture("read"), id: "read-1" }];
      const faces = {
        "read-1/essay": {
          itemId: "e1",
          title: "Long",
          writing: {
            title: "Long",
            dek: "",
            minutes: 14,
            kind: "essay" as const,
            topicIds: ["astronomy"],
          },
        },
        "read-1/curiosity": {
          itemId: "c1",
          title: "Short",
          writing: {
            title: "Short",
            dek: "",
            minutes: 3,
            kind: "curiosity" as const,
            topicIds: ["botany"],
          },
        },
      };
      show({ bank, faces });
      begin();
      pick(/Long/);
      await finishToReveal();
      click("Back");
      pick(/Short/);
      await finishToReveal();
      click(/Open my feed/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      const taste = (
        completeMock.mock.calls[0]![0] as {
          taste: { opened: unknown[] };
        }
      ).taste;
      expect(taste.opened).toEqual([
        { itemId: "c1", title: "Short", kind: "curiosity", minutes: 3 },
      ]);
      // One card opened: the Reading row opens on "a little" (defaultReadingAmount) and sends it.
      expect(sent().writingAmount).toBe("little");
    });

    // Taste v2 (DESIGN_redesign §5.1): the hang's ids go with the run, as hang.ts orders them.
    it("sends a v2 taste carrying the hang — the reader's own pictures, newest pick first", async () => {
      const pair = fixture("space-or-garden");
      const bank: Question[] = [pair, { ...pair, id: "pair-2" }];
      const pic = (id: string) => ({
        itemId: id,
        src: `/img/${id}`,
        title: id,
      });
      show({
        bank,
        faces: {
          "space-or-garden/space": pic("s1"),
          "space-or-garden/garden": pic("g1"),
          "pair-2/space": pic("s2"),
          "pair-2/garden": pic("g2"),
        },
      });
      begin();
      pick("Space");
      pick("A garden");
      await finishToReveal();
      click(/Open my feed/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      const taste = (
        completeMock.mock.calls[0]![0] as {
          taste: { v: number; hang: string[] };
        }
      ).taste;
      expect(taste.v).toBe(2);
      expect(taste.hang).toEqual(["g2", "s1"]);
    });

    // The redesign's prototype brings the words back (copy deck, Step 5): declining a reading
    // screen is "I’d rather look at pictures" — logged as a skip, at once, whatever was pressed.
    it("a reading screen is declined with “I’d rather look at pictures”, a skip", async () => {
      show({ bank: [{ ...fixture("read"), id: "read-1" }] });
      begin();
      expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
      click("I’d rather look at pictures");
      await finishToReveal();
      click(/Open my feed/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().answers).toEqual([{ questionId: "read-1", keys: [SKIP] }]);
      // Every reading screen declined: the Reading row opens on None.
      expect(sent().writingAmount).toBe("none");
    });

    it("a retaking reader's stored reading amount wins over what the cards suggest", async () => {
      show({
        bank: [{ ...fixture("read"), id: "read-1" }],
        retake: true,
        storedReading: "lot",
      });
      begin();
      click("I’d rather look at pictures");
      await finishToReveal();
      expect(screen.getByRole("radio", { name: "A lot" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      click(/Open my feed/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      expect(sent().writingAmount).toBe("lot");
    });

    it("Allow on the reveal lets a kept-out choice back in: the answer is edited, the section empties", async () => {
      const bank: Question[] = [fixture("rather-not")];
      show({ bank });
      begin();
      const option = bank[0]!.options.find((o) => o.key !== "none")!;
      click(option.label);
      click("Continue");
      await finishToReveal();
      expect(
        screen.getByRole("heading", { name: "Kept out" }),
      ).toBeInTheDocument();
      click(`Allow ${option.label}`);
      expect(screen.queryByRole("heading", { name: "Kept out" })).toBeNull();
      click(/Open my feed/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      // Allowing the last choice leaves the question as a skip (kept-out.ts).
      expect(sent().answers).toEqual([
        { questionId: "rather-not", keys: [SKIP] },
      ]);
    });

    it("Allow re-proposes: a starter kept out comes back into the mix on screen", async () => {
      // "horror" leads the starters but the rather-not answer scored it down, so the first
      // starter pass skips it; allowing it back puts it in the proposal — and on the page.
      show({
        bank: [fixture("rather-not")],
        starters: ["horror", "astronomy", "botany", "music"],
      });
      begin();
      click("Horror");
      click("Continue");
      await finishToReveal();
      const rows = () =>
        [...document.querySelectorAll("[data-topic]")].map((r) =>
          r.getAttribute("data-topic"),
        );
      expect(rows()).not.toContain("horror");
      click("Allow Horror");
      expect(rows()).toContain("horror");
      expect(rows()).not.toContain("music");
    });

    it("Start over clears every answer and returns to the intro", async () => {
      show({ bank: [{ ...fixture("read"), id: "read-1" }] });
      begin();
      click("I’d rather look at pictures");
      await finishToReveal();
      click("Start over");
      expect(trackMock).toHaveBeenCalledWith("onboarding.retake");
      expect(onReveal()).toBe(false);
      expect(screen.getByRole("button", { name: "Begin" })).toBeInTheDocument();
      begin();
      // The first question again, blank.
      expect(questionId()).toBe("read-1");
      expect(completeMock).not.toHaveBeenCalled();
    });

    it("tags the starter top-ups Proposed, and groups the mix under facet headings", async () => {
      show({
        topics: TOPICS.map((t) => ({ ...t, facet: "subject" as const })),
        bank: [{ ...fixture("read"), id: "read-1" }],
      });
      begin();
      click("I’d rather look at pictures");
      await finishToReveal();
      // Nothing was scored, so every row is a starter Ambit added.
      for (const id of ["astronomy", "botany", "music"]) {
        expect(
          within(
            document.querySelector<HTMLElement>(`[data-topic="${id}"]`)!,
          ).getByText("Proposed"),
        ).toBeInTheDocument();
      }
      expect(
        screen.getByRole("heading", { level: 3, name: "Subjects" }),
      ).toBeInTheDocument();
    });

    it("the reading screens count their sets", () => {
      // Two reading questions in one step (steps.ts): "Set 1 of 2", then "Set 2 of 2".
      show({
        bank: [
          { ...fixture("read"), id: "read-1" },
          { ...fixture("read"), id: "read-2" },
        ],
      });
      begin();
      expect(screen.getByText(/Set 1 of 2\./)).toBeInTheDocument();
      click("I’d rather look at pictures");
      expect(screen.getByText(/Set 2 of 2\./)).toBeInTheDocument();
    });
  });
});
