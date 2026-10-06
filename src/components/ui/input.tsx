import * as React from "react";

import { cn } from "~/lib/utils";

// Landing's text input (Ambit - Landing.dc.html ~124-135). `--color-accent` is a plain theme
// token (globals.css's `@theme` block), so `focus:border-accent` reaches the one accent colour
// directly — no per-input CSS variable needed. (Phase 2 rewrites this as the underline input.)
export function Input({ className, ...rest }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-hairline rounded-input border-ink/12 bg-ink/[4.5%] text-ink placeholder:text-ink/32 focus:border-accent w-full px-[18px] py-4 font-sans text-[16px] transition-colors duration-200 outline-none",
        className,
      )}
      {...rest}
    />
  );
}
