"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { markGalleryOrigin } from "~/components/gallery/gallery-origin";
import { usePress } from "~/hooks/use-press";

// The doorway into the gallery: a tap on the item page's hero opens `/g/[itemId]`.
//
// **This is deliberately not a `<Link>`, and not the feed tile's press handling either.** Both would
// be the obvious move, and both would break something bought on 08-20-26.
//
//   - An `<a>` changes iOS's long-press callout on the image it wraps — the callout is what offers
//     the native **"Add to Photos"**, two taps to the camera roll against three through the share
//     sheet, and no web API can replace it (`navigator.share({files})` handing off to the OS sheet is
//     the ceiling for a web app).
//   - The feed tiles set `-webkit-touch-callout: none`, where it's load-bearing: iOS raises its own
//     image menu partway through the long-press that opens their item sheet, and the gesture never
//     completes. Copying that block here would be a regression, because this hero has **no**
//     long-press of its own to protect. See `image-item-body.tsx`'s warning comment, which is the
//     law on this point.
//
// So: `usePress` with a tap handler and nothing else. No long-press, no `preventDefault`, no
// callout suppression. The slop guard is the only thing standing between a tap and a scroll that
// happened to start on the picture — which, on a touch device, is most scrolls.

export interface HeroGalleryLinkProps {
  itemId: string;
  children: React.ReactNode;
}

export function HeroGalleryLink({ itemId, children }: HeroGalleryLinkProps) {
  const router = useRouter();

  // Tap only. `usePress` fires this on release, and only if the press neither travelled past the
  // 12px slop nor became a long press — and with no `onLongPress` passed, the long-press branch is
  // never armed at all, which is what leaves iOS's own callout completely undisturbed.
  const press = usePress({
    onTap: () => {
      // Written immediately before the navigation, so the gallery's close gesture knows this page
      // is one entry down the stack and pops instead of pushing. See `gallery-origin.ts`.
      markGalleryOrigin(itemId);
      router.push(`/g/${itemId}`);
    },
  });

  return (
    // `cursor-pointer` earns its place now: there is genuinely something behind this picture.
    // `select-none touch-manipulation` per `usePress`'s own note — without them iOS starts a text
    // selection partway through the press. Emphatically **no** `-webkit-touch-callout` here.
    <div {...press} className="cursor-pointer touch-manipulation select-none">
      {children}
    </div>
  );
}
