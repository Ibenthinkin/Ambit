"use client";

import * as React from "react";
import { notFound } from "next/navigation";

import {
  Bell,
  Bookmark,
  ChatBubble,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Close,
  Contrast,
  Diamond,
  Envelope,
  FeedLines,
  Gear,
  Globe,
  Info,
  Lock,
  Logo,
  Magnifier,
  Mute,
  Person,
  PersonPlus,
  Photo,
  Plus,
  PlusSquare,
  Rays,
  Share,
} from "~/components/icons";
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Chip } from "~/components/ui/chip";
import { IconButton } from "~/components/ui/icon-button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Segmented } from "~/components/ui/segmented";
import { LOADER_SIZES, Loader } from "~/components/ui/loader";
import { PillToolbar, type BookmarkState } from "~/components/ui/pill-toolbar";
import { Toast } from "~/components/ui/toast";
import { usePress } from "~/hooks/use-press";
import { saveToastText } from "~/lib/save-toast";
import { api } from "~/trpc/react";

// /dev/tokens — the 1b style guide (redesign Task 1.5). Every token, icon and primitive in one
// place, so the design system can be checked whole without building a real screen first.
//
// HOW TO READ IT. The first half is TOKENS and is final: surfaces, the ink ladder, lines, the
// accent's seven jobs, the type scale, shape and elevation, focus. Each swatch is labelled with the
// package's name for it (docs/ambit_Redesign_4/) AND the class you write in the app
// (docs/DESIGN_redesign.md §3). The second half is PRIMITIVES and is, today, still the OLD ones —
// Phase 2 rewrites each (Button 2.1, Chip 2.2, ...) and replaces that section's placeholder note
// with the real state table. Hover / focus / pressed can't be forced from a stylesheet, so they are
// live: point at it, Tab to it, hold it down.
//
// Everything is drawn with the app's real tokens and classes (never an inline hex where a token
// exists), so if a swatch looks wrong here it is wrong on every screen that consumes it. The
// hex values printed beside a swatch are DOCUMENTATION (they mirror DESIGN §3.1); the swatch
// itself is painted by the token.
//
// GATING. `src/proxy.ts` only guards `/feed`, `/saved`, `/onboarding`, so a `/dev/*` route would
// be reachable in production; the guard is the early `notFound()` in the component below (a 404
// under a production build). The page reaches tRPC only through `BackboneSection`, which uses the
// same protected procedures a real screen does, scoped to the signed-in user.
//
// No rounding utility appears on this page on purpose: `src/no-rounded.test.ts` scans every .tsx, and
// the one round thing here (the 6 px accent dot) is allowed by its DOTS rule.

/**
 * Surfaces: the opaque fills. `cls` is the Tailwind class that paints it; `token` is the CSS
 * variable behind it; `hex` is what DESIGN §3.1 says it should be.
 */
const SURFACES = [
  { cls: "bg-bg", token: "--color-bg", hex: "#0E0E0E", use: "app / feed" },
  {
    cls: "bg-bg-app",
    token: "--color-bg-app",
    hex: "#060606",
    use: "behind a screen",
  },
  {
    cls: "bg-immersive",
    token: "--color-immersive",
    hex: "#0A0A0A",
    use: "behind a picture",
  },
  {
    cls: "bg-surface",
    token: "--color-surface",
    hex: "#141414",
    use: "sheets, popovers",
  },
  {
    cls: "bg-dialog",
    token: "--color-dialog",
    hex: "#121212",
    use: "desktop dialog, sign-up",
  },
  {
    cls: "bg-card",
    token: "--color-card",
    hex: "#161616",
    use: "article / intro cards",
  },
  {
    cls: "bg-card-2",
    token: "--color-card-2",
    hex: "#1E1E1E",
    use: "empty thumb cells",
  },
  {
    cls: "bg-tile-hi",
    token: "--color-tile-hi",
    hex: "#161616",
    use: "tile placeholder, light",
  },
  {
    cls: "bg-tile-lo",
    token: "--color-tile-lo",
    hex: "#0E0E0E",
    use: "tile placeholder, dark",
  },
] as const;

/**
 * The ink ladder (DESIGN §3.1): the package names nine greys; the app writes them as `ink` at an
 * alpha, so the whole palette re-tones from one token. `pkg` is the package's name, `cls` the
 * spelling you write.
 */
const INK_LADDER = [
  { pkg: "ink", hex: "#F2F2F2", cls: "text-ink", use: "titles, primary text" },
  { pkg: "ink-1", hex: "#E6E6E6", cls: "text-ink/95", use: "body on dark" },
  { pkg: "ink-2", hex: "#BDBDBD", cls: "text-ink/78", use: "secondary, links" },
  { pkg: "ink-3", hex: "#A8A8A8", cls: "text-ink/68", use: "intro / lede" },
  { pkg: "ink-4", hex: "#9A9A9A", cls: "text-ink/62", use: "card lede" },
  { pkg: "ink-5", hex: "#8A8A8A", cls: "text-ink/55", use: "meta, eyebrows" },
  { pkg: "ink-6", hex: "#7A7A7A", cls: "text-ink/48", use: "mono row labels" },
  { pkg: "ink-7", hex: "#6A6A6A", cls: "text-ink/40", use: "hints" },
  {
    pkg: "ink-8",
    hex: "#5A5A5A",
    cls: "text-ink/34",
    use: "placeholders, disabled",
  },
] as const;

/** The seven hairlines (DESIGN §3.1) — `white` at 8 to 35 %, written as `border-ink/NN`. */
const LINES = [
  { pkg: "line-faint", alpha: "8%", cls: "border-ink/8", use: "row dividers" },
  { pkg: "line-soft", alpha: "12%", cls: "border-ink/12", use: "soft" },
  { pkg: "line", alpha: "14%", cls: "border-ink/14", use: "section dividers" },
  {
    pkg: "line-strong",
    alpha: "16%",
    cls: "border-ink/16",
    use: "header rules",
  },
  {
    pkg: "line-ctrl",
    alpha: "22%",
    cls: "border-ink/22",
    use: "segmented outline",
  },
  {
    pkg: "line-input",
    alpha: "28%",
    cls: "border-ink/28",
    use: "input underline",
  },
  {
    pkg: "line-btn",
    alpha: "35%",
    cls: "border-ink/35",
    use: "outline button",
  },
] as const;

/** The type scale (DESIGN §3.3). `cls` is the utility; `spec` is the size / leading / tracking. */
const TYPE_SCALE = [
  {
    cls: "text-display",
    spec: "clamp(30, 4.2vw, 40) / 1.1 / -0.02em",
    where: "page titles",
  },
  {
    cls: "text-title",
    spec: "32 / 1.08 / -0.02em",
    where: "item title, phone",
  },
  { cls: "text-h2", spec: "24 / 1.35 / -0.01em", where: "section heads" },
  { cls: "text-card", spec: "19 / 1.2 / -0.01em", where: "article card title" },
  { cls: "text-lg", spec: "17 / 1.4", where: "rows, primary button" },
  { cls: "text-body", spec: "16 / 1.5", where: "body (inputs are 18)" },
  { cls: "text-sm", spec: "15 / 1.4", where: "buttons, links, row values" },
  { cls: "text-xs", spec: "13.5 / 1.48", where: "card lede" },
] as const;

const ICONS = [
  { name: "Bookmark", Comp: Bookmark },
  {
    name: "Bookmark (filled)",
    Comp: (p: React.ComponentProps<typeof Bookmark>) => (
      <Bookmark {...p} filled />
    ),
  },
  { name: "Share", Comp: Share },
  { name: "Close", Comp: Close },
  { name: "ChevronLeft", Comp: ChevronLeft },
  { name: "ChevronsUpDown", Comp: ChevronsUpDown },
  { name: "Envelope", Comp: Envelope },
  { name: "Diamond", Comp: Diamond },
  { name: "Logo", Comp: Logo },
  { name: "Check", Comp: Check },
  { name: "Lock", Comp: Lock },
  { name: "Info", Comp: Info },
  { name: "PlusSquare", Comp: PlusSquare },
  { name: "Magnifier", Comp: Magnifier },
  // 5.10's settings-row set. All 24-grid/1.7 except the two noted at their definitions.
  { name: "Gear", Comp: Gear },
  { name: "ChevronRight", Comp: ChevronRight },
  { name: "ChevronDown", Comp: ChevronDown },
  { name: "Person", Comp: Person },
  { name: "PersonPlus", Comp: PersonPlus },
  { name: "FeedLines", Comp: FeedLines },
  { name: "Mute", Comp: Mute },
  { name: "Rays", Comp: Rays },
  { name: "Photo", Comp: Photo },
  { name: "Bell", Comp: Bell },
  { name: "Contrast", Comp: Contrast },
  { name: "Globe", Comp: Globe },
  { name: "ChatBubble", Comp: ChatBubble },
  { name: "Plus", Comp: Plus },
] as const;

/** One labelled block. The heading is the Geist Mono eyebrow the 1b design uses for every label. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  /** Muted line under the title — what this section is / which task restyles it. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-ink/14 flex flex-col gap-4 border-t pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-eyebrow text-ink/55 font-mono tracking-[0.4px] uppercase">
          {title}
        </h2>
        {note ? <p className="text-ink/48 text-xs">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The flag every primitive section carries until its Phase 2 task lands. Greppable on purpose:
 * `grep -rn "Placeholder —" src/app/dev/tokens` is the list of sections still to fill. The accent
 * dot is job 1 of the seven (DESIGN §3.2) — "attention".
 */
function Placeholder({
  task,
  what,
  verb = "restyled in",
}: {
  task: string;
  what: string;
  /** "restyled in" for an existing primitive; "built in" / "deleted in" for the others. */
  verb?: string;
}) {
  return (
    <p className="text-eyebrow text-ink/55 flex items-center gap-2 font-mono tracking-[0.4px] uppercase">
      <span className="bg-accent inline-block size-[6px] shrink-0 rounded-full" />
      Placeholder — {verb} Task {task} ({what})
    </p>
  );
}

/** A small caption under a swatch. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-eyebrow text-ink/48 w-28 font-mono tracking-[0.4px]">
      {children}
    </span>
  );
}

export default function TokensPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [selectedChips, setSelectedChips] = React.useState<Set<string>>(
    () => new Set(["Painting"]),
  );
  const [segment, setSegment] = React.useState<
    "little" | "some" | "lot" | "off"
  >("off");
  const [amount, setAmount] = React.useState<
    "none" | "little" | "some" | "lot"
  >("some");
  const [toastOpen, setToastOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [backboneToast, setBackboneToast] = React.useState<string | null>(null);
  // Bumping this remounts the motion demos, which is what replays a CSS animation.
  const [motionKey, setMotionKey] = React.useState(0);

  return (
    <div className="bg-bg text-ink min-h-screen pb-32">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-5 pt-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-display text-ink font-sans">
            Ambit — 1b style guide
          </h1>
          <p className="text-body text-ink/68 italic">
            Black and white, one accent, no radius. Tokens first (final), then
            the primitives (still the old ones until Phase 2).
          </p>
        </header>

        {/* ------------------------------------------------------------------ TOKENS */}

        <Section
          title="Surfaces"
          note="Opaque fills. Each is labelled: class · hex (DESIGN §3.1) · where it is used."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SURFACES.map((s) => (
              <div key={s.cls} className="flex flex-col gap-2">
                {/* The swatch sits on bg-ink/5 so even #0A0A0A-ish fills read against the page. */}
                <div
                  className={`border-hairline border-ink/22 h-16 border ${s.cls}`}
                />
                <span className="text-eyebrow text-ink/78 font-mono">
                  {s.cls}
                </span>
                <span className="text-eyebrow text-ink/48 font-mono">
                  {s.hex} · {s.use}
                </span>
              </div>
            ))}
            {/* Scrim is never opaque: it is #000 at 60 %, with no blur. Shown over a stripe so
                the see-through is visible. `--color-overlay` (the old toast fill) is removed by
                the spec; it is listed so nobody wonders where it went. */}
            <div className="flex flex-col gap-2">
              <div className="border-hairline border-ink/22 bg-ink/30 relative h-16 overflow-hidden border">
                <div className="bg-scrim/60 absolute inset-0" />
              </div>
              <span className="text-eyebrow text-ink/78 font-mono">
                bg-scrim/60
              </span>
              <span className="text-eyebrow text-ink/48 font-mono">
                #000 at 60%, no blur · sheet + modal scrims
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="border-hairline border-ink/22 bg-overlay h-16 border" />
              <span className="text-eyebrow text-ink/78 font-mono">
                bg-overlay
              </span>
              <span className="text-eyebrow text-ink/48 font-mono">
                REMOVED by the spec — goes with the toast rewrite (Task 2.x)
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Ink ladder — text"
          note="The package names nine greys; the app writes them as ink at an alpha. Same ladder, two spellings."
        >
          <div className="flex flex-col gap-2">
            {INK_LADDER.map((row) => (
              <div
                key={row.pkg}
                className="grid grid-cols-[88px_1fr] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[88px_88px_130px_1fr]"
              >
                <span className="text-eyebrow text-ink/78 font-mono">
                  {row.pkg}
                </span>
                <span className="text-eyebrow text-ink/48 font-mono">
                  {row.hex}
                </span>
                <span className="text-eyebrow text-ink/48 font-mono">
                  {row.cls}
                </span>
                <span className={`text-lg ${row.cls}`}>Ambit — {row.use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Lines"
          note="1 px hairlines (.border-hairline is 1 px now). White at 8–35 %, written border-ink/NN."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {LINES.map((l) => (
              <div key={l.pkg} className="flex flex-col gap-2">
                <div className={`border-hairline h-12 border ${l.cls}`} />
                <span className="text-eyebrow text-ink/78 font-mono">
                  {l.pkg}
                </span>
                <span className="text-eyebrow text-ink/48 font-mono">
                  {l.alpha} · {l.cls}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* The accent has seven jobs (DESIGN §3.2) and ONLY those. The default button is white,
            not green; eyebrows, links, selected chips and the loader are ink. Each job below is
            a live example built from the real classes. */}
        <Section
          title="Accent — #2BB24C, seven jobs"
          note="bg-accent / text-accent / border-accent / outline-focus-ring. Everything else is ink. on-accent (#0E0E0E, 6.97 : 1) is the text colour when something IS filled green — never white on green."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                1 · the 6 px dot
              </span>
              <div className="flex flex-col gap-2">
                {[
                  "Because you saved a painting",
                  "Invite-only",
                  "Current collection",
                ].map((t) => (
                  <div
                    key={t}
                    className="text-ink/78 flex items-center gap-2 text-sm"
                  >
                    <span className="bg-accent inline-block size-[6px] shrink-0 rounded-full" />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                2 · progress tick, compass marker
              </span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-[2px] flex-1 ${i === 2 ? "bg-accent" : i < 2 ? "bg-ink/62" : "bg-ink/22"}`}
                  />
                ))}
              </div>
              <span className="text-ink/48 text-xs">
                Only the current step is green; passed steps are ink.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                3 · keyboard focus ring
              </span>
              {/* No ring class here: the ring is the base :focus-visible rule (Task 1.4). Tab
                  onto this and it appears — 2 px, offset 3 px. */}
              <button
                type="button"
                className="border-ink/35 self-start border px-4 py-2 text-sm"
              >
                Tab to me
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                4 · hover underline (inset 2 px)
              </span>
              <button
                type="button"
                className="border-ink/35 text-ink/78 self-start border px-4 py-2 text-sm transition-shadow duration-150 hover:text-white hover:shadow-[inset_0_-2px_0_var(--color-accent)]"
              >
                Hover me
              </button>
              <a
                href="#hover-link"
                className="text-ink/78 decoration-ink/40 hover:decoration-accent self-start text-sm underline underline-offset-[3px] hover:text-white"
              >
                A link, underline turns green
              </a>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                5 · saved bookmark fill
              </span>
              <div className="flex items-center gap-4">
                <Bookmark size={22} className="text-ink/78" />
                <Bookmark size={22} filled className="text-accent" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                6 · the &quot;Proposed&quot; tag
              </span>
              <span className="text-eyebrow text-accent border-accent self-start border px-2 py-[3px] font-mono tracking-[0.4px] uppercase">
                Proposed
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-eyebrow text-ink/48 font-mono">
                7 · input focus underline, inline error hint
              </span>
              <input
                aria-label="Focus me for the green underline"
                placeholder="Click to focus — the underline turns green"
                className="border-ink/28 focus:border-accent text-body placeholder:text-ink/34 border-0 border-b bg-transparent py-2 outline-none"
              />
              <span className="text-eyebrow text-accent font-mono tracking-[0.4px]">
                That email isn&apos;t on the invite list.
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Type — Hanken Grotesk (sans) and Geist Mono"
          note="Titles are regular weight, sentence case, tight tracking. Italic marks a secondary half-sentence. Mono is for eyebrows, labels, counts and meta: uppercase, 9.5–12 px, +0.4 px."
        >
          <div className="flex flex-col gap-4">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.cls}
                className="grid gap-x-6 gap-y-1 sm:grid-cols-[180px_1fr] sm:items-baseline"
              >
                <span className="text-eyebrow text-ink/48 font-mono">
                  {t.cls} · {t.spec}
                  <br />
                  {t.where}
                </span>
                <span className={`${t.cls} text-ink font-sans`}>
                  A quieter way to be curious.
                </span>
              </div>
            ))}
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <span className="text-eyebrow text-ink/48 font-mono">
                italic 400
                <br />
                the secondary half-sentence
              </span>
              <span className="text-body text-ink/68 font-sans italic">
                Mostly photography and scientific drawing.
              </span>
            </div>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <span className="text-eyebrow text-ink/48 font-mono">
                text-eyebrow · 10.5 mono
                <br />+ uppercase + 0.4 px (the component adds the last two)
              </span>
              <span className="text-eyebrow text-ink/55 font-mono tracking-[0.4px] uppercase">
                The Metropolitan Museum · 1887 · 4 saved
              </span>
            </div>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[180px_1fr] sm:items-baseline">
              <span className="text-eyebrow text-ink/48 font-mono">
                font-mono 400 / 500
                <br />
                counts and meta
              </span>
              <span className="text-ink/78 font-mono text-sm">
                0123456789 — 12 items · 3 collections
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Shape & elevation"
          note="Radius is 0 everywhere except the nav pill and circular things. Shadows: lift, dialog, popover, toolbar — the sheet, toast and banner shadows go with their rewrites."
        >
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-2">
              <div className="border-hairline border-ink/22 bg-card h-14 w-24 border" />
              <Caption>square — every card, sheet, input, tile</Caption>
            </div>
            <div className="flex flex-col gap-2">
              {/* A square box that only names the pill: the real pill lives in the two nav-toolbar files, which
                  are the guard's allow-list, so this page doesn't draw one. */}
              <div className="border-hairline border-ink/22 bg-card text-eyebrow text-ink/55 flex h-14 w-24 items-center justify-center border font-mono">
                pill = the nav only
              </div>
              <Caption>
                --radius-pill: 999px (ui/pill-toolbar, ui/rail-toolbar)
              </Caption>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            {[
              {
                cls: "shadow-lift",
                label: "lift — a hovered feed tile (0 14 34 / .45)",
              },
              {
                cls: "shadow-popover",
                label: "popover — anchored menu (0 20 50 / .50)",
              },
              {
                cls: "shadow-dialog",
                label: "dialog — centred desktop (0 30 80 / .60)",
              },
              {
                cls: "shadow-toolbar",
                label: "toolbar — the nav pill (0 10 30 / .28)",
              },
            ].map((s) => (
              <div key={s.cls} className="flex flex-col gap-2">
                <div className={`bg-surface h-14 w-24 ${s.cls}`} />
                <Caption>{s.label}</Caption>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Focus"
          note="One base :focus-visible rule gives every control a 2 px accent ring, offset 3 px (2 px inside a segmented control, inset −2 px on feed tiles). Tab through these."
        >
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="border-ink/35 border px-4 py-2 text-sm"
            >
              A button
            </button>
            <a
              href="#focus-link"
              className="text-ink/78 text-sm underline underline-offset-[3px]"
            >
              A link
            </a>
            <input
              aria-label="A text field"
              placeholder="A text field"
              className="border-ink/28 text-body placeholder:text-ink/34 border-0 border-b bg-transparent py-2"
            />
          </div>
        </Section>

        <Section title="Icons" note="24-grid, 1.7 stroke, currentColor.">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-10">
            {ICONS.map(({ name, Comp }) => (
              <div
                key={name}
                className="border-hairline border-ink/12 flex flex-col items-center gap-2 border py-4"
              >
                <Comp size={20} className="text-ink/78" />
                <span className="text-eyebrow text-ink/48 px-1 text-center font-mono">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------- PRIMITIVES */}
        {/* Every section below renders the primitive AS IT IS TODAY (Phase 1: tokens re-toned,
            shapes not yet rewritten). The label names the task that replaces it; that task fills
            in the real rest / hover / focus / pressed / disabled / selected table from
            DESIGN §4. */}

        <Section
          title="Button"
          note="DESIGN §4.1: primary / outline / link × lg / md / sm; states rest, hover, pressed, disabled."
        >
          {/* Hover / pressed can't be forced from a stylesheet, so these are live: point at them,
              Tab to them, hold them down. The disabled column is the only static state. */}
          {(["primary", "outline", "link"] as const).map((variant) => (
            <div
              key={variant}
              className="mb-4 flex flex-wrap items-center gap-3"
            >
              <span className="text-ink/62 w-16 font-mono text-[10.5px] uppercase">
                {variant}
              </span>
              <Button variant={variant} size="lg">
                Large 56
              </Button>
              <Button variant={variant}>Medium 46</Button>
              <Button variant={variant} size="sm">
                Small
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
            </div>
          ))}
        </Section>

        <Section
          title="Chip"
          note="DESIGN §4: rest, hover, focus, pressed, selected. Tap one to toggle."
        >
          <div className="flex flex-wrap gap-2">
            {["Painting", "Photography", "Architecture", "Nature"].map(
              (label) => (
                <Chip
                  key={label}
                  selected={selectedChips.has(label)}
                  onClick={() =>
                    setSelectedChips((prev) => {
                      const next = new Set(prev);
                      if (next.has(label)) next.delete(label);
                      else next.add(label);
                      return next;
                    })
                  }
                >
                  {label}
                </Chip>
              ),
            )}
          </div>
          {/* Saved's filter size, and a pressed one beside a resting one for the static states. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip size="sm">All · 12</Chip>
            <Chip size="sm" selected>
              Favourites · 4
            </Chip>
          </div>
        </Section>

        <Section
          title="Segmented"
          note="DESIGN §4.3: a radiogroup of joined cells — rest, hover (green underline), selected, selected off. Tab onto it, then use the arrow keys."
        >
          {/* The reading amount: arrows move the selection, one Tab stop for the whole group. */}
          <Segmented
            label="Reading amount"
            options={[
              { key: "none", label: "None" },
              { key: "little", label: "A little" },
              { key: "some", label: "Some" },
              { key: "lot", label: "A lot" },
            ]}
            value={amount}
            onChange={setAmount}
          />
          {/* A topic's level: choose "off" and the selected cell turns the quiet #2A2A2A. */}
          <div className="mt-4">
            <Segmented
              label="Level"
              options={[
                { key: "little", label: "a little" },
                { key: "some", label: "some" },
                { key: "lot", label: "a lot" },
                { key: "off", label: "off", tone: "muted" },
              ]}
              value={segment}
              onChange={setSegment}
            />
          </div>
        </Section>

        <Section
          title="Input"
          note="DESIGN §4.4: underline input inside a Field — rest, hover, focus (green underline, 2 px), hint, error, disabled, and the lg size. Tab through them."
        >
          <div className="grid max-w-xl gap-6">
            <Field label="Email">
              <Input placeholder="you@example.com" />
            </Field>
            <Field label="Password" hint="Needs 8+ characters">
              <Input type="password" defaultValue="short" />
            </Field>
            <Field label="Handle" error="That handle is taken">
              <Input defaultValue="@ben" />
            </Field>
            <Field label="Email (read-only, disabled)">
              <Input disabled defaultValue="ben@example.com" />
            </Field>
            <Field label="Name — lg, the profile's desktop size">
              <Input size="lg" placeholder="Your name" />
            </Field>
            <Field label="About">
              <Textarea placeholder="What are you curious about?" />
            </Field>
          </div>
        </Section>

        <Section
          title="IconButton"
          note="Rest, hover, focus, pressed; plain and glass (on a photograph)."
        >
          <Placeholder task="2.6" what="circular, ink fills" />
          <div className="flex flex-wrap items-center gap-3">
            <IconButton size={28} aria-label="Close">
              <Close size={13} />
            </IconButton>
            <IconButton size={34} aria-label="Bookmark">
              <Bookmark size={13} />
            </IconButton>
            <IconButton size={42} aria-label="Share">
              <Share size={15} />
            </IconButton>
            <div className="bg-ink/9 p-4">
              <IconButton size={42} glass aria-label="Save (glass)">
                <Bookmark size={13} filled className="text-accent" />
              </IconButton>
            </div>
          </div>
        </Section>

        <Section
          title="Card"
          note="Not restyled: the primitive is deleted in Task 2.8 and its call sites become plain bordered elements on --color-card."
        >
          <Placeholder
            task="2.8"
            verb="deleted in"
            what="call sites become plain bordered elements"
          />
          <div className="flex flex-wrap gap-4">
            <Card className="text-ink/78 w-56 p-5 text-sm">
              radius=&quot;card&quot; — feed article card
            </Card>
            <Card radius="tile" className="text-ink/62 w-56 p-5 text-xs">
              radius=&quot;tile&quot; — saved tile
            </Card>
          </div>
        </Section>

        <Section
          title="Eyebrow / TextLink"
          note="DESIGN §4: the mono label and the underlined link, as primitives. Neither exists yet."
        >
          <Placeholder task="2.7" verb="built in" what="Eyebrow and TextLink" />
        </Section>

        <Section
          title="Loader"
          note="The Reach loader: ring, orbiting dot. Its ring becomes ink in 1b (the accent keeps only the seven jobs)."
        >
          <Placeholder task="2.6" what="ink ring, accent dot" />
          <div className="flex flex-wrap items-center gap-6">
            <Loader size={LOADER_SIZES.inline} />
            <Loader size={LOADER_SIZES.block} />
            <Loader size={LOADER_SIZES.hero} />
            <Loader label="finding something interesting…" />
          </div>
        </Section>

        <Section
          title="Toast"
          note="Today an ink-glass pill; DESIGN §4 makes it a white block."
        >
          <Placeholder task="2.6" what="white block toast" />
          <Button variant="outline" onClick={() => setToastOpen(true)}>
            Show toast
          </Button>
        </Section>

        <Section
          title="BottomSheet"
          note="Today a rounded sheet / 520 px dialog / popover; DESIGN §4 squares them and gives each a top border instead of a shadow."
        >
          <Placeholder task="2.5" what="square sheet, dialog, popover" />
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
        </Section>

        {/* ---------------------------------------------------------------- MOTION */}
        <Section
          title="Motion"
          note="Easings are unchanged from 1a. Replay re-mounts the demos so the CSS animations run again."
        >
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-2">
              <div className="h-20 w-28 overflow-hidden">
                <div
                  key={`sheet-${motionKey}`}
                  className="animate-sheet-up bg-surface border-hairline border-ink/16 h-full w-full border-t"
                />
              </div>
              <Caption>animate-sheet-up · 240 ms ease-sheet</Caption>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-20 w-28 overflow-hidden">
                <div
                  key={`gallery-${motionKey}`}
                  className="animate-sheet-gallery bg-surface border-hairline border-ink/16 h-full w-full border-t"
                />
              </div>
              <Caption>animate-sheet-gallery · 400 ms ease-settle</Caption>
            </div>
            <div className="flex flex-col gap-2">
              <div
                key={`rise-${motionKey}`}
                className="animate-rise bg-card border-hairline border-ink/12 h-20 w-28 border"
              />
              <Caption>animate-rise · 600 ms</Caption>
            </div>
            <Button
              variant="outline"
              onClick={() => setMotionKey((k) => k + 1)}
            >
              Replay
            </Button>
          </div>
        </Section>

        <BackboneSection onToast={setBackboneToast} />
      </div>

      <Toast
        text="Saved to your library"
        open={toastOpen}
        onDone={() => setToastOpen(false)}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Detail sheet"
      >
        {/* The shell carries no horizontal padding of its own (5.5) so the collection sheets can
            scroll their rows edge to edge — free-form content supplies its own. */}
        <div className="px-[26px] pb-4">
          <p className="text-body text-ink/72">
            Scrim + panel + grabber + centered title, in on the 240 ms{" "}
            <code>--ease-sheet</code> curve and out again on{" "}
            <code>sheet-down</code>.
          </p>
        </div>
      </BottomSheet>

      {/* `raised` because BackboneSection mounts the pill — an unraised toast would sit under it. */}
      <Toast
        text={backboneToast ?? ""}
        open={backboneToast !== null}
        onDone={() => setBackboneToast(null)}
        raised
      />
    </div>
  );
}

/**
 * Phase 5.5's backbone, demoed against the **real router** — the pill, both collection sheets, the
 * share sheet, and `usePress`. This is the phase's acceptance surface: everything here writes to
 * Postgres, so a pick that toasts and survives a reload is the proof the backend works.
 */
function BackboneSection({ onToast }: { onToast: (text: string) => void }) {
  const [bookmark, setBookmark] = React.useState<BookmarkState>("idle");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [pressLog, setPressLog] = React.useState("waiting…");
  const [currentCollectionId, setCurrentCollectionId] = React.useState<
    string | undefined
  >();

  // The demo needs one real item to save. Getting it is fussier than it looks, because
  // **`feed.page` writes**: `getFeedPage` calls `markSeen` unconditionally, and `seen_item` has no
  // TTL or pruning (a deliberate Phase 4.1 decision — it's what backs the feed's "almost never
  // repeats" promise). Calling it on mount, as this demo first did, meant every visit to the style
  // guide burned a page of items out of the signed-in user's feed *permanently* — and with the
  // 30s `staleTime` and React Query's default `refetchOnWindowFocus`, merely tabbing back burned
  // another. Opening a style guide must not consume the corpus.
  //
  // So: prefer an item the user has already saved (`saves.list` is a pure read), and fall back to
  // borrowing one from the feed only when the user explicitly asks — with the cost spelled out on
  // the button.
  const saved = api.saves.list.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [borrowFromFeed, setBorrowFromFeed] = React.useState(false);
  const feed = api.feed.page.useQuery(
    {},
    {
      enabled: borrowFromFeed,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
  const demoItem = saved.data?.[0] ?? feed.data?.cards[0]?.item;

  const press = usePress({
    onTap: () => setPressLog("tapped"),
    onLongPress: () => setPressLog("long-pressed"),
  });

  // Everything below is a protected procedure, and this page has never needed a session before —
  // so an anonymous visit would fail every control here with an opaque UNAUTHORIZED. Say so
  // instead.
  if (
    saved.error?.data?.code === "UNAUTHORIZED" ||
    feed.error?.data?.code === "UNAUTHORIZED"
  ) {
    return (
      <Section title="Backbone (5.5)">
        <p className="text-ink/60 text-[14px] leading-[1.6]">
          Sign in at <code>/</code> to demo the backbone against the real router
          — the pill, the sheets and the collections backend are all behind{" "}
          <code>protectedProcedure</code>.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Backbone (5.5)">
      <div className="flex flex-wrap gap-2">
        {(["idle", "saved", "on-saved"] as const).map((state) => (
          <Chip
            key={state}
            selected={bookmark === state}
            onClick={() => setBookmark(state)}
          >
            {state}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setBrowseOpen(true)}>
          Collections sheet
        </Button>
        <Button
          variant="outline"
          disabled={!demoItem}
          onClick={() => setSaveOpen(true)}
        >
          Save sheet
        </Button>
        <Button
          variant="outline"
          // Same guard as Save: ShareSheet is only mounted once there's an item, so an enabled
          // button here just set state on an unmounted component and appeared to do nothing.
          disabled={!demoItem}
          onClick={() => setShareOpen(true)}
        >
          Share sheet
        </Button>
        {/* Stays visible while there's no item, not just before the first attempt: the feed query
            is `retry: false`, so a failed or empty borrow would otherwise leave the section with no
            item and no way to try again short of a reload. */}
        {!demoItem ? (
          <Button
            variant="outline"
            disabled={feed.isFetching}
            onClick={() => {
              if (borrowFromFeed) void feed.refetch();
              else setBorrowFromFeed(true);
            }}
          >
            {feed.isFetching
              ? "Borrowing…"
              : feed.isError
                ? "Borrow failed — try again"
                : "Borrow an item from the feed (consumes one page)"}
          </Button>
        ) : null}
      </div>

      <p className="text-ink/40 text-[12px]">
        {demoItem
          ? `Demo item: ${demoItem.title}`
          : saved.isLoading || feed.isLoading
            ? "Finding an item…"
            : "No saved item yet — borrow one from the feed to demo the save sheet."}
      </p>

      <div
        {...press}
        className="border-hairline border-ink/12 bg-ink/5 flex h-24 touch-manipulation items-center justify-center select-none"
        style={{ WebkitTouchCallout: "none" }}
      >
        <span className="text-ink/60 text-[14px]">usePress: {pressLog}</span>
      </div>

      <PillToolbar
        bookmark={bookmark}
        onBookmark={() => (demoItem ? setSaveOpen(true) : setBrowseOpen(true))}
        onShare={() =>
          demoItem ? setShareOpen(true) : onToast("No demo item loaded yet")
        }
        onHome={() => onToast("Feed is 5.6")}
      />

      <CollectionsSheet
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
      />

      {demoItem ? (
        <>
          <SaveToCollectionSheet
            open={saveOpen}
            onClose={() => setSaveOpen(false)}
            itemId={demoItem.id}
            currentCollectionId={currentCollectionId}
            onSaved={(collection, drift) => {
              setBookmark("saved");
              setCurrentCollectionId(collection.id);
              onToast(saveToastText(collection.name, drift));
            }}
            onError={onToast}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            url={`${typeof window === "undefined" ? "" : window.location.origin}/i/${demoItem.id}`}
            title={demoItem.title}
            onCopied={(url) => onToast(`Link copied · ${url}`)}
            onShareUnavailable={() =>
              onToast("Sharing isn't available on this device")
            }
          />
        </>
      ) : null}
    </Section>
  );
}
