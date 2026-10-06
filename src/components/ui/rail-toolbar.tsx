"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Logo, Share } from "~/components/icons";
import {
  ProfileGlyph,
  type ProfileGlyphHandle,
} from "~/components/icons/profile-glyph";
import { markProfileOrigin } from "~/components/profile/profile-origin";
import {
  TOOLBAR_GLASS,
  type PillToolbarProps,
} from "~/components/ui/pill-toolbar";
import { cn } from "~/lib/utils";

// The desktop toolbar (docs/DESIGN_chrome-redesign.md §2, amended 09-11-26 and again 09-12-26
// by Ben's review): a vertical **stack** fixed at the right edge and vertically centred — "the
// buttons will be located down the right side". Profile, Feed and Save share the bar (plus a
// page's `extra` between Feed and Save — the item screen's spread toggle since 09-27-26) — the same
// three the phone's pill holds — and **Share is the one detached disc below it**, the desktop twin
// of the phone's detached Share. Save belongs in the bar because it is on every screen: on the
// feed, Saved and Profile it opens the collections list (nothing to save there, so the sheet
// offers nothing to save), on the item screen the picker. Share is beside the bar because it is
// only ever on the item screen — it needs a current picture to refer to — so its absence must not
// change the bar's shape. Same props as `PillToolbar` (`Toolbar` picks between them by
// breakpoint), including `visible`, for the one screen where the toolbar belongs to something
// that fades: the item screen's chrome (decision 3).
//
// The stack is the positioned, fading element; the bar and the disc are its children and take
// pointer events like any other control. No full-width wrapper here, so none of the pill's
// `pointer-events` split.
//
// **Hidden means `visibility: hidden`, not `pointer-events: none`** — the same reasoning as
// hero-rail.tsx's chrome block: `visibility` transitions discretely (visible at once, hidden only
// after the fade) and no descendant can override it. An invisible control that still takes clicks
// is worse than no control at all.

export type RailToolbarProps = PillToolbarProps;

/** The stack's one width: the bar is 52 + 2×8 padding, and the disc matches it, as the phone's
 *  disc matches its pill's height. */
const DISC = "size-[68px]";

/**
 * 52px hit areas, glyphs up to 38 — bigger than the pill's 48/34, as the review asked. Exported
 * for a page's `extra` control (the item screen's spread toggle), so it matches the bar exactly.
 * `pressed` makes it a toggle button (`aria-pressed`); omitted, it is a plain button.
 */
export function RailButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      // The README's rule for every save/share control, kept here though a mouse rarely needs it.
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex size-[52px] flex-none items-center justify-center transition-transform duration-150 active:scale-95"
    >
      {children}
    </button>
  );
}

export function RailToolbar({
  bookmark = "idle",
  onBookmark,
  onShare,
  onProfile,
  onHome,
  extra,
  className,
  visible = true,
}: RailToolbarProps) {
  const router = useRouter();
  const goProfile =
    onProfile ??
    (() => {
      markProfileOrigin();
      router.push("/profile");
    });
  const goHome = onHome ?? (() => router.push("/feed"));
  // Same as the pill: the 52px button, not the glyph, plays the tap (`icons/profile-glyph.tsx`).
  const glyph = React.useRef<ProfileGlyphHandle>(null);

  // The item screen's desktop chrome (docs/DESIGN_redesign.md §6.3): a plain 450ms fade, no
  // slide — the prototype's `opacity .45s ease`, shared with the caption over the hero.
  const fade: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    visibility: visible ? "visible" : "hidden",
    transition: "opacity .45s ease, visibility .45s",
  };

  return (
    <div
      data-testid="rail-toolbar"
      aria-hidden={!visible}
      // `-translate-y-1/2` writes the standalone `translate` property (Tailwind v4), so a
      // `transform` on this element would compose with it rather than replace it. The fade has
      // none today (opacity only), but that is why the centring is not written as a transform.
      className={cn(
        "fixed top-1/2 right-[26px] z-30 flex -translate-y-1/2 flex-col items-center gap-[14px]",
        className,
      )}
      style={fade}
    >
      <nav
        aria-label="Ambit toolbar"
        className={cn(
          TOOLBAR_GLASS,
          "flex flex-col items-center gap-[16px] rounded-full px-2 py-[14px]",
        )}
      >
        <RailButton
          label="Profile"
          onClick={() => {
            glyph.current?.rush();
            goProfile();
          }}
        >
          {/* The pill's 36 scaled by the rail's ~1.12 (34 → 38 Logo): the mark draws 34 px
              tall against the Logo's 34 px disc. */}
          <ProfileGlyph ref={glyph} size={40} />
        </RailButton>

        <RailButton label="Feed" onClick={goHome}>
          <Logo size={38} className="text-white/95" />
        </RailButton>

        {/* A page's own control, between the logo and the bookmark where Ben drew it
            (docs/DESIGN_spread-mode.md D4). Only the item screen passes one — its spread
            toggle — so every other screen's bar stays Profile, Feed, Save. */}
        {extra}

        <RailButton
          label="Save to collection"
          onClick={(e) => onBookmark(e.currentTarget.getBoundingClientRect())}
        >
          <Bookmark
            size={29}
            filled={bookmark !== "idle"}
            className={cn(
              bookmark === "idle" && "text-white/82",
              bookmark === "saved" && "text-accent",
              bookmark === "on-saved" && "text-white",
            )}
          />
        </RailButton>
      </nav>

      {/* Detached, like the phone's Share disc: a sibling of the bar, not a child of it. Omitted
          without a handler rather than greyed out — the same "share what?" reasoning as the pill. */}
      {onShare ? (
        <RailDisc
          label="Share"
          onClick={(e) => onShare(e.currentTarget.getBoundingClientRect())}
        >
          <Share size={27} className="text-white/82" />
        </RailDisc>
      ) : null}
    </div>
  );
}

/** A detached disc on the bar's glass, the bar's own width, one glyph. */
function RailDisc({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        TOOLBAR_GLASS,
        DISC,
        "inline-flex flex-none items-center justify-center rounded-full transition-transform duration-150 active:scale-95",
      )}
    >
      {children}
    </button>
  );
}
