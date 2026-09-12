import { permanentRedirect } from "next/navigation";

// `/settings` was its own screen (5.10 → 09-12-26). Settings is a tab of the Profile hub now
// (docs/DESIGN_list-screens.md §5), so anything still pointing here — a bookmark, a history
// entry, the PWA resuming — lands on the tab. Permanent (308), like `/g/[itemId]`.
//
// `src/proxy.ts` keeps `/settings` in AUTHED_PREFIXES on purpose: a signed-out visitor bounces
// to `/` before this runs, which is the same answer `/profile/settings` would give.
export default function SettingsRedirect() {
  permanentRedirect("/profile/settings");
}
