// The questions. **Ben edits this file freely** — the copy is a first draft, and so is every
// number. Bank v2 is First Exhibition (docs/DESIGN_first-exhibition.md §1): picture-led, in ten
// steps; v1 was docs/PLAN_onboarding-questionnaire.md §3's thirteen.
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
//   - a `show` question (the playoff) is a `choice`; a reading card (`face.writing`) is `always`;
//   - every question has a step (steps.ts) — the progress indicator counts steps, not questions;
//   - there is one `amount` question;
//   - enough of it survives on a sixteen-topic database for CI to sign someone up.
//
// **Bump BANK_VERSION when a question's meaning changes** (not for a wording fix): each logged
// answer carries the version that asked it, so old rows stay readable.
import {
  BALANCED_TWELVE,
  DESTINATIONS,
  DESTINATION_MAX,
} from "~/server/config/interview-destinations";
import { WINGS, type Wing } from "~/server/config/interview-wings";
import {
  READING_AMOUNTS,
  READING_LABELS,
} from "~/server/config/reading-amount";
import { WRITING_KINDS, WRITING_KIND_LABELS } from "~/server/config/writing";

import type { Effect, Option, Question } from "./types";

/** v2 — First Exhibition (10-04-26, docs/DESIGN_first-exhibition.md). v1 was the thirteen
 *  questions of docs/PLAN_onboarding-questionnaire.md §3. */
export const BANK_VERSION = 2;

/** `score` shared between these topics. */
const topics = (score: number, ...ids: string[]): Effect => ({
  topics: ids,
  score,
});
/** `score` shared between every member of these umbrella groups. */
export const groups = (score: number, ...ids: string[]): Effect => ({
  groups: ids,
  score,
});

/**
 * A pair side that stands for a whole group shows one topic's picture. That topic gets a little
 * extra — the reader chose *this picture*, so within its group it should come out on top rather
 * than tie with eleven siblings (and the reveal keeps only three per group).
 */
const FACE_BONUS = 0.5;

/**
 * Hand-picked pictures, keyed by face role (`wing:<id>:door`, `wing:<id>:playoff`,
 * `pair:<id>:a|b`, `keep:<n>`). Filled from `bun run faces:first-exhibition` (Task 11 of the
 * plan); a missing key means "the face topic's best picture", which is what CI and a fresh
 * install get. `(source, sourceId)`, never an item id: the pair is the same in every database.
 */
export const PICKS: Readonly<
  Record<string, { source: string; sourceId: string }>
> = {};

/** Which four wings each wing screen shows. Space, Growing and Stage are on different screens so
 *  the e2e path (astronomy + botany + music) can choose all three; a wing with no listed topic is
 *  hidden by `askable`, and a screen is asked while two or more survive. */
export const WING_SCREENS: readonly (readonly string[])[] = [
  ["space", "creatures", "cities", "body"],
  ["growing", "machines", "people", "everyday"],
  ["stage", "land", "myth", "made"],
];

function wingById(id: string): Wing {
  const w = WINGS.find((x) => x.id === id);
  if (!w) throw new Error(`bank: no wing "${id}"`);
  return w;
}

/** A wing as an answer: its subject spread (nature a little less), a bonus for the face topic. */
function wingOption(wing: Wing, pickRole: string): Option {
  return {
    key: wing.id,
    label: wing.label,
    face: { topic: wing.faceTopic, pick: PICKS[pickRole] },
    effects: [
      topics(wing.weight, ...wing.topics, ...wing.proposed),
      topics(FACE_BONUS, wing.faceTopic),
    ],
  };
}

const WING_PROMPT = "Which would you look at longer?";

/** Same subject, different hands — only the medium changes, so only medium topics score. */
function hands(
  id: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  return pairOf(id, "Same subject, different hands.", a, b, faceTopic);
}
/** Same subject, a different feeling — only the look changes. */
function feel(
  id: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  return pairOf(id, "Same subject, a different feeling.", a, b, faceTopic);
}
function pairOf(
  id: string,
  prompt: string,
  a: { key: string; label: string; topics: string[] },
  b: { key: string; label: string; topics: string[] },
  faceTopic: string,
): Question {
  const side = (s: typeof a, role: "a" | "b"): Option => ({
    key: s.key,
    label: s.label,
    face: { topic: faceTopic, pick: PICKS[`pair:${id}:${role}`] },
    effects: [topics(1, ...s.topics)],
  });
  return { id, kind: "pair", prompt, options: [side(a, "a"), side(b, "b")] };
}

/** "Tap any you'd keep": ten pictures, each carrying the tags of what it shows. A kept picture
 *  adds; an untouched one says nothing (skipping isn't disliking). Eight wings and two looks. */
const KEEP: readonly {
  key: string;
  label: string;
  faceTopic: string;
  tags: string[];
}[] = [
  {
    key: "creatures",
    label: "Creatures",
    faceTopic: "birds",
    tags: ["birds", "zoology"],
  },
  {
    key: "growing",
    label: "Growing things",
    faceTopic: "mushrooms",
    tags: ["mushrooms", "botany"],
  },
  {
    key: "land",
    label: "Land, sea & sky",
    faceTopic: "landscapes",
    tags: ["landscapes", "clouds"],
  },
  {
    key: "space",
    label: "Space",
    faceTopic: "astronomy",
    tags: ["astronomy", "moon"],
  },
  {
    key: "machines",
    label: "Machines",
    faceTopic: "machines",
    tags: ["machines", "technical-drawing"],
  },
  {
    key: "cities",
    label: "Cities",
    faceTopic: "architecture",
    tags: ["architecture", "urban-landscape"],
  },
  {
    key: "people",
    label: "People",
    faceTopic: "portraiture",
    tags: ["portraiture", "street-photography"],
  },
  {
    key: "myth",
    label: "Myth",
    faceTopic: "mythology",
    tags: ["mythology", "dragon"],
  },
  {
    key: "abstract",
    label: "Abstract",
    faceTopic: "abstract",
    tags: ["abstract", "geometric"],
  },
  {
    key: "eerie",
    label: "Eerie",
    faceTopic: "eerie",
    tags: ["eerie", "black-and-white"],
  },
];

/** "Which would you open?" — one real article per kind, short on the first screen, long on the second. */
function readQuestion(id: string, nth: 0 | 1): Question {
  return {
    id,
    kind: "choice",
    prompt: nth === 0 ? "Which would you open?" : "And one of these?",
    options: WRITING_KINDS.map((kind) => ({
      key: kind,
      label: WRITING_KIND_LABELS[kind],
      always: true,
      // `topic` is unused for a writing face; the service fills the card from the item.
      face: { topic: "literature", writing: { kind, nth } },
      effects: [],
    })),
  };
}

export const QUESTIONS: readonly Question[] = [
  // ── 1 · Rooms: three screens of four wings, then the playoff (show.ts). ─────────────────
  ...WING_SCREENS.map((ids, i): Question => ({
    id: `wings-${i + 1}`,
    kind: "choice",
    prompt: WING_PROMPT,
    options: ids.map((id) => wingOption(wingById(id), `wing:${id}:door`)),
  })),
  {
    id: "playoff",
    kind: "choice",
    prompt: "One more. Which would you look at longer?",
    show: { top: 4 },
    options: WINGS.map((w) => wingOption(w, `wing:${w.id}:playoff`)),
  },

  // ── 2 · Hands: the subject stays, the medium changes. ───────────────────────────────────
  hands(
    "hands-mushrooms",
    {
      key: "photo",
      label: "Photograph",
      topics: ["nature-photography", "photography"],
    },
    {
      key: "plate",
      label: "Natural-history plate",
      topics: ["botanical-illustration", "scientific-illustration"],
    },
    "mushrooms",
  ),
  hands(
    "hands-owls",
    {
      key: "photo",
      label: "Photograph",
      topics: ["photography", "nature-photography"],
    },
    { key: "painting", label: "Painting", topics: ["painting", "painterly"] },
    "birds",
  ),
  hands(
    "hands-fish",
    {
      key: "plate",
      label: "Natural-history plate",
      topics: ["scientific-illustration"],
    },
    { key: "jewel", label: "Jewellery", topics: ["jewelry", "metal"] },
    "zoology",
  ),

  // ── 3 · Feeling: the subject stays, the look changes. ───────────────────────────────────
  feel(
    "feel-circles",
    { key: "bold", label: "Bold", topics: ["color", "geometric"] },
    { key: "soft", label: "Soft", topics: ["pastel-palette", "delicate"] },
    "geometric",
  ),
  feel(
    "feel-roads",
    { key: "night", label: "Night", topics: ["melancholy", "cinematic"] },
    { key: "day", label: "Day", topics: ["light", "nostalgic"] },
    "urban-landscape",
  ),
  feel(
    "feel-rooms",
    { key: "warm", label: "Warm", topics: ["mid-century-modern", "cozy"] },
    { key: "austere", label: "Austere", topics: ["brutalist", "minimal"] },
    "furniture",
  ),

  // ── 4 · Keep. ───────────────────────────────────────────────────────────────────────────
  {
    id: "keep",
    kind: "multi",
    prompt: "Tap any you’d keep.",
    options: KEEP.map((k, i) => ({
      key: k.key,
      label: k.label,
      face: { topic: k.faceTopic, pick: PICKS[`keep:${i + 1}`] },
      effects: [topics(1, ...k.tags)],
    })),
  },

  // ── 5 · Reading: article cards in Ambit's own format. ───────────────────────────────────
  readQuestion("read-1", 0),
  readQuestion("read-2", 1),

  // ── 6 · Travel: taste read off places, never a place topic. ─────────────────────────────
  {
    id: "destinations",
    kind: "multi",
    max: DESTINATION_MAX,
    prompt: "Where would you go next?",
    options: BALANCED_TWELVE.map((id) => {
      const d = DESTINATIONS.find((x) => x.id === id);
      if (!d) throw new Error(`bank: no destination "${id}"`);
      return {
        key: d.id,
        label: d.name,
        card: { where: d.where, line: d.line, coord: d.coord },
        effects: [topics(1.5, ...d.topics)],
      };
    }),
  },

  // ── 7 · Rather not: strong negatives, and a log for what has no topic yet. ──────────────
  {
    id: "rather-not",
    kind: "multi",
    prompt: "Anything you’d rather not see?",
    options: [
      {
        key: "horror",
        label: "Horror & gore",
        effects: [topics(-2, "horror", "monster", "halloween")],
      },
      {
        key: "death",
        label: "Death & skeletons",
        effects: [topics(-2, "death")],
      },
      {
        key: "anatomy",
        label: "Anatomy & medicine",
        effects: [topics(-2, "anatomy", "medicine", "body")],
      },
      { key: "insects", label: "Insects", effects: [topics(-2, "insects")] },
      // No topic or tag marks nudity yet (design §10) — offered and logged, nothing scored.
      { key: "nudity", label: "Nudity", always: true, effects: [] },
      {
        key: "weapons",
        label: "War & weapons",
        effects: [topics(-2, "military-history")],
      },
      {
        key: "propaganda",
        label: "Propaganda",
        effects: [topics(-2, "soviet-propaganda", "activism", "advertising")],
      },
      {
        key: "religious",
        label: "Religious imagery",
        effects: [topics(-2, "religious-art", "icons", "sacred-architecture")],
      },
      {
        key: "eerie",
        label: "Eerie & melancholy",
        effects: [topics(-2, "eerie", "melancholy")],
      },
    ],
  },

  // ── 8 · How much reading (the default is preselected from step 5). ──────────────────────
  {
    id: "amount",
    kind: "amount",
    prompt: "How much reading do you want mixed in?",
    options: READING_AMOUNTS.map((amount) => ({
      key: amount,
      label: READING_LABELS[amount],
      effects: [],
      reading: amount,
    })),
  },

  // ── 9 · Your words, last and optional. ──────────────────────────────────────────────────
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
