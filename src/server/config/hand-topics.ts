// Hand-added topics (docs/DESIGN_first-exhibition.md §5) — vocabulary that was *not* mined from
// the corpus's own tags, so it cannot go through `promote:topics`: round one of the First
// Exhibition proposal (docs/first-exhibition/vocabulary-proposal.md; Ben's ticks are the verdict,
// this file is the result). The sixteen in topics.ts are the graph's tuned set and stay sixteen;
// these are seeded by `db:seed` at tier `grown`, like a promoted topic, with the seed queries
// the search-shaped museums will be asked. Ingest reads the queries off the row, so nothing in
// scripts/ingest.ts changes; `graph:rebuild` gives them edges once items arrive.
//
// Facet and group live where they do for every topic — topic-facets.ts and topic-groups.ts — and
// hand-topics.test.ts refuses an entry here that is missing from either.
//
// **Looks and forms carry no queries.** A museum search for "cozy" or "essays" is not honest;
// those topics are homed by the curator's tags and, for forms, by the writing curator later.
import { V1_SOURCES, type SeedQueries } from "./topics";

export interface HandTopic {
  id: string;
  label: string;
  seedQueries: SeedQueries;
}

/** The same query for every v1 source — a first guess; per-source cells can be edited in place. */
function cells(query: string, over: Partial<SeedQueries> = {}): SeedQueries {
  const base = Object.fromEntries(
    V1_SOURCES.map((s) => [s, [query]]),
  ) as SeedQueries;
  return { ...base, ...over };
}
/** No search anywhere: tag- or classify-homed only. */
function noCells(): SeedQueries {
  return Object.fromEntries(
    V1_SOURCES.map((s) => [s, [] as string[]]),
  ) as SeedQueries;
}

export const HAND_TOPICS: readonly HandTopic[] = [
  // ── Subject ──────────────────────────────────────────────────────────────────────────────
  { id: "gardens", label: "Gardens", seedQueries: cells("garden") },
  { id: "mountains", label: "Mountains", seedQueries: cells("mountains") },
  { id: "ships", label: "Ships", seedQueries: cells("ship") },
  { id: "interiors", label: "Interiors", seedQueries: cells("interior") },
  { id: "ruins", label: "Ruins", seedQueries: cells("ruins") },
  {
    id: "sport",
    label: "Sport",
    seedQueries: cells("sport", { wellcome: ["athletes"] }),
  },
  { id: "festivals", label: "Festivals", seedQueries: cells("festival") },
  { id: "costume", label: "Costume", seedQueries: cells("costume") },
  { id: "folklore", label: "Folklore", seedQueries: cells("folklore") },
  { id: "masks", label: "Masks", seedQueries: cells("mask") },
  {
    id: "religious-art",
    label: "Religious art",
    seedQueries: cells("religious"),
  },
  {
    id: "sacred-architecture",
    label: "Sacred architecture",
    seedQueries: cells("temple", {
      wellcome: ["church"],
      archive: ["temple, church or mosque — sacred architecture"],
    }),
  },
  {
    id: "theatre",
    label: "Theatre",
    seedQueries: cells("theater", { wellcome: ["theatre"] }),
  },
  {
    id: "musical-instruments",
    label: "Musical instruments",
    seedQueries: cells("musical instrument"),
  },
  // ── Medium ───────────────────────────────────────────────────────────────────────────────
  { id: "woodcut", label: "Woodcut", seedQueries: cells("woodcut") },
  { id: "etching", label: "Etching", seedQueries: cells("etching") },
  {
    id: "stained-glass",
    label: "Stained glass",
    seedQueries: cells("stained glass"),
  },
  { id: "tapestry", label: "Tapestry", seedQueries: cells("tapestry") },
  {
    id: "illuminated-manuscripts",
    label: "Illuminated manuscripts",
    seedQueries: cells("illuminated manuscript"),
  },
  {
    id: "nature-photography",
    label: "Nature photography",
    seedQueries: cells("nature photograph"),
  },
  // ── Tradition ────────────────────────────────────────────────────────────────────────────
  { id: "ukiyo-e", label: "Ukiyo-e", seedQueries: cells("ukiyo-e") },
  { id: "islamic-art", label: "Islamic art", seedQueries: cells("islamic") },
  { id: "medieval", label: "Medieval", seedQueries: cells("medieval") },
  {
    id: "renaissance",
    label: "Renaissance",
    seedQueries: cells("renaissance"),
  },
  {
    id: "impressionism",
    label: "Impressionism",
    seedQueries: cells("impressionism"),
  },
  // ── Look (no queries) ────────────────────────────────────────────────────────────────────
  { id: "minimal", label: "Minimal", seedQueries: noCells() },
  { id: "ornate", label: "Ornate", seedQueries: noCells() },
  { id: "nostalgic", label: "Nostalgic", seedQueries: noCells() },
  { id: "cozy", label: "Cozy", seedQueries: noCells() },
  { id: "delicate", label: "Delicate", seedQueries: noCells() },
  // ── Form (no queries) ────────────────────────────────────────────────────────────────────
  { id: "essays", label: "Essays", seedQueries: noCells() },
  { id: "criticism", label: "Criticism", seedQueries: noCells() },
  {
    id: "letters-and-diaries",
    label: "Letters & diaries",
    seedQueries: noCells(),
  },
];

const HAND_IDS: ReadonlySet<string> = new Set(HAND_TOPICS.map((t) => t.id));
export function isHandTopic(id: string): boolean {
  return HAND_IDS.has(id);
}
