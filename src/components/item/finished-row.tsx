"use client";

import { MoreOrLess } from "~/components/feedback/more-or-less";
import { DESKTOP_QUERY, useMediaQuery } from "~/hooks/use-media-query";

import { useItemShell } from "./item-shell";

// "Finished · 4 min read" and the Less / More pair, at the end of an article — after the last
// paragraph and the source link, above "Where Ambit would wander next" (docs/DESIGN_more-or-less.md
// D6; frames P1 and D1). It is a separate client component, rendered by the *server* page between
// the body and the wander list, so it reads the shell's toast and sign-up sheet through context
// (`useItemShell`) rather than props.
//
// Phone vs desktop is `useMediaQuery`, the app's pattern for a client component that changes
// shape (the item screen does the same). It reports the phone on the server and on hydration's
// first pass, then settles — so there is no hydration mismatch, and the markup differs because
// the label is one mono line on the phone but two spans at either end of the row on a desktop,
// and the pair is a different size, which CSS alone could not swap without mounting two pairs
// (two `role=group`s, two hooks).
export interface FinishedRowProps {
  itemId: string;
  topicId: string | null;
  topicLabel: string | null;
  readingMinutes: number | null;
}

export function FinishedRow({
  itemId,
  topicId,
  topicLabel,
  readingMinutes,
}: FinishedRowProps) {
  const { authed, toast, requireAuth } = useItemShell();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const pair = (
    <MoreOrLess
      itemId={itemId}
      topicId={topicId}
      topicLabel={topicLabel}
      size={desktop ? "reader" : "phone"}
      authed={authed}
      onToast={toast}
      onRequireAuth={requireAuth}
      className={desktop ? "mt-4" : "mt-[12px]"}
    />
  );

  if (desktop) {
    return (
      <section
        aria-label="Finished"
        className="border-ink/16 mt-12 border-t pt-[14px]"
      >
        <div className="text-ink/60 flex justify-between font-mono text-[11px] uppercase">
          <span>Finished</span>
          {readingMinutes ? <span>{readingMinutes} min read</span> : null}
        </div>
        {pair}
      </section>
    );
  }

  return (
    <section
      aria-label="Finished"
      className="border-ink/14 mt-[34px] border-t pt-[14px]"
    >
      <div className="text-ink/55 font-mono text-[10.5px] uppercase">
        {readingMinutes ? `Finished · ${readingMinutes} min read` : "Finished"}
      </div>
      {pair}
    </section>
  );
}
