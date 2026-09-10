// Twenty pretend readers (docs/DESIGN_topic-facets-and-personas.md §4, 09-10-26). They exist so a
// feed can be judged from more than one chair: Ben signs in as one and sees exactly what that
// person's picks produce, sign-in included — there is no switcher UI, and there is not meant to be.
//
// **The demographics are documentation, and nothing writes them.** `scripts/seed-personas.ts`
// stores a name, an email and topic picks; age, gender, location, profession and taste live here
// and in the design doc for Ben's reading only. Collecting anything like this for real waits for
// the "simple, transparent algorithm" design pass — it is not a schema this is prototyping.
//
// Checked into `src/server/config/` rather than under `docs/` on purpose: `docs/` is excluded from
// the production image, and these are seeded in production too.
//
// Picks are chosen to give the feed different centres of gravity — some narrow, some wide, a
// couple that overlap heavily so drift can be compared from nearby starts. The pairs built for
// comparison: 3 and 16 (both nature, one grows it, one cuts it); 8 and 2 (machines, seventy years
// apart); 1 and 13 (both spare, one concrete, one clay); 12 and 17 (both non-visual subjects — how
// does the feed serve *music* and *poetry* from an image corpus?); 7 and 4 (both graphic, opposite
// temperaments).
//
// Every `topics` entry must be a key of TOPIC_FACETS; personas.test.ts pins that, because a pick
// that is not pickable is one `setMine` would refuse.

export interface Persona {
  /** The url-safe half of the email, and how the seed reports one. */
  slug: string;
  name: string;
  /** Documentation only — never stored. Same for the four fields below. */
  age: number;
  gender: string;
  location: string;
  profession: string;
  taste: string;
  topics: readonly string[];
}

/** The seeded account for a persona. `@ambit.local` is deliberately not a deliverable domain and
 *  deliberately not `example.com` — `e2e:clean` retires `ambit-%@example.com` and must never see
 *  one of these. */
export function personaEmail(slug: string): string {
  return `persona-${slug}@ambit.local`;
}

export const PERSONAS: readonly Persona[] = [
  {
    slug: "maren",
    name: "Maren Holt",
    age: 34,
    gender: "woman",
    location: "Copenhagen",
    profession: "Architect",
    taste: "Clean lines, concrete, cold light.",
    topics: [
      "architecture",
      "geometric",
      "black-and-white",
      "photography",
      "furniture",
    ],
  },
  {
    slug: "dev",
    name: "Dev Raghunathan",
    age: 27,
    gender: "man",
    location: "Bangalore",
    profession: "Backend engineer",
    taste: "Space, old machines, anything with a schematic.",
    topics: [
      "astronomy",
      "machines",
      "technology",
      "science-fiction",
      "retrofuturism",
      "digital",
    ],
  },
  {
    slug: "rosa",
    name: "Rosa Almeida",
    age: 61,
    gender: "woman",
    location: "Lisbon",
    profession: "Retired botanist",
    taste: "Plants first, then everything that grows around them.",
    topics: ["botany", "plants", "flowers", "trees", "insects", "watercolor"],
  },
  {
    slug: "theo",
    name: "Theo Marchetti",
    age: 19,
    gender: "man",
    location: "Bologna",
    profession: "Art student",
    taste: "Loud color, collage, anything that looks cut and pasted.",
    topics: [
      "collage",
      "psychedelic",
      "color",
      "illustration",
      "murals",
      "surreal",
    ],
  },
  {
    slug: "ines",
    name: "Inès Bakker",
    age: 45,
    gender: "woman",
    location: "Amsterdam",
    profession: "Textile designer",
    taste: "Weave, stitch, pattern, repeat.",
    topics: ["textiles", "embroidery", "pattern", "ceramics", "japan"],
  },
  {
    slug: "kwame",
    name: "Kwame Asante",
    age: 38,
    gender: "man",
    location: "Accra",
    profession: "Cartographer",
    taste: "Maps, coastlines, and the weather that moves over them.",
    topics: ["cartography", "the-ocean", "weather", "clouds", "landscapes"],
  },
  {
    slug: "june",
    name: "June Park",
    age: 29,
    gender: "nonbinary",
    location: "Seoul",
    profession: "Type designer",
    taste: "Letters, ink, paper, and the occasional poster.",
    topics: ["typography", "ink", "paper", "advertising", "books"],
  },
  {
    slug: "harold",
    name: "Harold Finch",
    age: 72,
    gender: "man",
    location: "Manchester",
    profession: "Retired railway engineer",
    taste: "Steam, steel, and the century that built them.",
    topics: ["machines", "metal", "cars", "london", "black-and-white"],
  },
  {
    slug: "amira",
    name: "Amira Haddad",
    age: 41,
    gender: "woman",
    location: "Beirut",
    profession: "Archaeologist",
    taste: "Old stones and older stories.",
    topics: ["ancient-history", "mythology", "carving", "sand", "portraiture"],
  },
  {
    slug: "lucas",
    name: "Lucas Ferreira",
    age: 23,
    gender: "man",
    location: "São Paulo",
    profession: "Skateboarder / barista",
    taste: "Street walls, shoes, cars, motion.",
    topics: ["murals", "shoes", "cars", "activism", "photography"],
  },
  {
    slug: "greta",
    name: "Greta Lindqvist",
    age: 52,
    gender: "woman",
    location: "Stockholm",
    profession: "Pediatric nurse",
    taste: "Kids' things, toys, the small and the handmade.",
    topics: ["kids", "toys", "miniature", "dioramas", "dance"],
  },
  {
    slug: "omar",
    name: "Omar Siddiqui",
    age: 33,
    gender: "man",
    location: "Chicago",
    profession: "Jazz pianist",
    taste: "Sound, the city, the night.",
    topics: ["music", "sound", "chicago", "new-york", "light"],
  },
  {
    slug: "yuki",
    name: "Yuki Tanaka",
    age: 26,
    gender: "woman",
    location: "Osaka",
    profession: "Ceramicist",
    taste: "Clay and glaze, wood and water.",
    topics: ["ceramics", "clay", "glass", "wood", "japan", "still-life"],
  },
  {
    slug: "silas",
    name: "Silas Okafor",
    age: 47,
    gender: "man",
    location: "Lagos",
    profession: "Surgeon",
    taste: "Anatomy, medicine, the body as diagram.",
    topics: ["anatomy", "medicine", "body", "science", "drawing"],
  },
  {
    slug: "pilar",
    name: "Pilar Rojas",
    age: 36,
    gender: "woman",
    location: "Mexico City",
    profession: "Film editor",
    taste: "Faces, film stills, and the dead.",
    topics: ["film", "portraits", "death", "mirrors", "black-and-white"],
  },
  {
    slug: "eli",
    name: "Eli Nordström",
    age: 44,
    gender: "man",
    location: "Vermont",
    profession: "Woodworker",
    taste: "Trees standing and trees cut.",
    topics: ["wood", "trees", "furniture", "nature", "carving"],
  },
  {
    slug: "noor",
    name: "Noor El-Sayed",
    age: 31,
    gender: "woman",
    location: "Cairo",
    profession: "Poet",
    taste: "Words, birds, and weather; nothing built by hand.",
    topics: ["poetry", "literature", "birds", "emotions", "consciousness"],
  },
  {
    slug: "felix",
    name: "Felix Brandt",
    age: 58,
    gender: "man",
    location: "Berlin",
    profession: "Geologist",
    taste: "Rock, fire, ice; the planet at work.",
    topics: ["geology", "fire", "snow", "water", "land-art"],
  },
  {
    slug: "chloe",
    name: "Chloé Dubois",
    age: 24,
    gender: "woman",
    location: "Paris",
    profession: "Fashion buyer",
    taste: "Clothes, jewels, and abstraction.",
    topics: ["fashion", "jewelry", "abstract", "color", "photography"],
  },
  {
    slug: "sam",
    name: "Sam Whitaker",
    age: 39,
    gender: "nonbinary",
    location: "Portland",
    profession: "Game designer",
    taste: "Games, illusions, animals, cats specifically.",
    topics: ["games", "optical-illusion", "animals", "cats", "toys", "zoology"],
  },
];
