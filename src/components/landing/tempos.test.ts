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
      behindSheet: "dissolve",
    });
  });

  it("dissolve: 6 s frames, 2.5 s fade, 2 before the sheet, 1 decoded to start, drifts", () => {
    expect(TEMPOS.dissolve).toEqual({
      id: "dissolve",
      frameMs: 6000,
      fadeMs: 2500,
      firstPass: 2,
      gateFrames: 1,
      drift: true,
      behindSheet: "dissolve",
    });
  });

  it("cut stays under WCAG 2.3.1's three flashes a second", () => {
    expect(1000 / TEMPOS.cut.frameMs).toBeLessThan(3);
  });

  it("resolveTempo honours the param only when overrides are allowed", () => {
    expect(resolveTempo("dissolve", true).id).toBe("dissolve");
    expect(resolveTempo("dissolve", false).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo("nonsense", true).id).toBe(DEFAULT_TEMPO);
    expect(resolveTempo(undefined, true).id).toBe(DEFAULT_TEMPO);
  });

  it("wantedAhead: cut prefetches the whole reel, dissolve one ahead", () => {
    expect(wantedAhead(TEMPOS.cut)).toBe(Infinity);
    expect(wantedAhead(TEMPOS.dissolve)).toBe(1);
  });
});
