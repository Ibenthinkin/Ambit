// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubMatchMedia } from "~/test/match-media";

import {
  PROFILE_GLYPH_TOKENS,
  ProfileGlyph,
  type ProfileGlyphHandle,
  stopValues,
} from "./profile-glyph";

const T = PROFILE_GLYPH_TOKENS;

function renderGlyph(props: React.ComponentProps<typeof ProfileGlyph> = {}) {
  const handle = React.createRef<ProfileGlyphHandle>();
  const view = render(<ProfileGlyph ref={handle} {...props} />);
  return { ...view, handle };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ProfileGlyph (docs/profile-glyph, variant 6f)", () => {
  it("renders the head-and-shoulders at `size`, aria-hidden, with the four-colour flow looping", () => {
    const { container } = renderGlyph({ size: 40 });
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe(T.geometry.viewBox);
    expect(container.querySelector("path")!.getAttribute("d")).toBe(
      T.geometry.body,
    );

    // One SMIL animation per stop, each a 10 s loop over the palette.
    const animates = [...container.querySelectorAll("animate")];
    expect(animates).toHaveLength(T.flow.stops.length);
    for (const a of animates) {
      expect(a.getAttribute("dur")).toBe("10s");
      expect(a.getAttribute("repeatCount")).toBe("indefinite");
    }
    for (const c of Object.values(T.color)) {
      expect(container.innerHTML).toContain(c);
    }
  });

  it("stop i lags stop i−1 by one colour, so the flow travels outward", () => {
    // The palette closed back on its first value, then rotated backwards one step per stop.
    expect(stopValues(0)).toBe("#A8AEFF;#E0A184;#7FC4B0;#E8D48A;#A8AEFF");
    expect(stopValues(1)).toBe("#E8D48A;#A8AEFF;#E0A184;#7FC4B0;#E8D48A");
    expect(stopValues(3)).toBe("#E0A184;#7FC4B0;#E8D48A;#A8AEFF;#E0A184");
  });

  it("`speed` shortens the loop; `still` removes it and leaves a flat periwinkle", () => {
    const fast = renderGlyph({ speed: 2 });
    expect(fast.container.querySelector("animate")!.getAttribute("dur")).toBe(
      "5s",
    );

    const still = renderGlyph({ still: true });
    expect(still.container.querySelectorAll("animate")).toHaveLength(0);
    for (const stop of still.container.querySelectorAll("stop")) {
      expect(stop.getAttribute("stop-color")).toBe(T.color.periwinkle);
    }
  });

  it("rush(): lays one 900 ms single-cycle layer over the flow, then removes it; a second tap restarts it", () => {
    vi.useFakeTimers();
    const { container, handle } = renderGlyph();
    expect(container.querySelector("svg[data-rush]")).toBeNull();

    act(() => handle.current!.rush());
    const layer = container.querySelector("svg[data-rush]")!;
    expect(layer).not.toBeNull();
    const a = layer.querySelector("animate")!;
    expect(a.getAttribute("dur")).toBe("0.9s");
    expect(a.getAttribute("fill")).toBe("freeze");
    expect(a.getAttribute("repeatCount")).toBeNull();
    // The ambient loop is untouched underneath — the layer is an overlay, not a replacement.
    expect(container.querySelectorAll("animate")).toHaveLength(
      T.flow.stops.length * 2,
    );

    // Tapping again mounts a fresh layer (a new gradient id) rather than letting the first finish.
    const firstId = layer.querySelector("radialGradient")!.id;
    act(() => handle.current!.rush());
    const second = container.querySelector("svg[data-rush]")!;
    expect(second.querySelector("radialGradient")!.id).not.toBe(firstId);

    // jsdom has no Web Animations API, so the layer leaves on the cycle's own timer.
    act(() => {
      vi.advanceTimersByTime(T.rush.durationMs + 1);
    });
    expect(container.querySelector("svg[data-rush]")).toBeNull();
  });

  it("under prefers-reduced-motion: a still fill, and rush() does nothing", () => {
    stubMatchMedia(["(prefers-reduced-motion: reduce)"]);
    const { container, handle } = renderGlyph();
    expect(container.querySelectorAll("animate")).toHaveLength(0);
    act(() => handle.current!.rush());
    expect(container.querySelector("svg[data-rush]")).toBeNull();
  });

  it("two glyphs on one page never share a gradient id", () => {
    const { container } = render(
      <>
        <ProfileGlyph />
        <ProfileGlyph />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map(
      (g) => g.id,
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
