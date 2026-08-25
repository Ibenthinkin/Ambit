"use client";

import * as React from "react";

import {
  bannerEligible,
  dismissForever,
  isStandalone,
  markConfirmed,
  readInstallState,
  recordFeedVisit,
  snooze,
  useInstall,
  writeInstallState,
  type InstallState,
} from "~/lib/install-store";

import { InstallBanner } from "./install-banner";
import { InstallConfirmation } from "./install-confirmation";
import { InstallSheet } from "./install-sheet";

// The install flow's state machine, mounted by the feed.
//
// `hidden → banner → sheet → done` mirrors the prototype's four stages, but two of the transitions
// are wired to reality rather than to taps:
//
//   • **"Add" leads to the browser's own prompt where one exists.** Chromium hands us a
//     `beforeinstallprompt` event we can fire on demand; that is a one-tap install and is strictly
//     better than instructions. The instruction sheet is what everyone else gets — which is every
//     iOS reader, since Safari has no such API — and it is the same sheet Settings offers.
//
//   • **"done" is never reached by tapping "Got it".** The prototype treats reading the
//     instructions as installing; on iOS nothing tells the page whether the reader actually went
//     through with it. The confirmation instead follows `appinstalled` (Chromium) or the app's
//     first launch in standalone display mode (everyone, iOS included, one beat later). It shows
//     once ever, tracked by `confirmed` in the persisted state.
//
// The whole component renders nothing at all for most readers most of the time — that is the
// intended resting state.

type Stage = "hidden" | "banner" | "sheet" | "done";

export interface InstallFlowProps {
  /** Injectable clock — the tests need a fixed one, nothing else passes it. */
  now?: () => number;
}

// Same hydration boundary as the landing screen, and for the same reason: everything this
// component decides depends on `localStorage` and the display mode, neither of which the server
// can see. Rendering nothing until React has hydrated keeps the two passes identical, without a
// mount-effect `setState` re-rendering the tree an extra time on every feed load.
const subscribeToNothing = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

interface InitialDecision {
  /** The state to persist for this visit. */
  next: InstallState;
  stage: Stage;
}

export function InstallFlow({ now = () => Date.now() }: InstallFlowProps) {
  const hydrated = React.useSyncExternalStore(
    subscribeToNothing,
    onClient,
    onServer,
  );
  const install = useInstall();

  // Computed once, from reads only — no writes, because a lazy initializer can be invoked twice
  // (StrictMode does exactly that to surface impurity) and counting a visit twice would bring the
  // banner forward by a whole session. The write happens in the effect below, where a repeat is
  // harmless because it stores the same value.
  const [initial] = React.useState<InitialDecision>(() => {
    const at = now();
    const standalone = isStandalone();
    const next = recordFeedVisit(readInstallState(), at);

    if (standalone && !next.confirmed) {
      // First launch from the home screen. The install already happened — possibly days ago, on a
      // platform that never told us — so this is the honest moment to acknowledge it.
      return { next: markConfirmed(next), stage: "done" };
    }
    if (bannerEligible(next, at, standalone)) {
      return { next, stage: "banner" };
    }
    return { next, stage: "hidden" };
  });

  const [stage, setStage] = React.useState<Stage>(initial.stage);
  const [confirmationClosed, setConfirmationClosed] = React.useState(false);

  React.useEffect(() => {
    writeInstallState(initial.next);
  }, [initial]);

  // An install the browser reports mid-session outranks whatever the reader was doing — they just
  // completed the thing the banner was asking for.
  React.useEffect(() => {
    if (install.installed) {
      writeInstallState(markConfirmed(readInstallState()));
    }
  }, [install.installed]);

  const effectiveStage: Stage =
    install.installed && !confirmationClosed ? "done" : stage;

  async function handleAdd() {
    if (!install.canPrompt) {
      setStage("sheet");
      return;
    }
    const outcome = await install.prompt();
    if (outcome === "dismissed") {
      // They opened the browser's dialog and backed out. That is a "not now", not a refusal to
      // ever be asked — and it is emphatically not a reason to then show them instructions.
      writeInstallState(snooze(readInstallState(), now()));
      setStage("hidden");
    }
    // "accepted" surfaces as `install.installed` above. "unavailable" cannot happen here:
    // `canPrompt` was true a line ago and the prompt is only spent by this very call.
  }

  function handleSnooze() {
    writeInstallState(snooze(readInstallState(), now()));
    setStage("hidden");
  }

  function handleDismiss() {
    writeInstallState(dismissForever(readInstallState()));
    setStage("hidden");
  }

  function handleConfirmationDone() {
    setConfirmationClosed(true);
    setStage("hidden");
  }

  if (!hydrated) return null;

  return (
    <>
      {effectiveStage === "banner" ? (
        <InstallBanner
          onAdd={() => void handleAdd()}
          onDismiss={handleDismiss}
        />
      ) : null}

      {/* Closing the sheet — scrim or Escape — counts as "not now" rather than as nothing: someone
          who opened the instructions and closed them again has answered. */}
      <InstallSheet open={effectiveStage === "sheet"} onClose={handleSnooze} />

      {effectiveStage === "done" ? (
        <InstallConfirmation onDone={handleConfirmationDone} />
      ) : null}
    </>
  );
}
