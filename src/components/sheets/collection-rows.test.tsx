// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionRow, NewCollectionRow } from "./collection-rows";

// The one create form in the app (09-10-26). The mutation is captured rather than run, so each case
// can play the server's answer — a created row, or a CONFLICT — at exactly the moment it wants.
const { createMock, invalidateMock, createOpts } = vi.hoisted(() => ({
  createMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  createOpts: {
    current: undefined as
      | undefined
      | {
          onSuccess: (row: { id: string; name: string }) => void;
          onError: (err: { data?: { code?: string } }) => void;
        },
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      saves: { collections: { invalidate: invalidateMock } },
    }),
    saves: {
      createCollection: {
        useMutation: (opts: NonNullable<typeof createOpts.current>) => {
          createOpts.current = opts;
          return { mutate: createMock, isPending: false };
        },
      },
    },
  },
}));

beforeEach(() => {
  createMock.mockClear();
  invalidateMock.mockClear();
});

const openRow = () =>
  fireEvent.click(screen.getByRole("button", { name: /New collection/ }));

describe("NewCollectionRow", () => {
  it("is a row until picked, then a name field with Create disabled on blank", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    expect(screen.queryByLabelText("Collection name")).toBeNull();
    openRow();
    expect(screen.getByLabelText("Collection name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("creates on Enter, invalidates the list, hands the caller the row, and collapses", () => {
    const onCreate = vi.fn();
    render(<NewCollectionRow onCreate={onCreate} />);
    openRow();
    const field = screen.getByLabelText("Collection name");
    fireEvent.change(field, { target: { value: "  Maps " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(createMock).toHaveBeenCalledWith({ name: "Maps" });

    act(() => createOpts.current!.onSuccess({ id: "c9", name: "Maps" }));
    expect(invalidateMock).toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith({ id: "c9", name: "Maps" });
    expect(screen.queryByLabelText("Collection name")).toBeNull();
  });

  it("renders a duplicate name inline and keeps the text so it can be edited", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    openRow();
    const field = screen.getByLabelText("Collection name");
    fireEvent.change(field, { target: { value: "Art" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    act(() => createOpts.current!.onError({ data: { code: "CONFLICT" } }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already have a collection with that name.",
    );
    expect(field).toHaveValue("Art");
    fireEvent.change(field, { target: { value: "Art 2" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says something generic for any other failure", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    openRow();
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "Maps" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    act(() =>
      createOpts.current!.onError({ data: { code: "INTERNAL_SERVER_ERROR" } }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong — try again.",
    );
  });

  it("starts expanded when asked — the profile's sheet is nothing but this form", () => {
    render(<NewCollectionRow onCreate={vi.fn()} initiallyOpen />);
    expect(screen.getByLabelText("Collection name")).toBeInTheDocument();
  });
});

describe("CollectionRow's leading slot", () => {
  it("renders the dot when nothing is asked for", () => {
    render(<CollectionRow label="Art" sub="2 items" onPick={vi.fn()} />);
    expect(screen.queryByTestId("cover-mosaic")).toBeNull();
    expect(document.querySelector(".rounded-full")).not.toBeNull();
  });

  it("renders a mosaic of the covers, ringed when current", () => {
    render(
      <CollectionRow
        label="Art"
        sub="Already saved here"
        leading={{
          kind: "covers",
          covers: ["/api/img/a-item"],
          current: true,
        }}
        onPick={vi.fn()}
      />,
    );
    const face = screen.getByTestId("cover-mosaic");
    expect(face).toHaveAttribute("data-count", "1");
    expect(face.parentElement).toHaveClass("ring-accent");
  });

  it("renders a glyph square for the pseudo-rows", () => {
    render(
      <CollectionRow
        label="Everything kept"
        sub="7 items"
        leading={{ kind: "glyph", glyph: "bookmark" }}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("row-glyph")).toHaveAttribute(
      "data-glyph",
      "bookmark",
    );
    expect(screen.queryByTestId("cover-mosaic")).toBeNull();
  });

  it("the collapsed New collection row leads with the plus square", () => {
    render(<NewCollectionRow onCreate={vi.fn()} />);
    expect(screen.getByTestId("row-glyph")).toHaveAttribute(
      "data-glyph",
      "plus",
    );
  });
});
