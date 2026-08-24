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
//
// Phase 5.10 adds `gradient`: a per-user gradient string from `lib/avatar-hue.ts`, applied inline
// so every account's disc is its own color. Inline rather than a generated class for the same
// tailwind-merge reason the static gradient became a class in the first place — a runtime value
// can't have a build-time utility, and a `bg-[…]` arbitrary value would be dropped next to the
// `bg-avatar-gradient` it's replacing. Passing `gradient` swaps the static class out entirely.
export interface AvatarChipProps extends React.ComponentProps<"span"> {
  size?: number;
  /**
   * `avatarGradient(userId)` — the signed-in reader's own disc. Omit it for the generic avatar:
   * `PillToolbar`'s 25px disc has no access to user data (it's a presentational primitive on every
   * screen, authed or not), so it keeps the shared default. Giving the pill a per-user disc too is
   * a deferred 5.10 item, not an oversight.
   */
  gradient?: string;
}

export function AvatarChip({
  size = 25,
  gradient,
  className,
  style,
  ...rest
}: AvatarChipProps) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        ...(gradient ? { backgroundImage: gradient } : {}),
        ...style,
      }}
      className={cn(
        // 1.5px at 75% white — thicker than the app's 0.5px hairline on purpose: this ring sits
        // over the pill's own translucency and photographic content behind it, where a hairline
        // disappears.
        "inline-block flex-none rounded-full border-[1.5px] border-white/75",
        // Only when there's no per-user gradient to paint instead — two background images on one
        // element would stack, and the class would win.
        !gradient && "bg-avatar-gradient",
        className,
      )}
      {...rest}
    />
  );
}
