"use client";

import * as React from "react";

import { useMediaQuery } from "~/hooks/use-media-query";

// The profile glyph — the left item in the toolbar pill (and the top of the desktop rail): a
// rounded head-and-shoulders filled with a slow four-colour flow that moves outward from the
// chest. Ben drew it in Claude Design on 09-26-26 ("option 6f: colour flow + fast-forward on
// tap") and the design source is `docs/profile-glyph/` — a self-contained web component
// (`ambit-profile-glyph.js`) and the same values as tokens (`profile-glyph.tokens.json`). This
// file is a React port of that component, not a wrapper around it, for three reasons:
//
// 1. **It renders on the server.** The web component builds its SVG in `connectedCallback`, so
//    the server would emit an empty tag and the glyph would pop in after hydration. An SVG in JSX
//    is in the first byte of HTML like every other icon in `components/icons`.
// 2. **The CSP.** The web component writes a `<style>` into its shadow root; the app's
//    `style-src` happens to allow inline styles today, but the shadow DOM is the one place we'd be
//    relying on it for something that isn't a React inline `style` attribute.
// 3. **`docs/` is not in the container image** (the redeploy checklist), so nothing under `src`
//    may import from it. The token values are copied in below, with the file they came from named
//    so a future edit in Claude Design has one place to land.
//
// It replaces `AvatarChip` in the two toolbars only. The chip stays on the Profile hub (88 px) and
// Edit profile (104 px), where it is the reader's own gradient rather than a button glyph — this
// glyph has no per-reader hue; its four colours are the same for everyone.
//
// **Motion.** The ambient flow is SMIL — `<animate>` on the radial gradient's stops — so it runs
// with no JavaScript at all, and keeps running while React is busy. Each stop lags the one inside
// it by one colour, which is what makes the colours appear to travel outward. The tap ("rush")
// is a second SVG laid over the first that plays one full cycle in 900 ms with `fill="freeze"`,
// cross-faded in over its first 10% and out over its last 15% by the Web Animations API — the
// slow flow underneath never restarts, so the eye reads a fast-forward rather than a cut.
//
// **Reduced motion** departs from the token file on purpose (09-27-26). The export says "static
// periwinkle fill; tap has no motion", and the port shipped that way — and on Ben's Mac, which has
// Reduce Motion on at the OS level, the glyph was a flat disc: the animation "didn't make it into
// the dev version". The app's rule since the landing's 09-26 amendment
// (`docs/DESIGN_landing-redo.md`) is that reduced motion is a gentler tempo, never a still. The
// ambient flow is a colour cross-fade with no spatial movement — nothing pans, zooms or cuts, which
// is what the setting exists to remove — so it keeps playing; the 900 ms rush is the one thing
// that reads as motion, and that is what reduced motion drops. The query is read through
// `useMediaQuery`, so the server and the first client render agree (both flow) and only the tap's
// behaviour changes at hydration.

/** From `docs/profile-glyph/profile-glyph.tokens.json` (variant 6f). Keep the two in step. */
export const PROFILE_GLYPH_TOKENS = {
  color: {
    periwinkle: "#A8AEFF",
    terracotta: "#E0A184",
    sage: "#7FC4B0",
    butter: "#E8D48A",
  },
  flow: {
    /** The order the colours pass through, centre outward. */
    order: ["periwinkle", "terracotta", "sage", "butter"],
    durationMs: 10000,
    /** One `keySplines` entry per colour step. */
    keySpline: ".45 0 .55 1",
    stops: [0, 0.33, 0.66, 1],
    /** The gradient's centre — the chest, not the box's middle. */
    center: [12, 14],
    radius: 12,
  },
  rush: {
    durationMs: 900,
    fade: { opacity: [0, 1, 1, 0], offsets: [0, 0.1, 0.85, 1] },
  },
  geometry: {
    viewBox: "0 0 24 24",
    head: { cx: 12, cy: 7.2, r: 5 },
    body: "M2.8 20.2C2.8 15.9 7 13.5 12 13.5S21.2 15.9 21.2 20.2Q21.2 22.4 19 22.4H5Q2.8 22.4 2.8 20.2Z",
    /** Drawn at 29 inside the pill's 31 px slot. */
    defaultSize: 29,
  },
} as const;

const T = PROFILE_GLYPH_TOKENS;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const COLORS = T.flow.order.map((k) => T.color[k]);

/**
 * The colour sequence stop `i` cycles through: the palette rotated by `i`, then closed back on
 * its first value so the loop is seamless. The rotation is *backwards* per stop (`-i`), which is
 * what sends the colours outward: the outermost stop is always one colour behind the one inside
 * it, so the change reaches it a step later.
 */
export function stopValues(stopIndex: number): string {
  const n = COLORS.length;
  return Array.from(
    { length: n + 1 },
    (_, t) => COLORS[(((t - stopIndex) % n) + n) % n],
  ).join(";");
}

export interface ProfileGlyphHandle {
  /** Play one fast cycle over the ambient flow. A no-op under reduced motion. */
  rush: () => void;
}

export interface ProfileGlyphProps {
  size?: number;
  /** Multiplier on the ambient loop; `2` runs it in five seconds. */
  speed?: number;
  /** Turn the ambient flow off. Reduced motion does this on its own. */
  still?: boolean;
  className?: string;
}

/**
 * The glyph's shapes — head and shoulders — filled once. Both the ambient layer and a rush layer
 * are this pair with a different gradient behind them.
 */
function Shapes({ fill }: { fill: string }) {
  const { head, body } = T.geometry;
  return (
    <>
      <circle cx={head.cx} cy={head.cy} r={head.r} fill={fill} />
      <path d={body} fill={fill} />
    </>
  );
}

/**
 * The radial gradient whose stops cycle through the palette. `once` plays a single cycle and
 * holds its last frame (the rush layer); otherwise it loops. `still` writes no animation at all —
 * every stop is the first colour, a flat periwinkle.
 */
function FlowGradient({
  id,
  durationS,
  still = false,
  once = false,
}: {
  id: string;
  durationS: number;
  still?: boolean;
  once?: boolean;
}) {
  const [cx, cy] = T.flow.center;
  const splines = Array<string>(COLORS.length).fill(T.flow.keySpline).join(";");
  return (
    <radialGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      cx={cx}
      cy={cy}
      r={T.flow.radius}
    >
      {T.flow.stops.map((offset, i) => (
        <stop key={offset} offset={offset} stopColor={COLORS[0]}>
          {still ? null : (
            <animate
              attributeName="stop-color"
              values={stopValues(i)}
              dur={`${durationS}s`}
              calcMode="spline"
              keySplines={splines}
              {...(once ? { fill: "freeze" } : { repeatCount: "indefinite" })}
            />
          )}
        </stop>
      ))}
    </radialGradient>
  );
}

export const ProfileGlyph = React.forwardRef<
  ProfileGlyphHandle,
  ProfileGlyphProps
>(function ProfileGlyph(
  { size = T.geometry.defaultSize, speed = 1, still = false, className },
  ref,
) {
  // `useId`, never a module counter: two glyphs on one page (the pill and a popover, say) must
  // not share a gradient id, and a counter would also differ between server and client.
  const id = React.useId();
  const reduced = useMediaQuery(REDUCED_MOTION);
  // Reduced motion silences the rush only; the ambient cross-fade is `still`'s to turn off.
  const frozen = still || reduced;
  const durationS = T.flow.durationMs / 1000 / (speed || 1);

  // The rush layer's key. A new number mounts a fresh layer (a second tap restarts the fast
  // cycle, as the spec asks); null means none is playing.
  const [rushKey, setRushKey] = React.useState<number | null>(null);
  const rushRef = React.useRef<SVGSVGElement>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      rush: () => {
        if (frozen) return;
        setRushKey((k) => (k ?? 0) + 1);
      },
    }),
    [frozen],
  );

  // Fade the rush layer in and out over its cycle, then unmount it. `animate` is optional-called
  // because jsdom has no Web Animations API; there the layer simply leaves when the cycle would
  // have ended.
  React.useEffect(() => {
    if (rushKey === null) return;
    const svg = rushRef.current;
    const done = () => setRushKey(null);
    const { durationMs, fade } = T.rush;
    const anim = svg?.animate?.(
      fade.opacity.map((opacity, i) => ({ opacity, offset: fade.offsets[i] })),
      { duration: durationMs, fill: "forwards" },
    );
    if (anim) {
      anim.onfinish = done;
      return () => anim.cancel();
    }
    const t = setTimeout(done, durationMs);
    return () => clearTimeout(t);
  }, [rushKey]);

  const svgProps = {
    width: size,
    height: size,
    viewBox: T.geometry.viewBox,
    "aria-hidden": true as const,
  };

  return (
    <span
      data-glyph="profile"
      className={className}
      style={{
        position: "relative",
        display: "inline-flex",
        width: size,
        height: size,
        flex: "none",
      }}
    >
      <svg {...svgProps} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <FlowGradient id={id} durationS={durationS} still={still} />
        </defs>
        <Shapes fill={`url(#${id})`} />
      </svg>
      {rushKey !== null ? (
        <svg
          key={rushKey}
          ref={rushRef}
          data-rush
          {...svgProps}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            overflow: "visible",
            pointerEvents: "none",
            // Invisible until the fade takes over — the effect below runs after this frame has
            // painted, and a layer that started at full opacity would flash before it faded in.
            opacity: 0,
          }}
        >
          <defs>
            <FlowGradient
              id={`${id}r${rushKey}`}
              durationS={T.rush.durationMs / 1000}
              once
            />
          </defs>
          <Shapes fill={`url(#${id}r${rushKey})`} />
        </svg>
      ) : null}
    </span>
  );
});
