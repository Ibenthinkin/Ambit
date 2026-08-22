// The v1 topic set — checked-in config, not user data, and not freeform search (SPEC §3.2).
//
// Why config? A topic is a *contract*, not a label. Its id is the join key for three separate
// systems, and they all have to agree or the feed breaks:
//
//     topics.ts (this file)  →  the `topic` table          (seeded by scripts/seed-topics.ts)
//                            →  topic-graph.json keys      (DRIFT/JUMP walk the graph, SPEC §9)
//                            →  item.topic_id              (which seed query surfaced an item)
//                            →  user_topic.topic_id        (the user's weights, SPEC §5.3)
//
// A user picking chips in onboarding selects from *these* ids; ingestion tags every item with one
// of them; the feed's drift walk looks each one up in the graph. Let a topic exist in one place
// but not another and the feed either can't drift out of it or can't draw into it. That contract
// is what src/server/config/topics.test.ts exists to enforce.
//
// Why sixteen and not the design handoff's thirty-two chips? Settled 07-17-26 (docs/BUILD_PLAN.md
// 2.3): DRIFT and JUMP need a graph row per topic, and only these sixteen have one — the graph was
// built offline in Phase 0 from mean-centered topic centroids over the curated corpus. Seeding a
// graph-less topic would give the feed somewhere to go and no way back out. The chip grid grows
// toward the handoff's thirty-two in Phase 6, once new harvests land and the graph is recomputed.

/** The five sources with adapters landing in Phase 3, plus `archive` (Phase A.5) — Ben's own
 *  personal-archive service rather than a public museum API, ingested over its /search endpoint.
 *  Phase 6.2 adds four more behind TRIAL_SOURCES below — trialed, not committed. */
export const V1_SOURCES = [
  "wikipedia",
  "met",
  "aic",
  "cma",
  "wellcome",
  "archive",
] as const;

export type V1Source = (typeof V1_SOURCES)[number];

/** The Phase 6.2 trial batch (docs/source-candidates.md's trial loop) — adapters that exist and
 *  ingest, but are not committed sources until Ben's Keep/Park/Cut verdict. Kept separate from
 *  V1_SOURCES precisely so the type system can treat them differently: a v1 source owes every
 *  topic a cell, a trial source owes only the topics where it is honest. */
export const TRIAL_SOURCES = [
  "smithsonian",
  "loc",
  "nasa-images",
  "poetrydb",
] as const;

export type TrialSource = (typeof TRIAL_SOURCES)[number];

/** Every source that may appear in a seedQueries cell. Iterate this — not V1_SOURCES — anywhere
 *  the question is "what did this topic actually ask for". */
export const SEED_SOURCES = [...V1_SOURCES, ...TRIAL_SOURCES] as const;

/**
 * Per-source search terms that seed a topic's ingestion.
 *
 * Arrays, not single strings, because museums index by *object vocabulary* rather than concept —
 * one term per topic does not survive contact with five different APIs (phase0/NOTES.md:44). The
 * DB column is deliberately typed looser (`Record<string, string[]>` in schema.ts) so Phase 6 can
 * add sources without a migration; this narrower type just catches typos across sixteen rows.
 *
 * The two halves are typed differently on purpose (Phase 6.2 decision 4, "partial topic coverage
 * is by design"): every v1 source is **required** on every topic, while a trial source's cell is
 * **optional** — PoetryDB will never feed `ceramics`, and pretending otherwise would mean either
 * a dishonest query or an empty array. An absent cell costs nothing: scripts/ingest.ts reads
 * `seedQueries[sourceId] ?? []` and skips an empty list, so a source simply doesn't appear in the
 * topics it has nothing to say about. What the optional-but-typed shape still buys is the typo
 * check — `nasa_images:` or `poetryDB:` fails to compile rather than silently seeding nothing.
 */
export type SeedQueries = Record<V1Source, string[]> &
  Partial<Record<TrialSource, string[]>>;

export interface TopicConfig {
  /** Slug. MUST match a key in server/config/topic-graph.json — see the header. */
  id: string;
  /** Chip label shown in onboarding (SPEC §3.2). Diverges from `id` only for `cartography`. */
  label: string;
  seedQueries: SeedQueries;
}

// Ordered alphabetically by id, matching topic-graph.json's key order, so the two can be diffed
// against each other by eye. This is *not* the onboarding chip order — that's Phase 5.3's call,
// and it reads from this array rather than from the DB.
//
// Queries are ported from phase0/harvest.ts's TOPICS block, which is what actually produced the
// 8,093-item corpus the topic graph was built from. Four cells were retuned for 2.3 (each marked
// and justified inline); everything else is verbatim, because it demonstrably worked.
//
// The `archive` cells (Phase A.5) are the exception to that porting: there was nothing to port,
// so they were written against real tag counts queried read-only out of ambit-archive's SQLite on
// 08-17-26. Two structural differences from the museum cells are worth knowing before retuning
// them:
//
//   1. **An archive cell can never come back empty.** /search is cosine ranking over the whole
//      embedded corpus, so every query fills its quota with nearest neighbours however weak the
//      match. Ingestion's "empty cell → warn and continue" path simply never fires here; the
//      failure mode is silent off-topic drift instead, which only eyeballing catches.
//   2. **Weak topics therefore get ONE query, not two.** A topic's quota splits per-query inside
//      its cell, so a second query on a thin subject doubles the off-topic fill. Cells marked
//      "weak coverage" below are deliberately single-query for that reason.
//
// Coverage, by top matching tag counts (08-17-26): strong — portraiture (portrait 1096),
// architecture (526 + architectural drawing 99), botany (botanical 213 + botanical illustration
// 132), the-ocean (beach 112, ocean 96, marine life 76), geology (geology 104, mineral 95),
// zoology (wildlife 103, birds ~87), typography (hand-lettered 99, poster 97, typography 88),
// astronomy (space 76, cosmic 70, stars 66), mythology (~47 scenes + ~90 creatures); moderate —
// ancient-history, machines, textiles, cartography; weak — ceramics, music, poetry, each
// annotated at its cell. Expect retuning after the first real ingest regardless.
export const TOPICS: readonly TopicConfig[] = [
  {
    id: "ancient-history",
    label: "Ancient history",
    seedQueries: {
      wikipedia: ["ancient history"],
      met: ["ancient"],
      aic: ["ancient"],
      cma: ["ancient"],
      wellcome: ["antiquities"],
      archive: [
        "ancient ruins and archaeology",
        "classical statue or carved stone relief",
      ],
      // Live hit counts 08-21-26: antiquities 3,048 · ancient 2,497. Both are modest by
      // Smithsonian standards, which is the point — the broad terms here return archival and
      // specimen records rather than objects.
      smithsonian: ["antiquities", "ancient"],
    },
  },
  {
    id: "architecture",
    label: "Architecture",
    seedQueries: {
      wikipedia: ["architecture"],
      met: ["architecture"],
      aic: ["architecture"],
      cma: ["architecture"],
      wellcome: ["architecture"],
      archive: ["striking architecture", "architectural drawing or model"],
      // Margolies photographed roadside America, so this cell is building *types*, not the word
      // "architecture" (which the collection never uses). Hits: motel 990 · gas station 756 ·
      // diner 86 — the small one is kept because diners are the collection's signature subject.
      loc: ["motel", "diner", "gas station"],
    },
  },
  {
    id: "astronomy",
    label: "Astronomy",
    seedQueries: {
      wikipedia: ["astronomy"],
      met: ["astronomy"],
      aic: ["astronomy"],
      // Retuned: CMA `astronomy` returns only 23 hits. `celestial` (106) and `moon` (368) are the
      // object vocabulary its catalogue actually uses. `star` (193) was rejected — it matches
      // decorative star motifs on quilts and ceramics far more often than anything astronomical.
      cma: ["astronomy", "celestial", "moon"],
      wellcome: ["astronomy"],
      archive: ["night sky full of stars", "planets spacecraft and the cosmos"],
      // Hits: galaxy 1,729 · nebula 316.
      "nasa-images": ["nebula", "galaxy"],
      // Line-keywords, not subjects: PoetryDB searches the text of poems. Matches: stars 312 ·
      // moon 415.
      poetrydb: ["stars", "moon"],
    },
  },
  {
    id: "botany",
    label: "Botany",
    seedQueries: {
      wikipedia: ["botany"],
      met: ["botanical"],
      aic: ["botanical"],
      cma: ["botanical"],
      wellcome: ["botany"],
      archive: ["botanical illustration", "flowers and plants"],
      // `botanical` (21,929) leans toward the illustration plates; `herbarium` (12,613) toward
      // pressed specimens. Both are in deliberately, to let T5's evidence show which survives
      // the curator's floor.
      smithsonian: ["botanical", "herbarium"],
      // Matches: flower 634 · rose 585.
      poetrydb: ["flower", "rose"],
    },
  },
  {
    id: "cartography",
    label: "Maps", // The handoff's chip term. The *slug* stays `cartography` — it's a graph key.
    seedQueries: {
      wikipedia: ["cartography"],
      met: ["map"],
      aic: ["map"],
      // Retuned, marginally: CMA simply holds few maps (`map` = 35 hits, `cartography` = 17).
      // `globe` (41) and `atlas` (5) scrape together what's there.
      cma: ["map", "globe", "atlas"],
      wellcome: ["map"],
      archive: [
        "old map of terrain or coastline",
        "topographic or celestial chart",
      ],
      // The nearest honest thing NASA has to a map: 7,356 hits, satellite imagery of terrain.
      // Not cartography in the drawn sense — a Park-worthy stretch if the tiles read wrong.
      "nasa-images": ["earth observation"],
    },
  },
  {
    id: "ceramics",
    label: "Ceramics",
    seedQueries: {
      wikipedia: ["ceramic art"],
      met: ["ceramic"],
      aic: ["ceramic"],
      cma: ["ceramic"],
      wellcome: ["pottery"],
      // Weak corpus coverage — ceramic + pottery + vase tags total roughly 20 items. Cosine
      // search still fills the quota from nearest neighbours no matter how weak the match, so
      // the risk here is drift, not starvation: eyeball this cell at probe time, then retune
      // or accept. One query rather than two, deliberately.
      archive: ["glazed ceramic pottery vessel"],
      // Hits: ceramic 3,642 · pottery 708.
      smithsonian: ["ceramic", "pottery"],
    },
  },
  {
    id: "geology",
    label: "Geology",
    seedQueries: {
      wikipedia: ["geology"],
      met: ["mineral"],
      aic: ["mineral"],
      cma: ["mineral"],
      wellcome: ["geology"],
      archive: ["mineral specimen or crystal", "dramatic rock formation"],
      // Hits: mineral 15,024 · crystal 1,930.
      smithsonian: ["mineral", "crystal"],
      // Hits: volcano 1,208 · glacier 367.
      "nasa-images": ["volcano", "glacier"],
    },
  },
  {
    id: "machines",
    label: "Machines",
    seedQueries: {
      wikipedia: ["machine"],
      met: ["machine"],
      aic: ["machinery"],
      cma: ["machine"],
      wellcome: ["machinery"],
      archive: ["industrial machinery", "mechanical device or engine"],
      // Hits: machine 4,232 · engine 2,207.
      smithsonian: ["machine", "engine"],
      // 779 hits — Margolies shot cars in front of everything.
      loc: ["automobile"],
      // Hits: rocket 46,251 · aircraft 9,928.
      "nasa-images": ["rocket", "aircraft"],
    },
  },
  {
    id: "music",
    label: "Music",
    seedQueries: {
      wikipedia: ["music"],
      met: ["musical instrument"],
      aic: ["musical instrument"],
      cma: ["musical instrument"],
      wellcome: ["music"],
      // Weak coverage — musician + drum tags total roughly 15 items. Same caveat as ceramics.
      archive: ["musician performing with an instrument"],
    },
  },
  {
    id: "mythology",
    label: "Mythology",
    seedQueries: {
      wikipedia: ["mythology"],
      met: ["mythology"],
      aic: ["mythology"],
      cma: ["mythology"],
      wellcome: ["mythology"],
      archive: ["mythological scene with gods or creatures", "mythical beast"],
      // 173 matches — the thinnest poetrydb cell, and honestly so.
      poetrydb: ["gods"],
    },
  },
  {
    id: "poetry",
    label: "Poetry",
    seedQueries: {
      wikipedia: ["poetry"],
      met: ["poetry"],
      aic: ["poetry"],
      cma: ["poetry"],
      wellcome: ["poetry"],
      // Weakest cell in the matrix: the corpus carries no poem/poetry tags at all, so nearest
      // neighbours will skew toward typography and manuscript material — which is also what
      // the typography cell draws. resolveCollisions settles the overlap deterministically
      // (lowest rank wins; ties break alphabetically, so poetry takes them), and the
      // collision count is one of A.5's recorded measurements.
      archive: ["handwritten poem or manuscript page"],
      // The one cell where the source and the topic are the same thing. Matches: love 1,504 ·
      // night 1,006 · song 524.
      poetrydb: ["love", "night", "song"],
    },
  },
  {
    id: "portraiture",
    label: "Portraiture", // Not in the handoff's 32 — graph-validated topics win (07-17-26).
    seedQueries: {
      wikipedia: ["portrait"],
      met: ["portrait"],
      aic: ["portrait"],
      cma: ["portrait"],
      wellcome: ["portrait"],
      archive: [
        "portrait of a person",
        "expressive portrait photograph or painting",
      ],
      // 22,221 hits, across the portrait galleries and every unit's people photographs.
      smithsonian: ["portrait"],
    },
  },
  {
    id: "textiles",
    label: "Textiles",
    seedQueries: {
      wikipedia: ["textile"],
      met: ["textile"],
      aic: ["textile"],
      cma: ["textile"],
      wellcome: ["textile"],
      archive: ["woven textile or fabric pattern", "embroidery and stitching"],
      // Hits: textile 13,350 · woven 4,402.
      smithsonian: ["textile", "woven"],
    },
  },
  {
    id: "the-ocean",
    label: "The ocean",
    seedQueries: {
      wikipedia: ["ocean"],
      met: ["ocean"],
      aic: ["sea"],
      cma: ["sea"],
      wellcome: ["sea"],
      archive: ["ocean waves and seascape", "underwater marine life"],
      // Hits: ocean 9,804 · sea ice 443.
      "nasa-images": ["ocean", "sea ice"],
      // 842 matches.
      poetrydb: ["sea"],
    },
  },
  {
    id: "typography",
    label: "Typography",
    seedQueries: {
      wikipedia: ["typography"],
      // Retuned: the Met holds only 39 objects for `typography` — a real corpus limit, not a bad
      // query. The object-vocabulary terms phase0/NOTES.md:47 predicted are all far richer:
      // `letterpress` (1,044), `calligraphy` (2,665), `broadside` (256).
      met: ["typography", "letterpress", "calligraphy", "broadside"],
      aic: ["typography", "letterpress"],
      // Retuned: CMA returns *zero* hits for `typography` — the one genuinely empty cell in the
      // whole matrix. `calligraphy` (279) and `letterpress` (30) are what it actually holds, so
      // the dead term is dropped entirely rather than kept for appearances.
      cma: ["calligraphy", "letterpress"],
      wellcome: ["printing"],
      archive: ["typography and lettering", "hand-lettered poster design"],
      // Roadside lettering is what this collection is *for*. `sign` (2,197) carries the cell;
      // `neon sign` (10) is kept because those ten are the best of them.
      loc: ["neon sign", "sign"],
    },
  },
  {
    id: "zoology",
    label: "Zoology", // Also not in the handoff's 32 — same reasoning as Portraiture.
    seedQueries: {
      wikipedia: ["zoology"],
      met: ["animal"],
      aic: ["animal"],
      cma: ["animal"],
      wellcome: ["zoology"],
      archive: ["wild animal", "insect or bird illustration"],
      // Deliberately NOT `specimen` (5,029,597 hits) — that term is the whole natural-history
      // catalogue and would flood the trial with tray shots. `animal` (1,113,345) and `bird`
      // (566,124) are still enormous; how much of that survives curation is the density
      // question this trial exists to answer.
      smithsonian: ["animal", "bird"],
    },
  },
];
