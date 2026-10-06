// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SKIP } from "~/lib/interview/config";
import { TEST_BANK, WIDE } from "~/lib/interview/fixtures";
import type { Question } from "~/lib/interview/types";
import {
  READING_AMOUNTS,
  READING_LABELS,
} from "~/server/config/reading-amount";

import { OnboardingScreen } from "./onboarding-screen";

// vi.mock factories are hoisted above imports, so the mock functions they close over have to be
// created through vi.hoisted(). Each tRPC procedure is a *hook returning an object*, so the mock
// models that shape rather than a bare vi.fn().
const { completeMock, interpretMock, replaceMock, invalidateMock } = vi.hoisted(
  () => ({
    completeMock: vi.fn(),
    interpretMock: vi.fn(),
    replaceMock: vi.fn(),
    invalidateMock: vi.fn(),
  }),
);

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

// The engine's own five-question test bank (a text question, a pair, a multi, a choice, the
// amount) over a production-shaped topic list — small enough to walk in a test, and independent
// of the real bank's copy, which Ben edits.
const TOPICS = [...WIDE].map((id) => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
}));
const STARTERS = ["astronomy", "botany", "music", "food"];
// The fixture bank also carries First Exhibition's question shapes (a faced choice, a multi with
// an `always` option, reading cards); the walks below are written for the five above, so they
// render the bank without those. Tests of the new shapes pass their own bank.
const V2_FIXTURES = new Set(["rooms", "rather-not", "read"]);
const FIVE = TEST_BANK.filter((q) => !V2_FIXTURES.has(q.id));

function show(over: Partial<Parameters<typeof OnboardingScreen>[0]> = {}) {
  return render(
    <OnboardingScreen
      topics={TOPICS}
      faces={{}}
      retake={false}
      bank={FIVE}
      starters={STARTERS}
      {...over}
    />,
  );
}
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const questionId = () =>
  document
    .querySelector("[data-question-id]")
    ?.getAttribute("data-question-id");
/** Presses Skip until the questions run out. */
function skipAll() {
  while (questionId()) click("Skip");
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

beforeEach(() => {
  completeMock.mockReset().mockResolvedValue({ runId: "r1" });
  interpretMock.mockReset().mockResolvedValue([]);
  replaceMock.mockReset();
  invalidateMock.mockReset().mockResolvedValue(undefined);
});

describe("OnboardingScreen", () => {
  it("opens on an intro, and Begin shows the first question with its place in the run", () => {
    show();
    expect(questionId()).toBeUndefined();
    click("Begin");
    expect(questionId()).toBe("words");
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
  });

  // Ben's critique (10-05-26): Begin sat in the fixed bar at the foot of the screen, far from
  // the copy it answers. It belongs right under the intro.
  it("puts Begin under the intro copy, not in the fixed bar", () => {
    show();
    const begin = screen.getByRole("button", { name: "Begin" });
    expect(begin.closest(".fixed")).toBeNull();
  });

  it("gives a picture step the wide column and a word step the narrow one", () => {
    const { container } = show();
    const column = () => container.querySelector("main > div")!.className;
    expect(column()).toMatch(/md:max-w-\[600px\]/);
    click("Begin");
    expect(questionId()).toBe("words");
    expect(column()).toMatch(/md:max-w-\[600px\]/);
    click("Skip");
    expect(questionId()).toBe("space-or-garden");
    expect(column()).toMatch(/md:max-w-\[1120px\]/);
  });

  it("every question can be skipped; the reveal then proposes the starters, and saving goes to the feed", async () => {
    show();
    click("Begin");
    skipAll();
    expect(heading()).toBe("Here’s where we’ll start");
    expect(
      // The level rows only — the exhibition card above them has groups of its own.
      screen
        .getAllByRole("group")
        .flatMap((g) => g.getAttribute("data-topic") ?? []),
    ).toEqual(["astronomy", "botany", "music"]);

    click("Start exploring");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(sent().picks).toEqual(
      ["astronomy", "botany", "music"].map((topicId) => ({
        topicId,
        weight: 1,
      })),
    );
    expect(sent().answers.map((a) => a.keys)).toEqual(FIVE.map(() => [SKIP]));
    expect(sent().writingAmount).toBeNull();
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

  it("a tap answers a pair, a choice and the amount; a multi and a text box wait for Next", async () => {
    interpretMock.mockResolvedValue([
      { questionId: "words", topicIds: ["food"] },
    ]);
    show();
    click("Begin");

    // Text: typing turns Skip into Next.
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click("Next");

    // Pair: one tap and it moves on.
    expect(questionId()).toBe("space-or-garden");
    click("Space");

    // Multi: choose, then Next.
    expect(questionId()).toBe("evening");
    click("Music");
    expect(questionId()).toBe("evening");
    click("Next");

    // Choice, then the amount — each one tap.
    click("Yes");
    expect(questionId()).toBe("reading-amount");
    click("A lot");

    // Leaving the last question asks the model, once, behind a short beat.
    expect(screen.getByText("Putting it together…")).toBeInTheDocument();
    await waitFor(() => expect(heading()).toBe("Here’s where we’ll start"));
    expect(interpretMock).toHaveBeenCalledExactlyOnceWith({
      texts: [{ questionId: "words", text: "cookbooks" }],
    });

    // The typed favourite lands at "a lot"; a single-topic answer at "some".
    const row = (id: string) =>
      screen
        .getAllByRole("group")
        .find((g) => g.getAttribute("data-topic") === id)!;
    expect(
      within(row("food")).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(row("music")).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");

    click("Start exploring");
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    expect(sent().writingAmount).toBe("lot");
    expect(sent().bankVersion).toBeGreaterThan(0);
    expect(sent().answers).toEqual([
      { questionId: "words", keys: [], text: "cookbooks", topicIds: ["food"] },
      { questionId: "space-or-garden", keys: ["space"] },
      { questionId: "evening", keys: ["music"] },
      { questionId: "unsettle", keys: ["yes"] },
      { questionId: "reading-amount", keys: ["lot"] },
    ]);
    expect(sent().picks.map((p) => p.topicId)).toEqual(
      expect.arrayContaining(["food", "music", "astronomy", "eerie"]),
    );
  });

  it("the flow never blocks on the model: a failed interpret still reaches the reveal", async () => {
    interpretMock.mockRejectedValue(new Error("down"));
    show();
    click("Begin");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "cookbooks" },
    });
    click("Next");
    skipAll();
    await waitFor(() => expect(heading()).toBe("Here’s where we’ll start"));
  });

  it("whitespace in a text box is not an answer", () => {
    show();
    click("Begin");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("Back returns to the previous question with its answer still showing", () => {
    show();
    click("Begin");
    click("Skip");
    click("A garden");
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

  it("Back from the reveal returns to the last question, with its answer showing", () => {
    show();
    click("Begin");
    click("Skip");
    click("Skip");
    click("Skip");
    click("Yes");
    click("A lot");
    expect(heading()).toBe("Here’s where we’ll start");
    click("Back");
    expect(questionId()).toBe("reading-amount");
    expect(screen.getByRole("button", { name: "A lot" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a save that fails shows the error and stays put", async () => {
    completeMock.mockRejectedValue(new Error("boom"));
    show();
    click("Begin");
    skipAll();
    click("Start exploring");
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    expect(replaceMock).not.toHaveBeenCalled();
    // And it can be tried again.
    completeMock.mockResolvedValue({ runId: "r2" });
    click("Start exploring");
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
    click("Start exploring");
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/profile/topics"),
    );
  });

  it("asks only what this database can answer", () => {
    // Nothing listed but music: the pair, the multi and the choice all lose their answers.
    show({ topics: [{ id: "music", label: "Music" }] });
    click("Begin");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    click("Skip");
    expect(questionId()).toBe("reading-amount");
  });

  // Review finding (10-02-26): a tap that answers a question unmounts it, and focus fell to
  // <body> — a screen-reader user had no cue a new question had arrived.
  it("moves focus to each new question's heading, and announces the count from a stable region", () => {
    show();
    click("Begin");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "What do you like?" }),
    );
    click("Skip");
    click("Space");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "What do you lose an evening to?" }),
    );
    const live = screen.getByText("3 of 5");
    expect(live).toHaveAttribute("aria-live", "polite");
    // The same element announces the next count: it is not re-created with the question.
    click("Skip");
    expect(screen.getByText("4 of 5")).toBe(live);
    // A bank with no steps (this one) counts questions, and the last reads "N of N" — the
    // About-you screen that once made it "N + 1" is gone (Review Focus 1, 10-05-26).
    click("Yes");
    expect(screen.getByText("5 of 5")).toBe(live);
  });

  // ── First Exhibition (bank v2) ────────────────────────────────────────────────────────────
  describe("bank v2", () => {
    const fixture = (id: string) => TEST_BANK.find((q) => q.id === id)!;
    const begin = () => click("Begin");
    /** From the last question's answer to the reveal. */
    async function finishToReveal() {
      await waitFor(() => expect(heading()).toBe("Here’s where we’ll start"));
    }

    it("counts steps, not questions, and skips a step the database cannot ask", () => {
      // Two bank-v2 ids in two different steps (Rooms, Reading): two steps.
      const bank: Question[] = [
        { ...fixture("rooms"), id: "wings-1" },
        { ...fixture("read"), id: "read-1" },
      ];
      show({ bank });
      begin();
      expect(screen.getByText(/^Step 1 of 2/)).toBeInTheDocument();
    });

    it("shows only the top options of a show.top question, ranked by the answers so far", () => {
      const rooms = fixture("rooms");
      const bank: Question[] = [
        rooms,
        { ...rooms, id: "playoff", show: { top: 1 } },
      ];
      show({ bank });
      begin();
      click("A garden");
      // The playoff shows one option: the garden the reader just scored.
      expect(questionId()).toBe("playoff");
      expect(
        screen.getByRole("button", { name: "A garden" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Space" })).toBeNull();
    });

    it("preselects the reading amount from the cards, and sends the taste with the opened cards (Review Focus 3: after Back and a change, the final answers win)", async () => {
      // The fixture's amount question offers two levels; this one offers all four.
      const amount: Question = {
        id: "reading-amount",
        kind: "amount",
        prompt: "How much reading do you want mixed in?",
        options: READING_AMOUNTS.map((a) => ({
          key: a,
          label: READING_LABELS[a],
          effects: [],
          reading: a,
        })),
      };
      const bank: Question[] = [{ ...fixture("read"), id: "read-1" }, amount];
      const faces = {
        "read-1/essay": {
          itemId: "e1",
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
      click(/Long/);
      // One card opened → "a little" preselected on the amount question, and it counts as said.
      expect(
        screen.getByRole("button", { name: READING_LABELS.little }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
      click("Back");
      click(/Short/);
      click("Next");
      await finishToReveal();
      click(/Start exploring/);
      await waitFor(() => expect(completeMock).toHaveBeenCalled());
      const taste = (
        completeMock.mock.calls[0]![0] as {
          taste: { opened: unknown[] };
        }
      ).taste;
      expect(taste.opened).toEqual([
        { itemId: "c1", title: "Short", kind: "curiosity", minutes: 3 },
      ]);
      expect(sent().writingAmount).toBe("little");
    });

    it("does not preselect a level the amount question does not offer", () => {
      // The fixture's amount question has only "none" and "lot"; one opened card means "little".
      const bank: Question[] = [
        { ...fixture("read"), id: "read-1" },
        fixture("reading-amount"),
      ];
      show({
        bank,
        faces: {
          "read-1/essay": {
            itemId: "e1",
            writing: {
              title: "Long",
              dek: "",
              minutes: 14,
              kind: "essay" as const,
              topicIds: [],
            },
          },
        },
      });
      begin();
      click(/Long/);
      expect(questionId()).toBe("reading-amount");
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    });

    // Ben's critique (10-05-26): drop "I'd rather look at pictures" for a plain Skip. Declining
    // is still logged as a skip, which the amount question's preselect reads.
    it("a reading screen's forward button is a plain Skip", () => {
      show({ bank: [{ ...fixture("read"), id: "read-1" }] });
      begin();
      expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "I’d rather look at pictures" }),
      ).toBeNull();
    });
  });
});
