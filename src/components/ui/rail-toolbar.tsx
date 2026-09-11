"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Bookmark, Logo, Share } from "~/components/icons";
import { markProfileOrigin } from "~/components/profile/profile-origin";
import { AvatarChip } from "~/components/ui/avatar-chip";
import {
  TOOLBAR_GLASS,
  type PillToolbarProps,
} from "~/components/ui/pill-toolbar";
import { cn } from "~/lib/utils";

// The desktop toolbar (docs/DESIGN_chrome-redesign.md §2): the pill's four controls stood on end,
// fixed at the right edge and vertically centred — "the buttons will be located down the right
// side" — a bit bigger and a bit further apart than on the phone. Same props as `PillToolbar`
// (`Toolbar` picks between them by breakpoint) plus `visible`, for the one screen where the
// toolbar belongs to something that fades: the item screen's chrome (decision 3).
//
// No full-width wrapper here, so none of the pill's `pointer-events` split: the nav *is* the
// element, 68px wide, and takes pointer events like any other control.
//
// **Hidden means `visibility: hidden`, not `pointer-events: none`** — the same reasoning as
// hero-rail.tsx's chrome block: `visibility` transitions discretely (visible at once, hidden only
// after the fade) and no descendant can override it. An invisible control that still takes clicks
// is worse than no control at all.

export type RailToolbarProps = PillToolbarProps & {
  /** Default true. False fades the rail out over the chrome's 600ms and takes it out of the tab order. */
  visible?: boolean;
};

/** 52px hit areas, glyphs up to 38 — bigger than the pill's 48/34, as the review asked. */
function RailButton({
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

  return (
    <nav
      aria-label="Ambit toolbar"
      data-testid="rail-toolbar"
      aria-hidden={!visible}
      // `-translate-y-1/2` writes the standalone `translate` property (Tailwind v4), so the
      // fade's `transform` nudge below composes with it instead of replacing it.
      className={cn(
        TOOLBAR_GLASS,
        "fixed top-1/2 right-[26px] z-30 flex -translate-y-1/2 flex-col items-center gap-[16px] rounded-full px-2 py-[14px]",
        className,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateX(10px)",
        visibility: visible ? "visible" : "hidden",
        transition: "opacity .6s ease, transform .6s ease, visibility .6s",
      }}
    >
      <RailButton label="Profile" onClick={goProfile}>
        <AvatarChip size={32} />
      </RailButton>

      <RailButton label="Feed" onClick={goHome}>
        <Logo size={38} className="text-white/95" />
      </RailButton>

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

      {onShare ? (
        <RailButton
          label="Share"
          onClick={(e) => onShare(e.currentTarget.getBoundingClientRect())}
        >
          <Share size={27} className="text-white/82" />
        </RailButton>
      ) : null}

      {extra}
    </nav>
  );
}
