"use client";

import * as React from "react";

import { Minus, Plus } from "~/components/icons";
import { HOVER_LINE } from "~/components/ui/button";
import {
  feedbackNoteText,
  feedbackToastText,
  UNDO_FAILED_TOAST,
  UNDONE_TOAST,
  type Verdict,
} from "~/lib/feedback-toast";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// The Less-of-this / More-of-this pair (docs/DESIGN_more-or-less.md; look: the handoff's "1a").
// A worded pair, Less on the left, square, drawn on the page and never on glass. One component
// serves every surface that isn't a sheet row or the hover strip; `size` picks the three
// measured layouts. States live in the class strings below — rest, hover (a tint, a brighter
// border and the accent's hovered-control underline), pressed, and "on" (inverted ink, the way a
// selected `Chip` is drawn). The keyboard ring is the global `:focus-visible` rule; nothing here
// adds one.

const SIZES = {
  // `grid` is the pair's own layout; `button` the per-button height / label / icon gap.
  phone: {
    grid: "grid-cols-2 gap-2",
    button: "h-12 gap-[9px] text-[15px]",
  },
  desktop: {
    grid: "grid-cols-[220px_220px] gap-[10px]",
    button: "h-12 gap-[10px] text-[16px]",
  },
  reader: {
    grid: "grid-cols-2 gap-[10px]",
    button: "h-[52px] gap-[10px] text-[16px]",
  },
} as const;

export type MoreOrLessSize = keyof typeof SIZES;

export interface MoreOrLessProps {
  itemId: string;
  /** The topic the item was served under; the server charges it. Null for an un-homed item. */
  topicId: string | null;
  topicLabel: string | null;
  size: MoreOrLessSize;
  authed: boolean;
  /** The host screen's toast. */
  onToast: (message: string) => void;
  /** Signed-out taps land here (the screen opens its sign-in sheet). */
  onRequireAuth: () => void;
  className?: string;
}

type Mine = { more: string[]; less: string[] };

// The cache entry with this item removed from both lists, then (optionally) put in one.
function patchMine(prev: Mine | undefined, itemId: string, verdict?: Verdict) {
  const base = prev ?? { more: [], less: [] };
  const next: Mine = {
    more: base.more.filter((id) => id !== itemId),
    less: base.less.filter((id) => id !== itemId),
  };
  if (verdict) next[verdict].push(itemId);
  return next;
}

export function MoreOrLess({
  itemId,
  topicId,
  topicLabel,
  size,
  authed,
  onToast,
  onRequireAuth,
  className,
}: MoreOrLessProps) {
  const utils = api.useUtils();
  // `enabled: authed` — a signed-out reader has no marks, and the procedure is protected, so
  // asking would only be a 401. Shared by every pair on the page: one request (same key).
  const mine = api.feedback.mine.useQuery(undefined, { enabled: authed });
  const current: Verdict | null = mine.data?.more.includes(itemId)
    ? "more"
    : mine.data?.less.includes(itemId)
      ? "less"
      : null;

  // On settle, everything a verdict can change is re-read: the marks, the Saved shelf, the
  // cooled topics and the topic weights.
  const settle = () =>
    Promise.all([
      utils.feedback.mine.invalidate(),
      utils.feedback.list.invalidate(),
      utils.topics.cools.invalidate(),
      utils.topics.mine.invalidate(),
    ]);

  // The optimistic shape (the hover strip's bookmark uses it too): `onMutate` cancels any
  // in-flight read so it can't overwrite our guess, snapshots the cache, and writes the guess;
  // `onError` puts the snapshot back; `onSettled` re-reads the truth either way.
  const set = api.feedback.set.useMutation({
    onMutate: async ({ itemId: id, verdict }) => {
      await utils.feedback.mine.cancel();
      const previous = utils.feedback.mine.getData();
      utils.feedback.mine.setData(undefined, patchMine(previous, id, verdict));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.feedback.mine.setData(undefined, ctx.previous);
      onToast("Couldn't save that. Try again.");
    },
    onSuccess: (result, vars) =>
      onToast(feedbackToastText(vars.verdict, result.drift)),
    onSettled: settle,
  });
  const clear = api.feedback.clear.useMutation({
    onMutate: async ({ itemId: id }) => {
      await utils.feedback.mine.cancel();
      const previous = utils.feedback.mine.getData();
      utils.feedback.mine.setData(undefined, patchMine(previous, id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) utils.feedback.mine.setData(undefined, ctx.previous);
      onToast(UNDO_FAILED_TOAST);
    },
    onSuccess: () => onToast(UNDONE_TOAST),
    onSettled: settle,
  });

  const press = (verdict: Verdict) => {
    if (!authed) return onRequireAuth();
    // Tapping the verdict that is on takes it back.
    if (current === verdict) clear.mutate({ itemId });
    else set.mutate({ itemId, verdict, topicId: topicId ?? undefined });
  };

  const s = SIZES[size];
  const button = (verdict: Verdict, label: string, glyph: React.ReactNode) => {
    const on = current === verdict;
    return (
      // `aria-pressed`, not `aria-checked`: these are toggle buttons (each can be on or off on
      // its own and tapping the lit one clears it), not a radio group whose choice is required.
      <button
        type="button"
        aria-pressed={on}
        onClick={() => press(verdict)}
        className={cn(
          "flex cursor-pointer items-center justify-center border leading-none font-normal select-none",
          "transition-[background-color,border-color,color,box-shadow,scale] duration-[120ms] ease-out",
          "active:scale-[0.97] active:duration-[90ms]",
          HOVER_LINE,
          s.button,
          on
            ? "bg-ink border-ink text-on-accent hover:bg-white"
            : "border-ink/32 text-ink hover:bg-ink/6 hover:border-ink/60 hover:text-ink-hi bg-transparent",
        )}
      >
        {glyph}
        {label}
      </button>
    );
  };

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="More or less of this"
        className={cn("grid", s.grid)}
      >
        {button("less", "Less of this", <Minus size={16} strokeWidth={2} />)}
        {button("more", "More of this", <Plus size={16} strokeWidth={2} />)}
      </div>
      {current && (
        <p className="text-ink/55 mt-[10px] font-mono text-[10.5px] leading-[1.5] uppercase">
          {feedbackNoteText(current, topicLabel)}
        </p>
      )}
    </div>
  );
}
