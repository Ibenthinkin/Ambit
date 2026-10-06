import * as React from "react";

import { cn } from "~/lib/utils";

// The user's stand-in avatar: a flat #2A2A2A disc (DESIGN_redesign §6.5 — the per-user gradient
// and the white ring went with the redesign). There is no avatar upload anywhere in the product,
// so this disc *is* the avatar where the reader's own identity is shown: the Profile hub's header
// and Edit profile. Not the toolbars — their profile button is `icons/profile-glyph.tsx`.
export interface AvatarChipProps extends React.ComponentProps<"span"> {
  size?: number;
  /**
   * @deprecated No longer painted: the disc is flat. Kept so Edit profile's call site compiles
   * until its own restyle drops the prop.
   */
  gradient?: string;
}

export function AvatarChip({
  size = 25,
  gradient: _gradient,
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
        ...style,
      }}
      className={cn("bg-avatar inline-block flex-none rounded-full", className)}
      {...rest}
    />
  );
}
