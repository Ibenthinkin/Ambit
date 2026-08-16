"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Logo, Share } from "~/components/icons";
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

/**
 * - `idle` — outline bookmark. Nothing saved here.
 * - `saved` — accent-filled. The item currently on screen is already saved.
 * - `on-saved` — white-filled. This *is* the Saved screen (5.9).
 */
export type BookmarkState = "idle" | "saved" | "on-saved";

export interface PillToolbarProps {
  bookmark?: BookmarkState;
  onBookmark: () => void;
  onShare: () => void;
  /** Defaults to navigating to `/profile` (5.10). */
  onProfile?: () => void;
  /** Defaults to navigating to `/feed`. In the gallery this returns to the anchored feed (5.8). */
  onHome?: () => void;
  /** A page-specific action, rendered in this same row rather than a second bar. */
  extra?: React.ReactNode;
  className?: string;
}

/**
 * Each control is a ≥44px tap target wrapping a smaller glyph — the README's 31px is the
 * prototype's floor, not a target, and it explicitly asks for ≥44px "in production where the
 * platform allows". The negative margins keep the *visual* rhythm at the designed 26px gap while
 * the touch targets themselves overlap into the pill's padding.
 */
function PillButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
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
      className="-my-2 inline-flex h-11 min-w-11 flex-none items-center justify-center transition-transform duration-150 active:scale-95"
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
  const goProfile = onProfile ?? (() => router.push("/profile"));
  const goHome = onHome ?? (() => router.push("/feed"));

  return (
    <div
      // `fixed`, not `absolute`, for the same reason as BottomSheet: no page in the app establishes
      // a positioning context, so `absolute` resolved against the initial containing block and the
      // pill scrolled away with the page instead of floating over it. A floating toolbar is
      // viewport-relative by definition.
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[26px] z-30 flex justify-center",
        className,
      )}
    >
      <nav
        aria-label="Ambit toolbar"
        // Values verbatim from the handoff README's pill spec. The background and border are
        // white-on-anything translucency rather than the app's ink ladder: this pill floats over
        // arbitrary photographic content, so it can't tint with the page.
        className="shadow-toolbar pointer-events-auto flex items-center gap-[26px] rounded-full border-[0.5px] border-white/28 bg-[rgba(240,237,231,0.225)] px-5 py-2 backdrop-blur-[26px] backdrop-saturate-[180%]"
      >
        <PillButton label="Profile" onClick={goProfile}>
          <AvatarChip size={25} />
        </PillButton>

        <PillButton label="Feed" onClick={goHome}>
          <Logo size={31} className="text-white/95" />
        </PillButton>

        <PillButton label="Save to collection" onClick={onBookmark}>
          <Bookmark
            size={24}
            filled={bookmark !== "idle"}
            className={cn(
              bookmark === "idle" && "text-white/82",
              bookmark === "saved" && "text-accent",
              bookmark === "on-saved" && "text-white",
            )}
          />
        </PillButton>

        <PillButton label="Share" onClick={onShare}>
          <Share size={23} className="text-white/82" />
        </PillButton>

        {extra}
      </nav>
    </div>
  );
}
