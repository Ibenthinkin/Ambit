"use client";

import { Check } from "~/components/icons";
import { Button } from "~/components/ui/button";

// "Ambit is on your home screen" (`Ambit - Install.dc.html`, stage 3 of 3) — the one moment in the
// install flow that is pure acknowledgement.
//
// **When this appears is a deliberate departure from the prototype.** The prototype reaches this
// stage when the reader taps "Got it" on the instructions, which asserts an install that may never
// have happened: Safari gives a page no signal at all about Add to Home Screen, so "Got it" means
// only "I have read three sentences". Here the confirmation is triggered by something that is
// actually true — Chromium's `appinstalled` event, or the first time the app is launched in
// standalone display mode — which is also how iOS readers still get to see it, one beat later than
// the prototype imagined.
export interface InstallConfirmationProps {
  onDone: () => void;
}

export function InstallConfirmation({ onDone }: InstallConfirmationProps) {
  return (
    <div
      data-testid="install-done"
      className="bg-bg/85 fixed inset-0 z-50 flex flex-col items-center justify-center px-8 text-center backdrop-blur-[6px]"
    >
      <div className="bg-accent text-on-accent animate-pop-in flex size-[72px] items-center justify-center rounded-full">
        <Check size={34} />
      </div>
      <h2 className="text-ink-hi mt-6 text-[22px] font-semibold tracking-[-0.2px]">
        Ambit is on your home screen
      </h2>
      <p className="text-ink/60 mt-2 max-w-[300px] text-[14.5px] leading-[1.55]">
        Open it anytime for one interesting thing — no browser, no noise.
      </p>
      <Button shape="rounded" size="lg" onClick={onDone} className="mt-7">
        Start exploring
      </Button>
    </div>
  );
}
