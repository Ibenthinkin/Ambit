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

function show(over: Partial<Parameters<typeof OnboardingScreen>[0]> = {}) {
  return render(
    <OnboardingScreen
      topics={TOPICS}
      faces={{}}
      retake={false}
      bank={TEST_BANK}
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
  about?: { ageRange: string | null; location: string; gender: string };
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

  it("every question can be skipped; the reveal then proposes the starters, and saving goes to the feed", async () => {
    show();
    click("Begin");
    skipAll();
    // The optional step, skipped like everything else.
    expect(heading()).toBe("A little about you");
    click("Skip");
    expect(heading()).toBe("Here’s where we’ll start");
    expect(
      screen.getAllByRole("group").map((g) => g.getAttribute("data-topic")),
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
    expect(sent().answers.map((a) => a.keys)).toEqual(
      TEST_BANK.map(() => [SKIP]),
    );
    expect(sent().writingAmount).toBeNull();
    expect(sent().about).toBeUndefined();
    // Nothing was typed, so no model was asked.
    expect(interpretMock).not.toHaveBeenCalled();
    // Everything the old picks fed is stale now.
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("writes nothing until the reveal's button", () => {
    show();
    click("Begin");
    skipAll();
    click("Skip");
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
    await waitFor(() => expect(heading()).toBe("A little about you"));
    expect(interpretMock).toHaveBeenCalledExactlyOnceWith({
      texts: [{ questionId: "words", text: "cookbooks" }],
    });

    click("Skip");
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
    await waitFor(() => expect(heading()).toBe("A little about you"));
    click("Skip");
    expect(heading()).toBe("Here’s where we’ll start");
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

  it("About you: Continue sends what was given; Back from the reveal returns to it", async () => {
    show();
    click("Begin");
    skipAll();
    click("35–44");
    click("Continue");
    click("Back");
    expect(screen.getByRole("button", { name: "35–44" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    click("Continue");
    click("Start exploring");
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    expect(sent().about).toEqual({
      ageRange: "35–44",
      location: "",
      gender: "",
    });
  });

  it("a save that fails shows the error and stays put", async () => {
    completeMock.mockRejectedValue(new Error("boom"));
    show();
    click("Begin");
    skipAll();
    click("Skip");
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
    click("Skip");
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
});
