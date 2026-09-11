// Fixture writer for the DB-backed suites (09-11-26, docs/PLAN_feed-on-membership.md T2).
//
// Since the feed moved onto `item_topic` an item with a `topicId` and no membership row is in no
// pool at all — the display topic is what the item PAGE shows, membership is what the FEED draws.
// Every real writer (ingest's `upsertItem` + `addItemTopics`, `promote:topics`) writes both;
// the suites used to write only the column, which was fine while the feed read only the column.
// One helper so no fixture can drift back to that. Not for production code: the ingest has its
// own writers with their own conflict rules (items.ts).
//
// `db` is passed in rather than imported: CI's unit-test step runs with no env at all, and a
// static import of ./client (which reads `~/env`) would crash the run before a test executes.
import type { db as client } from "./client";
import { item, itemTopic, type ItemTopicOrigin } from "./schema";
import type { Item } from "./items";

// `import type` is erased at compile time: it borrows the client's *type* without ever loading
// the module, so this file stays safe to import from a suite that runs with no env.
type Db = typeof client;
// Drizzle's insert shape for `item` — what `db.insert(item).values(...)` accepts, optional
// columns (defaults, nullable fields) included.
type NewItem = typeof item.$inferInsert;

/**
 * Insert `rows` and, for each one with a non-null `topicId`, an `item_topic` row for that topic.
 * Returns the full inserted rows (what `.returning()` gives), in insertion order, so callers that
 * destructure ids or rows keep working.
 */
export async function insertHomedItems(
  db: Db,
  rows: NewItem[],
  origin: ItemTopicOrigin = "seed",
): Promise<Item[]> {
  if (rows.length === 0) return [];
  const inserted = await db.insert(item).values(rows).returning();
  const memberships = inserted
    // A *type predicate* (`r is …`): the filter's callback tells TypeScript that every row it
    // keeps has a string `topicId`, so the `.map` below needs no `!` to get past `string | null`.
    .filter((r): r is Item & { topicId: string } => r.topicId !== null)
    .map((r) => ({ itemId: r.id, topicId: r.topicId, origin }));
  if (memberships.length > 0) {
    await db.insert(itemTopic).values(memberships).onConflictDoNothing();
  }
  return inserted;
}
