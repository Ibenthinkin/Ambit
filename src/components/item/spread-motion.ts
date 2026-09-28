import type { RailItem } from "~/server/services/gallery-rail";
import type { HeroCell } from "./rail-cells";

// The magazine's motion, as pure data (docs/PLAN_magazine-turn.md). Everything that moves in a
// spread — a page turning, a page lifted by a drag and let go, the book opening when the reader
// switches to magazine view and folding shut when they switch back — is **one leaf** swinging
// around the spine. This file decides *which* pictures are on the leaf and underneath it, and
// *how* the light falls on it at each angle. `HeroRail` draws what it says; `ItemScreen` decides
// when.
//
// **The leaf.** A box the size of one page, on one half of the spread (`half`), hinged on its
// spine edge. Its front face shows one picture, its back face another, each hidden when turned
// away (`backface-visibility: hidden`); the back is pre-rotated 180° so it reads the right way
// round once the leaf has swung over. Its position is a **progress** `p`: 0 is lying flat on its
// own half, 1 is lying flat on the other half, 0.5 is standing straight up from the spine. The
// angle is `p × 180°`, negative for a leaf on the right half (it swings left, towards the
// reader's left hand) — the package's `0 → -180deg` / `0 → 180deg`.
//
// The numbers are Ben's Claude Design tokens (docs/turnpackage/, docs/viewTOggleTOkens/), except
// the lighting, which the package does not have and which is a first guess for Ben's eye.

/** The page turn's length and curve — `view-toggle.tokens.json` `spread.pageTurn`. */
export const TURN_MS = 800;
export const TURN_EASE = "cubic-bezier(.45,.05,.25,1)";
/** The stage's perspective. Large, so the leaf foreshortens gently rather than lurching at you. */
export const PERSPECTIVE_PX = 2800;
/** A half-finished drag finishes in proportion to what is left, but never faster than this. */
export const MIN_TURN_MS = 200;
/** The folios fade back in once a turn lands — the tokens' `folio.hideDuringTurn`. */
export const FOLIO_FADE_MS = 300;
/** Single view fading in after the book folds shut — the tokens' `single.enter`. */
export const SINGLE_ENTER_MS = 350;

/** Which half of the spread the leaf lies on at `p = 0`. Its hinge is that half's spine edge. */
export type Half = "left" | "right";

export type MotionKind = "turn" | "open" | "close";

/** What one swing of the leaf shows: the pictures on it, the pictures under it, and its travel. */
export interface LeafLayers {
  half: Half;
  /** The face seen while `p < 0.5`. Absent is a blank page. */
  front?: RailItem;
  /** The face seen once the leaf has swung past upright. */
  back?: RailItem;
  /** The spread underneath while the leaf moves: left page, right page. */
  under: readonly [RailItem | undefined, RailItem | undefined];
}

export interface Motion extends LeafLayers {
  /** Changes on every new motion, so an effect keyed on it starts exactly one animation. */
  key: number;
  kind: MotionKind;
  /** Where the leaf starts and ends. A turn goes 0 → 1, the book opening 1 → 0. */
  from: number;
  to: number;
}

/** A cell's pictures, or nothing if it holds the explore end card — which never turns. */
function pictures(cell: HeroCell | undefined): RailItem[] | null {
  if (!cell || cell.length === 0) return null;
  if (cell.some((p) => p === "end")) return null;
  return cell as RailItem[];
}

/**
 * The leaf for a page turn from the spread `from` to the spread `to` (the plan's D1 table).
 *
 * Forward (A B → C D): the right page lifts, B on its front and C on its back, and swings onto
 * the left half; underneath, A stays until it is covered and D is revealed. Backward (C D → A B)
 * is the mirror: the left page C swings right, showing B on its back, over D, revealing A.
 *
 * `null` means "no turn — just switch": no spread to turn to, the end card on either side, or the
 * odd case where the two spreads share a picture (going back from index 1 lands on index 0, so
 * the old left page *is* the new right one, and a leaf showing the same picture on both faces
 * would look like a glitch rather than a page).
 */
export function turnLayers(
  dir: 1 | -1,
  fromCell: HeroCell | undefined,
  toCell: HeroCell | undefined,
): LeafLayers | null {
  const from = pictures(fromCell);
  const to = pictures(toCell);
  if (!from || !to) return null;
  const fromIds = new Set(from.map((p) => p.id));
  if (to.some((p) => fromIds.has(p.id))) return null;

  return dir === 1
    ? { half: "right", front: from[1], back: to[0], under: [from[0], to[1]] }
    : { half: "left", front: from[0], back: to[1], under: [to[0], from[1]] };
}

/**
 * The leaf for the book opening or closing — the view toggle, animated (Task 6).
 *
 * **Opening** starts with the right page folded over the left one — its back face showing the
 * left page's picture, which is the single picture the reader was just looking at — and swings
 * it open (p 1 → 0), revealing the right page on its front. Underneath: the left page, and a
 * blank right half for the page to land on.
 *
 * **Closing folds towards the focused page**, so the picture the reader chose is the one the
 * single view lands on (the spread's "turning off lands on the focused page" rule, D2). Focus
 * left: the right page folds over it, its back showing the left picture. Focus right: the left
 * page folds over the right one, its back showing the right picture. Either way the half it
 * leaves is blank underneath.
 *
 * `null` for a spread with no second page — a lone last page has nothing to fold.
 */
export function bookLayers(
  kind: "open" | "close",
  cell: HeroCell | undefined,
  focusSide: 0 | 1,
): LeafLayers | null {
  const pages = pictures(cell);
  if (!pages || pages.length < 2) return null;
  const [left, right] = pages;
  if (kind === "open" || focusSide === 0) {
    return {
      half: "right",
      front: right,
      back: left,
      under: [left, undefined],
    };
  }
  return { half: "left", front: left, back: right, under: [undefined, right] };
}

/** How long a swing from `from` to `to` takes: the full turn's time, pro rata. */
export function motionMs(from: number, to: number): number {
  return Math.max(MIN_TURN_MS, Math.round(TURN_MS * Math.abs(to - from)));
}

/** The leaf's rotation at progress `p`. */
export function angleAt(half: Half, p: number): number {
  return (half === "right" ? -180 : 180) * p;
}

/**
 * The light at progress `p` — the thing that makes a rotating picture read as paper rather than
 * a card flip (D5). A real page is darkest edge-on to the light, which is when it stands straight
 * up from the spine, so everything peaks at `p = 0.5` and follows `sin(pπ)`:
 *
 *   - `leaf`: a shade over the leaf's visible face, darkest at the hinge;
 *   - `cast`: the shadow the standing leaf throws into the gutter on both pages underneath.
 */
export function lightAt(p: number): { leaf: number; cast: number } {
  const lift = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
  return { leaf: round(lift * LEAF_SHADE_MAX), cast: round(lift * CAST_MAX) };
}

/** The darkest the leaf's own shade gets, upright. A first guess — tune by eye. */
export const LEAF_SHADE_MAX = 0.55;
/** The darkest the cast shadow in the gutter gets. A first guess — tune by eye. */
export const CAST_MAX = 0.45;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Keyframes sampled along a swing, so the light's curve survives WAAPI's linear interpolation. */
const STEPS = 8;

/**
 * The keyframes for one swing, for the three things that move together: the leaf's rotation, the
 * shade on its faces, and the cast shadow. Sampled at even steps of `p` so `sin(pπ)` is drawn as a
 * curve rather than a straight line between the two ends; the timing's easing then applies to
 * the whole swing at once, so the light stays locked to the angle however the swing accelerates.
 */
export function swingFrames(
  half: Half,
  from: number,
  to: number,
): { leaf: Keyframe[]; shade: Keyframe[]; cast: Keyframe[] } {
  const leaf: Keyframe[] = [];
  const shade: Keyframe[] = [];
  const cast: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const p = from + ((to - from) * i) / STEPS;
    const light = lightAt(p);
    leaf.push({ transform: `rotateY(${angleAt(half, p)}deg)` });
    shade.push({ opacity: light.leaf });
    cast.push({ opacity: light.cast });
  }
  return { leaf, shade, cast };
}

/**
 * A folio's page number — the reader's place counted from the picture they came in on, which is
 * `01`. Pages before it count down through zero into negatives (Ben, 09-27-26): `00`, `−01`,
 * `−02`. The minus is U+2212, a true minus, which sits on the same width as a digit in tabular
 * figures where a hyphen would not.
 */
export function folioNumber(n: number): string {
  const digits = String(Math.abs(n)).padStart(2, "0");
  return n < 0 ? `−${digits}` : digits;
}
