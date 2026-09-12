"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  Bell,
  ChatBubble,
  Contrast,
  Download,
  FeedLines,
  Globe,
  Info,
  Mute,
  Person,
  PersonPlus,
  Photo,
  Rays,
} from "~/components/icons";
import { Toast } from "~/components/ui/toast";
import { authClient } from "~/lib/auth-client";
import { ACCENTS, setAccent, useAccent } from "~/lib/accent";
import { api } from "~/trpc/react";
import { AboutSheet } from "./about-sheet";
import { AccentSheet } from "./accent-sheet";
import { InstallSheet } from "~/components/install/install-sheet";
import { isStandalone, useInstall } from "~/lib/install-store";
import { purgePagesCache } from "~/lib/sw-rules";
import { SettingsGroup, SettingsRow } from "./settings-row";
import { useNotificationPermission } from "./use-notification-permission";

// `/profile/settings` (`Ambit - Settings.dc.html`) — the Settings tab of the Profile hub since
// 09-12-26 (docs/DESIGN_list-screens.md §5; `/settings` is a permanent redirect here). The full
// designed surface, with a hard line down the middle of it.
//
// **Real rows do the thing. Stub rows say so and show nothing.** The prototype's demo values ("2
// left", "Often", "Not determined") are all dropped: a settings screen that displays invented state
// is worse than one that admits a feature isn't built, because the reader has no way to tell which
// numbers they can trust. A stub is a visible row with a chevron, a real icon, and a "coming soon"
// toast — Serendipity, Muted sources, Invite a friend, Camera roll, Language. The two rows whose
// value is *true* today keep it: Muted sources says "None" and Language says "English".
//
// This screen is also where **sign-out lives** — `/profile/settings` is its permanent home. It sat
// on `/dev/tokens` from 5.6, flagged there as an interim home, because the design handoff has no
// sign-out affordance on any screen — the one-row card below is 5.10's own invention rather than a
// recreation of anything.
//
// As a tab it renders content only: the hub (`profile-hub.tsx`) owns the identity block, the nav
// and the toolbar, so the glass header, its back chevron and the two shortcut cards (Edit profile,
// "Everything kept") went — the tabs above are those doorways, and Saved has the toolbar's
// bookmark. "Account details" and "What you see" switch tabs in place.

/** Display mode never changes within a page's life, so this subscription has nothing to report. */
const subscribeToNothing = () => () => undefined;

/** Ben's address — the "Get in touch" row is a mailto, not a form; there's no inbox to build. */
const CONTACT_EMAIL = "benjamin.reilly@gmail.com";

/** The one sheet open at a time, as a discriminant rather than four booleans that could disagree. */
type OpenSheet = "accent" | "about" | "install" | null;

export interface SettingsScreenProps {
  /** "v0.4" — derived from package.json server-side (`app/profile/settings/page.tsx`). */
  versionLabel: string;
}

export function SettingsScreen({ versionLabel }: SettingsScreenProps) {
  const router = useRouter();

  // Both prefetched by the RSC shell, both input-less — so the byte-identical-input contract is
  // trivially satisfied, and a hard reload paints filled.
  const topics = api.topics.list.useQuery();
  const myTopics = api.topics.mine.useQuery();

  const [openSheet, setOpenSheet] = React.useState<OpenSheet>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  // ── client-capability state: null until hydration is past ──────────────────────────────────────
  // Both of these live outside React (one in localStorage, one on `window.Notification`) and are
  // unreadable during a server render, so reading them at render time would make the server's HTML
  // and the client's first render disagree — a hydration mismatch on every load for anyone who has
  // ever touched either. Both are therefore `useSyncExternalStore` hooks that report `null` through
  // hydration and the real value on the pass after; the rows render no value in the meantime rather
  // than a wrong one. (The accent's *paint* is already correct by then — layout.tsx's inline script
  // sets the attribute before first paint. This is only about what React knows.)
  const accent = useAccent();
  const notifications = useNotificationPermission();
  // Same shape, same reason: the display mode and the browser's install prompt are both unreadable
  // during a server render. `false` through hydration means the row renders its ordinary "Install"
  // state and settles a frame later, which is the harmless direction to be wrong in.
  const install = useInstall();
  const standalone = React.useSyncExternalStore(
    subscribeToNothing,
    isStandalone,
    () => false,
  );

  /** Every stub row's tap. One place, so they can't drift into five different apologies. */
  const stub = (label: string) => () => setToast(`${label} · coming soon`);

  const topicValue = formatTopicValue(topics.data ?? [], myTopics.data ?? []);

  const accentLabel = accent
    ? ACCENTS.find((a) => a.key === accent)?.label
    : undefined;

  const onNotificationsTap = () => {
    switch (notifications.state) {
      case "default":
        notifications.request();
        break;
      case "granted":
      case "denied":
        // The browser will not re-prompt once it has an answer, so offering to "ask again" here
        // would be a button that does nothing. Say where the switch actually is.
        setToast("Change this in your browser settings.");
        break;
      case "unsupported":
        setToast("Notifications aren't available in this browser.");
        break;
      default:
        // Still null (pre-mount). Nothing to say yet.
        break;
    }
  };

  return (
    <>
      {/* Left-aligned at the list measure inside the hub's wide column (docs/DESIGN_list-screens.md
          §6). The rows keep their own `px-5` inside it, so above 768px the list simply stops
          widening. */}
      <div className="md:max-w-[600px]">
        <div className="px-5 pt-5 pb-[120px]">
          <SettingsGroup title="Account">
            <SettingsRow
              icon={<Person size={17} />}
              label="Account details"
              // An in-hub tab switch, so `replace` like the nav (docs/DESIGN_list-screens.md §5).
              onClick={() => router.replace("/profile/edit")}
            />
            <SettingsRow
              icon={<PersonPlus size={17} />}
              label="Invite a friend"
              // No value: invites exist, but only as an admin script (`bun run invite`). A count
              // here would be fiction.
              onClick={stub("Invite a friend")}
            />
            {/* Three states, because the honest answer differs by platform. Already installed: say
              so and offer nothing. A real `beforeinstallprompt` in hand (Chromium): fire it — one
              tap beats three steps of instructions. Otherwise, and that includes every iOS
              reader, the instruction sheet. */}
            <SettingsRow
              icon={<Download size={17} />}
              label="Add to home screen"
              value={standalone ? "Installed" : undefined}
              action={standalone ? undefined : "Install"}
              onClick={
                standalone
                  ? undefined
                  : install.canPrompt
                    ? () => void install.prompt()
                    : () => setOpenSheet("install")
              }
            />
          </SettingsGroup>

          <SettingsGroup title="Your feed">
            <SettingsRow
              icon={<FeedLines size={17} />}
              label="What you see"
              value={topicValue}
              // A page since 09-10-26, not a sheet: the picker offers every topic by facet, which a
              // bottom sheet has no room for. An in-hub tab switch since 09-12-26, so `replace`
              // like the nav (docs/DESIGN_list-screens.md §5).
              onClick={() => router.replace("/profile/topics")}
            />
            <SettingsRow
              icon={<Mute size={17} />}
              label="Muted sources"
              // True today, and will stay true until muting is built: nothing anywhere in the app
              // mutes a source.
              value="None"
              onClick={stub("Muted sources")}
            />
            <SettingsRow
              icon={<Rays size={17} />}
              label="Serendipity"
              // The dial exists server-side (JUMP share, wildcardChance) but has no per-user value
              // to report, so the row shows none.
              onClick={stub("Serendipity")}
            />
          </SettingsGroup>

          <SettingsGroup title="Permissions">
            <SettingsRow
              icon={<Photo size={17} />}
              label="Camera roll"
              onClick={stub("Camera roll")}
            />
            <SettingsRow
              icon={<Bell size={17} />}
              label="Notifications"
              value={notificationValue(notifications.state)}
              // Denied is the one state the reader has to leave the app to change — the warn tint
              // marks it as a dead end rather than a setting.
              warnValue={notifications.state === "denied"}
              onClick={onNotificationsTap}
            />
          </SettingsGroup>

          <SettingsGroup title="Other">
            <SettingsRow
              icon={<Contrast size={17} />}
              label="Appearance"
              value={accentLabel}
              onClick={() => setOpenSheet("accent")}
            />
            <SettingsRow
              icon={<Globe size={17} />}
              label="Language"
              // True: the app is English-only, with no translation layer anywhere.
              value="English"
              onClick={stub("Language")}
            />
            <SettingsRow
              icon={<Info size={17} />}
              label="About Ambit"
              onClick={() => setOpenSheet("about")}
            />
            <SettingsRow
              icon={<ChatBubble size={17} />}
              label="Get in touch"
              onClick={() => {
                window.location.href = `mailto:${CONTACT_EMAIL}`;
              }}
            />
          </SettingsGroup>

          {/* Sign out's permanent home, and 5.10's own addition — the design handoff has no sign-out
            affordance anywhere. A card of its own rather than a row in "Other": it's the one
            control here that ends the session, and it shouldn't sit next to the language picker. */}
          <SettingsGroup>
            <SignOutRow />
          </SettingsGroup>

          <p className="text-ink/28 mt-[34px] text-center text-[12px]">
            Ambit · invite-only · {versionLabel}
          </p>
        </div>
      </div>

      <AccentSheet
        open={openSheet === "accent"}
        onClose={() => setOpenSheet(null)}
        current={accent ?? "indigo"}
        onPick={setAccent}
      />

      <AboutSheet
        open={openSheet === "about"}
        onClose={() => setOpenSheet(null)}
        versionLabel={versionLabel}
      />

      <InstallSheet
        open={openSheet === "install"}
        onClose={() => setOpenSheet(null)}
      />

      {/* Its own toast rather than the hub's — the stubs and the notifications row say things
          unrelated to anything else on the hub. `raised`: the hub's toolbar sits under it now. */}
      <Toast
        text={toast ?? ""}
        open={toast !== null}
        onDone={() => setToast(null)}
        durationMs={1700}
        raised
      />
    </>
  );
}

/**
 * The sign-out control, moved verbatim from `app/dev/tokens/sign-out-button.tsx` (deleted with this
 * phase).
 *
 * **Keep the accessible name exactly "Sign out"** — `e2e/auth.spec.ts` and `e2e/settings.spec.ts`
 * both select it by role + name, and it is the only way either suite can end a session.
 */
function SignOutRow() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        // Drop the cached `/feed` document before the session goes. It holds the first page of a
        // personalized feed dehydrated into its HTML, and on a shared device the next person to
        // open the app offline would otherwise be shown the last reader's feed. Best-effort and
        // deliberately not awaited — signing out must not wait on, or be blocked by, a cache.
        void purgePagesCache();
        void authClient.signOut().then(() => router.push("/"));
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="text-ink flex w-full items-center px-4 py-[15px] text-left text-[15px]"
    >
      Sign out
    </button>
  );
}

/**
 * The "What you see" row's value: the first three picked labels alphabetically, then "+N" for the
 * rest.
 *
 * **Sorted here, deliberately**, because `topics.mine` returns rows in whatever order Postgres
 * hands them back — "the catalog's order" is not a stable thing to defer to. Alphabetical is the
 * one ordering that reads the same on every visit and needs nothing from the query.
 *
 * (This comment used to also flag the *onboarding grid* as unordered, and to note that fixing it
 * would mean adding an `ORDER BY` to `listTopics` — a change the phase that wrote this didn't own.
 * Cut 2a made it, 09-02-26: `listTopics` orders by label now, so both screens agree. The local
 * sort stays, because `topics.mine` still doesn't.)
 */
function formatTopicValue(
  catalog: { id: string; label: string }[],
  picked: string[],
): string {
  if (picked.length === 0) return "Nothing picked";
  const set = new Set(picked);
  const labels = catalog
    .filter((t) => set.has(t.id))
    .map((t) => t.label)
    .sort((a, b) => a.localeCompare(b));
  if (labels.length === 0) return "Nothing picked";
  const shown = labels.slice(0, 3).join(", ");
  const rest = labels.length - 3;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** The Notifications row's value, including the deliberate blank before the hook has answered. */
function notificationValue(
  state: ReturnType<typeof useNotificationPermission>["state"],
): string | undefined {
  switch (state) {
    case "default":
      return "Not asked";
    case "granted":
      return "On";
    case "denied":
      return "Off";
    case "unsupported":
      return "Unavailable";
    default:
      return undefined;
  }
}
