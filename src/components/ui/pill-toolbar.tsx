"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Logo, Share } from "~/components/icons";
import { markProfileOrigin } from "~/components/profile/profile-origin";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { cn } from "~/lib/utils";

// The floating pill — one of the design's two backbone components, on nearly every screen from 5.6
// onward (feed, saved, item pages, gallery). A single translucent pill centered over the content,
// never a bar: "screens with a page-specific extra action put it in this same row; never add a
// second bar" (handoff README).
//
// **The `pointer-events` split is load-bearing, not a detail.** The wrapper spans the full width so
// the pill can center itself, but it's `pointer-events-none` — without that, an invisible
// full-width strip sits over the feed and eats every scroll gesture that starts near the bottom of
// the screen, which is most of them. Only the pill itself takes pointer events.
//
// **09-11-26 (docs/DESIGN_chrome-redesign.md §1).** The pill grew — 56px tall, glyphs ~12%
// bigger, 48px hit areas — and Share left it: when a screen has something to share, the share
// control is a **detached 56px disc** on the same glass, centred in the space between the pill's
// right edge and the screen's right edge (Cosmos's phone bar). The wrapper is a three-column grid
// for exactly that: the pill in the middle column, the disc in the right one, the empty left
// column keeping the pill centred. Above `md` none of this renders — `Toolbar` picks
// `RailToolbar` there.

/** The toolbar's surface — white-on-anything translucency, because it floats over arbitrary
 *  photographic content and cannot tint with the page. Shared by the pill, the Share disc and the
 *  desktop rail; values from the handoff README's pill spec. */
export const TOOLBAR_GLASS =
  "shadow-toolbar border-[0.5px] border-white/28 bg-[rgba(240,237,231,0.225)] backdrop-blur-[26px] backdrop-saturate-[180%]";

/**
 * - `idle` — outline bookmark. Nothing saved here.
 * - `saved` — accent-filled. The item currently on screen is already saved.
 * - `on-saved` — white-filled. This *is* the Saved screen (5.9).
 */
export type BookmarkState = "idle" | "saved" | "on-saved";

export interface PillToolbarProps {
  bookmark?: BookmarkState;
  /**
   * Called with the control's own rect, so a desktop popover can float beside it
   * (docs/DESIGN_chrome-redesign.md §2). Phone callers ignore the argument.
   */
  onBookmark: (anchor: DOMRect) => void;
  /**
   * Optional, and the Share disc is omitted entirely when it's absent. The feed is why: share
   * needs a *current item* to have a referent, and a feed has none — so the feed's pill is three
   * items (profile, mark, bookmark), matching the redesign's own Feed Masonry prototype, which
   * likewise omits it (PHASE5_PLAN_5.6.md Decision 3). Called with the disc's rect, like
   * `onBookmark`.
   */
  onShare?: (anchor: DOMRect) => void;
  /**
   * Defaults to navigating to `/profile`, marking the origin on the way so Profile's own exits pop
   * back here instead of rebuilding a dynamic feed (`profile-origin.ts`). Real as of 5.10 — until
   * that phase every screen passed an override that toasted "Profile is 5.10", because the route
   * didn't exist. Profile itself passes an inert override: you're already there.
   */
  onProfile?: () => void;
  /** Defaults to navigating to `/feed`. In the gallery this returns to the anchored feed (5.8). */
  onHome?: () => void;
  /** A page-specific action, rendered in the pill's own row rather than a second bar. */
  extra?: React.ReactNode;
  className?: string;
}

/**
 * Each control is a 48px tap target wrapping a smaller glyph — the README asks for ≥44px "in
 * production where the platform allows". The `-my-[6px]` keeps the pill at 56px — the button's
 * margin box is 36px, the pill's padding adds 20 — while the touch targets overlap into the
 * padding, exactly as the 44px/`-my-2` version did.
 */
function PillButton({
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
      // `stopPropagation` on pointer-down is the README's own rule for every save/share control:
      // without it a thumb resting here mid-scroll can fire the button.
      onPointerDown={(e) => e.stopPropagation()}
      className="-my-[6px] inline-flex h-12 min-w-12 flex-none items-center justify-center transition-transform duration-150 active:scale-95"
    >
      {children}
    </button>
  );
}

export function PillToolbar({
  bookmark = "idle",
  onBookmark,
  onShare,
  onProfile,
  onHome,
  extra,
  className,
}: PillToolbarProps) {
  const router = useRouter();
  const goProfile =
    onProfile ??
    (() => {
      markProfileOrigin();
      router.push("/profile");
    });
  const goHome = onHome ?? (() => router.push("/feed"));

  return (
    <div
      // `fixed`, not `absolute`, for the same reason as BottomSheet: no page in the app establishes
      // a positioning context, so `absolute` resolved against the initial containing block and the
      // pill scrolled away with the page instead of floating over it. A floating toolbar is
      // viewport-relative by definition.
      //
      // A `1fr auto 1fr` grid: the pill in the middle column is centred by the two flexible
      // columns whether or not the disc is in the third.
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[26px] z-30 grid grid-cols-[1fr_auto_1fr] items-center",
        className,
      )}
    >
      <nav
        aria-label="Ambit toolbar"
        className={cn(
          TOOLBAR_GLASS,
          "pointer-events-auto col-start-2 flex items-center gap-[28px] rounded-full px-[22px] py-[10px]",
        )}
      >
        <PillButton label="Profile" onClick={goProfile}>
          <AvatarChip size={28} />
        </PillButton>

        <PillButton label="Feed" onClick={goHome}>
          <Logo size={34} className="text-white/95" />
        </PillButton>

        <PillButton
          label="Save to collection"
          onClick={(e) => onBookmark(e.currentTarget.getBoundingClientRect())}
        >
          <Bookmark
            size={26}
            filled={bookmark !== "idle"}
            className={cn(
              bookmark === "idle" && "text-white/82",
              bookmark === "saved" && "text-accent",
              bookmark === "on-saved" && "text-white",
            )}
          />
        </PillButton>

        {extra}
      </nav>

      {/* Omitted, not disabled: a greyed-out share on the feed would still be asking "share
          what?". A sibling of the nav on purpose — it is not in the pill, it is beside it. */}
      {onShare ? (
        <button
          type="button"
          aria-label="Share"
          onClick={(e) => onShare(e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            TOOLBAR_GLASS,
            "pointer-events-auto col-start-3 inline-flex size-[56px] items-center justify-center justify-self-center rounded-full transition-transform duration-150 active:scale-95",
          )}
        >
          <Share size={25} className="text-white/82" />
        </button>
      ) : null}
    </div>
  );
}
