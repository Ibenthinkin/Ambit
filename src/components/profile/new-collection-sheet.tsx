"use client";

import * as React from "react";

import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

// The only place in the app a collection gets made (Phase 5.10).
//
// **The prototype's version takes no input at all** — tap the dashed tile and a collection called
// "Collection 4" appears. That was rejected during planning for one concrete reason: there is no
// rename, so an auto-generated name is a *permanent* one. A single text field is the smaller price.
//
// A duplicate name is the interesting case, and it renders inline rather than as a toast: the sheet
// stays open with the typed name still in the field, because the user's next move is to edit it.
export interface NewCollectionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created row so the parent can toast it. */
  onCreated: (collection: { id: string; name: string }) => void;
}

export function NewCollectionSheet({
  open,
  onClose,
  onCreated,
}: NewCollectionSheetProps) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const utils = api.useUtils();

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  const create = api.saves.createCollection.useMutation({
    onSuccess: (row) => {
      // The grid this sheet was opened from reads `saves.collections`; nothing else changed, so
      // this is the one invalidation.
      void utils.saves.collections.invalidate();
      onCreated(row);
      close();
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

  return (
    <BottomSheet open={open} onClose={close} title="New collection">
      <div className="flex flex-col gap-4 px-5 pt-1 pb-2">
        <Input
          // The sheet takes focus on open (BottomSheet's own focus effect targets the panel so the
          // title is announced first); this hands it straight to the field, which is the only
          // thing here to do.
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
    </BottomSheet>
  );
}
