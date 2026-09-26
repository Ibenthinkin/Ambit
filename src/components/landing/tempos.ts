// The two ways the landing's reel can move (docs/DESIGN_landing-redo.md D5). A no-import leaf, like
// services/feed-knobs.ts: the client reads it without bundling anything server-side, and it
// unit-tests in node.
//
// Ben is choosing between these by looking (`?tempo=` under the dev gate — see app/page.tsx).
// When he has, DEFAULT_TEMPO flips and the plan's Task 9 deletes the loser; the `Tempo` object
// itself stays, because `behindSheet` needs a second gear to name. `gentle` is not a candidate: it
// is what reduced motion gets (D6).

export type TempoId = "cut" | "dissolve" | "gentle";

export interface Tempo {
  id: TempoId;
  /** How long a picture holds, ms. */
  frameMs: number;
  /** Cross-fade, ms. 0 is a hard cut. */
  fadeMs: number;
  /** Pictures shown before the sheet rises (the first pass). */
  firstPass: number;
  /** Decoded pictures required before the reel starts. */
  gateFrames: number;
  /** A slow 1.00 → 1.06 scale over each frame, transform only. */
  drift: boolean;
  /** The first frame fades in from black instead of cutting (D4's hard cut is itself motion). */
  softStart: boolean;
  /** The tempo that runs once the sheet is up — a 3 Hz strobe under a form is hostile. */
  behindSheet: TempoId;
}

// The dissolve's clock and first pass, shared with `gentle` (the dissolve with only opacity
// moving). Ben, 09-26-26, two phone looks: 6 s / 2.5 s was "just too slow", then 3 s wanted "a
// bit faster, and 8 images before the sign-up tray" — 2.5 s a picture, a 1 s fade so each still
// holds before it goes, and the sheet on the 8th (≈ 20 s from the first picture).
const DISSOLVE_FRAME_MS = 2500;
const DISSOLVE_FADE_MS = 1000;
const DISSOLVE_FIRST_PASS = 8;

export const TEMPOS: Record<TempoId, Tempo> = {
  // 350, not the reference's 320: WCAG 2.3.1 caps flashing at three a second, and 1000/320 is
  // 3.1. 1000/350 = 2.86 — the same feel, under the line.
  cut: {
    id: "cut",
    frameMs: 350,
    fadeMs: 0,
    firstPass: 12,
    gateFrames: 4,
    drift: false,
    softStart: false,
    behindSheet: "dissolve",
  },
  dissolve: {
    id: "dissolve",
    frameMs: DISSOLVE_FRAME_MS,
    fadeMs: DISSOLVE_FADE_MS,
    firstPass: DISSOLVE_FIRST_PASS,
    gateFrames: 1,
    drift: true,
    softStart: false,
    behindSheet: "dissolve",
  },
  // The reduced-motion tempo (D6, 09-26-26): what a reader whose OS asks for less movement gets
  // in place of either of the above. The dissolve's clock with nothing but opacity moving — no
  // drift, and no hard cut into the first frame. Its own gear behind the sheet: relaxing to
  // `dissolve` would bring the drift back.
  gentle: {
    id: "gentle",
    frameMs: DISSOLVE_FRAME_MS,
    fadeMs: DISSOLVE_FADE_MS,
    firstPass: DISSOLVE_FIRST_PASS,
    gateFrames: 1,
    drift: false,
    softStart: true,
    behindSheet: "gentle",
  },
};

/** What production runs — Ben's pick, 09-26-26. `cut` stays until plan Task 9 deletes it. */
export const DEFAULT_TEMPO: TempoId = "dissolve";

/** `?tempo=`, resolved server-side; the override is honoured only under the dev gate (D5). */
export function resolveTempo(
  param: string | undefined,
  allowOverride: boolean,
): Tempo {
  if (allowOverride && (param === "cut" || param === "dissolve")) {
    return TEMPOS[param];
  }
  return TEMPOS[DEFAULT_TEMPO];
}

/** How many pictures past the current one to have decoded: the cut's frames arrive faster than a
 *  350 ms tick could fetch them, so it wants the whole reel; the dissolve wants one ahead. */
export function wantedAhead(tempo: Tempo): number {
  return tempo.fadeMs === 0 ? Infinity : 1;
}

/** The `sizes` for every reel picture — the `<img>`, the off-DOM decode, and the RSC's preload.
 *  All three must match exactly, or the browser picks a different candidate and a picture is
 *  fetched twice. Below `md` a phone takes the 960 rendition; from `md` the master (D3). */
export const REEL_SIZES = "(min-width: 768px) 100vw, 50vw";
