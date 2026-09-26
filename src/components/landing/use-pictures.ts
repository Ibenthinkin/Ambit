"use client";

import * as React from "react";

import type { ReelPicture } from "~/server/services/landing-pool";

import { REEL_SIZES } from "./tempos";

// Re-exported for the client modules that already import it from here; defined in the tempos leaf
// because app/page.tsx (a Server Component) needs its value and cannot read one from a
// "use client" module.
export { REEL_SIZES } from "./tempos";

// Which pictures of the reel have decoded (docs/DESIGN_landing-redo.md D5).
//
// Decoding happens off-DOM in `Image` objects — with the same `srcset`/`sizes` as the mounted
// `<img>`, so the browser's cache serves the element from what this hook fetched. `cut` wants the
// whole reel decoded up front (its 12 frames arrive faster than a 350 ms tick could fetch them);
// `dissolve` wants one ahead. `ready` is what `useReel` consults before showing a frame; a picture
// that fails to decode is never in it — it lands in `failed` instead, which the reel's gate reads
// — and the reel skips past (never a blank frame).
//
// `version` is a counter for effects to depend on: a `Set` mutated in place keeps its identity.
export function usePictures(
  pictures: readonly ReelPicture[],
  index: number,
  ahead: number,
): {
  ready: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  version: number;
} {
  const [ready] = React.useState(() => new Set<string>());
  const [failed] = React.useState(() => new Set<string>());
  const [version, setVersion] = React.useState(0);
  const requested = React.useRef(new Set<string>());

  // `version` is a dependency so a failure re-runs this: a failed picture does not count toward the
  // `ahead` budget, so the walk reaches one picture further and requests it — otherwise a dissolve
  // whose one-ahead picture 502s would wait for a decode that is never coming.
  React.useEffect(() => {
    const n = pictures.length;
    if (n === 0) return;
    const want = ahead === Infinity ? n : Math.min(n, ahead + 1);
    let live = 0;
    for (let k = 0; k < n && live < want; k++) {
      const p = pictures[(index + k) % n]!;
      if (failed.has(p.id)) continue;
      live += 1;
      if (requested.current.has(p.id)) continue;
      requested.current.add(p.id);

      const img = new Image();
      // `sizes` before `srcset`, and both before `src`: the browser chooses its candidate when
      // `src` is assigned, from whatever the other two say at that moment.
      if (p.srcSet) {
        img.sizes = REEL_SIZES;
        img.srcset = p.srcSet;
      }
      img.src = p.src;
      // `decode` is absent in jsdom and a few embedded webviews; the load event is the fallback.
      const decoded =
        typeof img.decode === "function"
          ? img.decode()
          : new Promise<void>((resolve, reject) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => reject(new Error("load")), {
                once: true,
              });
            });
      decoded.then(
        () => {
          ready.add(p.id);
          setVersion((v) => v + 1);
        },
        () => {
          // Never ready. Recorded, so the reel's gate can tell "settled" from "still loading", and
          // so the walk above moves past it.
          failed.add(p.id);
          setVersion((v) => v + 1);
        },
      );
    }
  }, [pictures, index, ahead, ready, failed, version]);

  return { ready, failed, version };
}
