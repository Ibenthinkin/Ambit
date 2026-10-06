// The reveal's **frame** — the conceit a reader's taste is named in, every word of it in one
// object (docs/PLAN_onboarding-critique.md §4, D6). Today the frame is an exhibition: the reveal
// says "Your first exhibition" and titles it "Quiet Weathers", an adjective from the reader's top
// look (or medium) and a noun from their top wing. Ben's 10-05-26 critique wants the reveal named
// away from "First Exhibition" — toward a feed, a zine, something — and the nouns ("Bestiaries",
// "Orbits") are the exhibition conceit, so they change with the word. Renaming the reveal is
// editing this file; `frame.test.ts` is the one test that follows.
//
// Words only, no imports: exhibition.ts does the arithmetic that chooses among them. The nouns
// sat on each wing (config/interview-wings.ts) until this file; a wing is still where its label
// and topics live.

export interface Frame {
  /** The line over the title, and the card's accessible name. */
  eyebrow: string;
  /** The title when the answers name nothing — so a reader always has one. */
  untitled: { adjective: string; noun: string };
  /** Look topic → adjective. A look not here simply yields to the medium. */
  lookAdjectives: Readonly<Record<string, string>>;
  /** Medium topic → adjective, the fallback. */
  mediumAdjectives: Readonly<Record<string, string>>;
  /** Wing id → the title's second word. Every wing has one (frame.test.ts). */
  nouns: Readonly<Record<string, string>>;
}

export const FRAME: Frame = {
  eyebrow: "Your first exhibition",
  untitled: { adjective: "First", noun: "Exhibition" },
  lookAdjectives: {
    minimal: "Quiet",
    eerie: "Nocturnal",
    melancholy: "Nocturnal",
    neon: "Electric",
    color: "Chromatic",
    "black-and-white": "Monochrome",
    surreal: "Dreaming",
    psychedelic: "Dreaming",
    whimsical: "Whimsical",
    painterly: "Painted",
    "aerial-view": "Aerial",
    brutalist: "Concrete",
    retrofuturism: "Atomic",
    "art-deco": "Streamlined",
    "mid-century-modern": "Streamlined",
    cozy: "Hearthside",
    ornate: "Gilded",
    // `gothic` is proposed, not a topic yet (vocabulary-proposal.md) — this waits for it.
    gothic: "Gothic",
  },
  mediumAdjectives: {
    photography: "Exposed",
    engraving: "Engraved",
    "scientific-illustration": "Measured",
    ceramics: "Glazed",
    textiles: "Woven",
    collage: "Assembled",
    painting: "Painted",
    drawing: "Drawn",
    illustration: "Illustrated",
  },
  nouns: {
    creatures: "Bestiaries",
    growing: "Gardens",
    land: "Weathers",
    space: "Orbits",
    machines: "Mechanisms",
    cities: "Streets",
    people: "Portraits",
    myth: "Myths",
    body: "Anatomies",
    made: "Objects",
    everyday: "Still Lifes",
    stage: "Performances",
  },
};
