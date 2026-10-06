// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TopicLevels } from "./topic-levels";

// Facets are on the fixture only to prove the list ignores them: since the questionnaire
// (10-02-26) a reader never sees a facet, so the rows are one flat list in label order.
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
];

describe("TopicLevels", () => {
  it("is one flat list in label order, with no facet headings", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["surreal", 0.5],
            ["astronomy", 1],
            ["ceramics", 2],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^(Subject|Medium|Look|Place)$/)).toBeNull();
    // Across what used to be three facet sections: Astronomy, Ceramics, Surreal.
    expect(
      screen.getAllByRole("group").map((el) => el.getAttribute("aria-label")),
    ).toEqual(["Astronomy level", "Ceramics level", "Surreal level"]);

    // Each row is a named group holding the four-way segmented control.
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    const ceramicsRow = screen.getByRole("group", { name: "Ceramics level" });
    const surrealRow = screen.getByRole("group", { name: "Surreal level" });

    for (const row of [astronomyRow, ceramicsRow, surrealRow]) {
      const buttons = within(row).getAllByRole("radio");
      expect(buttons.map((b) => b.textContent)).toEqual([
        "a little",
        "some",
        "a lot",
        "off",
      ]);
    }

    expect(
      within(astronomyRow).getByRole("radio", { name: "some" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(ceramicsRow).getByRole("radio", { name: "a lot" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(surrealRow).getByRole("radio", { name: "a little" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it('gives each row a radiogroup, and a selected "off" the quiet fill', () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", 1]])}
        off={new Set(["botany"])}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("radiogroup", { name: "Level" })).toHaveLength(
      2,
    );
    const botany = screen.getByRole("group", { name: "Botany level" });
    expect(
      within(botany).getByRole("radio", { name: "off" }).className,
    ).toContain("bg-[#2A2A2A]");
    const astronomy = screen.getByRole("group", { name: "Astronomy level" });
    expect(
      within(astronomy).getByRole("radio", { name: "some" }).className,
    ).toContain("bg-ink");
  });

  it("leaves out a pick the topic list does not hold", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["astronomy", 1],
            ["retired-topic", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("calls onLevel for a new level, onOff for off, and neither for the already-checked segment", () => {
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

    fireEvent.click(within(row).getByRole("radio", { name: "a lot" }));
    expect(onLevel).toHaveBeenCalledExactlyOnceWith("astronomy", "lot");
    expect(onOff).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("radio", { name: "off" }));
    expect(onOff).toHaveBeenCalledExactlyOnceWith("astronomy");

    onLevel.mockClear();
    onOff.mockClear();
    // "some" is already checked (weight 1 → levelOf → "some") — Segmented's guard means
    // clicking it fires nothing at all.
    fireEvent.click(within(row).getByRole("radio", { name: "some" }));
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

  it("orders rows by label, not by the order they were picked", () => {
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

  // The questionnaire's reveal keeps a switched-off proposal on screen, so a stray tap on "off"
  // can be taken back without leaving the page.
  it("shows an `off` topic as a row with off checked, and turns it back on through onLevel", () => {
    const onLevel = vi.fn();
    const onOff = vi.fn();
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", 1]])}
        off={new Set(["botany"])}
        onLevel={onLevel}
        onOff={onOff}
      />,
    );
    expect(
      screen.getAllByRole("group").map((el) => el.getAttribute("aria-label")),
    ).toEqual(["Astronomy level", "Botany level"]);
    const row = screen.getByRole("group", { name: "Botany level" });
    expect(within(row).getByRole("radio", { name: "off" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Already off: pressing it again says nothing.
    fireEvent.click(within(row).getByRole("radio", { name: "off" }));
    expect(onOff).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("radio", { name: "a little" }));
    expect(onLevel).toHaveBeenCalledExactlyOnceWith("botany", "little");
  });

  it("with only `off` topics it still lists them rather than saying nothing is picked", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        off={new Set(["botany"])}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(screen.queryByText("Nothing picked yet.")).toBeNull();
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });
});
