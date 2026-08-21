// Integration tests for getFeedPage (SPEC §7, §9) against a real Postgres — the seen-tracking,
// cursor-stability, and exhaustion behaviors can't be verified against pure fixtures the way
// feed.test.ts's composePage/pickCore/etc. tests can, since they depend on the actual
// getTopicPools/markSeen round trip.
//
// **These tests ack.** As of 5.7 `getFeedPage` marks nothing seen — the client does, on receipt
// (`feed.markSeen`). So a sequential-paging test has to play the client's part: fetch, ack, then
// ask for the next page. The `ack()` helper below is that half of the contract, and a test that
// forgets it will simply be served the same items again, which is correct behavior, not a bug.
//
// Self-skips whenever DATABASE_URL isn't set (same pattern as db/items.integration.test.ts); run
// locally with `docker compose up -d` then `bun run test`.
//
// Fixture shape, and why every non-exhausted page below has exactly 3 cards, not `pageSize`
// (default 12): every fixture item shares one throwaway topic, and the default `topicCap` is 3
// (SPEC §9.3) — composePage caps at 3 cards from a single topic per page regardless of pageSize,
// then spends the rest of its guard budget hitting that cap on every further draw. That's real,
// intended behavior (not a workaround), and it conveniently makes exhaustion reachable in a small,
// fast fixture: 30 items / 3-per-page = exactly 10 pages before the 11th comes back empty.
import { and, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getFeedPage, type FeedPage } from "./feed";

describe.skipIf(!process.env.DATABASE_URL)("getFeedPage (integration)", () => {
  const topicId = `test-feed-topic-${nanoid(8)}`;
  const userId = `test-feed-user-${nanoid(8)}`;
  const userEmail = `test-feed-${nanoid(8)}@example.com`;
  const sourceIdPrefix = `test-feed-${nanoid(8)}-`;
  const ITEM_COUNT = 30;
  const CARDS_PER_PAGE = 3; // topicCap, given every fixture item lives in one topic

  /** Stands in for the client's receipt ack — what `feed.markSeen` does in the real app. */
  const ack = async (page: FeedPage) => {
    const { markSeen } = await import("~/server/db/feed");
    await markSeen(
      userId,
      page.cards.map((c) => c.item.id),
      new Date(),
    );
  };

  beforeAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, topic, user, userTopic } = await import("~/server/db/schema");

    await db.insert(topic).values({
      id: topicId,
      label: "Test feed topic",
      seedQueries: { wikipedia: [], met: [], aic: [], cma: [], wellcome: [] },
    });
    await db.insert(user).values({
      id: userId,
      name: "Test feed user",
      email: userEmail,
      emailVerified: false,
    });
    await db.insert(userTopic).values({ userId, topicId, weight: 1 });
    // Alternate two sources evenly so the source-adjacency constraint never has to relax within a
    // 3-card page (keeps this fixture's behavior fully deterministic in shape, if not in which
    // exact items land where — the item *pick* itself is still weighted-random).
    await db.insert(item).values(
      Array.from({ length: ITEM_COUNT }, (_, i) => ({
        source: i % 2 === 0 ? "wikipedia" : "met",
        sourceId: `${sourceIdPrefix}${i}`,
        type: "article" as const,
        title: `Integration feed item ${i}`,
        summary: "A summary long enough to be unremarkable.",
        sourceUrl: `https://example.com/${sourceIdPrefix}${i}`,
        topicId,
        curationScore: 5 + (i % 5),
        aestheticTags: [],
      })),
    );
  });

  // Every `it` below shares the same 30-item pool for the same `userId` — reset seen_item after
  // each test so a test's own markSeen calls never bleed into the next test's expectations (each
  // test wants to reason about the full 30-item pool from a clean slate, not "whatever's left
  // over from the previous test in this file").
  afterEach(async () => {
    const { db } = await import("~/server/db/client");
    const { seenItem } = await import("~/server/db/schema");
    await db.delete(seenItem).where(eq(seenItem.userId, userId));
  });

  afterAll(async () => {
    const { db } = await import("~/server/db/client");
    const { item, topic, user, userTopic, seenItem } =
      await import("~/server/db/schema");
    await db.delete(seenItem).where(eq(seenItem.userId, userId));
    await db.delete(userTopic).where(eq(userTopic.userId, userId));
    await db
      .delete(item)
      .where(
        and(
          eq(item.topicId, topicId),
          like(item.sourceId, `${sourceIdPrefix}%`),
        ),
      );
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(topic).where(eq(topic.id, topicId));
  });

  it("composes a page from real rows, all drawn from the user's own topic", async () => {
    const page = await getFeedPage(userId);
    expect(page.cards).toHaveLength(CARDS_PER_PAGE);
    // Every card lands on our one fixture topic regardless of tier: it's the only topic in
    // `weights`, and — since this throwaway topic id has no row in the real, checked-in topic
    // graph — DRIFT/JUMP both hit their own "no row" fallback and stay on the start topic too.
    expect(page.cards.every((c) => c.topicId === topicId)).toBe(true);
    expect(page.nextCursor).toBeDefined();
  });

  it("excludes an acked page's items from the very next page", async () => {
    const page0 = await getFeedPage(userId);
    const page0Ids = new Set(page0.cards.map((c) => c.item.id));
    await ack(page0);

    const page1 = await getFeedPage(userId, page0.nextCursor);
    const page1Ids = page1.cards.map((c) => c.item.id);

    expect(page1).toHaveProperty("cards");
    expect(page1Ids).toHaveLength(CARDS_PER_PAGE);
    for (const id of page1Ids) expect(page0Ids.has(id)).toBe(false);
  });

  // The load-bearing one for 5.7's receipt move: acks now land *after* the cursor anchor they
  // belong to, where they used to land exactly on it. If that broke the exclusion query, this is
  // where it would show — a reader who pops back to the feed would be handed a different page than
  // the one they left.
  it("refetching a cursor returns the identical page, even after its items were acked", async () => {
    const page0 = await getFeedPage(userId);
    await ack(page0);
    const cursorForPage1 = page0.nextCursor!;

    const firstFetch = await getFeedPage(userId, cursorForPage1);
    await ack(firstFetch);
    // firstFetch's own items are now in seen_item, timestamped later than this cursor's anchor —
    // refetching the *same* cursor must still reproduce them, because the exclusion query is
    // frozen at the cursor's own moment, not "whatever's in seen_item right now."
    const secondFetch = await getFeedPage(userId, cursorForPage1);

    expect(secondFetch.cards.map((c) => c.item.id)).toEqual(
      firstFetch.cards.map((c) => c.item.id),
    );
  });

  it("exhausts cleanly: every item eventually serves exactly once, then an empty page", async () => {
    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let exhausted = false;

    for (let i = 0; i < ITEM_COUNT / CARDS_PER_PAGE + 2; i++) {
      const page = await getFeedPage(userId, cursor);
      if (page.cards.length === 0) {
        expect(page.nextCursor).toBeUndefined();
        exhausted = true;
        break;
      }
      for (const c of page.cards) {
        expect(seenIds.has(c.item.id)).toBe(false); // never repeats across pages
        seenIds.add(c.item.id);
      }
      await ack(page); // the client's half of the loop — without it, page 2 repeats page 1
      cursor = page.nextCursor;
    }

    expect(exhausted).toBe(true);
    expect(seenIds.size).toBe(ITEM_COUNT);
  });

  it("degrades gracefully to uniform cold-start weights for a user with no user_topic rows", async () => {
    const { db } = await import("~/server/db/client");
    const { user: userTable } = await import("~/server/db/schema");
    const coldUserId = `test-feed-cold-${nanoid(8)}`;
    await db.insert(userTable).values({
      id: coldUserId,
      name: "Test cold-start user",
      email: `test-feed-cold-${nanoid(8)}@example.com`,
      emailVerified: false,
    });

    try {
      // No user_topic rows for this user at all — must not throw, and (since this user's
      // "weights" cover all sixteen real topics, none of which is our throwaway fixture topic)
      // is very unlikely to draw from the fixture topic, but the real assertion is just that it
      // degrades gracefully instead of erroring or hanging.
      const page = await getFeedPage(coldUserId);
      expect(page).toHaveProperty("cards");
    } finally {
      const { seenItem } = await import("~/server/db/schema");
      await db.delete(seenItem).where(eq(seenItem.userId, coldUserId));
      await db.delete(userTable).where(eq(userTable.id, coldUserId));
    }
  });
});
