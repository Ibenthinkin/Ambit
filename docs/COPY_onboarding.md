# Copy deck — the questionnaire and the reveal

_Task 3.1 of `docs/PLAN_onboarding-critique.md`, generated 10-05-26 from the code as it stood
after Cut 1 began. **This file is the verdict**, like `topic-proposals.md`: Ben fills the **New**
column (or writes `keep`), and Task 3.2 applies it slot by slot. A blank New cell means "not
decided yet", not "keep". Strings in the engine's attributes (`data-topics`, question ids, option
keys) are not copy and are not here — the e2e helper steers by them, and they do not change._

**Pre-filled 10-06-26 from the redesign prototype** (`docs/ambit_Redesign_4/Ambit - First
Exhibition.dc.html`; redesign decision 12): wherever New was empty and the prototype had words for
the slot, they are in New now. Edit any of them — this file still wins over the prototype. Three
are *adapted* rather than copied, because the prototype's sentence would be untrue in the app;
each says so in Notes. Rows marked `none` or `retired` are slots the redesign removes.

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
| Eyebrow              | Ambit · Setup                                                                                                                            | First exhibition · About two minutes | Retake: Ambit · Start again             |
| Title                | Let’s find where to start                                                                                                                | Before we hang anything, a few quiet questions. | Retake: Let’s ask again                 |
| Lede                 | A few questions about what you like — some pictures, some words. Skip any of them. At the end you’ll see what we made of it, and you can change all of it. | Pick whatever you’d look at longer. Nothing here is a test, and you can change every setting at the end. | Ben: "replace every word" |
| Retake warning       | Your answers will replace the topics you have now. _Cancel_                                                                              |     |                                         |
| Begin button         | Begin                                                                                                                                    | Begin |                                         |
| Intro bullets (new)   | —  | Ten quick picks between pictures and pieces of writing · Anything you would rather not see · Your first exhibition, and a feed tuned to it | Three lines, each behind a 6 px green dot |
| Prototype, for reference | _Before we hang anything, a few quiet questions._ / _Pick whatever you would look at longer. Nothing here is a test, and you can change every setting at the end._ | | The study's own intro copy |

## 3. Chrome shared by every question

| Slot                            | Current                                                                                                                          | New | Notes                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| Progress line                   | Step 3 of 9 · Feeling                                                                                                            | `none` | `STEP_LABELS` below supply the word after the dot Redesign decision 1: no step count on screen. |
| Back                            | Back                                                                                                                             | Back | A quiet text link, top-left (decision 1). |
| Forward, nothing said           | Skip                                                                                                                             | `none` | Redesign: a pick advances by itself; each screen has its own way on instead (Skip on the rooms and the pairs · Both, equally · I’d rather look at pictures). **Ben, 10-06-26:** Skip replaced “None of these” and “Neither”. |
| Forward, something said         | Next                                                                                                                             | Continue | Only on the screens that collect several answers (Travel, Rather not, Bonus). |
| Forward, destinations, none     | Nowhere in particular                                                                                                            | Nowhere in particular | A text link beside Continue. |
| Multi hint, capped              | Pick up to three.                                                                                                                | {n} of 3 chosen | `COUNT_WORDS`: one · two · three · four Mono, beside Continue. A chosen card reads “● Chosen”. |
| Multi hint, uncapped            | Pick any.                                                                                                                        | `none` | The Keep grid The Keep grid is gone (keep or pass, one at a time). |
| Pair: either / neither          | Either · Neither                                                                                                                 | Both, equally · Skip | Prototype: "Both, equally" Decision 9: “Both, equally” is the outline button. **Ben, 10-06-26:** the quiet link is a true _Skip_ (scores nothing), not “Neither”. |
| Choice: none                    | None of these                                                                                                                    | Skip | The wing screens and the playoff. **Ben, 10-06-26:** a true skip (scores nothing), replacing “None of these”, which scored the starters down |
| Key hints (new)                 | —  | Keys 1 to 4, or N to skip · Arrow keys, B for both, N to skip · Arrow keys work too · Keys 1 to 4 | Mono, beside each screen’s outline button; desktop only makes sense, but the prototype prints them on the phone too |
| Interpreting                    | Putting it together…                                                                                                             |     | Shown while the free text is mapped                           |
| Save error                      | Something went wrong saving your answers — try again.                                                                            |     |                                                              |
| Free text help                  | Say as much or as little as you like. We use it to choose where to start.                                                        |     |                                                              |
| Free text disclosure            | What you write here is sent to an AI service (OpenRouter) to match it to topics, and we keep it to learn what Ambit is missing.    |     | **Must keep its two facts** (sent to OpenRouter; stored) — SPEC §3.2 |
| Article card kicker             | ESSAY · 12 MIN                                                                                                                   |     | `face-card.tsx`; "min" is the unit word                       |

### Step labels (`lib/interview/steps.ts` `STEP_LABELS`)

_Redesign (10-06-26): the progress line is gone, so these are no longer printed. Leave them._

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
| Prompt, `wings-1..3` (`WING_PROMPT`) | Which would you look at longer?     | Which one is the most interesting? | Ben: "terrible". Prototype sub-line: _Pick one. Go with your first instinct._ Sub-line: _Pick one. Go with your first instinct._ |
| Prompt, `playoff`                 | One more. Which would you look at longer? | Which one is the most interesting? | Prototype: _Of your favourites, which first?_ / _These four pulled you in. Choose the one you would hang first._ The redesign prototype uses the same prompt on all four screens. |

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
| Prompt, `keep`  | Tap any you’d keep.     | Keep or pass. | Prototype (swipe stack, D3): _Keep or pass._ / _Ten quick ones. Drag the card, tap a button, or use the arrow keys._ Redesign: phone sub-line _Ten quick ones. Tap a button, or use the arrow keys._ Desktop heading _Would you keep this one?_ with _Ten quick ones. Go with your gut._ |
| Buttons (D3a)   | —                       | ← Pass · Keep → · counter `01 / 10` · header “Keep or pass” | Prototype: Pass · Keep, and a `01 / 10` counter              |

The ten pictures' labels are text fallbacks only (Creatures · Growing things · Land, sea & sky ·
Space · Machines · Cities · People · Myth · Abstract · Eerie); they follow the wing renames.

### Step 5 — Reading

| Slot                 | Current              | New | Notes                                                                 |
| -------------------- | -------------------- | --- | --------------------------------------------------------------------- |
| Prompt, `read-1`     | Which would you open? | Which would you open? | Prototype sub-line: _Four pieces from the feed. Pick the one you'd read first._ Sub-line: _Four pieces from the feed. Pick the one you’d read first. Set {n} of 2._ Outline button: _I’d rather look at pictures_ (Cut 1 had made it a plain Skip on Ben’s 10-05 note; the prototype brings the words back). |
| Prompt, `read-2`     | And one of these?    | Which would you open? |                                                                       |

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
| Prompt, `destinations`    | Where would you go next?  | Where would you go next? | Prototype sub-line: _Choose up to three. We don't use these as places; they tell us what kind of world you're drawn to._ Sub-line as the prototype has it. |

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
| Prompt, `rather-not`    | Anything you’d rather not see? | Anything you would rather not see? | Prototype sub-line: _We keep these out of your feed. You can change this at the end, or any time later._ — **not true yet** (scores only, design D3); don't promise a filter **Sub-line adapted, not the prototype’s:** _We show less of these. You can change this at the end, or any time later._ Buttons: Continue · Show me everything. |
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
| Prompt, `amount`  | How much reading do you want mixed in?    | How much writing in the feed | Chips are `READING_LABELS` (§1); preselected from the cards Redesign decision 2: no longer a step — a row on the reveal under the heading “Reading mixed in”. |

### Step 9 — Your words (D5)

| Slot                  | Current                                                                           | New | Notes                                              |
| --------------------- | --------------------------------------------------------------------------------- | --- | -------------------------------------------------- |
| Prompt, `look-at`     | What do you like to look at on the internet?                                      | Name one thing you could read about for hours. | Ben: awkward, vague, puts the reader on the spot Eyebrow “Bonus question”. Sub-line adapted to keep the disclosure’s two facts: _Optional. A place, a period, an object, an obsession. It is sent to an AI service (OpenRouter) to match it to topics, and we keep it to learn what Ambit is missing._ Buttons: Continue to your exhibition · Clear and try again. Result line: _Mapped to {n} topics._ |
| Prompt, `read-watch`  | What do you read or watch? Authors, magazines, a favourite film — anything.       | `retired` | Ben: redundant with the above; D5 recommends merging into one D5 answered by the prototype: one free-text question. |
| Placeholder           | _(none today)_                                                                    | Lighthouses, Persian carpets, old seed catalogues | A concrete example or two inside the box would answer "on the spot" |

## 5. The reveal (`reveal-step.tsx`, `exhibition-card.tsx`, `lib/interview/frame.ts`, `exhibition.ts`, `compass.ts`, `config/temperament.ts`)

| Slot                       | Current                                                                                                  | New | Notes                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------- |
| Card eyebrow (D6)          | Your first exhibition                                                                                    | Your first exhibition | `FRAME.eyebrow`. The frame word; "feed / blog / zine or similar" D6 answered: the exhibition frame stays. |
| Title fallback             | First Exhibition                                                                                         | First Exhibition | `FRAME.untitled`. When no look or medium clears the floor: adjective "First", noun "Exhibition" |
| Subtitle                   | _Creatures, growing things and myth. Mostly photography and painting._ (top wings, then top mediums)    |     | `exhibition.ts` `exhibitionSubtitle`; a sentence since 10-06-26, a row of dots before. The word "Mostly" is the only fixed copy |
| Heading                    | Here’s where we’ll start                                                                                 | Your mix |                                                                        |
| Lede                       | Turn anything up, down or off. Ambit wanders sideways from here, and you can change all of this later.   | Set from your answers. Change anything. Topics marked proposed are ones Ambit added to round out the start. | Prototype: _About one post in ten comes from outside this mix, so the feed keeps learning from your likes and saves._ (state the real share, Cut 4) **New adapted:** the prototype says proposed topics “aren’t in Ambit yet”, which decision 4 makes untrue. |
| Retake warning             | This replaces your current topics. _Cancel_                                                              |     |                                                                        |
| Submit, enough             | Start exploring                                                                                          | Open my feed | Prototype: Open my feed                                                |
| Submit, too few            | Keep at least three                                                                                      | Keep at least three |                                                                        |
| Start over (Cut 4)         | —                                                                                                        | Start over | Prototype: Start over                                                  |
| Temperament eyebrow        | Temperament                                                                                              | Temperament |                                                                        |
| Temperament intro (Cut 4)  | —                                                                                                        | Five dimensions that hold across music, film and books. Kept now, they can seed what you watch and listen to later. | Prototype: _Five dimensions that hold across music, film and books. Kept now, they can seed what you watch and listen to later._ |
| Compass eyebrow            | Travel compass                                                                                           | Travel compass |                                                                        |
| Compass poles              | Built / Wild · New / Old · Lively / Still · Near / Far                                                    | Wild / Built · Old / New · Quiet / Lively · Far / Near | Prototype order: the plus pole on the left; “Quiet” for “Still”. |
| Compass sentence parts     | You’d travel for … wild places over cities / cities over wild places · the old over the new / the new over the old · quiet over crowds / crowds over quiet · a long way from home / somewhere close to home |  | `compass.ts` `PHRASES`; joined with commas and "and"       |
| "You’d open" eyebrow       | You’d open                                                                                               | You’d open |                                                                        |
| Reader line, long          | You like a long read, and you went for _essays and criticism_.                                           |     | `exhibition.ts` `readingSummary`; mean ≥ 14 min                         |
| Reader line, short         | You like something short, and you went for _essays_.                                                     |     | Mean ≤ 4 min                                                            |
| Reader line, in between    | You went for _essays and criticism_.                                                                     |     |                                                                        |
| Reader line, none opened   | You’d rather look than read.                                                                             |     | Prototype added _We'll keep writing to a minimum._ — left out: the amount question decides that, and the reader may have set it to anything |
| Kinds, as "went for"       | essays · curiosities · criticism · the archive                                                           |     | `exhibition.ts` `KIND_WENT_FOR`                                         |
| Kept out (Cut 4)           | —                                                                                                        | Kept out · Allow | Prototype: eyebrow _Kept out_, chip suffix _Allow_, empty _Nothing kept out._ |
| Explore line (new)         | —  | About one post in {n} comes from outside this mix, so the feed keeps learning from what you save. | **Adapted:** the number is computed from the feed’s knobs, and “likes” is dropped (Ambit has none) |
| Proposed tag (new)         | —  | Proposed | Green mono, above the topic’s name (decision 4: a row Ambit added, not one the answers scored) |
| Mix headings (new)         | —  | Subjects · Mediums & traditions · Looks · Places · Writing · Reading mixed in | Decision 3. “Places” is not in the prototype; it shows only when a place topic is in the mix |

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

## 7. Outside onboarding — the redesign's copy changes

From the package's README ("Renames / copy changes") and the prototypes, for the screens the
redesign touches (`docs/DESIGN_redesign.md` §6). Same rule: New is what gets built; edit freely.

| Slot                                          | Current                                              | New                                                        | Notes                                                              |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Item credit (`item/credit-line.tsx`)          | from: _source_                                       | from _source_ ↗                                            | No colon; the link is underlined ink, not accent                    |
| Item link-out (`item/link-out-row.tsx`)       | Read the post on _X_ · Read it on _X_ · See it on Public Domain Review | Read the original on _source_ ↗                | One wording, on every picture with a source URL                     |
| Article link-out (`item/reader-item-body.tsx`) | Read on _source_ →                                   | [Read on _source_..]                                       | The bracket link form                                               |
| Desktop item link-out                         | —                                                    | [Read the post on _source_..]                              | Under the large summary                                             |
| Desktop item                                  | —                                                    | ↓ Information                                              | Scrolls to the details                                              |
| "Shared by"                                   | _name_ shared this with you                          | `none`                                                     | The line is removed                                                 |
| Fact label                                    | Maker                                                | By                                                         |                                                                    |
| Article meta strip (new)                      | —                                                    | Source · Reading · Kept in                                 | Values: the source, “_n_ min”, the collection’s name or —           |
| Long-press sheet                              | Closer Look                                          | Closer look                                                |                                                                    |
| Collection row, saved here                    | Already saved here                                   | Saved here                                                 |                                                                    |
| Feed loader                                   | finding something interesting…                       | Finding something interesting…                             | Set in mono uppercase either way                                    |
| Join block body (picture)                     | Ambit is an invite-only feed of public-domain images and writing — no likes, no comments, no one performing for anyone. | Ambit hands you one interesting thing at a time, then quietly steps back. |                                          |
| Join block (article)                          | Ambit is a quieter way to read.                      | Curiosity, without the doomscroll.                         | The picture screen’s title, per the prototype                       |
| Sign-up, mode switch                          | First time? Create your account                      | New here? Create an account                                |                                                                    |
| Sign-up, password placeholder                 | Password (8+ characters)                             | 8+ characters                                              | The label above now says “Password”                                 |
| Sign-up, password hint                        | Passwords need at least 8 characters.                | Needs 8+ characters                                        | Green mono, right of the label                                      |
| Profile identity meta                         | @_handle_                                            | @_handle_ · _n_ kept                                       |                                                                    |
| Profile edit, email hint                      | Only used for your invite and sign-in.               | Email is only used for your invite and sign-in.            |                                                                    |
| Topic tag                                     | suggested                                            | Proposed                                                   |                                                                    |

