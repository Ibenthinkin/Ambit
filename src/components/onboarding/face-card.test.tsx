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

  // Ben's critique (10-05-26): the coordinates at a destination card's foot were decoration that
  // read as noise. The card is where, the name, and one line.
  it("a destination card shows where, the name and its line — no coordinates", () => {
    render(
      <FaceCard
        label="Kyoto"
        topics={["japan"]}
        selected={false}
        onClick={vi.fn()}
        // A stale `coord` (the data carried one until 10-05-26) is spread in so the type allows
        // it: whatever the data holds, the card never prints it.
        card={{
          where: "Japan",
          line: "Moss gardens.",
          ...{ coord: "35.01° N" },
        }}
      />,
    );
    const card = screen.getByRole("button", { name: "Kyoto" });
    expect(card).toHaveTextContent("Japan");
    expect(card).toHaveTextContent("Moss gardens.");
    expect(card).not.toHaveTextContent("35.01° N");
  });

  // Ben's critique (10-05-26): a wing picture should stand alone — the category printed over it
  // told the reader what to see. `caption={false}` drops the printed label, never the name.
  describe("caption={false}", () => {
    it("prints no label over the picture, but the label is still the button's name", () => {
      render(
        <FaceCard
          label="Space"
          src="/api/img/a1?w=960"
          caption={false}
          topics={[]}
          selected={false}
          onClick={vi.fn()}
        />,
      );
      const card = screen.getByRole("button", { name: "Space" });
      expect(card.querySelector("img")).not.toBeNull();
      expect(card).not.toHaveTextContent("Space");
    });

    // Review Focus 3: with no caption, a picture that fails to load must not leave a blank
    // button — the text card, label large, is still the fallback.
    it("falls back to the text card, label and all, when the picture fails", () => {
      render(
        <FaceCard
          label="Space"
          src="/api/img/gone"
          caption={false}
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
  });

  // Ben's critique (10-05-26): every other picture in the app is square-cornered; the
  // questionnaire's cards were the odd ones out.
  it.each([
    ["a picture card", { src: "/api/img/a1?w=960" }],
    [
      "an article card",
      {
        writing: {
          kind: "essay" as const,
          minutes: 9,
          title: "Space",
          dek: "",
        },
      },
    ],
    ["a destination card", { card: { where: "Japan", line: "Moss." } }],
  ])("%s has square corners", (_, extra) => {
    render(
      <FaceCard
        label="Space"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
        {...extra}
      />,
    );
    expect(screen.getByRole("button", { name: "Space" }).className).not.toMatch(
      /rounded/,
    );
  });
});
