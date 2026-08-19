/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 *
 * How a request actually flows through this file: a client call (from `src/trpc/react.tsx` in the
 * browser, or `src/trpc/server.ts` in a Server Component) hits a procedure built from
 * `publicProcedure` below. tRPC builds `createTRPCContext` for that request, runs it through
 * `rateLimitMiddleware` then `timingMiddleware`, then into whatever resolver you wrote in
 * `src/server/api/routers/*`. Every router in this project gets assembled into one `AppRouter` in
 * `src/server/api/root.ts` — that's the type the client imports to get end-to-end type safety, no
 * code generation involved.
 *
 * Phase 2 (Better Auth) added a `session`/`user` field to the context below; Phase 4.2 adds the
 * actual mechanism that fills them in — `createTRPCContext` calls `auth.api.getSession()` once per
 * request — plus `protectedProcedure` next to `publicProcedure`, which throws `UNAUTHORIZED`
 * unless a session exists. That's the real machinery behind CLAUDE.md's "auth boundary": every
 * user-scoped query becomes a protected procedure that (via its repo call) filters by the
 * session's `userId`, and `items.byId` stays on `publicProcedure` as the one deliberately public
 * surface (SPEC §7, §11).
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { RateLimiter, trustedClientIp } from "~/server/services/rate-limit";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // Dynamic import — the same CI-has-no-env-vars reason every db/*.ts repo in this codebase
  // dynamically imports "./client" (see items.ts's drawFromTopic comment for the canonical
  // explanation): "~/lib/auth" statically imports server/db/client.ts, which reads "~/env"'s Zod
  // schema at module scope. CI's `bun run test` step sets no env vars at all, so a *static*
  // import here would crash the moment ANY test file imports this module transitively — e.g.
  // routers.test.ts's `createCaller`, which never even calls this function (it hands the caller a
  // hand-built mock context instead) but still imports the module that defines it.
  const { auth } = await import("~/lib/auth");

  // Better Auth's documented pattern: one `getSession` call per request, given the real incoming
  // `Headers` (the session cookie lives there). Returns `{ session, user }` together, or `null`
  // when there's no valid session at all — never a half-populated result, so checking the whole
  // thing for null before destructuring (rather than checking each field separately) is both
  // correct and enough.
  const result = await auth.api.getSession({ headers: opts.headers });

  return {
    ...opts,
    session: result?.session ?? null,
    user: result?.user ?? null,
  };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path, ctx }) => {
  const start = Date.now();
  // WHO called this. `x-trpc-source` is set to "rsc" by src/trpc/server.ts and "nextjs-react" by
  // src/trpc/react.tsx, so the log line separates an RSC prefetch from a client fetch — a
  // distinction the dev server's request log genuinely cannot make, because a server-side caller
  // produces no HTTP request of its own to log. Earned its place on 08-18-26, when a runaway
  // `feed.page` could not be attributed to either side for want of exactly this tag.
  //
  // Load-bearing beyond curiosity: `feed.page` writes `seen_item` on every call, so an unexplained
  // execution is a page of the user's corpus quietly burned (see feed/page.tsx and feed-screen.tsx
  // on why the hydration handoff has to key byte-identically). "unknown" means neither helper set
  // the header — a raw curl, or a caller that bypassed both.
  const source = ctx.headers.get("x-trpc-source") ?? "unknown";

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(
    `[TRPC] ${path} took ${end - start}ms to execute (src=${source})`,
  );

  return result;
});

/**
 * Rate limiting (SPEC §11, Phase 4.2 decision): one shared, process-wide `RateLimiter` (see its
 * own file header for the single-instance caveat), generous enough to be pure abuse cover rather
 * than throttling of normal use — 120 requests/minute per key. Applied to every procedure,
 * `publicProcedure` included: `items.byId` is the one deliberately unauthenticated surface (SPEC
 * §7), and an unauthenticated endpoint is exactly the kind of thing a scraper hits hardest.
 *
 * Keys on the session's user id when one exists, falling back to `trustedClientIp`
 * (services/rate-limit.ts — trusts only the last `X-Forwarded-For` hop, the one segment a single
 * trusted reverse proxy actually appended rather than attacker-controlled input) for logged-out
 * requests. `"unknown"` is the final fallback for the (should-be-rare) case neither is present, so
 * every truly-unidentifiable caller shares one bucket rather than each bypassing the limiter
 * entirely.
 */
const rateLimiter = new RateLimiter({ limit: 120, windowMs: 60_000 });

const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const key = ctx.user?.id ?? trustedClientIp(ctx.headers) ?? "unknown";

  if (!rateLimiter.allow(key)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests — slow down and try again shortly.",
    });
  }

  return next();
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure
  .use(rateLimitMiddleware)
  .use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * Throws `UNAUTHORIZED` unless `createTRPCContext` found a real session for this request. The
 * `next({ ctx: { session, user } })` call below re-narrows the context type for every downstream
 * resolver: outside this middleware `ctx.session`/`ctx.user` are `... | null` (a logged-out caller
 * is a legitimate context shape for `publicProcedure`), but any procedure built on
 * `protectedProcedure` sees them as always-present — no `!`/optional-chaining needed in the
 * routers themselves (SPEC §7, §11's "all user-scoped queries filter by `userId`", which every
 * protected router does by pulling `ctx.user.id` straight through to a repo call).
 */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: ctx.session,
      user: ctx.user,
    },
  });
});
