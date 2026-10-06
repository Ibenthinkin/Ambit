import * as React from "react";

import type { MessageKind } from "~/components/feed/masonry";
import { Button } from "~/components/ui/button";
import { Eyebrow } from "~/components/ui/eyebrow";
import { EXPLORE_BLOCKS, type ExploreAction } from "~/config/explore";

// `/explore`'s message block (09-26-26, docs/PLAN_explore-route.md) — one per page of the signed-
// out feed, rotating "what is this?" → sign up → sign in, plus the end card the taste closes on.
//
// Modeled on `BecauseTile` and meant to sit as quietly in the grid: the same hairline card, the
// same eyebrow diamond, one line of copy. What it adds is a button, because unlike the Because
// tile it is asking the reader something. The words are all in `config/explore.ts`.
export interface MessageTileProps {
  message: MessageKind;
  onAction: (action: ExploreAction) => void;
}

export function MessageTile({ message, onAction }: MessageTileProps) {
  const copy = EXPLORE_BLOCKS[message];
  return (
    <div
      data-explore-message={message}
      className="border-hairline bg-ink/3 border-ink/6 border px-[13px] py-4"
    >
      <Eyebrow dot>Ambit</Eyebrow>
      <p className="text-ink mt-[9px] text-[15px] leading-[1.35]">
        {copy.title}
      </p>
      <p className="text-ink/50 mt-[6px] text-[12px] leading-[1.5]">
        {copy.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {copy.actions.map(({ action, label }, i) => (
          <Button
            key={action}
            size="sm"
            // The first button is the block's ask; any others are quieter alternatives.
            variant={i === 0 ? "primary" : "outline"}
            onClick={() => onAction(action)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
