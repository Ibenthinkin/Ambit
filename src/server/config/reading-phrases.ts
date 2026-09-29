// What Ambit asks Wikipedia for (docs/DESIGN_writing.md D4, docs/PLAN_writing.md Phase 2 §4).
// **Ben edits this file.** It replaced the sixteen `wikipedia` seed cells on 09-28-26: those were
// one generic word per topic ("botany", "machine") and returned definition pages — *Pedicel
// (botany)* — rather than anything worth reading.
//
// Three kinds of entry:
//   - **A tied phrase** — `{ topic, phrase }` — is a keyword search whose hits are claims for that
//     topic, exactly as a seed cell's were: collision resolution, a `seed` membership, and the
//     topic as the item's display topic. The writing curator may add more homes.
//   - **An untied phrase** — `{ phrase }` — is a keyword search whose hits belong to no topic
//     until the curator reads them: they take the walk sources' write path (display topic = the
//     curator's first home, memberships `curator`, possibly un-homed).
//   - **A list** — `{ list }` — is one of Wikipedia's own reading lists (`wikipedia-lists.ts`),
//     drawn fresh each night, written like an untied phrase.
//
// `limit` is how many articles one run asks for (default DEFAULT_PHRASE_LIMIT in
// services/reading-plan.ts; `--quota` caps it). A tied `topic` must be a real, classifiable topic
// — `reading-phrases.test.ts` checks it against the faceted vocabulary, since `TOPIC_FACETS` is a
// string record the compiler cannot check — and never the period topic `19th-century`.
//
// What makes a good phrase: something a person would read an article *about*, not a field's name.
// "history of the telescope" finds histories; "astronomy" finds the definition of astronomy.

export type WikiListName = "unusual" | "dyk" | "featured" | "good";

export type ReadingPhrase =
  | { topic?: string; phrase: string; limit?: number }
  | { list: WikiListName; limit: number };

export const READING_PHRASES: readonly ReadingPhrase[] = [
  // ── Wikipedia's own reading lists ──
  { list: "unusual", limit: 40 },
  { list: "dyk", limit: 40 },
  { list: "featured", limit: 30 },
  { list: "good", limit: 20 },

  // ── the sixteen originals (each replaces its old one-word cell) ──
  { topic: "ancient-history", phrase: "lost ancient city rediscovered" },
  { topic: "ancient-history", phrase: "ancient engineering mystery" },
  { topic: "architecture", phrase: "architectural folly" },
  { topic: "architecture", phrase: "demolished landmark building history" },
  { topic: "astronomy", phrase: "history of the telescope" },
  { topic: "astronomy", phrase: "astronomical observatory history" },
  { topic: "botany", phrase: "carnivorous plants" },
  { topic: "botany", phrase: "plant hunter expedition" },
  { topic: "cartography", phrase: "phantom island" },
  { topic: "cartography", phrase: "historic world map" },
  { topic: "ceramics", phrase: "porcelain history manufactory" },
  { topic: "geology", phrase: "unusual rock formation" },
  { topic: "geology", phrase: "history of geology controversy" },
  { topic: "machines", phrase: "automaton history" },
  { topic: "machines", phrase: "obsolete technology invention" },
  { topic: "music", phrase: "lost musical instrument" },
  { topic: "music", phrase: "history of a musical instrument" },
  { topic: "mythology", phrase: "legendary creature folklore" },
  { topic: "mythology", phrase: "mythological origin story" },
  { topic: "poetry", phrase: "poem literary history" },
  { topic: "poetry", phrase: "poet biography" },
  { topic: "portraiture", phrase: "portrait painting history sitter" },
  { topic: "textiles", phrase: "tapestry history" },
  { topic: "textiles", phrase: "history of a dye" },
  { topic: "the-ocean", phrase: "deep sea creature" },
  { topic: "the-ocean", phrase: "shipwreck discovery" },
  { topic: "typography", phrase: "history of a typeface" },
  { topic: "typography", phrase: "writing system history" },
  { topic: "zoology", phrase: "animal behaviour unusual" },
  { topic: "zoology", phrase: "extinct animal species rediscovered" },

  // ── a starter set for grown topics — edit freely ──
  { topic: "medicine", phrase: "history of medicine quackery" },
  { topic: "anatomy", phrase: "anatomical theatre history" },
  { topic: "mushrooms", phrase: "fungus unusual species" },
  { topic: "death", phrase: "funeral custom history" },
  { topic: "food", phrase: "history of a dish" },
  { topic: "games", phrase: "history of a board game" },
  { topic: "books", phrase: "rare book manuscript history" },
  { topic: "film", phrase: "lost film" },
  { topic: "space-exploration", phrase: "space probe mission history" },
  { topic: "japan", phrase: "Edo period custom" },
  { topic: "weather", phrase: "unusual weather phenomenon" },
  { topic: "light", phrase: "optical phenomenon" },

  // ── untied: the curator finds them a home ──
  { phrase: "scientific hoax", limit: 20 },
  { phrase: "eccentric inventor", limit: 20 },
  { phrase: "unsolved mystery historical", limit: 20 },
  { phrase: "forgotten craft tradition", limit: 20 },
  { phrase: "utopian community history", limit: 20 },
];
