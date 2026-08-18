// INTERIM STUB — replaced wholesale in 5.7.
//
// It exists because 5.6's feed navigates somewhere on every tap, and a tap that 404s makes the
// gesture layer untestable. So: the least page that can honestly be called an item page, and one
// real job beyond that — its Back link returns to `/feed?focus={id}`, which makes it the live test
// rig for the feed's return-scroll (Step 7 of PHASE5_PLAN_5.6.md). BUILD_PLAN explicitly allows
// this stub.
//
// Deliberately absent, all 5.7's: OG/Twitter metadata, the real hero treatment, article body
// rendering, the save/share controls, swipe-back, and "wander next".
//
// Reads the repo directly rather than going through tRPC, matching how `/onboarding` and `/feed`
// fetch on the server. The underlying procedure (`items.byId`) is the app's one `publicProcedure`
// — SPEC §8.1 makes this page readable by anyone with the link, invite or not — so there is no
// session guard here on purpose.
import { notFound } from "next/navigation";
import Link from "next/link";

import { sourceLabel } from "~/lib/source-label";
import { getItemById } from "~/server/db/items";

export default async function ItemStubPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const item = await getItemById(itemId);
  if (!item) notFound();

  return (
    <main className="bg-bg text-ink min-h-dvh px-5 py-10">
      <Link href={`/feed?focus=${item.id}`} className="text-ink/55 text-[14px]">
        ← Back
      </Link>

      <p className="text-ink/40 mt-8 text-[10px] font-semibold tracking-[1.3px] uppercase">
        {sourceLabel(item.source)}
      </p>
      <h1 className="text-ink-hi mt-2 text-[25px] leading-[1.18] font-semibold">
        {item.title}
      </h1>

      {item.imageUrl ? (
        // Plain `<img>` for the same reason as the feed tiles: the image hosts are an open,
        // growing set and next/image would need each one allowlisted. See image-tile.tsx.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt={item.title}
          className="mt-6 block max-w-full"
        />
      ) : null}

      {/* Both, when both exist — plenty of articles are illustrated, and the stub's job is to make
          the item recognisable, not to lay it out well. */}
      {item.summary ? (
        <p className="text-ink/62 mt-6 text-[16px] leading-[1.72]">
          {item.summary}
        </p>
      ) : null}
    </main>
  );
}
