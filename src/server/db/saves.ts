// Repository for `saved_item` (SPEC §6.3, §3.4). Typed stub — real implementation lands in
// Phase 4.2 alongside the `saves.toggle`/`saves.list` tRPC procedures that call it. Every function
// here is user-scoped by design: `saveItem`/`unsaveItem`/`getSavedItems` all take `userId`
// explicitly so a caller can't accidentally query across users (SPEC §11's authorization rule).
import type { Item } from "~/server/db/items";

export function saveItem(_userId: string, _itemId: string): Promise<void> {
  throw new Error("saveItem: not implemented until Phase 4.2");
}

export function unsaveItem(_userId: string, _itemId: string): Promise<void> {
  throw new Error("unsaveItem: not implemented until Phase 4.2");
}

export function getSavedItems(_userId: string): Promise<Item[]> {
  throw new Error("getSavedItems: not implemented until Phase 4.2");
}
