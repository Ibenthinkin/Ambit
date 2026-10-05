// What a reading card shows when this database has no article of its kind to put on it
// (docs/DESIGN_first-exhibition.md §3): CI's fixture corpus, a fresh install, or a local database
// whose articles were never given a `kind`. The card is still a real answer — it scores the kind's
// form topic, and logs that the reader would open one — but with no item behind it, so it carries
// no memberships and is not an "opened" card on the reveal.
//
// The headlines are the prototype's invented examples (docs/first-exhibition/reading-cards.json),
// copied here because `docs/` is not in the production image. They say what *kind* of piece the
// card stands for, so the screen never shows a bare kind name. Index 0 is the first reading
// screen's (short) example, index 1 the second's (long). Ben edits freely.
import type { WritingKind } from "~/server/config/writing";

export interface FallbackCard {
  title: string;
  dek: string;
}

export const READING_FALLBACK: Readonly<
  Record<WritingKind, readonly [FallbackCard, FallbackCard]>
> = {
  essay: [
    {
      title: "The recipes my grandmother never wrote down",
      dek: "Grief, measured in handfuls.",
    },
    {
      title: "A winter at the South Pole",
      dek: "What six months of darkness does to a crew of forty.",
    },
  ],
  curiosity: [
    {
      title: "Why medieval scribes kept drawing knights fighting snails",
      dek: "No one knows. Here are the four best theories.",
    },
    {
      title: "Octopuses might dream. About what?",
      dek: "What sleeping octopuses suggest about their minds.",
    },
  ],
  criticism: [
    {
      title: "In defence of the romance novel",
      dek: "The bestselling genre nobody admits to reading.",
    },
    {
      title: "The quiet horror films that scare me most",
      dek: "No monsters. Just a long hallway and a dripping tap.",
    },
  ],
  archive: [
    {
      title: "Six old Japanese poems about frogs",
      dek: "Seventeen syllables each, and every one is a frog.",
    },
    {
      title: "Mail-order catalogue, 1908: a whole house by post",
      dek: "Yes, the whole house. Nails included.",
    },
  ],
};
