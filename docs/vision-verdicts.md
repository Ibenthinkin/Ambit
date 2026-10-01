# Ben's verdicts on the picture disagreements (10-01-26)

The twenty largest disagreements from `docs/vision-comparison.md` (Haiku 4.5 against the stored
flash-lite scores), gone through one at a time with Ben. `vision-comparison.md` is regenerated
by `bun run vision:compare`; this file is the record and is written by hand.

**Result: Haiku was closer on 13 of 20, flash-lite on 7.** Leaving out the three settled by the
Door of Perception rule below, Haiku 10, flash-lite 7. Two of Haiku's wins (8 and 19) were
against a stored 5 with no tags, which looks like the failed-judgment fallback and not a real
flash-lite opinion.

| # | Source | Picture | Stored | Haiku | Ben | Closer |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | doorofperception | Shulgin and his wife, portrait on a hillside | 8 | 2 | 7 | flash-lite |
| 2 | doorofperception | Kashpersky, anatomical digital sculpture | 3 | 8 | rule | Haiku |
| 3 | archive | Coral reef painting with turtles | 8 | 3 | 7–8 | flash-lite |
| 4 | doorofperception | Toshio Saeki | 3 | 8 | rule | Haiku |
| 5 | cma | Plain wooden drawer from a globe table | 4 | 8 | 2 | flash-lite |
| 6 | thisisnthappiness | Furneaux, 1960s swimsuit slide | 6 | 2 | 6–7 | flash-lite |
| 7 | 70sscifiart | Cropped scan of a paperback blurb | 2 | 6 | 3 | flash-lite |
| 8 | kvetchlandia | Vishniac, Berlin 1933 | 5 | 9 | 9 | Haiku |
| 9 | archive | Tiger snarling in snow | 8 | 4 | 8 | flash-lite |
| 10 | doorofperception | Yoshifumi Hayashi ink drawing | 3 | 7 | rule | Haiku |
| 11 | smithsonian | Roman glass pendant, a blob and a tag | 4 | 8 | 2 | flash-lite |
| 12 | thisiscolossal | Halloween parade as famous paintings | 8 | 4 | 5 | Haiku |
| 13 | wellcome | 1899 textbook title page | 7 | 3 | 3 | Haiku |
| 14 | thevaultoftheatomicspaceage | Ko-fi donation banner (mug) | 6 | 2 | with Haiku | Haiku |
| 15 | thevaultoftheatomicspaceage | Ko-fi donation banner (coffee ad) | 6 | 2 | with Haiku | Haiku |
| 16 | thisiscolossal | Sponsored post for an art school | 6 | 2 | 2 | Haiku |
| 17 | kvetchlandia | Jeff Pott, fishnet close-up (2017) | 4 | 8 | 7–8 | Haiku |
| 18 | thisisnthappiness | Molesky, unfinished painting | 8 | 5 | 6 | Haiku |
| 19 | 70sscifiart | Bob Eggleton cityscape | 5 | 8 | 7 | Haiku |
| 20 | kvetchlandia | Retailer's photo of a bass guitar | 6 | 3 | 1–2 | Haiku |

## Decisions Ben made along the way

- **Everything from Door of Perception passes, every post and every image.** The blog was
  designated because the blog is trusted; a judge does not get a veto. Agreed mechanism: a
  score floor of 8 for `doorofperception`, keeping a judge's score when it is higher.
  **To do, later: rescore every Door of Perception row to reflect this.** Not built.
- **Age buys a second look.** A photograph 25 or more years old is not engagement bait for
  showing a swimsuit; its interest is as a personal, historical document. Plain modern swimsuit
  shots still stay out. To go into the picture prompt.
- **Popular is not a fault.** "Wildlife photography is always kind of formulaic, popular" — and
  the tiger is an 8. A bold, crowd-pleasing picture is not marked down for being one.

## Where each judge goes wrong

**Haiku:**

- **Scores the caption, not the photograph** (5, 11): a dull catalogue shot of an object with an
  interesting history got 8 twice. Ben gave both a 2, lower than flash-lite's 4.
- **Too harsh on bold, decorative, popular pictures** (3, 9), both from `archive`. This is most
  of that source's −1.5 shift.
- **Reads an old swimsuit photograph as bait** (6).
- **Gives credit for a scrap of text** (7), and **balked** at a portrait whose title promised
  something else (1: score 2, no tags).

**flash-lite:**

- **Misses promotional content** (14, 15, 16): donation banners and a sponsored post scored 6.
- **Generous to things with nothing to look at** (13 title page, 20 product photo) and to a
  funny idea in an ordinary snapshot (12, most of `thisiscolossal`'s −1.4 shift).
- **Undersells strong photographs** (17), and its fallback 5s hide real 7–9s (8, 19).

## What follows (proposed, not built)

- A picture prompt of its own for the Claude judge (as writing has), saying: judge what is
  visible, not what the caption says about the object; age earns a second look; popular or
  decorative is not a fault; promotional posts score 1.
- The Door of Perception floor, and its rescore.
- Possibly dropping a blog's donation posts before they are scored (my suggestion, not yet
  agreed).
