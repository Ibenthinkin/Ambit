"use client";

import * as React from "react";

import { AuthCard } from "~/components/landing/auth-card";
import { AuthSheet } from "~/components/landing/auth-sheet";

// The sign-in / sign-up sheet a signed-out visitor can raise over the app (09-26-26). It began as
// `/explore`'s own — the landing's `AuthSheet` + `AuthCard`, over a feed instead of a reel — and
// moved here the day the toolbar reached signed-out screens: `/explore`'s pill, and the item
// pages a stranger can open, all put Profile and Save behind the same ask ("Have an invite?"),
// so the sheet had to be one thing mounted in three places rather than three copies.
//
// Two parts, so a screen keeps its own state and this file keeps the rendering:
//   - `useAuthSurface()` — the state: whether it's up, which mode the card opens in, and a key
//     that remounts the card on every open, so `initialMode` takes effect each time and a
//     half-typed form from the last opening doesn't linger under a different heading.
//   - `<AuthSurface>` — the scrim, the sheet and the card. Escape closes it, as it does every
//     other sheet in the app (the landing's has no Escape because there it *is* the screen).

export type AuthMode = "signin" | "signup";

export interface AuthSurfaceState {
  open: boolean;
  mode: AuthMode;
  /** Bumped on every open — the card's `key`. */
  cardKey: number;
  openAuth: (mode: AuthMode) => void;
  closeAuth: () => void;
}

export function useAuthSurface(initialMode?: AuthMode): AuthSurfaceState {
  const [auth, setAuth] = React.useState<{ open: boolean; mode: AuthMode }>(
    () =>
      initialMode
        ? { open: true, mode: initialMode }
        : { open: false, mode: "signin" },
  );
  const [cardKey, setCardKey] = React.useState(0);

  const openAuth = React.useCallback((mode: AuthMode) => {
    setCardKey((k) => k + 1);
    setAuth({ open: true, mode });
  }, []);
  const closeAuth = React.useCallback(
    () => setAuth((a) => ({ ...a, open: false })),
    [],
  );

  return { open: auth.open, mode: auth.mode, cardKey, openAuth, closeAuth };
}

export interface AuthSurfaceProps extends Pick<
  AuthSurfaceState,
  "open" | "mode" | "cardKey" | "closeAuth"
> {
  /** What the sheet's logo button says it does — where "back" is on this screen. */
  collapseLabel: string;
}

export function AuthSurface({
  open,
  mode,
  cardKey,
  closeAuth,
  collapseLabel,
}: AuthSurfaceProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuth();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAuth]);

  return (
    <>
      {/* The landing's own scrim is inert (its reel is tap-to-skip underneath); over a feed or a
          picture, a tap outside the sheet should close it rather than reach what's under it. Above
          the toolbar (z-30) and below the sheet (z-40). */}
      {open ? (
        <div
          aria-hidden
          data-testid="auth-scrim"
          className="fixed inset-0 z-[35]"
          onClick={closeAuth}
        />
      ) : null}
      <AuthSheet
        open={open}
        onCollapse={closeAuth}
        collapseLabel={collapseLabel}
      >
        <AuthCard key={cardKey} initialMode={mode} />
      </AuthSheet>
    </>
  );
}
