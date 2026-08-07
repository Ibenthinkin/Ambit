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

/** The five sources with adapters landing in Phase 3. Phase 6 adds Smithsonian, NASA APOD, etc. */
export const V1_SOURCES = [
  "wikipedia",
  "met",
  "aic",
  "cma",
  "wellcome",
] as const;

export type V1Source = (typeof V1_SOURCES)[number];

/**
 * Per-source search terms that seed a topic's ingestion.
 *
 * Arrays, not single strings, because museums index by *object vocabulary* rather than concept —
 * one term per topic does not survive contact with five different APIs (phase0/NOTES.md:44). The
 * DB column is deliberately typed looser (`Record<string, string[]>` in schema.ts) so Phase 6 can
 * add sources without a migration; this narrower type just catches typos across sixteen rows.
 */
export type SeedQueries = Record<V1Source, string[]>;

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
    },
  },
];
