// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LOADER_SIZES, Loader } from "./loader";

// Ben's "Reach" loader (docs/LoaderAnimation/loader/): the mark's dot leaves the centre, orbits
// the ring, comes home. The motion itself is CSS (globals.css) and jsdom doesn't run it — these
// pin the structure the keyframes act on, and the reduced-motion split.
describe("Loader", () => {
  it("is a status named Loading when it has no label", () => {
    render(<Loader />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("shows its label and takes it as its name", () => {
    render(<Loader label="finding something interesting…" />);
    const status = screen.getByRole("status", {
      name: "finding something interesting…",
    });
    expect(status).toHaveTextContent("finding something interesting…");
  });

  it("defaults to 18px and scales the 26-unit mark to fit", () => {
    const { container } = render(<Loader />);
    const box = container.querySelector<HTMLElement>("[data-loader-box]")!;
    expect(box.style.width).toBe("18px");
    expect(box.style.height).toBe("18px");
    const mark = container.querySelector<HTMLElement>("[data-loader-mark]")!;
    expect(mark.style.transform).toBe(`scale(${18 / 26})`);
  });

  it("thickens the ring below 22px so it stays legible", () => {
    const ring = (size: number) =>
      render(<Loader size={size} />)
        .container.querySelector("circle")!
        .getAttribute("stroke-width");
    expect(ring(18)).toBe("2");
    expect(ring(LOADER_SIZES.block)).toBe("1.7");
    expect(ring(LOADER_SIZES.hero)).toBe("1.7");
  });

  it("is drawn in currentColor on the accent, so the accent knob recolours it", () => {
    const { container } = render(<Loader />);
    const status = screen.getByRole("status");
    expect(status.className).toContain("text-accent");
    expect(status.style.color).toBe("");
    expect(container.querySelector("circle")!.getAttribute("stroke")).toBe(
      "currentColor",
    );
  });

  it("lets a caller recolour it", () => {
    render(<Loader className="text-on-accent" />);
    expect(screen.getByRole("status").className).toContain("text-on-accent");
  });

  // Reduced motion plays the whole Reach (Ben, 10-04-26): globals.css collapses every animation
  // outside `.motion-gentle`, so the whole mark — ring, orbit and dot — sits inside it.
  it("exempts the whole mark from the reduced-motion collapse", () => {
    const { container } = render(<Loader />);
    for (const sel of [
      ".animate-loader-ring",
      ".animate-loader-orbit",
      ".animate-loader-reach",
    ]) {
      expect(
        container.querySelector(sel)!.closest(".motion-gentle"),
      ).not.toBeNull();
    }
  });
});
