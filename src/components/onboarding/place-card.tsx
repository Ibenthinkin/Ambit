"use client";

import { cn } from "~/lib/utils";

import { CARD_LIFT, CARD_LIFTED, CARD_MONO } from "./face-card";

// A destination — "Where would you go next?" (DESIGN_redesign §5.2): a typeset card with no
// picture by design. A top rule (ink when chosen or under the cursor), the country on the left and
// "● Chosen" on the right, the place, one line. Once the screen's cap is reached the cards not
// chosen dim to 40% (`dim`) — they still press: answer.ts's `toggleAnswer` lets the newest choice
// push out the oldest rather than refusing it, the same rule as the keys.
//
// The accessible name is the place alone; the country and the line are read as its description
// would be, from the content.

export interface PlaceCardProps {
  label: string;
  card: { where: string; line: string };
  topics: readonly string[];
  selected: boolean;
  /** The cap is reached and this one is not among the chosen. */
  dim?: boolean;
  cursor?: boolean;
  onClick: () => void;
}

export function PlaceCard({
  label,
  card,
  topics,
  selected,
  dim = false,
  cursor = false,
  onClick,
}: PlaceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-topics={topics.join(" ")}
      data-cursor={cursor ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "block w-full origin-left cursor-pointer border-t pt-3.5 pb-6 text-left",
        CARD_LIFT,
        "transition-[scale,opacity,border-color]",
        cursor && CARD_LIFTED,
        selected || cursor ? "border-ink" : "border-ink/18 hover:border-ink",
        dim && "opacity-40",
      )}
    >
      <span className={cn(CARD_MONO, "text-ink/55 flex justify-between")}>
        <span>{card.where}</span>
        {selected && <span className="text-ink">● Chosen</span>}
      </span>
      <span className="text-ink-hi mt-2.5 block text-[22px] leading-[1.15] tracking-[-0.01em]">
        {label}
      </span>
      <span className="text-ink/62 mt-1.5 block text-[14px] leading-[1.4]">
        {card.line}
      </span>
    </button>
  );
}
