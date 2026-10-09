// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemSheet } from "./item-sheet";

// The tile sheet's More-or-less rows (docs/DESIGN_more-or-less.md D6, "Tile sheet"). The sheet's
// older behaviour — Closer Look, Share, the collection rows — is sheets.test.tsx's.

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: {
        collections: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        count: { invalidate: vi.fn() },
      },
    }),
    saves: {
      collections: { useQuery: () => ({ data: [], isLoading: false }) },
      createCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      saveToCollection: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ITEM = { id: "item-9", title: "Study of a Heron", topicId: "botany" };

const renderSheet = (
  props: Partial<React.ComponentProps<typeof ItemSheet>> = {},
) => {
  const onClose = vi.fn();
  const onFeedback = vi.fn();
  render(
    <ItemSheet
      open
      onClose={onClose}
      item={ITEM}
      onSaved={vi.fn()}
      onError={vi.fn()}
      appUrl="https://ambit.test"
      onToast={vi.fn()}
      marked={null}
      onFeedback={onFeedback}
      {...props}
    />,
  );
  return { onClose, onFeedback };
};

const labels = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("ItemSheet — More or less rows", () => {
  it("puts Less of this, then More of this, straight after Share", () => {
    renderSheet();
    const all = labels();
    const share = all.indexOf("Share");
    expect(all.slice(share, share + 3)).toEqual([
      "Share",
      "Less of this",
      "More of this",
    ]);
  });

  it("a row closes the sheet and hands the verdict to the screen", () => {
    const { onClose, onFeedback } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "More of this" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onFeedback).toHaveBeenCalledWith("more");
  });

  it("unmarked rows are not pressed and carry no trailing note", () => {
    renderSheet();
    const less = screen.getByRole("button", { name: "Less of this" });
    expect(less).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("On · tap to undo")).toBeNull();
  });

  it("a marked row is pressed, draws its glyph in an ink square and says how to undo", () => {
    renderSheet({ marked: "more" });
    const more = screen.getByRole("button", { name: "More of this" });
    expect(more).toHaveAttribute("aria-pressed", "true");
    expect(within(more).getByText("On · tap to undo")).toBeInTheDocument();
    // The hover form: "Undo", shown in place of the note on a pointer that hovers.
    expect(within(more).getByText("Undo")).toHaveClass(
      "hidden",
      "group-hover:inline",
    );
    const square = more.querySelector("svg")!.parentElement!;
    expect(square).toHaveClass("bg-ink", "text-on-accent", "size-6");
    // Only the marked row.
    expect(
      screen.getByRole("button", { name: "Less of this" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("tapping the marked row hands the same verdict back — the screen clears it", () => {
    const { onFeedback } = renderSheet({ marked: "less" });
    fireEvent.click(screen.getByRole("button", { name: "Less of this" }));
    expect(onFeedback).toHaveBeenCalledWith("less");
  });
});
