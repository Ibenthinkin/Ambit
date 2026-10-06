// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

describe("Field (DESIGN §4.4)", () => {
  it("labels its control, so getByLabelText finds it", () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toBeInstanceOf(HTMLInputElement);
  });

  it("works for a textarea, and keeps a control's own id", () => {
    render(
      <Field label="About">
        <Textarea id="mine" />
      </Field>,
    );
    const area = screen.getByLabelText("About");
    expect(area).toHaveAttribute("id", "mine");
  });

  it("the label is a mono uppercase eyebrow", () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    );
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveClass("font-mono", "uppercase", "text-ink/55");
  });

  it("a hint sits right of the label, in green mono, and describes the control", () => {
    render(
      <Field label="Password" hint="Needs 8+ characters">
        <Input />
      </Field>,
    );
    const hint = screen.getByText("Needs 8+ characters");
    expect(hint).toHaveClass("font-mono", "text-accent");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
    expect(screen.getByLabelText("Password")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("an error replaces the hint, is announced, and marks the control invalid", () => {
    render(
      <Field label="Handle" hint="Letters only" error="That handle is taken">
        <Input />
      </Field>,
    );
    expect(screen.queryByText("Letters only")).toBeNull();
    const err = screen.getByRole("alert");
    expect(err).toHaveTextContent("That handle is taken");
    expect(err).toHaveClass("font-mono", "text-accent");
    const input = screen.getByLabelText("Handle");
    expect(input).toHaveAttribute("aria-describedby", err.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("with neither hint nor error there is no description", () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("merges a control's own aria-describedby with the note", () => {
    render(
      <Field label="Email" hint="Hint text">
        <Input aria-describedby="extra" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBe(
      `extra ${screen.getByText("Hint text").id}`,
    );
  });

  it("keeps a control's own aria-describedby and aria-invalid when there is no note", () => {
    render(
      <Field label="Email">
        <Input aria-describedby="extra" aria-invalid="true" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-describedby", "extra");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
