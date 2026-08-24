// Repository for the profile-shaped columns of `user` (Phase 5.10) — the read and write behind
// `/profile` and `/profile/edit`.
//
// **Why this exists at all, given Better Auth already owns the `user` table.** Better Auth's
// `getSession()` only returns the columns it has been *told* about, so `handle` and `bio` are
// invisible on `ctx.user` no matter what the row actually holds — a read path was needed
// regardless. Declaring them to Better Auth instead (its `additionalFields`) would mean
// regenerating the auth schema by hand (see schema.ts's header warning) and would still leave the
// handle-uniqueness conflict surfacing as a 500 rather than a typed error. A plain repo function
// plus a tRPC router is the smaller, more honest tool.
//
// Same house rules as every other repo file here: `userId` is always an explicit parameter (no
// ambient session), and `./client` is imported dynamically so merely importing this module can't
// crash a test run in an environment with no DATABASE_URL.
import { and, eq, ne } from "drizzle-orm";

import { user } from "~/server/db/schema";

/**
 * Everything the Profile and Edit screens read about the signed-in user. Deliberately a hand-picked
 * five rather than `typeof user.$inferSelect`: the row also carries auth bookkeeping
 * (`emailVerified`, timestamps, `image`) that no screen shows and nothing should start depending on
 * just because it happened to be in scope.
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  handle: string | null;
  bio: string | null;
}

/** The five profile fields for one user, or `undefined` if the row is gone. */
export async function getUserProfile(
  userId: string,
): Promise<UserProfile | undefined> {
  // Dynamic import — same CI-has-no-env-vars reason as every other repo file in this codebase
  // (see items.ts's drawFromTopic comment for the canonical explanation).
  const { db } = await import("./client");
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      handle: user.handle,
      bio: user.bio,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row;
}

/**
 * Is `handle` already claimed by someone *other* than `excludeUserId`?
 *
 * The exclusion is the whole point: re-saving a profile without touching the handle field must not
 * report the user's own handle as taken. Callers pass an already-normalized (bare, lowercase)
 * handle — normalization belongs to the router's zod schema, so there's exactly one place it
 * happens.
 */
export async function isHandleTaken(
  handle: string,
  excludeUserId: string,
): Promise<boolean> {
  const { db } = await import("./client");
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.handle, handle), ne(user.id, excludeUserId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Writes the three editable profile fields and returns the row as the screens read it.
 *
 * `updatedAt` looks after itself — the column carries an `$onUpdate` in schema.ts, so every write
 * through Drizzle stamps it without this function mentioning it.
 */
export async function updateUserProfile(
  userId: string,
  fields: { name: string; handle: string | null; bio: string | null },
): Promise<UserProfile | undefined> {
  const { db } = await import("./client");
  const [row] = await db
    .update(user)
    .set({ name: fields.name, handle: fields.handle, bio: fields.bio })
    .where(eq(user.id, userId))
    .returning({
      id: user.id,
      name: user.name,
      email: user.email,
      handle: user.handle,
      bio: user.bio,
    });
  return row;
}
