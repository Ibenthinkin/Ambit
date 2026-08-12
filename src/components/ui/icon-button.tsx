import * as React from "react";

import { cn } from "~/lib/utils";

// The circular icon button — the single most-repeated element in the handoff bundle (header
// bookmark toggle, card save/share, gallery chrome, close buttons...). Two fill/border tiers:
// the default sits on the app's own background (Feed header's ~34px button, ~0.06/0.09 alphas);
// `glass` is for buttons layered directly over photographic imagery (Gallery's chrome,
// ~0.09-0.1/0.14-0.16), which needs a stronger border to stay legible against arbitrary image
// content. These map onto the alpha ladder's own "chrome buttons" (bg-ink/9) and "glass buttons
// on imagery" (border-ink/16) rows — not a coincidence, the ladder was written with this
// component in mind.
export type IconButtonSize = 28 | 30 | 34 | 36 | 38 | 42;

export interface IconButtonProps extends React.ComponentProps<"button"> {
  size?: IconButtonSize;
  glass?: boolean;
}

export function IconButton({
  size = 34,
  glass = false,
  className,
  style,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      // The size set (28/30/34/36/38/42) doesn't line up with any Tailwind spacing step cleanly
      // enough to justify six arbitrary-value utility classes; an inline style is more readable
      // here than `w-[34px] h-[34px]` repeated per call site.
      style={{ width: size, height: size, ...style }}
      className={cn(
        "border-hairline text-ink/62 inline-flex flex-none items-center justify-center rounded-full transition-transform duration-150 active:scale-95",
        glass ? "bg-ink/9 border-ink/16" : "bg-ink/5 border-ink/12",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
