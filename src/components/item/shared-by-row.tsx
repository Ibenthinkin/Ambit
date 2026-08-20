// "Mara shared this with you" — the line above the content when someone arrives through a shared
// link.
//
// **Param-driven, and nothing more than that.** The name comes from `?from=` on the URL; it is
// never stored, never looked up, and never checked against a real account. That is the whole
// design: the sharer's client puts their own first name in the link it copies, and this row
// repeats it back. Nothing here can leak a user record, because nothing here reads one.
//
// The name is rendered as text (React escapes it) and capped at 40 characters by the caller, so a
// crafted link can at worst put a short odd string on the page.

/** The longest `?from=` a page will render. Beyond this the row is dropped entirely. */
export const MAX_SHARED_BY = 40;

export interface SharedByRowProps {
  /** The raw `?from=` value. */
  name: string;
}

export function SharedByRow({ name }: SharedByRowProps) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="bg-accent text-on-accent flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="text-ink/50 text-[12.5px]">
        {name} shared this with you
      </span>
    </div>
  );
}

/**
 * Normalizes a raw search param into a name worth rendering, or `null`. Exported so the page can
 * decide whether the row exists at all without duplicating the rules (and so the rules are
 * testable on their own).
 */
export function sharedByName(param: string | string[] | undefined) {
  // A repeated `?from=a&from=b` arrives as an array — there is no sensible way to render two
  // sharers, so treat it the same as absent.
  if (typeof param !== "string") return null;
  const trimmed = param.trim();
  if (!trimmed || trimmed.length > MAX_SHARED_BY) return null;
  return trimmed;
}
