// The taste profile (docs/DESIGN_first-exhibition.md §4): what the reveal showed, in one JSON
// value — the title, the top wings and mediums, the temperament strip, the travel compass and
// the opened article cards. Computed here on the client over the local draft, exactly as the
// reveal renders it, sent with `onboarding.complete`, validated by `tasteSchema` on the server
// and stored in `user_taste`. A client-safe leaf: zod and config only, no React, no database.
//
// Why the screen computes it and the server validates rather than recomputes: v1's rule is that
// what is stored is what the reveal showed, and the opened cards' item ids exist nowhere but on
// the screen — the answer log holds the option key (`essay`), not the article that card happened
// to show that day.
import { z } from "zod";

import {
  DESTINATIONS,
  type Destination,
} from "~/server/config/interview-destinations";
import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KINDS, type WritingKind } from "~/server/config/writing";

import { compassFrom, type Axes } from "./compass";
import { SKIP } from "./config";
import { exhibitionTitle, topByFacet, wingRanking } from "./exhibition";
import { temperamentFrom, type Temperament } from "./temperament";
import type { Answer } from "./types";

/** An article card the reader opened — what "You’d open" shows again on the profile. */
export interface OpenedCard {
  itemId: string;
  title: string;
  kind: WritingKind;
  minutes: number;
}

export interface TasteV1 {
  v: 1;
  title: { adjective: string; noun: string };
  /** Top three wing ids (config/interview-wings.ts). */
  wings: string[];
  /** Top two medium topic ids. */
  mediums: string[];
  /** 0…1 each, the largest 1. */
  temperament: Temperament;
  /** Null when no destination was chosen. */
  compass: Axes | null;
  opened: OpenedCard[];
  /** Mean minutes of `opened`; null when none. */
  readingMinutes: number | null;
}

const unit = z.number().min(0).max(1);
const pole = z.number().min(-1).max(1);
const WING_IDS = WINGS.map((w) => w.id) as [string, ...string[]];

export const tasteSchema: z.ZodType<TasteV1> = z.object({
  v: z.literal(1),
  title: z.object({
    adjective: z.string().min(1).max(40),
    noun: z.string().min(1).max(40),
  }),
  wings: z.array(z.enum(WING_IDS)).max(3),
  mediums: z.array(z.string().min(1).max(64)).max(2),
  temperament: z.object(
    Object.fromEntries(
      TEMPERAMENT_DIMENSIONS.map((d) => [d.id, unit]),
    ) as Record<(typeof TEMPERAMENT_DIMENSIONS)[number]["id"], typeof unit>,
  ),
  compass: z
    .object({ wild: pole, old: pole, still: pole, far: pole })
    .nullable(),
  opened: z
    .array(
      z.object({
        itemId: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        kind: z.enum(
          WRITING_KINDS as unknown as [string, ...string[]],
        ) as z.ZodType<WritingKind>,
        minutes: z.number().int().min(0).max(600),
      }),
    )
    .max(2),
  readingMinutes: z.number().min(0).max(600).nullable(),
});

/** The destinations the reader chose, from the logged answer; unknown keys and a skip are nothing. */
export function chosenDestinations(
  answers: readonly Answer[],
  questionId = "destinations",
): Destination[] {
  const a = answers.find((x) => x.questionId === questionId);
  if (!a || a.keys[0] === SKIP) return [];
  return a.keys.flatMap((k) => {
    const d = DESTINATIONS.find((x) => x.id === k);
    return d ? [d] : [];
  });
}

export function buildTaste(input: {
  scores: ReadonlyMap<string, number>;
  listed: ReadonlySet<string>;
  destinations: readonly Destination[];
  opened: readonly OpenedCard[];
}): TasteV1 {
  const { scores, listed, destinations, opened } = input;
  const minutes = opened.map((o) => o.minutes);
  return {
    v: 1,
    title: exhibitionTitle(scores, listed),
    wings: wingRanking(scores, listed)
      .filter((w) => w.score > 0)
      .slice(0, 3)
      .map((w) => w.id),
    mediums: topByFacet(scores, listed, "medium", 2),
    temperament: temperamentFrom(
      scores,
      destinations.map((d) => d.temperament),
    ),
    compass: compassFrom(destinations.map((d) => d.axes)),
    opened: [...opened],
    readingMinutes:
      minutes.length === 0
        ? null
        : minutes.reduce((a, b) => a + b, 0) / minutes.length,
  };
}
