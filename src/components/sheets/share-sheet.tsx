"use client";

import * as React from "react";

import { Download } from "~/components/icons";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// The share sheet. Copy-link row + a scrolling row of targets.
//
// **All six targets go through `navigator.share`** (Phase 5.5 decision). The prototype only toasts,
// and the obvious alternative — six per-service intent URLs — means owning six third-party URL
// contracts that rot, one of which (Instagram Stories) has no reliable web intent at all. On iOS,
// which is the platform this PWA is built for, the OS share sheet is what a user expects anyway.
// The six circles stay because they're the design's own visual rhythm, and because the OS sheet
// they open is where the real choice happens.
//
// The **Save image** row (5.7) appears only in image contexts, and only when the caller supplies a
// handler — an article's share sheet has no image to offer. It was blocked until now on the image
// proxy: museum servers bot-block third-party fetchers (CLAUDE.md), so a cross-origin client-side
// download couldn't work. With `/api/img/[itemId]` serving from Ambit's own origin, it can.

/** Targets, in the design's order. The three letter-glyph brands render a Sora 700 character. */
const TARGETS = [
  { name: "Messages", glyph: "icon" as const },
  { name: "Stories", glyph: "icon" as const },
  { name: "X", glyph: "X" },
  { name: "Pinterest", glyph: "P" },
  { name: "WhatsApp", glyph: "W" },
  { name: "Email", glyph: "icon" as const },
];

// Kept local rather than added to `~/components/icons`: that set is the design system's UI
// vocabulary (bookmark, share, chevrons...), and these are third-party brand/app marks that appear
// exactly once, in this sheet. Recreated from `Ambit - Item Image.dc.html:112-127`.
function TargetGlyph({ name }: { name: string }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "Messages") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" {...stroke}>
        <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.7 8.7 0 01-3.4-.7L3 21l1.8-4.3A8.4 8.4 0 1121 11.5z" />
      </svg>
    );
  }
  if (name === "Stories") {
    return (
      <svg width={21} height={21} viewBox="0 0 24 24" {...stroke}>
        <rect x={3.5} y={3.5} width={17} height={17} rx={5} />
        <circle cx={12} cy={12} r={4} />
        <circle cx={17.2} cy={6.8} r={1} fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={21} height={21} viewBox="0 0 24 24" {...stroke}>
      <rect x={3} y={5} width={18} height={14} rx={2.5} />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** The thing being shared. `title` rides along into the OS share sheet. */
  url: string;
  title: string;
  /** Sharing a collection rather than an item (5.9) — only changes the sheet's title. */
  collection?: boolean;
  /** Whether the thing being shared is an image — gates the Save-image row. */
  imageContext?: boolean;
  /**
   * Fetches the full-resolution image and hands it to the OS (or falls back to a download). The
   * work lives with the caller, which knows the item id; the sheet only owns the row. Absent on an
   * article, and the row is then absent too.
   */
  onSaveImage?: () => void;
  onCopied: (url: string) => void;
  /** No `navigator.share` and no clipboard — the screen should say so rather than fail silently. */
  onShareUnavailable: () => void;
}

export function ShareSheet({
  open,
  onClose,
  url,
  title,
  collection = false,
  imageContext = false,
  onSaveImage,
  onCopied,
  onShareUnavailable,
}: ShareSheetProps) {
  const copy = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(url);
      onCopied(url);
    } catch {
      // Clipboard access needs a secure context; it's simply absent over plain http on a LAN,
      // which is exactly how this gets tested on a phone.
      onShareUnavailable();
    }
  };

  const share = async () => {
    onClose();
    if (!navigator.share) {
      onShareUnavailable();
      return;
    }
    try {
      await navigator.share({ title, url });
    } catch (err) {
      // Dismissing the OS sheet rejects with AbortError. That's a normal outcome, not a failure —
      // toasting an error there would be actively wrong.
      if ((err as Error)?.name !== "AbortError") onShareUnavailable();
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={collection ? "Share this collection" : "Share"}
    >
      <div className="border-hairline border-ink/10 mx-[18px] flex items-center gap-2.5 rounded-full py-1.5 pr-1.5 pl-[15px]">
        <span className="text-ink/60 min-w-0 flex-1 truncate font-mono text-[12.5px]">
          {/* The scheme is noise in a share sheet — the design shows a bare host + path. */}
          {url.replace(/^https?:\/\//, "")}
        </span>
        <button
          type="button"
          onClick={copy}
          onPointerDown={(e) => e.stopPropagation()}
          className="bg-accent text-on-accent flex-none rounded-full px-4 py-2 text-[12.5px] font-semibold"
        >
          Copy link
        </button>
      </div>

      <div className="flex gap-[14px] overflow-x-auto px-[18px] pt-[18px] pb-1">
        {TARGETS.map((t) => (
          <button
            key={t.name}
            type="button"
            // Explicit label, and the visuals hidden from the accessibility tree: the brand
            // targets are a bare letter glyph over a caption, which announces as "X X" at best and
            // "P" at worst.
            aria-label={`Share via ${t.name}`}
            onClick={share}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex flex-none flex-col items-center gap-[7px]"
          >
            <span
              aria-hidden
              className="border-hairline bg-ink/6 border-ink/12 text-ink flex size-[52px] items-center justify-center rounded-full"
            >
              {t.glyph === "icon" ? (
                <TargetGlyph name={t.name} />
              ) : (
                <span className="text-[19px] font-bold">{t.glyph}</span>
              )}
            </span>
            <span aria-hidden className="text-ink/50 text-[10.5px]">
              {t.name}
            </span>
          </button>
        ))}
      </div>

      {/* Both conditions, not either: `imageContext` says there *is* an image, `onSaveImage` says
          someone can actually fetch it. A row that appears without a handler is a dead button. */}
      {imageContext && onSaveImage ? (
        <>
          <div className="bg-ink/10 mx-[18px] mt-[14px] h-[0.5px]" />
          <button
            type="button"
            onClick={() => {
              onClose();
              onSaveImage();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex w-full items-center gap-[13px] px-[18px] py-[15px] text-left"
          >
            <Download size={18} className="text-accent flex-none" />
            <span className="min-w-0">
              <span className="text-ink block text-[14.5px] font-medium">
                Save image
              </span>
              <span className="text-ink/42 mt-[2px] block text-[11.5px]">
                Adds the full-resolution image to your camera roll
              </span>
            </span>
          </button>
        </>
      ) : null}
    </BottomSheet>
  );
}
