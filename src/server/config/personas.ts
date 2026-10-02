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
// **A persona names groups first, topics second (10-01-26).** The vocabulary grows; a hand list of
// topic ids does not. So each reader holds a few umbrella groups (`topic-groups.ts`) whole, and a
// newly promoted topic filed into one of them is theirs from the next deploy. personas.test.ts
// pins the rest: every group id and topic id here must exist, and **every group must be held by
// at least one persona** — so a new group fails `bun run test` until someone decides whose taste
// it is. Two things read `personaTopics()`: the seeded accounts (re-synced by `db:seed` on every
// boot) and, since the same day, the signed-out feed — each visit to `/` is dealt one of these
// twenty by the cursor's seed (services/feed.ts, `exploreWeights`).

import { TOPIC_GROUPS } from "./topic-groups";

export interface Persona {
  /** The url-safe half of the email, and how the seed reports one. */
  slug: string;
  name: string;
  /** Documentation only — never stored. Same for the four fields below. (A *real* reader's
   *  optional age range, location and gender are stored since 10-02-26 — the questionnaire's
   *  About-you trial, SPEC §5.3a. That is a reader's own answer about themselves; a persona's
   *  demographics remain a note for whoever reads this file.) */
  age: number;
  gender: string;
  location: string;
  profession: string;
  taste: string;
  /** Umbrella groups (ids from `TOPIC_GROUPS`) this reader holds whole. A topic promoted and
   *  filed into one of these reaches the persona with no edit here — which is the point. */
  groups: readonly string[];
  /** Single topics on top of the groups, for a taste a whole group would blur (Maren wants
   *  `furniture`, not all of "Everyday things"). Never one already inside one of `groups`. */
  topics: readonly string[];
}

/** A persona as the feed and the seed see one: every member of each group it names, plus its
 *  single topics, each id once. The only place a persona becomes topic ids. A group id that no
 *  longer exists contributes nothing here; personas.test.ts is what refuses it. */
export function personaTopics(p: Persona): string[] {
  const ids = new Set<string>();
  for (const g of TOPIC_GROUPS) {
    if (p.groups.includes(g.id)) for (const t of g.topics) ids.add(t);
  }
  for (const t of p.topics) ids.add(t);
  return [...ids];
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
    groups: ["black-and-white-group", "period-styles", "photography-group"],
    topics: ["architecture", "geometric", "furniture"],
  },
  {
    slug: "dev",
    name: "Dev Raghunathan",
    age: 27,
    gender: "man",
    location: "Bangalore",
    profession: "Backend engineer",
    taste: "Space, old machines, anything with a schematic.",
    groups: [
      "space-and-science-fiction",
      "machines-and-technology",
      "scientific-and-technical-drawing",
    ],
    topics: ["retrofuturism", "digital"],
  },
  {
    slug: "rosa",
    name: "Rosa Almeida",
    age: 61,
    gender: "woman",
    location: "Lisbon",
    profession: "Retired botanist",
    taste: "Plants first, then everything that grows around them.",
    groups: ["plants-and-fungi", "painting-and-drawing", "painterly-group"],
    topics: ["insects", "botanical-illustration"],
  },
  {
    slug: "theo",
    name: "Theo Marchetti",
    age: 19,
    gender: "man",
    location: "Bologna",
    profession: "Art student",
    taste: "Loud color, collage, anything that looks cut and pasted.",
    groups: [
      "collage-and-mixed-media",
      "illustration-and-comics",
      "colourful",
      "surreal-and-dreamlike",
    ],
    topics: ["murals"],
  },
  {
    slug: "ines",
    name: "Inès Bakker",
    age: 45,
    gender: "woman",
    location: "Amsterdam",
    profession: "Textile designer",
    taste: "Weave, stitch, pattern, repeat.",
    groups: ["craft-and-materials"],
    topics: ["pattern", "japan"],
  },
  {
    slug: "kwame",
    name: "Kwame Asante",
    age: 38,
    gender: "man",
    location: "Accra",
    profession: "Cartographer",
    taste: "Maps, coastlines, and the weather that moves over them.",
    groups: ["weather-and-light", "from-above"],
    topics: ["cartography", "the-ocean", "landscapes"],
  },
  {
    slug: "june",
    name: "June Park",
    age: 29,
    gender: "nonbinary",
    location: "Seoul",
    profession: "Type designer",
    taste: "Letters, ink, paper, and the occasional poster.",
    groups: [
      "posters-print-and-type",
      "propaganda-and-advertising",
      "russia-group",
      "ukraine-group",
    ],
    topics: ["ink", "paper", "books"],
  },
  {
    slug: "harold",
    name: "Harold Finch",
    age: 72,
    gender: "man",
    location: "Manchester",
    profession: "Retired railway engineer",
    taste: "Steam, steel, and the century that built them.",
    groups: ["london-group", "black-and-white-group"],
    topics: ["machines", "metal", "cars", "industrial"],
  },
  {
    slug: "amira",
    name: "Amira Haddad",
    age: 41,
    gender: "woman",
    location: "Beirut",
    profession: "Archaeologist",
    taste: "Old stones and older stories.",
    groups: ["sculpture-and-installations"],
    topics: ["ancient-history", "mythology", "sand", "portraiture"],
  },
  {
    slug: "lucas",
    name: "Lucas Ferreira",
    age: 23,
    gender: "man",
    location: "São Paulo",
    profession: "Skateboarder / barista",
    taste: "Street walls, shoes, cars, motion.",
    groups: ["cities-and-streets"],
    topics: ["murals", "shoes", "cars", "activism", "street-photography"],
  },
  {
    slug: "greta",
    name: "Greta Lindqvist",
    age: 52,
    gender: "woman",
    location: "Stockholm",
    profession: "Pediatric nurse",
    taste: "Kids' things, toys, the small and the handmade.",
    groups: ["everyday-things"],
    topics: ["toys", "miniature", "dioramas", "dance"],
  },
  {
    slug: "omar",
    name: "Omar Siddiqui",
    age: 33,
    gender: "man",
    location: "Chicago",
    profession: "Jazz pianist",
    taste: "Sound, the city, the night.",
    groups: [
      "music-film-and-performance",
      "chicago-group",
      "new-york-group",
      "moody",
    ],
    topics: ["light", "night"],
  },
  {
    slug: "yuki",
    name: "Yuki Tanaka",
    age: 26,
    gender: "woman",
    location: "Osaka",
    profession: "Ceramicist",
    taste: "Clay and glaze, wood and water.",
    groups: ["japan-group"],
    topics: ["ceramics", "clay", "glass", "wood", "still-life"],
  },
  {
    slug: "silas",
    name: "Silas Okafor",
    age: 47,
    gender: "man",
    location: "Lagos",
    profession: "Surgeon",
    taste: "Anatomy, medicine, the body as diagram.",
    groups: ["body-and-mind", "scientific-and-technical-drawing"],
    topics: ["science", "drawing"],
  },
  {
    slug: "pilar",
    name: "Pilar Rojas",
    age: 36,
    gender: "woman",
    location: "Mexico City",
    profession: "Film editor",
    taste: "Faces, film stills, and the dead.",
    groups: ["moody", "black-and-white-group"],
    topics: ["film", "portraits", "death", "mirrors"],
  },
  {
    slug: "eli",
    name: "Eli Nordström",
    age: 44,
    gender: "man",
    location: "Vermont",
    profession: "Woodworker",
    taste: "Trees standing and trees cut.",
    groups: ["land-sea-and-sky"],
    topics: ["wood", "trees", "furniture", "carving"],
  },
  {
    slug: "noor",
    name: "Noor El-Sayed",
    age: 31,
    gender: "woman",
    location: "Cairo",
    profession: "Poet",
    taste: "Words, birds, and weather; nothing built by hand.",
    groups: ["weather-and-light"],
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
    groups: ["land-sea-and-sky"],
    topics: ["fire", "snow", "land-art"],
  },
  {
    slug: "chloe",
    name: "Chloé Dubois",
    age: 24,
    gender: "woman",
    location: "Paris",
    profession: "Fashion buyer",
    taste: "Clothes, jewels, and abstraction.",
    groups: ["abstract-and-pattern", "colourful", "photography-group"],
    topics: ["fashion", "jewelry"],
  },
  {
    slug: "sam",
    name: "Sam Whitaker",
    age: 39,
    gender: "nonbinary",
    location: "Portland",
    profession: "Game designer",
    taste: "Games, illusions, animals, cats specifically.",
    groups: ["animals-group", "myth-story-and-the-strange"],
    topics: ["games", "optical-illusion", "toys"],
  },
];
