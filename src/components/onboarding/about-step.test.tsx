// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AboutStep } from "./about-step";

function show(initial?: Parameters<typeof AboutStep>[0]["initial"]) {
  const onContinue = vi.fn();
  const onSkip = vi.fn();
  const onBack = vi.fn();
  render(
    <AboutStep
      initial={initial}
      onContinue={onContinue}
      onSkip={onSkip}
      onBack={onBack}
    />,
  );
  return { onContinue, onSkip, onBack };
}

describe("AboutStep", () => {
  it("says in one plain line that it is optional and what it is for", () => {
    show();
    expect(
      screen.getByText(
        "All optional. We use this only to understand who Ambit is for; it never changes your feed and is never shared.",
      ),
    ).toBeInTheDocument();
  });

  it("makes Skip exactly as prominent as Continue", () => {
    show();
    const skip = screen.getByRole("button", { name: "Skip" });
    const go = screen.getByRole("button", { name: "Continue" });
    expect(skip.className).toBe(go.className);
  });

  it("Continue reports what was given — one age range, a place, a gender in their own words", () => {
    const { onContinue } = show();
    fireEvent.click(screen.getByRole("button", { name: "25–34" }));
    // One at a time: a second range replaces the first.
    fireEvent.click(screen.getByRole("button", { name: "35–44" }));
    fireEvent.change(screen.getByLabelText(/Roughly where are you/), {
      target: { value: "Lisbon" },
    });
    fireEvent.change(screen.getByLabelText("Gender"), {
      target: { value: "non-binary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledExactlyOnceWith({
      ageRange: "35–44",
      location: "Lisbon",
      gender: "non-binary",
    });
  });

  it("pressing the chosen age range again un-chooses it", () => {
    const { onContinue } = show();
    fireEvent.click(screen.getByRole("button", { name: "25–34" }));
    fireEvent.click(screen.getByRole("button", { name: "25–34" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({
      ageRange: null,
      location: "",
      gender: "",
    });
  });

  it("Skip reports nothing, whatever was typed", () => {
    const { onSkip, onContinue } = show();
    fireEvent.change(screen.getByLabelText("Gender"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledExactlyOnceWith();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("opens on what was said before, for a reader who came Back", () => {
    show({ ageRange: "65+", location: "Oslo", gender: "" });
    expect(screen.getByRole("button", { name: "65+" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText(/Roughly where are you/)).toHaveValue("Oslo");
  });

  it("Back goes back", () => {
    const { onBack } = show();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
