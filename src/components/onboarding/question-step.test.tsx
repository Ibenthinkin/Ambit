// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { askable } from "~/lib/interview/askable";
import { EITHER, NEITHER } from "~/lib/interview/config";
import { TEST_BANK, WIDE } from "~/lib/interview/fixtures";
import { READING_FALLBACK } from "~/lib/interview/reading-fallback";
import type { Answer, Question } from "~/lib/interview/types";

import { QuestionStep } from "./question-step";

const BANK = askable(TEST_BANK, WIDE);
const q = (id: string) => BANK.find((x) => x.id === id)!;

function show(id: string, answer?: Answer, faces = {}) {
  const onChange = vi.fn();
  const view = render(
    <QuestionStep
      question={q(id)}
      listed={WIDE}
      faces={faces}
      answer={answer}
      onChange={onChange}
    />,
  );
  return { onChange, ...view };
}

describe("QuestionStep", () => {
  it("names the question for the e2e helper and shows its prompt as the heading", () => {
    const { container } = show("evening");
    expect(container.querySelector("[data-question-id]")).toHaveAttribute(
      "data-question-id",
      "evening",
    );
    expect(
      screen.getByRole("heading", { name: "What do you lose an evening to?" }),
    ).toBeInTheDocument();
  });

  describe("a pair", () => {
    it("shows two cards with their faces, plus Either and Neither", () => {
      show("space-or-garden", undefined, {
        "space-or-garden/space": { itemId: "a1", src: "/api/img/a1?w=960" },
      });
      const space = screen.getByRole("button", { name: "Space" });
      expect(space.querySelector("img")).toHaveAttribute(
        "src",
        "/api/img/a1?w=960",
      );
      // The garden has no face in this fixture: a text card.
      expect(
        screen.getByRole("button", { name: "A garden" }).querySelector("img"),
      ).toBeNull();
      expect(space).toHaveAttribute(
        "data-topics",
        "astronomy moon alien robot",
      );
      expect(
        screen.getByRole("button", { name: "Either" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Neither" }),
      ).toBeInTheDocument();
    });

    it("answers with the side pressed, and is done in one tap", () => {
      const { onChange } = show("space-or-garden");
      fireEvent.click(screen.getByRole("button", { name: "A garden" }));
      expect(onChange).toHaveBeenCalledWith(
        { questionId: "space-or-garden", keys: ["garden"] },
        true,
      );
    });

    it("answers Either and Neither with their sentinels", () => {
      const { onChange } = show("space-or-garden");
      fireEvent.click(screen.getByRole("button", { name: "Either" }));
      fireEvent.click(screen.getByRole("button", { name: "Neither" }));
      expect(onChange.mock.calls.map((c) => (c[0] as Answer).keys)).toEqual([
        [EITHER],
        [NEITHER],
      ]);
    });

    it("shows a returning answer as pressed", () => {
      show("space-or-garden", {
        questionId: "space-or-garden",
        keys: [EITHER],
      });
      expect(screen.getByRole("button", { name: "Either" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Space" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("a multi", () => {
    it("toggles answers on and off without finishing the question", () => {
      const { onChange } = show("evening", {
        questionId: "evening",
        keys: ["music"],
      });
      fireEvent.click(screen.getByRole("button", { name: "Books" }));
      expect(onChange).toHaveBeenLastCalledWith(
        { questionId: "evening", keys: ["music", "books"] },
        false,
      );
      fireEvent.click(screen.getByRole("button", { name: "Music" }));
      expect(onChange).toHaveBeenLastCalledWith(
        { questionId: "evening", keys: [] },
        false,
      );
    });

    it("at its limit, a new answer replaces the earliest one", () => {
      const { onChange } = show("evening", {
        questionId: "evening",
        keys: ["music", "books"],
      });
      expect(screen.getByText(/up to two/i)).toBeInTheDocument();
      // The limit is on the step for the e2e helper, which must not over-press.
      expect(document.querySelector("[data-question-id]")).toHaveAttribute(
        "data-max",
        "2",
      );
      fireEvent.click(screen.getByRole("button", { name: "Food" }));
      expect(onChange).toHaveBeenLastCalledWith(
        { questionId: "evening", keys: ["books", "food"] },
        false,
      );
    });

    it("puts on each answer the topics it would add", () => {
      show("evening");
      expect(screen.getByRole("button", { name: "Books" })).toHaveAttribute(
        "data-topics",
        "books literature poetry",
      );
    });
  });

  it("a choice answers with one key and is done; an only-subtracting answer adds no topics", () => {
    const { onChange } = show("unsettle");
    const no = screen.getByRole("button", { name: "Not really" });
    expect(no).toHaveAttribute("data-topics", "");
    fireEvent.click(no);
    expect(onChange).toHaveBeenCalledWith(
      { questionId: "unsettle", keys: ["no"] },
      true,
    );
  });

  it("the amount question answers with the level's key and is done", () => {
    const { onChange } = show("reading-amount");
    fireEvent.click(screen.getByRole("button", { name: "A lot" }));
    expect(onChange).toHaveBeenCalledWith(
      { questionId: "reading-amount", keys: ["lot"] },
      true,
    );
  });

  describe("a text question", () => {
    it("is a labelled box holding what was typed, capped at 500 characters", () => {
      show("words", { questionId: "words", keys: [], text: "old maps" });
      const box = screen.getByRole("textbox", { name: "What do you like?" });
      expect(box).toHaveValue("old maps");
      expect(box).toHaveAttribute("maxlength", "500");
    });

    it("reports each edit as text, never finishing the question by itself", () => {
      const { onChange } = show("words");
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Borges" },
      });
      expect(onChange).toHaveBeenCalledWith(
        { questionId: "words", keys: [], text: "Borges" },
        false,
      );
    });

    it("says plainly where the words go", () => {
      show("words");
      expect(
        screen.getByText(/as much or as little as you like/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/OpenRouter/)).toBeInTheDocument();
    });
  });

  describe("a choice whose options all have faces", () => {
    it("renders face cards in a grid, and None of these as the NEITHER answer", () => {
      const { onChange } = show("rooms", undefined, {
        "rooms/space": { itemId: "s1", src: "/api/img/s1?w=960" },
      });
      expect(
        screen.getByRole("button", { name: "Space" }).querySelector("img"),
      ).toHaveAttribute("src", "/api/img/s1?w=960");
      fireEvent.click(screen.getByRole("button", { name: "None of these" }));
      expect(onChange).toHaveBeenCalledWith(
        { questionId: "rooms", keys: [NEITHER] },
        true,
      );
    });

    it("prints no caption over a wing picture (the label stays the name)", () => {
      show("rooms", undefined, {
        "rooms/space": { itemId: "s1", src: "/api/img/s1?w=960" },
      });
      expect(
        screen.getByRole("button", { name: "Space" }),
      ).not.toHaveTextContent("Space");
    });
  });

  describe("a reading question", () => {
    it("renders article cards and puts the face's memberships on the answer", () => {
      const { onChange } = show("read", undefined, {
        "read/essay": {
          itemId: "e1",
          writing: {
            title: "The case for boring buildings",
            dek: "An architect argues.",
            minutes: 18,
            kind: "essay",
            topicIds: ["architecture"],
          },
        },
      });
      const card = screen.getByRole("button", {
        name: /The case for boring buildings/,
      });
      // Upper-cased by CSS (`uppercase`), which jsdom does not apply — so match either case.
      expect(card).toHaveTextContent(/essay · 18 min/i);
      fireEvent.click(card);
      expect(onChange).toHaveBeenCalledWith(
        { questionId: "read", keys: ["essay"], topicIds: ["architecture"] },
        true,
      );
      // No face for curiosity: a text card named by its kind, and no memberships.
      fireEvent.click(screen.getByRole("button", { name: "Curiosity" }));
      expect(onChange).toHaveBeenLastCalledWith(
        { questionId: "read", keys: ["curiosity"] },
        true,
      );
    });
    it("a card with no article shows the kind and an example headline, never a bare kind name", () => {
      show("read");
      const card = screen.getByRole("button", { name: "Curiosity" });
      expect(card).toHaveTextContent("Curiosity");
      expect(card).toHaveTextContent(READING_FALLBACK.curiosity[0].title);
      expect(card.querySelector("img")).toBeNull();
    });
    it("has no None of these — declining is the Skip button, owned by the screen", () => {
      show("read");
      expect(
        screen.queryByRole("button", { name: "None of these" }),
      ).toBeNull();
    });
  });

  it("renders a destination as a typeset card", () => {
    const q: Question = {
      id: "destinations",
      kind: "multi",
      max: 3,
      prompt: "Where?",
      options: [
        {
          key: "kyoto",
          label: "Kyoto in the rain",
          card: { where: "Japan", line: "Moss gardens." },
          effects: [{ topics: ["botany"], score: 1.5 }],
        },
      ],
    };
    render(
      <QuestionStep
        question={q}
        listed={WIDE}
        faces={{}}
        answer={undefined}
        onChange={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Kyoto in the rain" });
    expect(card).toHaveTextContent("Japan");
    expect(card).toHaveTextContent("Moss gardens.");
    expect(card).toHaveAttribute("data-topics", "botany");
  });
});
