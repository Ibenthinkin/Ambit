# Phase 6.2 walkthrough — source trials, round 1

**Executed 08-21-26** against `docs/PHASE6_PLAN_6.2.md`, on branch `feat/phase-6.2-source-trials`.
The first run of `docs/source-candidates.md`'s **trial loop**, over four candidates: Smithsonian
Open Access, Library of Congress (Margolies archive), NASA Image & Video Library, and PoetryDB.

**Status: complete. Verdicts landed 08-21-26 — Keep · Keep · Keep · Park.** Four adapters built,
fixture-tested, live-probed and sample-ingested; the evidence sheet below is what Ben verdicted
against; the three keepers were then promoted with full seed cells and full ingests, and PoetryDB
was parked. **What went past the plan is at the end** — one finding (a Library of Congress rate
limit) that a bare "everything worked" reading would miss, and the small curator change it forced.

---

# THE EVIDENCE SHEET

## The numbers, all four sources at once

Sample ingest at `--quota 15` per cell, **LLM curator on** (the scores below are real, not the
neutral 5 that `--skip-llm` writes). Baseline rows are the existing corpus, untouched by this
phase, for comparison.

| Source          | cells | offered | floored | **inserted** | avg score | p50 | min–max | ≥8 |
| --------------- | ----- | ------- | ------- | ------------ | --------- | --- | ------- | -- |
| **loc**         | 3     | 46      | 0       | **42**       | **8.52**  | 9   | 8–9     | 100% |
| **nasa-images** | 5     | 79      | 22      | **57**       | **7.96**  | 8   | 1–9     | 74% |
| **smithsonian** | 8     | 127     | 51      | **76**       | **7.83**  | 8   | 6–9     | 70% |
| **poetrydb**    | 5     | 77      | 3       | **34**       | **5.50**  | 5.5 | 4–7     | **0%** |
| — baseline —    |       |         |         |              |           |     |         |    |
| archive         |       |         |         | 310          | 8.56      | 9   | 7–10    | 94% |
| cma             |       |         |         | 1528         | 8.48      | 9   | 2–9     | 96% |
| met             |       |         |         | 1545         | 8.14      | 8   | 1–9     | 88% |
| wellcome        |       |         |         | 1952         | 7.53      | 8   | 1–9     | 57% |
| aic (suspended) |       |         |         | 1338         | 7.52      | 8   | 4–10    | 54% |
| wikipedia       |       |         |         | 2200         | 5.27      | 4   | 1–10    | 8% |

Read the top three rows against `wellcome` and `met`, not against `cma`: all three trial image
sources land inside the band the committed sources already occupy, and **`loc` lands at the top of
it** — every single Margolies photograph scored 8 or 9, the tightest distribution of any source in
the corpus.

`poetrydb` is the outlier, and **the reason is not obviously the poems** — see its section below.

The SQL, for re-running (the plan's version fails on Postgres — `round(double precision, integer)`
does not exist, so `avg` needs a `::numeric` cast):

```sql
select source, count(*) as n,
       round(avg(curation_score)::numeric, 2) as avg,
       percentile_cont(0.5) within group (order by curation_score) as p50
from item group by source order by source;
```

## Per-cell, for the topics each source actually claims

| source | topic | n | avg | source | topic | n | avg |
| ------ | ----- | - | --- | ------ | ----- | - | --- |
| smithsonian | zoology | 7 | 8.71 | nasa-images | astronomy | 16 | 8.31 |
| smithsonian | machines | 16 | 8.06 | nasa-images | geology | 14 | 8.21 |
| smithsonian | geology | 7 | 8.00 | nasa-images | cartography | **3** | 8.00 |
| smithsonian | ceramics | 9 | 7.78 | nasa-images | the-ocean | 15 | 7.80 |
| smithsonian | textiles | **4** | 7.75 | nasa-images | machines | 9 | 7.22 |
| smithsonian | portraiture | 10 | 7.70 | loc | machines | 13 | 8.77 |
| smithsonian | ancient-history | 10 | 7.60 | loc | typography | 16 | 8.50 |
| smithsonian | botany | 13 | 7.31 | loc | architecture | 13 | 8.31 |
| poetrydb | poetry | **4** | 6.25 | poetrydb | mythology | 14 | 5.93 |
| poetrydb | the-ocean | 5 | 5.80 | poetrydb | botany | 3 | 5.00 |
| poetrydb | astronomy | 8 | 4.38 | | | | |

Three cells came in thin, each for a different and diagnosable reason — bolded above, explained in
the per-source sections.

## Image-fetch health — the AIC failure mode

Every ingested image URL was re-fetched from this machine with Ambit's own User-Agent, which is
exactly what the curator does before it scores an image (`curator.ts`'s `imageAsDataUrl`):

```
smithsonian: 76/76 images fetched ok
loc:         42/42 images fetched ok
nasa-images: 57/57 images fetched ok
```

**Zero failures across all three image sources.** No referer rules, no challenges, no throttling.
For 7.3's proxy decision that is a *negative* result worth recording: none of these three needs a
proxy the way AIC does. (The curator itself is silent about this — on a failed image download it
appends "(The image could not be fetched — judge from the text alone.)" to the prompt and scores
anyway, with no log line. That silence is why this was measured separately rather than read off the
ingest output. That gap is **closed as of this phase** — see "The finding that went past the plan"
below, which is what forced it.)

## Idempotency

`nasa-images` was ingested twice. The second run:

```
already in DB (skipped):  57
structural floor dropped: 22 (dup-title 19, bare-title 1, thin-summary 2)
curated:                  0
inserted:                 0
```

Clean — the `(source, source_id)` constraint did its job, nothing was re-curated, nothing was
re-billed.

## Five sample items per source

Dev server on `:3000`, then:

| source | score | topic | link |
| ------ | ----- | ----- | ---- |
| loc | 9 | typography | `/i/I0YT36B6ps7Q3aKuDF6Ct` — Mr. Peanut sign (Hair Affair sign), Route 6, Swansea, Massachusetts |
| loc | 9 | architecture | `/i/RIUx3KRDiwhtZeW0gIu58` — Bomber gas station, diagonal view, Route 99 E., Milwaukie |
| loc | 9 | machines | `/i/ZvfNbekfK7vsnYzeVM7KZ` — Harold's Auto Center, Sinclair gas station |
| loc | 9 | machines | `/i/a7laE9YNSRgl_Ry1C3ejo` — Hat n' Boots gas station (1945), boot restrooms |
| loc | 9 | machines | `/i/Kn0LlRxs123K3WG3Z3OME` — Shell gas station (restoration), Winston-Salem |
| nasa-images | 9 | astronomy | `/i/f6RYLwf3XGb6Cv2hhx9Cd` — Planetary Nebula NGC 7293 (the Helix Nebula) |
| nasa-images | 9 | geology | `/i/CjSQt3Pw-ILoYIeBkOPF2` — Malaspina Glacier, Alaska |
| nasa-images | 9 | astronomy | `/i/QzMjAFP2BNmR0lsYMxAxv` — Ant Nebula |
| nasa-images | 9 | astronomy | `/i/GKyqR3M_T-I-UfVd2_gSW` — Weighing in on the Dumbbell Nebula |
| nasa-images | 9 | the-ocean | `/i/Q8MKUGOrIT8pbzAD4bzBE` — White Smoker Ocean Vents |
| smithsonian | 9 | zoology | `/i/pHmKQu0vx4LWxKLJ1L10W` — Roseate Spoonbills, study for *Concealing Coloration in the Animal Kingdom* |
| smithsonian | 9 | zoology | `/i/LcgHFjKxMCZATun7kQZQn` — Insects—Colored, study folder for the same book |
| smithsonian | 9 | zoology | `/i/5G22XC52Nk7evnPR6X46z` — Red Flamingoes, study for the same book |
| smithsonian | 9 | machines | `/i/7eBn81jvTjpF_3SGijYEH` — ca. 1850 Experimental Sewing Machine; Isaac Singer |
| smithsonian | 9 | machines | `/i/obX4tUA1gdccxJONJFo9T` — Ericsson Steam Engine, Patent Model |
| poetrydb | 7 | mythology | `/i/4sc6L-H7NiE14reWGeZOv` — The Last Oracle (Swinburne) ← **the poem to look at** |
| poetrydb | 7 | mythology | `/i/5dAET-ZqGU2ZXROsD31sX` — Hymn to Proserpine |
| poetrydb | 7 | mythology | `/i/ImF4v9YFNNA4NyjSQf_5P` — Hymn Of Man |
| poetrydb | 7 | poetry | `/i/9uF0pt1R58t49SOMSAE1o` — Book IV. Ode I. to Venus. |
| poetrydb | 7 | the-ocean | `/i/dyPLFkTOdGaXBWMINOGcq` — The Year of the Rose |

Rendered screenshots of one per source are in `docs/phase6.2-evidence/`
(`si-i-page.png`, `loc-i-page.png`, `nasa-i-page.png`, `poem-i-page.png`).

**The five poetrydb links above no longer resolve** — the Park verdict deleted its trial rows. The
screenshot is the surviving record, which is exactly why it was taken.

## Where the trial corpus actually sits in the feed

209 new items against an ~8,900-item corpus, so the trial's share of any topic pool is small:

```
machines 7.4% · astronomy 4.8% · geology 4.0% · the-ocean 3.2% · typography 3.1% · botany 2.6%
mythology 2.2% · architecture 2.1% · ceramics 1.8% · portraiture 1.7% · ancient-history 1.6%
zoology 1.1% · textiles 0.8% · poetry 0.7% · cartography 0.6%
```

`bun run probe:feed --uniform --pages 4` (48 cards) surfaced exactly one trial tile — a Margolies
Sears gas station, drifting `architecture → typography → machines`. The mix was healthy otherwise
(CORE 42% / DRIFT 35% / JUMP 23%, 14 distinct topics, zero source-adjacency violations).

**Read this as "the sample is a sample", not as a verdict on any source.** At quota 15 the trial
cannot move the rail's feel — that was never what it was for. Judging `wildcardChance` and the
gallery rail against a thicker corpus is what T7's full ingest at quota 150 buys, and it is the
reason 6.2 exists (log.md 08-21).

---

# Per source: what the trial found

## Smithsonian Open Access — 76 items, avg 7.83

**The license story is the good news, and it is better than the plan assumed *and* worse.** Better:
`media_usage:"CC0"` really is a query parameter that works — 400 of 400 sampled rows across eight
queries carried `usage.access: "CC0"`, so unlike the Met there is no per-item second call to pay
for. Worse: **2 of those 400 simultaneously carried
`indexedStructured.online_media_rights: ["Copyright protected/restricted"]`** — the record's own
catalogue metadata contradicting the media block that the search filter matched on. 0.5% is small.
It is not zero, and the Phase 0.2 lesson is that a source's own filter is never sufficient alone.
`isSmithsonianServable()` checks both signals and drops the contradictions.

The near-miss that rule had to survive: the *common* value in that same field is **"No Known
Copyright Restrictions"** (9 of 400) — a permissive statement whose text contains both "copyright"
and "restrictions". A naive regex drops clean rows for saying they're clean. There's a test for it.

**The density question the candidates file posed is answered: the specimen flood is real and the
structural floor handles it.** 51 of 127 offered items were dropped for free before any LLM call —
32 dup-title, 15 bare-title, 4 thin-summary. That is a 40% structural loss rate, by far the highest
of the four, and it is the natural-history catalogues behaving exactly as predicted. Two visible
consequences:

- **`textiles` came in at 4 items** from a cell whose queries return 13,350 and 4,402 hits. Cooper
  Hewitt catalogues a great many objects with the literal title "Textile", and dup-title takes all
  of them. This is the floor working, not failing — but it means Smithsonian's textile holdings are
  effectively unreachable through a query that returns them under one shared title.
- **`zoology` was seeded `animal` + `bird`, deliberately not `specimen`** (5,029,597 hits — the
  entire natural-history catalogue). Even so it produced only 7 items, at the highest average of
  any Smithsonian cell (8.71) — and all three of its top scorers are Abbott Thayer's painted
  studies for *Concealing Coloration in the Animal Kingdom*, i.e. art that happens to live in a
  science collection. That is the shape of what survives here.

**Two other decisions worth knowing about.** `sourceId` is `record_ID` (`fsg_F1923.16` — unit code
plus accession number), not the row's own `id` (`ld1-1643390182193-1643390191198-1`), which carries
what look like ingest timestamps and would be free to change under a Smithsonian re-index, taking
the whole corpus with it. And `imageUrl` gets `&max=1200` appended: the IDS delivery service
defaults to the **full-resolution** JPEG — 837KB on one sampled object versus 89KB capped, which is
byte-identical to the record's own "Screen Image" rendition.

Rate limit on a real api.data.gov key: **1,000/hr** (confirmed live via `x-ratelimit-limit`, versus
DEMO_KEY's 10). Politeness delay 400ms.

## Library of Congress — 42 items, avg 8.52 (the best in the corpus)

**Every Margolies photograph scored 8 or 9.** No source in the corpus has a tighter distribution;
`cma` and `archive` average slightly higher but both have a tail. Zero structural-floor drops out of
46 offered — Margolies titled his own slides, so every record arrives with a descriptive sentence
for a title and staff-added subject headings underneath it.

**The scoping design held, and the gap that motivated it is real.** The per-result `rights` field
came back empty on every row sampled, re-confirming the 08-20 probe. So the adapter never searches
all of loc.gov: `CLEARED_COLLECTIONS` holds one entry (`mrg`), composing `q=mrg <query>`, and each
result's own `collection[]` array is re-checked for the token before the collection's rights
statement is applied. Composition was verified live across four queries (86–990 hits each, 100%
in-collection) — the guard is belt-and-braces, not a workaround.

**The license string is recorded verbatim and deliberately not upgraded.** `"No known restrictions
on publication"` — taken from the API's own `rights_information` on an item in the collection, not
from a paraphrase and not from "public domain", which is a stronger claim than the Library itself
makes. There's a test asserting the string doesn't say "public domain" or "CC0".

**The per-item second call was measured and rejected.** Fetching an item's own record yields both
`rights_information` and, occasionally, real curatorial prose. In a 10-item sample
`rights_information` was byte-identical across all ten (so the constant is honest and the call buys
nothing on rights), and **only 1 of 10 had any `summary` at all** (so the N+1 would buy prose 10% of
the time it costs a request). Summaries are synthesized from the search response instead — the
title, creator, date, medium and unpacked subject headings, which for this collection is a lot.

**The verdict here is about the pattern as much as the collection.** A Keep means
`CLEARED_COLLECTIONS` grows over time, one verified rights statement at a time, and that growth path
belongs in the SPEC §6.1 entry.

**One cosmetic wart, visible in `loc-i-page.png`:** the synthesized summary reads
`"… 35 mm (slide format).. Beauty shops, 1980-1990, …"` — a doubled period where LoC's own `medium`
field ends in a full stop and the joiner adds another. Trivial to fix; left alone so the evidence
shows what actually shipped.

## NASA Image & Video Library — 57 items, avg 7.96

**The trial question was licensing, and the honest answer is "there is nothing to check".** A live
survey of 600 items across six queries found **no rights field of any kind** — not on the item, not
on the asset links, nowhere. There is nothing to filter on and nothing to re-check, which is a
materially different posture from Smithsonian's honest CC0 flag or LoC's cleared collections.

What the survey did find is a credit trail: `secondary_creator` on 172 of 600, `photographer` on
291, and essentially every value is NASA plus a research partner — "NASA/JPL-Caltech",
"NASA/JPL/University of Arizona", "NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team".
**Exactly two of 600 named something else**: `2MASS` (a publicly-funded sky survey) and a single
individual's name.

So the posture is: `license` = `"Public domain (NASA)"`, scoped by that word, and `attribution`
reproduces NASA's own credit line verbatim rather than flattening everything to the agency name. A
credit that doesn't already say NASA gets prefixed (`"NASA / 2MASS"`) so no item reads as coming
from nowhere.

**This is the source where a Park is most defensible**, and the plan said so in advance. The
material is public domain in the ordinary case; the API just declines to say so per item.

**No image-URL rewrite was needed** — every item publishes its renditions as explicit `links[]`
entries with widths attached, so the adapter picks down a ladder the API already gave it
(`~medium` → `~large` → `~small` → `~thumb` → `~orig`). Coverage across the survey: orig 600,
thumb 599, small 561, medium 486, large 439 — so `~orig` earns last place as the only one always
present, and 114 items legitimately fall through to `~small`.

**`cartography` came in at 3 items.** `earth observation` returns 7,356 hits, but they are satellite
imagery of terrain, and 19 of the run's 22 dup-title drops came from here — NASA publishes long runs
of near-identical scene captures under one title. Whether satellite imagery *is* cartography in the
sense the topic means is a separate and fair question; the tiles look like maps and are not drawn
ones.

## PoetryDB — 34 items, avg 5.50, **nothing above 7**

Three findings, and the order matters.

**1. The API does not do what the plan expected, and the workaround is measured.** `GET
/lines/<keyword>` — the natural one-step search — **returned HTTP 503 for all nine seed keywords
probed** (love, night, song, sea, stars, moon, gods, flower, nightingale), while `/lines/ozymandias`
(one matching poem) returned 200. The failure tracks result-set size, not the keyword: the same
searches narrowed to `/lines/<kw>/title,author` return 200 with hundreds of rows (1,504 for "love").
The upstream can find the poems; it cannot serialize that many full texts at once.

So `search()` discovers with the narrowed line search and hydrates each poem individually via
`/author,title/<author>;<title>:abs` — an N+1 like the Met's, bounded by `limit`, so a quota of 15
costs 16 requests. **1 of 40 sampled poems is unreachable** through the exact-lookup route, because
PoetryDB's router splits the path on `/` before matching and one title contains a slash. Those are
skipped, not retried.

A no-match is a JSON **object** at HTTP 200 (`{status: 404, reason: "Not found"}`), not an empty
array — `poetryHits()` is the shape check that stops that reading as either an outage or as data.

**2. The low scores may say more about the curator than about the poems.** Look at what scored 4:

```
4  Fragments                            In that fair capital where Pleasure, crowned / Amidst her…
4  Juvenilia, An Ode to Natural Beauty  There is a power whose inspiration fills / Nature's fair…
4  Ode on St Cecilia's Day,             Descend, ye Nine! descend and sing; …  — Alexander Pope
4  The Deserted Garden                  I know a village in a far-off land …
```

That is Pope and Seeger being rated "filler; you would scroll past it". The curator prompt
(`curator.ts`'s `CURATOR_PROMPT`, a product artifact carrying Ben's taste calibration) asks for
"visually striking or quietly beautiful images" and "ideas and stories with a genuine spark of *huh,
I never knew that*" — a rubric a lyric poem cannot win on, whatever its quality. Wikipedia averages
5.27 for the same structural reason. **A verdict that reads 5.50 as "the poems are mediocre" is
probably reading the prompt, not the corpus.** Whether the curator should grow a text-item rubric is
a real question this trial surfaced; it is not one 6.2 should answer.

**3. Two rendering problems, one cosmetic and one not.** From `poem-i-page.png`:

- **Expected and acceptable:** `reader-blocks.ts` turns each non-blank line into its own paragraph
  block, so the poem renders line-by-line with paragraph spacing and **stanza gaps are lost**. The
  body stores them (`lines.join("\n")`, blanks included) so nothing is destroyed — only the reader
  ignores them. If PoetryDB is kept, whether `reader-blocks` grows verse handling is a T7 decision
  with Ben, not the adapter's business.
- **Not cosmetic:** the summary is the poem's first two non-blank lines, and PoetryDB's `lines[]`
  includes **epigraphs and dedications**. So "The Last Oracle" leads with a transliterated Greek
  epigraph (`eipate toi basilei, xamai pese daidalos aula. / ouketi PHoibos exei kaluban…`) and
  "Autumn." leads with `THE THIRD PASTORAL, Or HYLAS AND ÆGON. / TO MR WYCHERLEY.` Those are what a
  feed card would show. There is no field distinguishing epigraph from first line, so this needs a
  heuristic or a different summary strategy — worth knowing before a Keep.

**`poetry` — the source's own topic — came in at 4 items**, the thinnest cell of the twenty-one.
Not starvation: 15 collisions were recorded, and the collision rule (highest search rank wins,
SPEC §15) handed poems that matched both `gods` and `love`/`night` to `mythology`, which took 14.
Exactly the mechanism SPEC §15 describes, working as designed — but it means the poetry chip is fed
mostly by everything except the poetry cell.

---

# What else changed, and why

**`sourceLabel()` gained four entries** (`src/lib/source-label.ts`). Its fallback title-cases an
unknown slug, which the file's own comment defends as a good outcome — and for `smithsonian` it is.
For the other three it is not: the credit line rendered "from: **Loc**", "from: **Poetrydb**" and
would have rendered "from: **Nasa-images**". A credit line is the one place a source's name has to
be right, and leaving it wrong would have put a false detail in front of the very verdict this
evidence exists to inform.

**`normalize.decodeEntities()`** joined `stripHtml` as a sibling helper. `stripHtml` removes *tags*
and leaves `&quot;`/`&amp;` sitting in the middle of a summary; 13 of 600 NASA descriptions carry
them. Only the entities actually observed are handled — a general decoder is a much bigger thing
than any source here needs, and an incomplete one pretending otherwise is worse than a short honest
list. `&amp;` is decoded last so `&amp;quot;` resolves to `&quot;` rather than to a bare quote.

**`SeedQueries` grew a second half.** `TRIAL_SOURCES` and `SEED_SOURCES` join `V1_SOURCES` in
`topics.ts`, and the type is now
`Record<V1Source, string[]> & Partial<Record<TrialSource, string[]>>` — every v1 source still owes
every topic a cell, while a trial source owes only the topics where it is honest (plan decision 4).
An absent cell costs nothing: `ingest.ts` reads `seedQueries[sourceId] ?? []` and skips an empty
list. What the optional-but-typed shape still buys is the typo check — `nasa_images:` fails to
compile.

`scripts/seed-topics.ts`'s `seedQueriesEqual` now walks `SEED_SOURCES` rather than `V1_SOURCES`;
walking only the v1 six would have reported "unchanged" for a run that in fact rewrote trial cells.
The upsert was always correct; the summary would have been lying.

---

# Where the plan and reality disagreed

**1. PoetryDB's search shape.** The plan specified `search(query) = GET /lines/<query>` as
plan-time knowledge to confirm. It does not work at any real result-set size (nine keywords, all
503). The two-step replacement is documented in the adapter header and above. **This is the one
place a plan instruction was replaced rather than followed**, and it was replaced on measurement,
not preference.

**2. The plan's score-distribution SQL doesn't run.** `round(avg(curation_score), 2)` fails with
`function round(double precision, integer) does not exist`; `curation_score` is a float and Postgres
only has two-argument `round` for `numeric`. Corrected version at the top of this document.

**3. NASA needed no image rewrite at all.** The plan (following the Wellcome precedent) said to
survey live URLs and pick the cheapest verifiable rewrite. The survey found the API publishes every
rendition explicitly with widths, so picking beats rewriting — strictly better, since there is no
URL shape to guess at and no 404 to risk.

**4. LoC's rights page is not machine-readable.** The plan said to take the license wording from the
collection's own rights page. `loc.gov/rr/print/res/723_marg.html` is a LibGuide whose per-collection
statements load via JavaScript, so there is no static text to quote. The wording was taken instead
from the API's own `rights_information` field on an item in the collection — which is the same
statement, reproducible, and verifiable by anyone re-running the probe.

---

# THE GATE — T6

*(Kept as written, because it is the document Ben verdicted against. The answers follow it.)*

**Four verdicts needed, in the trial loop's own terms** (`docs/source-candidates.md`): **Keep**
(promote to SPEC §6.1 + full seed cells + full ingest), **Park** (needs work — note why), or **Cut**
(struck through with the reason).

| Source | The short version | The question for you |
| ------ | ----------------- | -------------------- |
| **smithsonian** | Works cleanly, honest license filter with a 0.5% contradiction the adapter catches, 40% structural loss to the specimen catalogues, avg 7.83 | Is a source that needs a 40% floor to be good, good enough? |
| **loc** | Best scores in the corpus (8.52, every item ≥8), zero floor drops, one collection only | Does the cleared-collection *pattern* earn a place, or is this just one good collection? |
| **nasa-images** | Solid scores (7.96), clean images, **no rights field anywhere** | Is "Public domain (NASA)" an honest enough claim to ship? |
| **poetrydb** | 5.50 avg with nothing above 7 — but the curator's rubric can't score poems, and the summaries pick up epigraphs | Is the low score the poems, or the prompt? |

Also decide, per keeper (plan decisions 5 and 7):

- **`WILDCARD_SOURCES` membership** — default no. `loc` is the interesting one to consider: the
  Margolies archive has the odd, personal flavour that dial exists for.
- **Trial-row cleanup for anything Cut or Parked** — `delete from item where source = '<id>'` plus
  removing its trial cells. The adapter and tests stay in-repo either way; they're cheap and they
  keep this evidence reproducible.

**Eyeball recipe:**

```sh
lsof -ti:3000            # clear the squatter first (CLAUDE.md)
bun run dev
```

Then the five `/i/` links per source in the table above — **including the poem**, which is the one
that needs a taste call rather than a glance. Then `bun run probe:feed --uniform --pages 4` for the
feed in context, remembering that at 209 items the trial's share of any pool is under 8%.

---

**Ben's verdicts, 08-21-26:**

| Source | Verdict | |
| ------ | ------- | -- |
| **smithsonian** | ✅ **Keep** | promoted |
| **loc** | ✅ **Keep** | promoted; **not** added to `WILDCARD_SOURCES` (the plain Keep was chosen over the offered Keep-plus-wildcard, so the default of "no" stands) |
| **nasa-images** | ✅ **Keep** | promoted, with the license posture stated plainly rather than parked on |
| **poetrydb** | 🟡 **Park** | needs the summary fix first |

---

# T7 — What promotion actually produced

## Full seed cells

Every query below was measured live before it was written down, and the count sits in the comment
next to it in `topics.ts`. Two cells were retuned by what the *trial* found rather than by hit
count, which is the more interesting kind:

- **`smithsonian/textiles` gained `embroidery` and `lace`.** The trial's `textile` query returns
  13,350 rows and yielded 4 items, because Cooper Hewitt catalogues a great many objects under the
  literal title "Textile" and dup-title takes all of them. Vocabulary that returns
  *differently-titled* objects is the fix. A bigger quota is not — it would just floor more.
- **`nasa-images/cartography` gained `satellite`.** Same shape: `earth observation` returns 7,356
  rows and yielded 3, because NASA publishes long runs of near-identical scene captures under one
  title.

Coverage after promotion: **smithsonian 14 of 16 topics** (poetry is the honest omission — 173
hits, and they are not poems), **nasa-images 6** (the trial's five plus `portraiture`, where
`astronaut portrait` / `crew portrait` beat bare `astronaut` at 57,854 hits of mostly hardware),
**loc 3** (its honest three, with wider building-type vocabulary).

## Full ingest

| Source | offered | floored | **inserted** | avg | p50 | ≥8 | topics |
| ------ | ------- | ------- | ------------ | --- | --- | -- | ------ |
| smithsonian | 2,252 | 702 (31%) | **1,529** | 7.73 | 8 | 62% | 14 |
| nasa-images | 900 | 378 (42%) | **520** | 7.96 | 8 | 71% | 6 |
| loc | 410 | 7 (2%) | **376** | 7.98 | 8 | 77% | 3 |

All three held their sample-run averages within half a point at 10–30× the volume, and all three
sit inside the band the committed sources occupy (`met` 8.14, `wellcome` 7.53). Errors: zero across
all three runs. Collisions: 21 / 2 / 27.

The corpus is now **~11,300 items across nine sources** (eight drawable — `aic` is still suspended).

## Feed check

`bun run probe:feed --uniform --pages 5` — 60 cards:

```
cma 14 · wellcome 11 · met 10 · smithsonian 9 · wikipedia 5 · loc 5 · archive 4 · nasa-images 2
tier mix: CORE 38% · DRIFT 30% · JUMP 32%   topic spread: 15 topics   source-adjacency violations: 0
```

The three keepers took 16 of 60 slots on their first outing, in context and without breaking the
no-adjacent-same-source constraint. Compare the pre-promotion run, where 209 trial items across the
same corpus surfaced exactly one tile in 48 cards.

---

# The finding that went past the plan

**`tile.loc.gov` rate-limits by IP, and it caught us mid-ingest.**

The sample run's hotlink check was clean — 42/42. The *promotion* run's was not: a re-check of 100
random LoC images immediately afterward returned **HTTP 429 on all 100**. It is not a burst
problem. Serial requests one second apart 429 identically; so do requests with no User-Agent, and
so do requests carrying a stock Chrome User-Agent. There is no `Retry-After` header and no
`x-ratelimit-*` of any kind. Forty minutes after the ingest it was still blocking.

So: **334 curator image downloads in 105 seconds is over the budget**, whatever the budget is, and
the Library does not publish one.

Two consequences, and they point in different directions.

**For the ingest, this is easy and was not caught.** The adapter's own politeness delay (500ms)
governs *search* calls; the curator's image downloads run through a separate path at CONCURRENCY 8
with no delay at all. That is fine for museum CDNs and not fine here.

**For the feed, this is the real question, and it is 7.3's.** A feed page hotlinks its heroes from
*the reader's* connection, not ours — a dozen `tile.loc.gov` requests per page, from an IP that is
also loading everything else. Nothing observable from outside says how close that comes to the
limit. And note it is a different problem from AIC's, which is a referer rule that a proxy fixes by
definition: this one is a **budget**, which a *cache* fixes and a bare proxy might make *worse* by
funnelling every reader's requests through one address. Recorded in SPEC §15 for 7.3 to decide, per
plan decision 5 — evidence, not a fix.

**What it exposed in the curator, which is the part worth keeping.** When `imageAsDataUrl` fails,
the curator appends "(The image could not be fetched — judge from the text alone.)" to the prompt
and scores the item anyway. That is correct — a missing thumbnail should not null out an item — but
it was **completely silent**. No log line, no count, nothing in the run summary. So a 334-item run
completed, reported success, and left no way to answer the only question that mattered: were those
scores made by looking at the pictures, or not?

`scoreItem` now returns `imageFetchFailed`, `curateItems` takes an `onImageFetchFailure` hook, and
the ingest summary prints a **`no-image` column** beside errors and collisions. Zero is the
expected reading. Anything else is the AIC failure mode surfacing while it is still cheap to notice.

**The honest state of LoC's 376 scores:** unknown provenance. The counter did not exist during that
run, so there is no record of how many were scored text-only — only the suggestive fact that the
average came in at 7.98 against the sample run's 8.52, which is equally well explained by regression
to the mean at 9× the volume. **The repair is a `--force` re-curation once the block clears**, which
is left as the first thing to do rather than done here, because the block outlasted the session.
SPEC §15 carries it.

---

# What else changed, and why (part two)

Three small things, each forced by something above rather than chosen:

- **`sourceLabel()` gained four entries** — see the section above.
- **`normalize.decodeEntities()`** — see the section above.
- **`curateItems` grew image-fetch reporting** — see immediately above. Tested with a stubbed
  `fetch` rather than a literal, which is a deliberate exception to `curator.test.ts`'s "no live
  HTTP" rule: the behavior lives entirely in the network branch, and a smoke run against healthy
  sources never triggers it. Nothing in the test touches the network.
