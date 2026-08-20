# Ambit

A calm, non-social **anti-doomscroll** app: an endless feed of genuinely interesting images and text — pulled from public-domain knowledge, art, and literature APIs — five live today (Wikipedia, the Met, Art Institute of Chicago, Cleveland Museum of Art, Wellcome Collection), with more planned: further museum APIs, and designated art blogs shown as link cards, credited and linked back to the original — loosely tuned to your interests, for staring at while you wait. The feeling it chases: a drift through someone's favorite wing of a museum, or the old Tumblr art blogs — curated, almost never repeating.

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

**Phases 0–4 complete; Phase 5 (the UI redesign) is mid-flight** — 5.6, the real feed, shipped 08-20-26. There is a working app on `main` with a database populated from real ingest runs: five source adapters, an LLM curation pass at ingest, the tiered topic-drift feed engine, accounts and invites, and saves/collections.

Phase 0 settled both existential risks and is worth keeping on the record, because it produced a pivot: item-level embedding recommendation was tested and **rejected** (museum catalog text degenerates cosine similarity into string matching, and top-k similarity is anti-serendipity by construction). The validated design is a tiered topic-drift feed over an LLM-curated pool; the original prototype still lives at `phase0/feed.html` (self-contained; open in a browser).

**Adopted 08-20-26: blog-first content.** Future sources are primarily designated art and culture blogs, which already carry the tags, descriptions and articles that image APIs make you manufacture. They are shown as **link cards** — image or short excerpt, a credit, and a prominent link out to the article. Ambit does not reformat or host other people's articles, makes no fair-use claim, keeps license strings honest, and removes on request. See `docs/BUILD_PLAN.md` step 6.3.

## License

MIT — see [LICENSE](LICENSE).
