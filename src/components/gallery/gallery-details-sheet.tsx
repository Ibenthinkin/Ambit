"use client";

import * as React from "react";

import { BottomSheet } from "~/components/ui/bottom-sheet";
import { sourceLabel } from "~/lib/source-label";
import { TOPICS } from "~/server/config/topics";
import type { RailItem } from "~/server/services/gallery-rail";

// The gallery's one text surface: everything the corpus knows about the picture on screen, summoned
// by a tap-again or a slow swipe up from the title, and dismissed by dragging it back down.
//
// **What it is not** is a second item page. `/i/[itemId]` exists, it's canonical, and it's what a
// share link points at. This is the caption you'd want *while still looking* — so it leaves over the
// picture rather than instead of it, and a sideways swipe on the sheet cycles to the next work
// without closing anything (`onSwipeSide`, 5.8's addition to `BottomSheet`).
//
// **The facts table is schema-honest.** The prototype's rows were Medium / Origin / Where it lives,
// three fields the `item` table has never carried (verified at plan time: it holds `attribution`,
// `license`, `source`, `sourceUrl`, `topicId`, `summary`). Inventing them would mean either a
// permanent em-dash or a fabricated value, so the rows are the four facts that are actually true —
// and each one is **omitted entirely when null** rather than rendered empty. A table with three
// rows tells the reader the corpus knows three things; a table with three blanks tells them
// something is broken.

export interface GalleryDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  item: RailItem;
  /** Cycle to the neighbouring picture — the sheet closes and the rail advances. */
  onCycle: (dir: 1 | -1) => void;
}

const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? id;

/**
 * One row of the facts table. Rendered only by callers that have something to put in it — the
 * null-check lives at the call site so an absent fact costs no row at all.
 */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-hairline border-ink/8 flex gap-3 border-t py-[11px]">
      <dt className="text-ink/40 w-[88px] shrink-0 text-[11px] font-semibold tracking-[0.6px] uppercase">
        {label}
      </dt>
      <dd className="text-ink/82 min-w-0 flex-1 text-[15.5px] leading-[1.45]">
        {children}
      </dd>
    </div>
  );
}

export function GalleryDetailsSheet({
  open,
  onClose,
  item,
  onCycle,
}: GalleryDetailsSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      variant="gallery"
      dragToClose
      onSwipeSide={onCycle}
    >
      {/* Tapping the body closes, which is the prototype's own behaviour and the right one here:
          there is nothing in this sheet to press except the source link, and a reader who is done
          reading shouldn't have to find a specific place to put their thumb. `stopPropagation` on
          the link keeps the one real target working. */}
      <div className="px-[22px] pb-1" onClick={onClose}>
        <h2 className="text-ink-hi text-[25px] leading-[1.18] font-semibold">
          {item.title}
        </h2>
        {/* Accent here, unlike the ink-toned maker line on the picture itself: this is the sheet's
            own subject line, and the design gives the accent to the thing you came here to read. */}
        <p className="text-accent mt-[8px] text-[12.5px] tracking-[0.3px]">
          {item.attribution ?? sourceLabel(item.source)}
        </p>

        <dl className="mt-[18px]">
          {item.attribution ? (
            <Fact label="Maker">{item.attribution}</Fact>
          ) : null}

          <Fact label="From">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-accent underline-offset-2 hover:underline"
            >
              {sourceLabel(item.source)}
            </a>
          </Fact>

          {item.license ? <Fact label="License">{item.license}</Fact> : null}

          <Fact label="Topic">{topicLabel(item.topicId)}</Fact>

          {/* SPEC §9's standing dev-overlay rule, the gallery's slice of it: how the rail's walk
              reached this picture. Present only when the server's FEED_DEBUG gate is on, so this
              row simply doesn't exist in production. */}
          {item.debug ? (
            <Fact label="Debug">
              {item.debug.via} · {item.debug.topic}
            </Fact>
          ) : null}
        </dl>

        {item.summary ? (
          <p className="text-ink/72 mt-[18px] text-[16px] leading-[1.6]">
            {item.summary}
          </p>
        ) : null}

        <p className="text-ink/40 mt-[26px] text-center text-[11px]">
          Tap or swipe down to close · swipe sideways to keep browsing
        </p>
      </div>
    </BottomSheet>
  );
}
