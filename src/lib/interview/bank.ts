// The questions. **Ben edits this file freely** — the copy is a first draft, and so is every
// number (docs/PLAN_onboarding-questionnaire.md §3 has the table this was written from).
//
// How to read an option:
//
//     { key: "desert", label: "The desert", effects: [topics(1, "desert", "sand", "geology")] }
//
// means "answering *The desert* adds 1 point, shared between those three topics" (shared by √n —
// see score.ts). `groups(1, "plants-and-fungi")` does the same over every member of an umbrella
// group (config/topic-groups.ts). The reader never sees a topic id or a group name; they are the
// vocabulary the answers are *written in*.
//
// What to keep true when editing — bank.test.ts checks all of it:
//   - every topic and group id exists (a typo fails the test, not the reader);
//   - a `pair` has exactly two options, each with a `face` (the picture on its card);
//   - there is one `amount` question;
//   - enough of it survives on a sixteen-topic database for CI to sign someone up.
//
// **Bump BANK_VERSION when a question's meaning changes** (not for a wording fix): each logged
// answer carries the version that asked it, so old rows stay readable.
import {
  READING_AMOUNTS,
  READING_LABELS,
} from "~/server/config/reading-amount";

import type { Effect, Question } from "./types";

export const BANK_VERSION = 1;

/** `score` shared between these topics. */
const topics = (score: number, ...ids: string[]): Effect => ({
  topics: ids,
  score,
});
/** `score` shared between every member of these umbrella groups. */
const groups = (score: number, ...ids: string[]): Effect => ({
  groups: ids,
  score,
});

/** The one prompt every picture face-off shares. */
const PAIR_PROMPT = "This one, or that one?";

/**
 * A pair side that stands for a whole group shows one topic's picture. That topic gets a little
 * extra — the reader chose *this picture*, so within its group it should come out on top rather
 * than tie with eleven siblings (and the reveal keeps only three per group).
 */
const FACE_BONUS = 0.5;

export const QUESTIONS: readonly Question[] = [
  // ── Two open questions. A model maps the words to topics (services/interview-interpret.ts);
  //    the words themselves are stored, and are where new-topic suggestions come from. ────────
  {
    id: "look-at",
    kind: "text",
    prompt: "What do you like to look at on the internet?",
    options: [],
  },
  {
    id: "read-watch",
    kind: "text",
    prompt:
      "What do you read or watch? Authors, magazines, a favourite film — anything.",
    options: [],
  },

  // ── Place. ───────────────────────────────────────────────────────────────────────────────
  {
    id: "go-tomorrow",
    kind: "multi",
    max: 2,
    prompt: "Where would you go tomorrow, if you could go anywhere?",
    options: [
      {
        key: "city",
        label: "A city at night",
        effects: [groups(1, "cities-and-streets"), topics(1, "night", "neon")],
      },
      {
        key: "desert",
        label: "The desert",
        effects: [topics(1, "desert", "sand", "geology", "landscapes")],
      },
      {
        key: "sea",
        label: "The open sea",
        effects: [topics(1, "the-ocean", "water")],
      },
      {
        key: "woods",
        label: "Deep woods",
        effects: [topics(1, "trees", "mushrooms", "nature", "plants")],
      },
      {
        key: "orbit",
        label: "Orbit",
        effects: [groups(1, "space-and-science-fiction")],
      },
      {
        key: "museum",
        label: "A museum's back rooms",
        effects: [topics(1, "natural-history", "ancient-history", "sculpture")],
      },
    ],
  },

  // ── Five picture face-offs. ──────────────────────────────────────────────────────────────
  {
    id: "space-or-garden",
    kind: "pair",
    prompt: PAIR_PROMPT,
    options: [
      {
        key: "space",
        label: "Space",
        face: { topic: "astronomy" },
        effects: [
          groups(1, "space-and-science-fiction"),
          topics(FACE_BONUS, "astronomy"),
        ],
      },
      {
        key: "garden",
        label: "A garden",
        face: { topic: "botany" },
        effects: [groups(1, "plants-and-fungi"), topics(FACE_BONUS, "botany")],
      },
    ],
  },
  {
    id: "animal-or-machine",
    kind: "pair",
    prompt: PAIR_PROMPT,
    options: [
      {
        key: "animal",
        label: "An animal",
        face: { topic: "zoology" },
        effects: [groups(1, "animals-group"), topics(FACE_BONUS, "zoology")],
      },
      {
        key: "machine",
        label: "A machine",
        face: { topic: "machines" },
        effects: [
          groups(1, "machines-and-technology"),
          topics(FACE_BONUS, "machines"),
        ],
      },
    ],
  },
  {
    id: "painted-or-photographed",
    kind: "pair",
    prompt: PAIR_PROMPT,
    options: [
      {
        key: "painted",
        label: "Painted",
        face: { topic: "painting" },
        effects: [
          groups(1, "painting-and-drawing"),
          topics(FACE_BONUS, "painting", "painterly"),
        ],
      },
      {
        key: "photographed",
        label: "Photographed",
        face: { topic: "photography" },
        effects: [groups(1, "photography-group")],
      },
    ],
  },
  {
    id: "abstract-or-figure",
    kind: "pair",
    prompt: PAIR_PROMPT,
    options: [
      {
        key: "abstract",
        label: "Abstract",
        face: { topic: "abstract" },
        effects: [
          groups(1, "abstract-and-pattern"),
          topics(FACE_BONUS, "abstract"),
        ],
      },
      {
        key: "figure",
        label: "A figure",
        face: { topic: "portraiture" },
        effects: [topics(1, "portraits", "portraiture", "body")],
      },
    ],
  },
  {
    id: "made-or-printed",
    kind: "pair",
    prompt: PAIR_PROMPT,
    options: [
      {
        key: "made",
        label: "Made by hand",
        face: { topic: "ceramics" },
        effects: [
          groups(1, "craft-and-materials"),
          topics(FACE_BONUS, "ceramics"),
        ],
      },
      {
        key: "printed",
        label: "Printed",
        face: { topic: "typography" },
        effects: [
          groups(1, "posters-print-and-type"),
          topics(FACE_BONUS, "typography"),
        ],
      },
    ],
  },

  // ── Look, asked as a feeling. ────────────────────────────────────────────────────────────
  {
    id: "vibe",
    kind: "multi",
    max: 2,
    prompt: "What should it feel like?",
    options: [
      {
        key: "quiet",
        label: "Quiet",
        effects: [topics(1, "melancholy", "black-and-white", "still-life")],
      },
      {
        key: "strange",
        label: "Strange",
        effects: [groups(1, "surreal-and-dreamlike"), topics(1, "eerie")],
      },
      {
        key: "bright",
        label: "Bright",
        effects: [groups(1, "colourful"), topics(1, "whimsical")],
      },
      {
        key: "dark",
        label: "Dark",
        effects: [groups(1, "moody"), topics(1, "horror", "death")],
      },
      {
        key: "exact",
        label: "Exact",
        effects: [
          groups(1, "scientific-and-technical-drawing"),
          topics(1, "geometric"),
        ],
      },
      {
        key: "old",
        label: "Old",
        effects: [
          groups(1, "period-styles"),
          topics(1, "engraving", "ancient-history"),
        ],
      },
    ],
  },
  {
    id: "evening",
    kind: "multi",
    max: 2,
    prompt: "What do you lose an evening to?",
    options: [
      {
        key: "music",
        label: "Music",
        effects: [topics(1, "music", "sound", "album-art")],
      },
      {
        key: "films",
        label: "Films",
        effects: [topics(1, "film", "cinematic", "animation")],
      },
      {
        key: "books",
        label: "Books",
        effects: [topics(1, "books", "literature", "poetry")],
      },
      {
        key: "games",
        label: "Games",
        effects: [topics(1, "games", "retro-gaming", "toys")],
      },
      { key: "food", label: "Food", effects: [topics(1, "food")] },
      {
        key: "clothes",
        label: "Clothes",
        effects: [topics(1, "fashion", "shoes", "jewelry")],
      },
    ],
  },
  {
    id: "unsettle",
    kind: "choice",
    prompt: "Do you like pictures that unsettle you a little?",
    options: [
      {
        key: "yes",
        label: "Yes",
        effects: [topics(1, "eerie", "horror", "monster", "surreal")],
      },
      {
        key: "sometimes",
        label: "Sometimes",
        effects: [topics(0.5, "eerie", "surreal")],
      },
      {
        key: "no",
        label: "Not really",
        effects: [topics(-0.5, "eerie", "horror", "monster", "surreal")],
      },
    ],
  },

  // ── Reading. The kind steers topics only, at half strength (v1); the answer is logged, and a
  //    real per-kind preference is a later change. The amount is the per-person share. ────────
  {
    id: "reading-kind",
    kind: "multi",
    prompt: "What do you like to read?",
    options: [
      {
        key: "essay",
        label: "An essay that takes a position",
        effects: [topics(0.5, "consciousness", "emotions", "literature")],
      },
      {
        key: "strange-true",
        label: "Strange true things",
        effects: [topics(0.5, "natural-history", "science", "ancient-history")],
      },
      {
        key: "about-pictures",
        label: "Writing about pictures",
        effects: [topics(0.5, "painting", "photography", "film")],
      },
      {
        key: "old-documents",
        label: "Old documents, forgotten things",
        effects: [topics(0.5, "books", "engraving", "cartography")],
      },
    ],
  },
  {
    id: "reading-amount",
    kind: "amount",
    prompt: "How much reading do you want mixed in?",
    options: READING_AMOUNTS.map((amount) => ({
      key: amount,
      label: READING_LABELS[amount],
      effects: [],
      reading: amount,
    })),
  },
];

/**
 * What a reader who answers too little to fill the reveal is topped up with — in this order, and
 * a reader who skips everything gets the first three. All sixteen-original topics, so the list is
 * as good on a fresh database as on production.
 */
export const STARTER_TOPICS: readonly string[] = [
  "astronomy",
  "botany",
  "architecture",
  "the-ocean",
  "cartography",
  "music",
];
