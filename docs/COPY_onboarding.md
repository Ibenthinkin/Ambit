# Copy deck — the questionnaire and the reveal

_Task 3.1 of `docs/PLAN_onboarding-critique.md`, generated 10-05-26 from the code as it stood
after Cut 1 began. **This file is the verdict**, like `topic-proposals.md`: Ben fills the **New**
column (or writes `keep`), and Task 3.2 applies it slot by slot. A blank New cell means "not
decided yet", not "keep". Strings in the engine's attributes (`data-topics`, question ids, option
keys) are not copy and are not here — the e2e helper steers by them, and they do not change._

Conventions worth knowing before writing:

- **A question's wording may change freely.** `BANK_VERSION` bumps only when a question's
  _meaning_ changes (the file header in `bank.ts` says so). Renaming "Body & mind" is wording;
  turning two free-text questions into one is meaning (D5 → the bank retires `read-watch`).
- **The forward button is named for what it does** (`forwardLabel` in `onboarding-screen.tsx`):
  after Cut 1 it is _Skip_ before anything is said, _Next_ after, and _Nowhere in particular_
  on the destinations. "I'd rather look at pictures" is gone with Cut 1.
- **Wing labels now show only as text fallbacks and in the reveal subtitle** (Cut 1 removed the
  caption over a wing picture). The `noun` is the second word of the reveal title ("Quiet
  **Weathers**") and changes with D6's frame.
- Curly apostrophes (’) throughout, as the app does.

## 1. Sitewide labels these screens use

| Slot                                         | Current    | New | Notes                                                |
| -------------------------------------------- | ---------- | --- | ---------------------------------------------------- |
| `config/reading-amount.ts` `READING_LABELS`  | None · A little · Some · A lot | | Step 8's chips; also Settings → Reading             |
| `config/topic-levels.ts` `LEVEL_LABELS`      | a little · some · a lot · off  | | The reveal's and `/profile/topics`' segmented control |
| `config/writing.ts` `WRITING_KIND_LABELS`    | Essay · Curiosity · Criticism · Archive | | The article cards' kicker and "You’d open"         |

## 2. Intro (`components/onboarding/onboarding-screen.tsx`)

| Slot                 | Current                                                                                                                                  | New | Notes                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------- |
| Eyebrow              | Ambit · Setup                                                                                                                            |     | Retake: Ambit · Start again             |
| Title                | Let’s find where to start                                                                                                                |     | Retake: Let’s ask again                 |
| Lede                 | A few questions about what you like — some pictures, some words. Skip any of them. At the end you’ll see what we made of it, and you can change all of it. |     | Ben: "replace every word"               |
| Retake warning       | Your answers will replace the topics you have now. _Cancel_                                                                              |     |                                         |
| Begin button         | Begin                                                                                                                                    |     |                                         |
| Prototype, for reference | _Before we hang anything, a few quiet questions._ / _Pick whatever you would look at longer. Nothing here is a test, and you can change every setting at the end._ | | The study's own intro copy |

## 3. Chrome shared by every question

| Slot                            | Current                                                                                                                          | New | Notes                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| Progress line                   | Step 3 of 9 · Feeling                                                                                                            |     | `STEP_LABELS` below supply the word after the dot             |
| Back                            | Back                                                                                                                             |     |                                                              |
| Forward, nothing said           | Skip                                                                                                                             |     |                                                              |
| Forward, something said         | Next                                                                                                                             |     |                                                              |
| Forward, destinations, none     | Nowhere in particular                                                                                                            |     |                                                              |
| Multi hint, capped              | Pick up to three.                                                                                                                |     | `COUNT_WORDS`: one · two · three · four                        |
| Multi hint, uncapped            | Pick any.                                                                                                                        |     | The Keep grid                                                 |
| Pair: either / neither          | Either · Neither                                                                                                                 |     | Prototype: "Both, equally"                                    |
| Choice: none                    | None of these                                                                                                                    |     | The wing screens and the playoff                              |
| Interpreting                    | Putting it together…                                                                                                             |     | Shown while the free text is mapped                           |
| Save error                      | Something went wrong saving your answers — try again.                                                                            |     |                                                              |
| Free text help                  | Say as much or as little as you like. We use it to choose where to start.                                                        |     |                                                              |
| Free text disclosure            | What you write here is sent to an AI service (OpenRouter) to match it to topics, and we keep it to learn what Ambit is missing.    |     | **Must keep its two facts** (sent to OpenRouter; stored) — SPEC §3.2 |
| Article card kicker             | ESSAY · 12 MIN                                                                                                                   |     | `face-card.tsx`; "min" is the unit word                       |

### Step labels (`lib/interview/steps.ts` `STEP_LABELS`)

| #   | Current    | New |
| --- | ---------- | --- |
| 1   | Rooms      |     |
| 2   | Hands      |     |
| 3   | Feeling    |     |
| 4   | Keep       |     |
| 5   | Reading    |     |
| 6   | Travel     |     |
| 7   | Rather not |     |
| 8   | How much   |     |
| 9   | Your words |     |

## 4. The questions (`lib/interview/bank.ts`)

### Step 1 — the wing screens and the playoff

| Slot                              | Current                                | New | Notes                                                 |
| --------------------------------- | -------------------------------------- | --- | ----------------------------------------------------- |
| Prompt, `wings-1..3` (`WING_PROMPT`) | Which would you look at longer?     |     | Ben: "terrible". Prototype sub-line: _Pick one. Go with your first instinct._ |
| Prompt, `playoff`                 | One more. Which would you look at longer? |  | Prototype: _Of your favourites, which first?_ / _These four pulled you in. Choose the one you would hang first._ |

**The twelve wings** (`server/config/interview-wings.ts`; D4). `label` is the text fallback and the
reveal subtitle; `noun` is the reveal title's second word, and since 10-06-26 lives with the rest
of the frame's words in `lib/interview/frame.ts` (`FRAME.nouns`, keyed by the wing id).

| id         | Current label                      | New label | Current noun | New noun | Notes                             |
| ---------- | ---------------------------------- | --------- | ------------ | -------- | --------------------------------- |
| creatures  | Creatures                          |           | Bestiaries   |          | Ben disliked by name              |
| growing    | Growing things                     |           | Gardens      |          | Ben disliked by name              |
| land       | Land, sea & sky                    |           | Weathers     |          |                                   |
| space      | Space & tomorrow                   |           | Orbits       |          | Ben disliked by name              |
| machines   | Machines & how things work         |           | Mechanisms   |          | Ben disliked by name              |
| cities     | Cities & buildings                 |           | Streets      |          | Ben disliked by name              |
| people     | People & daily life                |           | Portraits    |          | Ben disliked by name              |
| myth       | Myth, ritual & the ancient world   |           | Myths        |          |                                   |
| body       | Body & mind                        |           | Anatomies    |          | **"especially"**                  |
| made       | Things people make                 |           | Objects      |          |                                   |
| everyday   | Food & the everyday                |           | Still Lifes  |          | Ben disliked by name              |
| stage      | Stage, screen & sound              |           | Performances |          |                                   |

### Steps 2–3 — the pairs

| Question          | Prompt (current)                     | New prompt | Side A (current)      | New A | Side B (current)        | New B |
| ----------------- | ------------------------------------ | ---------- | --------------------- | ----- | ----------------------- | ----- |
| `hands-mushrooms` | Same subject, different hands.       |            | Photograph            |       | Natural-history plate   |       |
| `hands-owls`      | Same subject, different hands.       |            | Photograph            |       | Painting                |       |
| `hands-fish`      | Same subject, different hands.       |            | Natural-history plate |       | Jewellery               |       |
| `feel-circles`    | Same subject, a different feeling.   |            | Bold                  |       | Soft                    |       |
| `feel-roads`      | Same subject, a different feeling.   |            | Night                 |       | Day                     |       |
| `feel-rooms`      | Same subject, a different feeling.   |            | Warm                  |       | Austere                 |       |

The side label is printed over the picture on a pair (it names what differs); write `none` in
New if a pair should show pictures alone like the wings do.

### Step 4 — Keep

| Slot            | Current                 | New | Notes                                                        |
| --------------- | ----------------------- | --- | ------------------------------------------------------------ |
| Prompt, `keep`  | Tap any you’d keep.     |     | Prototype (swipe stack, D3): _Keep or pass._ / _Ten quick ones. Drag the card, tap a button, or use the arrow keys._ |
| Buttons (D3a)   | —                       |     | Prototype: Pass · Keep, and a `01 / 10` counter              |

The ten pictures' labels are text fallbacks only (Creatures · Growing things · Land, sea & sky ·
Space · Machines · Cities · People · Myth · Abstract · Eerie); they follow the wing renames.

### Step 5 — Reading

| Slot                 | Current              | New | Notes                                                                 |
| -------------------- | -------------------- | --- | --------------------------------------------------------------------- |
| Prompt, `read-1`     | Which would you open? |    | Prototype sub-line: _Four pieces from the feed. Pick the one you'd read first._ |
| Prompt, `read-2`     | And one of these?    |     |                                                                       |

**Fallback headlines** (`lib/interview/reading-fallback.ts`) — shown when the database has no
article of that kind (CI, a fresh install, the local database today). Two per kind, short then long.

| Kind       | #   | Title (current)                                        | Dek (current)                                          | New |
| ---------- | --- | ------------------------------------------------------ | ------------------------------------------------------ | --- |
| essay      | 0   | The recipes my grandmother never wrote down            | Grief, measured in handfuls.                           |     |
| essay      | 1   | A winter at the South Pole                             | What six months of darkness does to a crew of forty.   |     |
| curiosity  | 0   | Why medieval scribes kept drawing knights fighting snails | No one knows. Here are the four best theories.      |     |
| curiosity  | 1   | Octopuses might dream. About what?                     | What sleeping octopuses suggest about their minds.     |     |
| criticism  | 0   | In defence of the romance novel                        | The bestselling genre nobody admits to reading.        |     |
| criticism  | 1   | The quiet horror films that scare me most              | No monsters. Just a long hallway and a dripping tap.   |     |
| archive    | 0   | Six old Japanese poems about frogs                     | Seventeen syllables each, and every one is a frog.     |     |
| archive    | 1   | Mail-order catalogue, 1908: a whole house by post      | Yes, the whole house. Nails included.                  |     |

### Step 6 — Travel (`server/config/interview-destinations.ts`, the `BALANCED_TWELVE`)

| Slot                      | Current                   | New | Notes                                                        |
| ------------------------- | ------------------------- | --- | ------------------------------------------------------------ |
| Prompt, `destinations`    | Where would you go next?  |     | Prototype sub-line: _Choose up to three. We don't use these as places; they tell us what kind of world you're drawn to._ |

Coordinates are gone (Cut 1). Each card: `where` small caps, `name` large, `line` under it.

| id           | where             | name                              | line                                                      | New where | New name | New line |
| ------------ | ----------------- | --------------------------------- | --------------------------------------------------------- | --------- | -------- | -------- |
| kyoto        | Japan             | Kyoto in the rain                 | Moss gardens, wet stone, a temple bell.                   |           |          |          |
| iceland      | Iceland           | The Icelandic highlands           | Black sand, steam, light that never quite sets.           |           |          |          |
| marrakech    | Morocco           | Marrakech medina                  | Tiled courtyards and a thousand colours.                  |           |          |          |
| venice       | Italy             | Venice in January                 | Fog on the lagoon, empty palazzi.                         |           |          |          |
| tokyo        | Japan             | Tokyo after midnight              | Neon, vending machines, the last trains.                  |           |          |          |
| berlin       | Germany           | Berlin                            | Concrete, clubs and a century of history in one street.   |           |          |          |
| luxor        | Egypt             | Luxor and the Valley of the Kings | Painted tombs and the desert at dawn.                     |           |          |          |
| patagonia    | Argentina & Chile | Patagonia                         | Wind, glaciers, granite towers, no one for miles.         |           |          |          |
| istanbul     | Türkiye           | Istanbul                          | Domes and bazaars on two continents.                      |           |          |          |
| galapagos    | Ecuador           | The Galápagos                     | Where Darwin watched the finches.                         |           |          |          |
| transylvania | Romania           | Transylvania                      | Fortified churches, beech forests, old stories.           |           |          |          |
| copenhagen   | Denmark           | Copenhagen                        | Bicycles, design shops, candlelit cafés.                  |           |          |          |

(The other 26 destinations in the file are spares and are not shown; rename them only if one is
swapped in.)

### Step 7 — Rather not

| Slot                    | Current                        | New | Notes                                                          |
| ----------------------- | ------------------------------ | --- | -------------------------------------------------------------- |
| Prompt, `rather-not`    | Anything you’d rather not see? |     | Prototype sub-line: _We keep these out of your feed. You can change this at the end, or any time later._ — **not true yet** (scores only, design D3); don't promise a filter |
| Option                  | Horror & gore                  |     |                                                                |
| Option                  | Death & skeletons              |     |                                                                |
| Option                  | Anatomy & medicine             |     |                                                                |
| Option                  | Insects                        |     |                                                                |
| Option                  | Nudity                         |     | Logged only — no topic to score                                 |
| Option                  | War & weapons                  |     |                                                                |
| Option                  | Propaganda                     |     |                                                                |
| Option                  | Religious imagery              |     |                                                                |
| Option                  | Eerie & melancholy             |     |                                                                |

### Step 8 — How much reading

| Slot              | Current                                   | New | Notes                                      |
| ----------------- | ----------------------------------------- | --- | ------------------------------------------ |
| Prompt, `amount`  | How much reading do you want mixed in?    |     | Chips are `READING_LABELS` (§1); preselected from the cards |

### Step 9 — Your words (D5)

| Slot                  | Current                                                                           | New | Notes                                              |
| --------------------- | --------------------------------------------------------------------------------- | --- | -------------------------------------------------- |
| Prompt, `look-at`     | What do you like to look at on the internet?                                      |     | Ben: awkward, vague, puts the reader on the spot    |
| Prompt, `read-watch`  | What do you read or watch? Authors, magazines, a favourite film — anything.       |     | Ben: redundant with the above; D5 recommends merging into one |
| Placeholder           | _(none today)_                                                                    |     | A concrete example or two inside the box would answer "on the spot" |

## 5. The reveal (`reveal-step.tsx`, `exhibition-card.tsx`, `lib/interview/frame.ts`, `exhibition.ts`, `compass.ts`, `config/temperament.ts`)

| Slot                       | Current                                                                                                  | New | Notes                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------- |
| Card eyebrow (D6)          | Your first exhibition                                                                                    |     | `FRAME.eyebrow`. The frame word; "feed / blog / zine or similar"       |
| Title fallback             | First Exhibition                                                                                         |     | `FRAME.untitled`. When no look or medium clears the floor: adjective "First", noun "Exhibition" |
| Subtitle                   | _Creatures, growing things and myth. Mostly photography and painting._ (top wings, then top mediums)    |     | `exhibition.ts` `exhibitionSubtitle`; a sentence since 10-06-26, a row of dots before. The word "Mostly" is the only fixed copy |
| Heading                    | Here’s where we’ll start                                                                                 |     |                                                                        |
| Lede                       | Turn anything up, down or off. Ambit wanders sideways from here, and you can change all of this later.   |     | Prototype: _About one post in ten comes from outside this mix, so the feed keeps learning from your likes and saves._ (state the real share, Cut 4) |
| Retake warning             | This replaces your current topics. _Cancel_                                                              |     |                                                                        |
| Submit, enough             | Start exploring                                                                                          |     | Prototype: Open my feed                                                |
| Submit, too few            | Keep at least three                                                                                      |     |                                                                        |
| Start over (Cut 4)         | —                                                                                                        |     | Prototype: Start over                                                  |
| Temperament eyebrow        | Temperament                                                                                              |     |                                                                        |
| Temperament intro (Cut 4)  | —                                                                                                        |     | Prototype: _Five dimensions that hold across music, film and books. Kept now, they can seed what you watch and listen to later._ |
| Compass eyebrow            | Travel compass                                                                                           |     |                                                                        |
| Compass poles              | Built / Wild · New / Old · Lively / Still · Near / Far                                                    |     |                                                                        |
| Compass sentence parts     | You’d travel for … wild places over cities / cities over wild places · the old over the new / the new over the old · quiet over crowds / crowds over quiet · a long way from home / somewhere close to home |  | `compass.ts` `PHRASES`; joined with commas and "and"       |
| "You’d open" eyebrow       | You’d open                                                                                               |     |                                                                        |
| Reader line, long          | You like a long read, and you went for _essays and criticism_.                                           |     | `exhibition.ts` `readingSummary`; mean ≥ 14 min                         |
| Reader line, short         | You like something short, and you went for _essays_.                                                     |     | Mean ≤ 4 min                                                            |
| Reader line, in between    | You went for _essays and criticism_.                                                                     |     |                                                                        |
| Reader line, none opened   | You’d rather look than read.                                                                             |     | Prototype added _We'll keep writing to a minimum._ — left out: the amount question decides that, and the reader may have set it to anything |
| Kinds, as "went for"       | essays · curiosities · criticism · the archive                                                           |     | `exhibition.ts` `KIND_WENT_FOR`                                         |
| Kept out (Cut 4)           | —                                                                                                        |     | Prototype: eyebrow _Kept out_, chip suffix _Allow_, empty _Nothing kept out._ |

### Temperament dimensions (`server/config/temperament.ts`)

| id        | Label     | Gloss                               | New label | New gloss |
| --------- | --------- | ----------------------------------- | --------- | --------- |
| communal  | Communal  | People, warmth, the everyday.       |           |           |
| aesthetic | Aesthetic | Form and craft for their own sake.  |           |           |
| dark      | Dark      | Shadow, unease, the macabre.        |           |           |
| thrilling | Thrilling | Adventure and the fantastic.        |           |           |
| cerebral  | Cerebral  | Systems, ideas, how things work.    |           |           |

### Exhibition title words (`lib/interview/frame.ts`, one `FRAME` object; D6 — these are the conceit)

Adjective from the top **look** topic (floor 0.6): minimal → Quiet · eerie, melancholy → Nocturnal ·
neon → Electric · color → Chromatic · black-and-white → Monochrome · surreal, psychedelic →
Dreaming · whimsical → Whimsical · painterly → Painted · aerial-view → Aerial · brutalist →
Concrete · retrofuturism → Atomic · art-deco, mid-century-modern → Streamlined · cozy → Hearthside ·
ornate → Gilded · gothic → Gothic (waits on the proposed `gothic` topic; cannot fire today). Else from the top **medium**: photography → Exposed · engraving →
Engraved · scientific-illustration → Measured · ceramics → Glazed · textiles → Woven · collage →
Assembled · painting → Painted · drawing → Drawn · illustration → Illustrated. Noun: the top wing's
entry in `FRAME.nouns` (§4, Step 1 table).

New adjective map, if the frame changes:

| Topic → adjective (new) |
| ----------------------- |
|                         |

## 6. Not copy, listed so nothing is missed

- `/profile/topics` reuses the reveal's card and levels; "Retake the questions" and its search box
  live in `components/profile/topics-screen.tsx` and are outside the critique.
- The step count in the progress line is computed; the wing/keep picture *labels* are read by
  screen readers as the button name even when not printed.
- The e2e helper's forward-button regex (`e2e/support.ts`) must list whatever the forward labels
  become — the one place copy touches a test.
