"use client";

import * as React from "react";

import { Logo } from "~/components/icons";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// "About Ambit" — static copy, no queries, no state. The one place in the running app that says
// what Ambit is and whose material it shows.
//
// The source list is spelled out rather than derived from `server/services/sources/index.ts`: that
// module is server-only (each adapter reaches for API keys at import), and a settings sheet is not
// worth a tRPC procedure to enumerate constants. It needs updating by hand when a source lands —
// which is the right amount of friction for a page that makes an attribution claim.
export interface AboutSheetProps {
  open: boolean;
  onClose: () => void;
  versionLabel: string;
}

export function AboutSheet({ open, onClose, versionLabel }: AboutSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="About Ambit">
      <div className="flex flex-col items-center px-6 pt-2 pb-4">
        <Logo size={34} className="text-accent" />

        <p className="text-ink/62 mt-[18px] text-center text-[14px] leading-[1.6]">
          A quiet, endless feed of public-domain pictures and writing — loosely
          tuned to what you like, and deliberately prone to wandering somewhere
          else. No follows, no likes, no numbers going up.
        </p>

        <p className="text-ink/34 mt-[22px] text-[12px]">
          Ambit · invite-only · {versionLabel}
        </p>

        <div className="border-ink/8 mt-[22px] w-full border-t-[0.5px] pt-[18px]">
          <p className="text-ink/34 text-center text-[11px] font-semibold tracking-[1.2px] uppercase">
            With material from
          </p>
          <p className="text-ink/48 mt-[10px] text-center text-[12.5px] leading-[1.7]">
            The Metropolitan Museum of Art · The Art Institute of Chicago ·
            Cleveland Museum of Art · Wellcome Collection · Wikipedia
          </p>
          <p className="text-ink/34 mt-[14px] text-center text-[11.5px] leading-[1.6]">
            Each item keeps its own attribution and licence, shown on its page.
            Anything credited to a blog links back to the original — tell us and
            we&apos;ll remove it.
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
