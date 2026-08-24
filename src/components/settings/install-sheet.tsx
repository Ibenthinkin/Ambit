"use client";

import * as React from "react";

import { PlusSquare, Share } from "~/components/icons";
import { BottomSheet } from "~/components/ui/bottom-sheet";

// "Add to home screen" — instructions, not an install button.
//
// **Why instructions on iOS at all:** Safari has no `beforeinstallprompt`, no programmatic install,
// and doesn't read the web app manifest for its Add-to-Home-Screen flow (which is why layout.tsx
// carries a separate `appleWebApp` block). The only thing an app can do there is point at the
// browser's own controls. Android/Chromium *does* have a prompt event, and 5.11's install flow will
// use it — this sheet is written to be imported by that phase rather than replaced by it: the steps
// stay correct as the fallback for every browser the prompt doesn't fire in.
//
// Installing matters here beyond tidiness: on iOS, notification permission (Settings' Permissions
// group) exists *only* inside an installed PWA, so this sheet is the path that makes that row
// answerable at all.
export interface InstallSheetProps {
  open: boolean;
  onClose: () => void;
}

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-[13px]">
      <span className="bg-ink/6 text-ink/55 mt-[1px] flex size-[22px] flex-none items-center justify-center rounded-full text-[12px] font-semibold">
        {n}
      </span>
      <span className="text-ink/70 flex-1 text-[13.5px] leading-[1.6]">
        {children}
      </span>
      {icon ? (
        <span className="text-ink/45 mt-[2px] flex-none">{icon}</span>
      ) : null}
    </li>
  );
}

export function InstallSheet({ open, onClose }: InstallSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Add to home screen">
      <div className="flex flex-col gap-5 px-5 pt-1 pb-3">
        <p className="text-ink/45 text-[13px] leading-[1.5]">
          Ambit runs full-screen once it&apos;s on your home screen, and opens
          without the browser chrome.
        </p>

        <div>
          <p className="text-ink/34 text-[11px] font-semibold tracking-[1.2px] uppercase">
            iPhone &amp; iPad
          </p>
          <ol className="mt-[10px] flex flex-col gap-[10px]">
            <Step n={1} icon={<Share size={15} />}>
              Tap the Share button in Safari&apos;s toolbar.
            </Step>
            <Step n={2} icon={<PlusSquare size={15} />}>
              Scroll down and choose <strong>Add to Home Screen</strong>.
            </Step>
            <Step n={3}>Tap Add. Ambit appears with your other apps.</Step>
          </ol>
        </div>

        <div>
          <p className="text-ink/34 text-[11px] font-semibold tracking-[1.2px] uppercase">
            Android
          </p>
          <ol className="mt-[10px] flex flex-col gap-[10px]">
            <Step n={1}>Open the browser menu (⋮).</Step>
            <Step n={2} icon={<PlusSquare size={15} />}>
              Choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </Step>
            <Step n={3}>Confirm. Ambit installs like any other app.</Step>
          </ol>
        </div>
      </div>
    </BottomSheet>
  );
}
