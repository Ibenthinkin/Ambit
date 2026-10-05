// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FaceCard } from "./face-card";

describe("FaceCard", () => {
  it("shows the picture, named by its label, and carries the topics it adds", () => {
    render(
      <FaceCard
        label="Space"
        src="/api/img/a1?w=960"
        topics={["astronomy", "moon"]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card).toHaveAttribute("data-topics", "astronomy moon");
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      "/api/img/a1?w=960",
    );
  });

  it("is a text card when there is no picture — the normal path on a fresh database", () => {
    render(
      <FaceCard label="Space" topics={[]} selected={false} onClick={vi.fn()} />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card.querySelector("img")).toBeNull();
    expect(card).toHaveTextContent("Space");
  });

  it("falls back to the text card when the picture fails to load", () => {
    render(
      <FaceCard
        label="Space"
        src="/api/img/gone"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toBeNull();
    expect(card).toHaveTextContent("Space");
  });

  it("reports a press and shows the pressed state", () => {
    const onClick = vi.fn();
    render(<FaceCard label="Space" topics={[]} selected onClick={onClick} />);
    const card = screen.getByRole("button", { name: "Space" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
