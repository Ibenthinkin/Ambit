// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TopicLevels } from "./topic-levels";

// Every facet the vocabulary has, so the five headings of DESIGN_redesign §5.3 item 6 can each be
// proved: `medium` and `tradition` share one heading, `form` is "Writing".
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "ukiyo-e", label: "Ukiyo-e", facet: "tradition" as const },
  { id: "bauhaus", label: "Bauhaus", facet: "tradition" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
  { id: "essays", label: "Essays", facet: "form" as const },
];

/** The facet headings on screen, top to bottom. */
const headings = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

/** The row names under one heading, in the order drawn. */
const rowsUnder = (heading: string) => {
  const h = screen.getByRole("heading", { level: 3, name: heading });
  const block = h.closest<HTMLElement>("[data-facet-group]")!;
  return within(block)
    .getAllByRole("group")
    .map((g) => g.getAttribute("aria-label"));
};

describe("TopicLevels", () => {
  it("files each row under its facet heading — medium and tradition together, form as Writing", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["surreal", 0.5],
            ["astronomy", 1],
            ["ceramics", 2],
            ["ukiyo-e", 1],
            ["japan", 1],
            ["essays", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );

    expect(headings()).toEqual([
      "Subjects",
      "Mediums & traditions",
      "Looks",
      "Places",
      "Writing",
    ]);
    expect(rowsUnder("Subjects")).toEqual(["Astronomy level"]);
    expect(rowsUnder("Mediums & traditions")).toEqual([
      "Ceramics level",
      "Ukiyo-e level",
    ]);
    expect(rowsUnder("Looks")).toEqual(["Surreal level"]);
    expect(rowsUnder("Places")).toEqual(["Japan level"]);
    expect(rowsUnder("Writing")).toEqual(["Essays level"]);

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

  it("renders no heading for a facet with no row", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["astronomy", 1],
            ["japan", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(headings()).toEqual(["Subjects", "Places"]);
    expect(screen.queryByText("Looks")).toBeNull();
    expect(screen.queryByText("Writing")).toBeNull();
  });

  it("keeps label order inside a group, across the two facets a heading shares", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["ukiyo-e", 1],
            ["moon", 1],
            ["ceramics", 1],
            ["astronomy", 1],
            ["bauhaus", 1],
            ["botany", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(rowsUnder("Subjects")).toEqual([
      "Astronomy level",
      "Botany level",
      "Moon level",
    ]);
    expect(rowsUnder("Mediums & traditions")).toEqual([
      "Bauhaus level",
      "Ceramics level",
      "Ukiyo-e level",
    ]);
  });

  it("still lists a topic with no facet, last and under no heading", () => {
    render(
      <TopicLevels
        topics={[
          ...FIXTURE_TOPICS,
          { id: "odd", label: "Aardvark", facet: null },
        ]}
        picks={
          new Map([
            ["odd", 1],
            ["astronomy", 1],
          ])
        }
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    expect(headings()).toEqual(["Subjects"]);
    expect(
      screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Astronomy level", "Aardvark level"]);
  });

  it("draws a row under a hairline, its name block left of the control", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", 1]])}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    const row = screen.getByRole("group", { name: "Astronomy level" });
    expect(row.className).toContain("border-b");
    expect(row.className).toContain("border-ink/8");
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

  it("marks a proposed topic with the tag above its name, and leaves the others unmarked", () => {
    render(
      <TopicLevels
        topics={FIXTURE_TOPICS}
        picks={
          new Map([
            ["astronomy", 1],
            ["ceramics", 2],
          ])
        }
        proposed={new Set(["ceramics"])}
        onLevel={vi.fn()}
        onOff={vi.fn()}
      />,
    );
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    const ceramicsRow = screen.getByRole("group", { name: "Ceramics level" });

    const tag = within(ceramicsRow).getByText("Proposed");
    expect(tag.className).toContain("text-accent");
    // Above the name: its own line, and before the name in the document.
    expect(tag.className).toContain("block");
    const name = within(ceramicsRow).getByText("Ceramics");
    expect(
      tag.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(astronomyRow).queryByText("Proposed")).toBeNull();
    expect(screen.queryByText(/suggested/i)).toBeNull();
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
    expect(rowsUnder("Subjects")).toEqual(["Astronomy level", "Moon level"]);
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
