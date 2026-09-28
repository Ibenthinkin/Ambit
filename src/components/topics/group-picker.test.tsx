// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { weightOf } from "~/server/config/topic-levels";

import { GroupPicker } from "./group-picker";

// Same real-topic fixture as onboarding-screen.test.tsx (docs/DESIGN_onboarding-interview.md §1
// re-cut, 09-28-26): astronomy+moon fold into the two-member "Space" group, botany is the
// one-member "Plants" group, and one topic per other facet so a made-up id never lands nowhere.
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
];

describe("GroupPicker", () => {
  it("shows only its facet's group chips, in config order", () => {
    const onChange = vi.fn();
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={onChange}
      />,
    );
    const groupsRow = screen.getByRole("group", { name: "Subject groups" });
    // Chips carry `aria-pressed`; the disclosure button does not (it isn't a pick) — filter to
    // just the chips, the same way onboarding-screen.test.tsx's `chips()` helper does.
    const chipNames = within(groupsRow)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"))
      .map((b) => b.textContent);
    expect(chipNames).toEqual(["Space", "Plants"]);
  });

  it("gives a multi-member group a disclosure and a singleton none", () => {
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={vi.fn()}
      />,
    );
    const disclosure = screen.getByRole("button", {
      name: "Show 2 topics in Space",
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /topics in Plants/ }),
    ).toBeNull();
  });

  it("keeps the disclosure's hairline border and colours it when open", () => {
    // Regression pin for the bare `border` + `border-hairline` conflict: the repo's `cn()`
    // (tailwind-merge, src/lib/utils.ts) puts both in the same border-width group, so the LAST
    // one wins — a bare `border` after `border-hairline` silently drops the hairline width. The
    // disclosure must carry `border-hairline` + a color modifier (`border-ink/12`, or
    // `border-accent` when open) and never a bare `border` token.
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={vi.fn()}
      />,
    );
    const disclosure = screen.getByRole("button", {
      name: "Show 2 topics in Space",
    });
    expect(disclosure).toHaveClass("border-hairline", "border-ink/12");
    expect(disclosure.className.split(/\s+/)).not.toContain("border");

    fireEvent.click(disclosure);
    const opened = screen.getByRole("button", {
      name: "Hide topics in Space",
    });
    expect(opened).toHaveClass(
      "border-hairline",
      "bg-accent/10",
      "border-accent",
    );
    expect(opened.className.split(/\s+/)).not.toContain("border");
  });

  it("clicking an unpicked group chip adds every member at 'some'", () => {
    const onChange = vi.fn();
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Space" }));
    expect(onChange).toHaveBeenCalledWith(
      new Map([
        ["astronomy", weightOf("some")],
        ["moon", weightOf("some")],
      ]),
    );
  });

  it("reads a mixed group's count and completes it on tap", () => {
    const onChange = vi.fn();
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", weightOf("some")]])}
        onChange={onChange}
      />,
    );
    const chip = screen.getByRole("button", { name: "Space · 1 of 2" });
    expect(chip).toHaveAttribute("aria-pressed", "mixed");
    fireEvent.click(chip);
    const written = onChange.mock.calls[0]![0] as Map<string, number>;
    expect(written.has("astronomy")).toBe(true);
    expect(written.has("moon")).toBe(true);
  });

  it("opens the disclosure to show member chips and toggles a member", () => {
    const onChange = vi.fn();
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map([["astronomy", weightOf("some")]])}
        onChange={onChange}
      />,
    );
    const disclosure = screen.getByRole("button", {
      name: "Show 2 topics in Space",
    });
    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Hide topics in Space" }),
    ).toBeTruthy();

    const memberRow = screen.getByRole("group", { name: "Space topics" });
    const memberChips = within(memberRow).getAllByRole("button");
    expect(memberChips.map((b) => b.textContent)).toEqual([
      "Astronomy",
      "Moon",
    ]);
    expect(memberChips[0]).toHaveAttribute("aria-pressed", "true");

    // Clicking the absent member (Moon) adds it at "lot" beside astronomy's existing weight.
    fireEvent.click(within(memberRow).getByRole("button", { name: "Moon" }));
    expect(onChange).toHaveBeenLastCalledWith(
      new Map([
        ["astronomy", weightOf("some")],
        ["moon", weightOf("lot")],
      ]),
    );

    // Clicking the present member (Astronomy) removes it.
    fireEvent.click(
      within(memberRow).getByRole("button", { name: "Astronomy" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(new Map());
  });

  it("hides the member row again on a second disclosure click, leaving Plants untouched", () => {
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={vi.fn()}
      />,
    );
    const disclosure = screen.getByRole("button", {
      name: "Show 2 topics in Space",
    });
    fireEvent.click(disclosure);
    expect(screen.getByRole("group", { name: "Space topics" })).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Hide topics in Space" }),
    );
    expect(screen.queryByRole("group", { name: "Space topics" })).toBeNull();

    // Plants never had a disclosure and is unaffected throughout.
    expect(
      screen.queryByRole("button", { name: /topics in Plants/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Plants" })).toBeTruthy();
  });

  it("shows the group chip unpressed and uncounted when nothing is picked", () => {
    render(
      <GroupPicker
        facet="subject"
        topics={FIXTURE_TOPICS}
        picks={new Map()}
        onChange={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: "Space" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.textContent).toBe("Space");
  });
});
