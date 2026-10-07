// `onboarding.complete` against a real Postgres (docs/PLAN_onboarding-questionnaire.md §2): the
// one mutation that ends the questionnaire. What only a database can prove — that picks, the
// answer log and the user columns land together or not at all, that a retake *overwrites*, and
// that deleting a reader takes their answers with them. Self-skips without DATABASE_URL.
import { eq, inArray, like } from "drizzle-orm";
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
    const hangUserId = `test-onboarding-hang-${nanoid(6)}`;
    const badHangUserId = `test-onboarding-badhang-${nanoid(6)}`;
    const USERS = [
      hangUserId,
      badHangUserId,
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
    /** Three pictures for the hang, and two articles — one with a lead picture — neither of
     *  which may be hung. */
    const itemPrefix = `test-onboarding-item-${tag}-`;
    let pictures: string[] = [];
    let article = "";
    let articleWithPicture = "";

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
      const { item, topic, user } = await import("~/server/db/schema");
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
      // Homed under a test-only topic: unreachable from any feed (CLAUDE.md, the un-homed race).
      const rows = await db
        .insert(item)
        .values(
          ["p1", "p2", "p3", "article", "article-pic"].map((n) => ({
            source: "met" as const,
            sourceId: `${itemPrefix}${n}`,
            type: n.startsWith("article")
              ? ("article" as const)
              : ("image" as const),
            title: `Hang fixture ${n}`,
            sourceUrl: `https://x.test/${itemPrefix}${n}`,
            imageUrl:
              n === "article" ? null : `https://x.test/${itemPrefix}${n}.jpg`,
            topicId: a,
            curationScore: 9,
          })),
        )
        .returning({ id: item.id, sourceId: item.sourceId });
      const idOf = (n: string) =>
        rows.find((r) => r.sourceId === `${itemPrefix}${n}`)!.id;
      pictures = ["p1", "p2", "p3"].map(idOf);
      article = idOf("article");
      articleWithPicture = idOf("article-pic");
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
      const { item, topic, user, userTopic } =
        await import("~/server/db/schema");
      // user_taste and interview_answer rows go with the user (ON DELETE CASCADE).
      await db.delete(userTopic).where(inArray(userTopic.userId, USERS));
      await db.delete(user).where(inArray(user.id, USERS));
      await db.delete(item).where(like(item.sourceId, `${itemPrefix}%`));
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
      // Its own earlier run sets "little", so the test stands alone.
      await caller.onboarding.complete(input({ writingAmount: "little" }));
      const { runId } = await caller.onboarding.complete(
        sayingNothingOfReading(),
      );
      expect(runId).toBeTruthy();
      // Still "little": absent is "not said", never "cleared".
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
      // Review focus 1: a v1 taste (a tab from before taste v2) reads back with no hang.
      expect(stored?.v).toBe(1);
      expect(stored?.hang).toEqual([]);
      const again = await caller.onboarding.complete(
        input({
          taste: { ...taste, title: { adjective: "Gilded", noun: "Myths" } },
        }),
      );
      expect(again.runId).not.toBe(runId);
      expect((await caller.topics.taste())?.title.adjective).toBe("Gilded");
    });

    /** The taste exactly as `user_taste` holds it — topics.taste filters on read, so a drop
     *  at write time is only visible here. */
    const storedTaste = async (uid: string) => {
      const { db } = await import("~/server/db/client");
      const { userTaste } = await import("~/server/db/schema");
      const [row] = await db
        .select({ taste: userTaste.taste })
        .from(userTaste)
        .where(eq(userTaste.userId, uid));
      return row?.taste;
    };

    // A stale tab, or the faces' ten-minute memo outliving a deleted item: the save goes through
    // and the dangling card is dropped, never a refusal the reader can't get past.
    it("drops an opened card whose item does not exist and saves the rest", async () => {
      const caller = createCaller(authedContext(badTasteUserId));
      const card = (itemId: string, minutes: number) => ({
        itemId,
        title: "x",
        kind: "essay" as const,
        minutes,
      });
      await caller.onboarding.complete(
        input({
          taste: {
            ...taste,
            opened: [card("no-such-item", 3), card(article, 11)],
            readingMinutes: 7,
          },
        }),
      );
      const stored = await storedTaste(badTasteUserId);
      expect(stored?.opened.map((o) => o.itemId)).toEqual([article]);
      expect(stored?.readingMinutes).toBe(11);
      const { picks, log } = await rowsFor(badTasteUserId);
      expect(picks).toEqual({ [a]: 2, [b]: 1, [c]: 0.5 });
      expect(log.length).toBeGreaterThan(0);
    });

    // Mediums are decoration too: an id that is no longer a pickable topic is dropped, not refused.
    it("drops a medium that is not a pickable topic and saves the rest", async () => {
      const caller = createCaller(authedContext(badTasteUserId));
      await caller.onboarding.complete(
        input({ taste: { ...taste, mediums: [a, "no-such-medium"] } }),
      );
      const stored = await storedTaste(badTasteUserId);
      expect(stored?.mediums).toEqual([a]);
    });

    // Taste v2 (docs/DESIGN_redesign.md §5.1): the hang is item ids, checked like `opened`.
    it("stores a v2 taste's hang and reads it back as pictures, in hanging order", async () => {
      const caller = createCaller(authedContext(hangUserId));
      const [p1, p2, p3] = pictures as [string, string, string];
      await caller.onboarding.complete(
        input({
          bankVersion: 3,
          taste: { ...taste, v: 2, hang: [p3, p1, p2] },
        }),
      );
      const stored = await caller.topics.taste();
      expect(stored?.v).toBe(2);
      expect(stored?.hang).toEqual([
        { itemId: p3, src: `/api/img/${p3}?w=960`, title: "Hang fixture p3" },
        { itemId: p1, src: `/api/img/${p1}?w=960`, title: "Hang fixture p1" },
        { itemId: p2, src: `/api/img/${p2}?w=960`, title: "Hang fixture p2" },
      ]);
    });

    it("reads a v1 row written straight to user_taste — no hang, no throw", async () => {
      const { db } = await import("~/server/db/client");
      const { userTaste } = await import("~/server/db/schema");
      const caller = createCaller(authedContext(hangUserId));
      // As a bank-v2 run left it in production: `v: 1`, no `hang` key at all.
      await db
        .insert(userTaste)
        .values({ userId: hangUserId, runId: "v1-run", bankVersion: 2, taste })
        .onConflictDoUpdate({ target: userTaste.userId, set: { taste } });
      const stored = await caller.topics.taste();
      expect(stored?.v).toBe(1);
      expect(stored?.title).toEqual(taste.title);
      expect(stored?.hang).toEqual([]);
    });

    it("reads past a stored hang id that is an article, even one with a picture", async () => {
      const { db } = await import("~/server/db/client");
      const { userTaste } = await import("~/server/db/schema");
      const caller = createCaller(authedContext(hangUserId));
      const [p1, p2] = pictures as [string, string];
      const v2 = {
        ...taste,
        v: 2 as const,
        hang: [p1, articleWithPicture, p2],
      };
      await db
        .insert(userTaste)
        .values({
          userId: hangUserId,
          runId: "v2-run",
          bankVersion: 3,
          taste: v2,
        })
        .onConflictDoUpdate({ target: userTaste.userId, set: { taste: v2 } });
      expect((await caller.topics.taste())?.hang.map((h) => h.itemId)).toEqual([
        p1,
        p2,
      ]);
    });

    it("drops a hung id that does not exist or is not a picture, and stores the rest", async () => {
      const caller = createCaller(authedContext(badHangUserId));
      const [p1, p2] = pictures as [string, string];
      for (const bad of ["no-such-item", article, articleWithPicture]) {
        await caller.onboarding.complete(
          input({
            bankVersion: 3,
            taste: { ...taste, v: 2, hang: [p1, bad, p2] },
          }),
        );
        expect(await storedTaste(badHangUserId)).toMatchObject({
          v: 2,
          hang: [p1, p2],
        });
      }
      // Left with one picture, there is no hang: stored empty, the run saved all the same.
      await caller.onboarding.complete(
        input({
          bankVersion: 3,
          taste: { ...taste, v: 2, hang: [p1, article] },
        }),
      );
      expect(await storedTaste(badHangUserId)).toMatchObject({ hang: [] });
      expect((await rowsFor(badHangUserId)).picks).toEqual({
        [a]: 2,
        [b]: 1,
        [c]: 0.5,
      });
    });

    it("saves when a hung picture is deleted between the reveal and Open my feed", async () => {
      const { db } = await import("~/server/db/client");
      const { item } = await import("~/server/db/schema");
      const caller = createCaller(authedContext(badHangUserId));
      const [p1, p2] = pictures as [string, string];
      // The reveal hangs a picture (from the memoised faces)…
      const [doomed] = await db
        .insert(item)
        .values({
          source: "met",
          sourceId: `${itemPrefix}doomed`,
          type: "image",
          title: "Hang fixture doomed",
          sourceUrl: `https://x.test/${itemPrefix}doomed`,
          imageUrl: `https://x.test/${itemPrefix}doomed.jpg`,
          topicId: a,
          curationScore: 9,
        })
        .returning({ id: item.id });
      const hang = [doomed!.id, p1, p2];
      // …and the corpus loses it before the reader presses the button.
      await db.delete(item).where(eq(item.id, doomed!.id));
      const { runId } = await caller.onboarding.complete(
        input({ bankVersion: 3, taste: { ...taste, v: 2, hang } }),
      );
      expect(runId).toBeTruthy();
      expect(await storedTaste(badHangUserId)).toMatchObject({
        hang: [p1, p2],
      });
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
