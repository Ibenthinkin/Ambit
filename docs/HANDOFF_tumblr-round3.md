# Handoff — sources round 3: nine Tumblr blogs on a `tumblr.ts` factory

**Written:** 09-05-26, by the session that probed, built and sampled all nine.
**Updated:** 09-05-26 (same day) with Ben's first four verdicts.
**Status:** code on `feat/tumblr-blogs-round3`, all tests green, **all nine parked in
`SUSPENDED_SOURCES`** — but now for two different reasons. Nothing has been written to any
database. **Four are parked by Ben's verdict and are settled; five are still awaiting one.**
§2 is the table, and it is the only thing outstanding.

---

## 0. Start here — what a next session does

**Ben has ruled on four of the nine (09-05-26). Do not re-open those four.**

> **Parked by verdict — settled, leave alone:** `nemfrog`, `humanoidhistory`, `dreamsrecurring`,
> `vintagegeekculture`. These were sampled, judged and set aside. Un-parking one is reversing a
> decision, not finishing one, so it needs Ben to say so again.
>
> **Parked pending a verdict — the open five:** `70sscifiart`, `sovietpostcards`,
> `thisisnthappiness`, `thevaultoftheatomicspaceage`, `toiich`.

1. Take Ben's verdict on **the five**, using the table in §2. Nothing else is outstanding.
   Read **§2.3 first** — the two weakest of the five are mostly measuring the thin-summary floor
   rather than themselves, and their post-floor numbers rest on 10–12 curated items.
2. For each **Keep**: remove its id from `src/server/config/suspended-sources.ts` (from the
   *pending* group), then run the full walk — `bun run ingest --source <id>` (no `--quota`, so
   `--prune` stays meaningful). §3 has the per-blog cost and wall-clock, §4 the traps.
3. Anything not kept stays exactly as it is. A parked row costs nothing and is already
   documented; there is no cleanup to do, and no rows were ever written.

**Do not run a full walk on several blogs as a batch.** §3 says why in numbers.

---

## 1. What was built

`src/server/services/sources/tumblr.ts` — the Tumblr-walk factory, extracted from
`things-organized-neatly.ts` exactly as `wp-rest.ts` was extracted from `doorofperception.ts` in
round 2, and for the same reason: the second blog of a shape is a config row, not a file.

`things-organized-neatly.ts` **stays bespoke and untouched** — Ben's standing call for shipped
code with real rows behind it. `tumblr.test.ts` proves the factory is byte-identical to it on its
own fixture, which is what makes leaving the duplication safe.

The nine blogs are one line each in `tumblr-blogs.ts`, one config row each in `config/blogs.ts`
(where the probe evidence for each lives), and one id each in `types.ts`, `topics.ts` and
`sources/index.ts`. Fixtures were recorded live from three depths of each archive.

**Two bugs the live walk exposed, both fixed in the factory, both new-blog-only.**

- **Tumblr's alt-text badge.** The newer editor emits
  `<span class="tmblr-alt-text-helper">ALT</span>` *inside* caption markup, so `htmlToText()`
  turned it into the literal word "ALT" and `deriveTitle()` made it the card's title. It hit
  **24% of sampled 70sscifiart captions**. `stripCaptionChrome()` removes it span and all.
- **Essay-length captions.** A blog answering an ask writes an essay in the same field a caption
  lives in: **vintagegeekculture's caption p99 is 5,582 characters and its longest sampled is
  12,268**. Storing that is republishing the article, whatever the field is called, and the
  08-20-26 rights posture is explicit that a card is "a short excerpt … never a republished
  article". `capSummary()` cuts to **600 characters** at a word boundary. 600 is the corpus's own
  norm, not an invented number: the three already-ingested blogs sit at a summary p95 of
  **199 / 410 / 506**, and pdr's longest row is 590.

**`things-organized-neatly.ts` has the same latent alt-badge gap** and is still walked nightly.
It is not a live problem — its 1,720 stored rows were queried and **zero** carry the badge — so
the frozen file was left frozen rather than edited on a guess. If it ever posts through the newer
editor it will produce an "ALT"-titled card. The fix is to route its two caption reads through
`stripCaptionChrome`. Ben's call, not a silent edit.

---

## 2. The verdict table — what each blog actually is

All nine were probed live 09-05-26 (200 posts per archive, at 0/25/50/75% depth) and then sampled
with `bun run stats:walk <id> --quota 150`, which walks and curates exactly as ingest would and
**writes nothing**. The curation cache is warm, so re-running any of these is free.

| blog | verdict | archive | stored % of offered | curated avg | ≥8 | un-homed | est. full-walk rows |
|---|---|---:|---:|---:|---:|---:|---:|
| **nemfrog** | **Parked** | 45,094 | **91%** | 8.15 | 87% | 7% | ~41,000 |
| **humanoidhistory** | **Parked** | 48,466 | 56% | 8.29 | 82% | 11% | ~27,100 |
| **dreamsrecurring** | **Parked** | 20,636 | 38% | **8.72** | **96%** | 7% | ~7,800 |
| **vintagegeekculture** | **Parked** | 18,930 | 33% | 7.44 | 56% | 14% | ~6,200 |
| **70sscifiart** | *open* | 34,836 | 55% | **8.65** | **96%** | 2% | ~19,200 |
| **sovietpostcards** | *open* | 25,784 | 44% | 7.79 | 70% | 17% | ~11,300 |
| **thisisnthappiness** | *open* | 108,982 | 7% | 8.10 | 90% | 40% | ~7,600 |
| **thevaultoftheatomicspaceage** | *open* | 37,494 | 8% | 8.00 | 83% | 17% | ~3,000 |
| **toiich** | *open* | 11,308 | 22% | 7.58 | 70% | 24% | ~2,500 |

**Read against the corpus's own benchmarks:** thisiscolossal 8.70 / 97.5% ≥8 (the strongest source
in the corpus), pdr 8.39 / 87%, thingsorganizedneatly 7.90.

### 2.1 The four Ben parked (09-05-26)

Settled. Kept here because a parked source still needs its evidence on record — if one is ever
revisited, this is what it was judged on, and nothing needs re-sampling.

- **nemfrog** — the highest keep-rate ever measured in this corpus: **91% of everything offered**
  clears the floor, at 8.15 with 6.9 tags/post of real scanned-plate vocabulary. Also the round's
  single biggest contributor at ~41,000 rows.
- **humanoidhistory** — 8.29 and 82% ≥8, the second biggest at ~27,100 rows. The widest post-type
  spread of the nine, so it also had the highest `toItem` error count (6 of 150), all of them
  picture-less post types being counted rather than skipped.
- **dreamsrecurring** — the highest average of the nine at **8.72 / 96% ≥8**, level with
  thisiscolossal. Its weakness is metadata, not pictures: **0.2 tags/post**, so it arrives with
  almost nothing for topic mining to propose from.
- **vintagegeekculture** — the **weakest scores of the nine**, 7.44 with only 56% ≥8, and the blog
  whose essay-length caption answers forced `capSummary()` into existence (§1).

Stated as arithmetic and not as anyone's reasoning: these four are **~82,100 of the round's
~125,700 estimated rows**, so parking them removes about **two thirds** of what round 3 would
have added to a 21,892-item corpus.

### 2.2 The five still open

- **70sscifiart (8.65 / 96% ≥8)** is now the strongest open candidate and the highest scorer
  left — level with thisiscolossal, the strongest source in the corpus — at ~19,200 rows. It
  throws most of its archive away at the floor, which is the floor working: what survives is the
  captioned minority. Only **2%** of what it keeps is un-homed, the lowest of the nine.
- **sovietpostcards is the most *coherent*** rather than the highest-scoring: its un-homed tags
  are `ussr 8 · russia 6 · 1960s 5 · soviet union 4`, a clean cluster that would make a good
  grown topic. It is the one blog here with a real Cut 2 topic-capture angle, and a mild one.
- **thevaultoftheatomicspaceage and thisisnthappiness are structurally poor**, not badly curated —
  and the two are *not* equally weak, which §2.3 unpacks. The vault has **zero tags on 200 sampled
  posts** and a median caption of 0 characters. thisisnthappiness keeps ~7% of the largest archive
  probed. The vault is the stronger Cut; thisisnthappiness is genuinely arguable.
- **toiich** is 197-of-200 `regular` posts, keeps 22%, and 24% of that is un-homed. Its captions
  are film titles ("Au Hasard Balthazar (1966), dir."). Marginal.

**Topic capture is a much smaller worry here than it was for streetartnews.** Un-homed shares run
2–24%, not the near-total miss that parked streetartnews; the un-homed histograms are in
`stats:walk`'s output and are dominated by decade tags (`1970s`, `19th century`, `1960s`) rather
than one source-defining term.

**A caveat on the two weakest rows, recorded because it was initially missed.** A `--quota 150`
sample curates only what clears the floor, so the vault's numbers rest on **12 curated items** and
thisisnthappiness's on **10**. Their averages (8.00, 8.10) and especially their un-homed shares
(17%, 40% — that is 2-of-12 and 4-of-10) are **too thin to lean on**, unlike nemfrog's 137 or
70sscifiart's 82. Raise the quota before treating either as measured. The floor rates behind them
come from the 200-post probes and are solid; it is the post-floor numbers that are noisy.

### 2.3 What these two blogs are actually measuring — the floor, not themselves

The reason the vault and thisisnthappiness look bad is **one rule firing almost every time**: the
vault floored 138 of 150 with **137 on thin-summary**, and thisisnthappiness floored **140 of 140,
all thin-summary**. Nothing else contributed. Neither blog is being judged badly by the curator —
it likes what survives (83% and 90% ≥8, both above thingsorganizedneatly, a kept source).

The thin-summary rule exists because "below ~60 chars a museum summary is just a department name"
(`curator.ts`). **A picture blog with a 40-character caption is a different case**, and it is worth
naming that these two blogs are largely a measurement of how that museum-shaped rule fits
caption-less picture blogs.

What it costs, as walk efficiency — the sharpest way to see it:

| blog | requests to walk | rows kept | rows per request |
|---|---:|---:|---:|
| nemfrog | 902 | ~41,000 | **45** |
| 70sscifiart | 697 | ~19,200 | 28 |
| thevaultoftheatomicspaceage | 750 | ~3,000 | 4 |
| thisisnthappiness | 2,180 | ~7,600 | **3.5** |

**The open design question, for a session that wants it:** if a link card can stand on image +
title + credit without a long caption, then the thin-summary floor is the thing to revisit, not
these blogs. Doing so would also unlock **toiich** (84% floored) and a further chunk of
**70sscifiart**. Doing nothing is also defensible — the floor is what keeps the corpus from
filling with wordless cards. Nobody has decided; it is not a blocker for the five verdicts, and
it is deliberately **not** bundled into them.

---

## 3. What a full walk costs

Curation cost was **measured, not estimated**: nine live calls with the classify prompt and real
Tumblr images, through OpenRouter's own usage accounting. **$0.000235/item**, ~2,300 prompt tokens,
mean image 649 KB. (This is the first time that number has been recorded anywhere in the repo.)

| | posts walked | rows stored | curation | image download | walk wall-clock |
|---|---:|---:|---:|---:|---:|
| all nine, as originally scoped | ~351,500 | ~125,700 | **~$30** | ~76 GB | ~2 h of requests |
| **the five still open** | ~218,400 | ~43,600 | **~$10** | ~28 GB | ~73 min |
| 70sscifiart alone | 34,836 | ~19,200 | ~$4.50 | ~12 GB | ~12 min |
| sovietpostcards alone | 25,784 | ~11,300 | ~$2.70 | ~7 GB | ~9 min |

The five open blogs walk **more than half the posts** of the original nine to store **about a
third of the rows** — thisisnthappiness alone is 108,982 posts for ~7,600 of them. That is the
shape of what is left: the high-yield archives are the ones now parked.

**The money is not the problem; the corpus balance is.** The corpus is **21,892 items**. All nine
would have added ~125,700 — a **6× corpus in one run, 85% of it these nine Tumblr blogs** — which
changes what Ambit *is* far more than any feed knob does. That is a product decision, which is why
nothing was un-parked before Ben saw the samples. After his four verdicts the open five would add
~43,600, roughly **tripling** the corpus rather than sextupling it; keeping only 70sscifiart and
sovietpostcards would add ~30,500.

Also worth pricing in: every stored item eventually needs a `.cache/img` entry (~150 KB each, so
~19 GB for all nine), and `bun run img:warm` pays that politely, per host.

---

## 4. Traps and conventions

- **`SUSPENDED_SOURCES` is the only switch** keeping these out of the nightly ingest. An explicit
  `--source <id>` still runs a suspended source, which is how the samples above were taken.
- **`--quota` makes a walk incomplete, so `--prune` must not be used with it** (round 2's rule).
- **Tumblr's robots.txt is the platform's, not the blog's.** All nine serve a byte-identical file
  whose fourteen named-bot sections (ClaudeBot, anthropic-ai, CCBot, Google-Extended, …) are
  Tumblr's default — the same file appears on `thisisnthappiness.com`, a different blog on its own
  domain. Ambit's agent is not named. `*` gets `Crawl-delay: 1`, which the walker honours. This is
  Ben's standing call from `HANDOFF_tumblr-walk.md` §3.4 and is not re-litigated per blog.
- **A post type with no picture throws, and ingest counts it.** `answer`, `quote`, `link` and
  `video` are 0–6% of these archives. Nothing is silently skipped, so a rising error count in an
  ingest summary is real signal.
- **`70sscifiart` starts with a digit.** Legal everywhere it is used — `item.source` is free text
  and the TS unions quote their members — but it needs quoting as an object key.
- **Two blogs were given as `tumblr.com/<name>` URLs**; the walker pins the `<name>.tumblr.com`
  host, which is what the legacy API answers on.

---

## 5. Files

- `src/server/services/sources/tumblr.ts` — the factory (walk, `toItem`, and the two fixes)
- `src/server/services/sources/tumblr-blogs.ts` — the nine, one line each
- `src/server/services/sources/tumblr.test.ts` — 56 tests: equivalence with the bespoke walker,
  a per-blog fixture pass, and both fixes
- `src/server/config/blogs.ts` — nine rows, each carrying its own probe evidence
- `src/server/config/suspended-sources.ts` — the nine, parked, with the reasoning
- `src/server/services/sources/__fixtures__/<id>.json` — nine fixtures, recorded live
