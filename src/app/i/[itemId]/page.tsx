import { cache } from "react";
import { preload } from "react-dom";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Column } from "~/components/ui/column";
import { ItemScreen } from "~/components/item/item-screen";
import { ItemShell } from "~/components/item/item-shell";
import { JoinCta } from "~/components/item/join-cta";
import { ReaderItemBody } from "~/components/item/reader-item-body";
import { SharedByRow, sharedByName } from "~/components/item/shared-by-row";
import { WanderNext } from "~/components/item/wander-next";
import { Rise } from "~/components/ui/rise";
import { auth } from "~/lib/auth";
import { getItemById } from "~/server/db/items";
import { topicLabelsFor } from "~/server/db/topics";
import { railItemFrom } from "~/server/services/gallery-rail";
import { api } from "~/trpc/server";
import { env } from "~/env";

// The item page — the app's **one public surface** (SPEC §8.1). Anyone with the link can read it,
// invite or not, which shapes almost every decision in this file:
//
//   - Two variants keyed on `item.type`. A picture is `ItemScreen` — the merged screen since
//     09-10-26 (docs/DESIGN_screen-structure.md), which absorbed the old `/g/` gallery: a rail hero
//     edge to edge, the facts below it. An article is the reader, inside `ItemShell`.
//   - The pill toolbar, the sheets, and every protected query render for signed-in readers ONLY.
//     A signed-out visitor gets content, credit, the wander teaser, and an invitation — and the
//     page fires no user-scoped query on their behalf, because there is no user.
//   - `generateMetadata` is built purely from the item row. A shared link's preview card must
//     never carry anything about the person who shared it.
//
// The route is deliberately absent from `src/proxy.ts`'s matcher; don't add it.
//
// Reads the repo directly rather than going through tRPC for the item itself, matching `/feed` and
// `/onboarding`. The teaser goes through the server caller, so its one procedure has a single
// definition rather than a service call here and a procedure elsewhere.

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

  const description = item.summary
    ? item.summary.slice(0, 200)
    : `From ${item.source} on Ambit.`;

  // Only when there's a real image behind the proxy: scrapers can't use a 404, and a broken
  // `og:image` renders worse than none at all. `data:` URLs never reach the proxy (see the route).
  const hasProxyImage = Boolean(
    item.imageUrl && !item.imageUrl.startsWith("data:"),
  );
  const images = hasProxyImage ? [`/api/img/${item.id}`] : undefined;

  return {
    // Relative URLs above need an absolute base to resolve against for scrapers — this is the
    // app's own origin (env.js).
    metadataBase: new URL(env.BETTER_AUTH_URL),
    title: `${item.title} · Ambit`,
    description,
    openGraph: {
      title: item.title,
      description,
      url: `/i/${item.id}`,
      siteName: "Ambit",
      type: "article",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: hasProxyImage ? "summary_large_image" : "summary",
      title: item.title,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item) notFound();

  // The session decides two things and nothing else: whether the pill toolbar exists, and whether
  // the join card does. There is no redirect here — being signed out is a supported way to read
  // this page, not a problem to fix.
  const session = await auth.api.getSession({ headers: await headers() });

  // Resolved on the server, so a signed-out visitor's page costs them zero client requests. The
  // procedure is public precisely so this works (see routers/items.ts).
  const wander = await api.items.wanderNext({ itemId });

  const sharedBy = sharedByName((await searchParams).from);
  // First token only: a share link says "Mara shared this with you", not a full legal name.
  const viewerName = session?.user.name?.trim().split(/\s+/)[0];

  // **Starts the hero's request before the browser has parsed the markup that needs it**
  // (Phase 7.3, T5). This is the LCP element of the app's one public page — the thing a stranger
  // following a shared link waits for — and `preload` puts a `<link rel="preload" as="image">` in
  // the document head, so the fetch begins with the HTML rather than after it. Paired with
  // `fetchPriority="high"` on the `<img>` itself (the rail's current cell, hero-rail.tsx).
  //
  // Only for a real proxied image: `data:` URLs are inline already (the e2e corpus), and
  // preloading something the page won't request is a wasted connection plus a console warning.
  if (item.imageUrl && !item.imageUrl.startsWith("data:")) {
    preload(`/api/img/${item.id}`, { as: "image", fetchPriority: "high" });
  }

  // A picture is the merged screen (09-10-26). The rail is drawn here so the page opens on cells
  // that already exist — a hero that spent its first moment fetching would be a blank strip, the
  // one thing it must never be — and the entry item goes in the rail's own shape, so cell zero is
  // indistinguishable from the rest. `galleryRail` is public and writes nothing (routers/items.ts).
  if (item.type === "image") {
    const [rail, labels] = await Promise.all([
      api.items.galleryRail({ itemId, count: 8 }),
      topicLabelsFor([item.topicId]),
    ]);
    const entryItem = railItemFrom(
      item,
      item.topicId ? (labels.get(item.topicId) ?? null) : null,
    );
    return (
      <ItemScreen
        entryItem={entryItem}
        // Entry first: the reader is already looking at it, so it's cell zero, and everything
        // drawn lies ahead of it on the rail.
        initialRail={[entryItem, ...rail]}
        initialWander={wander}
        authed={Boolean(session)}
        appUrl={env.BETTER_AUTH_URL}
        viewerName={viewerName}
        sharedBy={sharedBy}
      />
    );
  }

  // An article keeps the reader layout, inside the shell that gives it the pill and the exits.
  return (
    <ItemShell
      itemId={item.id}
      title={item.title}
      hasImage={Boolean(item.imageUrl)}
      authed={Boolean(session)}
      appUrl={env.BETTER_AUTH_URL}
      viewerName={viewerName}
    >
      {/* Bottom padding clears the floating pill; the column width and gutters are the redesign's. */}
      <main className="bg-bg text-ink min-h-dvh pt-[68px] pb-[110px]">
        {/* A book-width measure above `md` (docs/DESIGN_desktop-polish.md §1, §4) — body text at a
            1400px line length is unreadable. The `px-[22px]` moved off the `main` and onto the
            column so the gutters are column-then-padding: left outside, they would inset the
            content from a 720px band that is already centered with room to spare. */}
        <Column width="reader" className="px-[22px]">
          {sharedBy ? (
            <Rise>
              <SharedByRow name={sharedBy} />
            </Rise>
          ) : null}

          <Rise delayMs={50}>
            <div className="mt-[18px]">
              <ReaderItemBody item={item} />
            </div>
          </Rise>

          <Rise delayMs={120}>
            <WanderNext rows={wander} />
          </Rise>

          {session ? null : (
            <Rise delayMs={160}>
              <JoinCta variant="article" />
            </Rise>
          )}
        </Column>
      </main>
    </ItemShell>
  );
}
