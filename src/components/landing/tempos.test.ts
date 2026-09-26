import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPO, resolveTempo, TEMPOS, wantedAhead } from "./tempos";

// docs/DESIGN_landing-redo.md D5's table, pinned. Change the design before you change these.
describe("tempos", () => {
  it("cut: 350 ms hard cuts, 12 before the sheet, 4 decoded to start, relaxes to dissolve", () => {
    expect(TEMPOS.cut).toEqual({
      id: "cut",
      frameMs: 350,
      fadeMs: 0,
      firstPass: 12,
      gateFrames: 4,
      drift: false,
      softStart: false,
      behindSheet: "dissolve",
    });
  });

  // Ben, 09-26-26, after the phone look: 6 s was "just too slow" — 3 s a picture, the fade cut to
  // 1.2 s so a picture still holds before it goes (the old 6 : 2.5 ratio, roughly).
  it("dissolve: 3 s frames, 1.2 s fade, 2 before the sheet, 1 decoded to start, drifts", () => {
    expect(TEMPOS.dissolve).toEqual({
      id: "dissolve",
      frameMs: 3000,
      fadeMs: 1200,
      firstPass: 2,
      gateFrames: 1,
      drift: true,
      softStart: false,
      behindSheet: "dissolve",
    });
  });

  // The reduced-motion tempo (D6, 09-26-26): the dissolve with no drift and no hard cut anywhere —
  // the first frame fades in from black too. Opacity is the only thing that moves.
  it("gentle: the dissolve's clock without drift, and a soft start; it is its own gear behind the sheet", () => {
    expect(TEMPOS.gentle).toEqual({
      id: "gentle",
      frameMs: 3000,
      fadeMs: 1200,
      firstPass: 2,
      gateFrames: 1,
      drift: false,
      softStart: true,
      behindSheet: "gentle",
    });
  });

  it("gentle keeps the dissolve's clock, so the two can't drift apart", () => {
    expect(TEMPOS.gentle.frameMs).toBe(TEMPOS.dissolve.frameMs);
    expect(TEMPOS.gentle.fadeMs).toBe(TEMPOS.dissolve.fadeMs);
  });

  it("production runs the dissolve (Ben's pick, 09-26-26)", () => {
    expect(DEFAULT_TEMPO).toBe("dissolve");
  });

  it("cut stays under WCAG 2.3.1's three flashes a second", () => {
    expect(1000 / TEMPOS.cut.frameMs).toBeLessThan(3);
  });

  it("resolveTempo honours the param only when overrides are allowed, and never resolves gentle", () => {
    expect(resolveTempo("dissolve", true).id).toBe("dissolve");
    expect(resolveTempo("dissolve", false).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("gentle", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("nonsense", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo(undefined, true).id).toBe(DEFAULT_TEMPO);
  });

  it("wantedAhead: cut prefetches the whole reel, dissolve and gentle one ahead", () => {
    expect(wantedAhead(TEMPOS.cut)).toBe(Infinity);
    expect(wantedAhead(TEMPOS.dissolve)).toBe(1);
    expect(wantedAhead(TEMPOS.gentle)).toBe(1);
  });
});
