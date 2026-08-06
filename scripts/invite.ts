// Admin script: grant one email an invite (SPEC §3.1 — sign-up is otherwise refused by the
// `databaseHooks.user.create.before` gate in src/lib/auth.ts). Run with `bun run invite <email>`.
//
// Idempotent by design, same as the rest of this project's seed/upsert scripts: running it twice
// on the same email is a no-op report, not a duplicate row or an error — an admin re-running this
// by habit (or a flaky terminal) should never need to think about whether it's safe to repeat.
import { eq } from "drizzle-orm";

import { db } from "~/server/db/client";
import { invite } from "~/server/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: bun run invite <email>");
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(invite)
    .where(eq(invite.email, email))
    .limit(1);

  if (existing) {
    console.log(
      `${email} already has an invite (status: ${existing.status}) — nothing to do.`,
    );
    process.exit(0);
  }

  await db.insert(invite).values({ email });
  console.log(`Invited ${email}.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("invite script failed:", err);
  process.exit(1);
});
