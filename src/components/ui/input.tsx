import * as React from "react";

import { cn } from "~/lib/utils";

// Landing's text input (Ambit - Landing.dc.html ~124-135). The prototype scopes the accent into
// a bespoke `--ambit-accent` CSS var just so its `:focus` rule can reach it — the only custom
// property anywhere in the handoff bundle. We don't need that trick: `--color-accent` is already
// a real theme token (globals.css's `@theme inline` block), so `focus:border-accent` reaches the
// live accent directly, no per-input variable required.
export function Input({ className, ...rest }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-hairline rounded-input border-ink/12 bg-ink/[4.5%] text-ink focus:border-accent w-full border px-[18px] py-4 font-sans text-[16px] transition-colors duration-200 outline-none",
        className,
      )}
      {...rest}
    />
  );
}
