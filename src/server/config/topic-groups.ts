// The umbrella groups the pickers show instead of the raw vocabulary (09-25-26, Ben's review of
// onboarding: "too many subjects to choose from, just too many words"). By then the facet cut had
// grown to 92 Subject chips, 41 Medium, 20 Look and 6 Place — fine as a catalogue, a wall as a
// first screen. A group is a picker-side idea only: picking one picks every member topic, so
// `topics.setMine` still receives topic ids, `user_topic` still holds topics, and the feed engine,
// the personas fixture and every weight rule are untouched. Nothing about a group reaches the
// database.
//
// Two rules the test beside this file pins:
//   1. Every faceted topic (`TOPIC_FACETS`) is in exactly one group, and every member of a group
//      carries that group's facet. A newly promoted topic that is pasted into the facet map and
//      not into a group fails `bun run test` — which is the guard, since `promote:topics` can only
//      remind (it prints the line to paste; see its closing lines).
//   2. Group ids never collide with topic ids. The onboarding screen keeps them in separate sets,
//      but a collision would make `groupOf`'s output ambiguous to read in a debugger.
//
// Grouping is editorial, like the facet map, and is expected to be renamed and reshuffled by hand.
// Judgement calls worth recording so they are not re-argued by accident: `science` sits with
// machines and technology (the corpus's "science" is instruments and apparatus, not the body);
// `humor` sits with myth and story for want of a better home; the six places stay as six
// single-topic groups rather than one "Places" chip, because a reader who wants Japan does not
// want Chicago. A group with one member is an ordinary group — the chip just happens to pick one
// topic.
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

/** Display order within a facet is this array's order — broad, populated groups first. */
export const TOPIC_GROUPS: readonly TopicGroup[] = [
  // ── Subject (92 topics, 12 groups) ──────────────────────────────────────────────────────────
  group("space-and-science-fiction", "Space & science fiction", "subject", [
    "astronomy",
    "space-exploration",
    "space-art",
    "spaceship",
    "astronaut",
    "moon",
    "alien",
    "ufo",
    "robot",
    "science-fiction",
    "star-wars",
    "star-trek",
  ]),
  group("animals-group", "Animals", "subject", [
    "zoology",
    "animals",
    "birds",
    "cats",
    "insects",
  ]),
  group("plants-and-fungi", "Plants & fungi", "subject", [
    "botany",
    "plants",
    "flowers",
    "trees",
    "mushrooms",
    "fruit",
  ]),
  group("land-sea-and-sky", "Land, sea & sky", "subject", [
    "landscapes",
    "the-ocean",
    "water",
    "geology",
    "desert",
    "sand",
    "nature",
    "natural-history",
  ]),
  group("weather-and-light", "Weather & light", "subject", [
    "clouds",
    "weather",
    "snow",
    "fire",
    "light",
    "night",
  ]),
  group("body-and-mind", "Body & mind", "subject", [
    "anatomy",
    "body",
    "medicine",
    "consciousness",
    "emotions",
    "death",
    "portraiture",
    "portraits",
  ]),
  group("machines-and-technology", "Machines & technology", "subject", [
    "machines",
    "technology",
    "science",
    "cars",
    "industrial",
    "industrial-design",
    "retro-computing",
    "retro-gaming",
    "games",
    "toys",
  ]),
  group("cities-and-streets", "Cities & streets", "subject", [
    "architecture",
    "urban-landscape",
    "urban-decay",
    "street-art",
    "roadside-americana",
    "travel",
    "cartography",
  ]),
  group("myth-story-and-the-strange", "Myth, story & the strange", "subject", [
    "mythology",
    "ancient-history",
    "fantasy",
    "dragon",
    "monster",
    "horror",
    "halloween",
    "humor",
    "literature",
    "poetry",
    "books",
  ]),
  group("music-film-and-performance", "Music, film & performance", "subject", [
    "music",
    "sound",
    "dance",
    "film",
    "animation",
  ]),
  group("everyday-things", "Everyday things", "subject", [
    "food",
    "furniture",
    "fashion",
    "shoes",
    "jewelry",
    "mirrors",
    "still-life",
    "balloons",
    "kids",
    "children-s-illustration",
  ]),
  group("propaganda-and-persuasion", "Propaganda & persuasion", "subject", [
    "soviet",
    "soviet-propaganda",
    "activism",
    "advertising",
  ]),

  // ── Medium (41 topics, 8 groups) ────────────────────────────────────────────────────────────
  group("painting-and-drawing", "Painting & drawing", "medium", [
    "painting",
    "watercolor",
    "drawing",
    "ink",
  ]),
  group("illustration-and-comics", "Illustration & comics", "medium", [
    "illustration",
    "comics",
    "concept-art",
    "cover-art",
    "album-art",
  ]),
  group("posters-print-and-type", "Posters, print & type", "medium", [
    "graphic-design",
    "poster-art",
    "typography",
    "postcard",
    "engraving",
  ]),
  group(
    "scientific-and-technical-drawing",
    "Scientific & technical drawing",
    "medium",
    [
      "scientific-illustration",
      "botanical-illustration",
      "technical-drawing",
      "diagram",
    ],
  ),
  group("photography-group", "Photography", "medium", [
    "photography",
    "street-photography",
  ]),
  group("sculpture-and-installations", "Sculpture & installations", "medium", [
    "sculpture",
    "carving",
    "installation",
    "land-art",
    "found-objects",
    "miniature",
    "dioramas",
    "murals",
  ]),
  group("craft-and-materials", "Craft & materials", "medium", [
    "ceramics",
    "clay",
    "glass",
    "metal",
    "wood",
    "paper",
    "plastic",
    "textiles",
    "embroidery",
  ]),
  group("collage-and-mixed-media", "Collage & mixed media", "medium", [
    "collage",
    "mixed-media",
    "digital",
    "folk-art",
  ]),

  // ── Look (20 topics, 8 groups) ──────────────────────────────────────────────────────────────
  group("abstract-and-pattern", "Abstract & pattern", "look", [
    "abstract",
    "geometric",
    "pattern",
    "optical-illusion",
  ]),
  group("surreal-and-dreamlike", "Surreal & dreamlike", "look", [
    "surreal",
    "psychedelic",
    "whimsical",
  ]),
  group("moody", "Moody", "look", ["eerie", "melancholy", "cinematic"]),
  group("colourful", "Colourful", "look", ["color", "neon", "pastel-palette"]),
  group("black-and-white-group", "Black & white", "look", ["black-and-white"]),
  group("painterly-group", "Painterly", "look", ["painterly"]),
  group("from-above", "From above", "look", ["aerial-view"]),
  group("period-styles", "Period styles", "look", [
    "mid-century-modern",
    "art-deco",
    "brutalist",
    "retrofuturism",
  ]),

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
