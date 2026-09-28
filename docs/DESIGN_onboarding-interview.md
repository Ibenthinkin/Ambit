# Design: onboarding v2 — the re-cut, reader-facing weights, and the interview

_09-28-26. Ben's brief: the umbrella groups are "very bad — mostly way too vague, and include things
together that logically should not be"; onboarding should be "something special, but most of all
good"; a reader should be able to pick from a list themselves or, if unsure, be asked meaningful
questions about their aesthetic preferences — this picture or that one, do you like fashion, do you
like engineering, do you like images that challenge you — and end on a list of what Ambit thinks
they'll like, with every entry switchable off or reweighted, then and always. This is BUILD_PLAN's
**8.4** slot, reshaped: no LLM in v1._

## Decisions (with Ben, 09-28-26)

1. **Hand-authored, no LLM in v1.** Every question carries an explicit mapping to topics; the
   engine is deterministic and unit-testable. A back-and-forth LLM interview is wanted **later**,
   as a further door, and must not need a different engine — hence the answer log (D6).
2. **The interview refines, it is not a separate door.** It reads what the reader picked from the
   list (possibly nothing) and does three things: _seeds weights_ (cars more than machines?),
   _splits near neighbours_ (Star Wars vs Star Trek — "very different fandoms"), and _offers
   adjacent topics_ the reader didn't name ("you said architecture — brutalist too?"). It turns
   topics **on**, mostly; it never removes one.
3. **Everyone gets a short interview, with an exit.** Fixed budget (ten questions), adaptive to the
   picks, "skip to my summary" always visible.
4. **Three reader-facing levels over the real weight** — _a little · some · a lot_ — and off. The
   engine and the save nudge keep writing finer numbers underneath; the level shown is the band.
   Setting a level by hand snaps the number.
5. **Off means removed.** No `user_topic` row, so DRIFT and JUMP can still bring the topic. A hard
   "never show me this" is a separate, later feature (out of scope, wanted).
6. **Answers are stored.** A log of Ambit's questions and the reader's answers, never demographics
   (the 09-10-26 decision stands). Weights are the state; the log never rewrites the state on its
   own; a retired question's answers are kept and not re-applied.
7. **The list is two-level, and re-cut.** A group shows its members on request; taking the group
   takes all, taking a member takes one. The cut is drafted here for Ben's verdict (§1), like a
   topic-proposals file.
8. **Faces: hand-picked where picked, corpus otherwise**, with a dev page to override. A pair
   question offers _either_ and _neither_ as well as A or B.
9. **Two plans, one spec.** Foundation (the cut, the two-level picker, levels, the summary), then
   the interview. The first ships on its own and is already a better onboarding.

A note on scope Ben gave as an FYI: work on ingesting and serving **text** is in flight and may or
may not be kept. Nothing here assumes an item type — questions are about topics, and topics already
cover articles. Only faces are picture-only, and a topic with no picture gets a label card, which
CI needs anyway.

---

## 1. The re-cut

**Rules.** A group is one idea a reader would say out loud. A singleton is a group (Fungi, Maps,
Humor, Cars). Nothing is filed "for want of a better home" — that was the old `humor` under
"Myth, story & the strange". Every faceted topic is in exactly one group and carries its group's
facet; `topic-groups.test.ts` keeps pinning that. Ids never collide with topic ids (`-group` suffix
where the natural slug is a topic). Facets are unchanged: Subject, Medium, Look, Place.

**For Ben's verdict** — edit labels and membership freely; the plan copies this table into
`topic-groups.ts`. 75 groups: 36 Subject · 19 Medium · 14 Look · 6 Place.

### Subject (92 topics, 36 groups)

| id | label | members |
|---|---|---|
| `space` | Space | astronomy, space-exploration, astronaut, moon, spaceship, space-art |
| `science-fiction-group` | Science fiction | science-fiction, robot, alien, ufo |
| `fandoms` | Fandoms | star-wars, star-trek |
| `fantasy-and-myth` | Fantasy & myth | mythology, fantasy, dragon, monster |
| `horror-and-the-macabre` | Horror & the macabre | horror, halloween, death |
| `ancient-world` | The ancient world | ancient-history |
| `animals-group` | Animals | zoology, animals, cats |
| `birds-group` | Birds | birds |
| `insects-group` | Insects | insects |
| `plants-group` | Plants | botany, plants, flowers, trees |
| `fungi` | Fungi | mushrooms |
| `food-group` | Food | food, fruit |
| `landscapes-and-nature` | Landscapes & nature | landscapes, nature, natural-history, desert, sand |
| `water-and-sea` | Water & sea | the-ocean, water |
| `rocks-and-earth` | Rocks & earth | geology |
| `weather-and-sky` | Weather & sky | clouds, weather, snow |
| `light-fire-and-night` | Light, fire & night | light, fire, night |
| `anatomy-and-medicine` | Anatomy & medicine | anatomy, body, medicine |
| `mind-and-feeling` | Mind & feeling | consciousness, emotions |
| `faces-and-portraits` | Faces & portraits | portraiture, portraits |
| `machines-and-engineering` | Machines & engineering | machines, technology, science, industrial, industrial-design |
| `cars-group` | Cars | cars |
| `games-and-computers` | Games & computers | games, retro-computing, retro-gaming |
| `toys-and-childhood` | Toys & childhood | toys, kids, children-s-illustration, balloons |
| `architecture-and-cities` | Architecture & cities | architecture, urban-landscape |
| `decay-and-the-street` | Decay & the street | urban-decay, street-art |
| `travel-and-the-road` | Travel & the road | travel, roadside-americana |
| `maps` | Maps | cartography |
| `books-and-words` | Books & words | literature, poetry, books |
| `humor-group` | Humor | humor |
| `music-sound-and-dance` | Music, sound & dance | music, sound, dance |
| `film-and-animation` | Film & animation | film, animation |
| `fashion-group` | Fashion | fashion, shoes, jewelry |
| `home-and-objects` | Home & objects | furniture, mirrors, still-life |
| `soviet-group` | Soviet | soviet, soviet-propaganda |
| `advertising-and-protest` | Advertising & protest | advertising, activism |

### Medium (41 topics, 19 groups)

| id | label | members |
|---|---|---|
| `painting-group` | Painting | painting, watercolor |
| `drawing-and-ink` | Drawing & ink | drawing, ink |
| `illustration-group` | Illustration | illustration, concept-art |
| `comics-group` | Comics | comics |
| `covers-and-sleeves` | Covers & sleeves | cover-art, album-art |
| `graphic-design-and-type` | Graphic design & type | graphic-design, typography |
| `posters-and-postcards` | Posters & postcards | poster-art, postcard |
| `printmaking` | Printmaking | engraving |
| `scientific-drawing` | Scientific drawing | scientific-illustration, botanical-illustration, technical-drawing, diagram |
| `photography-group` | Photography | photography, street-photography |
| `sculpture-group` | Sculpture | sculpture, carving |
| `installations-and-murals` | Installations & murals | installation, land-art, murals |
| `miniatures-and-dioramas` | Miniatures & dioramas | miniature, dioramas |
| `collage-and-found-objects` | Collage & found objects | collage, found-objects, mixed-media |
| `ceramics-and-glass` | Ceramics & glass | ceramics, clay, glass |
| `textiles-group` | Textiles | textiles, embroidery |
| `materials` | Wood, metal, paper & plastic | wood, metal, paper, plastic |
| `digital-group` | Digital | digital |
| `folk-art-group` | Folk art | folk-art |

### Look (20 topics, 14 groups)

| id | label | members |
|---|---|---|
| `abstract-and-geometric` | Abstract & geometric | abstract, geometric, pattern |
| `optical-illusions` | Optical illusions | optical-illusion |
| `surreal-and-psychedelic` | Surreal & psychedelic | surreal, psychedelic |
| `whimsical-group` | Whimsical | whimsical |
| `eerie-and-melancholy` | Eerie & melancholy | eerie, melancholy |
| `cinematic-group` | Cinematic | cinematic |
| `colour-group` | Colour | color, pastel-palette |
| `neon-group` | Neon | neon |
| `black-and-white-group` | Black & white | black-and-white |
| `painterly-group` | Painterly | painterly |
| `from-above` | From above | aerial-view |
| `mid-century-and-deco` | Mid-century & art deco | mid-century-modern, art-deco |
| `brutalist-group` | Brutalist | brutalist |
| `retrofuturism-group` | Retrofuturism | retrofuturism |

### Place (6 topics, 6 groups) — unchanged

`chicago-group` Chicago · `japan-group` Japan · `london-group` London · `new-york-group` New York ·
`russia-group` Russia · `ukraine-group` Ukraine.

**Consumers of group ids that change with the cut:** `e2e/support.ts`'s `ONBOARDING_GROUPS` (must
name groups with a member among the sixteen originals — `space` → astronomy, `plants-group` →
botany, `maps` → cartography), `topics-screen.tsx`, and the personas fixture is untouched (it holds
topic ids).

---

## 2. Reader-facing levels

`src/server/config/topic-levels.ts`, a no-import leaf (like `feed-knobs.ts`):

| level | `weightOf` | `levelOf(weight)` |
|---|---|---|
| `little` | 0.5 | weight < 0.75 |
| `some` | 1.0 | 0.75 ≤ weight < 1.5 |
| `lot` | 2.0 | weight ≥ 1.5 |

The save nudge (`WEIGHT_BUMP` 0.5, `WEIGHT_CAP` 3.0) is unchanged and keeps writing underneath;
a topic saved from three times shows "a lot". A hand-set level snaps to `weightOf`. Labels
("a little", "some", "a lot", "off") live beside the numbers so the copy pass has one place.

**What a list pick writes.** Taking a whole group writes each member at `some`; taking a single
member writes it at `lot` (naming one thing is a stronger signal than taking a bundle). A group
taken whole and then trimmed keeps `some` on the survivors. The group-size imbalance (six Space
topics at `some` outdraw one Humor at `lot`) stays, now visible and correctable per topic; the
feed's per-page topic and source caps bound it. Dividing by group size (the 09-25 follow-up) is
**not** done: it would show "a little" on every member of a big group the reader just asked for.

**API.**

- `topics.mine` → `{ topicId, weight }[]`. The product reads weights now; the topics router's
  "a picker that could read them would soon show them" stance is retired on purpose, and the
  dev-only `topics.weights` goes with it (`resetWeights` stays, dev-only).
- `topics.setMine({ picks: { topicId, weight }[] })`, `min(1)`. Rows not in `picks` are deleted;
  new rows get their weight; existing rows keep theirs (the weight-preserving replace, unchanged).
  `setUserTopics(userId, picks)` follows; `seed:personas` passes weight 1.0.
- `topics.setWeight({ topicId, level })` snaps one existing row; `NOT_FOUND` if the reader has no
  row for it.
- `topics.list` → `{ id, label, facet, neighbours: { id, weight }[] }`, the top five _faceted,
  listed_ neighbours by graph edge, for the interview's generated questions (§4). The graph file
  is 1.8 MB and never ships to the client; five neighbours per topic is what the generator needs,
  and CI's sixteen-topic database gets sixteen-topic neighbours with no special case.

---

## 3. The picker and the summary

### `GroupPicker` (onboarding's Pick phase and `/profile/topics`)

One component per facet section. A group renders as a `Chip` (tri-state: on / off / `mixed`, as
today) with a small disclosure ("6") on its trailing edge. Tapping the chip takes or releases the
whole group (a mixed group completes, as today). Opening the disclosure lays the member chips out
in a row beneath, indented; tapping a member takes or releases just that topic. Disclosure state is
local and per group; the section-level "Show all N topics" goes away. Groups render from
`groupsFor(facet, topics.list)`, so a group with no listed member is not shown and a pick never
flattens to an id `setMine` refuses.

The picker emits `{ topicId, weight }` changes using the §2 rule; it does not show levels — the
summary does.

### Onboarding phases

Route and gate unchanged (`/onboarding`; `hasCompletedOnboarding` = at least one `user_topic`
row). Three phases, shown as **Pick · Refine · Start** in the progress row (three dots, not one per
screen):

1. **Pick** — the four facet screens as today, each skippable, **no floor**. Copy stays the
   `FACET_PROMPTS`.
2. **Refine** — the interview (§4, §5). Not present in the foundation plan; the flow goes Pick →
   Start until it lands.
3. **Start** — `TopicLevels` (below) over the draft, headed "Here's where we'll start", and the
   one write: `interview.complete({ picks, answers })` (foundation: `topics.setMine`). **Floor of
   one at this button**: an empty summary says so and points Back. Nothing is written before it,
   so abandoning onboarding still leaves no rows.

### `TopicLevels` (the summary, and the top of `/profile/topics`)

The reader's picks grouped by facet in `FACETS` order, one row per topic: the label, and a
four-way segmented control _a little · some · a lot · off_. A topic the interview brought in
carries a small "suggested" mark. Two hosts:

- **Start phase**: edits the draft; nothing is written until "Start exploring".
- **`/profile/topics`**: sits above the `GroupPicker`; every change saves at once — a level via
  `topics.setWeight`, off via `topics.setMine` with the row removed (optimistic on `topics.mine`,
  revert + toast on error, as the page does today). Unpicking the last topic is refused in the UI
  (floor of one, `setMine`'s `min(1)`).

`/profile/topics` also gets **"Ask me a few more questions"** → `/interview` (§5).

---

## 4. The interview engine

`src/lib/interview/` — pure, client-side, no network per question, one write at the end.

```ts
type Level = "little" | "some" | "lot";
type Answer = "yes" | "no" | "a" | "b" | "either" | "neither" | "skip";

interface DraftState {
  /** The working weights — the list's picks, then every applied answer. */
  weights: Map<string, number>;
  /** Topic ids present before the interview started, for the "suggested" mark. */
  before: Set<string>;
  asked: string[];                          // question ids, in order
  answers: { questionId: string; answer: Answer }[];
  seed: number;                             // hash of the user id — deterministic tie-breaks
}

interface Question {
  id: string;                               // "bank:<key>" | "adj:<from>:<to>" | "pair:<a>:<b>"
  kind: "yesno" | "pair";
  prompt: string;
  /** Topic ids whose faces are shown: one for yes/no (may be absent → label card), two for a pair. */
  faces: string[];
  effects: Partial<Record<Answer, { topicId: string; move: "up" | "down" }[]>>;
}

nextQuestion(state, bank, topics): Question | null
applyAnswer(state, question, answer): DraftState
```

**Moves, in levels, never removing.** `up` on an absent topic brings it in at `some`; on a present
topic raises it one level (capped at `lot`). `down` on an absent topic does nothing (D2: the
interview turns things on); on a present topic lowers it one level (floored at `little`). Yes →
targets up. No → targets down. Pair A → A's targets up, B's down; B the reverse; either → both up;
neither → both down; skip → nothing, but the question counts as asked and is logged.

**Where questions come from.**

1. **The bank** (`src/server/config/interview-bank.ts`, §4a) — authored copy, an `applies`
   predicate, a priority, and targets per side. The plan validates it in a test: every target is a
   faceted topic, every key unique, every face a target.
2. **Adjacent offers**, generated: for each present topic, each of its `neighbours` that is faceted,
   listed, absent, and not yet asked about → a yes/no `adj:<from>:<to>` ("You picked Architecture.
   Brutalist too?"), face = the neighbour, effect yes → neighbour up.
3. **Face-offs**, generated: two present topics in the same group at the same level, both with
   faces → a pair `pair:<a>:<b>` ("Which of these?"), A → a up / b down, etc.

**The chooser** scores every askable, unasked question and returns the top one (seeded tie-break),
or `null` when the budget (`INTERVIEW_BUDGET`, 10) is spent or the best score is under the floor
(`SCORE_FLOOR`). Defaults in `src/server/config/interview.ts`, tuneable:

| source | score |
|---|---|
| adjacent offer | `3 × edge` (edge weight normalised to the topic's strongest neighbour) |
| face-off | `2 × (1 − |wa − wb| / 2)` |
| bank | `2 × priority/5 × freshness`, × 1.5 when `cold` and fewer than 3 topics present |

`freshness` = the fraction of a question's _listed_ targets that are untouched (absent and not moved
by any answer yet), so a broad question fades once its territory is settled. `applies` failing, or
not askable (§4a), is score 0. A cold reader therefore gets the broad bank questions first; a confident picker gets offers and
face-offs. Ids are stable, so the same question is never asked twice in one session or across
sessions (the log's ids are excluded when the engine runs from `/interview`).

**Persistence.** New table, migration 0010:

```
interview_answer (id text pk (nanoid), user_id text fk → user, question_id text,
                  answer text, asked_at timestamp default now())   index (user_id)
```

One mutation, `interview.complete({ picks: { topicId, weight }[], answers: { questionId, answer }[] })`,
one transaction: `setUserTopics` then insert the answers. Onboarding's Start button and
`/interview`'s Save both call it. `interview.answers` (query) returns the reader's log, for
`/interview` to exclude asked ids and for 9.13 later.

**Faces.** `src/server/config/topic-faces.ts`: `Record<topicId, { source: string; sourceId: string }[]>`,
hand picks keyed by the stable pair (an item's nanoid differs per database). `interview.faces`
resolves every listed faceted topic to up to two image item ids: the hand picks that exist in this
database first, then the highest-`curation_score` pictures with known dimensions from the topic's
membership (`item_topic ⋈ item`), ordered by score then id so the pair is stable. A topic with
none gets `[]` → a label card. `/dev/faces` (gated by `feedDebugEnabled()`, a 404 in production)
lists every topic with its current faces and the `{ source, sourceId }` line to paste.

### 4a. The bank — draft for Ben's verdict

Copy is placeholder in the app's current voice; edit freely. `applies`: `cold` = a broad question
(boosted when fewer than three topics are present); `both` = the two named topics are present;
`any` = at least one named topic present. Pair rows list A's targets then B's.

| key | kind | prompt | faces | targets | applies | pri |
|---|---|---|---|---|---|---|
| `challenge` | yes/no | Do you like pictures that unsettle you a little? | surreal | surreal, eerie, optical-illusion, horror | cold | 5 |
| `fashion` | yes/no | Fashion — clothes, shoes, jewellery? | fashion | fashion, shoes, jewelry | cold | 4 |
| `engineering` | yes/no | Machines, diagrams, how things work? | technical-drawing | machines, technical-drawing, industrial-design, diagram | cold | 4 |
| `nature-or-city` | pair | Which would you rather look at? | landscapes / urban-landscape | landscapes, nature, trees / urban-landscape, architecture, street-photography | cold | 5 |
| `abstract-or-figurative` | pair | Which of these? | abstract / portraiture | abstract, geometric, pattern / portraiture, portraits, still-life | cold | 5 |
| `colour-or-mono` | pair | Which of these? | color / black-and-white | color, neon, pastel-palette / black-and-white | cold | 4 |
| `old-or-new` | pair | Which of these? | engraving / digital | engraving, botanical-illustration, natural-history / digital, neon, concept-art | cold | 4 |
| `quiet-or-loud` | pair | Which of these? | pastel-palette / psychedelic | pastel-palette, melancholy, painterly / psychedelic, neon, poster-art | cold | 4 |
| `photo-or-paint` | pair | Which of these? | photography / painting | photography, street-photography / painting, watercolor, painterly | cold | 4 |
| `made-or-drawn` | pair | Which of these? | sculpture / illustration | sculpture, ceramics, textiles / illustration, drawing, comics | cold | 3 |
| `science` | yes/no | Science and the natural world? | scientific-illustration | scientific-illustration, botany, zoology, astronomy | cold | 3 |
| `space` | yes/no | Outer space? | astronomy | astronomy, space-exploration, space-art | cold | 3 |
| `funny` | yes/no | Do you like things that are funny? | humor | humor, whimsical | cold | 3 |
| `dark` | yes/no | Dark, moody, night-time? | night | night, eerie, melancholy, cinematic | cold | 3 |
| `people` | yes/no | Pictures of people? | portraiture | portraiture, portraits, street-photography, fashion | cold | 3 |
| `animals` | yes/no | Animals? | zoology | animals, zoology, birds | cold | 3 |
| `words` | yes/no | Do you read as much as you look? | typography | literature, poetry, books, typography | cold | 2 |
| `maps` | yes/no | Maps and diagrams? | cartography | cartography, diagram | cold | 2 |
| `propaganda` | yes/no | Old posters and propaganda? | poster-art | poster-art, soviet-propaganda, advertising | cold | 2 |
| `star-wars-or-star-trek` | pair | Two very different fandoms. Which? | star-wars / star-trek | star-wars / star-trek | both | 5 |
| `cars-or-machines` | pair | The car, or the machine? | cars / machines | cars / machines, industrial | both | 4 |
| `watercolor-or-ink` | pair | Which of these? | watercolor / ink | watercolor, painterly / ink, drawing | any | 3 |
| `flower-or-plate` | pair | The flower, or the plate? | flowers / botanical-illustration | flowers, plants / botanical-illustration, scientific-illustration | any | 3 |
| `myth-or-scifi` | pair | Which of these? | mythology / science-fiction | mythology, fantasy / science-fiction, robot | both | 4 |
| `street-art-or-architecture` | pair | Which of these? | street-art / architecture | street-art, urban-decay / architecture, urban-landscape | both | 3 |
| `sea-or-desert` | pair | Which of these? | the-ocean / desert | the-ocean, water / desert, sand | any | 3 |
| `computing-or-gaming` | pair | Which of these? | retro-computing / retro-gaming | retro-computing / retro-gaming | both | 3 |
| `mid-century-or-deco` | pair | Which of these? | mid-century-modern / art-deco | mid-century-modern / art-deco | both | 3 |

**Askable** means: a yes/no has at least one listed target; a pair has at least one listed target
on _each_ side (a pair with an empty side is a question with one answer). `cold` questions apply
always and are boosted when cold; `both`/`any` need their named topics present. Against the
sixteen originals alone — CI's e2e database — seven are askable from a cold state (`engineering`,
`science`, `space`, `people`, `animals`, `words`, `maps`); the plan's bank test asserts at least
five.

---

## 5. The interview screen

The Refine phase of onboarding, and the same component at `/interview` (authed; "Ask me a few more
questions" from `/profile/topics`). One question at a time in the narrow `Column`, a `Rise` per
question (keyed on the question id, like the stages today), a count ("3 of about 10"), and a
"skip to my summary" link.

- **Yes/no**: one face card (or a label card) with the prompt above; _Yes · No · Skip_ in the bar.
- **Pair**: two face cards, side by side at `md`, stacked below; _This one_ under each, _Either ·
  Neither · Skip_ in the bar. Tapping a card is "this one".
- Faces render through `imageSrc` (the CSP's `img-src 'self'`); a face that fails to load falls
  back to the label card, so a question is never blank.
- From `/interview`, the engine starts from `topics.mine` and excludes `interview.answers`' ids;
  it ends on a short summary of what changed (`TopicLevels` filtered to moved and suggested
  topics) and **Save** → `interview.complete` → back to `/profile/topics`.

Reduced motion: the `Rise` collapses as everywhere else; nothing else animates.

---

## 6. Testing

- **Unit.** `topic-groups.test.ts` over the new cut (partition, facet agreement, no id collision);
  `topic-levels.test.ts` (bands, snap, round-trip); `interview-bank.test.ts` (targets faceted,
  keys unique, faces ⊆ targets, ≥ 5 askable cold from the sixteen originals); `chooser.test.ts`
  (cold state → a broad bank question first; a taken Fandoms → the Star Wars/Star Trek pair
  outranks offers; the same question never twice; budget and floor end it; seeded ties stable);
  `apply.test.ts` (every move rule in §4, including "down on absent does nothing");
  `GroupPicker` and `TopicLevels` component tests; the onboarding screen test over the three
  phases with the mutation mocked.
- **Integration.** `setUserTopics` with weights (new rows get theirs, kept rows keep theirs, missing
  rows deleted); `setWeight` snapping and `NOT_FOUND`; `interview.complete` atomic (a failing
  answer insert leaves no `user_topic` change); `interview.faces` (hand pick wins, corpus fallback
  ordered, no-picture topic → `[]`); `topics.list` neighbours are faceted and listed only.
- **E2e** (both Playwright projects; CI-shape run required — the feed engine is not touched, but
  the onboarding fixtures are): _pick nothing → answer three questions → Start → feed_;
  _take `space`, open it, release `astronomy`'s siblings, skip the interview → summary shows one
  topic at "a lot" → feed_; `/profile/topics` set a level and reload; `/interview` from the topics
  page saves a suggested topic. `seedFeedCorpus` writes pictures with memberships, so faces
  resolve from the pool; the label-card fallback covers the rest.
- **By hand.** Phone and 1440; the pair layout at both; a Reduce Motion pass.

**Failure modes.** No LLM, no per-question request. The only network write is the final one, handled
as today (error in the fixed bar, retry, nothing written). A face 404 → label card. A question
whose targets are all unlisted (a bank entry naming a topic this database lacks) is simply not
askable — `applies` is evaluated against `topics.list`.

---

## Out of scope, recorded

- **"Never show me this"** — a hard exclusion the feed honours; wanted, after beta.
- **The LLM interview** — a back-and-forth in prose, a further door; must write through
  `interview.complete` and the same answer log.
- **Group-size weight division** — considered and rejected above (§2).
- **Explaining the summary** ("because you chose the airship") — the log makes it possible; 9.13's.
- **Text items** — Ben's in-flight ingest work; nothing here depends on item type.
- **Facet changes** — Subject / Medium / Look / Place stay; revisit if the interview makes them
  feel wrong.

## Plans

1. `docs/PLAN_onboarding-foundation.md` — §1, §2, §3 (Pick → Start; no Refine phase).
2. `docs/PLAN_onboarding-interview.md` — §4, §5, and the Refine phase and `/interview`.
