import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { GalleryScreen } from "~/components/gallery/gallery-screen";
import { auth } from "~/lib/auth";
import { getItemById, type Item } from "~/server/db/items";
import type { RailItem } from "~/server/services/gallery-rail";
import { api } from "~/trpc/server";
import { env } from "~/env";

// `/g/[itemId]` — the immersive gallery (SPEC §8.1). The app's **second** public route, and public
// for the same reason the first one is: it opens from the hero on `/i/[itemId]`, which anyone with a
// link can reach, and it is deep-linkable in its own right. A stranger can fall into the gallery.
//
// The session decides exactly one thing here — whether the pill and its sheets exist — and there is
// no redirect. Being signed out is a supported way to look at a picture.
//
// **Images only.** An article has no business on a full-bleed picture screen, so a crafted
// `/g/{articleId}` 404s rather than rendering something meaningless. That's the same posture as the
// route's own metadata: minimal, and `noindex`, because `/i/` is the canonical, OG-carrying share
// surface (decision 4) and two indexed pages for one work would be one too many.
//
// Deliberately absent from `src/proxy.ts`'s matcher, like `/i/`; don't add it.

// `cache` dedupes the row between `generateMetadata` and the render — Next calls both for the same
// request, and without this the page would hit Postgres twice for identical data.
const getItem = cache(getItemById);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<Metadata> {
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item) return { title: "Not found · Ambit" };

  // No OG block, no description, no image. This page is not the one to share — `/i/` is, and the
  // gallery's own share control says so by building an `/i/` URL (see `GalleryScreen`).
  return {
    title: `${item.title} · Ambit`,
    robots: { index: false },
  };
}

/** The entry item in the rail's own shape, so the first cell is indistinguishable from the rest. */
function toRailItem(item: Item): RailItem {
  return {
    id: item.id,
    title: item.title,
    attribution: item.attribution,
    imageUrl: item.imageUrl,
    summary: item.summary,
    source: item.source,
    sourceUrl: item.sourceUrl,
    license: item.license,
    topicId: item.topicId,
  };
}

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (item?.type !== "image") notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  // Drawn on the server so the gallery opens on a rail that already exists — a full-bleed screen
  // that spends its first moment fetching would be a blank rectangle, which is the one thing this
  // screen must never be. The procedure is public precisely so this works for a signed-out visitor
  // too (see routers/items.ts), and it writes nothing.
  const rail = await api.items.galleryRail({ itemId, count: 8 });

  const entryItem = toRailItem(item);

  return (
    <GalleryScreen
      entryItem={entryItem}
      // Entry first: the reader is already looking at it, so it's cell zero, and everything drawn
      // lies ahead of it on the rail.
      initialRail={[entryItem, ...rail]}
      authed={Boolean(session)}
      appUrl={env.BETTER_AUTH_URL}
      // First token only: a share link says "Mara shared this with you", not a full legal name.
      viewerName={session?.user.name?.trim().split(/\s+/)[0]}
    />
  );
}
