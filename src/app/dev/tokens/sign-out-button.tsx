"use client";

import { useRouter } from "next/navigation";

import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";

// Sign-out's INTERIM HOME. It lived on /feed's placeholder until 5.6 deleted that page, and the
// design handoff has no sign-out affordance on any screen (PHASE5_PLAN_5.2.md Decision 3) — a
// genuine gap that Settings closes in 5.10. Parking it on the style guide keeps it reachable in
// development (and keeps e2e's sign-out flow working) without inventing a control the design
// never asked for on a real screen.
//
// Keep the "Sign out" accessible name: e2e/auth.spec.ts selects this button by role + name.
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
