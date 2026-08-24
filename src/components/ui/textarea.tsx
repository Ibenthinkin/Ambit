import * as React from "react";

import { cn } from "~/lib/utils";

// The multi-line sibling of `Input` — one field in the whole app needs it (Profile Edit's ABOUT
// box, Phase 5.10), which is exactly why it's a primitive rather than a `<textarea>` with the
// input's classes copy-pasted into the screen: the two must not be able to drift apart.
//
// The classes below ARE `Input`'s, verbatim, plus three that only make sense on a textarea:
//   - `resize-none` — a drag handle in the corner of a designed form is an escape hatch out of the
//     layout, and the design has no resizable field anywhere.
//   - `leading-[1.5]` — `Input`'s single line has no line height to speak of; a bio does.
//   - `rows={4}` as the default height, overridable per call site.
export function Textarea({
  className,
  rows = 4,
  ...rest
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "border-hairline rounded-input border-ink/12 bg-ink/[4.5%] text-ink placeholder:text-ink/32 focus:border-accent w-full resize-none px-[18px] py-4 font-sans text-[16px] leading-[1.5] transition-colors duration-200 outline-none",
        className,
      )}
      {...rest}
    />
  );
}
