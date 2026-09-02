# Phase 6.3 — Blog source adapters: design

**Status: approved by Ben, 08-25-26.** This is the output of the design session `docs/BUILD_PLAN.md`
6.3 was gated on. It settles the seven open questions recorded there and is the input to the
6.3 implementation plan (`docs/PHASE6_PLAN_6.3.md`, to be written next). The session's working
notes and the probes behind every number here are in `docs/PHASE6_DESIGN_HANDOFF_6.3.md`.

Nothing in this document is implemented yet.

---

## 1. What is being built

A **second adapter shape** — corpus-walk — implemented in-repo for the first time; a **designated-blog
registry**; the first blog adapter, **doorofperception.com**, over its WordPress REST API; a
**topic-classification mode** in the ingest-time curator; the **link-out treatment** that makes a blog
item read as a link preview; and the **retirement of doorofperception from ambit-archive**, so the
blog's images appear in Ambit with their credit and link, or not at all.

Done means: doorofperception is live end to end as link cards with credit and link-out; no article
text is rendered by Ambit for any blog item, and a test proves it; and zero `archive` rows that came
from doorofperception remain.

## 2. The rights posture this must honour (unchanged; from the 08-20-26 Ambit-Admin decision)

A blog item is a **link card** in the shape of a social link preview: image + Ambit-shown blurb +
visible `from: <blog>` credit + a **prominent link to the original**. Never a republished article.
Full article text is used at ingest only and never stored for display. **No fair-use claim
anywhere**; license strings stay honest; removal on request is standing policy; the point of the
link-out is to drive readers *to* the blog. Tenable because Ambit is invite-only and non-monetized.

## 3. Decisions (the seven questions, answered)

| # | Question (BUILD_PLAN 6.3) | Decision |
|---|---|---|
| D1 | Items per post; flooding | **One item per post, the blog's own featured image.** 390 items from doorofperception (~3% of the corpus). The other images of a post never become items. |
| D3 | Adapter interface | **Corpus-walk, as a sibling contract.** `CorpusWalkAdapter { walk(cursor), toItem }` next to `SourceAdapter`, which stays byte-identical. Ambit-Admin's *Ecosystem Architecture* already defines this shape for loupe; this is its first implementation, and loupe inherits it. |
| D4 | Topic without seed queries | **LLM classification with an honest reject**, folded into the curator's existing per-item call as a mode. `null` → dropped, counted, printed. Never force-fitted. The yield is **measured over all 390 before any write**. **Reversed in part 09-02-26** (`docs/DESIGN_topic-vocabulary-growth.md` §4, Cut 1): *never force-fitted* stands and got cheaper — classify returns an **array** of honest topics, possibly empty; *null → dropped* is gone — an un-homed item is **stored** with zero topic rows and its tags intact. |
| D5 | Where the blurb lives | **One text, in `summary`; `body` is always `null` for blog items.** Blog items are `type: "image"`, so the reader view is unreachable by construction; a test asserts the invariant. No migration, no new column, no new type. |
| Q5 | Image hosting | **Already answered by Phase 5's image proxy** (`/api/img/[itemId]`, server-side fetch by item id, no referer). Only the cache layer is open, and it belongs to 7.3. |
| Q6 | Scrape etiquette | **A policy, enforced in code** — §8. robots.txt checked before designation and on every run; a machine-readable refusal aborts the walk. |
| Q7 | Curation | **Yes — blog items go through the structural floor and the LLM curator like everything else.** No special cases. |
| D2 | Archive overlap (owned by 6.3) | **ambit-archive stops serving doorofperception; Ambit deletes the rows that came from there.** One rights posture, no exceptions. Ships inside this plan, ordered *after* the blog is live. |

Rejected alternatives and the reasons are in the handoff doc §5–§6; they are not re-argued here.

## 4. Contracts and registries

### 4.1 `CorpusWalkAdapter` — `src/server/services/sources/types.ts`

```ts
export interface WalkPage<Raw> {
  raw: Raw[];
  /** Absent when the corpus is exhausted. */
  next?: string;
}

export interface CorpusWalkAdapter<Raw = unknown> {
  source: SourceId;
  /** Opaque, adapter-defined cursor — a WP page number, an RSS offset, a Tumblr start index.
   *  Ingest never inspects it. Must fail fast on 401/403: a refusal is never retried. */
  walk(cursor?: string, opts?: FetchOpts): Promise<WalkPage<Raw>>;
  /** Pure and synchronous, fixture-tested — the same rule as search adapters. */
  toItem(raw: Raw): NormalizedItem;
}
```

`SourceAdapter` is untouched. It is a cross-service agreement (ambit-archive built to it verbatim);
adding a sibling type in the same file changes nothing it promises.

### 4.2 Registries

- `sources/index.ts` exports **`walkers: Record<WalkSourceId, CorpusWalkAdapter>`** beside
  `adapters` (`WalkSourceId = (typeof WALK_SOURCES)[number]`, below), with a compile-time
  guarantee that no id appears in both.
- `SourceId` gains `"doorofperception"`.
- `src/server/config/topics.ts` gains a third tier, **`WALK_SOURCES`**, next to `V1_SOURCES` and
  `TRIAL_SOURCES`. Walk sources owe **no** seed cells: `SeedQueries` does not mention them, and
  `topics.test.ts`'s "names only known sources" learns the tier so a cell for a walk source is a
  type error rather than merely absent.
- **The designated-blog registry** — `src/server/config/blogs.ts`, one entry per blog:

  ```ts
  {
    id: "doorofperception",
    label: "Door of Perception",
    baseUrl: "https://doorofperception.com",
    license: "Rights retained by original authors — displayed with credit and link",
    robotsCheckedOn: "2026-08-25",
    walk: "wp-rest",
  }
  ```

  `label` feeds `SOURCE_LABELS` (`src/lib/source-label.ts`) so the credit line never renders the
  fallback "Doorofperception"; `license` is the one honest string every blog shares;
  `robotsCheckedOn` is the human check made into data. `isBlogSource(source)` reads this
  registry and is what display code keys on. No other knobs until blog #2 needs one.

### 4.3 Fail-fast in `fetchJson`

`http.ts`'s `fetchJson` retries every non-2xx (deliberately — the Met's rate limit is a 403). A
walker hitting 401/403 must stop. `fetchJson` gets an opt-in **`noRetryOn: number[]`** rather than
a second helper. This is also the loupe adapter requirement already on record in Ambit-Admin, landed
once for both.

## 5. The doorofperception adapter — `sources/doorofperception.ts`

**Facts it is built on (verified 08-25-26):** WordPress; `GET /wp-json/wp/v2/posts` → 200,
`x-wp-total: 390`; `robots.txt` is `User-agent: * / Disallow:` (allow-all), no AI block list;
`featured_media` present on 389/390 posts; `?_embed=wp:featuredmedia` returns the hero's
`source_url` and dimensions in the same call; `excerpt.rendered` is a written paragraph (min 47 ·
p10 93 · p50 130 · max 287 chars; 3 under 60). Featured images are a purpose-made **~800 px
"Featured" crop** — fine for tiles and the item hero, not gallery-grade.

**Walk.** `GET {baseUrl}/wp-json/wp/v2/posts?per_page=100&page=N&_embed=wp:featuredmedia&_fields=…`
via `fetchJson` with the shared `USER_AGENT`, a ≥500 ms politeness delay, and `noRetryOn: [401, 403]`.
Cursor = page number as a string; exhausted when `page ≥ x-wp-totalpages` (read on page 1).
390 posts = 4 requests. Tag names come from one `/wp/v2/tags?per_page=100` call, cached for the
walk. Nothing hits `/media` per post.

**`toItem()`:**

| field | value |
|---|---|
| `source` / `sourceId` | `"doorofperception"` / the post **slug** (stable across edits; the numeric id is not relied on) |
| `type` | `"image"`, always |
| `title` | `title.rendered`: `<br>` → space, HTML stripped, entities decoded |
| `summary` | `excerpt.rendered`: HTML stripped, entities decoded, trimmed |
| `body` | **`null`, always** |
| `imageUrl` | `_embedded["wp:featuredmedia"][0].source_url` |
| `sourceUrl` | `link` — the post permalink |
| `attribution` | the registry `label` |
| `license` | the registry `license` |
| `tags` | resolved WP tag names, lowercased |

The strip-and-decode helper lives in `sources/normalize.ts` (Wikipedia has the same need). It
produces plain text only and never renders anything.

**Edge cases, decided:** no `featured_media` → `toItem` throws, and the per-item error path counts it
(never "offered: 0"). Summary under 60 chars → the structural floor's `thin-summary` drops it. The
320×320 GIF nav post → the curator scores it and it will not survive. **Nothing is special-cased
for this blog.**

**Tests:** `__fixtures__/doorofperception.json` — two real posts plus the no-featured-image case —
exercising `toItem` the way the other ten adapters are tested, plus cursor arithmetic (`next`
present on page 1 of 4, absent on page 4).

## 6. Ingest pipeline and curator — `scripts/ingest.ts`, `curator.ts`

**Walk lane.** `processWalker(sourceId)` beside `processSource`: loop `walk(cursor)` until no
`next`, `toItem` each raw, collect `NormalizedItem`s with `{walked, offered, errors}` accounting (a
failed page is an error, never "zero posts"). Walkers run in the same `Promise.allSettled` as the
search sources. Walk items **bypass `resolveCollisions`** — with no topics there is nothing to
collide on — and are concatenated with the search winners at **step 3**, so the existing-row skip,
floor, curator, upsert and `--dry-run` remain one shared path. `--source <walker>` selects a walker
as it selects a searcher; `--topic` does not apply to walkers and says so; `--quota N` bounds the
walk to N collected items so a structural check stays cheap.

**Classification as a curator mode.** `curateItems(items, { classify: true })` → `scoreItem` uses
`CLASSIFY_PROMPT`, a variant of `CURATOR_PROMPT` that lists the 16 topic ids with labels and asks
for `{"score", "tags", "topic": "<id>" | null}` — "null if none is an honest home." Same image
bytes, same model, `temperature 0.2`. The cache key gains the mode (`|classify`), so museum entries
and `PROMPT_VERSION` are untouched. `parseCuratorResponse` validates `topic` against the real id
set — an invented id becomes `null`, never a foreign-key error 300 items in. `CuratedItem` gains
`topicId: string | null`; the upsert loop takes a walk item's classified topic; a null is
**dropped, counted, and printed**.

> **Revised 09-02-26 (Cut 1).** `topic` became `topics: string[]`, "null" became "an empty list", and the drop became a store. `CuratedItem.topics`, `item_topic`, and the un-homed tag histogram replaced the sentence "a null is dropped, counted, and printed" — see the vocabulary-growth design §6–§7. The measurement run (`--dry-run`) still exists and now also prints what the un-homed items are about.

**Summary output gains** a per-walker row (`walked · offered · errors · no-topic`) and a per-topic
histogram of the walk's classifications including the null bucket. Therefore
`bun run ingest --source doorofperception --dry-run` **is** D4's measurement run: the plan's first
executable step runs it and records the yield before any write.

**Re-crawl and removal.** Re-runs are cheap and safe already: the existing-row skip runs before
curation, and `upsertItem`'s refresh never touches `topicId`, `curationScore` or `aestheticTags`.
A post that vanishes from the blog is the remove-on-request case: for a *complete* walk (no
`--quota`, zero errors) the lane prints the DB rows it did not see, and deletes them only under an
explicit **`--prune`** flag — never by default. Deletion removes `seen_item` and `saved_item` rows
first (neither FK cascades) in one transaction. Cadence: the ordinary ingest cron.

## 7. Display

Three surfaces already show a blog item correctly with no change: the feed tile (image only, by
design), the gallery, and the credit line (`from: Door of Perception →`, generalized in 5.7).

**Added — the prominent link-out.** A `LinkOutRow` under the blurb on `ImageItemBody` and in the
gallery details sheet: a full-width tappable row, *"Read the post on Door of Perception ↗"*,
`target="_blank" rel="noopener"`, styled on the pill toolbar's row idiom so it reads as a link
preview's call-to-action rather than a footnote. Rendered when `isBlogSource(item.source)`. The
design handoff has no blog prototype; this is the one element with no `.dc.html` to defer to, and
it borrows an existing idiom rather than inventing one.

**A general fix blogs expose.** The item page prints `attribution ?? sourceLabel(source)` and then
`from: sourceLabel(source)` — identical strings for a blog. The attribution line is skipped when it
equals the source label. Honest for every source.

**The invariant, as a test** (`source-invariants.test.ts`): for every registered walker, `toItem` on
its fixture yields `type: "image"` and `body: null`; plus an integration assertion that no `item`
row with a blog source has a non-null `body`. D5's "never a reader surface", made into something CI
refuses.

## 8. Scrape etiquette — policy

Recorded in `docs/source-candidates.md` and enforced by the registry and the walker:

1. **robots.txt is checked before a blog is designated and re-checked on every ingest run.** The
   walker fetches `/robots.txt` first; `Disallow: /` for `*` or for our agent **aborts the walk and
   reports it**. Precedent: artvee (cut 08-20-26) and **50watts.com (cut 08-25-26 —
   `User-agent: * / Disallow: /`, and its REST API 403s regardless of UA)**.
2. Identify honestly: the shared `USER_AGENT`, which names Ambit and a contact.
3. Rate: ≥500 ms between requests, sequential per host — the `processSource` shape.
4. Cadence: the ordinary ingest cron. No separate crawl schedule.
5. Removal on request: `--prune` for posts the blog has removed; for a named item, a manual
   `DELETE` with the FK order documented in the walkthrough. A suspended-items mechanism is
   deliberately **not** built — YAGNI for an invite-only app.

## 9. Archive retirement (D2)

Uses mechanisms ambit-archive already has. Its disk connector records each file's absolute path as
provenance `externalId`; its sweep tombstones provenance a complete run didn't see; items with no
live provenance are withdrawn and excluded from `/search` and hydration. So the archive side is
**configuration, not code**: stop scanning `storage/sources/doorofperception/` (the plan reads how
the disk connector's roots are configured), run a complete sync **attended**, and let the sweep
withdraw the ~11,300 items. `MAX_DROP_RATIO = 0.2` will block an unattended sweep at an 85% drop —
by design; the plan uses whatever attended override `sweep.ts` provides and treats the guard
tripping as the archive working correctly. Files stay on disk; `index.csv` is untouched. The run
**writes the withdrawn item ids to a file**.

Ambit's side: `scripts/retire-source-rows.ts --source archive --ids <file> --confirm` — deletes
`seen_item` and `saved_item` rows first, then the items, in one transaction, printing counts.
Precise by id, so saves on the archive's non-doorofperception items survive.

**Ordering:** blog live → verified in the feed → retire. Never a window with neither.

**Governance:** D2 and the corpus-walk contract are recorded in Ambit-Admin's log *before* the
archive change lands, per its own rule that contract changes are recorded there first.

## 10. Testing, by layer

- **Unit:** `toItem` fixtures + cursor arithmetic; `normalize.ts` strip/decode;
  `parseCuratorResponse` with `topic` (valid id · invented id → null · absent → null); the walk-lane
  bookkeeping and the `--prune` decision extracted into `ingest-plan.ts` as pure functions; the §7
  invariant; registry ⇄ `SOURCE_LABELS` ⇄ `SourceId` ⇄ `WALK_SOURCES` agreement.
- **Integration:** a seeded blog item draws in the feed with zero source-adjacency violations and
  appears under `FEED_DEBUG`; the `body IS NULL` assertion.
- **Component:** `LinkOutRow` renders for a blog source and not for `met`; attribution-line dedupe.
- **E2E (one):** the item page for a blog item shows the credit and the link-out, and no reader view
  exists for it.

## 11. Documents the plan updates

- `SPEC.md` §6.1 — replace the "planned, undesigned" blog paragraph with the family as built plus a
  `doorofperception` entry in the style of the 6.2 entries; §6.4 — two lanes and `--prune`; §15 —
  close Q5 to 7.3's cache layer, note the 800 px hero.
- `docs/BUILD_PLAN.md` — 6.3 tick with the done-bar as met.
- `docs/source-candidates.md` — 50watts **cut**; Public Domain Review (Gatsby, `/rss.xml`) and
  thingsorganizedneatly (Tumblr legacy JSON API) as the next two with their walk flavours; the §8
  policy.
- `CLAUDE.md` — corpus-walk is now implemented in-repo; the blog registry.
- `sources/types.ts` header comment.
- Ambit-Admin: `log.md` entry (D2, corpus-walk contract); `Roadmap & Backlog.md` (loupe hookup now
  has its contract).

## 12. Plan order

contracts & registry → adapter + fixtures → curator classify mode → ingest walk lane →
**histogram dry-run, yield recorded** → real ingest → display → invariant + e2e → SPEC/docs →
Ambit-Admin entry → archive retirement → walkthrough.

## 13. Out of scope, stated

- Blog #2. PDR and Tumblr are named as next, with their walk flavours; neither is built.
- An image cache in front of `/api/img` (7.3).
- Expanding the topic set to give psychedelia/consciousness posts a home (a separate offline graph
  recompute; the null-topic histogram from this phase is its input).
- Full-resolution heroes from `index.csv`. The 800 px featured crop ships; the mapping to originals
  is preserved for later.
- A suspended-items list.
