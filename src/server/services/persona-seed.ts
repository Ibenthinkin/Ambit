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

import { PERSONAS, personaEmail, type Persona } from "~/server/config/personas";
import { getUserTopicIds, setUserTopics } from "~/server/db/topics";

export async function seedPersonas(opts: {
  password: string;
  /** In-memory override, for the test that edits a pick and re-runs. */
  personas?: readonly Persona[];
}): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> {
  const personas = opts.personas ?? PERSONAS;
  const { db } = await import("~/server/db/client");
  const { invite, user } = await import("~/server/db/schema");
  const { auth } = await import("~/lib/auth");

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
    const have = new Set(await getUserTopicIds(row.id));
    const want = new Set(p.topics);
    const same = have.size === want.size && [...want].every((t) => have.has(t));
    if (!same) await setUserTopics(row.id, [...want]);

    if (isNew) created.push(p.slug);
    else if (same) unchanged.push(p.slug);
    else updated.push(p.slug);
  }
  return { created, updated, unchanged };
}
