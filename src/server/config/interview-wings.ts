// The twelve wings — the subject areas the first picture questions sample
// (docs/DESIGN_first-exhibition.md §2). A wing is a bundle of subject topics a reader would
// recognise from one picture; it is *not* a new kind of group — the umbrella groups, facets and
// the feed never hear of it. It exists for three things:
//   - the "Which one is the most interesting?" rounds: twelve wings, three rounds of four;
//   - weighting: people broadly agree about nature and disagree about art (Vessel et al., 2018,
//     "Stronger shared taste for natural aesthetic domains than for artifacts of human culture",
//     Cognition 179), so a pick from a nature wing says less about *this* reader — `weight` < 1;
//   - the reveal title's noun, which lives with the rest of the frame's words in
//     lib/interview/frame.ts (`FRAME.nouns`, keyed by wing id).
// Ben edits this file freely.

export interface Wing {
  id: string;
  label: string;
  weight: number;
  topics: readonly string[];
  proposed: readonly string[];
  /** The topic whose best picture stands for the wing until a hand pick is set. */
  faceTopic: string;
}

export const WINGS: readonly Wing[] = [
  {
    id: "creatures",
    label: "Creatures",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 0.8,
    topics: ["animals", "zoology", "cats", "birds", "insects"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "dogs",
      "horses",
      "butterflies-and-moths",
      "marine-life",
      "shells",
      "whales",
    ],
    /** Prototype pictures, by caption: Spoonbill, in an old book · Boar, a linocut · A cat on a book cover. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "animals",
  },
  {
    id: "growing",
    label: "Growing things",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 0.8,
    topics: ["plants", "botany", "flowers", "trees", "mushrooms"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "houseplants",
      "gardens",
      "garden-design",
      "farming",
      "harvest",
      "rural-life",
    ],
    /** Prototype pictures, by caption: Mushrooms on the forest floor · Mushrooms, a natural-history plate · Seedlings. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "plants",
  },
  {
    id: "land",
    label: "Land, sea & sky",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 0.7,
    topics: [
      "landscapes",
      "nature",
      "natural-history",
      "desert",
      "sand",
      "the-ocean",
      "water",
      "geology",
      "clouds",
      "weather",
      "snow",
      "light",
      "fire",
      "night",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "minerals",
      "volcanoes",
      "mountains",
      "polar",
      "glaciers",
      "spring",
      "summer",
      "autumn",
      "winter",
    ],
    /** Prototype pictures, by caption: A river through the forest, from above · Rocks in a still sea, painted · A river valley, painted. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "landscapes",
  },
  {
    id: "space",
    label: "Space & tomorrow",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: [
      "astronomy",
      "space-exploration",
      "astronaut",
      "moon",
      "spaceship",
      "space-art",
      "science-fiction",
      "robot",
      "alien",
      "ufo",
      "star-wars",
      "star-trek",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: ["utopias", "future-cities", "space-age"],
    /** Prototype pictures, by caption: Saturn over the desert · Cosmonautics Day postcard · A probe among the moons. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "astronomy",
  },
  {
    id: "machines",
    label: "Machines & how things work",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: [
      "machines",
      "technology",
      "science",
      "industrial",
      "industrial-design",
      "cars",
      "games",
      "retro-computing",
      "retro-gaming",
      "cartography",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "trains",
      "ships",
      "aviation",
      "bicycles",
      "mathematics",
      "physics",
      "chemistry",
      "scientific-instruments",
      "clocks",
    ],
    /** Prototype pictures, by caption: A control room · A music box mechanism · Engineer at work. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "machines",
  },
  {
    id: "cities",
    label: "Cities & buildings",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: [
      "architecture",
      "urban-landscape",
      "urban-decay",
      "street-art",
      "travel",
      "roadside-americana",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "interiors",
      "houses",
      "cabins",
      "bridges",
      "towers",
      "castles",
      "ruins",
    ],
    /** Prototype pictures, by caption: A night street after rain · A teapot-shaped gas station · A tower of frames, painted. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "architecture",
  },
  {
    id: "people",
    label: "People & daily life",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: [
      "portraiture",
      "portraits",
      "toys",
      "kids",
      "children-s-illustration",
      "balloons",
      "fashion",
      "shoes",
      "jewelry",
      "soviet",
      "soviet-propaganda",
      "advertising",
      "activism",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "work",
      "craftspeople",
      "markets",
      "sport",
      "athletics",
      "winter-sports",
      "board-games",
      "festivals",
      "weddings",
      "holidays",
      "costume",
      "hairstyles",
      "beauty",
      "social-history",
      "royalty",
      "military-history",
      "crime",
    ],
    /** Prototype pictures, by caption: Girl in a shawl, an old portrait · On the street, 1930s · Woman in a red dress. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "portraiture",
  },
  {
    id: "myth",
    label: "Myth, ritual & the ancient world",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: [
      "mythology",
      "fantasy",
      "dragon",
      "monster",
      "horror",
      "halloween",
      "death",
      "ancient-history",
    ],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "folklore",
      "fairy-tales",
      "masks",
      "witches",
      "ancient-egypt",
      "classical-antiquity",
      "pre-columbian",
      "ancient-china",
      "religious-art",
      "sacred-architecture",
      "ritual",
      "icons",
    ],
    /** Prototype pictures, by caption: A divine couple, carved in stone · A carved figure · Seated figure in stone. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "mythology",
  },
  {
    id: "body",
    label: "Body & mind",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: ["anatomy", "body", "medicine", "consciousness", "emotions"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: ["dreams", "psychology", "neuroscience", "love", "family"],
    /** Prototype pictures, by caption: A skeleton, drawn · A head full of flowers · Diagrams of the body. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "anatomy",
  },
  {
    id: "made",
    label: "Things people make",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: ["furniture", "mirrors", "still-life"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: ["collecting"],
    /** Prototype pictures, by caption: A spiral rug · White blocks · A small dark vessel. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "furniture",
  },
  {
    id: "everyday",
    label: "Food & the everyday",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: ["food", "fruit", "books", "literature", "humor"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "cooking",
      "drinks",
      "cafes-and-restaurants",
      "shops",
      "signs",
      "packaging",
      "manuscripts",
      "handwriting",
      "caricature",
    ],
    /** Prototype pictures, by caption: Breakfast with a samovar, painted · Oranges, illustrated · An orange lamp. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "food",
  },
  {
    id: "stage",
    label: "Stage, screen & sound",
    /** Picks from this wing are multiplied by this (1 = full weight). */
    weight: 1,
    topics: ["music", "sound", "dance", "film", "animation"],
    /** Proposed topics (docs/first-exhibition/vocabulary-proposal.md); dropped until listed. */
    proposed: [
      "musical-instruments",
      "television",
      "theatre",
      "circus",
      "puppetry",
      "magic-shows",
    ],
    /** Prototype pictures, by caption: An audience laughing · A violin · Two guitarists. Resolve with scripts/first-exhibition-faces.ts. */
    faceTopic: "music",
  },
];
