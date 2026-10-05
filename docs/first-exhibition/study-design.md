# Design: First Exhibition — bank v2 for the onboarding questionnaire

_10-04-26. Designed with Ben in a Claude chat (project "Art Judging questions"), prototyped as a
standalone page: **https://claude.ai/artifact/3viNDzd81skCuE1nSiwfhs** (private to Ben). This is
the next step for the questionnaire already built on `feat/onboarding-questionnaire`
(`docs/PLAN_onboarding-questionnaire.md`, engine in `src/lib/interview/`). It replaces most of bank
v1's questions, and adds a few things to the engine and the reveal. Pick up from
`docs/HANDOFF_first-exhibition.md`._

## Decisions (with Ben, 10-03 → 10-04-26)

1. **Picture-led, quiet, a little bit of a game.** Audience: curious generalists. Register:
   chill, cool, intellectual, quiet, avant-garde. The working name is "First Exhibition": the
   reveal names the reader's first show ("Quiet Weathers").
2. **Place is not a question any more.** Instead, "Where would you go next?" offers twelve
   destinations and infers _taste_ from the picks (what the places are made of, plus a four-axis
   travel compass). It doesn't infer place topics.
3. **The vocabulary must reach past Ben's own taste.** 168 proposed topics, 40 new groups, two new
   facets (Tradition, Form). They are a verdict file, not a migration:
   `docs/first-exhibition/vocabulary-proposal.md`.
4. **Keep the temperament strip.** Rentfrow's five dimensions are kept because they carry over to
   film and music later.
5. **Reading is asked with article cards in Ambit's own format** (`ESSAY · 12 MIN`, headline, dek),
   one card of each writing kind per set. The first try, public-domain opening lines, was
   rejected: "all terrible… all the same" (one era, one register, all canon).
6. **Pictures are fixed, not rotated per run.** One curated set; refresh it by hand.
7. **An LLM call is fine** (already true in the plan: `onboarding.interpret`).

## 1. What changes, in one table

| Bank v1 (built)                                              | Bank v2                                                   | Why                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `look-at`, `read-watch` (text, first)                        | **kept, moved to the end** (decision for Ben, §11)        | Easier to answer once the reader has warmed up. In the prototype this was the "rabbit hole" bonus. |
| `go-tomorrow` (multi ≤ 2, six places)                        | `destinations` (multi ≤ 3, twelve)                        | Decision 2                                                                                         |
| `space-or-garden`, `animal-or-machine`, `abstract-or-figure` | `wings-1`, `wings-2`, `wings-3` (choice of four pictures) | Twelve subject areas, sampled evenly                                                               |
| `painted-or-photographed`, `made-or-printed`                 | `hands-*` ×3 (pair)                                       | The subject stays the same and the _medium_ changes, so the pick scores medium only                |
| `vibe` (multi ≤ 2, words)                                    | `feel-*` ×3 (pair)                                        | Same subject, different _look_; shown as pictures, not words                                       |
| —                                                            | `keep` (multi, ten pictures)                              | The prototype's rapid fire: the cheapest way to get many signals                                   |
| `evening`                                                    | retired                                                   | Covered by the Stage and Food & the everyday wings                                                 |
| `unsettle`                                                   | `rather-not` (multi)                                      | "Anything you'd rather not see?" A list, not one yes/no                                            |
| `reading-kind` (multi, words)                                | `read-1`, `read-2` (choice of four article cards)         | Decision 5                                                                                         |
| `reading-amount`                                             | kept; its **default** comes from `read-*`                 | Two cards opened → _some_; both long reads → _a lot_                                               |

Bump `BANK_VERSION` to 2. That's 18 screens with both text questions: wings ×3, hands ×3,
feel ×3, keep, read ×2, destinations, rather-not, amount, look-at, read-watch, plus the optional
playoff. The progress bar should group them into about ten steps, as the prototype does
(`Question 05` covers all three hands pairs).

## 2. Wings — "Which would you look at longer?"

`src/server/config/interview-wings.ts`: twelve wings, each a bundle of _subject_ topics a reader
would recognise from one picture.

**Creatures** · **Growing things** · **Land, sea & sky** · **Space & tomorrow** · **Machines & how
things work** · **Cities & buildings** · **People & daily life** · **Myth, ritual & the ancient
world** · **Body & mind** · **Things people make** · **Food & the everyday** · **Stage, screen &
sound**.

A wing is not a group. The feed, the weights and personas never see one.

- **Questions:** `wings-1..3` are `choice` questions with four options each. The wing order is
  fixed in the bank and shuffled once by hand; all twelve wings are shown once. Each option is
  `{ key: wing.id, label: wing.label, face: { topic: wing.faceTopic, pick }, effects:
[topics(wing.weight, ...wing.topics), topics(FACE_BONUS, faceTopic)] }`. `targetsOf` already
  drops `wing.proposed` until those topics are listed, so one bank serves both database shapes.
- **Nature counts for less.** `wing.weight` is 0.7 for Land, sea & sky and 0.8 for Growing things
  and Creatures. People largely agree about landscapes and disagree about art and architecture
  (Vessel, Maurer, Denker & Starr 2018, _Cognition_ 179). A pick from a widely liked area says
  less about this particular reader.
- **"None of these"** is the existing `NEITHER`, generalised to `choice`: −0.5 × each option's
  first effect.
- **The playoff (later, optional).** The prototype's Q4 shows the top four wings again with a
  second picture. That needs the bank to read the running scores, which v1's static bank can't
  do. Skip it in v2. If wanted later, add a `fromTop` question kind whose options come from
  `picksFrom` at the moment it's asked.

**Engine change:** `question-step.tsx` renders faces only for `pair` today. Render `FaceCard`s for
any `choice` or `multi` question whose options all have a `face`. Use a 2×2 grid on a phone and
four across from `md`.

## 3. Pairs — "Same subject, different hands" / "a different feeling"

These are the existing `pair` kind, with either/neither and `EITHER_FACTOR`/`NEITHER_FACTOR`
unchanged. Each pair keeps the subject still and changes one thing, so its effects name only
**medium** topics (hands) or **look** topics (feel). It doesn't use groups, and it adds no subject
score. The v1 set comes from the prototype; the faces are listed under `pairs` in `faces.json`,
where `hands-x` is `medium-x` and `feel-x` is `look-x`. The other ten pairs there are spares.

| id                | prompt                             | A                                                  | B                                                                           |
| ----------------- | ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `hands-mushrooms` | Same subject, different hands.     | Photograph → `nature-photography`\*, `photography` | Natural-history plate → `botanical-illustration`, `scientific-illustration` |
| `hands-owls`      | 〃                                 | Photograph → `photography`, `nature-photography`\* | Painting → `painting`, `painterly`                                          |
| `hands-fish`      | 〃                                 | Natural-history plate → `scientific-illustration`  | Jewellery → `jewelry`, `metal`                                              |
| `feel-circles`    | Same subject, a different feeling. | Bold → `color`, `geometric`                        | Soft → `pastel-palette`, `delicate`\*                                       |
| `feel-roads`      | 〃                                 | Night → `melancholy`, `cinematic`                  | Day → `light`, `nostalgic`\*                                                |
| `feel-rooms`      | 〃                                 | Warm → `mid-century-modern`, `cozy`\*              | Austere → `brutalist`, `minimal`\*                                          |

`*` marks a proposed topic; it is dropped until promoted. Effects use score 1 per side and let √n
share it, as now.

## 4. Keep, destinations, rather-not

**`keep`: "Tap any you'd keep."** A `multi` question with no `max` and ten face options: one
fresh picture from each of ten wings, plus two look pictures. A kept picture adds
`topics(1, ...picture.tags)`. A picture not kept adds nothing, because skipping isn't the same as
disliking. (The prototype's swipe stack gave −0.5 to a passed picture. Grid-and-tap is cheaper to
build and fine for v2.)

**`destinations`: "Where would you go next?"** A `multi` question, `max: DESTINATION_MAX` (3). Its
options are `BALANCED_TWELVE` from `src/server/config/interview-destinations.ts`, which holds 38
destinations with copy. Options are **typeset cards with no picture**: where (small caps), name
(display face), one line, coordinates. Each option's effects are `topics(1.5,
...destination.topics)`, shared by √n. Choosing none is allowed ("Nowhere in particular").

**Travel compass** (pure, `src/lib/interview/compass.ts`, with a test): average each chosen
destination's `axes` (wild/built, old/new, still/lively, far/near; each −1…1). The reveal shows
four bipolar bars, plus one sentence built from the axes whose |value| > 0.15: "You'd travel for
wild places over cities, the old over the new, quiet over crowds and a long way from home."
Nothing is stored; it's recomputed from the logged answer.

**`rather-not`: "Anything you'd rather not see?"** A `multi` question with these options:

- Horror & gore
- Death & skeletons
- Anatomy & medicine
- Insects
- Nudity
- War & weapons
- Propaganda
- Religious imagery
- Eerie & melancholy

Until the plan's out-of-scope "never show me this" exists, each option is a strong negative
effect, `topics(-2, …)`, so those topics can't make the reveal. The answer is logged, so the
real filter can read it later. **Nudity and weapons have no topic or tag to filter on** (§9).

## 5. Reading — "Which would you open?"

`read-1` and `read-2` are `choice` questions with four options each, keys `essay`, `curiosity`,
`criticism`, `archive` (Ambit's `WRITING_KINDS`). Plus "I'd rather look at pictures" (`SKIP`).

- **Faces are real writing items.** Add an optional `face.writing: { kind: WritingKind; nth: 0 | 1 }`
  to `Option`. `question-faces.ts` then picks the `nth`-best writing item of that kind:
  - `type = 'article'`, that `kind`, `curation_score ≥ 8`;
  - for `nth = 0` prefer `reading_minutes ≤ 6`, for `nth = 1` prefer `≥ 12`, so each kind shows
    one short and one long piece across the two sets.

  The card is an article card: `KIND · N MIN`, title, summary first line, and the item's picture
  if it has one. Use a text card when there is no item (CI); `reading-cards.json` holds sixteen
  example headlines that can serve as fallback copy.

- **Scoring uses the item, not a fixed effect.** The chosen card's item is known when the answer
  is given. Put its topic memberships on `Answer.topicIds`, the same way `text` answers carry the
  model's ids, and score them at `READ_SCORE = 1.2`. Also add the matching **form** topic once the
  Form facet exists (§7).
- **Reading amount default** (`readingAmountFrom`): two cards opened → `some`, or `lot` if both
  were 12+ minutes; one → `little`; "pictures" twice → `none`. The `amount` question shows that
  default preselected, and the reader can change it.

## 6. Temperament

`src/server/config/temperament.ts` holds the five dimensions with labels and glosses, and
`TOPIC_TEMPERAMENT`, a weight vector per topic (every topic inherits its prototype group's
weights). The dimensions come from Rentfrow, Goldberg & Zilca 2011, _Journal of Personality_ 79(2).
**The paper supplies the dimensions only; the numbers are a design proposal.**

Pure function, `src/lib/interview/temperament.ts`, with a test:

```
dims[d] = Σ_topic max(0, score[topic]) × TOPIC_TEMPERAMENT[topic][d]
        + DIRECT_TEMPERAMENT_FACTOR × Σ (chosen destinations' and opened cards' own weights)
normalise: divide every dim by the largest → 0…1
```

The reveal shows five bars, labelled and glossed. Nothing is stored in v2. It's derivable from
`interview_answer` plus the bank at the time; add a cached `taste jsonb` only when film and music
need it.

## 7. Vocabulary expansion and the two new facets

- **The verdict file** is `docs/first-exhibition/vocabulary-proposal.md`, with a checkbox, facet,
  group and seed query per proposed topic. It's not `promote:topics`-shaped, because these
  topics aren't mined from tags. A ticked topic is **hand-added**:
  - a `topic` row and a `topic-facets.ts` entry;
  - a `topic-groups.ts` member;
  - seed cells in `config/topics.ts` for every V1 source ("a v1 source owes every topic a cell"),
    the seed text as a first guess;
  - graph edges via `graph:rebuild` once items arrive.
- **Do it in rounds.** A first round of about 20–30 topics, chosen to fill wings that are thin
  today (Sport & play, Celebrations, Faith & ritual, World traditions, Gardens, Food & drink),
  will show whether the museums answer those queries honestly before the rest is ticked.
- **Facets.** `tradition` and `form` extend `TopicFacet` (`subject | medium | look | place`) in
  `schema.ts`'s `$type`, `topic-facets.ts`, the facet test, and wherever facets are switched on
  (`FACET_PROMPTS` is internal now). `place` stays as a facet; onboarding just no longer asks
  about it.

## 8. Faces

- The prototype's pictures are listed in `docs/first-exhibition/faces.json`: local item id,
  caption, wing, tags, and **roles** (`wing:<id>:door`, `pair:<id>:a|b`, `card:<id>`, or
  `keep-or-pass`). The ids are **local** (Ben's dev database).
- `bun run scripts/first-exhibition-faces.ts` (read-only) resolves them to `(source, sourceId)`
  hand picks for `Option.face.pick`. Run it against the database the caches were filled from.
  `/dev/faces` (plan Task 19) is where to check them on a page.
- **Never commit picture files.** The repo is public and some images come from designated blogs
  under the link-card posture. `faces.json` holds ids and captions only.

## 9. The reveal

The reveal adds the following to `reveal-step.tsx`, above the levels list:

- **Exhibition title:** adjective + noun, e.g. "Quiet Weathers".
  - The adjective comes from the top look topic if its score > 0.6: minimal → Quiet, eerie or
    melancholy → Nocturnal, neon → Electric, color → Chromatic, black-and-white → Monochrome,
    surreal or psychedelic → Dreaming, whimsical → Whimsical, painterly → Painted, aerial-view →
    Aerial, brutalist → Concrete, retrofuturism → Atomic, art-deco or mid-century-modern →
    Streamlined, cozy → Hearthside, ornate → Gilded, gothic → Gothic.
  - Otherwise it comes from the top medium: photography → Exposed, engraving → Engraved,
    scientific-illustration → Measured, ceramics → Glazed, textiles → Woven, collage → Assembled,
    painting → Painted, drawing → Drawn, illustration → Illustrated.
  - The noun is the top wing's `noun`.
- **Subtitle:** the top three wings and the top two mediums.
- **Temperament** strip (§6) and **travel compass** (§4).
- **"You'd open"**: the two chosen cards, with "You like a long read" or "You like something
  short" (average minutes ≥ 14 or ≤ 4).

Proposed topics never appear as dials: the reveal only lists `topics.list`. The prototype marks
them "proposed" to show what the expansion would add, and the app shouldn't.

## 10. Findings worth knowing

- **The corpus mirrors the designated blogs.** In a random sample of 480 cached pictures, retro
  sci-fi, Soviet material and erotic illustration dominate. The questions can only offer what the
  corpus can serve, so §7 matters as much as the questions do.
- **Nudity and weapons can't be filtered.** Nudes are common in the cache, and no topic or curator
  tag marks them. "Rather not see" logs the wish; the filter needs a curator tag (e.g. add
  `nudity` / `weapons` to the curator rubric's tag guidance, like `grotesque` and `gore`).
- **46 of 421 cached files in `~/Dev/ambit-questionnaire/.cache/img` were the same gold-circle
  mark,** probably what the image route stores when a fetch fails. `question-faces.ts` should
  avoid those items, or the cache should stop storing the mark under an item's id.

## 11. Open questions for Ben

1. Text questions first (plan v1) or last (prototype)?
2. Keep `rather-not` as negative scores until "never show me this" exists, or wait and drop it
   from v2?
3. Which 20–30 proposed topics go in round one (§7)?
4. Swipe stack (prototype) or tap grid (this spec) for `keep`?
5. The playoff: worth a `fromTop` question kind now, or later?
