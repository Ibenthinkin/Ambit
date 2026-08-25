"use client";

import { Logo } from "~/components/icons";

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

export interface AuthSheetProps {
  open: boolean;
  /**
   * Collapse back to the slideshow. Omitted in static mode (`/reset-password`), where there is
   * nothing to go back to — the logo then renders as plain decoration.
   */
  onCollapse?: () => void;
  children: React.ReactNode;
}

export function AuthSheet({ open, onCollapse, children }: AuthSheetProps) {
  return (
    <>
      {/* Non-interactive by design: the prototype's scrim has no handler, and collapsing is the
          logo circle's job. A scrim that dismissed on tap would fight the slideshow's own
          tap-to-skip, which sits directly underneath it. */}
      <div
        aria-hidden
        className="fixed inset-0 z-30 transition-opacity duration-[400ms] ease-out"
        style={{
          background: "rgba(9,8,6,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      <div
        data-testid="auth-sheet"
        data-open={open ? "true" : "false"}
        className={[
          "bg-surface border-ink/10 fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto",
          "rounded-t-[28px] border-t px-[26px] pt-[14px]",
          // The safe-area inset keeps the last control clear of the iPhone home indicator; the
          // max-height plus scroll is what stops sign-up mode (an extra field) from pushing the
          // submit button off a small screen once the keyboard is up.
          "pb-[calc(36px+env(safe-area-inset-bottom))]",
          "transition-transform duration-[550ms] ease-[cubic-bezier(.2,.9,.25,1)]",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
        style={{ boxShadow: "0 -20px 60px rgba(0,0,0,0.45)" }}
      >
        <div className="flex justify-center">
          {onCollapse ? (
            <button
              type="button"
              aria-label="Back to the slideshow"
              onClick={onCollapse}
              className="bg-ink/6 border-ink/12 mb-5 flex size-[54px] items-center justify-center rounded-full border"
            >
              <Logo size={30} className="text-accent" />
            </button>
          ) : (
            <div
              aria-hidden
              className="bg-ink/6 border-ink/12 mb-5 flex size-[54px] items-center justify-center rounded-full border"
            >
              <Logo size={30} className="text-accent" />
            </div>
          )}
        </div>

        {/* The hero, at the prototype's *sheet* scale. It used to be a 42px display headline on a
            near-empty screen; inside a panel that also has to hold four form fields, the redesign
            gives the same words a supporting role instead. `whitespace-nowrap` is the prototype's
            — the line is tuned to sit on one row at 402px. */}
        <div className="text-left">
          <div className="text-ink-hi text-[16px] leading-[1.2] tracking-[0.1px] whitespace-nowrap">
            A quieter way to be curious.
          </div>
          <p className="text-ink/60 mt-[10px] max-w-[320px] text-[14.5px] leading-[1.55]">
            No feeds engineered to keep you. Ambit hands you one interesting
            thing at a time, then quietly steps back.
          </p>
          <div className="text-ink-hi mt-[14px] text-[16px] tracking-[0.1px]">
            Ambit
          </div>
        </div>

        <div className="mt-[26px]">{children}</div>
      </div>
    </>
  );
}
