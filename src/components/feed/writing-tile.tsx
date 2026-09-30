"use client";

import { writingLabel } from "~/server/config/writing";
import type { FeedCard } from "~/server/services/feed";
import { ImageTile } from "./image-tile";

// Writing with a picture (docs/DESIGN_writing.md D5, writing Phase 4): a picture-led tile whose
// badge — `ESSAY · 12 MIN`, `LONG READ`, `READ` — and title sit on a scrim at its foot. It is the
// one feed tile that carries words over a picture, and that is the point: in a wall of pictures a
// reader has to be able to tell, before tapping, that this one is something to read.
//
// Everything else is `ImageTile`'s, reused rather than copied: the press and long-press, the
// keyboard and right-click, the retrying `<img>` and — mandatory, a CSP rule — the proxied src
// from `lib/image-src.ts`. The words go in through its `overlay` slot, so they sit inside the one
// pressable element and a tap on the title opens the piece like a tap anywhere else.
//
// The tile's height is its picture's (masonry.ts's `writingAspect`); nothing is added below it,
// which is why the title is clamped: a long Wikipedia title on a wide picture would otherwise
// climb out of the scrim.

export interface WritingTileProps {
  card: FeedCard;
  /** A literal Tailwind aspect class from `IMAGE_ASPECTS` — see masonry.ts on why literal. */
  aspectClass: string;
  onTap: () => void;
  /** Optional, as on `ImageTile` — Saved's tiles have no item sheet. */
  onLongPress?: () => void;
}

export function WritingTile({
  card,
  aspectClass,
  onTap,
  onLongPress,
}: WritingTileProps) {
  const { item } = card;
  return (
    <ImageTile
      card={card}
      aspectClass={aspectClass}
      onTap={onTap}
      onLongPress={onLongPress}
      overlay={
        // `pointer-events-none`: the words must never be the press target (see `overlay`). The
        // scrim is the sheet scrim's colour, so over a pale picture the white stays readable, and
        // it fades out well before the top so the picture still leads.
        <div className="from-scrim/85 via-scrim/45 to-scrim/0 pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t px-[12px] pt-10 pb-[11px]">
          <p className="text-ink/75 text-[9.5px] font-semibold tracking-[1.3px]">
            {writingLabel(item)}
          </p>
          <h2 className="text-ink-hi mt-[5px] line-clamp-3 text-[15px] leading-[1.25] font-semibold">
            {item.title}
          </h2>
        </div>
      }
    />
  );
}
