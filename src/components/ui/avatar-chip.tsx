import * as React from "react";

import { cn } from "~/lib/utils";

// The user's stand-in avatar: a gradient disc with a hairline white ring. There is no avatar
// upload anywhere in the product (deliberately — the design has no file picker for one, and 5.10's
// Profile is explicitly "no avatar upload"), so this gradient *is* the avatar, everywhere it
// appears: the pill toolbar's profile button and the Profile screen's header.
//
// The gradient lives in globals.css as `.bg-avatar-gradient` rather than inline here because it
// needed registering with tailwind-merge's `bg-image` group — a custom `bg-*` utility is otherwise
// silently dropped when it sits next to a `bg-ink/NN` class (the trap `border-hairline` fell into
// in 5.1 and this gradient fell into again in 5.4).
export interface AvatarChipProps extends React.ComponentProps<"span"> {
  size?: number;
}

export function AvatarChip({
  size = 25,
  className,
  style,
  ...rest
}: AvatarChipProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, ...style }}
      className={cn(
        // 1.5px at 75% white — thicker than the app's 0.5px hairline on purpose: this ring sits
        // over the pill's own translucency and photographic content behind it, where a hairline
        // disappears.
        "bg-avatar-gradient inline-block flex-none rounded-full border-[1.5px] border-white/75",
        className,
      )}
      {...rest}
    />
  );
}
