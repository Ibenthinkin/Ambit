# Ambit — brief for the Claude Design session (sitewide redesign, onboarding first)

> **Answered.** Ben ran the session from this brief and exported `docs/ambit_Redesign_4/` ("1b");
> `docs/DESIGN_redesign.md` (10-06-26) records which of its choices Ambit takes, and the redesign
> was built on `feat/redesign` the same day (`docs/PLAN_redesign.md`, `log.md` 10-06-26). Kept as
> the record of what was asked. Its description of the app below is the app **before** the
> redesign — nine onboarding steps, the accent knob, Sora — and is no longer current.

_Written 10-05-26 to paste into Claude Design. It describes what the app has **today** so the
design starts from the real thing, lists what the redesign has to decide, and says what the
exported package should contain so it drops onto the code. Companion documents:
`docs/NOTES_onboarding-critique.md` (what's wrong), `docs/PLAN_onboarding-critique.md` (how the
build is cut), `docs/COPY_onboarding.md` (every string, with a column for new copy)._

---

## 1. What Ambit is

A calm, non-social, anti-doomscroll PWA. An infinite feed of public-domain pictures and
articles from museums, libraries and a few designated blogs, loosely tuned to a reader's
interests, with deliberate cross-domain jumps. Invite-only, no money, no social features.
Dark by default; the pictures are the colour.

Screens, in the order a new reader meets them: **landing** (`/`, a persona-dealt explore feed
for strangers, with a sign-up sheet) → **onboarding** (`/onboarding`, nine steps of
picture-led questions ending in a reveal of the reader's taste) → **feed** (`/feed`, a masonry
of square-cornered picture tiles and a few article cards) → **item** (`/i/[id]`, the picture
full-viewport over its facts, swipe sideways to wander; on desktop a two-page "magazine" spread)
→ **profile hub** (`/profile`: Collections · Topics · Edit profile · Settings) and **saved**.

Two breakpoints only: phone below 768 px, desktop from `md` (768 px) up, with `xl` (1280 px)
used for one or two grid steps. The desktop rule since 09-08-26: **a screen keeps its phone
composition and stops stretching**, inside one of three centred columns:

| Column   | Max width | Used by                                              |
| -------- | --------- | ---------------------------------------------------- |
| `narrow` | 600 px    | Onboarding (every step until Cut 1 widened pictures) |
| `reader` | 720 px    | The item page's facts, a book measure                |
| `wide`   | 1120 px   | Feed, profile hub, saved: four ~270 px masonry cols   |

The onboarding-in-the-narrow-column rule is the root of "cards are too small on desktop" and
is already being loosened (picture steps move to `wide`). The redesign can set its own widths.

Design conventions that stay regardless of look: every screen rises in with a 10 px / 600 ms
fade; **every border is a 0.5 px hairline**; the OS reduce-motion setting collapses every
animation except two named opt-outs; feed and saved tiles are **square-cornered** and full-bleed.

## 2. Tokens today (`src/styles/globals.css`, Tailwind v4 `@theme`)

### Colour (dark only; there is no light theme in the app)

| Token                | Value     | Role                                                        |
| -------------------- | --------- | ----------------------------------------------------------- |
| `--color-bg`         | `#161411` | Screen background                                           |
| `--color-bg-app`     | `#0c0b09` | Outer chrome outside a screen's content                     |
| `--color-surface`    | `#1b1815` | Sheets, modals                                              |
| `--color-immersive`  | `#0b0a08` | The item screen behind a picture                            |
| `--color-overlay`    | `#1e1c18` | Toast / banner fill (~92% opacity)                          |
| `--color-scrim`      | `#090806` | Sheet and modal scrims (~60–66% opacity)                    |
| `--color-ink`        | `#efebe0` | Body text, and the root of the alpha ladder below           |
| `--color-ink-hi`     | `#f5f1e7` | Titles only                                                 |
| `--color-accent`     | knob      | Indigo `#4c5fe0` default; amber `#d9a73c`, green `#3fa35c`, red `#d9483f` via a per-device Settings picker |
| `--color-on-accent`  | `#17140e` | Text on an accent fill; never white                         |
| `--color-focus-ring` | `#a8aeff` | 2 px inset keyboard ring on tiles; fixed, not the knob      |
| `--color-error`      | `#d98c6a` |                                                             |

**The alpha ladder.** Every muted text, hairline and subtle fill is `ink` at a fixed opacity.
Text: `ink/82` secondary · `/62` body-muted · `/55` meta · `/45` and `/40` eyebrows · `/38`
disabled. Borders: `ink/16` on imagery · `/12` default · `/8` faint. Fills: `ink/9` raised
chrome · `/5` chips and ghost buttons · `/3` cards. **If the redesign keeps one derived ladder
like this, the whole app re-tones from one token.** If it introduces named greys instead, say so;
both work, but the export needs to pick one.

### Type

**One face, Sora** (variable, 100–800), self-hosted, for everything. No serif, no italics
anywhere. Inter is loaded for the landing overture alone. Sizes in use are bespoke pixels, not a
scale: 34/30 titles (semibold, −0.4 px tracking), 22/20/17 card titles, 16/15/14.5/14 body,
13/12.5 meta, **11 px uppercase eyebrows with 1.8 px tracking in the accent colour** (the one
typographic signature the app has). A named scale in the export would be welcome.

### Shape

Pills (999 px) for buttons, chips, segments, toolbars; `22 px` sheets (top corners) and cards;
`20/18/16/12 px` image radii; `14 px` inputs. Onboarding's picture cards lost their radius in
Cut 1 and are square now. Ben's verdict: **no rounded corners on picture cards**, and he does
not like the pill button model.

### Elevation and motion

Five shadows total (toast, banner, sheet, toolbar, lift). Three easings. Sheets slide 260 ms;
desktop dialogs fade-and-settle 200 ms; the feed tile lifts 3.5% with a shadow over 350 ms on
hover. Nothing here is under review, but the package may replace any of it.

## 3. Components today (`src/components/ui/`)

| Component            | Shape and states                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Button**           | `accent` (filled accent, on-accent text) or `ghost` (`ink/5` fill, `ink/12` hairline, `ink/82` text); sizes sm/md/lg (13 / 14.5 / 15.5 px, semibold); shape `pill` or `rounded` (14 px). Disabled = ghost ladder at `ink/38` text whatever the variant. No distinct hover or pressed styling. |
| **Chip**             | Pill toggle, 15 px medium (sm 12.5 px). Off = ghost ladder; **on** = accent fill + 220 ms squash "pop"; **mixed** = `accent/10` fill, accent hairline (the Topics tab's partly-picked group). |
| **Segmented**        | A row of 2–3 pill toggles, one active (accent fill).                                                                          |
| **Card**             | `ink/3` fill, `ink/8` hairline, 22 or 18 px radius. Behind article cards and saved tiles.                                     |
| **Input / Textarea** | 14 px radius, hairline, dark fill.                                                                                            |
| **IconButton**       | Round, 28–42 px.                                                                                                             |
| **PillToolbar**      | Phone: a frosted glass pill (`rgba(240,237,231,.225)`, 26 px blur, 0.5 px `white/28` border) 56 px tall, fixed bottom-centre: Profile · Feed · Save, with **Share as a detached 56 px disc** beside it. |
| **RailToolbar**      | Desktop: the same glass as a vertical rail fixed at the right edge, Share as a 68 px disc below it. |
| **BottomSheet**      | Phone: slides up, 22 px top corners. Desktop: a centred 520 px dialog, or a 360 px popover beside its opener.                 |
| **Toast**, **Rise**, **Loader** ("Reach": ring + orbiting dot, 2.4 s) | Not under review.                                                                         |

Ben's view: the button and chip model should be rethought sitewide, the toolbars can stay as
they are for this round unless the new model makes them look wrong.

## 4. Onboarding today, step by step

Nine steps, a progress label ("Step 3 of 9 · Feeling") and a fixed bottom **StepBar** with Back
on the left and the forward button on the right (Skip / Next / "Nowhere in particular"), fading
up from the screen background. Every step is skippable. Pictures are real items from the
corpus, served as ≤1600 px WebP; a card can fall back to text when the database has no picture.

| Step | Screen                 | Shape today                                                                                                                                      |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| —    | **Intro**              | Eyebrow "Ambit · Setup", title, two-paragraph lede, Begin.                                                                                       |
| 1    | **Rooms** (×3 + playoff) | "Which would you look at longer?" over a 2-col grid of 4 picture cards (4:5), each a wing (Creatures, Gardens, Space…); pick up to three; a fourth screen replays the top picks head to head. |
| 2    | **Hands** (×3)         | Same subject, two renderings side by side (photograph vs plate, etc.), with Either / Neither chips under them.                                    |
| 3    | **Feeling** (×3)       | Same again for mood: bold/soft, night/day, warm/austere.                                                                                         |
| 4    | **Keep**               | "Tap any you'd keep": ten pictures in a 2-col grid (5 across on desktop, which Ben hates). The plan proposes a **swipe stack** here, one picture at a time, keep/pass. |
| 5    | **Reading** (×2)       | "Which would you open?": four real article cards (kind · minutes kicker, headline, dek) in a 2-col grid. Too small to read.                       |
| 6    | **Travel**             | Twelve destination cards, picture + place name + a line; multi-pick. Coordinates were removed in Cut 1.                                          |
| 7    | **Rather not**         | Nine word chips, pick any.                                                                                                                       |
| 8    | **How much**           | Reading amount: None · A little · Some · A lot, preselected from step 5.                                                                         |
| 9    | **Your words**         | Two optional free-text prompts with a privacy disclosure (sent to an LLM, stored). Likely merged to one.                                         |
| —    | **Saving**             | "Putting it together…" with the loader.                                                                                                          |
| —    | **Reveal**             | Eyebrow "Your first exhibition", a generated title (adjective + wing noun, e.g. "Quiet Bestiaries"), temperament line, compass, "You'd open" reading line, Kept out, Start exploring / Start over. **Ben wants this renamed away from "exhibition" and brought closer to the study prototype's reveal**: a hang of the kept pictures, display title, subtitle, poles, kept-out chips. |

The same screen is `/profile/topics` later, as the reveal kept, with a flat levelled topic list
and "Retake the questions".

**Mechanics are fixed.** Which questions exist, what each answer scores, the preselect on step
8, skipping, the reveal's inputs. Everything visible is open.

## 5. The critique, condensed (full text in `docs/NOTES_onboarding-critique.md`)

- The sitewide accent: Ben hates it. The button model and rounded picture corners too.
- Cards are far too small, worst on desktop; rethink how pictures are asked (feed or swipe).
- All copy to be rewritten; the wing prompt is "terrible"; the wing names are disliked
  (especially "Body & mind"); captions off the wing pictures; bigger pictures everywhere.
- Pairs: copy and side labels wanted; Keep grid "horrible" on desktop; reading cards tiny;
  travel cards unreadable.
- About-you step: removed already (Cut 1).
- Reveal: rename, and restore what the study's prototype reveal had.

The earlier study prototype (light wall, Bodoni serif, Klein blue `#1F33C0` / dark `#8E9BFF`,
square outlined uppercase-mono buttons, swipe stack, two-column reveal) is the closest existing
reference for the direction, but it was phone-only and light. Ambit is dark. Whether a light
wall comes over is a design decision this session can make.

## 6. What the package has to settle

1. **One accent or several.** Recommendation in the plan: one colour, knob retired. If one,
   its hex, plus the on-accent text colour that passes contrast on it, in the dark scheme (and
   light if a light scheme is introduced).
2. **The button and chip model.** Shape, border, label case, and the full state set: rest,
   hover, focus-visible, pressed, disabled, selected, mixed. Whether pills survive anywhere.
3. **Type.** Keep Sora or change it; a named size scale; the eyebrow treatment.
4. **Radius.** A scale with names (or "none" everywhere), and which components keep any.
5. **Onboarding screens at 390 px and 1440 px**, each step of §4, so desktop sizing is designed
   and not inferred from the phone.
6. **The reveal**, explicitly, and its new name.
7. **Whether a light theme exists.** Today the answer is no.

## 7. Export format that drops onto the code

- **Tokens as a flat list of name → value**, colours as hex (or hex + alpha), sizes in px,
  radii in px, shadows as CSS. Dark first; light as a second column if it exists. Names matter
  less than one value per role; the code maps them onto `--color-*`, `--radius-*`, `--font-*`.
- **Component specs** as state tables (one row per state, columns for fill, border, text,
  motion) rather than as code. The app recreates designs in its own components by a recorded
  convention; exported React/Tailwind is read as reference, not pasted.
- **Screens** as images or HTML at both widths, with the copy either as placeholder or taken
  from `docs/COPY_onboarding.md`. The copy deck is where new wording goes; screens needn't
  carry final text.
- **Anything the session renames** (steps, the reveal, wing names) noted in one list, so the
  build can touch the copy deck and the code's one `FRAME` object together.

What the code will do with it: Cut 5 of the plan applies the tokens to `globals.css` and the
Button/Chip/Segmented primitives, retires the accent knob if the answer to §6.1 is one colour,
and every later onboarding cut inherits the result. Nothing in the export needs to be
Tailwind-shaped.
