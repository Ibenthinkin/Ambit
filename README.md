# Ambit

A calm, non-social **anti-doomscroll** app: an endless feed of genuinely interesting images and text — pulled from public-domain knowledge, art, and literature APIs (Wikipedia, the Met, Art Institute of Chicago, Cleveland Museum of Art, Wellcome Collection, Smithsonian Open Access, Project Gutenberg/Wikisource, Wikiquote, NASA APOD, Public Domain Review) — loosely tuned to your interests, for staring at while you wait. The feeling it chases: a drift through someone's favorite wing of a museum, or the old Tumblr art blogs — curated, almost never repeating.

The name *Ambit* = the scope you wander within: a weighted-random walk through things you'd probably like, with deliberate cross-domain jumps for serendipity.

## What it is

- **Mobile-first PWA** + a lightweight backend.
- **Infinite vertical scroll** mixing image and article cards.
  - Images: tap → fullscreen; swipe left/right through a fullscreen gallery.
  - Articles: headline + lede; double-tap / long-press to expand inline.
- **Save + share** on any item. No comments, no social, no user uploads.
- **Curated topic drift**: every item is normalized to a common schema and scored at ingest by an LLM curator (the taste layer); the feed drifts across a topic-adjacency graph built offline from embeddings — CORE topics you picked, DRIFT to adjacent ideas (Poetry → Typography → Machines), and JUMPs further afield — with what's shown inside a topic chosen by curated-weighted random, never similarity.
- **Invite-only** for now, with minimal email + password accounts so saves sync and the feed can learn (saves nudge your topic weights, visibly).

## Status

**Phase 0 complete** (07-13-26). Both existential risks settled: free-API density is ample, and the feed *feel* passed its gate — after a pivot. Item-level embedding recommendation was tested and rejected (museum catalog text degenerates cosine similarity into string matching, and top-k similarity is anti-serendipity by construction); the validated design is a tiered topic-drift feed over an LLM-curated pool. The working prototype lives at `phase0/feed.html` (self-contained; open in a browser). Next: Phase 1 scaffold (SPEC §14).

## License

MIT — see [LICENSE](LICENSE).
