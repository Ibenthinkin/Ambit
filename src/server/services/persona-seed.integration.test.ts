// Integration test for the persona seed — it goes through Better Auth's own server API, so there
// is no mocking it into a unit test: what it must prove is that an absent persona is created,
// that a second run changes nothing, and that a fixture edit re-syncs exactly one user's picks.
// Self-skips without DATABASE_URL, same as every other integration file here.
//
// **Its own throwaway personas, not the real twenty.** The obvious version of this test seeds
// `PERSONAS` and asserts twenty created — but that is only true on a database where nobody has
// run `bun run seed:personas`, and its cleanup would delete the accounts Ben signs in as. Twenty
// is a property of the fixture and personas.test.ts pins it; what the *service* owes is
// created/unchanged/updated, which throwaway slugs prove exactly as well and destroy nothing.
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";

import { personaEmail, type Persona } from "~/server/config/personas";

const password = "correct horse battery staple";

// Real topic ids: `setUserTopics` writes rows against a foreign key, so an invented topic would
// fail on the constraint rather than on anything this test is about.
const suffix = nanoid(8).toLowerCase();
const FIXTURES: readonly Persona[] = [
  {
    slug: `test-a-${suffix}`,
    name: "Test Persona A",
    age: 30,
    gender: "woman",
    location: "Nowhere",
    profession: "Tester",
    taste: "Fixtures.",
    topics: ["botany", "astronomy"],
  },
  {
    slug: `test-b-${suffix}`,
    name: "Test Persona B",
    age: 40,
    gender: "man",
    location: "Nowhere",
    profession: "Tester",
    taste: "Fixtures.",
    topics: ["music"],
  },
];
const EMAILS = FIXTURES.map((p) => personaEmail(p.slug));

describe.skipIf(!process.env.DATABASE_URL)("seedPersonas (integration)", () => {
  afterAll(async () => {
    // Same delete order as scripts/e2e-clean.ts, which retires users the same way: everything
    // hanging off the user first, the user (session + account cascade), then the invites. Scoped
    // to this run's emails — a LIKE over `persona-%` would take the real twenty with it.
    const { db } = await import("~/server/db/client");
    const { collection, invite, savedItem, seenItem, user, userTopic } =
      await import("~/server/db/schema");
    const ids = (
      await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, EMAILS))
    ).map((r) => r.id);
    if (ids.length) {
      await db.delete(seenItem).where(inArray(seenItem.userId, ids));
      await db.delete(savedItem).where(inArray(savedItem.userId, ids));
      await db.delete(collection).where(inArray(collection.userId, ids));
      await db.delete(userTopic).where(inArray(userTopic.userId, ids));
      await db.delete(user).where(inArray(user.id, ids));
    }
    await db.delete(invite).where(inArray(invite.email, EMAILS));
  });

  it("creates on the first run, changes nothing on the second, and re-syncs an edited pick", async () => {
    const { seedPersonas } = await import("./persona-seed");
    const { getUserTopicIds } = await import("~/server/db/topics");
    const { db } = await import("~/server/db/client");
    const { user } = await import("~/server/db/schema");
    const { eq } = await import("drizzle-orm");

    const first = await seedPersonas({ password, personas: FIXTURES });
    expect(first.created).toEqual(FIXTURES.map((p) => p.slug));

    const second = await seedPersonas({ password, personas: FIXTURES });
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged).toEqual(FIXTURES.map((p) => p.slug));

    // A persona's picks are exactly the fixture's.
    const [a] = await db
      .select()
      .from(user)
      .where(eq(user.email, personaEmail(FIXTURES[0]!.slug)));
    expect(new Set(await getUserTopicIds(a!.id))).toEqual(
      new Set(FIXTURES[0]!.topics),
    );

    // Edit one pick and re-run: exactly that user is "updated", the other is untouched.
    const edited = FIXTURES.map((p, i) =>
      i === 0 ? { ...p, topics: ["botany"] } : p,
    );
    const third = await seedPersonas({ password, personas: edited });
    expect(third.updated).toEqual([FIXTURES[0]!.slug]);
    expect(third.unchanged).toEqual([FIXTURES[1]!.slug]);
    expect(await getUserTopicIds(a!.id)).toEqual(["botany"]);
  });

  it("signs in with the shared password — the account is a real one, hashed the real way", async () => {
    const { auth } = await import("~/lib/auth");
    const res = await auth.api.signInEmail({
      body: { email: personaEmail(FIXTURES[1]!.slug), password },
      asResponse: true,
    });
    expect(res.ok).toBe(true);
  });
});
