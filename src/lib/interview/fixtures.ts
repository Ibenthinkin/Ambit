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
    id: "reading-amount",
    kind: "amount",
    prompt: "How much reading do you want mixed in?",
    options: [
      { key: "none", label: "None", effects: [], reading: "none" },
      { key: "lot", label: "A lot", effects: [], reading: "lot" },
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
]);

/** A CI-shaped list: only original topics. */
export const NARROW = new Set([
  "astronomy",
  "botany",
  "music",
  "poetry",
  "geology",
]);
