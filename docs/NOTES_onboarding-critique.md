# Onboarding critique — Ben's first walk of First Exhibition (10-05-26)

Ben walked bank v2 on the dev server (branch `feat/first-exhibition`) and gave these notes screen
by screen. **His verdict on the whole: the mechanics are good — this list is cosmetic**, and it is
to be addressed in the next **sitewide redesign**, not as patches to this branch. Nothing here has
been changed yet. **Update 10-05-26 eve:** Cut 1 of `docs/PLAN_onboarding-critique.md` (branch
`feat/onboarding-trims`) ticks the boxes marked _(Cut 1)_; the cards' size is only part-way there
(the desktop grids are wider — the Keep and Reading cards still wait on Cut 2's rethink). **Priority (Ben, 10-05 afternoon): as soon as possible — this is the next piece of
work, not a backlog.**

## Sitewide (beyond onboarding)

- [ ] **Accent colour** — Ben hates it. Needs a new model, changed everywhere.
- [ ] **Buttons** — the shape and the behaviour, everywhere (Begin / Next / Skip / Back, the
      Either / Neither chips, the amount chips). Same new model.
- [x] **No rounded corners on picture cards.** _(Cut 1, 10-05-26: every questionnaire card and the reveal's card.)_ No other image in the app has them; the
      questionnaire's cards should match.

## The questionnaire as a whole

- [ ] **Every card is too small** — picture cards and text cards alike, worst on desktop.
- [ ] **Rethink how pictures are asked**: a single scrolling feed, or a swipe left/right yes/no
      interface, instead of small grids.
- [ ] **All the copy** — prompts, labels, buttons — is to be rewritten.

## Screen by screen

### Intro

- [x] The copy sits at the top while the Begin button is pinned at the very bottom — fix the
      layout. _(Cut 1: Begin sits under the copy.)_
- [ ] Replace every word: "Ambit · Setup" / "Let's find where to start" / "A few questions about
      what you like — some pictures, some words. Skip any of them. At the end you'll see what we
      made of it, and you can change all of it."

### Step 1 — Rooms (three wing screens + the playoff)

- [ ] New prompt — "Which would you look at longer?" (and the playoff's "One more. Which would you
      look at longer?") is terrible.
- [ ] Rethink the categories. Disliked by name: "Space & tomorrow", "Creatures", "Cities &
      buildings", and especially **"Body & mind"**; the second screen's "Growing things",
      "Machines & how things work", "People & daily life", "Food & the everyday" fall under the
      same note.
- [x] Remove the category label on each picture — the picture should stand on its own. _(Cut 1;
      the label is still the accessible name and the fallback when a picture fails.)_
- [x] Bigger pictures on desktop. _(Cut 1: the wide column, four across ≈ 265 px a card.)_

### Steps 2–3 — Hands and Feeling (the pairs)

- [x] Bigger images. _(Cut 1: ≈ 370 px a side on desktop.)_
- [ ] Replace all the copy: the prompts ("Same subject, different hands." / "Same subject, a
      different feeling.") and the side labels ("Photograph", "Natural-history plate", "Bold",
      "Soft", "Night", "Day"…).
- [ ] The Either / Neither buttons' look (see Sitewide → Buttons).
- [x] Square corners (see Sitewide).

### Step 4 — Keep (the ten-picture grid)

- [ ] Same notes as steps 1–3: copy, labels, corners, buttons.
- [ ] Cards too small — they look terrible.
- [ ] The grid is fine on mobile, **horrible on desktop** (five across today).

### Step 5 — Reading (the article cards)

- [ ] The cards are tiny and look unbelievably bad.
- [x] Drop "I'd rather look at pictures" — a plain Skip (or similar) instead. _(Cut 1.)_

### Step 6 — Travel (the destination cards)

- [ ] The cards look awful and are unreadable.
- [x] Remove the coordinates. _(Cut 1.)_

### Step 7 — Rather not

- [ ] Same notes: copy, button look, sizing.

### Step 8 — How much reading

- [ ] Same notes: copy, button look, sizing.

### Step 9 — Your words (the two free-text questions)

- [ ] The idea is fine; the questions are awkward ("What do you like to look at on the internet?"
      / "What do you read or watch? Authors, magazines, a favourite film — anything.").
- [ ] The two feel redundant, and too vague — they put the reader on the spot.

### Step 10 — About you

- [x] **Remove the step entirely** (age range, location, gender). _(Cut 1: step gone, columns
      dropped by migration 0014 — runs at the next deploy's boot.)_ Note this is also the trial's
      exit: SPEC §5.3a says the three `user` columns can be dropped if it goes.

### The reveal

- [ ] **Rename away from "First Exhibition"** — toward feed, blog, zine or similar; not decided.
- [ ] **Bring back what the study's design handoff had** and the build left out
      (`docs/first-exhibition/study-design.md`, `study-handoff.md`). Ben's read: the packaging
      from Claude Design may not have been explicit enough — so the next pass should go through
      the study's prototype screen by screen and list what the reveal is missing before
      designing.

## Not in this list

The mechanics — the steps, the playoff, the scoring, the reading default, the stored taste — are
good as built. Two open questions from the build stand apart from this critique and are in
`log.md` 10-05: bank v2 has no path to `the-ocean`, and declining both reading screens preselects
"None".
