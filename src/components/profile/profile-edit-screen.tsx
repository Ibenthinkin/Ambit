"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ChevronLeft } from "~/components/icons";
import { cameToEditFromApp } from "~/components/profile/edit-origin";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { Button } from "~/components/ui/button";
import { GlassHeader } from "~/components/ui/glass-header";
import { IconButton } from "~/components/ui/icon-button";
import { Rise } from "~/components/ui/rise";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { Toast } from "~/components/ui/toast";
import { avatarGradient } from "~/lib/avatar-hue";
import type { UserProfile } from "~/server/db/users";
import { api } from "~/trpc/react";

// `/profile/edit` (`Ambit - Profile Edit.dc.html`) — a dedicated route, not a sheet, because it is
// a real multi-field form and a sheet that holds four fields plus a keyboard is a page wearing a
// disguise.
//
// A `GlassHeader` here (and on Settings), unlike Profile: this screen's prototype has a sticky
// blurred bar, and it needs one — Save lives in it, and a save button that scrolls away is a save
// button you can't find.
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
    <main className="bg-bg text-ink min-h-dvh">
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
    </main>
  );
}

function EditForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const utils = api.useUtils();

  const [name, setName] = React.useState(profile.name);
  const [handle, setHandle] = React.useState(profile.handle ?? "");
  const [bio, setBio] = React.useState(profile.bio ?? "");
  /** Rendered under the handle field — the one error with a specific home. */
  const [handleError, setHandleError] = React.useState<string | null>(null);
  /** Everything else, centered under the CTA (the AuthCard pattern). */
  const [formError, setFormError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  // A local re-entry guard rather than relying on `isPending`: the success path deliberately holds
  // the screen for 900ms after the mutation settles (see below), and a second submit in that window
  // would fire a second write. Same shape as `AuthCard`'s.
  const [submitting, setSubmitting] = React.useState(false);

  const leaveEdit = React.useCallback(() => {
    if (cameToEditFromApp()) router.back();
    else router.push("/profile");
  }, [router]);

  const save = api.user.updateProfile.useMutation({
    onSuccess: (updated) => {
      // Both, and in this order: `setData` makes the Profile screen correct the instant it renders
      // (a pop is a client navigation — nothing refetches on its own), and the invalidate makes it
      // *true* rather than merely optimistic.
      utils.user.me.setData(undefined, updated);
      void utils.user.me.invalidate();
      setToast("Profile saved");
      // The prototype's own beat: confirm, then leave. Long enough to read, short enough not to
      // feel like a stall.
      setTimeout(leaveEdit, 900);
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

  return (
    <>
      <GlassHeader>
        <IconButton size={34} aria-label="Back" onClick={leaveEdit}>
          <ChevronLeft size={15} />
        </IconButton>
        <h1 className="text-ink text-[17px] font-semibold">Edit profile</h1>
        <button
          type="button"
          onClick={submit}
          aria-busy={submitting}
          className="text-accent text-[14.5px] font-semibold"
        >
          Save
        </button>
      </GlassHeader>

      {/* No caption under it — see the file header on why the prototype's upload copy is gone. */}
      <div className="flex justify-center pt-[34px]">
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
          onClick={leaveEdit}
          className="text-ink/45 text-center text-[14px]"
        >
          Discard
        </button>
      </div>

      {/* Unraised: there is no pill on this screen for a toast to clear. */}
      <Toast
        text={toast ?? ""}
        open={toast !== null}
        onDone={() => setToast(null)}
        durationMs={1700}
      />
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
