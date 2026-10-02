// `onboarding.complete` against a real Postgres (docs/PLAN_onboarding-questionnaire.md §2): the
// one mutation that ends the questionnaire. What only a database can prove — that picks, the
// answer log and the user columns land together or not at all, that a retake *overwrites*, and
// that deleting a reader takes their answers with them. Self-skips without DATABASE_URL.
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import type { Context } from "~/server/api/trpc";

function authedContext(userId: string): Context {
  const now = new Date();
  return {
    headers: new Headers(),
    session: {
      id: `test-session-${userId}`,
      token: `test-token-${userId}`,
      userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Test onboarding user",
      email: `${userId}@example.com`,
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "onboarding.complete (integration)",
  () => {
    const userId = `test-onboarding-user-${nanoid(8)}`;
    const goneUserId = `test-onboarding-gone-${nanoid(8)}`;
    const tag = nanoid(8);
    const [a, b, c, d] = ["a", "b", "c", "d"].map(
      (n) => `test-onboarding-topic-${n}-${tag}`,
    ) as [string, string, string, string];
    const TOPICS = [a, b, c, d];

    const answers = [
      {
        questionId: "look-at",
        keys: [],
        text: "old maps, tide tables",
        topicIds: [a],
      },
      { questionId: "space-or-garden", keys: ["either"] },
      { questionId: "evening", keys: ["music", "books"] },
      { questionId: "unsettle", keys: ["skip"] },
    ];
    const input = (over: object = {}) => ({
      picks: [
        { topicId: a, weight: 2 },
        { topicId: b, weight: 1 },
        { topicId: c, weight: 0.5 },
      ],
      writingAmount: "lot" as const,
      answers,
      bankVersion: 1,
      ...over,
    });

    const rowsFor = async (uid: string) => {
      const { db } = await import("~/server/db/client");
      const { interviewAnswer, user, userTopic } =
        await import("~/server/db/schema");
      const [me] = await db.select().from(user).where(eq(user.id, uid));
      const picks = await db
        .select()
        .from(userTopic)
        .where(eq(userTopic.userId, uid));
      const log = await db
        .select()
        .from(interviewAnswer)
        .where(eq(interviewAnswer.userId, uid));
      return {
        me,
        picks: Object.fromEntries(picks.map((p) => [p.topicId, p.weight])),
        log,
      };
    };

    beforeAll(async () => {
      const { db } = await import("~/server/db/client");
      const { topic, user } = await import("~/server/db/schema");
      await db.insert(topic).values(
        TOPICS.map((id) => ({
          id,
          label: `Test onboarding ${id}`,
          seedQueries: {
            wikipedia: [],
            met: [],
            aic: [],
            cma: [],
            wellcome: [],
          },
          facet: "subject" as const,
        })),
      );
      await db.insert(user).values(
        [userId, goneUserId].map((id) => ({
          id,
          name: "Test onboarding user",
          email: `${id}@example.com`,
          emailVerified: false,
        })),
      );
    });

    afterAll(async () => {
      const { db } = await import("~/server/db/client");
      const { topic, user, userTopic } = await import("~/server/db/schema");
      await db
        .delete(userTopic)
        .where(inArray(userTopic.userId, [userId, goneUserId]));
      await db.delete(user).where(inArray(user.id, [userId, goneUserId]));
      await db.delete(topic).where(inArray(topic.id, TOPICS));
    });

    it("writes the picks, the reading amount and one run of answers together", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(input());

      const { me, picks, log } = await rowsFor(userId);
      expect(picks).toEqual({ [a]: 2, [b]: 1, [c]: 0.5 });
      expect(me!.writingAmount).toBe("lot");
      // No `about` was sent, so the three trial columns stay untouched.
      expect([me!.ageRange, me!.location, me!.gender]).toEqual([
        null,
        null,
        null,
      ]);

      expect(log).toHaveLength(answers.length);
      expect(new Set(log.map((r) => r.runId))).toEqual(new Set([runId]));
      expect(log.every((r) => r.bankVersion === 1)).toBe(true);
      const by = Object.fromEntries(log.map((r) => [r.questionId, r]));
      // A free-text row carries the reader's words and the topic ids they mapped to…
      expect(by["look-at"]).toMatchObject({
        text: "old maps, tide tables",
        answer: [a],
      });
      // …every other row its option keys or sentinel, and no text.
      expect(by.evening).toMatchObject({
        text: null,
        answer: ["music", "books"],
      });
      expect(by["space-or-garden"]!.answer).toEqual(["either"]);
      expect(by.unsettle!.answer).toEqual(["skip"]);

      // And the gate the feed reads agrees.
      const { hasCompletedOnboarding } = await import("~/server/db/topics");
      expect(await hasCompletedOnboarding(userId)).toBe(true);
    });

    it("a retake overwrites: dropped topics go, kept ones take the new weight, answers add a second run", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(
        input({
          picks: [
            // `a` was 2 (and could have been save-learned higher): the reveal said "a little".
            { topicId: a, weight: 0.5 },
            { topicId: c, weight: 1 },
            { topicId: d, weight: 1 },
          ],
          // Skipped the amount question this time: the earlier answer stands.
          writingAmount: null,
          answers: [{ questionId: "evening", keys: ["food"] }],
          about: { ageRange: "35–44", location: "  Lisbon ", gender: "" },
        }),
      );

      const { me, picks, log } = await rowsFor(userId);
      expect(picks).toEqual({ [a]: 0.5, [c]: 1, [d]: 1 });
      expect(me!.writingAmount).toBe("lot");
      // Trimmed; an empty answer is "not given", stored as NULL rather than "".
      expect([me!.ageRange, me!.location, me!.gender]).toEqual([
        "35–44",
        "Lisbon",
        null,
      ]);
      expect(log).toHaveLength(answers.length + 1);
      expect(log.filter((r) => r.runId === runId)).toHaveLength(1);
    });

    it("refuses an unpickable topic with BAD_REQUEST and writes nothing", async () => {
      const caller = createCaller(authedContext(userId));
      const before = await rowsFor(userId);
      await expect(
        caller.onboarding.complete(
          input({
            picks: [
              { topicId: a, weight: 1 },
              { topicId: b, weight: 1 },
              { topicId: "no-such-topic", weight: 1 },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const after = await rowsFor(userId);
      expect(after.picks).toEqual(before.picks);
      expect(after.log).toHaveLength(before.log.length);
    });

    it("is one transaction: a failure after the first write rolls everything back", async () => {
      // Straight at the repository, past the router's validation, with an id the foreign key
      // refuses — the only way to make the *database* fail part-way.
      const { completeOnboarding } = await import("~/server/db/onboarding");
      const before = await rowsFor(userId);
      await expect(
        completeOnboarding(userId, {
          picks: [
            { topicId: b, weight: 1 },
            { topicId: "no-such-topic", weight: 1 },
          ],
          writingAmount: "none",
          answers: [{ questionId: "evening", answer: ["music"], text: null }],
          bankVersion: 1,
          about: { ageRange: "65+", location: null, gender: null },
        }),
      ).rejects.toThrow();
      const after = await rowsFor(userId);
      expect(after.picks).toEqual(before.picks);
      expect(after.log).toHaveLength(before.log.length);
      expect(after.me!.writingAmount).toBe("lot");
      expect(after.me!.ageRange).toBe("35–44");
    });

    it("deleting the reader deletes their answers (the foreign key cascades)", async () => {
      const { db } = await import("~/server/db/client");
      const { interviewAnswer, user, userTopic } =
        await import("~/server/db/schema");
      await createCaller(authedContext(goneUserId)).onboarding.complete(
        input(),
      );
      expect((await rowsFor(goneUserId)).log.length).toBeGreaterThan(0);

      // `user_topic` does not cascade (it never has), so that goes first — exactly what
      // scripts/e2e-clean.ts does. The answers need no such line.
      await db.delete(userTopic).where(eq(userTopic.userId, goneUserId));
      await db.delete(user).where(eq(user.id, goneUserId));
      const left = await db
        .select()
        .from(interviewAnswer)
        .where(eq(interviewAnswer.userId, goneUserId));
      expect(left).toEqual([]);
    });
  },
);
