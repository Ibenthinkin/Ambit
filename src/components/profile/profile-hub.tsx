"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";

import { cameToProfileFromApp } from "~/components/profile/profile-origin";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { Button } from "~/components/ui/button";
import { Column } from "~/components/ui/column";
import { Rise } from "~/components/ui/rise";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";
import { Toolbar } from "~/components/ui/toolbar";
import { avatarGradient } from "~/lib/avatar-hue";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// The Profile hub (docs/DESIGN_list-screens.md §1, decisions 1, 2, 4, 5): what every tab under
// `/profile` shares. `app/profile/layout.tsx` mounts it once around the child page, so a tab
// switch re-renders the page segment and leaves this — the identity block, the nav, the toolbar,
// the toast — where it is.
//
// **Links, not ARIA tabs.** `role="tab"` promises an in-page panel; these navigate (to routes
// that are deep-linkable and reload-safe — decision 4), so they are a `<nav>` of links with
// `aria-current="page"`. **`replace`, not push** (decision 5, Saved's chips' rule): flicking
// between tabs is refinement of one screen, so the hub is one history entry and the toolbar's
// Feed button pops back to the intact feed from any tab. `profile-origin.ts` is the hub's one
// marker; the old `edit-origin`/`settings-origin` pair went with the back chevrons they served.
//
// **No `GlassHeader`**, as before: nothing here needs to stay on screen — the nav scrolls away
// with the avatar, and the toolbar is the fixed chrome.
//
// Same window-scroll rule as every other screen: the viewport is the scroller, no inner div.

/** The four tabs, in order. `segment` is what `useSelectedLayoutSegment()` reports for each. */
export const PROFILE_TABS = [
  { segment: null, href: "/profile", label: "Collections" },
  { segment: "topics", href: "/profile/topics", label: "Topics" },
  { segment: "edit", href: "/profile/edit", label: "Edit profile" },
  { segment: "settings", href: "/profile/settings", label: "Settings" },
] as const;

export interface ProfileHubApi {
  /** Show `text` in the hub's raised toast. The hub owns the one toast so tabs never stack two. */
  toast: (text: string) => void;
}

// A no-op default rather than `null`: a tab rendered outside the hub (its own unit test) toasts
// into the void instead of throwing.
export const ProfileHubContext = React.createContext<ProfileHubApi>({
  toast: () => undefined,
});

export function useProfileHub(): ProfileHubApi {
  return React.useContext(ProfileHubContext);
}

export function ProfileHub({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();

  // Prefetched by the layout, input-less — the byte-identical-input contract holds trivially.
  const me = api.user.me.useQuery();

  const [toastText, setToastText] = React.useState<string | null>(null);
  const [collectionsOpen, setCollectionsOpen] = React.useState(false);
  // The rect of the toolbar control that opened the sheet — above `md` the sheet floats beside
  // it (docs/DESIGN_chrome-redesign.md §2); the phone ignores it.
  const [collectionsAnchor, setCollectionsAnchor] =
    React.useState<DOMRect | null>(null);

  const hubApi = React.useMemo<ProfileHubApi>(
    () => ({ toast: (text) => setToastText(text) }),
    [],
  );

  // Pop when an in-app surface brought us here, push when the hub was opened cold (a bookmark, a
  // reload, the PWA resuming). Same corpus arithmetic as `leaveSaved` — an unconditional push
  // rebuilds a dynamic feed and spends two pages of the reader's corpus per trip. Right from any
  // tab, because the tabs `replace`.
  const leaveProfile = React.useCallback(() => {
    if (cameToProfileFromApp()) router.back();
    else router.push("/feed");
  }, [router]);

  return (
    <ProfileHubContext.Provider value={hubApi}>
      <main className="bg-bg text-ink min-h-dvh">
        {/* The feed's wide column, not the list column (docs/DESIGN_list-screens.md §6): the
            Collections grid packs three or four across, and the other tabs cap themselves. */}
        <Column width="wide">
          {me.isPending ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : null}

          {/* A failed load must never render as a profile with no name — same rule as every
              other screen's error branch. The nav below still renders: Settings (and sign-out)
              must stay reachable when the profile row won't load. */}
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
                <div className="flex items-center gap-[18px] px-5 pt-14">
                  <AvatarChip
                    size={88}
                    // Deterministic from the user id — see `lib/avatar-hue.ts` for why this
                    // isn't stored, and why there is no upload.
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
            </>
          ) : null}

          {/* Where the Edit pill was. Scrolls sideways below md rather than wrapping — four
              labels fit at 402 px; a fifth one day would not. */}
          <nav
            aria-label="Profile"
            className="border-ink/10 mx-5 mt-5 flex gap-6 overflow-x-auto border-b"
          >
            {PROFILE_TABS.map((tab) => {
              const current = tab.segment === segment;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  replace
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 pb-3 text-[14px] font-medium whitespace-nowrap transition-colors",
                    current
                      ? "border-accent text-ink-hi"
                      : "text-ink/55 border-transparent",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {children}
        </Column>

        <Toolbar
          bookmark="idle"
          // One bookmark behavior app-wide: the sheet, which already writes `saved-origin` and
          // offers filtered entry.
          onBookmark={(anchor) => {
            setCollectionsAnchor(anchor);
            setCollectionsOpen(true);
          }}
          onHome={leaveProfile}
          // Inert: you are already on Profile. A no-op rather than the default keeps the button
          // from pushing a second copy of the hub onto the history stack.
          onProfile={() => undefined}
          // No `onShare` — a profile has nothing to share while public profiles are out of scope.
        />

        <CollectionsSheet
          open={collectionsOpen}
          onClose={() => setCollectionsOpen(false)}
          anchor={collectionsAnchor}
        />

        {/* `raised` — the toolbar is mounted here, and an unraised toast would sit behind it. */}
        <Toast
          text={toastText ?? ""}
          open={toastText !== null}
          onDone={() => setToastText(null)}
          durationMs={1800}
          raised
        />
      </main>
    </ProfileHubContext.Provider>
  );
}
