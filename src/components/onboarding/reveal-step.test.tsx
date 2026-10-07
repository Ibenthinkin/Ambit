// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { exploreOneIn } from "~/lib/interview/explore-share";
import { buildTaste } from "~/lib/interview/taste";
import { DEFAULT_KNOBS } from "~/server/services/feed-knobs";

import { RevealStep } from "./reveal-step";

const TOPICS = [
  { id: "astronomy", label: "Astronomy" },
  { id: "botany", label: "Botany" },
  { id: "music", label: "Music" },
  { id: "geology", label: "Geology" },
];
const PROPOSED = [
  { topicId: "astronomy", weight: 2 },
  { topicId: "botany", weight: 1 },
  { topicId: "music", weight: 0.5 },
  { topicId: "geology", weight: 1 },
];

function show(over: Partial<Parameters<typeof RevealStep>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <RevealStep
      topics={TOPICS}
      proposed={PROPOSED}
      retake={false}
      submitting={false}
      error=""
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return { onSubmit };
}
const row = (name: string) =>
  screen.getByRole("group", { name: `${name} level` });
const press = (name: string, level: string) =>
  fireEvent.click(within(row(name)).getByRole("radio", { name: level }));
const cta = () =>
  screen.getByRole("button", { name: /Open my feed|Keep at least/ });

describe("RevealStep", () => {
  it("opens on the proposal, each topic at its level", () => {
    show();
    expect(
      screen.getByRole("heading", { level: 1, name: "Your mix" }),
    ).toBeInTheDocument();
    expect(
      within(row("Astronomy")).getByRole("radio", { name: "a lot" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(row("Music")).getByRole("radio", { name: "a little" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("submits exactly what it shows: edited levels in, switched-off topics out", () => {
    const { onSubmit } = show();
    press("Botany", "a lot");
    press("Geology", "off");
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      [
        { topicId: "astronomy", weight: 2 },
        { topicId: "botany", weight: 2 },
        { topicId: "music", weight: 0.5 },
      ],
      "some",
    );
  });

  it("keeps a switched-off topic on the page, and lets it back in", () => {
    const { onSubmit } = show();
    press("Geology", "off");
    expect(
      within(row("Geology")).getByRole("radio", { name: "off" }),
    ).toHaveAttribute("aria-checked", "true");
    press("Geology", "some");
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0]![0]).toHaveLength(4);
  });

  it("needs three: with fewer the button says so and does nothing", () => {
    const { onSubmit } = show();
    press("Geology", "off");
    press("Music", "off");
    expect(cta()).toHaveTextContent("Keep at least three");
    expect(cta()).toBeDisabled();
    fireEvent.click(cta());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("on a first run says nothing about replacing, and offers no Cancel", () => {
    show();
    expect(screen.queryByText(/replaces your current topics/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Cancel" })).toBeNull();
  });

  it("on a retake says it replaces the current topics, with a Cancel link back to them", () => {
    show({ retake: true });
    expect(
      screen.getByText(/This replaces your current topics/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/profile/topics",
    );
  });

  it("shows an error as an alert and a submit in flight as busy, ignoring a second press", () => {
    const { onSubmit } = show({ error: "Try again.", submitting: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
    expect(cta()).toHaveAttribute("aria-busy", "true");
    fireEvent.click(cta());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Back is the onboarding shell's link now, and the step bar is gone: the reveal's button and
  // its error sit in the flow, inside the rising body — nothing `fixed` for <Rise> to capture.
  it("has no Back of its own and no fixed bar: the button sits under the levels", () => {
    show({ error: "Try again." });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    const reveal = document.querySelector('[data-step="reveal"]')!;
    expect(reveal).toContainElement(cta());
    expect(reveal).toContainElement(screen.getByRole("alert"));
    expect(document.querySelector(".fixed")).toBeNull();
  });

  it("shows the exhibition title above the mix", () => {
    const empty = buildTaste({
      scores: new Map(),
      listed: new Set(),
      destinations: [],
      opened: [],
      hang: [],
    });
    show({
      taste: { ...empty, title: { adjective: "Quiet", noun: "Weathers" } },
    });
    // The title is the page's heading; "Your mix" steps down under it.
    const title = screen.getByRole("heading", {
      level: 1,
      name: "Quiet Weathers",
    });
    const start = screen.getByRole("heading", { level: 2, name: "Your mix" });
    expect(
      title.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("re-seeds when the proposal changes under it, keeping what was set by hand", () => {
    // What Allow will do (lib/interview/kept-out.ts): the answers change, the proposal is
    // computed again, and the reveal is still on screen.
    const onSubmit = vi.fn();
    const props = {
      topics: TOPICS,
      retake: false,
      submitting: false,
      error: "",
      onSubmit,
    };
    const { rerender } = render(<RevealStep {...props} proposed={PROPOSED} />);
    press("Botany", "a lot");
    press("Music", "off");
    rerender(
      <RevealStep
        {...props}
        proposed={[
          { topicId: "geology", weight: 2 }, // untouched: follows the new proposal
          { topicId: "astronomy", weight: 2 },
          { topicId: "botany", weight: 0.5 }, // touched: stays "a lot"
          { topicId: "music", weight: 1 }, // touched: stays off
        ]}
      />,
    );
    expect(
      within(row("Geology")).getByRole("radio", { name: "a lot" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(row("Music")).getByRole("radio", { name: "off" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      [
        { topicId: "geology", weight: 2 },
        { topicId: "astronomy", weight: 2 },
        { topicId: "botany", weight: 2 },
      ],
      "some",
    );
  });

  it("does not re-seed for an equal proposal in a new array", () => {
    const { onSubmit } = show();
    press("Geology", "off");
    // `show` rendered once; a parent re-render with a fresh-but-equal list must change nothing.
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0]![0]).toHaveLength(3);
  });

  it("shows no exhibition without a taste — the v1 reveal", () => {
    show();
    expect(screen.queryByText("Your first exhibition")).toBeNull();
  });

  // ── The redesign's reveal (DESIGN_redesign §5.3) ──────────────────────────────────────────

  it("groups the mix under facet headings, and tags the rows Ambit added itself", () => {
    show({
      topics: [
        { id: "astronomy", label: "Astronomy", facet: "subject" },
        { id: "botany", label: "Botany", facet: "subject" },
        { id: "music", label: "Music", facet: "subject" },
        { id: "geology", label: "Engraving", facet: "medium" },
      ],
      starters: new Set(["music"]),
    });
    // No taste, so "Your mix" is the h1 and the facet headers sit one level under it.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your mix",
    );
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(
      expect.arrayContaining(["Subjects", "Mediums & traditions"]),
    );
    expect(within(row("Music")).getByText("Proposed")).toBeInTheDocument();
    expect(within(row("Astronomy")).queryByText("Proposed")).toBeNull();
  });

  it("asks how much reading, opening on the default it is given, and sends what it shows", () => {
    const { onSubmit } = show({ readingDefault: "little" });
    const reading = screen.getByRole("radiogroup", {
      name: "How much writing in the feed",
    });
    expect(
      within(reading).getByRole("radio", { name: "A little" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(reading).getByRole("radio", { name: "None" }));
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0]![1]).toBe("none");
  });

  it("opens the Reading row on Some when it is given nothing", () => {
    const { onSubmit } = show();
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0]![1]).toBe("some");
  });

  it("lists what was kept out, each with an Allow; nothing kept out, no section", () => {
    const onAllow = vi.fn();
    const { unmount } = render(
      <RevealStep
        topics={TOPICS}
        proposed={PROPOSED}
        keptOut={[
          { key: "horror", label: "Horror" },
          { key: "war", label: "War" },
        ]}
        onAllow={onAllow}
        retake={false}
        submitting={false}
        error=""
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Kept out" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow War" }));
    expect(onAllow).toHaveBeenCalledExactlyOnceWith("war");
    unmount();
    show();
    expect(screen.queryByRole("heading", { name: "Kept out" })).toBeNull();
  });

  it("says how much of the feed comes from outside the mix, from the feed's own knobs", () => {
    show();
    expect(
      screen.getByText(
        `About one post in ${exploreOneIn(DEFAULT_KNOBS)} comes from outside this mix, so the feed keeps learning from what you save.`,
      ),
    ).toBeInTheDocument();
  });

  it("offers Start over beside Open my feed", () => {
    const onRestart = vi.fn();
    show({ onRestart });
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("hangs the pictures it is given, captioned by number and title; none given, none hung", () => {
    const taste = buildTaste({
      scores: new Map(),
      listed: new Set(),
      destinations: [],
      opened: [],
      hang: ["a", "b"],
    });
    const { unmount } = render(
      <RevealStep
        topics={TOPICS}
        proposed={PROPOSED}
        taste={taste}
        hang={[
          { itemId: "a", src: "/api/img/a?w=960", title: "A wave" },
          { itemId: "b", src: "/api/img/b?w=960", title: "A tide table" },
        ]}
        retake={false}
        submitting={false}
        error=""
        onSubmit={vi.fn()}
      />,
    );
    const hung = screen.getByRole("list", { name: "Hung pictures" });
    expect(within(hung).getByText("01 · A wave")).toBeInTheDocument();
    expect(within(hung).getByText("02 · A tide table")).toBeInTheDocument();
    expect(hung.querySelectorAll("img")[0]).toHaveAttribute(
      "src",
      "/api/img/a?w=960",
    );
    unmount();
    show({ taste });
    expect(screen.queryByRole("list", { name: "Hung pictures" })).toBeNull();
  });

  it("never skips a heading level: the title's h1, then h2s, then h3s under them", () => {
    show({
      topics: TOPICS.map((t) => ({ ...t, facet: "subject" as const })),
      taste: {
        ...buildTaste({
          scores: new Map(),
          listed: new Set(),
          destinations: [],
          opened: [
            { itemId: "a", title: "A tide table", kind: "archive", minutes: 3 },
          ],
          hang: [],
        }),
        compass: { wild: 0.5, old: 0, still: 0, far: 0 },
      },
      keptOut: [{ key: "horror", label: "Horror" }],
    });
    const levels = screen
      .getAllByRole("heading")
      .map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
    // The exhibition's sections are h2s under the title.
    for (const name of ["Temperament", "Travel compass", "You’d open"]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
  });
});
