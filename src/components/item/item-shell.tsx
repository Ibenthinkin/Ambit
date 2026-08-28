"use client";

import * as React from "react";

import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { PillToolbar } from "~/components/ui/pill-toolbar";
import { Toast } from "~/components/ui/toast";
import { useLeaveToFeed } from "~/hooks/use-leave-to-feed";
import { useSwipeBack } from "~/hooks/use-swipe-back";
import { imageFileName } from "~/lib/image-filename";
import { saveToastText } from "~/lib/save-toast";
import { api } from "~/trpc/react";

// The client layer wrapped around an item page's server-rendered content: the swipe-back gesture,
// the floating pill, and the two sheets the pill opens.
//
// **Signed-out visitors get none of it.** `/i/[itemId]` is public (SPEC §8.1), and a stranger
// following a shared link has nothing to save an item *to* and no profile to visit. So the pill,
// the sheets, and — the part that matters — the protected `saves.forItem` query all sit behind
// `authed`. Nothing user-scoped is ever requested on an anonymous visitor's behalf.
//
// The gesture still works for everyone: leaving is not a privilege.
export interface ItemShellProps {
  itemId: string;
  /** Rides into the OS share sheet alongside the URL. */
  title: string;
  /** Whether this item has an image worth offering to save — gates the sheet's Save-image row. */
  hasImage: boolean;
  authed: boolean;
  /** The app's own origin (`env.BETTER_AUTH_URL`), for building an absolute share URL. */
  appUrl: string;
  /** The signed-in reader's first name, if any — becomes `?from=` on the link they share. */
  viewerName?: string;
  children: React.ReactNode;
}

export function ItemShell({
  itemId,
  title,
  hasImage,
  authed,
  appUrl,
  viewerName,
  children,
}: ItemShellProps) {
  const leave = useLeaveToFeed(itemId);
  const swipeRef = useSwipeBack({ onCommit: leave });

  const [toast, setToast] = React.useState<string | null>(null);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  const utils = api.useUtils();
  // `enabled: authed` is the auth boundary in client form — an anonymous visitor must not fire a
  // protected procedure and collect an UNAUTHORIZED in their console.
  const saved = api.saves.forItem.useQuery({ itemId }, { enabled: authed });

  const shareUrl = `${appUrl}/i/${itemId}${
    viewerName ? `?from=${encodeURIComponent(viewerName)}` : ""
  }`;

  /**
   * Hand the full-resolution image to the OS. `navigator.share({ files })` is the path that
   * actually reaches an iOS camera roll; the `<a download>` fallback is for desktop and for
   * browsers that can't share files. Both are same-origin against `/api/img/`, which is the reason
   * the proxy had to land before this row could exist at all.
   */
  const saveImage = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/img/${itemId}`);
      if (!res.ok) throw new Error(`image ${res.status}`);
      const blob = await res.blob();
      // The extension follows what the proxy actually served (WebP since 7.3) rather than a
      // hardcoded `.jpg` — see lib/image-filename.ts for why that matters to the OS.
      const name = imageFileName(itemId, blob.type);
      const file = new File([blob], name, { type: blob.type });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          // Dismissing the OS sheet rejects with AbortError — a normal outcome, not a failure.
          if ((err as Error)?.name !== "AbortError") throw err;
        }
        return;
      }

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
      setToast("Image saved");
    } catch {
      setToast("Couldn't save that image");
    }
  }, [itemId]);

  return (
    <>
      {/* `touch-action: pan-y` tells the browser vertical panning is always its own — the window
          is the scroller here, as on /feed, and the gesture only ever claims horizontal travel. */}
      <div ref={swipeRef} style={{ touchAction: "pan-y" }}>
        {children}
      </div>

      {authed ? (
        <>
          <PillToolbar
            bookmark={saved.data?.saved ? "saved" : "idle"}
            onBookmark={() => setSaveOpen(true)}
            onShare={() => setShareOpen(true)}
            // NOT the pill's default `/feed` push: that re-runs the dynamic route and draws a
            // fresh page of cards. See `useLeaveToFeed`.
            onHome={leave}
          />

          <SaveToCollectionSheet
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            itemId={itemId}
            currentCollectionId={saved.data?.collectionId ?? undefined}
            onSaved={async (collection, drift) => {
              setToast(saveToastText(collection.name, drift));
              await utils.saves.forItem.invalidate({ itemId });
            }}
            onError={setToast}
          />

          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            url={shareUrl}
            title={title}
            imageContext={hasImage}
            onSaveImage={() => void saveImage()}
            onCopied={() => setToast("Link copied")}
            onShareUnavailable={() => setToast("Sharing isn't available here")}
          />

          {/* `raised` — this screen mounts the pill, and an unraised toast would sit behind it. */}
          <Toast
            text={toast ?? ""}
            open={toast !== null}
            onDone={() => setToast(null)}
            raised
          />
        </>
      ) : null}
    </>
  );
}
