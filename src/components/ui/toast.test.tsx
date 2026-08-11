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
