// `/explore` — a signed-out taste of the feed (09-26-26, docs/PLAN_explore-route.md).
//
// A client-safe leaf: no imports, so the explore screen, the item screen's rail and the
// `feed.explore` router can all read the same numbers without dragging the server into a bundle.
//
// The caps are *soft* and *per visit*: counted in the browser, reset by a reload. They shape the
// taste, they don't guard anything — the account wall is what keeps Ambit invite-only, and the
// server's page backstop only keeps an ordinary client from paging past the taste — the cursor is
// unsigned, so the real bound on a script is the public procedures' per-IP rate limit.

/** Image cards the explore feed shows before its end card. */
export const EXPLORE_FEED_IMAGE_CAP = 200;

/** Sideways steps the item screen's rail allows a visitor who came from `/explore`. */
export const EXPLORE_RAIL_CAP = 100;

/** `feed.explore` answers an empty, final page from this page index on — 24 pages is ~288 cards,
 *  comfortably past the 200-image cap, so the client's cap is always what a visitor meets. */
export const EXPLORE_MAX_PAGES = 24;

/** How long the overture's curtain takes to dissolve into the feed once its line has collapsed.
 *  Ben, 09-26-26: the reel's 1 s fade was right in kind and a touch quick — "a bit slower". */
export const EXPLORE_DISSOLVE_MS = 1600;

// ── copy (Ben edits) ────────────────────────────────────────────────────────────────────────────
// Every word `/explore` says lives here, so the wording can change without touching a component.

/** What a message block's buttons can ask for. */
export type ExploreAction = "signin" | "signup" | "about";

export interface ExploreBlockCopy {
  title: string;
  body: string;
  /** The block's buttons, in order — one for the three rotating blocks, three for the end card. */
  actions: { action: ExploreAction; label: string }[];
}

export const EXPLORE_BLOCKS = {
  about: {
    title: "What is this?",
    body: "A quiet feed of public-domain pictures and writing.",
    actions: [{ action: "about", label: "Read how it works" }],
  },
  signup: {
    title: "Have an invite?",
    body: "Make an account and the feed learns what you like.",
    actions: [{ action: "signup", label: "Sign up" }],
  },
  signin: {
    title: "Already have an account?",
    body: "Your feed, your saves, where you left them.",
    actions: [{ action: "signin", label: "Sign in" }],
  },
  end: {
    title: "That's the taste.",
    body: "Ambit is invite-only for now. If you have an invite, the rest is yours.",
    actions: [
      { action: "signup", label: "Sign up" },
      { action: "signin", label: "Sign in" },
      { action: "about", label: "What is this?" },
    ],
  },
} as const satisfies Record<string, ExploreBlockCopy>;

/** The "What is this?" dialog. */
export const EXPLORE_ABOUT = {
  title: "What is Ambit?",
  paragraphs: [
    "Ambit is an endless feed of public-domain images and articles: paintings, maps, photographs, scientific plates, old magazines, from museums, libraries and a few hand-picked blogs.",
    "It starts with the subjects you pick, then drifts sideways on purpose into neighbouring subjects, and now and then somewhere unrelated. Every picture was scored by hand-tuned curation before it got in. The feed leans toward what you save, and nothing else.",
    "No ads, no likes, no followers, no one else's opinions. It's meant to be something you can wander in and put down.",
    "Ambit is invite-only for now. If someone sent you an invite, sign up with that email address.",
  ],
} as const;
