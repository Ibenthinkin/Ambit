"use client";

import * as React from "react";

import { AvatarChip } from "~/components/ui/avatar-chip";
import { Button } from "~/components/ui/button";
import { Rise } from "~/components/ui/rise";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { avatarGradient } from "~/lib/avatar-hue";
import type { UserProfile } from "~/server/db/users";
import { api } from "~/trpc/react";
import { useProfileHub } from "./profile-hub";

// `/profile/edit` (`Ambit - Profile Edit.dc.html`) — the Edit profile tab of the Profile hub since
// 09-12-26 (docs/DESIGN_list-screens.md §4). A route, not a sheet, because it is a real multi-field
// form and a sheet that holds four fields plus a keyboard is a page wearing a disguise.
//
// **No `GlassHeader`, and nothing leaves.** It had one while it was its own screen, because Save
// lived in it; as a tab it sits under the hub's identity block and nav, which is nothing that needs
// to stay on screen, so the save is the "Save changes" button at the foot of the form. On success
// the tab *stays*: the hub's header above is the same `user.me` row and re-renders with the new
// name, which is a better confirmation than the old 900 ms beat and a navigation. Discard resets
// the fields to what was loaded rather than leaving — there is nowhere to leave to.
//
// **Dropped from the prototype, deliberately:** the "Drop a photo" slot and the upload caption
// under the avatar. There is no avatar upload anywhere in the product and there isn't going to be
// one in this shape (see `lib/avatar-hue.ts`), so copy inviting the reader to add a photo would be
// a straightforward lie. The disc renders with no caption at all.
//
// EMAIL is present but read-only: Better Auth owns the email/verification round trip and rejects a
// bare update by design, so changing it is a later auth phase — showing the field greyed with an
// explanation beats hiding the one identifier the reader actually signs in with.

export function ProfileEditScreen() {
  const me = api.user.me.useQuery();

  return (
    // Left-aligned at the list measure inside the hub's wide column (docs/DESIGN_list-screens.md
    // §6) — on every branch, so a spinner and an error land where the form will.
    <div className="md:max-w-[600px]">
      {me.isPending ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : null}

      {me.isError ? (
        <div className="flex flex-col items-center gap-4 px-8 py-24">
          <span className="text-ink/40 text-center text-[14px]">
            Couldn&apos;t load your profile.
          </span>
          <Button
            variant="ghost"
            shape="pill"
            onClick={() => void me.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {/* The form is a separate component mounted only once the profile has arrived, so its
          `useState(profile.name)` initializers are honest: a single component would have to seed
          from `undefined` and then patch itself in an effect, which is how a form ends up
          clobbering something the user typed while the query was in flight. */}
      {me.data ? <EditForm profile={me.data} /> : null}
    </div>
  );
}

function EditForm({ profile }: { profile: UserProfile }) {
  const utils = api.useUtils();
  const hub = useProfileHub();

  const [name, setName] = React.useState(profile.name);
  const [handle, setHandle] = React.useState(profile.handle ?? "");
  const [bio, setBio] = React.useState(profile.bio ?? "");
  /** Rendered under the handle field — the one error with a specific home. */
  const [handleError, setHandleError] = React.useState<string | null>(null);
  /** Everything else, centered under the CTA (the AuthCard pattern). */
  const [formError, setFormError] = React.useState<string | null>(null);
  // A local re-entry guard rather than relying on `isPending`, so a double tap can never fire two
  // writes between the click and React Query's state update. Same shape as `AuthCard`'s. Released
  // on either outcome.
  const [submitting, setSubmitting] = React.useState(false);

  const save = api.user.updateProfile.useMutation({
    onSuccess: (updated) => {
      // Both, and in this order: `setData` makes the hub's header above correct the instant it
      // re-renders, and the invalidate makes it *true* rather than merely optimistic.
      utils.user.me.setData(undefined, updated);
      void utils.user.me.invalidate();
      hub.toast("Profile saved");
      // Nothing leaves (docs/DESIGN_list-screens.md §4) — the header is the confirmation — so
      // the guard releases here rather than on a timer.
      setSubmitting(false);
    },
    onError: (err) => {
      setSubmitting(false);
      if (err.data?.code === "CONFLICT") {
        setHandleError("That handle's taken.");
      } else {
        setFormError("Couldn't save — try again.");
      }
    },
  });

  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    setHandleError(null);
    setFormError(null);
    save.mutate({
      name: name.trim(),
      // The field displays and accepts a bare handle, but readers type the `@` anyway — strip one
      // leading sigil rather than rejecting the most natural input. Lowercasing happens server-side
      // too (the zod schema); doing it here as well keeps what's sent equal to what's stored.
      handle: normalizeHandle(handle),
      bio: bio.trim() === "" ? null : bio.trim(),
    });
  };

  /** Back to what was loaded — a reset, not an exit: there is nowhere to go, the form is a tab. */
  const discard = () => {
    setName(profile.name);
    setHandle(profile.handle ?? "");
    setBio(profile.bio ?? "");
    setHandleError(null);
    setFormError(null);
  };

  return (
    <>
      {/* No caption under it — see the file header on why the prototype's upload copy is gone. */}
      <div className="flex justify-center pt-6">
        <Rise>
          <AvatarChip size={104} gradient={avatarGradient(profile.id)} />
        </Rise>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-[34px] pb-[60px]">
        <Field label="Name">
          <Input
            value={name}
            maxLength={60}
            placeholder="Your name"
            aria-label="Name"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Handle">
          <Input
            value={handle}
            maxLength={25}
            placeholder="@you"
            aria-label="Handle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setHandle(e.target.value);
              if (handleError) setHandleError(null);
            }}
          />
          {/* The conflict's home. Under the field rather than in a toast, because the fix is to
              edit the thing directly above it. */}
          {handleError ? (
            <span role="alert" className="text-error mt-2 block text-[12.5px]">
              {handleError}
            </span>
          ) : null}
        </Field>

        <Field label="About">
          <Textarea
            value={bio}
            rows={4}
            maxLength={280}
            placeholder="What are you curious about?"
            aria-label="About"
            onChange={(e) => setBio(e.target.value)}
          />
        </Field>

        <Field label="Email">
          <Input
            readOnly
            value={profile.email}
            aria-label="Email"
            className="text-ink/55"
          />
          <span className="text-ink/35 mt-2 block text-[12px]">
            Only used for your invite and sign-in.
          </span>
        </Field>

        <Button
          className="mt-1 h-[50px] w-full"
          onClick={submit}
          aria-busy={submitting}
        >
          Save changes
        </Button>

        {formError ? (
          <span role="alert" className="text-error text-center text-[12.5px]">
            {formError}
          </span>
        ) : null}

        <button
          type="button"
          onClick={discard}
          className="text-ink/45 text-center text-[14px]"
        >
          Discard
        </button>
      </div>
    </>
  );
}

/**
 * `"" → null`, a leading `@` stripped, lowercased. Clearing the field genuinely clears the column —
 * which is why this returns null rather than an empty string: `""` would collide with every other
 * user who also cleared theirs, since only NULLs are exempt from the unique constraint.
 */
function normalizeHandle(raw: string): string | null {
  const bare = raw.trim().replace(/^@/, "").toLowerCase();
  return bare === "" ? null : bare;
}

/** One labelled field. The eyebrow is the same treatment Settings' group headers use. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-ink/38 mb-2 block text-[11px] font-semibold tracking-[1.2px] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
