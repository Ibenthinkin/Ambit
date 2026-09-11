import { permanentRedirect } from "next/navigation";

// `/g/[itemId]` was the immersive gallery (5.8 → 09-10-26). The item page is that screen now
// (docs/DESIGN_screen-structure.md §1), so anything still pointing here — a bookmark, a history
// entry, a link in a message — lands on the one screen that exists. Permanent (308), and no type
// check: `/i/` 404s an unknown id itself and renders an article as the reader, which is the right
// answer for a crafted `/g/{articleId}` too.
//
// Still deliberately absent from `src/proxy.ts`'s matcher, like `/i/`: a redirect to a public page
// must not stop at a sign-in wall on the way.
export default async function GalleryRedirect({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  permanentRedirect(`/i/${itemId}`);
}
