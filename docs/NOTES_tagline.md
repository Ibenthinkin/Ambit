# The tagline — "Wander the best of the internet"

_A record of the brainstorm on 10-09-26 that replaced "A quieter way to be curious." Ben's
description of Ambit is kept verbatim because it is the best statement of the product anyone
has written, and the next copy task should start from it, not from this document's
conclusions._

**Status:** settled and built on `feat/landing-copy`. The landing design doc's D9 carries the
short form (`docs/DESIGN_landing-redo.md`, amendment 10-09-26).

## 1. Ben's description of Ambit (verbatim, 10-09-26)

> let's brainstorm a new slogan or tagline for ambit. a quieter way to be curious...doesnt quite
> capture it. Here's how what I think Ambit is: a portal into the best stuff from the present
> back to the golden age of the internet. there is an algorithm, we want to show you things you
> want to see and the pool is too big for it to be random. But the algorithm is out in the open
> for you to see and change as you see fit. We also use the algorithm to show you things that
> you might want to see that are adjacent to what you like, new things that maybe you never
> would have thought of or been shown. most socail apps just feed you exactly what they think
> you want the most, we show you some other stuff right next to that. Wander around iamges and
> articles free of ads, surveilence, and other peoples dumbass opinions. It's like a miture of a
> blog, a magazine, a gallery, an rss reader, an infinite feed designed to stimulate the mind,
> not hypnotize it

Read as claims, that is five things, and the old line covered only the first:

1. **Calm** — no ads, no surveillance, no one else's opinions.
2. **The best stuff**, from the present back to the golden age of the internet.
3. **An algorithm that exists and is honest** — too big a pool to be random, and the dials are
   the reader's to see and change.
4. **Adjacency** — the algorithm also shows what sits next to what you like, which social feeds
   never do.
5. **Stimulate, not hypnotize.**

## 2. Round one — candidates by angle

The first pass put a few lines under each claim, so Ben could pick an angle before a wording.

| Angle | Candidates |
| --- | --- |
| Stimulate, not hypnotize | Made to stimulate, not hypnotize. · A feed that wakes you up. · Curious, not captured. |
| Adjacency | What you like, and what's next to it. · Next door to what you love. · Everything you'd look for, and the things beside it. · A little off your path, on purpose. |
| The open algorithm | An algorithm you can see. And change. · The only feed that shows its work. · Your feed, your dials. |
| Nothing extractive | A feed that wants nothing from you. · No ads. No tracking. No comments. Just the good stuff. · Pictures and writing, and nobody's opinion about them. |
| The golden-age internet | The internet, before it got loud. · The best of the web, from today back to when it was good. · The good internet, hand-picked. |
| Wander / the name | Wander, don't scroll. · Room to wander. · Widen your ambit. · Within reach, and just beyond it. |
| The mixture of forms | Part magazine, part gallery, no end. · A magazine with no last page. |

Claude's pick from that round was "What you like, and what's next to it." (adjacency is the one
claim no other feed makes), with "Made to stimulate, not hypnotize" as the manifesto line. The
observation that stuck: one line cannot carry five claims, so the pattern is a short line plus a
second register beneath it.

## 3. Ben's two lines

Ben proposed **"Wander through the best of the internet"** and **"Ambit — the internet's quiet
car"**.

- The wander line carries three claims at once — wander (not scroll), best (curated, not
  random), the internet (the whole span). "Through" was the weak word: it makes the internet a
  corridor; "Wander the best of the internet" makes it a place. "The best of the internet" is a
  worn phrase from listicles, but it is true here and plain, and plainness won.
- The quiet car is the better idea and the riskier line: funny, a real image, calm in four
  words. Two cautions. It only lands for people who have ridden a train with a quiet car (the
  Northeast Corridor, some European lines, few people under 25). And it says what Ambit removes,
  nothing about what it gives, so it needs a second line beside it.

Verdict: the two fit together as line and sub-line, in that order. The wander line is the one
that survives five years; the quiet car is the one a friend grins at.

## 4. Why not two lines on the landing

Ben: "the current landing is only one line, won't adding another look awkward?" Yes, and for a
mechanical reason: the overture (`components/landing/overture.tsx`) is one `whitespace-nowrap`
row whose tail clips into the wordmark over 2.2 s. A second line has nowhere to go in that
motion — it either sits under the mark after the collapse (breaking the 09-26-26 rule that no
text hovers over the reel) or collapses too, which is two things moving at once.

But the landing already has two places for copy: the overture's one line, and the sign-in
sheet's headline plus paragraph (`auth-sheet.tsx`), where the headline used to repeat the
overture. So the two registers go one each: **the overture says what Ambit is, the sheet says
what it feels like.** No screen gains a line.

## 5. "…in peace and quiet" — too long

Ben: "AMBIT — Wander the best of the internet in peace and quiet. too long?" Yes, for three
reasons:

| Tail | Characters | Estimated row at 15 px, phone |
| --- | --- | --- |
| A quieter way to be curious. (old) | 31 | ~320 px |
| Wander the best of the internet. | 35 | ~350 px |
| Wander the best of the internet in peace and quiet. | 54 | ~500 px |

- A 402 px phone clips a 500 px no-wrap row at both ends — "AMBIT" lost on the left, "quiet."
  on the right. (Estimates from average glyph widths; the phone is the honest check.)
- The tail starts clipping after the 1.4 s hold. Seven words are read by then; ten are not.
- "In peace and quiet" and "the internet's quiet car" say the same thing one screen apart.

Shorter calm variants were offered ("Wander the internet's best in peace", 38) and declined; the
quiet is the sheet's job.

## 6. Decision

| Where | Was | Is |
| --- | --- | --- |
| Overture (`TAGLINE`) | ` — A quieter way to be curious.` | ` — Wander the best of the internet.` |
| Sheet headline | A quieter way to be curious. | The internet’s quiet car. |
| Sheet paragraph | No feeds engineered to keep you. Ambit hands you one interesting thing at a time, then quietly steps back. | Pictures and writing from today back to the good old web. An algorithm you can see and change. No ads, no tracking, no comments. |

The paragraph is Claude's draft on Ben's "I plan to rewrite the pitch paragraph too" — it picks
up the two claims (the span, the honest algorithm) the tagline cannot carry, and ends on the
calm. The overture constant feeds both hosts, `/` (the explore screen) and the parked reel at
`/dev/landing`.

## 7. What changed, and what is left

- `src/components/landing/overture.tsx`, `auth-sheet.tsx`, their two test files, the dev
  tokens page's type sample, SPEC's `/` paragraph, and D9 of `docs/DESIGN_landing-redo.md`.
- Verified: the landing, explore and app unit suites (16 files, 160 tests), Prettier, ESLint,
  `tsc`.
- **Not verified:** the one-row fit on a real phone at 402 px. The new tail is four characters
  longer than the old; confirm "AMBIT" and the full stop are both on screen before the collapse.
- **Untouched:** the item page's join block, "Ambit is a quieter way to read."
  (`components/item/join-cta.tsx`) — the last place the old voice survives, and its own small
  decision.
