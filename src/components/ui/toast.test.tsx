// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./toast";

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders its text when open", () => {
    render(<Toast text="Saved" open onDone={vi.fn()} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  // A toast is often the only word a failed save gets ("Couldn't save that — try again."), so
  // it has to reach a screen reader too, not just the eye: a polite live region, announced
  // without interrupting whatever the reader is doing.
  it("is announced to assistive tech as a polite status", () => {
    render(<Toast text="Saved" open onDone={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saved");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  // DESIGN §4.6: a white block (`bg-ink`) with dark mono caps — square, no blur, no shadow.
  it("is a square white block with dark Geist Mono caps and no glass", () => {
    render(<Toast text="Saved" open onDone={vi.fn()} />);
    const cls = screen.getByRole("status").className;
    for (const want of [
      "bg-ink",
      "text-bg",
      "font-mono",
      "text-[11px]",
      "uppercase",
      "tracking-[0.3px]",
      "px-[14px]",
      "py-[10px]",
    ])
      expect(cls).toContain(want);
    for (const gone of ["rounded", "backdrop-blur", "shadow", "bg-overlay"])
      expect(cls).not.toContain(gone);
  });

  it("renders nothing when closed", () => {
    render(<Toast text="Saved" open={false} onDone={vi.fn()} />);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("calls onDone after the default duration", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast text="Saved" open onDone={onDone} />);

    vi.advanceTimersByTime(1799);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not fire onDone while closed", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast text="Saved" open={false} onDone={onDone} />);

    vi.advanceTimersByTime(5000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("honors a custom duration", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast text="Saved" open onDone={onDone} durationMs={500} />);

    vi.advanceTimersByTime(499);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
