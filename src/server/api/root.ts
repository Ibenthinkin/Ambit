import { feedRouter } from "~/server/api/routers/feed";
import { itemsRouter } from "~/server/api/routers/items";
import { savesRouter } from "~/server/api/routers/saves";
import { topicsRouter } from "~/server/api/routers/topics";
import { userRouter } from "~/server/api/routers/user";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 *
 * Phase 4.2 wires up the real SPEC §7 API surface: `topics` (onboarding), `feed` (the product),
 * `items` (the one public procedure), `saves`. The t3 starter's `post` demo router is gone —
 * see docs/PHASE4_WALKTHROUGH_4.2.md for the homepage cleanup that went with it.
 */
export const appRouter = createTRPCRouter({
  topics: topicsRouter,
  feed: feedRouter,
  items: itemsRouter,
  saves: savesRouter,
  // Phase 5.10: the reader's own profile row (`handle`/`bio` are invisible on `ctx.user` — see
  // routers/user.ts's header for why this isn't Better Auth's `updateUser`).
  user: userRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.items.byId({ id: "..." });
 */
export const createCaller = createCallerFactory(appRouter);
