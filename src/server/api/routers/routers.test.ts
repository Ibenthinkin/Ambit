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

const { getFeedPage: mockedGetFeedPage } =
  await import("~/server/services/feed");

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
});

describe("items.byId is public", () => {
  it("a null session never yields UNAUTHORIZED — it reaches the resolver", async () => {
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
  // Phase 5.5 grew this from six procedures to nine: `saves.toggle` was removed (verified dead —
  // nothing outside these tests ever called it) and the collection-aware surface took its place.
  // This assertion is deliberately exhaustive rather than a subset check: it's the one thing that
  // makes an accidentally-exported procedure, or one that quietly outlives its last caller, show
  // up as a failing test instead of shipping.
  it("exposes exactly the nine SPEC §7 procedures, no leftover post router", () => {
    const def = appRouter._def.procedures;
    expect(Object.keys(def).sort()).toEqual(
      [
        "topics.list",
        "topics.setMine",
        "feed.page",
        "items.byId",
        "saves.collections",
        "saves.saveToCollection",
        "saves.unsave",
        "saves.list",
        "saves.count",
      ].sort(),
    );
  });
});
