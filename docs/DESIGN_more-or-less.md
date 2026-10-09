# More or less — "More of this" / "Less of this" — design

**Written:** 10-08-26 by Fable 5.1, from Ben's question ("what do you think about introducing a
like button? … saving things to lists is not something everyone does") and the chat that followed.
**Status:** mechanics approved in chat 10-08-26; the surfaces' look goes to Claude Design
(`docs/BRIEF_more-or-less.md`); plan `docs/PLAN_more-or-less.md`.

## Why

The feed learns from one act: a **new save** does `LEAST(3.0, weight + 0.5)` on the saved item's
topic (SPEC §9, `bumpTopicWeight` in `db/topics.ts`), and the last 24 saves' aesthetic tags steer
the WILD tier and every item draw. A save is curatorial — pick a list, maybe name one — and most
readers won't, so their weights never move. Two things follow and both are fixed here:

1. **The positive signal is too expensive to give.** A one-tap "More of this" is the same channel
   at a smaller step, with no collection to choose.
2. **There is no negative signal at all.** Nothing lowers a weight except setting a level by hand;
   unsave doesn't decrement (a locked decision, kept). The feed is drift-heavy on purpose — 60 % of
   a page is outside the reader's picks — so the most useful information a reader has is *which
   drift directions were wrong*, and today there is no way to say it. "Less of this" is that.

**Not a like.** A heart is the most loaded gesture of the feeds Ambit is the antidote to. The pair
is about the feed, not the picture; it carries no count, no one else sees it, and it says back
what it did (SPEC §9's rule: an invisible feedback loop reads as random).

## Decisions (with Ben, 10-08-26)

1. **Surfaces: everywhere Save is.** Tile sheet rows, the desktop hover strip, the item screen's
   chrome. The phone item screen's placement is **open, to Claude Design** (the pill can't take two
   more 48 px buttons: 244 → 396 px at 402); until the verdict the phone's one-tap surface is the
   tile sheet.
2. **"Less of this" lowers the topic and keeps it reachable.** It steps a *picked* topic's weight
   down (floor above zero, never deletes a pick) and **cools** the topic as a DRIFT/JUMP
   destination whether or not it is picked. The item itself never returns. Reversible: tap again,
   or Profile → Topics' "Showing less of" → "Warm up".
3. **"More of this" items are findable: an automatic shelf on Saved**, a chip in the filter row
   beside the collections. (Ben chose this over "store it, surface nothing yet".)
4. **Wording:** "More of this" / "Less of this". **Glyphs:** plus / minus; **marked = inverted
   ink**, no new accent job (SPEC §10's seven stand).

Calls made here and stated rather than asked:

- **Steps are smaller than a save's and tunable.** A like comes five or ten times as often as a
  save, so at +0.5 everything a reader looks at would hit the 3.0 cap in a week. `MORE_STEP` and
  `LESS_STEP` are 0.25; a save stays 0.5. They are write-side constants beside `WEIGHT_BUMP`, not
  `FeedKnobs` (that file's own rule); the one *compose-side* knob is `coolStrength` (D3).
- **A "more" on an unpicked topic adopts it**, exactly as a save does (`user_topic` row created at
  `1 + MORE_STEP`). A "less" on an unpicked topic **never creates a pick** — it cools only.
- **Undo is exact.** Each feedback row stores the delta it applied, so clearing it reverses that
  much and no more (a save's unsave does not reverse, and that stays; a reaction undone is "I
  didn't mean that", a different act from list housekeeping).
- **"More" feeds the taste keywords** alongside saves. "Less" does not feed a negative tag list in
  this cut (open, below).
- **A retake clears cools** (it already overwrites weights); `setMine` and `setWeight` leave them.

## D1. Data

Migration **0015_more_or_less**, two tables, nothing backfilled.

```sql
item_feedback (
  user_id        text NOT NULL REFERENCES "user"(id),
  item_id        text NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  verdict        text NOT NULL,            -- 'more' | 'less'
  topic_id       text REFERENCES topic(id),-- the topic charged; NULL for an un-homed item
  weight_applied real NOT NULL DEFAULT 0,  -- exact delta written to user_topic.weight (+/−, after clamp)
  cool_applied   real NOT NULL DEFAULT 1,  -- exact factor written to user_topic_cool.cool (after clamp); 1 = none
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);  -- index idx_item_feedback_user (user_id)

user_topic_cool (
  user_id  text NOT NULL REFERENCES "user"(id),
  topic_id text NOT NULL REFERENCES topic(id),
  cool     real NOT NULL,                  -- (COOL_FLOOR … 1]; a row at 1 is deleted, not kept
  PRIMARY KEY (user_id, topic_id)
);
```

`user_topic` is untouched — a cool is **not** a weight. A `user_topic` row means "a pick" to
`topics.mine`, `hasCompletedOnboarding`, `replaceUserTopicsTx` and Profile → Topics, and a
cooled drift topic must not become one. Separate table, every existing query unchanged.

Constants, in `src/server/db/topics.ts` beside `WEIGHT_BUMP` / `WEIGHT_CAP` (teaching comment:
write-side constants, not knobs — the knobs are compose-side and zod-mirrored in `routers/feed.ts`):

```ts
export const MORE_STEP = 0.25;   // "More of this": user_topic.weight += MORE_STEP, capped at WEIGHT_CAP (3.0)
export const LESS_STEP = 0.25;   // "Less of this": user_topic.weight -= LESS_STEP, floored at WEIGHT_FLOOR — only if a row exists
export const WEIGHT_FLOOR = 0.25; // never 0: a pick stays a pick ("a little" reads back from 0.25)
export const COOL_STEP = 0.6;    // "Less": cool *= COOL_STEP; "More": cool /= COOL_STEP, capped at 1
export const COOL_FLOOR = 0.15;  // four "less" on one topic reach the floor (0.6⁴ = 0.13 → 0.15)
```

## D2. The write — `db/feedback.ts`

```ts
export type Verdict = "more" | "less";
export interface FeedbackEffect {
  verdict: Verdict;
  topicId: string | null;            // what was charged
  weightApplied: number;             // 0 when no user_topic row was touched
  coolApplied: number;               // 1 when no cool row was touched
  isNewPick: boolean;                // "more" created the user_topic row
}
export function setFeedback(userId, itemId, verdict, topicId: string | null): Promise<FeedbackEffect>;
export function clearFeedback(userId, itemId): Promise<FeedbackEffect | null>;   // null = nothing to clear
export function getFeedbackIds(userId): Promise<{ more: string[]; less: string[] }>;
export function getMoreItems(userId): Promise<SavedItemRow[]>;  // the shelf, same projection as getSavedItems
export function getUserTopicCools(userId): Promise<Map<string, number>>;
export function warmTopic(userId, topicId): Promise<boolean>;    // deletes the cool row
export function clearUserCools(tx, userId): Promise<void>;       // the retake
```

`setFeedback` is **one transaction**:

1. `SELECT … FROM item_feedback WHERE (user_id, item_id) FOR UPDATE`. If a row exists with the
   same verdict → no-op, return its stored effect. If it exists with the other verdict → **reverse
   it first** (step 4 with the stored deltas negated/inverted), then continue.
2. **Weight.** `more`: upsert `user_topic` — insert at `1.0 + MORE_STEP`, else
   `LEAST(WEIGHT_CAP, weight + MORE_STEP)`; read old (1.0 for a new row — the baseline
   `bumpTopicWeight` already assumes) and new, `weightApplied = new − old`, `isNewPick = xmax = 0`.
   `less`: `UPDATE … SET weight = GREATEST(WEIGHT_FLOOR, weight − LESS_STEP)` **only where a row
   exists**; no row → `weightApplied = 0`.
3. **Cool.** `less`: upsert `user_topic_cool` — insert at `COOL_STEP`, else
   `GREATEST(COOL_FLOOR, cool * COOL_STEP)`; `coolApplied = new / old` (old = 1 for a new row).
   `more`: if a cool row exists, `cool = LEAST(1, cool / COOL_STEP)`, `coolApplied = new / old`;
   delete the row when it reaches 1; no row → `coolApplied = 1`.
4. **Seen.** `less`: `INSERT INTO seen_item … ON CONFLICT DO NOTHING` (served_at = now). The item
   was almost always served already; this covers the item page reached by a share link or the rail.
5. Write the `item_feedback` row with the applied deltas.

`topicId === null` (un-homed item) skips 2 and 3: the row is still written, `less` still marks it
seen, and the toast says so (D5).

`clearFeedback` reverses: weight `+= −weightApplied` clamped to `[WEIGHT_FLOOR, WEIGHT_CAP]` (a
row created by "more" **stays** as a pick at ~1.0 — the same as a saved-then-unsaved topic today
at 1.5; Profile → Topics turns it off), cool `*= 1 / coolApplied` clamped to `≤ 1` (delete at 1),
`seen_item` untouched (seen is seen), then deletes the feedback row.

**Which topic is charged** is the save rule, verbatim (`routers/saves.ts` L120–124): the slot
topic the card was served under if `isItemInTopic(itemId, topicId)`, else `item.topicId`. The
item screen passes `item.topicId` (it passes nothing to Save today; this cut passes it for both).

## D3. The read — how a cool lands in the feed

`getFeedPage` adds `getUserTopicCools(userId)` to its `Promise.all` (one PK-indexed read, empty
for a stranger). `composePage` takes `cools: ReadonlyMap<string, number>` (default empty) and one
new knob:

```ts
coolStrength: number;   // FeedKnobs; default 1. 0 = ignore cools (today's feed exactly); 2 = squared
```

Applied where a topic is **landed on**, never where it is **started from** (a cooled pick already
has a lowered weight for the start draw):

- `pickDrift` → `hop()`: each neighbour's softmax mass `exp(sim/temp) · grownHopPenalty` is
  multiplied by `coolOf(t) ** coolStrength` (`coolOf` = the map's value or 1).
- `pickJump`: the uniform draw from the bottom half of the start row becomes a `weightedPick` over
  `coolOf(t) ** coolStrength` (all 1 → uniform, so the default is byte-for-byte today's draw).
- CORE, WILD, writing: unchanged.

At the defaults one "less" makes a destination 0.6× as likely, two 0.36×, four 0.15× (the floor).
The `/dev/feed` panel gets the `coolStrength` slider (section Taste, 0–2, step 0.1) and a small
**"Your topics"** readout — `topics.mine` and `topics.cools` merged, top twelve by weight, the cool
shown beside — so the step sizes can be judged by reading, not guessing. Changing `MORE_STEP` /
`LESS_STEP` / `COOL_STEP` after that is a constants edit, not a knob (they are writes).

## D4. API (`routers/feedback.ts`, plus two on `topics`)

| Procedure        | Kind     | Input                                             | Returns                                                                                         |
| ---------------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `feedback.set`   | mutation | `{ itemId, verdict: "more" \| "less", topicId? }` | `{ verdict, drift: { topicLabel, isNew } \| null }` — `isNew` = created the pick (more) / first cool of that topic (less); `NOT_FOUND` on a missing item |
| `feedback.clear` | mutation | `{ itemId }`                                      | `{ cleared: boolean }`                                                                           |
| `feedback.mine`  | query    | —                                                 | `{ more: string[], less: string[] }` — item ids, for marked state (the shape `saves.ids` has)   |
| `feedback.list`  | query    | —                                                 | the "More of this" shelf, `SavedItemRow[]` (same projection as `saves.list`)                    |
| `topics.cools`   | query    | —                                                 | `{ topicId, label, cool }[]` for "Showing less of"                                              |
| `topics.warm`    | mutation | `{ topicId }`                                     | `{ warmed: boolean }` — deletes the cool row                                                     |

All `protectedProcedure`. `topicId` is validated the save way (a client cannot charge an arbitrary
topic). `onboarding.complete`'s transaction calls `clearUserCools` after `replaceUserTopicsTx`.
`getTasteKeywords` unions `saved_item` and `item_feedback WHERE verdict = 'more'` by time
(scan 30, cap 24 as today) — a "more" is a taste statement at least as strong as a save.

## D5. Saying it back — `lib/feedback-toast.ts` (pure)

```ts
export type FeedbackDrift = { topicLabel: string; isNew: boolean } | null;
feedbackToastText("more", { topicLabel: "Cartography", isNew: true })   // "More of this · Now drifting toward Cartography"
feedbackToastText("more", { topicLabel: "Cartography", isNew: false })  // "More of this · Drifting a little more toward Cartography"
feedbackToastText("more", null)                                          // "More of this · Noted"
feedbackToastText("less", { topicLabel: "Cartography", isNew: true })   // "Less of this · Drifting away from Cartography"
feedbackToastText("less", { topicLabel: "Cartography", isNew: false })  // "Less of this · Drifting further from Cartography"
feedbackToastText("less", null)                                          // "Less of this · You won't see it again"
UNDONE_TOAST                                                             // "Undone"
```

## D6. Surfaces (mechanics here; look from Claude Design)

- **Tile sheet** (`item-sheet.tsx`): two rows beside Share — "More of this" (+), "Less of this"
  (−), marked state drawn per the export; tapping a marked row clears. The sheet closes, the toast
  rises (`FeedScreen`'s), `feedback.mine` and `saves`-adjacent queries invalidate. A "less" also
  **removes the tile from the page** (filter it out of the rendered cards — it is seen now, and
  leaving it there contradicts the toast).
- **Hover strip** (`tile-actions.tsx`): two 32 px glass squares beside the bookmark, optimistic
  against `feedback.mine` exactly as the bookmark is against `saves.ids` (`onMutate` cancel / set /
  rollback). `onPointerDown={stop}` like every strip control. The chip shrinks to make room.
- **Item screen, desktop** (`rail-toolbar.tsx`): two `RailButton`s with `pressed` = marked, placed
  per the export; `item-screen.tsx` passes `topicId: current.topicId` (and starts passing it to
  Save too). A "less" on the item screen advances the rail by one (`advance(1)`) when a next page
  exists, else nothing — the toast is the acknowledgement.
- **Item screen, phone:** **the export decides** (brief §4). Whatever it is, it is a control inside
  `ItemScreen` driven by the same `feedback.set` call and marked by `feedback.mine`.
- **Keyboard** (item screen): `+` / `=` → more, `−` → less, in the `useEffectEvent` handler beside
  `M`; both toggle. `?` is not touched.
- **Saved** (`collection-chips.tsx`, `saved-screen.tsx`): a "More of this" chip in the filter row →
  `/saved?shelf=more`, rendering `feedback.list` through the same `SavedTile` wall; the badge is a
  + that clears (optimistic filter, toast "Undone"). The title's count stays `saves.count`.
- **Profile → Topics** (`topics-screen.tsx`): a "Showing less of" section under the grouped mix,
  rows "‹label› — Warm up", from `topics.cools`; hidden when empty. The level control already
  reads a stepped weight back as a level (0.25 → "a little").
- **Signed out:** every control opens the auth sheet, as Save does. The strip is hidden signed out
  already.

## D7. Testing

- `db/feedback.integration.test.ts` — set more / less, flip, clear: exact deltas, cap and floor,
  a "less" on an unpicked topic creates no `user_topic` row but a cool row, `seen_item` written on
  less, un-homed item writes the row with no topic effect, idempotent re-set, `warmTopic`,
  `clearUserCools`.
- `services/feed.test.ts` — `composePage` with a cool map: on the 4-topic rotated graph a cooled
  neighbour's landing share falls (more than 0.05, over ≥ 400 slots); `coolStrength: 0` reproduces
  the cool-less composition **byte for byte** (same rng seed, same page); `pickJump` with all cools
  at 1 equals the uniform draw.
- `routers.integration.test.ts` — the feedback router: slot-topic rule, un-homed, flip returns the
  new drift, `clear` on nothing is `{ cleared: false }`, `topics.cools` / `warm`, a retake clears
  cools, `getTasteKeywords` includes a "more" item's tags, UNAUTHORIZED without a session.
- `lib/feedback-toast.test.ts` — the seven strings.
- `routers.test.ts` — `coolStrength` forwarded like every knob; `feed-screen.test.tsx` still pins
  the `{}` input.
- Component tests beside the existing ones (`item-sheet`, `tile-actions`, `topics-screen`,
  `saved-screen`): rows render, marked state, clear path, optimistic rollback.
- e2e: `feed.spec.ts` long-press → "More of this" → toast; `desktop.spec.ts` strip + / − and the
  rail; `saved.spec.ts` the shelf chip; `profile.spec.ts` (or `topics`) "Showing less of" → Warm
  up; `item.spec.ts` the phone placement once decided. Then the **CI-shape run** (the feed engine
  moved): fresh Postgres, `db:migrate && db:seed && build && E2E_PROD=1 … --workers 1`.

## What this leaves open

- A **negative tag list** from "less" items (the mirror of taste keywords) — not in this cut; the
  cool is per topic, and a tag penalty would need its own knob and readout first.
- **Decay.** Weights and cools are still permanent until touched. If `/dev/feed`'s readout shows
  everything pinned at the cap after a month of use, a slow decay toward 1.0 is the next lever.
- **Group size.** Picked topics are still written at 1.0 each (CLAUDE.md's open item); "more"
  doesn't change that arithmetic.
- **Item opens as an implicit signal.** Free and strong, but invisible to the reader; stays out
  until the explicit pair has been read on `/dev/feed`.

