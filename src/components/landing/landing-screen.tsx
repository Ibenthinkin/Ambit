"use client";

import * as React from "react";

import { Logo } from "~/components/icons";
import { useMediaQuery } from "~/hooks/use-media-query";
import type { LandingShape } from "~/server/config/landing-pool";
import type { ReelPicture, Reels } from "~/server/services/landing-pool";

import { AuthSheet } from "./auth-sheet";
import { LandingReel } from "./landing-reel";
import { Overture } from "./overture";
import { TEMPOS, type Tempo, wantedAhead } from "./tempos";
import { useOverture } from "./use-overture";
import { usePictures } from "./use-pictures";
import { useReel } from "./use-reel";

// The landing screen (docs/DESIGN_landing-redo.md): an overture on black, a hard cut into a reel of
// the corpus's own pictures in one of two tempos, and the sign-in sheet. Shared by `/` and
// `/reset-password` — the reset page is the same screen with the show already over, so a
// password-reset link doesn't land somewhere that looks like a different product.
//
// **What changed from 5.11.** The server picks the reel (D2), so the imagery no longer waits for
// hydration and the first picture is in the HTML. What still must not reach the server's markup
// is the reader's reduced-motion answer and `saveData` (D8): both are read after the hydration
// boundary, which is the lesson 5.11 learned on 09-10-26 (a lazy `useState` initializer evaluated
// `false` on the server and `true` on a reduced-motion client, and the collapse glyph hydrated as
// the wrong element).
//
// **Reduced motion is a tempo, not a mode, as of 09-26-26** — the reader gets the show, gently
// (D6): the overture as everyone sees it, and the reel on `TEMPOS.gentle`.

export interface LandingScreenProps {
  /**
   * `"cycle"` — overture + reel, sheet rises after the first pass (`/`).
   * `"static"` — one still, sheet open immediately, no overture (`/reset-password`).
   */
  mode: "cycle" | "static";
  /** Server-picked (services/landing-pool.ts): a tall reel and a wide one. Neither is ever empty —
   *  an empty shape is the committed fallback picture. */
  reels: Reels;
  /**
   * The server's guess at the reader's screen, from the browser it can see (a phone is held
   * upright). It is the orientation query's server snapshot, so the server's markup and the
   * hydration render agree; the screen's real orientation replaces it one render later.
   */
  initialShape: LandingShape;
  tempo: Tempo;
  children: React.ReactNode;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Stable identity for "track nothing yet" — a fresh `[]` each render would re-run the tracker. */
const NO_PICTURES: ReelPicture[] = [];

/** A form field owns its arrow keys: in one, ←/→ move the caret, not the reel. */
function isEditable(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

// Client-only answers, as stores whose server snapshot is `false` — the server's markup and the
// hydration render agree for every reader, and the real answer arrives one render later.
const subscribeToNothing = () => () => undefined;
const onClient = () => true;
const onServer = () => false;
/** `navigator.connection.saveData` (D6). Absent — most browsers — reads as false. */
const readSaveData = () =>
  (navigator as { connection?: { saveData?: boolean } }).connection
    ?.saveData === true;

export function LandingScreen({
  mode,
  reels,
  initialShape,
  tempo,
  children,
}: LandingScreenProps) {
  const hydrated = React.useSyncExternalStore(
    subscribeToNothing,
    onClient,
    onServer,
  );
  const reduce = useMediaQuery(REDUCED_MOTION);
  const saveData = React.useSyncExternalStore(
    subscribeToNothing,
    readSaveData,
    onServer,
  );
  const isStatic = mode === "static";
  // A phone held upright draws the tall reel, anything wider the wide one (09-25-26): a wide
  // picture covering a tall screen is scaled to its height and cropped to a blurry middle.
  const portrait = useMediaQuery(
    "(orientation: portrait)",
    initialShape === "portrait",
  );
  const pictures = portrait ? reels.portrait : reels.landscape;

  // The reader's own say about the sheet, once they've had one — the first pass raising it, the
  // glyph, a collapse. Until then (`null`) the mode decides: static arrives with it up.
  const [opened, setOpened] = React.useState<boolean | null>(null);
  const open = hydrated && (opened ?? isStatic);

  // Static readers get one still. Save-Data readers get the overture and the first picture, and
  // then nothing more is downloaded: to the reel hook it is one picture long.
  const shown = React.useMemo(
    () => (isStatic || saveData ? pictures.slice(0, 1) : pictures),
    [isStatic, saveData, pictures],
  );

  // Every `cycle` reader gets the overture and its collapse (the server renders its `in` phase for
  // all of them, D8); reduced motion changes the reel, not the line (Ben, 09-26-26).
  const { phase } = useOverture(mode === "cycle");

  // Reduced motion picks the tempo (D6, 09-26-26): the gentle one — the dissolve with nothing but
  // opacity moving — in place of whatever the server resolved. Read after hydration like `saveData`
  // (D8); for the hydration render the tempo is the server's, and nothing is fetched on that
  // render (see the `hydrated` gate on `usePictures`), so no reader pays for the wrong tempo.
  const baseTempo = reduce ? TEMPOS.gentle : tempo;
  // Behind the sheet the reel changes gear (D5): the same hook, the gentler tempo.
  const effectiveTempo = open ? TEMPOS[baseTempo.behindSheet] : baseTempo;

  // `usePictures` needs the reel's index and `useReel` needs what `usePictures` has decoded — a
  // cycle between two hooks. Broken by mirroring the index one render late (React's
  // adjust-state-during-render pattern): the decode tracker is at most a frame behind, which at
  // one-ahead prefetch costs nothing, and the cut prefetches the whole reel regardless.
  //
  // **Not before hydration.** On the hydration commit every client-only store still reads its
  // server snapshot — no Save-Data, no reduced motion, so all twelve pictures at `Infinity` ahead —
  // and passive effects flush before the corrective render, so a tracker running then would
  // download the whole reel for a reader who asked for none of it. The first frames are already
  // `<head>` preloads and the overture buys 3.6 s, so one render of delay costs nothing.
  const [picIndex, setPicIndex] = React.useState(0);
  const { ready, failed, version } = usePictures(
    hydrated ? shown : NO_PICTURES,
    isStatic ? 0 : picIndex,
    wantedAhead(effectiveTempo),
  );

  const reel = useReel({
    count: isStatic ? 0 : shown.length,
    tempo: effectiveTempo,
    enabled: hydrated && phase === "done",
    isReady: (i) => {
      const p = shown[i];
      return p !== undefined && ready.has(p.id);
    },
    isFailed: (i) => {
      const p = shown[i];
      return p !== undefined && failed.has(p.id);
    },
    readyVersion: version,
    onFirstPass: () => setOpened(true),
  });
  if (picIndex !== reel.index) setPicIndex(reel.index);

  const { advance } = reel;

  // Collapsing carries on from the picture on screen, with the first pass re-armed so the sheet
  // rises again after another run (Ben, 09-26-26 — it used to jump back to the first picture).
  const collapse = () => {
    setOpened(false);
    reel.rearm();
  };

  // ←/→ step the reel — unless a form field has focus, or a modifier is held (Alt/⌘+← is the
  // browser's own Back). Nothing calls `preventDefault`: the page doesn't scroll.
  React.useEffect(() => {
    if (isStatic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (isEditable(document.activeElement)) return;
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStatic, advance]);

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: "#000" }}
    >
      <LandingReel
        pictures={shown}
        // Modulo: turning the phone swaps reels mid-run, and the two can differ in length (a
        // fallback is one picture).
        index={isStatic ? 0 : reel.index % shown.length}
        prev={isStatic ? null : reel.prev}
        tempo={effectiveTempo}
        started={isStatic || reel.started}
        onTap={isStatic ? undefined : () => advance(1)}
      />

      {!isStatic ? <Overture phase={phase} hidden={open} /> : null}

      {/* The one visible control while the sheet is down. Its accessible name is deliberately not
          "Sign in" — that belongs to the form's submit button, and two controls sharing it would
          make every `getByRole("button", { name: "Sign in" })` in the e2e suite ambiguous. Keyed on
          the route, not on motion: a reduced-motion reader who collapsed the sheet needs a way
          back up too. */}
      {hydrated && mode !== "static" && !open ? (
        <button
          type="button"
          aria-label="Open sign-in"
          onClick={reel.skip}
          className="border-ink/14 fixed bottom-[28px] left-1/2 z-20 flex size-[54px] -translate-x-1/2 items-center justify-center rounded-full border backdrop-blur-[14px]"
          style={{
            background: "rgba(27,24,21,0.72)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <Logo size={30} className="text-accent" />
        </button>
      ) : null}

      {/* The hero follows the *route*, not the mode: a reduced-motion visitor to `/` still gets the
          pitch, while `/reset-password` never does. */}
      <AuthSheet
        open={open}
        // The prop, never the media query: this must be identical on both sides of hydration.
        onCollapse={mode === "static" ? undefined : collapse}
        showHero={mode !== "static"}
      >
        {children}
      </AuthSheet>
    </div>
  );
}
