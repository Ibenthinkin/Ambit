// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LandingReel } from "./landing-reel";
import { TEMPOS } from "./tempos";

const pics = Array.from({ length: 5 }, (_, i) => ({
  id: `p${i}`,
  src: `/api/img/p${i}?w=960`,
  srcSet: `/api/img/p${i}?w=960 960w, /api/img/p${i} 1600w`,
}));
const imgs = () =>
  Array.from(
    document.querySelectorAll<HTMLImageElement>(
      "[data-testid='landing-reel'] img",
    ),
  );

describe("LandingReel", () => {
  it("mounts at most three layers — leaving, current, next — keyed by id", () => {
    render(
      <LandingReel
        pictures={pics}
        index={2}
        prev={1}
        tempo={TEMPOS.dissolve}
        started
      />,
    );
    expect(imgs().map((i) => i.dataset.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("the current layer is opaque, the others transparent; the fade is the tempo's", () => {
    render(
      <LandingReel
        pictures={pics}
        index={2}
        prev={1}
        tempo={TEMPOS.dissolve}
        started
      />,
    );
    const [leaving, current, next] = imgs();
    expect(current!.style.opacity).toBe("1");
    expect(leaving!.style.opacity).toBe("0");
    expect(next!.style.opacity).toBe("0");
    expect(current!.style.transition).toContain("opacity 2500ms");
  });

  it("cut: no transition and no drift — a hard cut", () => {
    render(
      <LandingReel
        pictures={pics}
        index={1}
        prev={0}
        tempo={TEMPOS.cut}
        started
      />,
    );
    const current = imgs()[1]!;
    expect(current.style.transition).toBe("none");
    expect(current.style.animation).toBe("");
  });

  it("dissolve: the first frame after the overture is a hard cut too (D4) — only later frames fade", () => {
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.dissolve}
        started
      />,
    );
    expect(imgs()[0]!.style.transition).toBe("none");
  });

  it("dissolve: the leaving layer keeps drifting through its fade — no snap back to scale(1)", () => {
    render(
      <LandingReel
        pictures={pics}
        index={2}
        prev={1}
        tempo={TEMPOS.dissolve}
        started
      />,
    );
    const [leaving, , next] = imgs();
    expect(leaving!.style.animation).toContain("reel-drift 8500ms");
    expect(next!.style.animation).toBe("");
  });

  it("dissolve: the current layer drifts over frame + fade (transform only)", () => {
    render(
      <LandingReel
        pictures={pics}
        index={1}
        prev={0}
        tempo={TEMPOS.dissolve}
        started
      />,
    );
    expect(imgs()[1]!.style.animation).toContain("reel-drift 8500ms");
  });

  it("carries srcset and sizes on a proxied layer, and neither on a data: picture", () => {
    const { unmount } = render(
      <LandingReel
        pictures={[{ id: "d", src: "data:image/png;base64,AA", srcSet: null }]}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started
      />,
    );
    expect(imgs()[0]!.getAttribute("srcset")).toBeNull();
    expect(imgs()[0]!.getAttribute("sizes")).toBeNull();
    unmount();
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started
      />,
    );
    const first = imgs()[0]!;
    expect(first.getAttribute("srcset")).toBe(pics[0]!.srcSet);
    expect(first.getAttribute("sizes")).toBe("(min-width: 768px) 100vw, 50vw");
  });

  it("before start: the ground is black and every layer is transparent (the overture owns the screen)", () => {
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started={false}
      />,
    );
    expect(imgs()[0]!.style.opacity).toBe("0");
    expect(screen.getByTestId("landing-reel").style.background).toBe(
      "rgb(0, 0, 0)",
    );
  });

  it("no grade: no filter on any layer (D5)", () => {
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started
      />,
    );
    for (const i of imgs()) expect(i.style.filter).toBe("");
  });

  it("a one-picture reel mounts one layer", () => {
    render(
      <LandingReel
        pictures={pics.slice(0, 1)}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started
      />,
    );
    expect(imgs()).toHaveLength(1);
  });

  it("tap calls onTap", () => {
    const onTap = vi.fn();
    render(
      <LandingReel
        pictures={pics}
        index={0}
        prev={null}
        tempo={TEMPOS.cut}
        started
        onTap={onTap}
      />,
    );
    fireEvent.click(screen.getByTestId("landing-reel"));
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
