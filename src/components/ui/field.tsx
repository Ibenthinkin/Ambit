import * as React from "react";

import { cn } from "~/lib/utils";

/** The green mono hint (DESIGN §3.2 job 7) — 1b has no error colour. Layout classes stay with the caller. */
export const ERROR_HINT =
  "text-accent font-mono text-[10.5px] tracking-[0.04em]";

/**
 * A visible label above one input (DESIGN §4.4): Geist Mono, 10.5 px, uppercase, `ink/55`, with
 * a right-aligned slot in the same row for a hint or an error — both green mono ("Needs 8+
 * characters"). It replaces the auth card's `sr-only` labels.
 *
 * It wires the accessibility for you by cloning its one child (an `Input` / `Textarea`) with:
 *   - `id`, so the `<label htmlFor>` finds it — a child that brings its own `id` keeps it;
 *   - `aria-describedby`, pointing at whichever of the hint / error is showing;
 *   - `aria-invalid` while there is an error.
 * The error wins over the hint (one slot) and is a `role="alert"`, so it is spoken when it
 * appears — the same job the old inline red `<span role="alert">`s did.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Exactly one control. */
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
  className?: string;
}) {
  // The child must be ONE labelable control (input, textarea, select): `htmlFor` can only point
  // at one element. Anything else would silently leave the label unattached, so say so in dev.
  if (
    process.env.NODE_ENV !== "production" &&
    !React.isValidElement(children)
  ) {
    console.error("Field expects exactly one control element as its child.");
  }
  const autoId = React.useId();
  const id = children.props.id ?? autoId;
  const noteId = `${id}-note`;
  const note = error ?? hint;
  // Keep any description the control already carries; ours is added to it, not over it.
  const describedBy =
    [children.props["aria-describedby"], note ? noteId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-ink/55 font-mono text-[10.5px] tracking-[0.12em] uppercase"
        >
          {label}
        </label>
        {note ? (
          <span
            id={noteId}
            role={error ? "alert" : undefined}
            className={cn(ERROR_HINT, "text-right")}
          >
            {note}
          </span>
        ) : null}
      </div>
      {React.cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        // An error forces invalid; otherwise the control's own setting stands.
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
    </div>
  );
}
