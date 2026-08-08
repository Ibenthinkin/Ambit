// The `feed` router (SPEC §7): the one procedure the whole app is really for. Protected —
// personalization is inherently per-user (SPEC §9's "personalisation = topics, not items", read
// via `getUserTopicWeights(userId)` inside `getFeedPage`).
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { decodeCursor, getFeedPage } from "~/server/services/feed";

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
    scoreFloor: z.number().min(1).max(10),
    scorePower: z.number().min(0),
    tagBoost: z.number().min(0),
    temp: z.number().min(0.01),
    hop2: z.number().min(0).max(1),
    topicCap: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
  })
  .partial();

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
      if (input.cursor !== undefined) {
        try {
          decodeCursor(input.cursor);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Invalid cursor",
            cause: err,
          });
        }
      }

      return getFeedPage(ctx.user.id, input.cursor, input.knobs);
    }),
});
