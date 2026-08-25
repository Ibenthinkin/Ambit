import type { MetadataRoute } from "next";

// Next's App Router convention: a `manifest.ts` at this path is automatically served as
// /manifest.webmanifest — the JSON file a browser reads to decide whether/how the app can be
// "installed" (add to home screen / desktop). None of this affects the page itself; it's read
// by the browser chrome, not by React.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ambit",
    short_name: "Ambit",
    description: "A calm, non-social anti-doomscroll feed.",
    // **`/feed`, not `/`.** The landing route redirects a signed-in reader to `/feed`, and a
    // redirect is precisely what an offline launch cannot follow — an installed app opened with no
    // network would land on the offline fallback instead of the feed the service worker has
    // cached. Pointing straight at `/feed` costs nothing for a signed-out reader, since that route
    // bounces them back to `/` server-side.
    start_url: "/feed",
    display: "standalone",
    // Matches the design handoff's dark screen background (README: "Background (screen):
    // #161411") — background_color is what paints during the splash-screen instant between tap
    // and first paint, theme_color tints the OS status bar / browser chrome around the app.
    background_color: "#161411",
    theme_color: "#161411",
    icons: [
      // `purpose: "any"` icons render as-is; the OS is responsible for cropping them into
      // whatever shape it uses (circle, squircle, ...) — so they can bleed to the edge.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // `purpose: "maskable"` icons are pre-cropped by us instead: the ring+dot mark is scaled
      // down to fit inside the center ~80% "safe zone", so whatever shape mask the OS applies
      // never clips it. These are separate files, not a CSS trick — see the icon generation
      // step (log.md) for how the padding was chosen.
      {
        src: "/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
