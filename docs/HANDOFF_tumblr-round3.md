# Handoff — sources round 3: nine Tumblr blogs on a `tumblr.ts` factory

**Written:** 09-05-26, by the session that probed, built and sampled all nine.
**Status:** code on `feat/tumblr-blogs-round3`, all tests green, **all nine parked in
`SUSPENDED_SOURCES`**. Nothing has been written to any database. **Every one of the nine is
waiting on Ben's Keep / Park / Cut verdict** — that is the only thing outstanding, and §2 is the
table it needs.

---

## 0. Start here — what a next session does

1. Read §2 and take Ben's verdict per blog.
2. For each **Keep**: remove its id from `src/server/config/suspended-sources.ts`, then run the
   full walk — `bun run ingest --source <id>` (no `--quota`, so `--prune` stays meaningful).
   §3 has the per-blog cost and wall-clock, and §4 the traps.
3. Anything Ben does not Keep stays exactly as it is. A parked row costs nothing and is already
   documented; there is no cleanup to do.

**Do not run a full walk on all nine as a batch.** §3 says why in numbers.

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

| blog | archive | stored % of offered | curated avg | ≥8 | un-homed | est. full-walk rows |
|---|---:|---:|---:|---:|---:|---:|
| **nemfrog** | 45,094 | **91%** | 8.15 | 87% | 7% | ~41,000 |
| **70sscifiart** | 34,836 | 55% | **8.65** | **96%** | 2% | ~19,200 |
| **humanoidhistory** | 48,466 | 56% | 8.29 | 82% | 11% | ~27,100 |
| **dreamsrecurring** | 20,636 | 38% | **8.72** | **96%** | 7% | ~7,800 |
| **sovietpostcards** | 25,784 | 44% | 7.79 | 70% | 17% | ~11,300 |
| **vintagegeekculture** | 18,930 | 33% | 7.44 | 56% | 14% | ~6,200 |
| **thevaultoftheatomicspaceage** | 37,494 | 8% | 8.00 | 83% | 17% | ~3,000 |
| **thisisnthappiness** | 108,982 | 7% | 8.10 | 90% | 40% | ~7,600 |
| **toiich** | 11,308 | 22% | 7.58 | 70% | 24% | ~2,500 |

**Read against the corpus's own benchmarks:** thisiscolossal 8.70 / 97.5% ≥8 (the strongest source
in the corpus), pdr 8.39 / 87%, thingsorganizedneatly 7.90.

**What the table says.**

- **dreamsrecurring (8.72) and 70sscifiart (8.65) score level with thisiscolossal** — the best
  material of the nine. Both throw most of the archive away at the floor, which is the floor
  working: what survives is the captioned minority.
- **nemfrog is the outlier and the obvious first Keep.** 91% of everything offered clears the
  floor — nothing else in the corpus comes close — at pdr-class quality, with 6.9 tags/post of
  real scanned-plate vocabulary. It is also the single biggest contributor, ~41,000 rows.
- **sovietpostcards is the most *coherent*** rather than the highest-scoring: its un-homed tags
  are `ussr 8 · russia 6 · 1960s 5 · soviet union 4`, a clean cluster that would make a good
  grown topic. It is the one blog here with a real Cut 2 topic-capture angle, and a mild one.
- **thevaultoftheatomicspaceage and thisisnthappiness are structurally poor**, not badly curated.
  The vault has **zero tags on 200 sampled posts** and a median caption of 0 characters;
  thisisnthappiness keeps ~7% of the largest archive probed, and 40% of what it keeps is
  un-homed. Both are ~2,000 polite requests to gain a few thousand thin rows. Cut candidates.
- **toiich** is 197-of-200 `regular` posts, keeps 22%, and 24% of that is un-homed. Its captions
  are film titles ("Au Hasard Balthazar (1966), dir."). Marginal.

**Topic capture is a much smaller worry here than it was for streetartnews.** Un-homed shares run
2–24%, not the near-total miss that parked streetartnews; the un-homed histograms are in
`stats:walk`'s output and are dominated by decade tags (`1970s`, `19th century`, `1960s`) rather
than one source-defining term.

---

## 3. What a full walk costs — the reason all nine are parked

Curation cost was **measured, not estimated**: nine live calls with the classify prompt and real
Tumblr images, through OpenRouter's own usage accounting. **$0.000235/item**, ~2,300 prompt tokens,
mean image 649 KB. (This is the first time that number has been recorded anywhere in the repo.)

| | posts walked | rows stored | curation | image download | walk wall-clock |
|---|---:|---:|---:|---:|---:|
| all nine | ~351,500 | ~125,700 | **~$30** | ~76 GB | ~2 h of requests |
| the top three only | ~128,400 | ~87,300 | ~$21 | ~53 GB | ~43 min |
| nemfrog alone | 45,094 | ~41,000 | ~$9.60 | ~26 GB | ~15 min |

**The money is not the problem; the corpus balance is.** The corpus is **21,892 items**. All nine
would add ~125,700 — a **6× corpus in one run, 85% of it these nine Tumblr blogs** — which
changes what Ambit *is* far more than any feed knob does. That is a product decision, which is
why nothing was un-parked here.

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
