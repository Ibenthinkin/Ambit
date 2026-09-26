// The `feed` router (SPEC §7): the one procedure the whole app is really for. Protected —
// personalization is inherently per-user (SPEC §9's "personalisation = topics, not items", read
// via `getUserTopicWeights(userId)` inside `getFeedPage`) — with one deliberate exception,
// `feed.explore`, the signed-out taste (09-26-26), which composes for nobody.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { EXPLORE_MAX_PAGES } from "~/config/explore";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { forgetSeenSince, markSeen } from "~/server/db/feed";
import { decodeCursor, getFeedPage } from "~/server/services/feed";
import { feedDebugEnabled } from "~/server/services/feed-debug";

// Zod-bounded mirror of `Partial<FeedKnobs>` (services/feed.ts) — every field optional (a caller
// overrides only the knobs they're tuning), but each one bounded to a range that can't turn a
// debug session into a DB hazard (e.g. `pageSize` capped well below "return the whole corpus").
// Structurally compatible with `Partial<FeedKnobs>` by construction: same field names, same
// number type per field. Whether these bounds are ever actually *applied* is entirely
// `getFeedPage`'s call — it only honors `knobOverrides` when the server's `FEED_DEBUG` env var is
// on (SPEC §9's "dev affordances... behind a dev flag"); off, they're silently ignored here too,
// never an error, so a client that always sends its last-used dev knobs doesn't need to know or
// care whether the server it's talking to has the flag on.
const feedKnobsSchema = z
  .object({
    tierCore: z.number().min(0),
    tierDrift: z.number().min(0),
    tierJump: z.number().min(0),
    // The WILD tier (09-06-26). Unbounded above like the other three — the four are relative
    // weights, so a ceiling here would mean something different from a ceiling on tierCore.
    tierWild: z.number().min(0),
    scoreFloor: z.number().min(1).max(10),
    scorePower: z.number().min(0),
    tagBoost: z.number().min(0),
    /** WILD's own tagBoost — the slot's only personalization axis. */
    wildTagBoost: z.number().min(0),
    temp: z.number().min(0.01),
    hop2: z.number().min(0).max(1),
    topicCap: z.number().int().min(1),
    /** Per-page cap on one source's cards (09-07-26) — topicCap's sibling. */
    sourceCap: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    // Cut 2a's feel levers (09-05-26). 4× is already "the mined vocabulary dominates"; a penalty
    // above 1 would be a bonus, which is a different knob with a different name.
    grownEdgeScale: z.number().min(0).max(4),
    grownHopPenalty: z.number().min(0).max(1),
  })
  .partial();

/** Decode a cursor or answer `BAD_REQUEST` — so a malformed or foreign-version one is a clean 400
 *  (SPEC §7) rather than getFeedPage's plain `Error` surfacing as a 500. `decodeCursor` is pure,
 *  so decoding here and again inside `getFeedPage` does no harm. */
function checkedCursor(cursor: string) {
  try {
    return decodeCursor(cursor);
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : "Invalid cursor",
      cause: err,
    });
  }
}

export const feedRouter = createTRPCRouter({
  page: protectedProcedure
    .input(
      z.object({
        // A real encoded cursor (v1, `prev` capped at 64 ids by decodeCursor — see its comment)
        // base64url-encodes to well under 2KB; 4096 is a generous ceiling that rejects a wildly
        // oversized payload with a cheap, pre-decode zod BAD_REQUEST rather than spending a
        // base64/JSON decode pass on it first.
        cursor: z.string().max(4096).optional(),
        knobs: feedKnobsSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Pre-validate the cursor here so a malformed/foreign-version one maps to a clean
      // `BAD_REQUEST` (SPEC §7) rather than getFeedPage's plain `Error` bubbling up as a generic
      // `INTERNAL_SERVER_ERROR`. `decodeCursor` is pure, so calling it here and then handing the
      // same raw string to `getFeedPage` (which decodes it again internally) does no harm — it's
      // not consumed or mutated by decoding.
      if (input.cursor !== undefined) checkedCursor(input.cursor);

      return getFeedPage(ctx.user.id, input.cursor, input.knobs);
    }),

  // `/explore` (09-26-26, docs/PLAN_explore-route.md): the real feed, readable without an account
  // — the fourth deliberate public procedure, after `items.byId`, `items.wanderNext` and
  // `items.galleryRail`. It composes for **nobody**, even when a session is present: the page is
  // the cold-start sampler (uniform over the sixteen originals, DRIFT/JUMP/WILD reach the rest),
  // nothing is read about the caller and nothing is written — there is no `markSeen` for it, and
  // repeats between non-adjacent pages are the price (the client dedupes by id).
  //
  // Knobs aren't in the input, and zod strips unknown keys, so a request carrying them composes
  // exactly as one without. **Never `.strict()`:** `useInfiniteQuery` sends `{ ...input, cursor,
  // direction }` on every page after the first, and a strict schema 400s all of them — the taste
  // was one page long until the review caught it (`routers.test.ts` pins it now). The page
  // backstop is the server's half of the taste's cap; the client stops at
  // `EXPLORE_FEED_IMAGE_CAP` images long before it. It is not a security bound — the cursor is
  // unsigned, so a script can start over at page 0 — that is `publicProcedure`'s rate limit
  // (120/min per IP), the same posture as `items.galleryRail`.
  explore: publicProcedure
    .input(z.object({ cursor: z.string().max(4096).optional() }))
    .query(async ({ input }) => {
      if (input.cursor !== undefined) {
        if (checkedCursor(input.cursor).page >= EXPLORE_MAX_PAGES) {
          return { cards: [], nextCursor: undefined };
        }
      }
      return getFeedPage(null, input.cursor);
    }),

  // The receipt half of the feed (5.7). `feed.page` composes a page but writes nothing about who
  // saw it; the client calls this once it has a page in hand, and *that* is what burns the items
  // out of the reader's corpus.
  //
  // It moved here because a server render is not evidence of a reader. Next prefetches routes,
  // and a back-pop that re-runs the dynamic `/feed` renders it again — through 5.6 each of those
  // marked a full page seen, which measured out at 1,116 items in six minutes (log.md 08-20-26).
  //
  // A static import of `db/feed` is safe despite the envless-CI rule: that module dynamic-imports
  // its own client, so nothing here pulls `~/env` in at module scope.
  markSeen: protectedProcedure
    .input(
      z.object({
        // 64 mirrors `MAX_CURSOR_PREV` in services/feed.ts, for the same reason: this array flows
        // into an `IN`-list, and the router's `pageSize` knob tops out at 50, so 64 is headroom
        // over any legitimate page without being unbounded.
        itemIds: z.array(z.string()).min(1).max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await markSeen(ctx.user.id, input.itemIds, new Date());
      return { ok: true } as const;
    }),

  // The dev knob panel's un-burn (plan 09-05-26). `FORBIDDEN`, not a silent no-op, when the gate
  // is off: a client that thinks it is tuning must find out it is not. Input is a Date (SuperJSON
  // carries it intact); the client sends its session mark, the instant it last applied knobs.
  forgetSince: protectedProcedure
    .input(z.object({ since: z.date() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await feedDebugEnabled())) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "feed.forgetSince is a dev affordance (FEED_DEBUG is off)",
        });
      }
      const forgotten = await forgetSeenSince(ctx.user.id, input.since);
      return { forgotten } as const;
    }),
});
