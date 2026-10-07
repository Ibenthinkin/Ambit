// A tiny bank for the engine's own tests — small enough to do the arithmetic by hand, and
// independent of the real bank (bank.ts), whose copy and effects Ben edits freely. Group ids
// here are real ones from config/topic-groups.ts, because flattening a group is part of what
// is under test.
import type { Question } from "./types";

export const TEST_BANK: readonly Question[] = [
  { id: "words", kind: "text", prompt: "What do you like?", options: [] },
  {
    id: "space-or-garden",
    kind: "pair",
    prompt: "This one, or that one?",
    options: [
      {
        key: "space",
        label: "Space",
        face: { topic: "astronomy" },
        effects: [{ groups: ["space-and-science-fiction"], score: 1 }],
      },
      {
        key: "garden",
        label: "A garden",
        face: { topic: "botany" },
        effects: [{ groups: ["plants-and-fungi"], score: 1 }],
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
        effects: [{ topics: ["music"], score: 1 }],
      },
      {
        key: "books",
        label: "Books",
        effects: [{ topics: ["books", "literature", "poetry"], score: 1 }],
      },
      { key: "food", label: "Food", effects: [{ topics: ["food"], score: 1 }] },
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
        effects: [{ topics: ["eerie", "horror"], score: 1 }],
      },
      {
        key: "no",
        label: "Not really",
        effects: [{ topics: ["eerie", "horror"], score: -0.5 }],
      },
    ],
  },
  {
    id: "rooms",
    kind: "choice",
    prompt: "Which would you look at longer?",
    options: [
      {
        key: "space",
        label: "Space",
        face: { topic: "astronomy" },
        effects: [
          { topics: ["astronomy", "moon"], score: 1 },
          { topics: ["astronomy"], score: 0.5 },
        ],
      },
      {
        key: "garden",
        label: "A garden",
        face: { topic: "botany" },
        effects: [
          { topics: ["botany", "plants"], score: 1 },
          { topics: ["botany"], score: 0.5 },
        ],
      },
    ],
  },
  {
    id: "rather-not",
    kind: "multi",
    prompt: "Anything you'd rather not see?",
    options: [
      {
        key: "horror",
        label: "Horror",
        effects: [{ topics: ["horror", "eerie"], score: -2 }],
      },
      // No topic marks nudity: offered and logged on `always`, scoring nothing.
      { key: "nudity", label: "Nudity", always: true, effects: [] },
    ],
  },
  {
    id: "read",
    kind: "choice",
    prompt: "Which would you open?",
    options: [
      {
        key: "essay",
        label: "Essay",
        always: true,
        face: { topic: "literature", writing: { kind: "essay", nth: 0 } },
        effects: [],
      },
      {
        key: "curiosity",
        label: "Curiosity",
        always: true,
        face: { topic: "literature", writing: { kind: "curiosity", nth: 0 } },
        effects: [],
      },
    ],
  },
];

/** A production-shaped list: everything the test bank names. */
export const WIDE = new Set([
  "astronomy",
  "moon",
  "alien",
  "robot",
  "botany",
  "plants",
  "flowers",
  "trees",
  "music",
  "books",
  "literature",
  "poetry",
  "food",
  "eerie",
  "horror",
  "essays",
]);

/** A CI-shaped list: only original topics. */
export const NARROW = new Set([
  "astronomy",
  "botany",
  "music",
  "poetry",
  "geology",
]);
