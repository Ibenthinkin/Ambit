// The full icon set recreated from the design handoff prototypes, per PHASE5_PLAN.md Step 4 /
// Decision 5. Each icon keeps its AUTHORED viewBox rather than being rescaled onto one shared
// grid — the prototypes mix a 24×24 Feather-style stroke set with bespoke grids (bookmark 13×16,
// the sheet-close X 14×14, the diamond 10×10, the ring-and-dot logo 26×26), and hand-rescaling
// those onto a single grid was found, during planning, to introduce visual drift for no benefit.
//
// Stroke weights (audited in Phase 5.4 against the redesign, which specifies "1.7-2px stroke,
// round caps/joins"): every 24-grid icon already sits in that band and was left alone; `Envelope`
// was nudged 1.6 → 1.7 to join it. `Bookmark` deliberately keeps its lighter 1.3 — on its bespoke
// 13×16 grid that is proportionally *heavier* than 1.7 on a 24 grid, so matching the number would
// fatten the app's most-repeated glyph. `Logo` is now the redesign's exact mark spec (see below).
//
// Every icon uses `currentColor` for its stroke/fill (the prototypes hardcoded either a muted
// `rgba(239,235,224, N)` or the accent hex per call site — recreated here as inherited text
// color, so a component sets color via `text-ink/60`, `text-accent`, etc., same as everywhere
// else in the design system). Two documented exceptions: the filled `Bookmark` variant sets BOTH
// `fill` and `stroke` to `currentColor` (that's how the prototype fattens the glyph — a stroke
// alone reads too thin at this size), and `Diamond` is fill-only (it never had a stroke).
//
// `size` scales the icon's natural rendered size while its `viewBox` (and therefore internal
// proportions) stays fixed. For the one non-square glyph, `Bookmark`, `size` maps to height and
// width is derived from its native 13:16 aspect ratio — passing one number never distorts it.

import type { SVGProps } from "react";

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  "width" | "height"
> {
  size?: number;
  className?: string;
}

/** Bookmark — the single most-repeated glyph in the app (save affordance, feed cards + header). */
export function Bookmark({
  size = 16,
  filled = false,
  className,
  ...rest
}: IconProps & { filled?: boolean }) {
  const width = Math.round((size * 13) / 16);
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 13 16"
      className={className}
      {...rest}
    >
      <path
        d="M1 1h11v14l-5.5-3.4L1 15z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Share — the iOS "box with arrow up" glyph (Web Share API affordance). */
export function Share({ size = 15, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
      <path d="M12 3v13" />
      <path d="M8 7l4-4 4 4" />
    </svg>
  );
}

/**
 * Close (X) — the bespoke 14×14 variant (stroke drawn on the `<svg>` element itself in the
 * prototype, recreated here as `currentColor` for consistency). Used 3× across the bundle
 * (Feed's fullscreen close, Saved's toast dismiss echo, Install's banner dismiss) versus the
 * 24-grid variant Gallery uses once — this is the more representative "canonical" Close.
 */
export function Close({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className={className}
      {...rest}
    >
      <path d="M1 1l12 12M13 1L1 13" />
    </svg>
  );
}

/** ChevronLeft — back navigation (Saved screen's top bar). */
export function ChevronLeft({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** ChevronsUpDown — the gallery details sheet's "drag to close" hint. */
export function ChevronsUpDown({ size = 13, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M7 9l5-5 5 5" />
      <path d="M7 15l5 5 5-5" />
    </svg>
  );
}

/** Envelope — landing page's "check your inbox" confirmation state. */
export function Envelope({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <rect x={3} y={5} width={18} height={14} rx={2} />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/** Diamond — the small serendipity/connective-row bullet. Fill-only; never had a stroke. */
export function Diamond({ size = 9, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      className={className}
      {...rest}
    >
      <path d="M5 0l5 5-5 5-5-5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Logo — the ring-and-dot brand mark. Three circles, no paths at all. Values are the redesign's
 * exact mark spec (README "Floating toolbar"): 26 viewBox, ring r=11.5 stroke 1.7, inner dot
 * r=3.6 filled, satellite dot r=1.9 at (21,7).
 */
export function Logo({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      className={className}
      {...rest}
    >
      <circle
        cx={13}
        cy={13}
        r={11.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
      />
      <circle cx={13} cy={13} r={3.6} fill="currentColor" />
      <circle cx={21} cy={7} r={1.9} fill="currentColor" />
    </svg>
  );
}

/** Check — the install-flow success checkmark. */
export function Check({ size = 24, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Lock — landing page's "your invite stays private" caption. */
export function Lock({ size = 12, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <rect x={3} y={11} width={18} height={10} rx={2} />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

/** Info — the gallery's swipe-gesture hint row. */
export function Info({ size = 12, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M12 8v.01M11 12h1v4h1" />
    </svg>
  );
}

/** PlusSquare — the install flow's "add to home screen" step icon. */
export function PlusSquare({ size = 17, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <rect x={4} y={4} width={16} height={16} rx={4} />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** Magnifier — the feed long-press sheet's "Closer Look" action (5.6). Rendered in accent. */
export function Magnifier({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <circle cx={11} cy={11} r={7} />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
