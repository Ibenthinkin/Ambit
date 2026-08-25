"use client";

import * as React from "react";

// Everything the app knows about being installed: whether it already is, whether the browser has
// offered us a prompt to trigger, and whether this reader has earned (or refused) the banner.
//
// Three concerns live here because they answer one question — "should we ask, and what happens if
// they say yes?" — and splitting them would mean three modules that only ever get imported
// together. They are kept separable in shape, though: the eligibility half is pure functions over
// a plain object, testable without a DOM at all.

// ---------------------------------------------------------------------------------------------
// Persisted eligibility state
// ---------------------------------------------------------------------------------------------

export interface InstallState {
  /** Schema version. A stored value with any other `v` is discarded rather than migrated. */
  v: 1;
  feedVisits: number;
  lastVisitAt: number;
  /** Epoch ms until which "Not now" holds. */
  snoozedUntil?: number;
  /** The X was tapped — never ask again on this device. */
  dismissed?: boolean;
  /** The "on your home screen" confirmation has been shown once and must not repeat. */
  confirmed?: boolean;
}

export const INSTALL_KEY = "ambit.install.v1";

/**
 * How far apart two feed loads must be to count as separate visits.
 *
 * Without this a single afternoon of tab-switching would look like a dozen visits and the banner
 * would appear on day one — which is exactly the eagerness this is meant to avoid.
 */
export const VISIT_GAP_MS = 6 * 60 * 60 * 1000;

/** "Not now" is a month's silence, not a dismissal. */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The banner waits for the second visit.
 *
 * Someone still on their first session is deciding whether they want Ambit at all; asking for a
 * place on their home screen before they know the answer is the sort of nagging the whole product
 * is a reaction against. Coming back is the signal worth acting on.
 */
export const MIN_VISITS = 2;

const EMPTY: InstallState = { v: 1, feedVisits: 0, lastVisitAt: 0 };

/**
 * Reads the stored state, tolerating everything: no entry, unparseable JSON, a value from a future
 * schema, or a browser that throws on `localStorage` access entirely (Safari in Lockdown mode does
 * exactly this). Any of those means "we know nothing about this reader yet", which is a safe thing
 * to believe — the worst case is one extra visit before the banner appears.
 */
export function readInstallState(): InstallState {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { v?: unknown }).v !== 1
    ) {
      return EMPTY;
    }
    return { ...EMPTY, ...(parsed as Partial<InstallState>), v: 1 };
  } catch {
    return EMPTY;
  }
}

export function writeInstallState(state: InstallState): void {
  try {
    localStorage.setItem(INSTALL_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (Lockdown mode, a full quota). The reader sees the banner a little more
    // often than they should; nothing else about the app cares.
  }
}

/** Counts this feed load as a visit if enough time has passed since the last counted one. */
export function recordFeedVisit(
  state: InstallState,
  now: number,
): InstallState {
  if (now - state.lastVisitAt < VISIT_GAP_MS) return state;
  return { ...state, feedVisits: state.feedVisits + 1, lastVisitAt: now };
}

export function bannerEligible(
  state: InstallState,
  now: number,
  standalone: boolean,
): boolean {
  // Already installed: there is nothing to offer, and offering it anyway is how an app tells its
  // reader it isn't paying attention.
  if (standalone || state.dismissed) return false;
  if (state.snoozedUntil !== undefined && state.snoozedUntil > now)
    return false;
  return state.feedVisits >= MIN_VISITS;
}

export function snooze(state: InstallState, now: number): InstallState {
  return { ...state, snoozedUntil: now + SNOOZE_MS };
}

export function dismissForever(state: InstallState): InstallState {
  return { ...state, dismissed: true };
}

export function markConfirmed(state: InstallState): InstallState {
  return { ...state, confirmed: true };
}

// ---------------------------------------------------------------------------------------------
// Display mode
// ---------------------------------------------------------------------------------------------

/**
 * Is the app running as an installed app rather than in a browser tab?
 *
 * Two checks because two platforms answer differently: `display-mode: standalone` is the standard
 * (and what Chromium/Android report), while iOS Safari has never implemented it for home-screen
 * apps and exposes the non-standard `navigator.standalone` instead.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// The browser's install prompt
// ---------------------------------------------------------------------------------------------

/**
 * Chromium's `beforeinstallprompt`. Not in TypeScript's DOM lib — it isn't a standard — so the
 * shape the code actually uses is declared here.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallSnapshot {
  /** A real browser prompt is in hand and can be shown. */
  canPrompt: boolean;
  /** The browser told us an install completed during this page's life. */
  installed: boolean;
}

export type PromptResult = "accepted" | "dismissed" | "unavailable";

// Module-level rather than component state, because the event does not wait for React: Chromium
// fires `beforeinstallprompt` once, early, and if nothing is listening at that moment the offer is
// simply gone. A module that starts listening as soon as the layout mounts can hold it for whatever
// component asks later.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let snapshot: InstallSnapshot = { canPrompt: false, installed: false };
let attached = false;
const listeners = new Set<() => void>();

function emit() {
  // A fresh object each time, but only when something actually changed — `useSyncExternalStore`
  // compares snapshots by identity and would loop forever on a new object per read.
  snapshot = { canPrompt: deferred !== null, installed };
  for (const listener of listeners) listener();
}

export function attachInstallListeners(target: Window = window): void {
  if (attached) return;
  attached = true;

  target.addEventListener("beforeinstallprompt", (event) => {
    // Suppresses Chrome's own mini-infobar so the designed banner is the only ask the reader gets.
    // The event is then ours to fire whenever they tap Add.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });

  target.addEventListener("appinstalled", () => {
    installed = true;
    // The prompt is spent — a second call would reject.
    deferred = null;
    emit();
  });
}

/** Test seam: clears the module's accumulated state between cases. */
export function resetInstallStoreForTests(): void {
  deferred = null;
  installed = false;
  attached = false;
  listeners.clear();
  snapshot = { canPrompt: false, installed: false };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallSnapshot {
  return snapshot;
}

// A stable object, not a fresh literal: this is returned on every server render and identity churn
// here would defeat `useSyncExternalStore`'s bail-out.
const SERVER_SNAPSHOT: InstallSnapshot = { canPrompt: false, installed: false };
function getServerSnapshot(): InstallSnapshot {
  return SERVER_SNAPSHOT;
}

export function useInstall(): InstallSnapshot & {
  prompt: () => Promise<PromptResult>;
} {
  const snap = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const prompt = React.useCallback(async (): Promise<PromptResult> => {
    const event = deferred;
    if (!event) return "unavailable";
    // Cleared before awaiting, not after: the event is single-use, and a double tap that got two
    // calls in flight would have the second one reject.
    deferred = null;
    emit();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  }, []);

  return { ...snap, prompt };
}
