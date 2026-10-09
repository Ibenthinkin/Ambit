// Integration tests for the usage_event writer and the Cut 1 readers (Task 6), against a real
// Postgres. Same posture as usage.integration.test.ts: every scenario sits on its own day of
// 2020 (where nothing real lives), visit keys carry a per-run tag, and afterAll deletes it all.
// Self-skips without DATABASE_URL.
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { NewUsageEvent } from "./schema";
import {
  clientErrors,
  installs,
  itemActions,
  itemOpens,
  onboardingFunnel,
  pruneEvents,
  recordEvents,
  screensPerVisit,
  topicEdits,
  visits,
} from "./usage";

const MIN = 60_000;
const at = (iso: string, plusMin = 0) =>
  new Date(new Date(iso).getTime() + plusMin * MIN);
const win = (since: string, until: string, excludeEmails: string[]) => ({
  since: new Date(since),
  until: new Date(until),
  excludeEmails,
});

describe.skipIf(!process.env.DATABASE_URL)("usage events (integration)", () => {
  const tag = nanoid(8);
  const mk = (name: string) => ({
    id: `test-usev-${name}-${tag}`,
    name,
    email: `test-usev-${name}-${tag}@example.org`,
  });
  const A = mk("a");
  const B = mk("b");
  const PERSONA = mk("persona");
  const users = [A, B, PERSONA];
  const exclude = [PERSONA.email];
  const v = (name: string) => `${name}-${tag}`;

  let itemId = "";
  let topicId = "";

  // One event of a given kind: `ev(visit, user, minute, kind, extras)`.
  const DAY1 = "2020-03-02T10:00:00Z";
  const ev = (
    visit: string,
    user: { id: string } | null,
    day: string,
    min: number,
    kind: string,
    extra: Partial<NewUsageEvent> = {},
  ): NewUsageEvent => ({
    visit: v(visit),
    userId: user?.id ?? null,
    kind,
    at: at(day, min),
    ...extra,
  });

  beforeAll(async () => {
    const { db } = await import("./client");
    const { user, usageEvent, topic } = await import("./schema");
    const { insertHomedItems } = await import("./test-fixtures");
    await db
      .insert(user)
      .values(users.map((u) => ({ ...u, emailVerified: false })));
    const [it1] = await insertHomedItems(db, [
      {
        source: `test-usev-src-${tag}`,
        sourceId: `test-usev-${tag}`,
        type: "image" as const,
        title: "usage events fixture",
        sourceUrl: "https://example.com/usev",
        imageUrl: "https://example.com/usev.jpg",
        topicId: null,
        curationScore: 9,
        aestheticTags: [],
      },
    ]);
    itemId = it1!.id;
    const [t] = await db.select({ id: topic.id }).from(topic).limit(1);
    topicId = t!.id;

    const D1 = DAY1;
    const D2 = "2020-03-03T10:00:00Z"; // onboarding
    const D3 = "2020-03-04T10:00:00Z"; // installs + errors
    const rows: NewUsageEvent[] = [
      // V1 (A, phone, standalone): opens feed, rail, rail, [linkout], rail, wander, rail.
      ev("v1", A, D1, 0, "visit.start", {
        meta: { device: "phone", standalone: true, via: "direct" },
      }),
      ev("v1", A, D1, 1, "screen.open", { screen: "feed" }),
      ev("v1", A, D1, 2, "item.open", { meta: { from: "feed" } }),
      ev("v1", A, D1, 3, "item.open", { meta: { from: "rail" } }),
      ev("v1", A, D1, 4, "item.open", { meta: { from: "rail" } }),
      ev("v1", A, D1, 5, "item.linkout"),
      ev("v1", A, D1, 6, "item.open", { meta: { from: "rail" } }),
      ev("v1", A, D1, 7, "item.open", { meta: { from: "wander" } }),
      ev("v1", A, D1, 8, "item.open", { meta: { from: "rail" } }),
      ev("v1", A, D1, 9, "item.share", { meta: { method: "copy" } }),
      ev("v1", A, D1, 10, "item.zoom"),
      ev("v1", A, D1, 11, "item.magazine", { meta: { on: true } }),
      ev("v1", A, D1, 12, "item.magazine", { meta: { on: false } }),
      ev("v1", A, D1, 13, "item.unsave"),
      ev("v1", A, D1, 14, "topics.edit", { meta: { action: "add" } }),
      ev("v1", A, D1, 15, "topics.edit", { meta: { action: "add" } }),
      ev("v1", A, D1, 16, "topics.edit", { meta: { action: "remove" } }),
      ev("v1", A, D1, 17, "visit.end", { meta: { seconds: 120 } }),
      // V2 (signed out, desktop, via a shared link): counted, not followed.
      ev("v2", null, D1, 0, "visit.start", {
        meta: { device: "desktop", standalone: false, via: "link" },
      }),
      ev("v2", null, D1, 1, "screen.open", { screen: "landing" }),
      ev("v2", null, D1, 2, "screen.open", { screen: "item" }),
      ev("v2", null, D1, 3, "item.open", { meta: { from: "link" } }),
      ev("v2", null, D1, 4, "visit.end", { meta: { seconds: 60 } }),
      // V3 (A, phone, internal): two rail opens in a row.
      ev("v3", A, D1, 60, "visit.start", {
        meta: { device: "phone", standalone: false, via: "internal" },
      }),
      ev("v3", A, D1, 61, "screen.open", { screen: "saved" }),
      ev("v3", A, D1, 62, "item.open", { meta: { from: "rail" } }),
      ev("v3", A, D1, 63, "item.open", { meta: { from: "rail" } }),
      ev("v3", A, D1, 64, "visit.end", { meta: { seconds: 300 } }),
      // The persona's visit: everything about it must be left out.
      ev("v4", PERSONA, D1, 0, "visit.start", {
        meta: { device: "desktop", standalone: false, via: "direct" },
      }),
      ev("v4", PERSONA, D1, 1, "screen.open", { screen: "feed" }),
      ...[2, 3, 4, 5, 6].map((m) =>
        ev("v4", PERSONA, D1, m, "item.open", { meta: { from: "rail" } }),
      ),
      ev("v4", PERSONA, D1, 7, "item.linkout"),
      ev("v4", PERSONA, D1, 8, "visit.end", { meta: { seconds: 9999 } }),

      // Onboarding. A: an older complete walk (visit o1), then a later visit o2 that reaches
      // step 3 and goes back to 2. B: all eight. A signed-out visitor stops at 2.
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        ev("o1", A, D2, s, "onboarding.step", {
          meta: { step: s, action: "answer" },
        }),
      ),
      ev("o2", A, D2, 100, "onboarding.step", {
        meta: { step: 1, action: "answer" },
      }),
      ev("o2", A, D2, 101, "onboarding.step", {
        meta: { step: 2, action: "answer" },
      }),
      ev("o2", A, D2, 102, "onboarding.step", {
        meta: { step: 3, action: "answer" },
      }),
      ev("o2", A, D2, 103, "onboarding.step", {
        meta: { step: 2, action: "back" },
      }),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        ev("o3", B, D2, s, "onboarding.step", {
          meta: { step: s, action: "answer" },
        }),
      ),
      ev("o4", null, D2, 1, "onboarding.step", {
        meta: { step: 1, action: "answer" },
      }),
      ev("o4", null, D2, 2, "onboarding.step", {
        meta: { step: 2, action: "skip" },
      }),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        ev("o5", PERSONA, D2, s, "onboarding.step", {
          meta: { step: s, action: "answer" },
        }),
      ),

      // Installs and errors.
      ev("i1", A, D3, 0, "pwa.install", { meta: { how: "prompt" } }),
      ev("i1", A, D3, 1, "pwa.install", { meta: { how: "prompt" } }),
      ev("i1", B, D3, 2, "pwa.install", { meta: { how: "appinstalled" } }),
      ev("i1", PERSONA, D3, 3, "pwa.install", { meta: { how: "card" } }),
      ev("e1", A, D3, 0, "client.error", {
        screen: "feed",
        meta: { digest: "d1" },
      }),
      ev("e1", A, D3, 1, "client.error", {
        screen: "feed",
        meta: { digest: "d1" },
      }),
      ev("e1", null, D3, 2, "client.error", {
        screen: "item",
        meta: { digest: "d1" },
      }),
      ev("e1", B, D3, 3, "client.error", {
        screen: "feed",
        meta: { digest: "d2" },
      }),
      ev("e1", PERSONA, D3, 4, "client.error", {
        screen: "feed",
        meta: { digest: "d2" },
      }),
    ];
    await db.insert(usageEvent).values(rows);
  });

  afterAll(async () => {
    const { db } = await import("./client");
    const { user, item, usageEvent } = await import("./schema");
    const { inArray, like } = await import("drizzle-orm");
    // Signed-out rows have no user to cascade from, so they go by their visit key.
    await db.delete(usageEvent).where(like(usageEvent.visit, `%-${tag}`));
    await db.delete(item).where(inArray(item.id, itemId ? [itemId] : []));
    await db.delete(user).where(
      inArray(
        user.id,
        users.map((u) => u.id),
      ),
    );
  });

  const w1 = () => win("2020-03-02", "2020-03-03", exclude);

  describe("recordEvents / pruneEvents", () => {
    const day = "2020-05-02T10:00:00Z";
    const count = async (visit: string) => {
      const { db } = await import("./client");
      const out = (await db.execute(
        sql`select item_id as "itemId", topic_id as "topicId" from usage_event
              where visit = ${visit} order by at`,
      )) as unknown as { itemId: string | null; topicId: string | null }[];
      return out;
    };

    it("lands a batch of three in one insert and returns the count", async () => {
      const n = await recordEvents([
        ev("r1", A, day, 0, "screen.open", { screen: "feed" }),
        ev("r1", A, day, 1, "item.open", { itemId, meta: { from: "feed" } }),
        ev("r1", A, day, 2, "topics.edit", {
          topicId,
          meta: { action: "add" },
        }),
      ]);
      expect(n).toBe(3);
      const rows = await count(v("r1"));
      expect(rows).toEqual([
        { itemId: null, topicId: null },
        { itemId, topicId: null },
        { itemId: null, topicId },
      ]);
    });

    it("nulls a dead item_id and a dead topic_id instead of failing the batch", async () => {
      const n = await recordEvents([
        ev("r2", A, day, 0, "item.open", { itemId, meta: { from: "feed" } }),
        ev("r2", A, day, 1, "item.open", {
          itemId: `gone-${tag}`,
          meta: { from: "feed" },
        }),
        ev("r2", A, day, 2, "topics.edit", {
          topicId: `gone-${tag}`,
          meta: { action: "add" },
        }),
      ]);
      expect(n).toBe(3);
      expect(await count(v("r2"))).toEqual([
        { itemId, topicId: null },
        { itemId: null, topicId: null },
        { itemId: null, topicId: null },
      ]);
    });

    it("never throws: a bad row is logged (count only) and 0 comes back", async () => {
      const spy = (await import("vitest")).vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      // A user id that does not exist violates the FK for the whole statement.
      const n = await recordEvents([
        ev("r3", { id: `nobody-${tag}` }, day, 0, "screen.open"),
      ]);
      expect(n).toBe(0);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]![0])).toContain("1");
      spy.mockRestore();
    });

    it("an empty batch is a no-op", async () => {
      expect(await recordEvents([])).toBe(0);
    });

    it("pruneEvents deletes rows older than the cutoff and returns how many", async () => {
      await recordEvents([
        ev("p1", null, "2019-06-01T10:00:00Z", 0, "screen.open"),
        ev("p1", null, "2019-12-01T10:00:00Z", 0, "screen.open"),
      ]);
      // 90 days before 2020-01-15 is 2019-10-17: June goes, December stays.
      const n = await pruneEvents(90, new Date("2020-01-15T00:00:00Z"));
      expect(n).toBeGreaterThanOrEqual(1);
      const left = await count(v("p1"));
      expect(left).toHaveLength(1);
    });
  });

  describe("readers", () => {
    it("visits counts starts (signed-out included, persona out) and the splits", async () => {
      const r = await visits(w1());
      expect(r.count).toBe(3);
      expect(r.signedOut).toBe(1);
      expect(r.medianSeconds).toBe(120);
      expect(r.p90Seconds).toBeCloseTo(264, 5);
      expect(r.device).toEqual({ phone: 2, desktop: 1 });
      expect(r.via).toEqual({ direct: 1, link: 1, internal: 1 });
      expect(r.standaloneShare).toBeCloseTo(1 / 3, 5);
    });

    it("visits is empty-safe", async () => {
      const r = await visits(win("2019-01-01", "2019-01-02", []));
      expect(r).toMatchObject({
        count: 0,
        medianSeconds: null,
        p90Seconds: null,
        standaloneShare: null,
      });
    });

    it("the exclusion drops the persona's rows but not signed-out ones", async () => {
      // Without the persona excluded, its visit counts too (4); with it, 3 incl. the null-user one.
      expect((await visits(win("2020-03-02", "2020-03-03", []))).count).toBe(4);
      expect((await visits(w1())).count).toBe(3);
    });

    it("screensPerVisit: per visit mean, median, max and a split by screen", async () => {
      const r = await screensPerVisit(w1());
      expect(r.visits).toBe(3);
      expect(r.total).toBe(4);
      expect(r.mean).toBeCloseTo(4 / 3, 5);
      expect(r.median).toBe(1);
      expect(r.max).toBe(2);
      expect(r.byScreen).toEqual({ feed: 1, landing: 1, item: 1, saved: 1 });
    });

    it("itemOpens: per visit, the from split and swipe depth (runs of rail opens)", async () => {
      const r = await itemOpens(w1());
      expect(r.opens).toBe(9);
      expect(r.perVisit).toBeCloseTo(3, 5);
      expect(r.from).toEqual({ feed: 1, rail: 6, wander: 1, link: 1 });
      // V1: rail, rail, [linkout does not break the run], rail = 3, then wander, then rail = 1;
      // V3: rail, rail = 2. The persona's run of five is excluded.
      expect(r.swipe).toEqual({ runs: 3, median: 2, max: 3 });
    });

    it("itemActions: counts and rates per 100 opens, null with no opens", async () => {
      const r = await itemActions(w1());
      expect(r.opens).toBe(9);
      expect(r.linkout.count).toBe(1);
      expect(r.linkout.per100).toBeCloseTo(100 / 9, 5);
      expect(r.share.byMethod).toEqual({ copy: 1 });
      expect(r.share.count).toBe(1);
      expect(r.zoom.count).toBe(1);
      expect(r.magazine.count).toBe(1); // the `on: false` one is not an open
      expect(r.unsave.count).toBe(1);
      const none = await itemActions(win("2019-01-01", "2019-01-02", []));
      expect(none.opens).toBe(0);
      expect(none.linkout.per100).toBeNull();
    });

    it("topicEdits counts by action", async () => {
      expect(await topicEdits(w1())).toEqual({
        total: 3,
        byAction: { add: 2, remove: 1 },
      });
    });

    it("onboardingFunnel: latest onboarding visit per reader, steps reached, where it stopped", async () => {
      const r = await onboardingFunnel(
        win("2020-03-03", "2020-03-04", exclude),
      );
      expect(r.readers).toBe(3); // A (latest visit), B, one signed-out; not the persona
      // A's latest visit reached 3 (the older full walk is ignored); B 8; signed-out 2.
      expect(r.reached).toEqual([3, 3, 2, 1, 1, 1, 1, 1]);
      // Last step event: A stopped on 2 (went back), B on 8, signed-out on 2.
      expect(r.stoppedAt).toEqual([0, 2, 0, 0, 0, 0, 0, 1]);
    });

    it("installs counts by how, without personas", async () => {
      expect(await installs(win("2020-03-04", "2020-03-05", exclude))).toEqual({
        prompt: 2,
        appinstalled: 1,
      });
    });

    it("clientErrors groups by digest and screen, biggest first", async () => {
      const r = await clientErrors(win("2020-03-04", "2020-03-05", exclude));
      expect(r).toEqual([
        { digest: "d1", screen: "feed", count: 2 },
        { digest: "d1", screen: "item", count: 1 },
        { digest: "d2", screen: "feed", count: 1 },
      ]);
    });
  });
});
