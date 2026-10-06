import * as React from "react";

import { cn } from "~/lib/utils";
import { INPUT_BASE, INPUT_SIZES } from "./input";

// The multi-line sibling of `Input` — one field in the whole app needs it (Profile Edit's ABOUT
// box, Phase 5.10), which is exactly why it's a primitive rather than a `<textarea>` with the
// input's classes copy-pasted into the screen: the two must not be able to drift apart. They now
// share `INPUT_BASE` itself, so the underline, states and sizes are one definition.
//
// Three things only make sense on a textarea:
//   - `resize-none` — a drag handle in the corner of a designed form is an escape hatch out of the
//     layout, and the design has no resizable field anywhere.
//   - `leading-[1.5]` — `Input`'s single line has no line height to speak of; a bio does.
//   - `rows={4}` as the default height, overridable per call site.
export function Textarea({
  className,
  rows = 4,
  size = "md",
  ...rest
}: Omit<React.ComponentProps<"textarea">, "size"> & {
  size?: keyof typeof INPUT_SIZES;
}) {
  return (
    <textarea
      rows={rows}
      className={cn(
        INPUT_BASE,
        INPUT_SIZES[size],
        "resize-none leading-[1.5]",
        className,
      )}
      {...rest}
    />
  );
}
