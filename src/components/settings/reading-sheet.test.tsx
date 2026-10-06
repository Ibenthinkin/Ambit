// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReadingSheet } from "./reading-sheet";

function show(current: "none" | "little" | "some" | "lot" | null) {
  const onPick = vi.fn();
  render(
    <ReadingSheet open onClose={vi.fn()} current={current} onPick={onPick} />,
  );
  return onPick;
}
const checked = () =>
  screen
    .getAllByRole("radio")
    .filter((b) => b.getAttribute("aria-checked") === "true")
    .map((b) => b.textContent);

describe("ReadingSheet", () => {
  it("offers the four amounts, in order, under a title that says what they set", () => {
    show("lot");
    expect(screen.getByRole("dialog", { name: "Reading" })).toBeInTheDocument();
    for (const label of ["None", "A little", "Some", "A lot"])
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    expect(checked()).toEqual(["A lot"]);
  });

  it("is one named radiogroup", () => {
    show("some");
    expect(
      screen.getByRole("radiogroup", { name: "Reading amount" }),
    ).toBeInTheDocument();
  });

  it("shows a reader who never said as Some — the feed's own default", () => {
    show(null);
    expect(checked()).toEqual(["Some"]);
  });

  it("reports a pick", () => {
    const onPick = show("some");
    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith("none");
  });
});
