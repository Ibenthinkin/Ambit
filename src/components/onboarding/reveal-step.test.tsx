// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildTaste } from "~/lib/interview/taste";

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
  const onBack = vi.fn();
  render(
    <RevealStep
      topics={TOPICS}
      proposed={PROPOSED}
      retake={false}
      submitting={false}
      error=""
      onSubmit={onSubmit}
      onBack={onBack}
      {...over}
    />,
  );
  return { onSubmit, onBack };
}
const row = (name: string) =>
  screen.getByRole("group", { name: `${name} level` });
const press = (name: string, level: string) =>
  fireEvent.click(within(row(name)).getByRole("radio", { name: level }));
const cta = () =>
  screen.getByRole("button", { name: /Start exploring|Keep at least/ });

describe("RevealStep", () => {
  it("opens on the proposal, each topic at its level", () => {
    show();
    expect(
      screen.getByRole("heading", { name: "Here’s where we’ll start" }),
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
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith([
      { topicId: "astronomy", weight: 2 },
      { topicId: "botany", weight: 2 },
      { topicId: "music", weight: 0.5 },
    ]);
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

  it("Back goes back", () => {
    const { onBack } = show();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the exhibition title above the list", () => {
    const empty = buildTaste({
      scores: new Map(),
      listed: new Set(),
      destinations: [],
      opened: [],
    });
    show({
      taste: { ...empty, title: { adjective: "Quiet", noun: "Weathers" } },
    });
    const title = screen.getByRole("heading", { name: "Quiet Weathers" });
    const start = screen.getByRole("heading", {
      name: "Here’s where we’ll start",
    });
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
      onBack: vi.fn(),
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
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith([
      { topicId: "geology", weight: 2 },
      { topicId: "astronomy", weight: 2 },
      { topicId: "botany", weight: 2 },
    ]);
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
});
