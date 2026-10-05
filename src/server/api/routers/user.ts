// The `user` router (Phase 5.10) — the signed-in reader's own profile: the read behind `/profile`
// and `/profile/settings`, and the write behind `/profile/edit`. Both protected; there is no public
// profile anywhere in the product, so there is no anonymous read of this data.
//
// **Why a router at all, rather than `authClient.updateUser`?** Three reasons, in the order they
// bite:
//
//   1. `getSession()` only returns the columns Better Auth has been told about, so `handle` and
//      `bio` are invisible on `ctx.user` — a read path is needed no matter what, and `user.me`
//      slots straight into the RSC prefetch/hydrate pattern every other screen already uses.
//   2. A duplicate handle has to reach the client as something it can render inline. tRPC maps it
//      to a typed `CONFLICT`; Better Auth's update path would surface the constraint violation as
//      a 500.
//   3. No auth-config churn. Declaring the columns to Better Auth means the CLI-generate-and-merge
//      dance schema.ts's header warns about, for no gain.
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { READING_AMOUNTS } from "~/server/config/reading-amount";
import {
  getUserProfile,
  getUserWritingAmount,
  isHandleTaken,
  setUserWritingAmount,
  updateUserProfile,
} from "~/server/db/users";

// zod wants a non-empty tuple; the leaf exports a readonly array so the client can map over it.
const readingAmountSchema = z.enum(
  READING_AMOUNTS as unknown as [string, ...string[]],
) as z.ZodType<(typeof READING_AMOUNTS)[number]>;

export const userRouter = createTRPCRouter({
  /**
   * The caller's own profile row. **Not `ctx.user`** — see the file header: the session object
   * simply doesn't carry `handle`/`bio`, so reading them means reading the table.
   *
   * A missing row is `INTERNAL_SERVER_ERROR`, not `NOT_FOUND`: the session middleware that let this
   * call through has already proved a valid session, which proves the user row existed moments ago.
   * Its absence is a broken invariant, not a client mistake.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getUserProfile(ctx.user.id);
    if (!profile) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Session ${ctx.session.id} has no user row`,
      });
    }
    return profile;
  }),

  /**
   * Writes the three editable fields. Email is deliberately not among them: Better Auth owns the
   * email/verification round trip and rejects a bare update by design, so changing it is a later
   * auth phase, and `/profile/edit` renders the field read-only.
   *
   * Normalization lives in the schema so there is exactly one place it happens: `.trim()` then
   * `.toLowerCase()` on the handle, before the pattern check. The client strips a typed leading
   * `@`, so what arrives here is already bare.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name can't be empty").max(60),
        handle: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_]{2,24}$/, "Letters, numbers and underscores only")
          .nullable(),
        bio: z.string().trim().max(280).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.handle && (await isHandleTaken(input.handle, ctx.user.id))) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That handle is taken.",
        });
      }

      // Accepted race, same shape as `saveToCollection`'s double-bump: two users claiming the same
      // free handle in the same instant both pass the check above and the second write wins the
      // unique constraint's rejection as a 500 rather than a clean CONFLICT. Vanishingly unlikely
      // on an invite-only app with no handle-squatting incentive, and the alternative (a
      // serializable transaction, or catching the driver's constraint error by code) buys a nicer
      // message for a case no user will meet. There is no `onConflict` clause for an UPDATE to
      // lean on the way the insert paths do.
      const profile = await updateUserProfile(ctx.user.id, {
        name: input.name,
        handle: input.handle,
        bio: input.bio,
      });
      if (!profile) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Session ${ctx.session.id} has no user row`,
        });
      }
      return profile;
    }),

  /**
   * How much writing the caller asked for — `none | little | some | lot`, or `null` for "never
   * said" (the feed's default). Its own tiny query rather than a field on `me`, so the Settings
   * sheet can invalidate it without refetching the profile.
   */
  readingAmount: protectedProcedure.query(({ ctx }) =>
    getUserWritingAmount(ctx.user.id),
  ),

  /** Sets (or, with `null`, clears) the caller's reading amount; answers with what was stored. */
  setReadingAmount: protectedProcedure
    .input(z.object({ amount: readingAmountSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      await setUserWritingAmount(ctx.user.id, input.amount);
      return input.amount;
    }),
});
