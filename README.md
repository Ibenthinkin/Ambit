# Ambit

A calm, non-social **anti-doomscroll** app: an endless feed of genuinely interesting images and text — pulled from public-domain knowledge, art, and literature APIs (Wikipedia, the Met, Art Institute of Chicago, Smithsonian Open Access, Project Gutenberg/Wikisource, Wikiquote, NASA APOD, Public Domain Review) — loosely tuned to your interests, for staring at while you wait.

The name *Ambit* = the scope you wander within: a weighted-random walk through things you'd probably like, with deliberate cross-domain jumps for serendipity.

## What it is

- **Mobile-first PWA** + a lightweight backend.
- **Infinite vertical scroll** mixing image and article cards.
  - Images: tap → fullscreen; swipe left/right through a fullscreen gallery.
  - Articles: headline + lede; double-tap / long-press to expand inline.
- **Save + share** on any item. No comments, no social, no user uploads.
- **Embeddings-led relatedness**: every item is normalized to a common schema and embedded; relatedness is nearest-neighbors *across* sources — that cross-domain leap is the product. Native source tags are a secondary signal.
- **Invite-only** for now, with minimal magic-link auth so saves sync and the feed can learn.

## Status

Phase 0 — validating that cross-source embedding serendipity actually *feels* good (vs. random) and that free-API content density is sufficient, before building the real backend.

## License

TBD.
