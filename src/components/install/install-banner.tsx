"use client";

import { Close } from "~/components/icons";
import { Button } from "~/components/ui/button";
import { IconButton } from "~/components/ui/icon-button";

// The collapsed "Keep Ambit close" card (`Ambit - Install.dc.html`, stage 1 of 3).
//
// It sits at `bottom-[96px]` rather than the prototype's flush-to-the-bottom position because this
// app has a floating pill toolbar at `bottom-[26px]` (see `ui/pill-toolbar.tsx`) that the prototype
// screen doesn't show. Overlapping them would put an install ask on top of the app's primary
// navigation, which is both ugly and a mis-tap waiting to happen.
export interface InstallBannerProps {
  onAdd: () => void;
  onDismiss: () => void;
}

export function InstallBanner({ onAdd, onDismiss }: InstallBannerProps) {
  return (
    <div
      data-testid="install-banner"
      className="bg-surface border-ink/10 animate-rise fixed inset-x-[14px] bottom-[96px] z-20 flex items-center gap-3 rounded-[20px] border px-4 py-[14px]"
      style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}
    >
      {/* The app's own icon, not a generic glyph — the reader is being asked to put *this* on their
          home screen, so showing them what will land there is the honest illustration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon-192.png"
        alt=""
        className="size-10 flex-none rounded-[10px]"
      />

      <div className="min-w-0 flex-1">
        <div className="text-ink-hi text-[14.5px] font-semibold">
          Keep Ambit close
        </div>
        <div className="text-ink/55 mt-[2px] text-[12.5px] leading-[1.45]">
          Add it to your home screen — opens full-screen, works offline.
        </div>
      </div>

      <Button size="sm" shape="pill" onClick={onAdd} className="flex-none">
        Add
      </Button>
      <IconButton
        aria-label="Not now"
        onClick={onDismiss}
        className="flex-none"
      >
        <Close size={14} />
      </IconButton>
    </div>
  );
}
