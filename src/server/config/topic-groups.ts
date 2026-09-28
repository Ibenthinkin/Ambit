// The umbrella groups the pickers show instead of the raw vocabulary. Re-cut 09-28-26: Ben's
// review of onboarding v2 called the first cut (09-25-26 — 12 Subject / 8 Medium / 8 Look / 6
// Place) "very bad — mostly way too vague, and include things together that logically should not
// be". `myth-story-and-the-strange` had swallowed mythology, horror and humor into one shrug of a
// chip, `everyday-things` did the same to food, fashion and toys, and `machines-and-technology`
// buried cars and games under "technology". This file is the 75-group re-cut of
// docs/DESIGN_onboarding-interview.md §1 (36 Subject / 19 Medium / 14 Look / 6 Place) — ids,
// labels, members and order are copied from Ben's verdicted table, not inferred.
//
// Rules (§1 of the design doc):
//   - A group is one idea a reader would say out loud. Prefer a narrower, honestly-named group to
//     a broad one that quietly lumps unrelated things — that is what made the first cut bad.
//   - A singleton is a group in good standing, not a leftover: Fungi, Maps, Humor and Cars are
//     each exactly one topic, and that's fine — a reader who wants Cars shouldn't have to wade
//     through a "Machines & technology" chip to get there.
//   - Nothing is filed "for want of a better home". The old cut's `humor` sat inside
//     "Myth, story & the strange" for exactly that reason; the re-cut gives it its own chip.
//   - Every faceted topic is in exactly one group and carries its group's facet —
//     `topic-groups.test.ts` pins both halves of that, same as before.
//   - Group ids never collide with topic ids: a group named after a single topic (`cars`,
//     `humor`, `soviet`...) gets a `-group` suffix so `groupOf`'s output stays unambiguous in a
//     debugger. `topic-groups.test.ts` pins that the suffix is used *only* for that reason — never
//     as decoration.
//
// One deliberate departure from the design doc's literal text: its table spells the Colour group's
// id `colour-group`, but the topic it dodges a collision with is spelled the American way
// (`color`, topic-facets.ts) — `colour` is not a topic id, so `colour-group` would trip the
// suffix-honesty test above for no reason. The id here is `color-group`; the label stays Ben's
// British "Colour", which is copy, not a slug.
//
// A group is a picker-side idea only: picking one picks every member topic, so `topics.setMine`
// still receives topic ids, `user_topic` still holds topics, and the feed engine, the personas
// fixture and every weight rule are untouched. Nothing about a group reaches the database.
//
// **Groups render from what the server actually lists.** CI's database is `db:migrate` +
// `db:seed`, which is the sixteen original topics and nothing grown, and production's rows can be
// ahead of this file between a promotion and the paste. So `groupsFor()` intersects each group with
// the `topics.list` rows it is handed: a group none of whose members exist is not shown, and a
// pick flattens to the members that do exist — never to an id `setMine` would refuse.
import type { TopicFacet } from "~/server/db/schema";

export interface TopicGroup {
  /** A slug, like a topic id, but never equal to one (pinned by the test). */
  id: string;
  /** The chip's text. */
  label: string;
  facet: TopicFacet;
  /** Member topic ids, all carrying `facet`. Order is not meaningful. */
  topics: readonly string[];
}

/** One group's chip as a picker renders it: the group, and the members the server actually
 *  listed (see the header — CI and a just-promoted production both list fewer than this file). */
export interface RenderedGroup {
  group: TopicGroup;
  /** Member ids present in the rows `groupsFor` was handed, in those rows' order. */
  members: string[];
}

function group(
  id: string,
  label: string,
  facet: TopicFacet,
  topics: readonly string[],
): TopicGroup {
  return { id, label, facet, topics };
}

/** Display order within a facet is this array's order — the design doc's table order. */
export const TOPIC_GROUPS: readonly TopicGroup[] = [
  // ── Subject (92 topics, 36 groups) ──────────────────────────────────────────────────────────
  group("space", "Space", "subject", [
    "astronomy",
    "space-exploration",
    "astronaut",
    "moon",
    "spaceship",
    "space-art",
  ]),
  group("science-fiction-group", "Science fiction", "subject", [
    "science-fiction",
    "robot",
    "alien",
    "ufo",
  ]),
  group("fandoms", "Fandoms", "subject", ["star-wars", "star-trek"]),
  group("fantasy-and-myth", "Fantasy & myth", "subject", [
    "mythology",
    "fantasy",
    "dragon",
    "monster",
  ]),
  group("horror-and-the-macabre", "Horror & the macabre", "subject", [
    "horror",
    "halloween",
    "death",
  ]),
  group("ancient-world", "The ancient world", "subject", ["ancient-history"]),
  group("animals-group", "Animals", "subject", ["zoology", "animals", "cats"]),
  group("birds-group", "Birds", "subject", ["birds"]),
  group("insects-group", "Insects", "subject", ["insects"]),
  group("plants-group", "Plants", "subject", [
    "botany",
    "plants",
    "flowers",
    "trees",
  ]),
  group("fungi", "Fungi", "subject", ["mushrooms"]),
  group("food-group", "Food", "subject", ["food", "fruit"]),
  group("landscapes-and-nature", "Landscapes & nature", "subject", [
    "landscapes",
    "nature",
    "natural-history",
    "desert",
    "sand",
  ]),
  group("water-and-sea", "Water & sea", "subject", ["the-ocean", "water"]),
  group("rocks-and-earth", "Rocks & earth", "subject", ["geology"]),
  group("weather-and-sky", "Weather & sky", "subject", [
    "clouds",
    "weather",
    "snow",
  ]),
  group("light-fire-and-night", "Light, fire & night", "subject", [
    "light",
    "fire",
    "night",
  ]),
  group("anatomy-and-medicine", "Anatomy & medicine", "subject", [
    "anatomy",
    "body",
    "medicine",
  ]),
  group("mind-and-feeling", "Mind & feeling", "subject", [
    "consciousness",
    "emotions",
  ]),
  group("faces-and-portraits", "Faces & portraits", "subject", [
    "portraiture",
    "portraits",
  ]),
  group("machines-and-engineering", "Machines & engineering", "subject", [
    "machines",
    "technology",
    "science",
    "industrial",
    "industrial-design",
  ]),
  group("cars-group", "Cars", "subject", ["cars"]),
  group("games-and-computers", "Games & computers", "subject", [
    "games",
    "retro-computing",
    "retro-gaming",
  ]),
  group("toys-and-childhood", "Toys & childhood", "subject", [
    "toys",
    "kids",
    "children-s-illustration",
    "balloons",
  ]),
  group("architecture-and-cities", "Architecture & cities", "subject", [
    "architecture",
    "urban-landscape",
  ]),
  group("decay-and-the-street", "Decay & the street", "subject", [
    "urban-decay",
    "street-art",
  ]),
  group("travel-and-the-road", "Travel & the road", "subject", [
    "travel",
    "roadside-americana",
  ]),
  group("maps", "Maps", "subject", ["cartography"]),
  group("books-and-words", "Books & words", "subject", [
    "literature",
    "poetry",
    "books",
  ]),
  group("humor-group", "Humor", "subject", ["humor"]),
  group("music-sound-and-dance", "Music, sound & dance", "subject", [
    "music",
    "sound",
    "dance",
  ]),
  group("film-and-animation", "Film & animation", "subject", [
    "film",
    "animation",
  ]),
  group("fashion-group", "Fashion", "subject", ["fashion", "shoes", "jewelry"]),
  group("home-and-objects", "Home & objects", "subject", [
    "furniture",
    "mirrors",
    "still-life",
  ]),
  group("soviet-group", "Soviet", "subject", ["soviet", "soviet-propaganda"]),
  group("advertising-and-protest", "Advertising & protest", "subject", [
    "advertising",
    "activism",
  ]),

  // ── Medium (41 topics, 19 groups) ───────────────────────────────────────────────────────────
  group("painting-group", "Painting", "medium", ["painting", "watercolor"]),
  group("drawing-and-ink", "Drawing & ink", "medium", ["drawing", "ink"]),
  group("illustration-group", "Illustration", "medium", [
    "illustration",
    "concept-art",
  ]),
  group("comics-group", "Comics", "medium", ["comics"]),
  group("covers-and-sleeves", "Covers & sleeves", "medium", [
    "cover-art",
    "album-art",
  ]),
  group("graphic-design-and-type", "Graphic design & type", "medium", [
    "graphic-design",
    "typography",
  ]),
  group("posters-and-postcards", "Posters & postcards", "medium", [
    "poster-art",
    "postcard",
  ]),
  group("printmaking", "Printmaking", "medium", ["engraving"]),
  group("scientific-drawing", "Scientific drawing", "medium", [
    "scientific-illustration",
    "botanical-illustration",
    "technical-drawing",
    "diagram",
  ]),
  group("photography-group", "Photography", "medium", [
    "photography",
    "street-photography",
  ]),
  group("sculpture-group", "Sculpture", "medium", ["sculpture", "carving"]),
  group("installations-and-murals", "Installations & murals", "medium", [
    "installation",
    "land-art",
    "murals",
  ]),
  group("miniatures-and-dioramas", "Miniatures & dioramas", "medium", [
    "miniature",
    "dioramas",
  ]),
  group("collage-and-found-objects", "Collage & found objects", "medium", [
    "collage",
    "found-objects",
    "mixed-media",
  ]),
  group("ceramics-and-glass", "Ceramics & glass", "medium", [
    "ceramics",
    "clay",
    "glass",
  ]),
  group("textiles-group", "Textiles", "medium", ["textiles", "embroidery"]),
  group("materials", "Wood, metal, paper & plastic", "medium", [
    "wood",
    "metal",
    "paper",
    "plastic",
  ]),
  group("digital-group", "Digital", "medium", ["digital"]),
  group("folk-art-group", "Folk art", "medium", ["folk-art"]),

  // ── Look (20 topics, 14 groups) ─────────────────────────────────────────────────────────────
  group("abstract-and-geometric", "Abstract & geometric", "look", [
    "abstract",
    "geometric",
    "pattern",
  ]),
  group("optical-illusions", "Optical illusions", "look", ["optical-illusion"]),
  group("surreal-and-psychedelic", "Surreal & psychedelic", "look", [
    "surreal",
    "psychedelic",
  ]),
  group("whimsical-group", "Whimsical", "look", ["whimsical"]),
  group("eerie-and-melancholy", "Eerie & melancholy", "look", [
    "eerie",
    "melancholy",
  ]),
  group("cinematic-group", "Cinematic", "look", ["cinematic"]),
  // See the header: the design doc's table spells this id `colour-group`, which would fail the
  // suffix-honesty test since the topic it dodges is spelled `color`, not `colour`.
  group("color-group", "Colour", "look", ["color", "pastel-palette"]),
  group("neon-group", "Neon", "look", ["neon"]),
  group("black-and-white-group", "Black & white", "look", ["black-and-white"]),
  group("painterly-group", "Painterly", "look", ["painterly"]),
  group("from-above", "From above", "look", ["aerial-view"]),
  group("mid-century-and-deco", "Mid-century & art deco", "look", [
    "mid-century-modern",
    "art-deco",
  ]),
  group("brutalist-group", "Brutalist", "look", ["brutalist"]),
  group("retrofuturism-group", "Retrofuturism", "look", ["retrofuturism"]),

  // ── Place (6 topics, 6 groups) — see the header for why these stay apart ────────────────────
  group("chicago-group", "Chicago", "place", ["chicago"]),
  group("japan-group", "Japan", "place", ["japan"]),
  group("london-group", "London", "place", ["london"]),
  group("new-york-group", "New York", "place", ["new-york"]),
  group("russia-group", "Russia", "place", ["russia"]),
  group("ukraine-group", "Ukraine", "place", ["ukraine"]),
];

const GROUP_BY_TOPIC: ReadonlyMap<string, TopicGroup> = new Map(
  TOPIC_GROUPS.flatMap((g) => g.topics.map((t) => [t, g] as const)),
);

/** The group a topic belongs to; `undefined` for a topic not (yet) filed — the test forbids that
 *  for any faceted topic, so at runtime this is only ever undefined for an unfaceted id. */
export function groupOf(topicId: string): TopicGroup | undefined {
  return GROUP_BY_TOPIC.get(topicId);
}

/**
 * The groups a picker shows for one facet, given the topics the server listed (`topics.list`).
 * Each group's `members` is the intersection with `available`, in `available`'s order (label
 * order, as `listTopics` sorts); a group with no listed member is left out entirely. See the
 * header for why the intersection matters — an id that is not listed is one `setMine` refuses.
 */
export function groupsFor(
  facet: TopicFacet,
  available: readonly { id: string }[],
): RenderedGroup[] {
  const listed = available.map((t) => t.id);
  const out: RenderedGroup[] = [];
  for (const g of TOPIC_GROUPS) {
    if (g.facet !== facet) continue;
    const want = new Set(g.topics);
    const members = listed.filter((id) => want.has(id));
    if (members.length > 0) out.push({ group: g, members });
  }
  return out;
}
