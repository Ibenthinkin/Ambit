# Handoff — sources round 4: eight Tumblr blogs, probed and sampled

**Written:** 09-13-26, by the session that probed and sampled all eight (Ben asked for the
hands-on steps to be done for him). **Status: verdicted 09-13-26 — Ben agreed with every
recommendation in §2.** **Kept:** `jareckiworld`, `kvetchlandia` (on a 10k–15k budget).
**Parked:** `2000-lightyearsfromhome` (the swap-in if contemporary photography is ever wanted),
`semioticapocalypse`, `ffactory`, `lovejapanese80s`, `noosphere`, `general-cybernetics`.
**Both keeps registered 09-15-26** — config rows on the factory (`jareckiworld` walkQuota 13,700,
the newest half; `kvetchlandia` 12,500, the middle of Ben's range), fixtures recorded live from
three depths, both in `SUSPENDED_SOURCES` until their walks are scheduled. `stats:walk` on each
re-read the sample from the curation cache (140 cached / 10 fresh) at 8.67 / 99% and 8.46 / 96%.

The eight, as given: `2000-lightyearsfromhome.tumblr.com`, `noosphe.re`,
`tumblr.com/kvetchlandia`, `tumblr.com/jareckiworld`, `tumblr.com/semioticapocalypse`,
`tumblr.com/general-cybernetics`, `tumblr.com/ffactory`, `lovejapanese80s.tumblr.com`.

---

## 0. What a next session does

1. ~~Wait for Ben's Keep / Park per blog.~~ Done 09-13-26 — see the status line. The six parked
   blogs are not registered at all, so there is nothing to add to `SUSPENDED_SOURCES` for them.
2. ~~For each Keep (`jareckiworld`, `kvetchlandia`): a `blogs.ts` row (with a `walkQuota` — every one of these is big), one line in
   `tumblr-blogs.ts`, an id in `types.ts` / `topics.ts` `WALK_SOURCES` / `sources/index.ts`, and
   a fixture — exactly round 3's recipe (`docs/HANDOFF_tumblr-round3.md` §1, §5).~~ Done 09-15-26.
3. ~~**Use the ids in §1's first column.** The curation cache is keyed `source:sourceId`, and
   the 1,200 items sampled here were cached under those ids, so `bun run stats:walk <id>`
   re-reads them free once they are registered.~~ Done — both re-read from cache. `noosphe.re`'s id here is `noosphere`.
4. ~~Anything kept but not yet walked goes in `SUSPENDED_SOURCES` until its walk is scheduled.~~
   Both are there. **Next:** walk them one at a time, `jareckiworld` first — lift it from
   `SUSPENDED_SOURCES`, `bun run ingest --source jareckiworld`, read the summary line (un-homed
   count and tag histogram) and `stats:walk`, then `kvetchlandia` with an eye on `portraits`.

---

## 1. The numbers

**Method, same as round 3.** A live probe of 50 posts at 0 / 25 / 50 / 75% depth of each
archive (200 posts each), then a 150-item curator sample of the newest posts — `stats:walk`'s
own logic, run from a scratch script over an ad hoc `BlogConfig` so nothing had to be registered.
Curated in classify mode against the local 159-topic vocabulary; nothing written to the DB.

**One artefact to know about if you repeat this.** `structuralFloor` exempts a source from its
three rules only when the id is in the compile-time `WALK_SOURCES` list, so an *unregistered* id
gets the museum floor: the first pass floored 44–87% of four blogs on `dup-title` (reblog
captions repeat) and `thin-summary`. The numbers below apply the exemption a registered Tumblr
walk gets (walk images keep everything), which is what production would do.

| id | posts | picture posts | pics/post | est. items | newest post | reblogs | tags/post | caption median |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| `jareckiworld` | 27,289 | 100% | 1.00 | ~27,300 | 09-13-26 | **0%** | 4.3 | 69 |
| `kvetchlandia` | 57,763 | 91% | 1.01 | ~52,900 | 09-10-26 | 8% | 0.0 | 63 |
| `2000-lightyearsfromhome` | 53,465 | 100% | 1.00 | ~53,500 | 09-11-26 | 56% (newest: 100%) | 0.0 | 40 |
| `semioticapocalypse` | 19,921 | 100% | 1.00 | ~19,900 | **07-04-26** | 0% | 13.8 | 72 |
| `ffactory` | **140,950** | 99.5% | 1.37 | **~192,000** | 09-13-26 | 99.5% | 0.1 | 55 |
| `lovejapanese80s` | 50,359 | 95% | 1.24 | ~59,200 | 09-12-26 | 75% | 3.7 | 21 |
| `noosphere` | 12,910 | 47% | 1.11 | ~6,600 | 09-11-26 | 3% | 6.3 | 0 |
| `general-cybernetics` | 10,504 | 99.5% | 1.36 | ~14,200 | 09-13-26 | 85% | 0.6 | 18 |

| id | curated avg | ≥ 8 | histogram | toItem errors | un-homed | topics used | leading topics |
|---|---:|---:|---|---:|---:|---:|---|
| `jareckiworld` | **8.69** | **99%** | `7:1 8:46 9:102 10:1` | 0 | 0% | 53 | illustration 84, painting 79, surreal 59, abstract 34 |
| `kvetchlandia` | 8.44 | 95% | `4:1 7:6 8:68 9:74 10:1` | 5 | 0% | 39 | portraits 111, photography 86, literature 36, music 33 |
| `semioticapocalypse` | 8.36 | 93% | `7:11 8:74 9:65` | 1 | 0% | 55 | photography 114, portraits 60, black-and-white 37 |
| `2000-lightyearsfromhome` | 8.30 | 97% | `7:4 8:97 9:49` | 0 | 0% | 54 | photography 112, portraits 60, street-photography 41 |
| `ffactory` | 7.83 | 70% | `2:1 4:4 7:40 8:69 9:36` | 2 | 1% | 59 | fashion 51, portraits 46, film 39, illustration 35 |
| `lovejapanese80s` | 7.70 | 65% | `4:5 6:3 7:45 8:71 9:26` | 2 | 0% | 36 | japan 75, illustration 65, fashion 46, graphic-design 34 |
| `noosphere` | 7.66 | 64% | `1:1 4:5 6:2 7:46 8:70 9:26` | **116** | 1% | 45 | science 76, diagram 54, graphic-design 49, books 29 |
| `general-cybernetics` | 7.00 | 55% | `1:5 2:13 4:11 7:39 8:36 9:46` | 1 | 12% | 41 | science-fiction 79, illustration 44, technology 36 |

Benchmarks: 70sscifiart 8.72 / 97% (the strongest source in the corpus), thisiscolossal 8.70 /
97.5%, pdr 8.39 / 87%, sovietpostcards 7.63 / 61%, thingsorganizedneatly 7.90.

**robots.txt:** all eight serve Tumblr's platform default — byte-identical to 70sscifiart's apart
from the `Sitemap:` line — and the repo's `robotsDisallowsAll(…, "Ambit")` returns false for
each. Ben's standing call (`HANDOFF_tumblr-walk.md` §3.4) covers them; nothing new to decide.

**Cost, at the measured $0.000235/item:** this session's samples were ~1,200 fresh curator calls,
**~$0.28**. A full walk is ~$6.40 jareckiworld, ~$12.40 kvetchlandia, ~$12.60 2000-lightyears,
~$4.70 semioticapocalypse, ~$13.90 lovejapanese80s, **~$45 ffactory**; the image cache adds
~150 KB/item on the volume (~4 GB for jareckiworld, ~8 GB each for kvetchlandia and
2000-lightyears).

**Corpus context (local, 09-13-26):** 164,423 items. `painting` has 15,026 members, `portraits`
6,524, `black-and-white` 5,983, `photography` 26,759, `diagram` 810.

---

## 2. Each blog, and a recommendation

### `jareckiworld` ("Pierre Menard") — **recommend Keep**

The best sample of the round, level with 70sscifiart: **8.69, 99% ≥ 8**, nothing below 7. It's
an original poster, not a reblogger (0 of 200 sampled posts are reblogs), and every caption is
the same structured credit — `Artist (dates) — Title (medium, year)` — so every card gets a real
title. 4.3 tags/post of national-school vocabulary (`polish art`, `czech art`, `feminist art`,
`psychedelic art`). Global 20th–21st c. painting and illustration, much of it by artists nobody
else in the corpus carries. It lands mostly in `painting`, one of the thinner art topics. Some
fine-art nudes (the contact sheet has several); nothing the curator marked down.
**Budget:** at ~27,300 items the whole archive is smaller than 70sscifiart's walk so far; newest
half (~13,600) if the volume matters.

### `kvetchlandia` — **recommend Keep, with a small budget**

Canonical 20th c. photography and portraiture — Rodchenko's Mayakovsky, Man Ray, Penn, Cartier-
Bresson, Adams, Wegman — with credits the corpus can use as titles (`Photographer Subject, Place
Year`). 8.44 / 95% ≥ 8. Mostly original posts (8% reblogs). Two things to know. (1) **No tags at
all**, so topic mining only has the curator's aesthetic tags to go on. (2) **Portrait capture:** 111
of 150 sampled items land in `portraits`, a 6,524-member topic, so a 26k newest-half walk would put
~19k items there and make the topic mostly this blog. Per-(topic, source) pool sampling (20 rows)
and `sourceCap` (3 cards a page) keep a page from being a wall of it, but the topic's *meaning*
still shifts. A 10k–15k budget is the middle option. Captions often end in a long quote or lyric
(p90 491 characters); `capSummary` cuts those at 600.

### `2000-lightyearsfromhome` — **Keep one of the three photo blogs, and this is the second choice**

Fine-art and contemporary photobook photography (Giacomelli, Pérez Siquier, Rosenblum, Danny
Lyon, a lot of recent work) — the most *current* of the three photography blogs. 8.30 / 97% ≥ 8.
But it's a reblog blog: **all 50 of the newest posts are reblogs**, with no tags, and captions shaped
`sourceblog: credit`. The link card's credit and link-out then go to a middleman rather than a
creator or an original poster, which serves the "drive readers to the blog" posture less well
than kvetchlandia does. It overlaps kvetchlandia and semioticapocalypse heavily (photography 112,
portraits 60).

### `semioticapocalypse` — **recommend Park**

A good sample (8.36 / 93%) of the same classic black-and-white photography, but it's the weakest
of the three photo blogs for fixable-but-real reasons. **Dormant:** the newest post is 07-04-26, and
its newest 50 posts span nine months. **Caption boilerplate:** 35 of 200 captions end in
`I Am Collective Memories • Follow me, — says Visual Ratatosk`, which would land in summaries
unless the factory learns to strip it. **Tag noise:** 13.8 tags/post, mostly one tag in six languages
(`black and white · noir et blanc · preto e branco · schwarzweiß · 黒と白 · 白黒`), the synonym
problem `DESIGN_tag-aliases.md` is about, at its worst.

### `ffactory` — **recommend Park (scale)**

Eclectic and good-looking — museum objects, 1920s film stills, fashion, embroidery, Yellow Pages
covers — but it's a pure reblog stream (199 of 200) with 0.1 tags/post, and the lowest-scoring of
the art blogs at 7.83 / 70% (a gore still at 2). The deciding number is size: **~192,000 items**
would more than double the corpus from one blog, and even a 10% budget is ~19k items of
someone else's reblogs. Eclectic is also what the feed's WILD/DRIFT tiers already produce from
sources Ambit has.

### `lovejapanese80s` — **recommend Park, on content not quality**

A texture the corpus doesn't have: 1980s Japanese advertising, Famicom and Hitachi ads, Macross
and Gundam posters, *Animec* and *Shōnen Jump* covers, Seibu department-store posters. Its best
items are 9s. The average is 7.70 / 65% because **a real share of the archive is idol gravure** —
swimsuit and bikini photobook scans of 1980s idols (Akina Nakamori, Yoshie Kashiwabara, 紘川淳
photobooks). Idols of that era commonly debuted at 14–16, so some of these photographs are likely
to show subjects who were minors at the time — not verified per image, and not something to find
out after a walk. The curator scored the ones in this sample **4, and the feed's
`scoreFloor` is `gte 4`, so they would be drawn.** There's no tag that cleanly separates
gravure from ads (`写真集` catches some). Un-parking wants a content filter that doesn't exist.
Also: many titles are Japanese-only (`中森明菜`, `スプライト`).

### `noosphere` (noosphe.re) — **recommend Park, marginal**

Small (~6,600 picture items) and well tagged (6.3/post), with the science/diagram texture the corpus
is thinnest in (`diagram` has 810 members). But more than half its posts carry no picture: in
the newest pages **116 posts threw for every 150 items offered**, because they're quote posts in
`regular` bodies. What does carry a picture is uneven: book covers, dictionary screenshots, a
typeset short story, and a run of national flags and state seals the curator scored 4. Cheap
enough (~$1.60) that a Keep costs nothing, but the cards would read as a mood board more than as
pictures.

### `general-cybernetics` ("Ancient Military Installation") — **recommend Park**

Lowest scores of the round: 7.00 / 55%, 29 of 150 at 4 or below, and the un-homed 12% averages
1.83. A cyberpunk/militaria mood board: Ghost in the Shell production art (the curator's 9s),
alongside Spetsnaz and Vietnam War photos, Resident Evil stills, fetish-anthology images, and
lingerie snapshots. 85% reblogs, and 46 of 150 cards would be caption-less, titled with the blog
name. Off-brand for a calm feed; the mecha concept art is reachable through 70sscifiart and the
vault.

---

## 3. Suggested shape, if Ben agrees with §2

**Keep `jareckiworld` (whole archive or newest half) and `kvetchlandia` (10k–15k budget).**
Together that's ~37k–42k items, about +25% on the local corpus at ~$9 of curation, and it fills
`painting` and `portraits`, two topics that are thin now. `2000-lightyearsfromhome` is the swap-in
if Ben wants contemporary photography over the canonical kind. The other five park, each for a
reason stated above; none of them was parked on its numbers alone.

---

## 4. Reproducing

Scratch scripts (session scratchpad, not in the repo): a probe over `/api/read/json` at four depths
using `tumblr.ts`'s own `expandPictures`/`htmlToText`; a copy of `scripts/walk-stats.ts` that
builds `tumblrWalker()` from an inline `BlogConfig` and skips `structuralFloor` (§1's artefact);
and ffmpeg contact sheets (24 pictures per blog, six per depth). **`sharp` hangs under Bun 1.4 on
this machine** — even `sharp({create}).png()` on a 10×10 canvas never resolves in a `bun run`
script — hence ffmpeg. Registering a blog and running `bun run stats:walk <id>` reproduces the
curator numbers free from cache.
