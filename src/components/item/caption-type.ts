// The desktop caption's type (docs/DESIGN_redesign.md §6.3), one place so the magazine's folios
// (Task 4.4: "folios take the caption's type") can borrow it. A mono index, the title at 22 px /
// 400, a mono uppercase maker line — all over the hero's black gradient, so the greys are
// `ink` alphas rather than the prototype's hexes.
export const CAPTION_INDEX = "font-mono text-[11px] leading-none text-ink/55";
export const CAPTION_TITLE =
  "text-ink-hi text-[22px] leading-[1.2] font-normal text-pretty";
export const CAPTION_MAKER =
  "text-ink/55 mt-[6px] font-mono text-[10.5px] leading-[1.3] uppercase tracking-[0.2px]";
/** The "↓ Information" link: mono 10.5 px, tracked, uppercase, centred at the hero's foot. */
export const CAPTION_INFO_LINK =
  "text-ink/78 hover:text-white absolute bottom-[34px] left-1/2 -translate-x-1/2 cursor-pointer font-mono text-[10.5px] leading-none tracking-[0.5px] uppercase transition-colors";

/** The id the "↓ Information" link scrolls to. */
export const INFORMATION_ID = "information";
