// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FaceCard } from "./face-card";
import { PlaceCard } from "./place-card";
import { StoryCard } from "./story-card";

describe("FaceCard", () => {
  it("shows the picture, named by its label, and carries the topics it adds", () => {
    render(
      <FaceCard
        label="Space"
        src="/api/img/a1?w=960"
        title="Pillars of dust"
        mark="1"
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

  // Decision 11: under each picture, its number and the picture's own title — never the label
  // (a wing's name), which stays the accessible name only.
  it("captions the picture with its mark and its own title, not the label", () => {
    render(
      <FaceCard
        label="Space"
        src="/api/img/a1?w=960"
        title="Pillars of dust"
        mark="1"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card).toHaveTextContent("1");
    expect(card).toHaveTextContent("Pillars of dust");
    expect(card).not.toHaveTextContent("Space");
  });

  it("is a text card when there is no picture — the normal path on a fresh database", () => {
    render(
      <FaceCard
        label="Space"
        mark="←"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
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
        title="Pillars"
        mark="1"
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

  it("reports a press and outlines the picked frame in ink", () => {
    const onClick = vi.fn();
    render(
      <FaceCard
        label="Space"
        src="/a.jpg"
        mark="1"
        topics={[]}
        selected
        onClick={onClick}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    // DESIGN §5.2: a pick is outlined 1.5 px in ink, offset 3 px — on the frame, not the
    // button, whose own outline is the focus ring.
    const frame = card.querySelector("img")!.parentElement!;
    expect(frame.className).toMatch(/outline-\[1\.5px\]/);
    expect(frame.className).toMatch(/outline-ink/);
    expect(card.className).not.toMatch(/outline-/);
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Phase 1's note: an overflow ancestor clips the focus ring. The clip is the frame's own.
  it("does not clip its own focus ring", () => {
    render(
      <FaceCard
        label="Space"
        src="/a.jpg"
        mark="1"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card.className).not.toMatch(/overflow-hidden/);
  });

  it("lifts under the keyboard's cursor", () => {
    render(
      <FaceCard
        label="Space"
        mark="1"
        topics={[]}
        selected={false}
        cursor
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Space" });
    expect(card).toHaveAttribute("data-cursor", "true");
    expect(card.className).toMatch(/(^| )scale-\[1\.035\]/);
  });

  it("has square corners", () => {
    render(
      <FaceCard
        label="Space"
        src="/a.jpg"
        mark="1"
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Space" }).outerHTML).not.toMatch(
      /rounded/,
    );
  });
});

describe("StoryCard", () => {
  it("sets a real article as a story: kicker, number, title and dek, named by its title", () => {
    render(
      <StoryCard
        label="Essay"
        num="1"
        src="/api/img/e1?w=960"
        writing={{
          kind: "essay",
          minutes: 18,
          title: "The case for boring buildings",
          dek: "An architect argues.",
        }}
        topics={["architecture"]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", {
      name: "The case for boring buildings",
    });
    // Upper-cased by CSS (`uppercase`), which jsdom does not apply — so match either case.
    expect(card).toHaveTextContent(/essay · 18 min/i);
    expect(card).toHaveTextContent("An architect argues.");
    expect(card).toHaveAttribute("data-topics", "architecture");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      "/api/img/e1?w=960",
    );
  });

  it("with no article, shows the kind and an example headline, and no picture", () => {
    render(
      <StoryCard
        label="Curiosity"
        num="2"
        fallback={{ kind: "curiosity", title: "Octopuses dream", dek: "Why?" }}
        topics={[]}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Curiosity" });
    expect(card).toHaveTextContent("Octopuses dream");
    expect(card.querySelector("img")).toBeNull();
  });

  it("outlines the content, not the button, when picked", () => {
    render(
      <StoryCard
        label="Essay"
        num="1"
        topics={[]}
        selected
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Essay" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card.className).not.toMatch(/outline-/);
    expect(card.firstElementChild!.className).toMatch(/outline-ink/);
  });
});

describe("PlaceCard", () => {
  // Ben's critique (10-05-26): "Remove the coordinates." The card is where, the name, one line.
  it("shows where, the name and its line — no coordinates", () => {
    render(
      <PlaceCard
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
    expect(card).toHaveAttribute("data-topics", "japan");
    expect(card).not.toHaveTextContent("35.01° N");
    expect(card).not.toHaveTextContent("Chosen");
  });

  it("says Chosen and rules itself in ink when chosen; dims when the cap is reached", () => {
    const { rerender } = render(
      <PlaceCard
        label="Kyoto"
        card={{ where: "Japan", line: "Moss." }}
        topics={[]}
        selected
        onClick={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: "Kyoto" });
    expect(card).toHaveTextContent("● Chosen");
    expect(card.className).toMatch(/(^| )border-ink( |$)/);
    rerender(
      <PlaceCard
        label="Kyoto"
        card={{ where: "Japan", line: "Moss." }}
        topics={[]}
        selected={false}
        dim
        onClick={vi.fn()}
      />,
    );
    expect(card.className).toMatch(/opacity-40/);
  });
});
