import { cache } from "react";
import { preload } from "react-dom";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ImageItemBody } from "~/components/item/image-item-body";
import { ItemShell } from "~/components/item/item-shell";
import { JoinCta } from "~/components/item/join-cta";
import { ReaderItemBody } from "~/components/item/reader-item-body";
import { SharedByRow, sharedByName } from "~/components/item/shared-by-row";
import { WanderNext } from "~/components/item/wander-next";
import { Rise } from "~/components/ui/rise";
import { auth } from "~/lib/auth";
import { getItemById } from "~/server/db/items";
import { api } from "~/trpc/server";
import { env } from "~/env";

// The item page — the app's **one public surface** (SPEC §8.1). Anyone with the link can read it,
// invite or not, which shapes almost every decision in this file:
//
//   - Two variants keyed on `item.type`: a picture with a caption, or an article to read.
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
  const variant = item.type === "image" ? "image" : "article";

  // **Starts the hero's request before the browser has parsed the markup that needs it**
  // (Phase 7.3, T5). This is the LCP element of the app's one public page — the thing a stranger
  // following a shared link waits for — and `preload` puts a `<link rel="preload" as="image">` in
  // the document head, so the fetch begins with the HTML rather than after it. Paired with
  // `fetchPriority="high"` on the `<img>` itself (image-item-body.tsx).
  //
  // Only for a real proxied image: `data:` URLs are inline already (the e2e corpus), and
  // preloading something the page won't request is a wasted connection plus a console warning.
  if (item.imageUrl && !item.imageUrl.startsWith("data:")) {
    preload(`/api/img/${item.id}`, { as: "image", fetchPriority: "high" });
  }

  return (
    <ItemShell
      itemId={item.id}
      title={item.title}
      hasImage={Boolean(item.imageUrl)}
      authed={Boolean(session)}
      appUrl={env.BETTER_AUTH_URL}
      // First token only: a share link says "Mara shared this with you", not a full legal name.
      viewerName={session?.user.name?.trim().split(/\s+/)[0]}
    >
      {/* Bottom padding clears the floating pill; the column width and gutters are the redesign's. */}
      <main className="bg-bg text-ink min-h-dvh px-[22px] pt-[68px] pb-[110px]">
        {sharedBy ? (
          <Rise>
            <SharedByRow name={sharedBy} />
          </Rise>
        ) : null}

        <Rise delayMs={50}>
          <div className="mt-[18px]">
            {variant === "image" ? (
              <ImageItemBody item={item} />
            ) : (
              <ReaderItemBody item={item} />
            )}
          </div>
        </Rise>

        <Rise delayMs={120}>
          <WanderNext rows={wander} />
        </Rise>

        {session ? null : (
          <Rise delayMs={160}>
            <JoinCta variant={variant} />
          </Rise>
        )}
      </main>
    </ItemShell>
  );
}
