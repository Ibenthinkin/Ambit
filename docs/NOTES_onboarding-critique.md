# Onboarding critique — Ben's first walk of First Exhibition (10-05-26)

Ben walked bank v2 on the dev server (branch `feat/first-exhibition`) and gave these notes screen
by screen. **His verdict on the whole: the mechanics are good — this list is cosmetic**, and it is
to be addressed in the next **sitewide redesign**, not as patches to this branch. Nothing here has
been changed yet.

## Sitewide (beyond onboarding)

- [ ] **Accent colour** — Ben hates it. Needs a new model, changed everywhere.
- [ ] **Buttons** — the shape and the behaviour, everywhere (Begin / Next / Skip / Back, the
      Either / Neither chips, the amount chips). Same new model.
- [ ] **No rounded corners on picture cards.** No other image in the app has them; the
      questionnaire's cards should match.

## The questionnaire as a whole

- [ ] **Every card is too small** — picture cards and text cards alike, worst on desktop.
- [ ] **Rethink how pictures are asked**: a single scrolling feed, or a swipe left/right yes/no
      interface, instead of small grids.
- [ ] **All the copy** — prompts, labels, buttons — is to be rewritten.

## Screen by screen

### Intro

- [ ] The copy sits at the top while the Begin button is pinned at the very bottom — fix the
      layout.
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
- [ ] Remove the category label on each picture — the picture should stand on its own.
- [ ] Bigger pictures on desktop.

### Steps 2–3 — Hands and Feeling (the pairs)

- [ ] Bigger images.
- [ ] Replace all the copy: the prompts ("Same subject, different hands." / "Same subject, a
      different feeling.") and the side labels ("Photograph", "Natural-history plate", "Bold",
      "Soft", "Night", "Day"…).
- [ ] The Either / Neither buttons' look (see Sitewide → Buttons).
- [ ] Square corners (see Sitewide).

### Step 4 — Keep (the ten-picture grid)

- [ ] Same notes as steps 1–3: copy, labels, corners, buttons.
- [ ] Cards too small — they look terrible.
- [ ] The grid is fine on mobile, **horrible on desktop** (five across today).

### Step 5 — Reading (the article cards)

- [ ] The cards are tiny and look unbelievably bad.
- [ ] Drop "I'd rather look at pictures" — a plain Skip (or similar) instead.

### Step 6 — Travel (the destination cards)

- [ ] The cards look awful and are unreadable.
- [ ] Remove the coordinates.

### Step 7 — Rather not

- [ ] Same notes: copy, button look, sizing.

### Step 8 — How much reading

- [ ] Same notes: copy, button look, sizing.

### Step 9 — Your words (the two free-text questions)

- [ ] The idea is fine; the questions are awkward ("What do you like to look at on the internet?"
      / "What do you read or watch? Authors, magazines, a favourite film — anything.").
- [ ] The two feel redundant, and too vague — they put the reader on the spot.

### Step 10 — About you

- [ ] **Remove the step entirely** (age range, location, gender). Note this is also the trial's
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
