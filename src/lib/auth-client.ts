"use client";

// The browser-side counterpart to src/lib/auth.ts. `createAuthClient` builds typed wrappers
// (signUp.email, signIn.email, requestPasswordReset, resetPassword, useSession, ...) around
// fetch calls to /api/auth/* — nothing here talks to the database directly. Real UI wiring
// (Phase 5.2's sign-in/sign-up screens) imports from here rather than hand-rolling fetches.
//
// No `baseURL` passed: Better Auth's client defaults to same-origin, which is correct here since
// the client and the /api/auth/* routes are served by the same Next.js app in every environment
// (dev, preview, prod) — there's no cross-origin case to configure for.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
