# Topic facets, the four-stage picker, and twenty personas — design

**Written:** 09-10-26 by Fable 5.1, from Ben's desktop review notes
(`docs/design_update_3/desktopPolishChecklistNotes.md`, "Onboarding" and "One more thing").
**Status:** design approved 09-10-26; plan written the same afternoon —
`docs/PLAN_topic-facets-and-personas.md`, ready to execute cold.
**Sub-project 1 of 3** from that review. Sub-project 2 (screen structure fixes: item page and
gallery merged, Escape back to the feed, bigger square heroes, landing slideshow) and
sub-project 3 (the chrome redesign: detached share button, desktop right-hand rail, hover-over
save on tiles, list screens) each get their own design doc. This one is deliberately free of
visual taste decisions so it can ship first and unlock feel-testing while the other two are built.

## Why

Ben cannot feel-test the feed's drift and associations without switching topics on and off, and
today he can switch sixteen. The vocabulary is **101 topics** (16 original + 85 grown, Cut 2a),
but both pickers — onboarding and Settings' "What you see" sheet — draw from the sixteen, and
`topics.setMine` rejects any other id. The sixteen were, in Ben's words, "the first words we
thought of": they are not a curated starting set, just the oldest rows. So the picker should
offer the whole vocabulary, organised by something better than age.

He also wants to log in as other people. Twenty pretend readers with different lives and
different picks, seeded in both databases, so a feed can be judged from more than one chair.

## Decisions (with Ben, 09-10-26)

1. **Four facets, by kind, assigned by hand:** Subject, Medium, Look, Place. Not by graph
   neighbourhood (which would file `watercolor` under Botany by co-occurrence) and not by tier.
2. **Era is left out** until the feed can serve it. `19th-century` is tag-only (`PERIOD_TOPICS`,
   09-07-26): no item displays under it, so picking it is an empty pool until Cut 2b moves the
   feed onto the membership join. It stays in the vocabulary, unfaceted and unpickable.
3. **Every facet is too thin and gets bigger later**, by a fresh `mine:topics` round against the
   164,423-item corpus (the last round ran at 21,892). That round is **not** this sub-project.
   The picker is built on today's 100 pickable topics; the mining round adds to it through the
   same facet map. Stay under ~300 topics, the Cut 2b line.
4. **The tier `core` is renamed `original`.** It stops meaning "the good ones" and starts meaning
   what it is: the sixteen config-defined, query-seeded topics whose tuned graph rows the rebuild
   preserves byte-for-byte.
5. **Onboarding is four stages**, one facet each, in the order Subject → Medium → Look → Place.
6. **The manager is a page, `/profile/topics`, with four tabs.** Not tabs on the profile screen
   itself (sub-project 3 redesigns that screen) and not the Settings sheet (deleted).
7. **Personas are seeded in production too**, so the fixture lives in a checked-in config module,
   not under `docs/` (excluded from the image).
8. **Duplicates are noted, not merged.** `portraiture`/`portraits`, `botany`/`plants`/`flowers`,
   `zoology`/`animals`. Merging is topic surgery on memberships and graph rows; a separate cut.
9. **No demographic data is stored.** The personas' age, gender, location and profession exist
   in the fixture and in this doc for Ben's reading. The database gets a name, an email, and
   topic picks. Collecting such data for real waits for the "simple, transparent algorithm"
   design pass Ben's notes describe.

## 1. Vocabulary: `facet` and the rename

**Schema.** `topic.facet: text | null`, typed `TopicFacet = "subject" | "medium" | "look" | "place"`.
Nullable on purpose: null means *not pickable*, and that is the honest state of a topic nobody
has classified yet. A `NOT NULL DEFAULT 'subject'` would file every future promotion under
Subject silently.

**The assignment lives in code**, `src/server/config/topic-facets.ts`: one exported
`TOPIC_FACETS: Readonly<Record<string, TopicFacet>>` keyed by topic id, with the table below as
its content. `scripts/seed-topics.ts` (which `db:seed` runs on every boot, after migrate) applies
it: upsert the sixteen as today with `tier: "original"` and their facet, then
`UPDATE topic SET facet = $facet WHERE id = $id` for every other key in the map that exists. Ids
in the map that are not in the database are skipped silently (a fresh database has only the
sixteen); topics in the database with no facet are printed as a warning, except the known era
set. **This is what puts facets on production at the next deploy with nothing copied in.**

**Promotion learns facets.** `docs/topic-proposals.md` gets a facet column beside the tick;
`promote:topics --confirm` writes the facet to the row *and* refuses a ticked proposal with no
facet — a promoted topic should never be invisible by accident. (The map in code is still the
authority: the promote script's output includes the lines to paste into `topic-facets.ts`, the
way it already prints the graph-rebuild reminder.)

**Rename.** Migration `0007`: `UPDATE topic SET tier = 'original' WHERE tier = 'core'`, and the
column default `'core'` → `'original'`. `TopicTier` becomes `"original" | "grown"`. Every
reference follows: `seed-topics.ts`, `db/topics.ts`, `app/dev/feed/page.tsx` (the readout's
split becomes **original / grown / wild**), `rebuild-topic-graph.ts` (which reads its preserved
set from `TOPICS`, not the tier — unchanged in behaviour, changed in comments), the
`FeedScreen` dev prop `coreTopicIds` → `originalTopicIds`, and the docs that quote the word
(CLAUDE.md, SPEC §9, the two vocabulary design docs get a one-line note, not a rewrite).
`feed-knobs.ts`'s `grownEdgeScale` / `grownHopPenalty` keep their names — they are about the
grown side, which is unchanged.

**API.** `topics.list` returns every topic with a facet, ordered by label, each row carrying
`facet` — the pickers group client-side. `listTopics()` in `db/topics.ts` changes from
`WHERE tier = 'core'` to `WHERE facet IS NOT NULL`; `listAllTopics()` is unchanged (graph,
mining, audits). `topics.setMine` validates against `listTopics()` as before — which now means
"any pickable topic", so a grown pick is accepted and an era pick is still a `BAD_REQUEST`.

### The facet map (100 pickable + 1 era; 159 pickable since round 2, 09-12-26)

| facet | n | topics |
|---|---|---|
| **subject** | 60 | ancient-history, architecture, astronomy, botany, cartography, geology, machines, music, mythology, poetry, portraiture, the-ocean, zoology · activism, advertising, anatomy, animals, balloons, birds, body, books, cars, cats, clouds, consciousness, dance, death, emotions, fashion, film, fire, flowers, food, fruit, furniture, games, insects, jewelry, kids, landscapes, light, literature, medicine, mirrors, nature, plants, portraits, sand, science, science-fiction, shoes, snow, sound, still-life, technology, toys, travel, trees, water, weather |
| **medium** | 27 | ceramics, textiles, typography · carving, clay, collage, digital, dioramas, drawing, embroidery, found-objects, glass, illustration, ink, installation, land-art, metal, miniature, mixed-media, murals, painting, paper, photography, plastic, sculpture, watercolor, wood |
| **look** | 9 | abstract, black-and-white, color, geometric, optical-illusion, pattern, psychedelic, retrofuturism, surreal |
| **place** | 4 | chicago, japan, london, new-york |
| *(era — unfaceted)* | 1 | 19th-century |

The thirteen and three before the `·` are the originals. Judgement calls worth recording:
`retrofuturism` is a look, not a subject (it names a style; `science-fiction` names the subject);
`light`, `fire`, `water`, `sand`, `snow` are subjects (what is pictured), while `glass`, `metal`,
`wood`, `paper`, `plastic`, `clay` are media (what it is made of) — `clay` sits beside `ceramics`
and both stay; `installation`, `land-art`, `murals`, `dioramas`, `miniature` are media in the
"kind of work" sense; `still-life` and `portraits` are subjects in the genre sense.

## 2. Onboarding: four stages

Same route, same screen component, same `Chip` primitive, same styling. What changes is the
data and the flow.

- Stage *k* shows the chips of facet *k*, in the fixed order **Subject, Medium, Look, Place**,
  with a heading per stage ("What do you want to see?", "Made how?", "What should it look like?",
  "Anywhere in particular?" — copy is placeholder until sub-project 3) and a four-dot progress
  indicator.
- **Next** advances; on the last stage it reads **Done**. **Back** on stages 2–4. Any stage may
  be passed with nothing picked.
- **Done** is enabled when the total selection across stages is ≥ 3 — SPEC §3.2's existing
  floor (`minPicks={3}`), kept as-is when the plan was written; the page's floor is one. One
  `setMine` call at the end with the union, exactly as today; nothing is written mid-flow, so
  abandoning onboarding leaves no rows.
- Selection state is one `Set<string>` for all four stages, so going Back and unpicking works.
- `hasCompletedOnboarding()` (≥ 1 `user_topic` row) is unchanged, so the redirect logic is too.
- The chip grid pulls from `topics.list` (a query) rather than the `TOPICS` config it maps today
  — the config only knows the sixteen. The screen test's mocks follow.

## 3. The topic page: `/profile/topics`

- Route `src/app/profile/topics/page.tsx` → `TopicsScreen` in `components/profile/`.
- Four tabs in facet order. Each tab is a chip grid of that facet's topics with the reader's
  current picks pressed (`aria-pressed`, the primitive's own state).
- **Every toggle saves immediately.** The mutation is `setMine` with the new full set — the same
  procedure, so the weight-preserving behaviour of `setUserTopics` (keeps the rows the reader
  kept, inserts only new ones) applies to every flip. Optimistic update on `topics.mine`; on
  error, revert and show the existing toast pattern. Unpicking the last topic is refused in the
  UI (the chip stays pressed and a hint says one is the floor), matching the mutation's `min(1)`.
- The profile screen gets a **Topics** row ("12 topics") that links here, below the collections.
- Settings' "What you see" row becomes a link to this page; `topics-sheet.tsx` and its tests are
  deleted. The row's value text ("3 topics") stays.
- **Dev-only readout**, rendered only when `feedDebugEnabled()` (the one gate shared by
  `/dev/feed`, the knob mutation and the forget mutation): each pressed chip shows its learned
  weight as a small suffix ("Botany · 1.4"), and the page has a **Reset weights** button that sets
  every weight for the reader back to 1.0. Two new procedures, both refusing with `NOT_FOUND`
  when the gate is off, exactly as `feed.forgetSince` does: `topics.weights` (query →
  `{ topicId, weight }[]`, from `getUserTopicWeights`) and `topics.resetWeights` (mutation).
  The product build never renders a weight.
- Below 768 px the tabs scroll horizontally; at `md` and above the page sits in the 600 `Column`.

## 4. Personas and `seed:personas`

**Fixture:** `src/server/config/personas.ts`, `PERSONAS: readonly Persona[]`, where
`Persona = { slug, name, age, gender, location, profession, taste, topics: string[] }`. The
demographics are documentation for Ben and are not written anywhere. A unit test asserts every
`topics` entry is a key of `TOPIC_FACETS`, every slug is unique, and every persona has ≥ 1 topic.

**Script:** `scripts/seed-personas.ts`, `bun run seed:personas`. For each persona:

1. Upsert an `invite` row for `persona-<slug>@ambit.local` (the gate in `lib/auth.ts` reads it).
2. If no `user` with that email exists, `auth.api.signUpEmail({ body: { email, password, name } })`
   — server-side through Better Auth, so the `before`/`after` hooks run and the password is
   hashed the way a real sign-up's is. Password from **`PERSONA_PASSWORD`** (env; required by
   the script, optional in `env.js`, never defaulted). Set it on the Mac's `.env` and in
   Coolify's environment; it is one shared password for all twenty and that is fine for an
   invite-only app's test accounts — but it is still a secret, so it stays out of the repo, the
   log and the walkthrough, like every other one.
3. `setUserTopics(userId, persona.topics)` — the same weight-preserving replace the picker uses,
   so re-running after Ben edits a persona's picks in the fixture changes exactly those rows.

Idempotent by construction; the summary prints created / updated / unchanged. `e2e:clean`
matches `ambit-%@example.com` and never sees `@ambit.local`. In production the command is the
same, via `docker exec` (a `.cache/seed-personas-prod.sh` in the standing convention).

**Sign-in for testing** is the normal sign-in screen with `persona-<slug>@ambit.local` and the
shared password. No switcher UI; the point is to see the app the way that person does, sign-in
included.

### The twenty

Picks are chosen to give the feed different centres of gravity: some narrow (three subjects, one
medium), some wide, some all-look-no-subject, a couple that overlap heavily so the graph's drift
can be compared from nearby starts. Ages, places and jobs are invented; none is a real person.

| # | slug | name | age | gender | location | profession | taste | topics |
|---|---|---|---|---|---|---|---|---|
| 1 | maren | Maren Holt | 34 | woman | Copenhagen | Architect | Clean lines, concrete, cold light. | architecture, geometric, black-and-white, photography, furniture |
| 2 | dev | Dev Raghunathan | 27 | man | Bangalore | Backend engineer | Space, old machines, anything with a schematic. | astronomy, machines, technology, science-fiction, retrofuturism, digital |
| 3 | rosa | Rosa Almeida | 61 | woman | Lisbon | Retired botanist | Plants first, then everything that grows around them. | botany, plants, flowers, trees, insects, watercolor |
| 4 | theo | Theo Marchetti | 19 | man | Bologna | Art student | Loud color, collage, anything that looks cut and pasted. | collage, psychedelic, color, illustration, murals, surreal |
| 5 | ines | Inès Bakker | 45 | woman | Amsterdam | Textile designer | Weave, stitch, pattern, repeat. | textiles, embroidery, pattern, ceramics, japan |
| 6 | kwame | Kwame Asante | 38 | man | Accra | Cartographer | Maps, coastlines, and the weather that moves over them. | cartography, the-ocean, weather, clouds, landscapes |
| 7 | june | June Park | 29 | nonbinary | Seoul | Type designer | Letters, ink, paper, and the occasional poster. | typography, ink, paper, advertising, books |
| 8 | harold | Harold Finch | 72 | man | Manchester | Retired railway engineer | Steam, steel, and the century that built them. | machines, metal, cars, london, black-and-white |
| 9 | amira | Amira Haddad | 41 | woman | Beirut | Archaeologist | Old stones and older stories. | ancient-history, mythology, carving, sand, portraiture |
| 10 | lucas | Lucas Ferreira | 23 | man | São Paulo | Skateboarder / barista | Street walls, shoes, cars, motion. | murals, shoes, cars, activism, photography |
| 11 | greta | Greta Lindqvist | 52 | woman | Stockholm | Pediatric nurse | Kids' things, toys, the small and the handmade. | kids, toys, miniature, dioramas, dance |
| 12 | omar | Omar Siddiqui | 33 | man | Chicago | Jazz pianist | Sound, the city, the night. | music, sound, chicago, new-york, light |
| 13 | yuki | Yuki Tanaka | 26 | woman | Osaka | Ceramicist | Clay and glaze, wood and water. | ceramics, clay, glass, wood, japan, still-life |
| 14 | silas | Silas Okafor | 47 | man | Lagos | Surgeon | Anatomy, medicine, the body as diagram. | anatomy, medicine, body, science, drawing |
| 15 | pilar | Pilar Rojas | 36 | woman | Mexico City | Film editor | Faces, film stills, and the dead. | film, portraits, death, mirrors, black-and-white |
| 16 | eli | Eli Nordström | 44 | man | Vermont | Woodworker | Trees standing and trees cut. | wood, trees, furniture, nature, carving |
| 17 | noor | Noor El-Sayed | 31 | woman | Cairo | Poet | Words, birds, and weather; nothing built by hand. | poetry, literature, birds, emotions, consciousness |
| 18 | felix | Felix Brandt | 58 | man | Berlin | Geologist | Rock, fire, ice; the planet at work. | geology, fire, snow, water, land-art |
| 19 | chloe | Chloé Dubois | 24 | woman | Paris | Fashion buyer | Clothes, jewels, and abstraction. | fashion, jewelry, abstract, color, photography |
| 20 | sam | Sam Whitaker | 39 | nonbinary | Portland | Game designer | Games, illusions, animals, cats specifically. | games, optical-illusion, animals, cats, toys, zoology |

Pairs built for comparison: 3 and 16 (both nature, one grows it, one cuts it); 8 and 2 (machines,
seventy years apart); 1 and 13 (both spare, one concrete, one clay); 12 and 17 (both
non-visual subjects — how does the feed serve *music* and *poetry* from an image corpus?);
7 and 4 (both graphic, opposite temperaments).

## 5. Testing

- **`topic-facets.test.ts`** (unit): only the four facet values appear; every id in `TOPICS`
  has a facet; `19th-century` has none; no duplicate keys. The integration variant checks the
  other direction against the database: every key is a real topic id, and every non-era topic
  in the database is a key.
- **`seed-topics`** (integration): after a run, every non-era topic in the database has a facet
  and the sixteen are `tier = 'original'`.
- **`topics` router** (unit + integration): `list` carries `facet` and omits the era topic;
  `setMine` accepts a grown id and rejects `19th-century`; `weights` and `resetWeights` are
  `NOT_FOUND` with the gate off and work with it on.
- **Onboarding screen** (unit, existing file): four stages render the right facet's chips; Back
  keeps picks; Done disabled at zero picks and enabled after one on any stage; one `setMine`
  call with the union.
- **Topics page** (unit): tabs switch facets; a toggle calls `setMine` with the new set;
  unpicking the last is refused; weights render only under the gate.
- **Settings screen** (unit, existing file): the "What you see" row links to `/profile/topics`;
  the sheet tests go with the sheet.
- **Persona seed** (integration): two runs, second is all-unchanged; editing a pick and re-running
  changes exactly that user's rows; the e2e cleaner's dry run counts zero personas.
- **Playwright:** `settings.spec.ts` and the onboarding steps in `auth.spec.ts` / `support.ts`
  follow the four stages; one new flow — profile → Topics → toggle → feed reflects it (the topic
  label appears on a card's debug line under `FEED_DEBUG`, as the dev-feed spec already reads).

## Out of scope, recorded

- The mining round that grows every facet (decision 3). Do it after this ships; the
  `topic-proposals.md` facet column is the hook.
- Duplicate merges (decision 8).
- Era as a fifth facet — needs Cut 2b.
- Any visual redesign of onboarding, profile, or settings — sub-projects 2 and 3.
- Demographic collection, and the "simple, transparent algorithm" that would use it.
