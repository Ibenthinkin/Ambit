"use client";

// Three candidate profile marks (docs/DESIGN_landing-redo.md D7) to replace `AvatarChip`'s gradient
// disc — a straight copy of Cosmos's. Same brief for each: abstract, no photograph, the reader's
// hue from `lib/avatar-hue.ts`, legible at 28 px in the pill and at 104 px on Edit profile, and
// on a picture as well as on the app's ground (the rail toolbar sits over the feed).
//
// Ben picks on `/dev/marks`; the plan's Task 9 points `AvatarChip` at the winner and deletes the
// other two. Until then production keeps the current chip — nothing here is wired into the app.
//
// All three share the Logo's 26 × 26 grid and 11.5 radius, so a mark sits in the toolbar exactly
// where the chip did.
import * as React from "react";
import type { SVGProps } from "react";

export interface MarkProps extends Omit<
  SVGProps<SVGSVGElement>,
  "width" | "height"
> {
  size: number;
  /** `avatarHue(userId)`, 0–359. */
  hue: number;
}

// The same hue arithmetic as `gradientForHue` — light stop, mid stop 18° on — plus a deep shade of
// the second hue for the dark halves.
const light = (hue: number) => `hsl(${hue} 62% 72%)`;
const mid = (hue: number) => `hsl(${(hue + 18) % 360} 54% 46%)`;
const deep = (hue: number) => `hsl(${(hue + 18) % 360} 40% 22%)`;
/** The screen ground (`--color-bg`), for the cut-outs. */
const GROUND = "#161411";

/**
 * 1. **Orbit** — the Logo's geometry made personal: the reader's gradient as a disc, with the
 * Logo's small satellite on its rim at an angle taken from the same hue. Two readers differ in
 * colour *and* in where their moon sits. Recommended.
 */
export function OrbitMark({ size, hue, ...rest }: MarkProps) {
  // useId, not the hue: two marks of the same reader on one page must not share a gradient id.
  const id = React.useId();
  const a = (hue * Math.PI) / 180;
  const cx = 13 + 9.6 * Math.cos(a);
  const cy = 13 + 9.6 * Math.sin(a);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light(hue)} />
          <stop offset="1" stopColor={mid(hue)} />
        </linearGradient>
      </defs>
      <circle cx={13} cy={13} r={11.5} fill={`url(#${id})`} />
      <circle
        data-satellite
        cx={cx.toFixed(2)}
        cy={cy.toFixed(2)}
        r={2.4}
        fill={GROUND}
        stroke={light(hue)}
        strokeWidth={1}
      />
    </svg>
  );
}

/** 2. **Terminator** — a disc split light/dark along a per-reader angle: a planet's day side. */
export function TerminatorMark({ size, hue, ...rest }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      {...rest}
    >
      <circle cx={13} cy={13} r={11.5} fill={deep(hue)} />
      <path
        d="M13 1.5 A11.5 11.5 0 0 1 13 24.5 Z"
        fill={light(hue)}
        transform={`rotate(${hue} 13 13)`}
      />
    </svg>
  );
}

/** 3. **Ring** — the reader's hue as a thick ring around a dark centre; no fill. */
export function RingMark({ size, hue, ...rest }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      {...rest}
    >
      <circle
        cx={13}
        cy={13}
        r={9.5}
        fill="none"
        stroke={light(hue)}
        strokeWidth={4}
      />
      <circle cx={13} cy={13} r={7.5} fill={GROUND} />
    </svg>
  );
}
