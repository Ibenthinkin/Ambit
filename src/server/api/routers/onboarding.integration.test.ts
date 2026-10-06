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
    const badTasteUserId = `test-onboarding-badtaste-${nanoid(6)}`;
    const noTasteUserId = `test-onboarding-notaste-${nanoid(6)}`;
    const manyTopicsUserId = `test-onboarding-many-${nanoid(6)}`;
    const staleUserId = `test-onboarding-stale-${nanoid(6)}`;
    const noAmountUserId = `test-onboarding-noamount-${nanoid(6)}`;
    const USERS = [
      userId,
      goneUserId,
      badTasteUserId,
      noTasteUserId,
      manyTopicsUserId,
      staleUserId,
      noAmountUserId,
    ];
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

    /** A v3 run that says nothing about reading — no `writingAmount` key at all. */
    const sayingNothingOfReading = () => {
      const { picks, answers } = input();
      return { picks, answers, bankVersion: 3 };
    };

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
        USERS.map((id) => ({
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
      // user_taste and interview_answer rows go with the user (ON DELETE CASCADE).
      await db.delete(userTopic).where(inArray(userTopic.userId, USERS));
      await db.delete(user).where(inArray(user.id, USERS));
      await db.delete(topic).where(inArray(topic.id, TOPICS));
    });

    it("writes the picks, the reading amount and one run of answers together", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(input());

      const { me, picks, log } = await rowsFor(userId);
      expect(picks).toEqual({ [a]: 2, [b]: 1, [c]: 0.5 });
      expect(me!.writingAmount).toBe("lot");

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
        }),
      );

      const { me, picks, log } = await rowsFor(userId);
      expect(picks).toEqual({ [a]: 0.5, [c]: 1, [d]: 1 });
      expect(me!.writingAmount).toBe("lot");
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
        }),
      ).rejects.toThrow();
      const after = await rowsFor(userId);
      expect(after.picks).toEqual(before.picks);
      expect(after.log).toHaveLength(before.log.length);
      expect(after.me!.writingAmount).toBe("lot");
    });

    // Review Focus 2 (docs/PLAN_onboarding-critique.md): About you and its three columns went
    // 10-05-26, but a tab opened before that deploy still sends `about`. Zod's default object
    // mode *strips* an unknown key, so the run completes; this pins that the input schema is not
    // `.strict()`, which would turn a stale tab's save into a 400.
    it("strips an about object a stale client still sends", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(
        input({
          about: { ageRange: "25–34", location: "x", gender: "y" },
        }),
      );
      expect(runId).toBeTruthy();
    });

    // Redesign Review focus 2 (docs/PLAN_redesign.md, Phase 6): bank v3 retired the `amount`
    // and `read-watch` questions, but a tab opened before that deploy still asks them and sends
    // their answers under `bankVersion: 2`. The answer log is a record of what was asked, so the
    // run completes and both rows are logged under the version that asked them.
    it("accepts and logs a bank v2 run from a stale tab (amount and read-watch answers)", async () => {
      const caller = createCaller(authedContext(staleUserId));
      const { runId } = await caller.onboarding.complete(
        input({
          writingAmount: "little",
          bankVersion: 2,
          answers: [
            { questionId: "wings-1", keys: ["space"] },
            { questionId: "amount", keys: ["little"] },
            {
              questionId: "look-at",
              keys: [],
              text: "star charts",
              topicIds: [a],
            },
            {
              questionId: "read-watch",
              keys: [],
              text: "Le Guin, old Omni magazines",
              topicIds: [b],
            },
          ],
        }),
      );

      const { me, log } = await rowsFor(staleUserId);
      expect(me!.writingAmount).toBe("little");
      expect(log).toHaveLength(4);
      expect(log.every((r) => r.runId === runId && r.bankVersion === 2)).toBe(
        true,
      );
      const by = Object.fromEntries(log.map((r) => [r.questionId, r]));
      expect(by.amount).toMatchObject({ answer: ["little"], text: null });
      expect(by["read-watch"]).toMatchObject({
        answer: [b],
        text: "Le Guin, old Omni magazines",
      });
    });

    // Bank v3 has no amount question; the reveal's Reading row supplies it (Task 6.6). Until
    // then — and for any client that never says — an absent amount means what a skipped one
    // always meant: the column is left as it was, and NULL is the feed's default share.
    it("accepts a run with no writingAmount at all and leaves the column untouched", async () => {
      const caller = createCaller(authedContext(staleUserId));
      const { runId } = await caller.onboarding.complete(
        sayingNothingOfReading(),
      );
      expect(runId).toBeTruthy();
      // Still the v2 run's "little": absent is "not said", never "cleared".
      expect((await rowsFor(staleUserId)).me!.writingAmount).toBe("little");
    });

    it("leaves a never-set amount NULL when a run says nothing about reading", async () => {
      const caller = createCaller(authedContext(noAmountUserId));
      await caller.onboarding.complete(sayingNothingOfReading());
      expect((await rowsFor(noAmountUserId)).me!.writingAmount).toBeNull();
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

    // First Exhibition (docs/DESIGN_first-exhibition.md §4): the reveal's taste, stored with the run.
    const taste = {
      v: 1 as const,
      title: { adjective: "Quiet", noun: "Weathers" },
      wings: ["land", "growing"],
      mediums: [a],
      temperament: {
        communal: 0.2,
        aesthetic: 1,
        dark: 0,
        thrilling: 0.1,
        cerebral: 0.5,
      },
      compass: { wild: 0.6, old: 0.2, still: 0.4, far: 0.1 },
      opened: [] as {
        itemId: string;
        title: string;
        kind: "essay";
        minutes: number;
      }[],
      readingMinutes: null,
    };

    it("stores the taste with the run, and a retake replaces it", async () => {
      const caller = createCaller(authedContext(userId));
      const { runId } = await caller.onboarding.complete(input({ taste }));
      const stored = await caller.topics.taste();
      expect(stored?.title).toEqual({ adjective: "Quiet", noun: "Weathers" });
      const again = await caller.onboarding.complete(
        input({
          taste: { ...taste, title: { adjective: "Gilded", noun: "Myths" } },
        }),
      );
      expect(again.runId).not.toBe(runId);
      expect((await caller.topics.taste())?.title.adjective).toBe("Gilded");
    });

    it("refuses a taste whose opened item does not exist, writing nothing", async () => {
      const caller = createCaller(authedContext(badTasteUserId));
      await expect(
        caller.onboarding.complete(
          input({
            taste: {
              ...taste,
              opened: [
                {
                  itemId: "no-such-item",
                  title: "x",
                  kind: "essay",
                  minutes: 3,
                },
              ],
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await caller.topics.taste()).toBeNull();
      // Nothing else landed either: the check runs before the transaction.
      const { picks, log } = await rowsFor(badTasteUserId);
      expect(picks).toEqual({});
      expect(log).toEqual([]);
    });

    it("topics.taste is null for a reader who has none", async () => {
      const caller = createCaller(authedContext(noTasteUserId));
      expect(await caller.topics.taste()).toBeNull();
    });

    // Final review, finding 2: a reading card puts the article's whole `item_topic` membership on
    // `topicIds` — sized by the vocabulary, not by the model's six — so the answer must not be
    // refused for carrying many.
    it("accepts a reading answer carrying an article's full membership list", async () => {
      const caller = createCaller(authedContext(manyTopicsUserId));
      const topicIds = Array.from({ length: 40 }, (_, i) => `member-${i}`);
      const { runId } = await caller.onboarding.complete(
        input({
          answers: [{ questionId: "read-1", keys: ["essay"], topicIds }],
        }),
      );
      expect(runId).toEqual(expect.stringMatching(/\S/));
    });
  },
);
