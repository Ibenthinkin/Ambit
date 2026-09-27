# Door of Perception, one item per picture

_09-27-26 · Opus 5.5 · branch `feat/dop-fanout` (worktree `~/Dev/ambit-dop`)_

## Why

Ben asked why DoP pictures almost never show up in the feed. Measured locally: DoP had **387 rows in a
~190,000-item corpus (0.2%)** and appeared **3 times in 219 sampled cards (1.4%)**. The walk
wasn't short. The blog has 391 posts and all of them were stored. What limited it was 6.3's
**D1**, "one item per post, the featured image". DoP's media library holds **11,777 files, ~28 per
post**, so the corpus held about 3% of the blog's pictures, each one a ~800 px featured crop.

Ben reversed D1 on 09-27-26: every picture, at full resolution. His reasoning was that "11k images
that will all be keepers" is worth the curation spend (~$2.60 at the measured $0.000235/item).

## Decisions

| # | Decision | Why |
|---|---|---|
| F1 | **The pictures the post shows, not every attachment.** `<img src>` URLs are read from `content.rendered`, in order. | A post's attachments include unused alternates, header crops and the featured crop. One post measured 74 attachments for 63 shown pictures, another 28 for 25. |
| F2 | **Each shown picture is matched to its attachment by exact file name**, across every rendition the attachment lists. | The post shows `…-1200x812.jpg`, and the attachment record names that file among its sizes. The match is exact, with no size-suffix regex guesswork. |
| F3 | **`imageUrl` = the original upload** (2,000–7,355 px measured); **`curationImageUrl` = the published `large` rendition.** | Full resolution is stored now, so raising the image proxy's 1600 px cap later (`image-cache.ts` `MAX_EDGE`) is a proxy change, not a re-walk. The curator downloads about 1/5 of the bytes. |
| F4 | **The featured image keeps `sourceId = slug`**; every other picture is `<slug>:<attachment id>`. | The 387 existing rows, with their saves, seen rows and paid-for curation, stay the same rows. The attachment id rather than a position means re-ordering a post can't renumber stored pictures. |
| F5 | **Skipped, never guessed:** a picture shown twice, anything under 300 px on its short edge (`MIN_SHORT_EDGE`), and a shown image attached to a *different* post. That last case is counted per page in the ingest log. | One post opens with a 1072×118 "moon to scale" banner, which is page furniture. A foreign attachment's original isn't in this post's media, and guessing its URL would trade a real picture for a 404. |
| F6 | **Every picture carries the post's title, excerpt, tags and permalink; `body` stays null.** | This is the Tumblr fan-out's shape (09-06-26). The excerpt describes the set, and D5, "no blog article text", is unchanged. |

The expansion lives in `walk()` (`expandPictures`, pure and fixture-tested), not in `toItem()`,
because `CorpusWalkAdapter.toItem` is one raw in, one item out, and it is a cross-service
agreement. A post with no featured image still yields its other pictures. Only its card errors,
through a sentinel raw, the same device the Tumblr fan-out uses.

**Rights posture.** The designated-blog posture was written as "a single image or short excerpt +
credit + link". Every picture of a post, each linking back to the post, goes past "single image".
This is Ben's call, made knowingly. The Tumblr photoset fan-out had already crossed the same line.
**Record it in the Ambit-Admin log** (`~/vaults/Memory-Palace/05 Projects/Ambit-Admin/`).
Removal on request is still `--prune` plus the standing policy.

## Cost

- **Walk:** 20 post pages plus one media request per post, 500 ms apart, is about 450 requests,
  or **~4 min**.
- **Curation:** ~11,300 new items × $0.000235 is **~$2.65**. The curator fetches the `large`
  rendition (~840–1024 px).
- **Image cache (`img:warm`):** originals are **0.7–7 MB** each, so about **15–20 GB pulled from
  DoP's own nginx**, once, ever. Warm it at `--rate 1`, about 3.5 h. The cache keeps ≤1600 px
  WebP, so **~1.7 GB on disk**.

## Runbook: local, overnight

From the worktree (it reads the main checkout's `.env`):

```sh
cd ~/Dev/ambit-dop
bun --env-file=../ambit/.env run scripts/ingest.ts --source doorofperception   # no quota: DoP has no walkQuota
bun --env-file=../ambit/.env run scripts/measure-images.ts                      # img:dims for the new rows
bun --env-file=../ambit/.env run scripts/warm-images.ts --source doorofperception --rate 1
```

If the ingest dies partway, re-run the same line. The curation cache makes everything already
scored free, and `already in DB` skips what was written.

**Verify in the morning:**

```sql
select count(*), round(avg(curation_score)::numeric,2) avg,
       round(100.0*count(*) filter (where curation_score >= 8)/count(*),1) pct8,
       count(*) filter (where topic_id is null) unhomed
from item where source = 'doorofperception';
```

Expect ~11,000 rows. Then `bun run probe:feed --uniform --pages 20` and count
`doorofperception`. It was 3 of 219 cards before this change.

**Watch for:** `sourceCap` (3 per page) is now the ceiling on DoP per page, and with ~11k rows DoP
will reach it on pages that drift into its topics. And one post's ~60 pictures share a title and
excerpt, so a page can show three pictures from the *same post*. If that feels repetitive, a
per-post cap is the follow-up. It isn't built.

## Production

1. Merge `feat/dop-fanout`, push, deploy.
2. **Push the local curation cache to the volume *before* the first nightly after deploy** (the
   `.cache/curation` push from the 8.1 walkthrough). Otherwise the nightly walks DoP, fans it out,
   and re-bills the ~$2.65 on production. That's cheap, but it isn't free.
3. After the nightly: `docker exec "$C" bun run img:warm --source doorofperception --rate 1`
   (ship it as a `.cache/` script for Ben to run; the classifier refuses agent writes on VM 202).
   `img:dims` runs at container boot.
4. Check the volume's free space first: ~1.7 GB more.
