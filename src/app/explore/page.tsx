import { permanentRedirect } from "next/navigation";

// `/explore` was the signed-out taste of the feed for one day (09-26-26) before it became `/`
// itself. Anything still pointing here — the item page's end card in a tab opened before the
// deploy, a link in a message — lands on the front door, `?open=` and all. Permanent (308), like
// `/g/`; and like it, absent from `src/proxy.ts`'s matcher, so a redirect to a public page never
// stops at a sign-in wall on the way.
export default async function ExploreRedirect({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const { open } = await searchParams;
  // Only a plain string is carried over; `/` validates the value itself.
  permanentRedirect(
    typeof open === "string" ? `/?open=${encodeURIComponent(open)}` : "/",
  );
}
