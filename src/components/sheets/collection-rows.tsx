"use client";

import * as React from "react";

import { Bookmark, Plus } from "~/components/icons";
import { CoverMosaic } from "~/components/profile/cover-mosaic";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// The row shape shared by the two collection sheets. They diverge in *behavior* — one saves, one
// navigates — but the row is one design: a leading mark, name, sub-label, hairline rule.
//
// **Since 09-12-26 the mark is a face** (docs/DESIGN_list-screens.md §7): a collection leads with a
// 36 px `CoverMosaic` of its four newest pictures, and the two pseudo-rows with a glyph square —
// the same two squares the Collections tab's placeholder and dashed tile use, at row size. The
// 9 px dot below is the fallback for a caller that passes no `leading`.
//
// Dot alphas come straight from the handoff: `accent` marks the collection an item is currently
// in, 25% is an ordinary collection, and 40%/18% are the two pseudo-rows — "Everything kept" (the
// browse sheet's) and "New collection…" (every picker's, since 09-10-26: `NewCollectionRow` below).
export type DotTone = "accent" | "normal" | "strong" | "faint";

const DOT_TONE: Record<DotTone, string> = {
  accent: "bg-accent",
  normal: "bg-ink/25",
  strong: "bg-ink/40",
  faint: "bg-ink/18",
};

/**
 * What leads a row (docs/DESIGN_list-screens.md §7). `covers` is a collection's face, 36 px,
 * ringed in the accent when `current` ("Already saved here"); `glyph` is one of the two
 * pseudo-rows' squares — the outline bookmark for "Everything kept", the dashed plus for
 * "New collection…". Absent, the row keeps its 9 px dot (`tone`).
 */
export type RowLeading =
  | { kind: "covers"; covers: string[]; current?: boolean }
  | { kind: "glyph"; glyph: "bookmark" | "plus" };

export interface CollectionRowProps {
  label: string;
  sub: string;
  tone?: DotTone;
  leading?: RowLeading;
  onPick: () => void;
}

export function CollectionRow({
  label,
  sub,
  tone = "normal",
  leading,
  onPick,
}: CollectionRowProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      // Same rule as the pill's controls: a thumb resting here mid-scroll must not fire the row.
      onPointerDown={(e) => e.stopPropagation()}
      className="border-hairline border-ink/6 flex w-full items-center gap-[13px] rounded-[14px] border-b px-3 py-[14px] text-left transition-transform duration-150 active:scale-[0.99]"
    >
      {leading?.kind === "covers" ? (
        <span
          className={cn(
            "size-9 flex-none overflow-hidden",
            leading.current && "ring-accent ring-2",
          )}
        >
          <CoverMosaic
            covers={leading.covers}
            className="size-9"
            placeholderSize={14}
          />
        </span>
      ) : leading?.kind === "glyph" ? (
        <span
          data-testid="row-glyph"
          data-glyph={leading.glyph}
          className={cn(
            "flex size-9 flex-none items-center justify-center",
            leading.glyph === "bookmark"
              ? "border-hairline border-ink/10 bg-ink/3"
              : "border-ink/16 bg-ink/[4.5%] border-[0.5px] border-dashed",
          )}
        >
          {leading.glyph === "bookmark" ? (
            <Bookmark size={14} className="text-ink/40" />
          ) : (
            <Plus size={14} className="text-ink/55" />
          )}
        </span>
      ) : (
        <span
          className={cn("size-[9px] flex-none rounded-full", DOT_TONE[tone])}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-[15px]">{label}</span>
        <span className="text-ink/38 mt-0.5 block truncate text-[12px]">
          {sub}
        </span>
      </span>
    </button>
  );
}

/** "1 item" / "N items" — the sub-label every collection row falls back to. */
export function itemCountLabel(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/**
 * The scrolling container for a list of rows. The scroll lives here rather than on the sheet shell
 * so the grabber and title stay pinned while the list moves under them — which is why
 * `BottomSheet` deliberately carries no horizontal padding of its own.
 */
export function CollectionRowList({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-3">{children}</div>;
}

export interface NewCollectionRowProps {
  /** Called with the created row. The caller decides what happens next — file an item, navigate. */
  onCreate: (collection: { id: string; name: string }) => void;
  /** Start expanded — the profile's sheet is nothing but this form. */
  initiallyOpen?: boolean;
}

/**
 * The one create form in the app (09-10-26, docs/DESIGN_screen-structure.md §2). Until this it
 * lived only behind the profile's dashed tile, and every sheet that offered collections stopped
 * short of making one — the Collections sheet's "New collection" row *navigated to the profile*.
 *
 * A row that becomes a field, rather than a nested sheet: the reader is already inside a sheet,
 * with an item in hand, and a second sheet over the first is exactly the "location of a tap"
 * clunkiness Ben's review was about. The rest is 5.10's form, moved here whole: there is no
 * rename, so the name is asked for rather than auto-generated (an auto-generated name would be a
 * *permanent* one), and a duplicate renders inline and keeps the typed text, because the reader's
 * next move is to edit it.
 */
export function NewCollectionRow({
  onCreate,
  initiallyOpen = false,
}: NewCollectionRowProps) {
  const [open, setOpen] = React.useState(initiallyOpen);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const utils = api.useUtils();

  const create = api.saves.createCollection.useMutation({
    onSuccess: (row) => {
      // Every picker reads `saves.collections`; nothing else changed, so this is the one
      // invalidation.
      void utils.saves.collections.invalidate();
      setName("");
      setError(null);
      setOpen(initiallyOpen);
      onCreate(row);
    },
    onError: (err) => {
      setError(
        err.data?.code === "CONFLICT"
          ? "You already have a collection with that name."
          : "Something went wrong — try again.",
      );
    },
  });

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed || create.isPending) return;
    setError(null);
    create.mutate({ name: trimmed });
  };

  if (!open) {
    return (
      <CollectionRow
        label="New collection…"
        sub="Name it and it's made"
        tone="faint"
        leading={{ kind: "glyph", glyph: "plus" }}
        onPick={() => setOpen(true)}
      />
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-3 py-[10px]"
      // Same rule as the rows: a thumb resting here mid-scroll must not reach the sheet's gestures.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Input
        // Picking the row is asking to type, so the field takes focus at once — and in the
        // profile's sheet, which opens straight onto this form, it is the only thing to do.
        autoFocus
        value={name}
        maxLength={40}
        placeholder="Collection name"
        aria-label="Collection name"
        onChange={(e) => {
          setName(e.target.value);
          // Clear a stale conflict as soon as the name changes — the error was about the old
          // text, and leaving it up makes the new one look rejected too.
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />

      {error ? (
        <span role="alert" className="text-error text-[12.5px]">
          {error}
        </span>
      ) : null}

      <Button
        onClick={submit}
        // Blank is the only disabled state: a name that's merely a duplicate has to be
        // *submittable*, or the user can't discover the conflict.
        disabled={trimmed.length === 0 || create.isPending}
        aria-busy={create.isPending}
      >
        Create
      </Button>
    </div>
  );
}
