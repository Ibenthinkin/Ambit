// @vitest-environment jsdom
import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BottomSheet } from "./bottom-sheet";
import { Segmented } from "./segmented";

const options = [
  { key: "none", label: "None" },
  { key: "some", label: "Some" },
  { key: "lot", label: "A lot" },
] as const;

function show(value: "none" | "some" | "lot" = "some", onChange = vi.fn()) {
  render(
    <Segmented
      label="Amount"
      options={[...options]}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("Segmented (a radiogroup — DESIGN §4.3)", () => {
  it("is a named radiogroup of radios, one checked", () => {
    show("some");
    const group = screen.getByRole("radiogroup", { name: "Amount" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Some" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "None" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // No longer toggle buttons.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("roves the tab stop: only the checked radio is tabbable", () => {
    show("some");
    expect(screen.getByRole("radio", { name: "Some" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "None" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByRole("radio", { name: "A lot" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("calls onChange with a clicked option, but not for the checked one", () => {
    const onChange = show("some");
    fireEvent.click(screen.getByRole("radio", { name: "Some" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "A lot" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("lot");
  });

  it("ArrowRight / ArrowLeft move the selection, focus following, and call onChange", () => {
    const onChange = show("some");
    const some = screen.getByRole("radio", { name: "Some" });
    some.focus();
    fireEvent.keyDown(some, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("lot");
    expect(screen.getByRole("radio", { name: "A lot" })).toHaveFocus();

    fireEvent.keyDown(some, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("none");
  });

  it("ArrowDown / ArrowUp also move", () => {
    const onChange = show("some");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Some" }), {
      key: "ArrowDown",
    });
    expect(onChange).toHaveBeenLastCalledWith("lot");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Some" }), {
      key: "ArrowUp",
    });
    expect(onChange).toHaveBeenLastCalledWith("none");
  });

  it("does not wrap: past either end an arrow does nothing", () => {
    const onChange = show("lot");
    const lot = screen.getByRole("radio", { name: "A lot" });
    lot.focus();
    fireEvent.keyDown(lot, { key: "ArrowRight" });
    fireEvent.keyDown(lot, { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
    expect(lot).toHaveFocus();
    const none = screen.getByRole("radio", { name: "None" });
    none.focus();
    fireEvent.keyDown(none, { key: "ArrowLeft" });
    fireEvent.keyDown(none, { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
    expect(none).toHaveFocus();
  });

  it("Home and End jump to the ends", () => {
    const onChange = show("some");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Some" }), {
      key: "End",
    });
    expect(onChange).toHaveBeenLastCalledWith("lot");
    expect(screen.getByRole("radio", { name: "A lot" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Some" }), {
      key: "Home",
    });
    expect(onChange).toHaveBeenLastCalledWith("none");
    expect(screen.getByRole("radio", { name: "None" })).toHaveFocus();
  });

  describe("a muted (destructive) option", () => {
    function withOff() {
      const onChange = vi.fn();
      render(
        <Segmented
          label="Level"
          options={[
            { key: "some", label: "some" },
            { key: "lot", label: "a lot" },
            { key: "off", label: "off", tone: "muted" },
          ]}
          value="lot"
          onChange={onChange}
        />,
      );
      return onChange;
    }

    it("an arrow onto it only moves focus", () => {
      const onChange = withOff();
      fireEvent.keyDown(screen.getByRole("radio", { name: "a lot" }), {
        key: "ArrowRight",
      });
      expect(screen.getByRole("radio", { name: "off" })).toHaveFocus();
      expect(onChange).not.toHaveBeenCalled();
      // End is browsing too.
      fireEvent.keyDown(screen.getByRole("radio", { name: "some" }), {
        key: "End",
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("Space and Enter check it, and a click does", () => {
      const onChange = withOff();
      const off = screen.getByRole("radio", { name: "off" });
      fireEvent.keyDown(off, { key: " " });
      expect(onChange).toHaveBeenLastCalledWith("off");
      fireEvent.keyDown(off, { key: "Enter" });
      expect(onChange).toHaveBeenCalledTimes(2);
      fireEvent.click(off);
      expect(onChange).toHaveBeenCalledTimes(3);
    });
  });

  it('a selected option with tone muted ("off") is marked, and wears the quiet fill', () => {
    render(
      <Segmented
        label="Level"
        options={[
          { key: "some", label: "some" },
          { key: "off", label: "off", tone: "muted" },
        ]}
        value="off"
        onChange={vi.fn()}
      />,
    );
    const off = screen.getByRole("radio", { name: "off" });
    expect(off).toHaveAttribute("aria-checked", "true");
    expect(off.className).toContain("bg-[#2A2A2A]");
    // Exact tokens, not substrings: "bg-ink" must not be among them.
    expect(off.className.split(/\s+/)).not.toContain("bg-ink");
  });

  it("uses a 2px focus offset, not the global 3px (DESIGN §3.4)", () => {
    show("some");
    expect(screen.getByRole("radio", { name: "Some" }).className).toContain(
      "focus-visible:outline-offset-2",
    );
  });

  it("has no radius", () => {
    show("some");
    const cls = screen.getByRole("radiogroup").className;
    expect(cls).not.toMatch(/rounded/);
    expect(screen.getByRole("radio", { name: "Some" }).className).not.toMatch(
      /rounded/,
    );
  });
});

// Review focus 3: the sheet intercepts Escape and Tab on `document`. Arrows must pass through,
// and Tab must leave the group in a single press.
describe("Segmented inside a BottomSheet", () => {
  function inSheet(onChange = vi.fn(), onClose = vi.fn()) {
    render(
      <BottomSheet open onClose={onClose} title="Reading">
        <Segmented
          label="Amount"
          options={[...options]}
          value="some"
          onChange={onChange}
        />
        <button type="button">After</button>
      </BottomSheet>,
    );
    return { onChange, onClose };
  }

  it("an arrow key still moves the selection and is not swallowed or closed", () => {
    const { onChange, onClose } = inSheet();
    const some = screen.getByRole("radio", { name: "Some" });
    some.focus();
    const ev = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    some.dispatchEvent(ev);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("lot");
    expect(ev.defaultPrevented).toBe(true); // the radiogroup took it (page doesn't scroll)
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Tab leaves the group in one press: the sheet does not trap on a roving radio", () => {
    inSheet();
    // The focus trap treats the last *tabbable* element as the edge. The unchecked radios
    // (tabindex -1) must not count, or Tab from the checked radio, mid-group, would walk the
    // browser out of the dialog instead of to "After".
    const some = screen.getByRole("radio", { name: "Some" });
    const after = screen.getByRole("button", { name: "After" });
    after.focus();
    const ev = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    after.dispatchEvent(ev);
    // "After" is the last tabbable: the trap wraps to the FIRST tabbable, which is the checked
    // radio — not the unchecked "None".
    expect(ev.defaultPrevented).toBe(true);
    expect(some).toHaveFocus();
  });

  it("Shift+Tab from the checked radio goes back to the sheet's last tabbable, not a hidden radio", () => {
    inSheet();
    const some = screen.getByRole("radio", { name: "Some" });
    some.focus();
    // `Some` is the first tabbable inside the sheet (after the panel): shift+Tab wraps to "After".
    // Whichever the trap picks as first, it must be the checked radio.
    const ev = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    some.dispatchEvent(ev);
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });
});
