// Seeds the twenty personas (config/personas.ts) as real accounts — on the Mac and, through
// `docker exec`, in production (docs/DESIGN_topic-facets-and-personas.md §4). Each one goes in
// the front door: an invite row first (lib/auth.ts's `before` hook reads it), then Better
// Auth's own server-side sign-up so the hooks run and the hash is the real one, then the same
// weight-preserving `setUserTopics` the pickers use. Idempotent: a persona who exists is left
// alone unless the fixture's picks differ from the rows, in which case exactly those change.
//
// The logic lives here rather than in the script because a script calls `main()` on import and
// cannot be imported by a test — the same split as every other script in this repo.
import { eq } from "drizzle-orm";

import {
  PERSONAS,
  personaEmail,
  personaTopics,
  type Persona,
} from "~/server/config/personas";
import { getUserTopicIds, listTopics, setUserTopics } from "~/server/db/topics";

/** Brings one account's picks to what its persona resolves to (groups flattened, single topics
 *  added), keeping only ids `pickable` holds — `user_topic` has a foreign key, and a database can
 *  trail the config (a fresh one has the sixteen originals). Writes only on a real difference,
 *  and returns whether the rows already agreed. */
async function syncPicks(
  userId: string,
  p: Persona,
  pickable: ReadonlySet<string>,
): Promise<boolean> {
  const have = new Set(await getUserTopicIds(userId));
  const want = new Set(personaTopics(p).filter((t) => pickable.has(t)));
  const same = have.size === want.size && [...want].every((t) => have.has(t));
  // Personas are seeded flat, at weight 1.0 for every pick — the little/some/lot levels are a
  // reader-facing input a fixture has no opinion about, so this is the one deliberate spot
  // outside `topic-levels.ts` that writes a bare weight number.
  if (!same)
    await setUserTopics(
      userId,
      [...want].map((topicId) => ({ topicId, weight: 1.0 })),
    );
  return same;
}

/**
 * The boot-time half (10-01-26): re-applies each persona's picks to the accounts that **already
 * exist**, and creates nothing — no invite, no sign-up, so no password. `db:seed` calls it on
 * every container boot, which is what keeps a signed-in persona and the signed-out feed dealt
 * that persona (services/feed.ts) reading the same picks as the vocabulary grows. On a database
 * with no persona accounts (CI, a fresh machine) it is two reads and no writes.
 */
export async function syncPersonaTopics(opts?: {
  personas?: readonly Persona[];
}): Promise<{ updated: string[]; unchanged: string[]; absent: string[] }> {
  const personas = opts?.personas ?? PERSONAS;
  const { db } = await import("~/server/db/client");
  const { user } = await import("~/server/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      inArray(
        user.email,
        personas.map((p) => personaEmail(p.slug)),
      ),
    );
  const idByEmail = new Map(rows.map((r) => [r.email, r.id]));
  const updated: string[] = [];
  const unchanged: string[] = [];
  const absent: string[] = [];
  if (rows.length === 0)
    return { updated, unchanged, absent: personas.map((p) => p.slug) };

  const pickable = new Set((await listTopics()).map((t) => t.id));
  for (const p of personas) {
    const id = idByEmail.get(personaEmail(p.slug));
    if (!id) absent.push(p.slug);
    else if (await syncPicks(id, p, pickable)) unchanged.push(p.slug);
    else updated.push(p.slug);
  }
  return { updated, unchanged, absent };
}

export async function seedPersonas(opts: {
  password: string;
  /** In-memory override, for the test that edits a pick and re-runs. */
  personas?: readonly Persona[];
}): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> {
  const personas = opts.personas ?? PERSONAS;
  const { db } = await import("~/server/db/client");
  const { invite, user } = await import("~/server/db/schema");
  const { auth } = await import("~/lib/auth");

  const pickable = new Set((await listTopics()).map((t) => t.id));

  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const p of personas) {
    const email = personaEmail(p.slug);
    // The invite gate is the front door's lock; sign-up reads this row and would refuse without
    // it. `onConflictDoNothing` because a re-run must not disturb an accepted invite.
    await db.insert(invite).values({ email }).onConflictDoNothing();

    let [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    let isNew = false;
    if (!row) {
      const res = await auth.api.signUpEmail({
        body: { email, password: opts.password, name: p.name },
        asResponse: true,
      });
      if (!res.ok) {
        throw new Error(
          `sign-up failed for ${p.slug}: ${res.status} ${await res.text()}`,
        );
      }
      [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      isNew = true;
    }
    if (!row) throw new Error(`no user row for ${p.slug} after sign-up`);

    // Only write when the fixture and the rows actually disagree, so the summary's
    // created/updated/unchanged is a real answer rather than "twenty writes, every time".
    const same = await syncPicks(row.id, p, pickable);

    if (isNew) created.push(p.slug);
    else if (same) unchanged.push(p.slug);
    else updated.push(p.slug);
  }
  return { created, updated, unchanged };
}
