// Integration tests for the Cut 0 usage readers (docs/PLAN_usage.md, Task 2), against a real
// Postgres. The dev database also holds the real corpus and real readers, so every scenario sits
// in a narrow window of a past year (2020) where nothing real lives, and every reader is asked
// about only that window; fixture users have unique emails and everything is deleted in afterAll.
// Self-skips whenever DATABASE_URL isn't set (same pattern as the other *.integration suites).
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  onboardingRuns,
  readersActive,
  retentionByWeek,
  savesPerHundred,
  signIns,
  sittings,
  sourceShare,
} from "./usage";

const MIN = 60_000;
const at = (iso: string, plusMin = 0) =>
  new Date(new Date(iso).getTime() + plusMin * MIN);
const win = (since: string, until: string, excludeEmails: string[]) => ({
  since: new Date(since),
  until: new Date(until),
  excludeEmails,
});

describe.skipIf(!process.env.DATABASE_URL)(
  "usage readers (integration)",
  () => {
    const tag = nanoid(8);
    const mk = (name: string) => ({
      id: `test-usage-${name}-${tag}`,
      name,
      email: `test-usage-${name}-${tag}@example.org`,
    });
    const A = mk("a");
    const B = mk("b");
    const C = mk("c");
    const R1 = mk("r1");
    const R2 = mk("r2");
    const R3 = mk("r3");
    const PERSONA = mk("persona"); // excluded through excludeEmails
    const E2E = {
      // excluded through the ambit-%@example.com pattern
      id: `test-usage-e2e-${tag}`,
      name: "e2e",
      email: `ambit-test-usage-${tag}@example.com`,
    };
    const users = [A, B, C, R1, R2, R3, PERSONA, E2E];
    const exclude = [PERSONA.email];

    const srcA = `test-usage-srcA-${tag}`;
    const srcB = `test-usage-srcB-${tag}`;
    const srcX = `test-usage-srcX-${tag}`;
    let x: string[] = []; // ten srcX items
    let a: string[] = []; // three srcA items
    let b: string[] = []; // one srcB item

    beforeAll(async () => {
      const { db } = await import("./client");
      const { user, seenItem, savedItem, session, interviewAnswer } =
        await import("./schema");
      const { insertHomedItems } = await import("./test-fixtures");

      await db
        .insert(user)
        .values(users.map((u) => ({ ...u, emailVerified: false })));

      const mkItems = (source: string, n: number) =>
        insertHomedItems(
          db,
          Array.from({ length: n }, (_, i) => ({
            source,
            sourceId: `${source}-${i}`,
            type: "image" as const,
            title: `usage fixture ${source} ${i}`,
            sourceUrl: `https://example.com/${source}-${i}`,
            imageUrl: `https://example.com/${source}-${i}.jpg`,
            topicId: null,
            curationScore: 9,
            aestheticTags: [],
          })),
        );
      x = (await mkItems(srcX, 10)).map((r) => r.id);
      a = (await mkItems(srcA, 3)).map((r) => r.id);
      b = (await mkItems(srcB, 1)).map((r) => r.id);

      const seen = (u: { id: string }, itemId: string, when: Date) => ({
        userId: u.id,
        itemId,
        servedAt: when,
      });
      await db.insert(seenItem).values([
        // W1 (Mar 2-10 2020). A: two sittings on Mar 2 (0, 5 | 50, 52 min), one item on Mar 4.
        seen(A, x[0]!, at("2020-03-02T10:00:00Z")),
        seen(A, x[1]!, at("2020-03-02T10:00:00Z", 5)),
        seen(A, x[2]!, at("2020-03-02T10:00:00Z", 50)),
        seen(A, x[3]!, at("2020-03-02T10:00:00Z", 52)),
        seen(A, x[4]!, at("2020-03-04T09:00:00Z")),
        // B: a single item on Mar 3.
        seen(B, x[0]!, at("2020-03-03T09:00:00Z")),
        // Never readers.
        seen(PERSONA, x[0]!, at("2020-03-02T10:00:00Z")),
        seen(E2E, x[0]!, at("2020-03-02T10:00:00Z")),
        // Source share (June 2020): one srcA and one srcB served, 1:1, against a 3:1 corpus.
        seen(C, a[0]!, at("2020-06-01T10:00:00Z")),
        seen(C, b[0]!, at("2020-06-01T10:01:00Z")),
        // Retention: weeks of Sep 7 (R1, R2) and Sep 14 (R2, R3).
        seen(R1, x[0]!, at("2020-09-08T10:00:00Z")),
        seen(R2, x[0]!, at("2020-09-09T10:00:00Z")),
        seen(R2, x[1]!, at("2020-09-15T10:00:00Z")),
        seen(R3, x[0]!, at("2020-09-16T10:00:00Z")),
      ]);
      await db
        .insert(savedItem)
        .values([
          { userId: A.id, itemId: x[0]!, savedAt: at("2020-03-04T09:05:00Z") },
        ]);

      const tok = () => `test-usage-tok-${nanoid(10)}`;
      const sess = (u: { id: string }, when: string) => ({
        id: tok(),
        token: tok(),
        userId: u.id,
        createdAt: new Date(when),
        updatedAt: new Date(when),
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      await db.insert(session).values([
        sess(A, "2020-04-01T08:00:00Z"),
        sess(A, "2020-04-01T20:00:00Z"),
        sess(B, "2020-04-01T09:00:00Z"),
        sess(A, "2020-04-02T08:00:00Z"),
        sess(PERSONA, "2020-04-02T08:00:00Z"),
        sess(B, "2020-04-10T23:30:00Z"), // near midnight UTC, for the time-zone test
      ]);

      const ans = (
        u: { id: string },
        runId: string,
        q: string,
        answer: string[],
        when: string,
        text: string | null = null,
      ) => ({
        userId: u.id,
        runId,
        questionId: q,
        answer,
        text,
        bankVersion: 3,
        askedAt: new Date(when),
      });
      await db.insert(interviewAnswer).values([
        // A: run 1 (one skip, one free-text), then a later retake with two skips.
        ans(A, `${tag}-r1`, "q1", ["skip"], "2020-05-01T10:00:00Z"),
        ans(A, `${tag}-r1`, "q2", ["x"], "2020-05-01T10:01:00Z"),
        ans(A, `${tag}-r1`, "q3", [], "2020-05-01T10:02:00Z", "dusty maps"),
        ans(A, `${tag}-r2`, "q1", ["skip"], "2020-05-08T10:00:00Z"),
        ans(A, `${tag}-r2`, "q2", ["skip"], "2020-05-08T10:01:00Z"),
        ans(A, `${tag}-r2`, "q3", ["y"], "2020-05-08T10:02:00Z"),
        // B: one run, nothing skipped, no words.
        ans(B, `${tag}-b1`, "q1", ["x"], "2020-05-02T10:00:00Z"),
      ]);
    });

    afterAll(async () => {
      const { db } = await import("./client");
      const { user, item, seenItem, savedItem } = await import("./schema");
      const ids = users.map((u) => u.id);
      // seen_item / saved_item have no cascade; session and interview_answer do.
      await db.delete(seenItem).where(inArray(seenItem.userId, ids));
      await db.delete(savedItem).where(inArray(savedItem.userId, ids));
      await db.delete(item).where(inArray(item.id, [...x, ...a, ...b]));
      await db.delete(user).where(inArray(user.id, ids));
    });

    const w1 = () => win("2020-03-02", "2020-03-10", exclude);

    it("readersActive counts days, served and saves per reader, excluding non-readers", async () => {
      const r = await readersActive(w1());
      expect(r.map((u) => u.userId).sort()).toEqual([A.id, B.id].sort());
      const ra = r.find((u) => u.userId === A.id)!;
      expect(ra).toMatchObject({ days: 2, served: 5, saves: 1 });
      expect(ra.firstAt).toEqual(at("2020-03-02T10:00:00Z"));
      expect(ra.lastAt).toEqual(at("2020-03-04T09:05:00Z"));
      expect(r.find((u) => u.userId === B.id)).toMatchObject({
        days: 1,
        served: 1,
        saves: 0,
      });
    });

    it("sittings splits on a gap of 30+ minutes (0, 5, 50, 52 -> two of two)", async () => {
      const s = await sittings(win("2020-03-02", "2020-03-03", exclude));
      expect(s).toHaveLength(2);
      expect(s.map((x) => x.served)).toEqual([2, 2]);
      expect(s[0]!.startedAt).toEqual(at("2020-03-02T10:00:00Z"));
      expect(s[0]!.endedAt).toEqual(at("2020-03-02T10:00:00Z", 5));
      expect(s[1]!.startedAt).toEqual(at("2020-03-02T10:00:00Z", 50));
      // The whole week: A's Mar 4 item is a third sitting; B has one.
      const week = await sittings(w1());
      expect(
        week.filter((x) => x.userId === A.id).map((x) => x.served),
      ).toEqual([2, 2, 1]);
      expect(week.filter((x) => x.userId === B.id)).toHaveLength(1);
    });

    it("savesPerHundred is saves over served across readers", async () => {
      const r = await savesPerHundred(w1());
      expect(r.served).toBe(6);
      expect(r.saves).toBe(1);
      expect(r.perHundred).toBeCloseTo(16.667, 2);
      const none = await savesPerHundred(win("2019-01-01", "2019-01-02", []));
      expect(none).toEqual({ served: 0, saves: 0, perHundred: 0 });
    });

    it("onboardingRuns reports runs, skips in the latest run and free text", async () => {
      const r = await onboardingRuns(win("2020-05-01", "2020-05-31", exclude));
      expect(r.find((u) => u.userId === A.id)).toEqual({
        userId: A.id,
        runs: 2,
        skippedInLatest: 2,
        freeText: true,
      });
      expect(r.find((u) => u.userId === B.id)).toEqual({
        userId: B.id,
        runs: 1,
        skippedInLatest: 0,
        freeText: false,
      });
    });

    it("signIns counts sessions and distinct readers per day, without personas", async () => {
      const r = await signIns(win("2020-04-01", "2020-04-03", exclude));
      expect(r).toEqual([
        { day: "2020-04-01", sessions: 3, readers: 2 },
        { day: "2020-04-02", sessions: 1, readers: 1 },
      ]);
    });

    it("signIns reads session.created_at as UTC whatever the database TimeZone is", async () => {
      const { db } = await import("./client");
      const { sql } = await import("drizzle-orm");
      // 23:30Z on Apr 10 is already Apr 11 in Asia/Tokyo and still Apr 10 in New York; a reader
      // that leaned on the session zone would move the row across the window edge or the day.
      for (const zone of ["America/New_York", "Asia/Tokyo"]) {
        const r = await db.transaction(async (tx) => {
          await tx.execute(sql.raw(`set local time zone '${zone}'`));
          return signIns(win("2020-04-10", "2020-04-11", exclude), tx);
        });
        expect(r, zone).toEqual([
          { day: "2020-04-10", sessions: 1, readers: 1 },
        ]);
      }
    });

    it("sourceShare compares served share with corpus share (3:1 corpus, 1:1 served)", async () => {
      const r = await sourceShare(win("2020-06-01", "2020-06-02", exclude), [
        srcA,
        srcB,
      ]);
      const get = (s: string) => r.find((x) => x.source === s)!;
      expect(get(srcA).ratio).toBeCloseTo(0.667, 2);
      expect(get(srcB).ratio).toBeCloseTo(2.0, 5);
      expect(get(srcA)).toMatchObject({ served: 1, corpus: 3 });
      expect(r[0]!.source).toBe(srcB); // most over-shown first
    });

    it("retentionByWeek counts weekly actives and those who were active the week before", async () => {
      const r = await retentionByWeek({
        weeks: 2,
        excludeEmails: exclude,
        now: new Date("2020-09-17T12:00:00Z"),
      });
      expect(r).toEqual([
        { week: "2020-09-07", active: 2, returning: 0 },
        { week: "2020-09-14", active: 2, returning: 1 },
      ]);
    });
  },
);
