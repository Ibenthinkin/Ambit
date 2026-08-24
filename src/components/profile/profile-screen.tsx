"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Gear } from "~/components/icons";
import { cameToProfileFromApp } from "~/components/profile/profile-origin";
import { markProfileEditOrigin } from "~/components/profile/edit-origin";
import { markSettingsOrigin } from "~/components/settings/settings-origin";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { Button } from "~/components/ui/button";
import { IconButton } from "~/components/ui/icon-button";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Rise } from "~/components/ui/rise";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";
import { avatarGradient } from "~/lib/avatar-hue";
import { api } from "~/trpc/react";
import { CollectionTile, NewCollectionTile } from "./collection-tile";
import { NewCollectionSheet } from "./new-collection-sheet";

// The `/profile` screen (`Ambit - Profile.dc.html`) — who you are, and everything you've filed.
// The last of the app's 404s: the pill's avatar has been pointing here since 5.6, and the
// collections sheet's "make one on your profile" row since 5.5.
//
// **No `GlassHeader` here, deliberately**, unlike Settings and Edit. Profile's prototype has a
// plain non-sticky icon row that scrolls away with the content — there's no title to keep on
// screen and nothing to come back to, so a sticky bar would be chrome for its own sake.
//
// Two omissions from the prototype's header, both plan-time calls (§7 of the phase plan):
// the **Share** disc dies with public profiles, which are out of scope entirely; **Search** has no
// feature anywhere in the build plan, and a "coming soon" stub *outside* Settings would break the
// rule that stubs live in Settings — so it's omitted rather than faked.
//
// Same window-scroll rule as every other screen: the viewport is the scroller, no inner div.

export function ProfileScreen() {
  const router = useRouter();

  // Both input-less, so the byte-identical-input contract with `app/profile/page.tsx`'s prefetches
  // is trivially satisfied — worth stating rather than assuming, since every other screen in the
  // app has had to be careful about it.
  const me = api.user.me.useQuery();
  const collections = api.saves.collections.useQuery();

  const [newCollectionOpen, setNewCollectionOpen] = React.useState(false);
  const [collectionsSheetOpen, setCollectionsSheetOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  // Pop when an in-app surface brought us here, push when /profile was opened cold (a bookmark, a
  // reload, the PWA resuming). Same corpus arithmetic as `leaveSaved` — an unconditional push
  // rebuilds a dynamic feed and spends two pages of the reader's corpus per trip.
  const leaveProfile = React.useCallback(() => {
    if (cameToProfileFromApp()) router.back();
    else router.push("/feed");
  }, [router]);

  const goSettings = () => {
    markSettingsOrigin();
    router.push("/settings");
  };

  const goEdit = () => {
    markProfileEditOrigin();
    router.push("/profile/edit");
  };

  return (
    <main className="bg-bg text-ink min-h-dvh">
      {/* Not a GlassHeader — see the file header. One control, right-aligned. */}
      <div className="flex justify-end px-5 pt-14">
        <IconButton size={38} aria-label="Settings" onClick={goSettings}>
          <Gear size={17} />
        </IconButton>
      </div>

      {me.isPending ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : null}

      {/* A failed load must never render as a profile with no name — same rule as every other
          screen's error branch. */}
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

      {me.data ? (
        <>
          <Rise>
            <div className="flex items-center gap-[18px] px-5 pt-[30px]">
              <AvatarChip
                size={88}
                // Deterministic from the user id — see `lib/avatar-hue.ts` for why this isn't
                // stored, and why there is no upload.
                gradient={avatarGradient(me.data.id)}
              />
              <div className="min-w-0">
                <h1 className="text-ink-hi truncate text-[28px] leading-[1.1] font-semibold">
                  {me.data.name}
                </h1>
                {/* Stored bare and lowercase; the `@` is presentation only. */}
                {me.data.handle ? (
                  <p className="text-ink/45 mt-[5px] truncate text-[15px]">
                    @{me.data.handle}
                  </p>
                ) : null}
              </div>
            </div>
          </Rise>

          {me.data.bio ? (
            <p className="text-ink/58 px-5 pt-[14px] text-[14.5px] leading-[1.5]">
              {me.data.bio}
            </p>
          ) : null}

          <div className="px-5 pt-5">
            {/* An outline pill rather than the `Button` primitive: this one is full-width with no
                fill at all, which is neither of that component's two variants — an accent CTA
                here would shout louder than anything else on a quiet screen. */}
            <button
              type="button"
              onClick={goEdit}
              className="border-hairline rounded-pill border-ink/18 text-ink h-[46px] w-full text-[15px] font-medium transition-transform duration-150 active:scale-[0.99]"
            >
              Edit profile
            </button>
          </div>

          <div className="flex items-baseline gap-[9px] px-5 pt-[34px]">
            <h2 className="text-ink text-[17px] font-semibold">Collections</h2>
            <span className="text-ink/40 text-[13px]">
              {collections.data?.length ?? 0}
            </span>
          </div>
          <div className="bg-ink/10 mx-5 mt-[14px] h-[0.5px]" />

          {/* `pb-[120px]` clears the floating pill, so the last row isn't parked under it. Each
              tile rises on its own, with no stagger — the prototype animates them individually. */}
          <div className="grid grid-cols-2 gap-4 px-5 pt-[18px] pb-[120px]">
            <Rise>
              <NewCollectionTile onClick={() => setNewCollectionOpen(true)} />
            </Rise>
            {collections.data?.map((c) => (
              <Rise key={c.id}>
                <CollectionTile
                  id={c.id}
                  name={c.name}
                  itemCount={c.itemCount}
                  cover={c.cover}
                />
              </Rise>
            ))}
          </div>
        </>
      ) : null}

      <PillToolbar
        bookmark="idle"
        // A deliberate divergence from the prototype, whose bookmark goes straight to Saved: one
        // bookmark behavior app-wide. The sheet already writes `saved-origin` and offers filtered
        // entry, so this is strictly more, not less.
        onBookmark={() => setCollectionsSheetOpen(true)}
        onHome={leaveProfile}
        // Inert: you are already on Profile. Passing a no-op rather than letting the default fire
        // keeps the button from pushing a second copy of this screen onto the history stack.
        onProfile={() => undefined}
        // No `onShare` — a profile has nothing to share while public profiles are out of scope.
      />

      <NewCollectionSheet
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={(c) => setToast(`${c.name} created`)}
      />

      <CollectionsSheet
        open={collectionsSheetOpen}
        onClose={() => setCollectionsSheetOpen(false)}
      />

      {/* `raised` — the pill is mounted here, and an unraised toast would sit behind it. */}
      <Toast
        text={toast ?? ""}
        open={toast !== null}
        onDone={() => setToast(null)}
        durationMs={1800}
        raised
      />
    </main>
  );
}
