import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingScreen } from "~/components/onboarding/onboarding-screen";
import { auth } from "~/lib/auth";
import { hasCompletedOnboarding, listTopics } from "~/server/db/topics";
import { getUserWritingAmount } from "~/server/db/users";
import { getQuestionFaces } from "~/server/services/question-faces";

// /onboarding (SPEC §8.1) — the questionnaire a newly-signed-up user lands on before ever seeing
// a feed (docs/PLAN_onboarding-questionnaire.md). A Server Component: the session check here is
// defense in depth behind src/proxy.ts's cookie-shape-only optimistic redirect (that file's
// matcher already covers /onboarding/:path*).
//
// **`?retake=1`** is how a reader who is already set up comes back ("Retake the questions" on
// /profile/topics). Without it an onboarded reader is sent on to `/feed`, as always. With it the
// redirect is skipped and the screen is told this is a retake, so it can say that finishing
// *replaces* their topics. There is no retake procedure — it is the same screen and the same
// `onboarding.complete`, which overwrites. A not-yet-onboarded reader with `?retake=1` in the URL
// is simply a first run: there is nothing to replace.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const wantsRetake = (await searchParams).retake === "1";
  const onboarded = await hasCompletedOnboarding(session.user.id);
  if (onboarded && !wantsRetake) {
    redirect("/feed");
  }

  // Every pickable topic (the screen asks only the questions these can answer), and the picture
  // for each face-off card — memoised in-process, and `{}` on a database with no pictures yet.
  // A retaking reader's reading amount, so the reveal's Reading row opens on what they chose
  // rather than on what the cards suggest.
  const [topics, faces, storedReading] = await Promise.all([
    listTopics(),
    getQuestionFaces(),
    onboarded ? getUserWritingAmount(session.user.id) : null,
  ]);
  return (
    <OnboardingScreen
      // `facet` groups the reveal's mix under its headings (DESIGN_redesign decision 3).
      topics={topics.map((t) => ({ id: t.id, label: t.label, facet: t.facet }))}
      faces={faces}
      retake={onboarded}
      storedReading={storedReading}
    />
  );
}
