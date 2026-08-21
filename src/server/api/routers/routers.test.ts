// Fast, DB-free-where-possible unit tests for the SPEC §7 tRPC surface: createCaller with a
// hand-built mock context (never `createTRPCContext` itself, which would need a real session
// cookie and a running Postgres — see routers.integration.test.ts for the real-DB round trips).
//
// The one thing every test here can assert without touching Postgres: whether a call reaches a
// procedure's resolver at all. A null-session context should never get past `protectedProcedure`'s
// middleware; a well-formed session should sail through it. What happens *after* that boundary
// (an actual DB read/write) is either mocked away (feed.page's knob-forwarding test) or exercised
// for real only in the integration suite.
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter, createCaller } from "~/server/api/root";
import type { Context } from "~/server/api/trpc";
import type * as FeedRepo from "~/server/db/feed";
import type * as FeedService from "~/server/services/feed";

// Mock services/feed.ts's `getFeedPage` (keeping `decodeCursor`/everything else real via
// `importOriginal`) so the feed router's own tests never touch Postgres — the actual tier/topic/
// item logic and the FEED_DEBUG knob-gating live inside `getFeedPage` itself and are exercised by
// services/feed.test.ts + feed.integration.test.ts (Phase 4.1); what belongs to *this* router's
// test surface is only "does it forward the right arguments, and does auth gate it correctly."
vi.mock("~/server/services/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof FeedService>();
  return {
    ...actual,
    getFeedPage: vi.fn(actual.getFeedPage),
  };
});

// Same treatment for the `seen_item` writer behind `feed.markSeen` — the router's job is to hand
// it the *session's* user id (never a client-supplied one) plus the acked ids, and that's provable
// without a database.
vi.mock("~/server/services/wander", () => ({ getWanderNext: vi.fn() }));
vi.mock("~/server/services/gallery-rail", () => ({ getGalleryRail: vi.fn() }));

vi.mock("~/server/db/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof FeedRepo>();
  return { ...actual, markSeen: vi.fn() };
});

const { getFeedPage: mockedGetFeedPage } =
  await import("~/server/services/feed");
const { markSeen: mockedMarkSeen } = await import("~/server/db/feed");

// `items.wanderNext` reaches Postgres through services/wander.ts; mocked here for the same reason
// as `getFeedPage` — this file's subject is the auth boundary and argument forwarding, not the
// draw itself (wander.test.ts owns that).
const { getWanderNext: mockedGetWanderNext } =
  await import("~/server/services/wander");

// And `items.galleryRail` reaches it through services/gallery-rail.ts — mocked for the same
// reason. The walk, the wildcard, and the FEED_DEBUG gate are gallery-rail.test.ts's subject; this
// file's is the auth boundary and argument forwarding.
const { getGalleryRail: mockedGetGalleryRail } =
  await import("~/server/services/gallery-rail");

// A minimal, well-formed logged-out context — the shape `createTRPCContext` would produce for a
// request with no session cookie at all.
function anonContext(): Context {
  return {
    headers: new Headers(),
    session: null,
    user: null,
  };
}

// A minimal, well-formed logged-in context. Session/user are shaped like the real `session`/
// `user` Drizzle rows (schema.ts) — structurally what Better Auth's `getSession()` returns for a
// valid session, without needing a real cookie or database to produce one.
function authedContext(userId = "test-user-1"): Context {
  const now = new Date();
  return {
    headers: new Headers(),
    session: {
      id: "test-session-1",
      token: "test-token",
      userId,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Test User",
      email: "test-user@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe("protected procedures reject a null session", () => {
  const caller = createCaller(anonContext());

  it("topics.list throws UNAUTHORIZED", async () => {
    await expect(caller.topics.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("topics.setMine throws UNAUTHORIZED", async () => {
    await expect(
      caller.topics.setMine({ topicIds: ["some-topic"] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("feed.page throws UNAUTHORIZED", async () => {
    await expect(caller.feed.page({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("feed.markSeen throws UNAUTHORIZED", async () => {
    await expect(
      caller.feed.markSeen({ itemIds: ["some-item"] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("saves.collections throws UNAUTHORIZED", async () => {
    await expect(caller.saves.collections()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("saves.saveToCollection throws UNAUTHORIZED", async () => {
    await expect(
      caller.saves.saveToCollection({
        itemId: "some-item",
        collectionId: "some-collection",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("saves.unsave throws UNAUTHORIZED", async () => {
    await expect(
      caller.saves.unsave({ itemId: "some-item" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("saves.list throws UNAUTHORIZED", async () => {
    await expect(caller.saves.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("saves.count throws UNAUTHORIZED", async () => {
    await expect(caller.saves.count()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("saves.forItem throws UNAUTHORIZED", async () => {
    await expect(
      caller.saves.forItem({ itemId: "some-item" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("the three public procedures", () => {
  it("items.byId: a null session never yields UNAUTHORIZED — it reaches the resolver", async () => {
    const caller = createCaller(anonContext());
    // The id is deliberately nonexistent: this test only cares whether the *auth* boundary let
    // the call through, not what a real DB does with it (that's items.integration.test.ts's
    // job). Whatever error (if any) comes back, it must never be an auth rejection.
    try {
      await caller.items.byId({ id: "definitely-does-not-exist-12345" });
    } catch (err) {
      if (err instanceof TRPCError) {
        expect(err.code).not.toBe("UNAUTHORIZED");
      }
    }
  });

  // The boundary test in the *other* direction: the item page's teaser has to render for a
  // stranger following a shared link, so an anonymous caller must reach this resolver.
  it("items.wanderNext serves an anonymous caller", async () => {
    vi.mocked(mockedGetWanderNext).mockResolvedValue([
      { id: "b", title: "Another thing", reason: "a drift from X into Y" },
    ]);

    const rows = await createCaller(anonContext()).items.wanderNext({
      itemId: "a",
    });

    expect(rows).toEqual([
      { id: "b", title: "Another thing", reason: "a drift from X into Y" },
    ]);
    // No user id reaches the service — there is no parameter for one.
    expect(vi.mocked(mockedGetWanderNext)).toHaveBeenCalledWith("a");
  });

  // Same direction, same reason: `/g/[itemId]` is deep-linkable and opens from the public item
  // page, so a stranger swiping the gallery must reach this resolver.
  it("items.galleryRail serves an anonymous caller", async () => {
    const rail = [
      {
        id: "b",
        title: "Another thing",
        attribution: null,
        imageUrl: "https://example.test/b.jpg",
        summary: null,
        source: "met",
        sourceUrl: "https://example.test/o",
        license: null,
        topicId: "botany",
      },
    ];
    vi.mocked(mockedGetGalleryRail).mockResolvedValue(rail);

    const rows = await createCaller(anonContext()).items.galleryRail({
      itemId: "a",
    });

    expect(rows).toEqual(rail);
    // No user id reaches the service — there is no parameter for one.
    expect(vi.mocked(mockedGetGalleryRail)).toHaveBeenCalledWith("a", {
      count: 8,
      excludeIds: [],
      knobs: undefined,
    });
  });
});

describe("items.galleryRail input handling", () => {
  beforeEach(() => {
    vi.mocked(mockedGetGalleryRail).mockReset();
    vi.mocked(mockedGetGalleryRail).mockResolvedValue([]);
  });

  it("forwards count, exclude and knobs untouched", async () => {
    const caller = createCaller(anonContext());

    await caller.items.galleryRail({
      itemId: "a",
      count: 3,
      exclude: ["x", "y"],
      knobs: { wildcardChance: 0.9 },
    });

    // Whether the knobs actually change the draw is entirely `getGalleryRail`'s call (gated on the
    // server's FEED_DEBUG env var — SPEC §9's "dev affordances behind a dev flag"), exactly as
    // `feed.page` leaves that decision to `getFeedPage`. The router must never do its own
    // redundant gating that could disagree.
    expect(vi.mocked(mockedGetGalleryRail)).toHaveBeenCalledWith("a", {
      count: 3,
      excludeIds: ["x", "y"],
      knobs: { wildcardChance: 0.9 },
    });
  });

  it("rejects an out-of-range count", async () => {
    const caller = createCaller(anonContext());
    await expect(
      caller.items.galleryRail({ itemId: "a", count: 99 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(vi.mocked(mockedGetGalleryRail)).not.toHaveBeenCalled();
  });

  it("rejects an exclude list past the IN-list cap", async () => {
    const caller = createCaller(anonContext());
    await expect(
      caller.items.galleryRail({
        itemId: "a",
        exclude: Array.from({ length: 201 }, (_, i) => `id-${i}`),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a wildcardChance outside [0, 1]", async () => {
    const caller = createCaller(anonContext());
    await expect(
      caller.items.galleryRail({ itemId: "a", knobs: { wildcardChance: 2 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("zod input validation", () => {
  it("topics.setMine rejects an empty topicIds array with BAD_REQUEST", async () => {
    const caller = createCaller(authedContext());
    await expect(caller.topics.setMine({ topicIds: [] })).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
  });

  it("saves.saveToCollection rejects a missing collectionId", async () => {
    const caller = createCaller(authedContext());
    await expect(
      // @ts-expect-error deliberately malformed input — proving the zod schema, not TS, is what
      // catches this at runtime (a caller in JS, or a stale client build, has no compiler to
      // save it).
      caller.saves.saveToCollection({ itemId: "some-item" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("saves.unsave rejects a missing itemId", async () => {
    const caller = createCaller(authedContext());
    // @ts-expect-error deliberately malformed input — see the note above.
    await expect(caller.saves.unsave({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("feed.markSeen rejects an empty ack, and one past the 64-id cap", async () => {
    const caller = createCaller(authedContext());
    await expect(caller.feed.markSeen({ itemIds: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller.feed.markSeen({
        itemIds: Array.from({ length: 65 }, (_, i) => `item-${i}`),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("feed.page rejects a knobs field with an out-of-range value", async () => {
    const caller = createCaller(authedContext());
    await expect(
      caller.feed.page({ knobs: { hop2: 2 } }), // hop2 is bounded to [0, 1]
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("feed.page rejects a malformed cursor with BAD_REQUEST, not a 500", async () => {
    const caller = createCaller(authedContext());
    await expect(
      caller.feed.page({ cursor: "not-a-real-cursor" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // getFeedPage should never even be called — the router's own decodeCursor pre-check catches
    // this before forwarding to the DB-backed engine.
    expect(mockedGetFeedPage).not.toHaveBeenCalled();
  });
});

describe("feed.page forwards knobs to getFeedPage unconditionally", () => {
  beforeEach(() => {
    vi.mocked(mockedGetFeedPage).mockReset();
    vi.mocked(mockedGetFeedPage).mockResolvedValue({
      cards: [],
      nextCursor: undefined,
    });
  });

  // Whether these knobs actually change the composed page is entirely getFeedPage's own call
  // (gated on the server's FEED_DEBUG env var — SPEC §9's "dev affordances behind a dev flag").
  // The router's only job is to zod-validate their shape and pass them through untouched; it
  // must never do its own redundant gating that could disagree with getFeedPage's.
  it("passes a zod-valid knobs object straight through, regardless of FEED_DEBUG", async () => {
    const caller = createCaller(authedContext("user-42"));
    const knobs = { pageSize: 5, scoreFloor: 6 };

    await caller.feed.page({ knobs });

    expect(mockedGetFeedPage).toHaveBeenCalledWith("user-42", undefined, knobs);
  });

  it("omitting knobs forwards undefined", async () => {
    const caller = createCaller(authedContext("user-42"));

    await caller.feed.page({});

    expect(mockedGetFeedPage).toHaveBeenCalledWith(
      "user-42",
      undefined,
      undefined,
    );
  });
});

describe("appRouter shape", () => {
  // Phase 5.5 grew this from six procedures to nine (`saves.toggle` was removed — verified dead —
  // and the collection-aware surface took its place); 5.7 adds three — `feed.markSeen` (the
  // receipt half of the feed), `items.wanderNext` (the item page's teaser, and the API's *second*
  // public procedure), and `saves.forItem`; 5.8 adds `items.galleryRail`, the *third* and (for now)
  // last public one. This assertion is deliberately exhaustive rather than a subset check: it's the
  // one thing that makes an accidentally-exported procedure, or one that quietly outlives its
  // last caller, show up as a failing test instead of shipping.
  it("exposes exactly the thirteen SPEC §7 procedures, no leftover post router", () => {
    const def = appRouter._def.procedures;
    expect(Object.keys(def).sort()).toEqual(
      [
        "topics.list",
        "topics.setMine",
        "feed.page",
        "feed.markSeen",
        "items.byId",
        "items.wanderNext",
        "items.galleryRail",
        "saves.collections",
        "saves.saveToCollection",
        "saves.unsave",
        "saves.list",
        "saves.count",
        "saves.forItem",
      ].sort(),
    );
  });
});

describe("feed.markSeen acks against the session's own user", () => {
  beforeEach(() => {
    vi.mocked(mockedMarkSeen).mockReset().mockResolvedValue(undefined);
  });

  it("forwards the session user id and the acked ids", async () => {
    const caller = createCaller(authedContext("user-42"));

    const result = await caller.feed.markSeen({ itemIds: ["a", "b"] });

    expect(result).toEqual({ ok: true });
    const [userId, itemIds, servedAt] =
      vi.mocked(mockedMarkSeen).mock.calls[0]!;
    // The user id comes from the session, never from the input — there is no field for a caller
    // to put one in, and this is the assertion that keeps it that way.
    expect(userId).toBe("user-42");
    expect(itemIds).toEqual(["a", "b"]);
    expect(servedAt).toBeInstanceOf(Date);
  });
});
