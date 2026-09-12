// The four facets the pickers group topics by, and every topic's assignment
// (docs/DESIGN_topic-facets-and-personas.md §1, 09-10-26). Hand-assigned, on purpose: a facet
// by graph neighbourhood would file `watercolor` under Botany because they co-occur, and a
// facet by tier would just be age. `db:seed` applies this map on every boot, which is what
// puts facets on production with nothing copied into the container.
//
// A topic missing from this map has `facet = NULL` in the database and is NOT pickable —
// `listTopics()` filters on the column. That is the honest state of a topic nobody has
// classified (a fresh promotion) and the intended state of an era topic (`19th-century`,
// tag-only since 09-07-26: no item displays under it, so picking it is an empty pool until
// Cut 2b moves the feed onto the membership join). `promote:topics` refuses to promote without
// a facet and prints the line to paste here.
//
// Judgement calls, recorded so they are not re-argued: `retrofuturism` is a look (it names a
// style; `science-fiction` names the subject). `light`, `fire`, `water`, `sand`, `snow` are
// subjects — what is pictured; `glass`, `metal`, `wood`, `paper`, `plastic`, `clay` are media —
// what it is made of (`clay` sits beside `ceramics`; both stay). `installation`, `land-art`,
// `murals`, `dioramas`, `miniature` are media in the "kind of work" sense. `still-life` and
// `portraits` are subjects in the genre sense. Known duplicates (`portraiture`/`portraits`,
// `botany`/`plants`/`flowers`, `zoology`/`animals`) are noted in the design doc and not merged
// here — merging is topic surgery on memberships and graph rows.
import type { TopicFacet } from "~/server/db/schema";

/** Display order — onboarding's stages, the page's tabs. */
export const FACETS = [
  "subject",
  "medium",
  "look",
  "place",
] as const satisfies readonly TopicFacet[];

export const FACET_LABELS: Record<TopicFacet, string> = {
  subject: "Subject",
  medium: "Medium",
  look: "Look",
  place: "Place",
};

/** Topics that are unfaceted by design, not by omission — `db:seed` does not warn about these. */
export const ERA_TOPICS: ReadonlySet<string> = new Set(["19th-century"]);

const subject = [
  // The thirteen originals that are subjects.
  "ancient-history",
  "architecture",
  "astronomy",
  "botany",
  "cartography",
  "geology",
  "machines",
  "music",
  "mythology",
  "poetry",
  "portraiture",
  "the-ocean",
  "zoology",
  // Grown.
  "activism",
  "advertising",
  "anatomy",
  "animals",
  "balloons",
  "birds",
  "body",
  "books",
  "cars",
  "cats",
  "clouds",
  "consciousness",
  "dance",
  "death",
  "emotions",
  "fashion",
  "film",
  "fire",
  "flowers",
  "food",
  "fruit",
  "furniture",
  "games",
  "insects",
  "jewelry",
  "kids",
  "landscapes",
  "light",
  "literature",
  "medicine",
  "mirrors",
  "nature",
  "plants",
  "portraits",
  "sand",
  "science",
  "science-fiction",
  "shoes",
  "snow",
  "sound",
  "still-life",
  "technology",
  "toys",
  "travel",
  "trees",
  "water",
  "weather",
  // Round 2 (09-12-26), docs/topic-proposals-round2.md:
  "soviet",
  "soviet-propaganda",
  "natural-history",
  "spaceship",
  "space-exploration",
  "space-art",
  "astronaut",
  "moon",
  "alien",
  "robot",
  "ufo",
  "monster",
  "dragon",
  "star-wars",
  "star-trek",
  "children-s-illustration",
  "retro-computing",
  "retro-gaming",
  "industrial",
  "industrial-design",
  "urban-decay",
  "urban-landscape",
  "street-art",
  "desert",
  "halloween",
  "animation",
  "humor",
  "horror",
  "fantasy",
  "mushrooms",
  "roadside-americana",
  "night",
];

const medium = [
  // The three originals that are media.
  "ceramics",
  "textiles",
  "typography",
  // Grown.
  "carving",
  "clay",
  "collage",
  "digital",
  "dioramas",
  "drawing",
  "embroidery",
  "found-objects",
  "glass",
  "illustration",
  "ink",
  "installation",
  "land-art",
  "metal",
  "miniature",
  "mixed-media",
  "murals",
  "painting",
  "paper",
  "photography",
  "plastic",
  "sculpture",
  "watercolor",
  "wood",
  // Round 2 (09-12-26), docs/topic-proposals-round2.md:
  "comics",
  "cover-art",
  "album-art",
  "folk-art",
  "street-photography",
  "graphic-design",
  "poster-art",
  "engraving",
  "diagram",
  "scientific-illustration",
  "technical-drawing",
  "botanical-illustration",
  "postcard",
  "concept-art",
];

const look = [
  "abstract",
  "black-and-white",
  "color",
  "geometric",
  "optical-illusion",
  "pattern",
  "psychedelic",
  "retrofuturism",
  "surreal",
  // Round 2 (09-12-26), docs/topic-proposals-round2.md:
  "mid-century-modern",
  "art-deco",
  "brutalist",
  "aerial-view",
  "whimsical",
  "eerie",
  "painterly",
  "neon",
  "pastel-palette",
  "cinematic",
  "melancholy",
];

const place = [
  "chicago",
  "japan",
  "london",
  "new-york",
  // Round 2 (09-12-26), docs/topic-proposals-round2.md:
  "russia",
  "ukraine",
];

function assign(ids: readonly string[], facet: TopicFacet) {
  return Object.fromEntries(ids.map((id) => [id, facet] as const));
}

export const TOPIC_FACETS: Readonly<Record<string, TopicFacet>> = {
  ...assign(subject, "subject"),
  ...assign(medium, "medium"),
  ...assign(look, "look"),
  ...assign(place, "place"),
};

export function facetOf(topicId: string): TopicFacet | undefined {
  return TOPIC_FACETS[topicId];
}
