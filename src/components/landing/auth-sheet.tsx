"use client";

import * as React from "react";

// The landing's sign-in panel: the surface that rises when the slideshow finishes.
//
// **Why this isn't `BottomSheet`.** Every other sheet in the app is *summoned* — it doesn't exist
// until something asks for it, and it unmounts when it leaves (see `ui/bottom-sheet.tsx`, whose
// exit animation is the reason it carries state at all). This one is the opposite: it is present
// from the first paint and merely translated off-screen, sliding in on its own 550ms curve rather
// than the app's 260ms one, over a scrim that isn't clickable. Bending `BottomSheet` into that
// shape would mean a third variant, a third animation pair and an "actually never unmount" flag —
// more surface area, in the shared primitive every other screen depends on, than the sixty lines
// below.
//
// Being mounted from the start is also load-bearing rather than incidental: the form inside is in
// the DOM before the reader has done anything, which is what `e2e/support.ts`'s
// `waitForHydration(page, "form")` waits on, and what lets a password manager see the fields.

// The header row's right-hand mode label ("Sign in" / "Create account") belongs to the card's state
// machine, but the row belongs to the sheet. The card reports its label up through this context,
// so neither parent (landing, explore) has to hold the mode. Outside a sheet it is a no-op.
const noop = () => undefined;
const ModeLabelContext = React.createContext<(label: string) => void>(noop);

/** Called by `AuthCard` with the header row's mode label; "" clears it. */
export function useReportAuthMode(label: string) {
  const report = React.useContext(ModeLabelContext);
  React.useEffect(() => {
    report(label);
    return () => report("");
  }, [report, label]);
}

// The orbit glyph (DESIGN §6.7): ink ring and dot, with the satellite dot in the accent — the one
// place the mark wears green, so it is drawn here rather than by `Logo` (currentColor throughout).
function OrbitGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 26 26" aria-hidden>
      <circle
        cx={13}
        cy={13}
        r={11.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
      />
      <circle cx={13} cy={13} r={3.6} fill="currentColor" />
      <circle cx={21} cy={7} r={1.9} fill="var(--color-accent)" />
    </svg>
  );
}

/** The header's mark: the orbit glyph beside a mono "Ambit" — drawn once for both of its hosts. */
function Brand() {
  return (
    <>
      <OrbitGlyph />
      <span className="text-ink/85 font-mono text-[11px] tracking-[0.04em] uppercase">
        Ambit
      </span>
    </>
  );
}

export interface AuthSheetProps {
  open: boolean;
  /**
   * Collapse back to the slideshow. Omitted in static mode (`/reset-password`), where there is
   * nothing to go back to — the logo then renders as plain decoration.
   */
  onCollapse?: () => void;
  /** What the logo button says it does. The landing collapses to its slideshow; `/explore`
   *  (09-26-26) goes back to the feed underneath. */
  collapseLabel?: string;
  /**
   * The product pitch above the form. On by default, and switched off for `/reset-password`: a
   * reader who followed a reset link is mid-task and already has an account, so selling them the
   * app above the words "This link has expired" is noise in front of the thing they came for. The
   * slideshow, the logo and the sheet itself are what keep the two screens recognisably one app.
   */
  showHero?: boolean;
  children: React.ReactNode;
}

export function AuthSheet({
  open,
  onCollapse,
  collapseLabel = "Back to the slideshow",
  showHero = true,
  children,
}: AuthSheetProps) {
  const [modeLabel, setModeLabel] = React.useState("");
  return (
    <>
      {/* Non-interactive by design: the prototype's scrim has no handler, and collapsing is the
          logo circle's job. A scrim that dismissed on tap would fight the slideshow's own
          tap-to-skip, which sits directly underneath it. */}
      <div
        aria-hidden
        className="fixed inset-0 z-30 transition-opacity duration-[400ms] ease-out"
        style={{
          background: "rgba(6,6,6,0.62)",
          opacity: open ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      <div
        data-testid="auth-sheet"
        data-open={open ? "true" : "false"}
        className={[
          "bg-dialog border-ink/20 fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto",
          "border-t px-6 pt-[22px]",
          // The safe-area inset keeps the last control clear of the iPhone home indicator; the
          // max-height plus scroll is what stops sign-up mode (an extra field) from pushing the
          // submit button off a small screen once the keyboard is up.
          "pb-[calc(34px+env(safe-area-inset-bottom))]",
          // Above `md` (docs/DESIGN_desktop-polish.md §3): a 520px card centered both ways, square
          // (1b), a full border. It fades and settles rather than sliding — hence the
          // transition covers opacity too, and the closed state below is transparent rather than
          // off-screen. `md:inset-auto` clears the phone anchoring before `left/top` re-anchor.
          "md:shadow-dialog md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[80dvh] md:w-[520px] md:-translate-x-1/2 md:border md:px-8 md:pt-[26px] md:pb-[30px]",
          // `transition-[translate,opacity]`, not `transition-transform`: v4's translate utilities
          // write the `translate` property rather than `transform`, and the fade needs `opacity`
          // in the list for the desktop card to arrive at all.
          "transition-[translate,opacity] duration-[550ms] ease-[cubic-bezier(.2,.9,.25,1)]",
          open
            ? "translate-y-0 md:-translate-y-1/2 md:opacity-100"
            : "translate-y-full md:pointer-events-none md:-translate-y-[45%] md:opacity-0",
        ].join(" ")}
      >
        {/* The header row over a rule (DESIGN §6.7): the orbit glyph and mono "Ambit" at the
            left, the card's mode at the right. The glyph is still the collapse control. */}
        <div className="border-ink/16 flex items-center justify-between border-b pb-[14px]">
          {onCollapse ? (
            <button
              type="button"
              aria-label={collapseLabel}
              onClick={onCollapse}
              className="text-ink flex items-center gap-[10px]"
            >
              <Brand />
            </button>
          ) : (
            <div className="text-ink flex items-center gap-[10px]">
              <Brand />
            </div>
          )}
          <span className="text-ink/55 font-mono text-[11px] tracking-[0.04em] uppercase">
            {modeLabel}
          </span>
        </div>

        {/* The hero. `showHero` stays: the reset page is mid-task and skips the pitch. */}
        {showHero ? (
          <div className="mt-6 text-left">
            <div className="text-ink-hi text-[clamp(26px,3vw,32px)] leading-[1.12] font-normal tracking-[-0.02em]">
              A quieter way to be curious.
            </div>
            <p className="text-ink/68 mt-3 text-[16px] leading-[1.5] text-pretty">
              No feeds engineered to keep you. Ambit hands you one interesting
              thing at a time, then quietly steps back.
            </p>
          </div>
        ) : null}

        <ModeLabelContext.Provider value={setModeLabel}>
          <div className={showHero ? "mt-7" : "mt-6"}>{children}</div>
        </ModeLabelContext.Provider>
      </div>
    </>
  );
}
