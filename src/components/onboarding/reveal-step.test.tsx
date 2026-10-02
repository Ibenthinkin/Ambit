// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  fireEvent.click(within(row(name)).getByRole("button", { name: level }));
const cta = () =>
  screen.getByRole("button", { name: /Start exploring|Keep at least/ });

describe("RevealStep", () => {
  it("opens on the proposal, each topic at its level", () => {
    show();
    expect(
      screen.getByRole("heading", { name: "Here’s where we’ll start" }),
    ).toBeInTheDocument();
    expect(
      within(row("Astronomy")).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(row("Music")).getByRole("button", { name: "a little" }),
    ).toHaveAttribute("aria-pressed", "true");
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
      within(row("Geology")).getByRole("button", { name: "off" }),
    ).toHaveAttribute("aria-pressed", "true");
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
});
