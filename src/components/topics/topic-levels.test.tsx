// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TopicLevels } from "./topic-levels";

// Same real-topic fixture as group-picker.test.tsx / onboarding-screen.test.tsx
// (docs/DESIGN_onboarding-interview.md §1 re-cut, 09-28-26).
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
];

describe("TopicLevels", () => {
  it("groups rows under facet eyebrows in FACETS order, skipping empty facets", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["astronomy", 1],
            ["ceramics", 2],
            ["surreal", 0.5],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );

    // Three facet eyebrows, in FACETS order — no "Place" eyebrow since japan isn't picked.
    expect(
      screen
        .getAllByText(/^(Subject|Medium|Look|Place)$/)
        .map((el) => el.textContent),
    ).toEqual(["Subject", "Medium", "Look"]);

    // Each row is a named group holding the four-way segmented control.
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    const ceramicsRow = screen.getByRole("group", { name: "Ceramics level" });
    const surrealRow = screen.getByRole("group", { name: "Surreal level" });

    for (const row of [astronomyRow, ceramicsRow, surrealRow]) {
      const buttons = within(row).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual([
        "a little",
        "some",
        "a lot",
        "off",
      ]);
    }

    expect(
      within(astronomyRow).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(ceramicsRow).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(surrealRow).getByRole("button", { name: "a little" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onLevel for a new level, onOff for off, and neither for the already-pressed segment", () => {
    const onLevel = vi.fn();
    const onOff = vi.fn();
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", 1]])}
        onLevel={onLevel}
        onOff={onOff}
      />,
    );
    const row = screen.getByRole("group", { name: "Astronomy level" });

    fireEvent.click(within(row).getByRole("button", { name: "a lot" }));
    expect(onLevel).toHaveBeenCalledExactlyOnceWith("astronomy", "lot");
    expect(onOff).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "off" }));
    expect(onOff).toHaveBeenCalledExactlyOnceWith("astronomy");

    onLevel.mockClear();
    onOff.mockClear();
    // "some" is already pressed (weight 1 → levelOf → "some") — Segmented's guard means
    // clicking it fires nothing at all.
    fireEvent.click(within(row).getByRole("button", { name: "some" }));
    expect(onLevel).not.toHaveBeenCalled();
    expect(onOff).not.toHaveBeenCalled();
  });

  it("marks a suggested topic and leaves the others unmarked", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["astronomy", 1],
            ["ceramics", 2],
          ])
        }
        suggested={new Set(["ceramics"])}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    const ceramicsRow = screen.getByRole("group", { name: "Ceramics level" });

    expect(within(ceramicsRow).getByText("suggested")).toBeInTheDocument();
    expect(within(astronomyRow).queryByText("suggested")).toBeNull();
  });

  it("renders a fallback and no groups when nothing is picked", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.getByText("Nothing picked yet.")).toBeInTheDocument();
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });

  it("orders rows within a facet by label", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["moon", 1],
            ["astronomy", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    const subjectGroups = screen
      .getAllByRole("group")
      .map((el) => el.getAttribute("aria-label"));
    expect(subjectGroups).toEqual(["Astronomy level", "Moon level"]);
  });
});
