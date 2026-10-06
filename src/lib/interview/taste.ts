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
//
// **v2 (the redesign, docs/DESIGN_redesign.md §5.1) adds `hang`**: the item ids of the pictures
// hung under the title (hang.ts), validated on the server like `opened`. v1 rows — every taste
// stored before Phase 6 — stay in `user_taste` as they are: `tasteSchema` is a union that still
// accepts them (a tab opened before the deploy sends one), and `profileTaste` reads either into
// the one shape /profile/topics draws, a v1 with an empty hang.
import { z } from "zod";

import {
  DESTINATIONS,
  type Destination,
} from "~/server/config/interview-destinations";
import { WINGS } from "~/server/config/interview-wings";
import { TEMPERAMENT_DIMENSIONS } from "~/server/config/temperament";
import { WRITING_KINDS, type WritingKind } from "~/server/config/writing";

import { compassFrom, type Axes } from "./compass";
import { HANG_MIN, HANG_SIZE } from "./hang";
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

/** Taste v2: v1's fields and the hang — the item ids of the pictures hung, in hanging order. */
export type TasteV2 = Omit<TasteV1, "v"> & { v: 2; hang: string[] };

/** Whatever `user_taste.taste` holds: a v1 row stored before Phase 6, or a v2. */
export type Taste = TasteV1 | TasteV2;

/** What the exhibition pieces draw, whichever version it came from. */
export type TasteFields = Omit<TasteV1, "v">;

const unit = z.number().min(0).max(1);
const pole = z.number().min(-1).max(1);
const WING_IDS = WINGS.map((w) => w.id) as [string, ...string[]];

/** An item id — one of `opened`'s or of the hang's. */
const itemId = z.string().min(1).max(64);

const fields = {
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
        itemId,
        title: z.string().min(1).max(200),
        kind: z.enum(
          WRITING_KINDS as unknown as [string, ...string[]],
        ) as z.ZodType<WritingKind>,
        minutes: z.number().int().min(0).max(600),
      }),
    )
    .max(2),
  readingMinutes: z.number().min(0).max(600).nullable(),
};

/**
 * Either version, told apart by `v`. The server checks the ids in `opened` and `hang` exist
 * (api/routers/onboarding.ts) — a schema cannot.
 */
export const tasteSchema: z.ZodType<Taste> = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), ...fields }),
  z.object({
    v: z.literal(2),
    ...fields,
    // hangFrom never hangs one picture twice; a repeat is a tampered or broken client.
    hang: z
      .array(itemId)
      .max(HANG_SIZE)
      .refine((ids) => new Set(ids).size === ids.length, "Each picture once"),
  }),
]);

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
  /** The hang's item ids, in order (`hangFrom(...).map((p) => p.itemId)`). */
  hang: readonly string[];
}): TasteV2 {
  const { scores, listed, destinations, opened, hang } = input;
  const minutes = opened.map((o) => o.minutes);
  return {
    v: 2,
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
    hang: [...hang],
  };
}

/** One hung picture as the profile draws it — resolved from an id by `topics.taste`. */
export interface HangCard {
  itemId: string;
  src: string;
  title: string;
}

/** The stored taste as /profile/topics renders it: the version kept, the hang resolved. */
export type ProfileTaste = TasteFields & { v: 1 | 2; hang: HangCard[] };

/**
 * Reads a stored taste for the profile. A v1 row has no hang and shows none (Review focus 1 of
 * docs/PLAN_redesign.md); a v2's ids are resolved through `cards` in their stored order, a
 * picture that has since left the corpus is dropped, and fewer than `HANG_MIN` left is no hang —
 * the rule the reveal drew it by. Never throws on a malformed `hang`: the row was validated when
 * it was written, and a profile is not the place to find out otherwise.
 */
export function profileTaste(
  taste: Taste,
  cards: ReadonlyMap<string, HangCard>,
): ProfileTaste {
  const hang = hangIdsOf(taste).flatMap((id) => {
    const card = cards.get(id);
    return card ? [card] : [];
  });
  return { ...taste, hang: hang.length < HANG_MIN ? [] : hang };
}

/** The hang ids a stored taste names — none for a v1 (or a malformed v2). */
export function hangIdsOf(taste: Taste): string[] {
  return taste.v === 2 && Array.isArray(taste.hang)
    ? taste.hang.filter((id): id is string => typeof id === "string")
    : [];
}
