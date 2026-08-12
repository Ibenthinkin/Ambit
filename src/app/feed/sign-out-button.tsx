"use client";

import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";

// THROWAWAY — colocated so it dies with the page. DELETE IN 5.4. The design handoff has no
// sign-out affordance on any screen (PHASE5_PLAN_5.2.md Decision 3) — a genuine gap for Phase 9's
// settings work, not an oversight here; this placeholder is where sign-out temporarily lives.
export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      onClick={() => {
        void authClient.signOut().then(() => router.push("/"));
      }}
    >
      Sign out
    </Button>
  );
}
