"use client";

import * as React from "react";

// The one Permissions row in `/settings` backed by a real browser API. Everything about this hook
// is shaped by the fact that the answer is genuinely unavailable during render.
//
// **`"unsupported"` is a real state, not a fallback.** On iOS, `window.Notification` does not exist
// in Safari at all — it appears only inside an *installed* PWA. So a reader on an iPhone who hasn't
// added Ambit to their home screen will legitimately see "Unavailable", and the row has to say so
// rather than offering a button that can't work. It also, usefully, describes jsdom, where the
// global is likewise absent unless a test stubs one.
//
// **Null before mount**, which is why the return type includes it: reading `Notification.permission`
// during render would make the server's HTML and the client's first render disagree. The screen
// renders no value at all until this resolves — a blank slot for one frame, rather than a wrong one.

export type NotificationState =
  "unsupported" | "default" | "granted" | "denied";

export interface NotificationPermission {
  /** `null` until the first effect has run — see the file header. */
  state: NotificationState | null;
  /**
   * Prompts, and folds the answer back into `state`. Only meaningful from `"default"`: a browser
   * that has already been answered resolves immediately with the standing answer rather than
   * re-prompting, which is exactly why the screen routes granted/denied taps to a toast instead.
   */
  request: () => void;
}

/**
 * The API, or `undefined` where it doesn't exist.
 *
 * `"Notification" in window` on its own is not enough: some embedded webviews (and any test that
 * stubs the global away) leave the key present with an undefined value, and reading `.permission`
 * off that throws. The value is what matters, not the key.
 */
function notificationApi(): typeof Notification | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { Notification?: typeof Notification }).Notification;
}

function read(): NotificationState {
  const api = notificationApi();
  if (!api) return "unsupported";
  const permission = api.permission;
  return permission === "granted" || permission === "denied"
    ? permission
    : "default";
}

// The permission lives on `window.Notification`, i.e. outside React, and changes only when the
// browser answers a prompt — an external store with exactly one event. `useSyncExternalStore` is
// the right shape for that, and it gives the pre-mount null for free: `getServerSnapshot` is what
// both the server render and the hydration render use, so they agree by construction.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * No cache: `useSyncExternalStore` compares snapshots with `Object.is`, and this returns a string,
 * so reading the live value on every render is already identity-stable by value. A cache would only
 * add a way for the two to disagree.
 */
function getSnapshot(): NotificationState {
  return read();
}

/** Wakes every mounted row after the browser has answered a prompt. */
function refresh(): void {
  for (const listener of listeners) listener();
}

export function useNotificationPermission(): NotificationPermission {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, () => null);

  const request = React.useCallback(() => {
    const api = notificationApi();
    if (!api) return;
    // `.then` with an optional chain, not `await`: the older callback-style signature is still
    // what some browsers ship, and there `requestPermission()` returns undefined — an `await` on
    // it would resolve immediately with a stale answer, and a bare `.then` would throw. A missing
    // promise simply means no update here, and the value re-reads on the next mount.
    void api.requestPermission()?.then(refresh);
  }, []);

  return { state, request };
}
