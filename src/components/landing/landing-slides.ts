// The landing slideshow's content and its pacing arithmetic, kept apart from anything that
// renders so both are testable in plain node (`landing-slides.test.ts`).
//
// **Why the files are local and committed rather than hot-linked.** The design prototype
// (`Ambit - Landing 2.dc.html`) points its slide list straight at Wikimedia Commons'
// `Special:FilePath` URLs. Shipping that would put the first screen a new reader ever sees at the
// mercy of another service's rate limits and uptime, on a screen that has no signed-in state to
// fall back on. Fetched once into `public/landing/` instead (the exact curl block is in
// docs/PHASE5_PLAN_5.11.md §3), these are same-origin static assets: the service worker caches
// them like any other, and the page's imagery can never be a third party's outage.
//
// **The licensing gate.** Only public-domain works and images Ben has personally cleared may be
// listed here. The design bundle ships 20 additional `uploads/*.webp` whose rights were never
// established — they are deliberately absent, and `landing-slides.test.ts` asserts that no entry
// ever points into an `uploads/` path, so a future addition has to answer the question rather
// than slip through.

export interface LandingSlide {
  /** Path under `public/` — served same-origin, cached by the service worker's static rule. */
  src: string;
  /**
   * Attribution for the work. Nothing renders this today; it exists so the credit lives next to
   * the file it belongs to rather than in a commit message nobody will find later.
   */
  credit: string;
}

export const LANDING_SLIDES: readonly LandingSlide[] = [
  {
    src: "/landing/great-wave.jpg",
    credit:
      "Hokusai, The Great Wave off Kanagawa (c. 1831) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/pillars-of-creation.jpg",
    credit:
      "NASA/ESA, Pillars of Creation (Hubble, 1995) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/rain-steam-and-speed.jpg",
    credit:
      "J. M. W. Turner, Rain, Steam and Speed — The Great Western Railway (1844) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/vanderbilt-cup-1908.jpg",
    credit:
      "Vanderbilt Cup, 1908 (photograph) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/hubble-ultra-deep-field.jpg",
    credit:
      "NASA/ESA, Hubble Ultra-Deep Field (2004) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/wheatfield-with-crows.jpg",
    credit:
      "Vincent van Gogh, Wheatfield with Crows (1890) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/haeckel-discomedusae.jpg",
    credit:
      "Ernst Haeckel, Discomedusae — Kunstformen der Natur, plate 88 (1904) — public domain, via Wikimedia Commons",
  },
  {
    src: "/landing/the-milkmaid.jpg",
    credit:
      "Johannes Vermeer, The Milkmaid (c. 1658) — public domain, via Wikimedia Commons",
  },
  // Ben-cleared images go here, one entry each. Drop the file in `public/landing/` first and
  // recompress it to roughly ≤300 KB — the run preloads every slide at once, so each file is
  // paid for on a cold cellular load:
  //   sips -Z 1200 -s format jpeg -s formatOptions low in.png --out public/landing/<name>.jpg
];

/**
 * How long each slide holds before the next one crosses over.
 *
 * The prototype's default is 1200ms and its designer note says 400–1000ms was being auditioned.
 * Ben's call at plan time was the fast end — the whole run should be over in about five seconds,
 * because this is the screen standing between a reader and signing in, not an attraction.
 */
export const SLIDE_MS = 600;

/**
 * A run is a random *subset*, not the whole list.
 *
 * This is what keeps the wait fixed at ~5s (8 × 600ms) however many images get cleared and added
 * above. Without it, every addition would make the landing screen slower, which is exactly the
 * kind of quiet regression nobody notices until the list is 30 long.
 */
export const SLIDES_PER_RUN = 8;

/** The prototype's beat: the sheet rises this long after the last slide lands. */
export const END_TO_SHEET_MS = 260;

/**
 * How long the cycle will wait for the first slide to decode before starting anyway. A slow
 * network must not be able to hold the screen black indefinitely — after this, the show starts
 * and the first frame simply fades in a moment late.
 */
export const FIRST_SLIDE_TIMEOUT_MS = 1500;

/**
 * Cross-fade duration, from the design handoff's formula: `min(520, slideMs × 0.55)`.
 *
 * The ratio is what matters — the fade always occupies just over half the slide's time, so slides
 * overlap rather than blink, at any cadence. The 520ms ceiling stops a slow cadence from turning
 * into a dissolve that never resolves.
 */
export function fadeMs(slideMs: number): number {
  return Math.min(520, Math.round(slideMs * 0.55));
}

/**
 * Fisher–Yates shuffle, returning a copy.
 *
 * `rng` is injectable purely so tests can be deterministic; production always uses `Math.random`.
 * The shuffle is per *load*, which is the point of it: two visits to the landing page should not
 * feel like the same screen.
 */
export function shuffle<T>(
  list: readonly T[],
  rng: () => number = Math.random,
): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A shuffled subset of `size` slides — the sequence one visit will show. */
export function pickRun(
  list: readonly LandingSlide[] = LANDING_SLIDES,
  rng: () => number = Math.random,
  size: number = SLIDES_PER_RUN,
): LandingSlide[] {
  return shuffle(list, rng).slice(0, size);
}

/**
 * Warms every slide in the run into the browser's cache, and resolves once the **first** has
 * decoded (or `timeoutMs` passes, whichever comes first).
 *
 * The distinction is the whole reason this exists: the cycle should start when slide 0 is ready to
 * paint — not before (the first frame would be a blank flash) and not after all eight have loaded
 * (a reader on a slow connection would stare at a black screen for seconds). The remaining seven
 * keep loading in the background while the show is already running, and at 600ms a slide they have
 * a comfortable head start.
 *
 * Client-only by construction: `Image` doesn't exist on the server.
 */
export function preloadRun(
  run: readonly LandingSlide[],
  timeoutMs: number = FIRST_SLIDE_TIMEOUT_MS,
): Promise<void> {
  if (run.length === 0) return Promise.resolve();

  const images = run.map((slide) => {
    const img = new Image();
    img.src = slide.src;
    return img;
  });

  // `.decode()` rejects on a failed load — a missing file must not stall the screen forever, so a
  // rejection resolves like a success and the cycle starts regardless.
  //
  // The existence check is not paranoia about old browsers so much as about *odd* ones: `decode`
  // is absent in jsdom and in a few embedded webviews, and calling a missing method here would
  // throw during the mount effect and take the whole landing page down — the one screen that has
  // no signed-in state to fall back to. Without it, the timeout below is the only gate, which
  // costs a moment and nothing else.
  const first = images[0]!;
  const firstDecoded =
    typeof first.decode === "function"
      ? first.decode().catch(() => undefined)
      : new Promise<void>((resolve) => {
          first.addEventListener("load", () => resolve(), { once: true });
          first.addEventListener("error", () => resolve(), { once: true });
        });
  const cap = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

  return Promise.race([firstDecoded, cap]).then(() => undefined);
}
