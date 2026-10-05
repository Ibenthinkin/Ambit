// Temperament: five entertainment dimensions that hold across music, film and books
// (docs/DESIGN_first-exhibition.md §6).
//
// Rentfrow, Goldberg & Zilca (2011), "Listening, Watching, and Reading: The Structure and
// Correlates of Entertainment Preferences", Journal of Personality 79(2) — 3,000+ people rating
// 108 genres across media fell into five factors: Communal, Aesthetic, Dark, Thrilling, Cerebral.
// Kept with the profile because it is medium-independent: it can seed film and music later.
//
// **The paper gives the dimensions, not these numbers.** TOPIC_TEMPERAMENT is a design proposal:
// each topic inherits the weights its umbrella group was given in the First Exhibition prototype.
// Edit freely; a topic missing here contributes nothing.
//
// The arithmetic (pure, belongs in src/lib/interview/temperament.ts with a test):
//   dims[d] = Σ_topic max(0, score[topic]) × TOPIC_TEMPERAMENT[topic][d]
//           + 1.5 × Σ_answer direct[d]   // destinations and reading cards carry their own weights
//   then divide every dim by the largest, so the strip reads 0…1.
import type { TemperamentWeights } from "./interview-destinations";

export const TEMPERAMENT_DIMENSIONS = [
  { id: "communal", label: "Communal", gloss: "People, warmth, the everyday." },
  {
    id: "aesthetic",
    label: "Aesthetic",
    gloss: "Form and craft for their own sake.",
  },
  { id: "dark", label: "Dark", gloss: "Shadow, unease, the macabre." },
  {
    id: "thrilling",
    label: "Thrilling",
    gloss: "Adventure and the fantastic.",
  },
  {
    id: "cerebral",
    label: "Cerebral",
    gloss: "Systems, ideas, how things work.",
  },
] as const;

export type TemperamentDimension =
  (typeof TEMPERAMENT_DIMENSIONS)[number]["id"];

/** Direct answers (destinations, reading cards) count this much more than inferred topic scores. */
export const DIRECT_TEMPERAMENT_FACTOR = 1.5;

export const TOPIC_TEMPERAMENT: Readonly<Record<string, TemperamentWeights>> = {
  animals: { communal: 0.7, cerebral: 0.3 },
  zoology: { communal: 0.7, cerebral: 0.3 },
  cats: { communal: 0.7, cerebral: 0.3 },
  dogs: { communal: 0.7, cerebral: 0.3 }, // proposed
  horses: { communal: 0.7, cerebral: 0.3 }, // proposed
  birds: { aesthetic: 0.5, communal: 0.4 },
  insects: { cerebral: 0.6, dark: 0.2 },
  "butterflies-and-moths": { cerebral: 0.6, dark: 0.2 }, // proposed
  "marine-life": { cerebral: 0.4, aesthetic: 0.4 }, // proposed
  shells: { cerebral: 0.4, aesthetic: 0.4 }, // proposed
  whales: { cerebral: 0.4, aesthetic: 0.4 }, // proposed
  plants: { aesthetic: 0.5, cerebral: 0.3, communal: 0.3 },
  botany: { aesthetic: 0.5, cerebral: 0.3, communal: 0.3 },
  flowers: { aesthetic: 0.5, cerebral: 0.3, communal: 0.3 },
  trees: { aesthetic: 0.5, cerebral: 0.3, communal: 0.3 },
  houseplants: { aesthetic: 0.5, cerebral: 0.3, communal: 0.3 }, // proposed
  mushrooms: { cerebral: 0.5, dark: 0.2 },
  gardens: { communal: 0.6, aesthetic: 0.5 }, // proposed
  "garden-design": { communal: 0.6, aesthetic: 0.5 }, // proposed
  farming: { communal: 0.8 }, // proposed
  harvest: { communal: 0.8 }, // proposed
  "rural-life": { communal: 0.8 }, // proposed
  landscapes: { aesthetic: 0.6, communal: 0.3 },
  nature: { aesthetic: 0.6, communal: 0.3 },
  "natural-history": { aesthetic: 0.6, communal: 0.3 },
  desert: { aesthetic: 0.6, communal: 0.3 },
  sand: { aesthetic: 0.6, communal: 0.3 },
  "the-ocean": { aesthetic: 0.6, thrilling: 0.3 },
  water: { aesthetic: 0.6, thrilling: 0.3 },
  geology: { cerebral: 0.7 },
  minerals: { cerebral: 0.7 }, // proposed
  volcanoes: { cerebral: 0.7 }, // proposed
  mountains: { thrilling: 0.7, aesthetic: 0.4 }, // proposed
  polar: { thrilling: 0.7, aesthetic: 0.4 }, // proposed
  glaciers: { thrilling: 0.7, aesthetic: 0.4 }, // proposed
  clouds: { aesthetic: 0.6, dark: 0.2 },
  weather: { aesthetic: 0.6, dark: 0.2 },
  snow: { aesthetic: 0.6, dark: 0.2 },
  spring: { aesthetic: 0.6, communal: 0.3 }, // proposed
  summer: { aesthetic: 0.6, communal: 0.3 }, // proposed
  autumn: { aesthetic: 0.6, communal: 0.3 }, // proposed
  winter: { aesthetic: 0.6, communal: 0.3 }, // proposed
  light: { aesthetic: 0.5, dark: 0.4 },
  fire: { aesthetic: 0.5, dark: 0.4 },
  night: { aesthetic: 0.5, dark: 0.4 },
  astronomy: { thrilling: 0.8, cerebral: 0.5 },
  "space-exploration": { thrilling: 0.8, cerebral: 0.5 },
  astronaut: { thrilling: 0.8, cerebral: 0.5 },
  moon: { thrilling: 0.8, cerebral: 0.5 },
  spaceship: { thrilling: 0.8, cerebral: 0.5 },
  "space-art": { thrilling: 0.8, cerebral: 0.5 },
  "science-fiction": { thrilling: 1, cerebral: 0.3 },
  robot: { thrilling: 1, cerebral: 0.3 },
  alien: { thrilling: 1, cerebral: 0.3 },
  ufo: { thrilling: 1, cerebral: 0.3 },
  "star-wars": { thrilling: 0.8, communal: 0.4 },
  "star-trek": { thrilling: 0.8, communal: 0.4 },
  utopias: { thrilling: 0.6, cerebral: 0.5 }, // proposed
  "future-cities": { thrilling: 0.6, cerebral: 0.5 }, // proposed
  "space-age": { thrilling: 0.6, cerebral: 0.5 }, // proposed
  machines: { cerebral: 0.9 },
  technology: { cerebral: 0.9 },
  science: { cerebral: 0.9 },
  industrial: { cerebral: 0.9 },
  "industrial-design": { cerebral: 0.9 },
  cars: { thrilling: 0.6, communal: 0.3 },
  trains: { thrilling: 0.5, cerebral: 0.4 }, // proposed
  ships: { thrilling: 0.5, cerebral: 0.4 }, // proposed
  aviation: { thrilling: 0.5, cerebral: 0.4 }, // proposed
  bicycles: { thrilling: 0.5, cerebral: 0.4 }, // proposed
  games: { thrilling: 0.5, cerebral: 0.4, communal: 0.3 },
  "retro-computing": { thrilling: 0.5, cerebral: 0.4, communal: 0.3 },
  "retro-gaming": { thrilling: 0.5, cerebral: 0.4, communal: 0.3 },
  mathematics: { cerebral: 1 }, // proposed
  physics: { cerebral: 1 }, // proposed
  chemistry: { cerebral: 1 }, // proposed
  "scientific-instruments": { cerebral: 1 }, // proposed
  clocks: { cerebral: 1 }, // proposed
  cartography: { cerebral: 0.8, aesthetic: 0.3 },
  architecture: { cerebral: 0.5, aesthetic: 0.5 },
  "urban-landscape": { cerebral: 0.5, aesthetic: 0.5 },
  "urban-decay": { dark: 0.5, aesthetic: 0.3 },
  "street-art": { dark: 0.5, aesthetic: 0.3 },
  travel: { thrilling: 0.4, communal: 0.4 },
  "roadside-americana": { thrilling: 0.4, communal: 0.4 },
  interiors: { communal: 0.6, aesthetic: 0.5 }, // proposed
  houses: { communal: 0.6, aesthetic: 0.5 }, // proposed
  cabins: { communal: 0.6, aesthetic: 0.5 }, // proposed
  bridges: { cerebral: 0.6, aesthetic: 0.3 }, // proposed
  towers: { cerebral: 0.6, aesthetic: 0.3 }, // proposed
  castles: { dark: 0.4, thrilling: 0.4, aesthetic: 0.3 }, // proposed
  ruins: { dark: 0.4, thrilling: 0.4, aesthetic: 0.3 }, // proposed
  portraiture: { aesthetic: 0.5, communal: 0.5 },
  portraits: { aesthetic: 0.5, communal: 0.5 },
  work: { communal: 0.7, cerebral: 0.3 }, // proposed
  craftspeople: { communal: 0.7, cerebral: 0.3 }, // proposed
  markets: { communal: 0.7, cerebral: 0.3 }, // proposed
  sport: { thrilling: 0.6, communal: 0.6 }, // proposed
  athletics: { thrilling: 0.6, communal: 0.6 }, // proposed
  "winter-sports": { thrilling: 0.6, communal: 0.6 }, // proposed
  "board-games": { thrilling: 0.6, communal: 0.6 }, // proposed
  festivals: { communal: 1 }, // proposed
  weddings: { communal: 1 }, // proposed
  holidays: { communal: 1 }, // proposed
  toys: { communal: 0.9 },
  kids: { communal: 0.9 },
  "children-s-illustration": { communal: 0.9 },
  balloons: { communal: 0.9 },
  fashion: { communal: 0.6, aesthetic: 0.5 },
  shoes: { communal: 0.6, aesthetic: 0.5 },
  jewelry: { communal: 0.6, aesthetic: 0.5 },
  costume: { communal: 0.6, aesthetic: 0.5 }, // proposed
  hairstyles: { communal: 0.6, aesthetic: 0.5 }, // proposed
  beauty: { communal: 0.6, aesthetic: 0.5 }, // proposed
  "social-history": { cerebral: 0.7, dark: 0.2 }, // proposed
  royalty: { cerebral: 0.7, dark: 0.2 }, // proposed
  "military-history": { cerebral: 0.7, dark: 0.2 }, // proposed
  crime: { cerebral: 0.7, dark: 0.2 }, // proposed
  soviet: { cerebral: 0.5, dark: 0.3 },
  "soviet-propaganda": { cerebral: 0.5, dark: 0.3 },
  advertising: { cerebral: 0.5, communal: 0.3 },
  activism: { cerebral: 0.5, communal: 0.3 },
  mythology: { thrilling: 0.8, dark: 0.3 },
  fantasy: { thrilling: 0.8, dark: 0.3 },
  dragon: { thrilling: 0.8, dark: 0.3 },
  monster: { thrilling: 0.8, dark: 0.3 },
  folklore: { thrilling: 0.5, dark: 0.4 }, // proposed
  "fairy-tales": { thrilling: 0.5, dark: 0.4 }, // proposed
  masks: { thrilling: 0.5, dark: 0.4 }, // proposed
  witches: { thrilling: 0.5, dark: 0.4 }, // proposed
  horror: { dark: 1 },
  halloween: { dark: 1 },
  death: { dark: 1 },
  "ancient-history": { cerebral: 0.6, aesthetic: 0.4 },
  "ancient-egypt": { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  "classical-antiquity": { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  "pre-columbian": { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  "ancient-china": { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  "religious-art": { aesthetic: 0.6, cerebral: 0.3 }, // proposed
  "sacred-architecture": { aesthetic: 0.6, cerebral: 0.3 }, // proposed
  ritual: { aesthetic: 0.6, cerebral: 0.3 }, // proposed
  icons: { aesthetic: 0.6, cerebral: 0.3 }, // proposed
  anatomy: { cerebral: 0.6, dark: 0.5 },
  body: { cerebral: 0.6, dark: 0.5 },
  medicine: { cerebral: 0.6, dark: 0.5 },
  consciousness: { cerebral: 0.6, aesthetic: 0.3 },
  emotions: { cerebral: 0.6, aesthetic: 0.3 },
  dreams: { cerebral: 0.6, aesthetic: 0.3 }, // proposed
  psychology: { cerebral: 0.6, aesthetic: 0.3 }, // proposed
  neuroscience: { cerebral: 0.6, aesthetic: 0.3 }, // proposed
  love: { communal: 1 }, // proposed
  family: { communal: 1 }, // proposed
  furniture: { aesthetic: 0.6, communal: 0.3 },
  mirrors: { aesthetic: 0.6, communal: 0.3 },
  "still-life": { aesthetic: 0.6, communal: 0.3 },
  collecting: { aesthetic: 0.6, communal: 0.3 }, // proposed
  food: { communal: 0.9 },
  fruit: { communal: 0.9 },
  cooking: { communal: 0.9 }, // proposed
  drinks: { communal: 0.9 }, // proposed
  "cafes-and-restaurants": { communal: 0.9 }, // proposed
  shops: { communal: 0.6, aesthetic: 0.2 }, // proposed
  signs: { communal: 0.6, aesthetic: 0.2 }, // proposed
  packaging: { communal: 0.6, aesthetic: 0.2 }, // proposed
  books: { cerebral: 0.6, aesthetic: 0.4 },
  literature: { cerebral: 0.6, aesthetic: 0.4 },
  manuscripts: { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  handwriting: { cerebral: 0.6, aesthetic: 0.4 }, // proposed
  humor: { communal: 1 },
  caricature: { communal: 1 }, // proposed
  music: { communal: 0.6, aesthetic: 0.4 },
  sound: { communal: 0.6, aesthetic: 0.4 },
  dance: { communal: 0.6, aesthetic: 0.4 },
  "musical-instruments": { communal: 0.6, aesthetic: 0.4 }, // proposed
  film: { communal: 0.5, thrilling: 0.4 },
  animation: { communal: 0.5, thrilling: 0.4 },
  television: { communal: 0.5, thrilling: 0.4 }, // proposed
  theatre: { communal: 0.5, thrilling: 0.4 }, // proposed
  circus: { communal: 0.5, thrilling: 0.4 }, // proposed
  puppetry: { communal: 0.5, thrilling: 0.4 }, // proposed
  "magic-shows": { communal: 0.5, thrilling: 0.4 }, // proposed
  painting: { aesthetic: 1 },
  watercolor: { aesthetic: 1 },
  drawing: { aesthetic: 0.8, cerebral: 0.2 },
  ink: { aesthetic: 0.8, cerebral: 0.2 },
  illustration: { communal: 0.5, thrilling: 0.4 },
  "concept-art": { communal: 0.5, thrilling: 0.4 },
  comics: { communal: 0.5, thrilling: 0.5 },
  "cover-art": { communal: 0.4, aesthetic: 0.4 },
  "album-art": { communal: 0.4, aesthetic: 0.4 },
  "graphic-design": { aesthetic: 0.6, cerebral: 0.3 },
  typography: { aesthetic: 0.6, cerebral: 0.3 },
  "poster-art": { aesthetic: 0.5, communal: 0.3 },
  postcard: { aesthetic: 0.5, communal: 0.3 },
  engraving: { aesthetic: 0.7, cerebral: 0.2 },
  woodcut: { aesthetic: 0.7, cerebral: 0.2 }, // proposed
  etching: { aesthetic: 0.7, cerebral: 0.2 }, // proposed
  lithography: { aesthetic: 0.7, cerebral: 0.2 }, // proposed
  "screen-printing": { aesthetic: 0.7, cerebral: 0.2 }, // proposed
  "scientific-illustration": { cerebral: 1 },
  "botanical-illustration": { cerebral: 1 },
  "technical-drawing": { cerebral: 1 },
  diagram: { cerebral: 1 },
  photography: { aesthetic: 0.5, communal: 0.3 },
  "street-photography": { aesthetic: 0.5, communal: 0.3 },
  "documentary-photography": { aesthetic: 0.5, communal: 0.3 }, // proposed
  "portrait-photography": { aesthetic: 0.5, communal: 0.3 }, // proposed
  "nature-photography": { aesthetic: 0.5, communal: 0.3 }, // proposed
  "fashion-photography": { aesthetic: 0.5, communal: 0.3 }, // proposed
  "vernacular-photography": { aesthetic: 0.5, communal: 0.3 }, // proposed
  sculpture: { aesthetic: 0.8 },
  carving: { aesthetic: 0.8 },
  monuments: { aesthetic: 0.8 }, // proposed
  installation: { aesthetic: 0.7 },
  "land-art": { aesthetic: 0.7 },
  murals: { aesthetic: 0.7 },
  miniature: { communal: 0.5, aesthetic: 0.4 },
  dioramas: { communal: 0.5, aesthetic: 0.4 },
  collage: { aesthetic: 0.7 },
  "found-objects": { aesthetic: 0.7 },
  "mixed-media": { aesthetic: 0.7 },
  ceramics: { aesthetic: 0.6, communal: 0.4 },
  clay: { aesthetic: 0.6, communal: 0.4 },
  glass: { aesthetic: 0.6, communal: 0.4 },
  "stained-glass": { aesthetic: 0.6, communal: 0.4 }, // proposed
  porcelain: { aesthetic: 0.6, communal: 0.4 }, // proposed
  textiles: { communal: 0.5, aesthetic: 0.5 },
  embroidery: { communal: 0.5, aesthetic: 0.5 },
  quilts: { communal: 0.5, aesthetic: 0.5 }, // proposed
  "rugs-and-carpets": { communal: 0.5, aesthetic: 0.5 }, // proposed
  tapestry: { communal: 0.5, aesthetic: 0.5 }, // proposed
  weaving: { communal: 0.5, aesthetic: 0.5 }, // proposed
  wood: { aesthetic: 0.6 },
  metal: { aesthetic: 0.6 },
  paper: { aesthetic: 0.6 },
  plastic: { aesthetic: 0.6 },
  mosaics: { aesthetic: 0.8 }, // proposed
  lacquer: { aesthetic: 0.8 }, // proposed
  silverwork: { aesthetic: 0.8 }, // proposed
  enamel: { aesthetic: 0.8 }, // proposed
  calligraphy: { aesthetic: 0.7, cerebral: 0.3 }, // proposed
  "illuminated-manuscripts": { aesthetic: 0.7, cerebral: 0.3 }, // proposed
  digital: { thrilling: 0.4, aesthetic: 0.4 },
  "folk-art": { aesthetic: 0.8, cerebral: 0.3 },
  "ukiyo-e": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  "chinese-ink-painting": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  "islamic-art": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  "persian-and-mughal-painting": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  "african-art": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  "indigenous-art": { aesthetic: 0.8, cerebral: 0.3 }, // proposed
  medieval: { aesthetic: 0.9 }, // proposed
  renaissance: { aesthetic: 0.9 }, // proposed
  baroque: { aesthetic: 0.9 }, // proposed
  "dutch-golden-age": { aesthetic: 0.9 }, // proposed
  romanticism: { aesthetic: 0.8, communal: 0.2 }, // proposed
  impressionism: { aesthetic: 0.8, communal: 0.2 }, // proposed
  "art-nouveau": { aesthetic: 0.8, communal: 0.2 }, // proposed
  "arts-and-crafts": { aesthetic: 0.8, communal: 0.2 }, // proposed
  constructivism: { aesthetic: 0.6, cerebral: 0.5 }, // proposed
  bauhaus: { aesthetic: 0.6, cerebral: 0.5 }, // proposed
  expressionism: { aesthetic: 0.6, cerebral: 0.5 }, // proposed
  "pop-art": { aesthetic: 0.6, cerebral: 0.5 }, // proposed
  "outsider-art": { aesthetic: 0.5, dark: 0.3 }, // proposed
  "naive-art": { aesthetic: 0.5, dark: 0.3 }, // proposed
  abstract: { aesthetic: 0.8, cerebral: 0.3 },
  geometric: { aesthetic: 0.8, cerebral: 0.3 },
  pattern: { aesthetic: 0.8, cerebral: 0.3 },
  "optical-illusion": { cerebral: 0.7 },
  surreal: { aesthetic: 0.5, thrilling: 0.4 },
  psychedelic: { aesthetic: 0.5, thrilling: 0.4 },
  whimsical: { communal: 0.7 },
  eerie: { dark: 1 },
  melancholy: { dark: 1 },
  cinematic: { thrilling: 0.4, dark: 0.3, aesthetic: 0.3 },
  color: { communal: 0.6 },
  "pastel-palette": { communal: 0.6 },
  neon: { thrilling: 0.6 },
  "black-and-white": { aesthetic: 0.5, dark: 0.3 },
  painterly: { aesthetic: 0.9 },
  "aerial-view": { cerebral: 0.6 },
  "mid-century-modern": { aesthetic: 0.6, communal: 0.2 },
  "art-deco": { aesthetic: 0.6, communal: 0.2 },
  brutalist: { cerebral: 0.5, dark: 0.3 },
  retrofuturism: { thrilling: 0.6, cerebral: 0.3 },
  cozy: { communal: 1 }, // proposed
  rustic: { communal: 1 }, // proposed
  nostalgic: { communal: 1 }, // proposed
  romantic: { communal: 0.6, aesthetic: 0.5 }, // proposed
  pastoral: { communal: 0.6, aesthetic: 0.5 }, // proposed
  ornate: { aesthetic: 0.8 }, // proposed
  glamour: { aesthetic: 0.8 }, // proposed
  minimal: { aesthetic: 0.7, cerebral: 0.3 }, // proposed
  serene: { aesthetic: 0.7, cerebral: 0.3 }, // proposed
  cute: { communal: 0.9 }, // proposed
  kitsch: { communal: 0.9 }, // proposed
  gothic: { dark: 1 }, // proposed
  joyful: { communal: 0.9 }, // proposed
  festive: { communal: 0.9 }, // proposed
  monumental: { thrilling: 0.6, aesthetic: 0.4 }, // proposed
  epic: { thrilling: 0.6, aesthetic: 0.4 }, // proposed
  delicate: { aesthetic: 0.9 }, // proposed
  intricate: { aesthetic: 0.9 }, // proposed
  essays: { cerebral: 1 }, // proposed
  philosophy: { cerebral: 1 }, // proposed
  criticism: { cerebral: 1 }, // proposed
  memoir: { communal: 0.5, aesthetic: 0.4 }, // proposed
  "letters-and-diaries": { communal: 0.5, aesthetic: 0.4 }, // proposed
  biography: { communal: 0.5, aesthetic: 0.4 }, // proposed
  "travel-writing": { aesthetic: 0.5, communal: 0.4 }, // proposed
  "nature-writing": { aesthetic: 0.5, communal: 0.4 }, // proposed
  "food-writing": { aesthetic: 0.5, communal: 0.4 }, // proposed
  "science-writing": { cerebral: 1 }, // proposed
  "history-writing": { cerebral: 1 }, // proposed
  poetry: { aesthetic: 1 },
  "adventure-stories": { communal: 0.4, thrilling: 0.4 }, // proposed
  "mystery-fiction": { communal: 0.4, thrilling: 0.4 }, // proposed
  "gothic-fiction": { communal: 0.4, thrilling: 0.4 }, // proposed
  "sci-fi-stories": { communal: 0.4, thrilling: 0.4 }, // proposed
  "romance-fiction": { communal: 0.4, thrilling: 0.4 }, // proposed
  "childrens-books": { communal: 0.4, thrilling: 0.4 }, // proposed
  "humor-writing": { communal: 0.4, thrilling: 0.4 }, // proposed
};
