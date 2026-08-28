"use client";

import * as React from "react";

import { useAccent } from "~/lib/accent";

/**
 * Re-asserts the reader's stored accent onto `<html>` after React has finished with the document.
 * Renders nothing.
 *
 * **Why this is needed at all** — found in Phase 7.1, the first time the e2e suite ran against a
 * production build. `layout.tsx` renders `<html data-accent="indigo">`, and the inline `<head>`
 * script replaces that with the reader's stored accent before first paint. React, however, owns
 * every attribute it renders: when it hydrates `<html>` it reconciles that attribute back to the
 * literal it rendered — indigo — roughly 15ms in, with the correct value still sitting in
 * localStorage. The reader's symptom is small and infuriating: pick Amber in Settings, reload, get
 * Indigo.
 *
 * It went unnoticed for a phase and a half because it takes both halves of a specific setup to see
 * it. Development builds *warn* about a hydration mismatch rather than patching it, so `bun run
 * dev` never showed it; and `suppressHydrationWarning` on `<html>` — there so a non-default accent
 * doesn't log on every load — meant the warning nobody was reading wasn't printed either.
 *
 * **Why an effect, and why with no dependency array.** Effects run after the commit that clobbered
 * the attribute, so this puts it back on the very next tick — after paint, so the pre-paint script
 * still does the real anti-flash work and this only repairs what React undid. The missing dep array
 * is deliberate: the repair has to follow *every* commit of this component, not only those where
 * the accent value itself changed (the hydration pass is exactly a commit where it did not). It is
 * one attribute write against the DOM, so running it per render costs nothing worth counting.
 *
 * The honest description of this component is a patch over React's reconciliation rather than a
 * removal of its cause. Removing the cause means letting the server render the accent it will
 * actually paint — a cookie instead of (or beside) localStorage — which reverses a recorded 5.10
 * decision and is a bigger change than the bug warrants today. If the accent ever becomes
 * server-known, delete this file.
 */
export function AccentSync() {
  const accent = useAccent();

  React.useEffect(() => {
    // `null` until the store has a real snapshot (the server render and the hydration render both
    // see it) — there is nothing to repair yet at that point, and writing the default would be the
    // very flip this exists to prevent.
    if (accent) document.documentElement.dataset.accent = accent;
  });

  return null;
}
