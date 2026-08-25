"use client";

import * as React from "react";

import { attachInstallListeners } from "~/lib/install-store";

// Renders nothing. It exists because `beforeinstallprompt` fires **once, early, and only once** —
// Chromium decides the app is installable, fires the event, and if nothing called
// `preventDefault()` on it the offer is gone and its own mini-infobar has already appeared.
//
// Mounting this in the root layout means the listeners are attached on whatever page the reader
// happens to land on, rather than only on `/feed` where the banner lives. A reader who arrives on a
// shared item link and browses for a while would otherwise never be offered an install at all.
export function InstallListener() {
  React.useEffect(() => {
    attachInstallListeners();
  }, []);
  return null;
}
