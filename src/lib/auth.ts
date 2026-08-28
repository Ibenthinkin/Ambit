import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { devTrustedOrigins } from "~/config/dev-origins.js";
import { env } from "~/env";
import { db } from "~/server/db/client";
import * as schema from "~/server/db/schema";
import { getMailer } from "~/server/services/mailer";
import { authIpAddressHeaders } from "~/server/services/rate-limit";

// The Better Auth server instance. Two audiences read this file:
//   1. The app itself, at request time (session checks, the /api/auth/[...all] route handler).
//   2. The `@better-auth/cli` schema generator (`bunx @better-auth/cli generate`), which imports
//      this exact config to figure out which core tables/columns it owns (user, session, account,
//      verification) — that's why this file has to exist and be runnable *before* those tables are
//      in schema.ts, not after.
//
// What Better Auth owns, out of the box, just by being configured below: password hashing
// (scrypt), session creation/expiry/rotation, CSRF-safe cookies, and the reset-password token
// lifecycle (generate, verify, single-use, expire). What we own, all in this file: *who's allowed
// to sign up at all* (the invite gate) and *how* reset-password mail actually gets sent (the
// Mailer seam). Better Auth calls out to our code at exactly two points — a hook and a callback —
// and otherwise runs the whole auth lifecycle itself.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Passing the full schema module (not just the four auth tables) lets the adapter resolve
    // FK-shaped relations correctly; it only *uses* user/session/account/verification, but it
    // needs to see them by their exported names to match against its own internal field map.
    schema,
  }),

  emailAndPassword: {
    enabled: true,

    // A reset after a suspected compromise should kill any live sessions, not just let the new
    // password coexist with whatever session an attacker already holds (PHASE5_PLAN.md Decision
    // 5; SPEC §11).
    revokeSessionsOnPasswordReset: true,

    // Called after Better Auth has already validated the request and generated a fresh
    // single-use token; our only job is to deliver it. `url` is the ready-to-click reset link
    // (baseURL + token, per BETTER_AUTH_URL below).
    sendResetPassword: async ({ user, url }) => {
      // Deliberately not awaited: awaiting here would let a client measure "how long did
      // request-password-reset take" and infer whether the email exists from the timing
      // difference (mail-send vs. no-op for an unknown address) — a classic user-enumeration
      // side channel. Fire-and-forget keeps the response time identical either way. A failed
      // send in dev just means "check the terminal", which is an acceptable dev-only gap; prod
      // delivery failures surface through ResendMailer's own error path/logging, not here.
      void getMailer().send({
        to: user.email,
        subject: "Reset your Ambit password",
        text: `Reset your password: ${url}\n\nIf you didn't request this, ignore this email.`,
        html: `<p>Reset your password: <a href="${url}">${url}</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    },
  },

  // Invite-only sign-up (SPEC §3.1). No first-party Better Auth invite plugin exists — this is
  // the documented pattern: intercept user creation itself. `requireEmailVerification` is
  // deliberately left off: the invite list *is* the trust anchor, so a second "prove you own
  // this inbox" step would be redundant friction, not extra security.
  databaseHooks: {
    user: {
      create: {
        // Runs inside the sign-up flow before the row is inserted. Returning `{ data: user }`
        // lets creation proceed (optionally with a modified user object — we pass it through
        // unchanged); throwing an APIError aborts creation and that error is what the client
        // sees back from `signUp.email`.
        before: async (user) => {
          const [pending] = await db
            .select()
            .from(schema.invite)
            .where(eq(schema.invite.email, user.email))
            .limit(1);

          if (!pending) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Ambit is invite-only right now. Ask someone who's already in for an invite.",
            });
          }

          return { data: user };
        },

        // Runs after the row exists. The invite has done its job (it let this sign-up through);
        // flip it to `accepted` so it can't be pointed at a second signup and so an admin
        // glancing at the `invite` table can see who's actually joined.
        after: async (user) => {
          await db
            .update(schema.invite)
            .set({ status: "accepted" })
            .where(eq(schema.invite.email, user.email));
        },
      },
    },
  },

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  // Better Auth rejects any request whose `Origin` doesn't match its trusted set, and that set is
  // just `baseURL`'s origin unless told otherwise. `baseURL` is http://localhost:3000, so a phone
  // loading the dev server over the tailnet gets a page that renders perfectly and then answers
  // sign-in with `403` + `[Better Auth]: Invalid origin: …` — which is a different failure, at a
  // different layer, from the one `allowedDevOrigins` fixes. Empty in production, where the only
  // legitimate origin is `baseURL` itself.
  trustedOrigins: devTrustedOrigins(3000),

  // **The auth rate limiter, made an explicit choice rather than an inherited default.**
  //
  // Better Auth ships a rate limiter that is *disabled in development and enabled under
  // `NODE_ENV=production`*, with a stricter built-in rule for the credential paths: **3 requests
  // per 10 seconds per IP** on anything starting `/sign-in`, `/sign-up`, `/change-password` or
  // `/change-email`. Nothing in this file used to say so, which meant the policy was invisible
  // until something ran into it.
  //
  // Phase 7.1 ran into it, twice over, and both are worth writing down:
  //
  //  1. **The e2e suite cannot pass under it, and shouldn't have to.** `e2e/auth.spec.ts` signs in
  //     four times in about twenty-five seconds — two of them seconds apart *inside one test*,
  //     because proving a password reset took effect means showing the old password is rejected
  //     and the new one works. Those requests are the assertions. (The suite's *avoidable*
  //     sign-ins were removed separately: specs now reuse one session per file rather than signing
  //     in per test — see e2e/support.ts's saveSession.)
  //
  //  2. **The default is dangerous for this app in production, for a reason unrelated to tests.**
  //     The limiter keys on client IP, and Ambit sits behind Coolify's reverse proxy with no
  //     trusted-proxy IP source configured — so every reader may land in one shared bucket. Three
  //     sign-ins per ten seconds *for the entire beta* is an outage waiting for the evening two
  //     people sign in at once. Deriving a real per-client IP is Phase 7.2's job; until then the
  //     honest move is a limit that a shared bucket can survive.
  //
  // 20 per 10 seconds still stops credential stuffing cold (a real attacker wants thousands, not
  // twenty), and sign-up sits behind the invite gate above regardless. Everything else — the
  // 100-per-minute global default, and the 3-per-60s rule on password-reset mail, which no
  // legitimate reader and no spec goes near — keeps Better Auth's defaults.
  //
  // ---
  //
  // **Where the client IP comes from, and why 7.2 adds no proxy code (decision D4, 08-27-26).**
  //
  // The limiter above is only as good as the IP it keys on, and 7.1 left an open worry: behind
  // Coolify's Traefik, would every reader share one bucket? The answer, checked against Better
  // Auth's own source and changelog on 08-27-26 (installed here: 1.6.25):
  //
  //  * Better Auth reads the client IP from `advanced.ipAddress.ipAddressHeaders`, which defaults
  //    to `x-forwarded-for`.
  //  * **Since 1.6.21 it refuses to trust a comma-separated chain.** A multi-hop
  //    `X-Forwarded-For: a, b, c` is treated as untrusted (no IP) rather than believed; only a
  //    single-valued header is used, unless `advanced.ipAddress.trustedProxies` is set, in which
  //    case it walks the chain right-to-left past the addresses you named.
  //  * Coolify's Traefik strips inbound `X-Forwarded-*` from untrusted peers and sets its own, so
  //    what reaches the app in production is the single-valued form — the case that works.
  //  * Ambit's own limiter (`services/rate-limit.ts`'s `trustedClientIp`) takes the **last** hop
  //    for exactly the same reason: it is the one segment a trusted proxy appended rather than
  //    attacker-controlled input. Both limiters therefore agree on who a caller is.
  //
  // **What 8.1 changed (decision D11, 08-28-26).** The deploy did not land behind Coolify's
  // Traefik after all: the container publishes a host port and a Cloudflare Tunnel reaches it
  // directly (SPEC §13), so a CDN *is* in front, and the "single-valued header" premise above no
  // longer holds. Cloudflare **appends** the connecting address to any `X-Forwarded-For` the
  // client sent, which means a caller can make the header multi-valued whenever they like — and
  // Better Auth then reads no IP at all and drops everyone into one shared bucket. The fix is
  // `advanced.ipAddress.ipAddressHeaders` below, not `trustedProxies` (which stays unset:
  // cloudflared is a peer that dials out, not an addressable proxy hop this server can name).
  // `services/rate-limit.ts`'s `authIpAddressHeaders` holds the reasoning and the test.
  rateLimit: {
    customRules: {
      // Exact paths, not prefixes: customRules keys match the path exactly unless they contain a
      // `*`, and email+password are the only credential endpoints this app exposes.
      "/sign-in/email": { window: 10, max: 20 },
      "/sign-up/email": { window: 10, max: 20 },
    },
  },

  advanced: {
    ipAddress: {
      // Production only — see authIpAddressHeaders. Proven behaviourally in 8.1's T6: twenty-one
      // sign-in attempts from one client 429 while a second client signs in untouched, and adding
      // a spoofed `X-Forwarded-For` to the loop changes nothing.
      ipAddressHeaders: authIpAddressHeaders(env.NODE_ENV),
    },
  },
});
