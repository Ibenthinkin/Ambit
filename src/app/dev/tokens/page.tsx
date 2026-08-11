"use client";

import * as React from "react";
import { notFound } from "next/navigation";

import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  Close,
  Diamond,
  Envelope,
  Info,
  Lock,
  Logo,
  PlusSquare,
  Share,
} from "~/components/icons";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Chip } from "~/components/ui/chip";
import { GlassHeader } from "~/components/ui/glass-header";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Segmented } from "~/components/ui/segmented";
import { Spinner } from "~/components/ui/spinner";
import { Toast } from "~/components/ui/toast";

// The Phase 5.1 proof page (PHASE5_PLAN.md Step 6): every token, icon, and primitive in one
// place, with a live accent switcher, so the whole design system can be checked against
// docs/design_handoff_ambit_pwa/screenshots/ without having to build a real screen first. This
// is the "Done =" gate for 5.1 — if something here doesn't match the handoff, it'll be wrong on
// every screen that consumes it later.
//
// `src/proxy.ts` only gates `/feed`, `/saved`, `/onboarding` — a `/dev/*` route would otherwise
// be reachable in production. Since this is a plain client component (no DB, no tRPC, so it
// can't leak data), the guard is just this early `notFound()` rather than an auth check.
const ACCENTS = [
  { key: "gold", label: "Gold", hex: "#BFA06A" },
  { key: "sage", label: "Sage", hex: "#8FA786" },
  { key: "slate", label: "Slate", hex: "#7E93AD" },
  { key: "terracotta", label: "Terracotta", hex: "#C08262" },
] as const;
type AccentKey = (typeof ACCENTS)[number]["key"];

// The alpha ladder from PHASE5_PLAN.md Step 2 / SPEC §10 — the whole muted-text/hairline/fill
// system, reproduced here as swatches instead of prose so a mismatch against the prototypes is
// visible at a glance.
const TEXT_LADDER = [
  {
    cls: "text-ink",
    label: "Primary text",
    note: "headlines, wordmark, toast",
  },
  {
    cls: "text-ink/82",
    label: "Secondary text",
    note: "chip labels (unselected)",
  },
  { cls: "text-ink/62", label: "Body / muted", note: "secondary copy, meta" },
  {
    cls: "text-ink/55",
    label: "Meta / attribution",
    note: "source lines, captions",
  },
  { cls: "text-ink/40", label: "Faint label", note: "eyebrows, loader label" },
  { cls: "text-ink/38", label: "Disabled", note: "inactive CTA text" },
] as const;

const BORDER_LADDER = [
  {
    cls: "border-ink/16",
    label: "Hairline strong",
    note: "glass buttons on imagery",
  },
  {
    cls: "border-ink/12",
    label: "Hairline default",
    note: "sheets, toasts, chips",
  },
  { cls: "border-ink/8", label: "Hairline faint", note: "cards, headers" },
] as const;

const FILL_LADDER = [
  { cls: "bg-ink/9", label: "Fill raised", note: "chrome buttons" },
  { cls: "bg-ink/5", label: "Fill default", note: "chips, ghost buttons" },
  { cls: "bg-ink/3", label: "Fill subtle", note: "cards, tiles" },
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
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-ink/8 flex flex-col gap-4 border-t-[0.5px] pt-8">
      <h2 className="text-ink/40 font-sans text-[11px] font-semibold tracking-[0.6px] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function TokensPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [accent, setAccent] = React.useState<AccentKey>("gold");
  const [selectedChips, setSelectedChips] = React.useState<Set<string>>(
    () => new Set(["Painting"]),
  );
  const [segment, setSegment] = React.useState<"all" | "reading">("all");
  const [toastOpen, setToastOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // The accent knob is a `data-accent` attribute on <html> (see globals.css's `@layer base` and
  // src/app/layout.tsx). Setting it here on the real document element — not a wrapper div — is
  // the actual mechanism under test: every `bg-accent`/`text-accent`/etc. utility on this page
  // should re-resolve live when this switches, no rebuild or reload.
  React.useEffect(() => {
    document.documentElement.dataset.accent = accent;
    return () => {
      document.documentElement.dataset.accent = "gold";
    };
  }, [accent]);

  return (
    <div className="bg-bg text-ink min-h-screen pb-32">
      <GlassHeader>
        <span className="text-ink font-serif text-[28px] leading-none font-medium tracking-[0.2px] italic">
          Ambit
        </span>
        <IconButton aria-label="Bookmark">
          <Bookmark size={13} />
        </IconButton>
      </GlassHeader>

      <div className="flex flex-col gap-10 px-5 pt-8">
        <Section title="Accent">
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAccent(a.key)}
                className="border-hairline rounded-pill border-ink/12 bg-ink/5 text-ink/82 flex items-center gap-2 border py-2 pr-4 pl-2 font-sans text-[13px]"
              >
                <span
                  className="border-hairline border-ink/16 h-5 w-5 rounded-full border"
                  style={{ background: a.hex }}
                />
                {a.label}
                {accent === a.key && (
                  <Check size={14} className="text-accent" />
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="flex flex-col gap-3">
            <p className="text-ink font-serif text-[28px] leading-none font-medium italic">
              Ambit — wordmark (Newsreader italic 500, 28px)
            </p>
            <p className="text-ink font-serif text-[25px] leading-[1.18]">
              Sheet / gallery title (Newsreader 25px)
            </p>
            <p className="text-ink font-serif text-[19px] leading-[1.3]">
              Card title (Newsreader 19px)
            </p>
            <p className="text-ink/82 font-serif text-[16px] leading-[1.45]">
              Body serif — sheet fact values, gallery detail (Newsreader 16px)
            </p>
            <p className="text-ink font-sans text-[15.5px] font-semibold">
              CTA label (system sans 15.5px, semibold)
            </p>
            <p className="text-ink/62 font-sans text-[13px]">
              Toast / meta text (system sans 13px)
            </p>
            <p className="text-ink/40 font-sans text-[11px] tracking-[0.6px] uppercase">
              Eyebrow label (system sans 11px, uppercase)
            </p>
          </div>
        </Section>

        <Section title="Alpha ladder — text">
          <div className="flex flex-col gap-2">
            {TEXT_LADDER.map((row) => (
              <div key={row.cls} className="flex items-baseline gap-4">
                <span
                  className={`w-40 shrink-0 font-sans text-[15px] ${row.cls}`}
                >
                  Ambit
                </span>
                <span className="text-ink/40 font-sans text-[12px]">
                  {row.cls} — {row.label} ({row.note})
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Alpha ladder — border & fill">
          <div className="flex flex-wrap gap-3">
            {BORDER_LADDER.map((row) => (
              <div key={row.cls} className="flex flex-col items-center gap-2">
                <div
                  className={`border-hairline rounded-card bg-ink/3 h-14 w-14 border ${row.cls}`}
                />
                <span className="text-ink/40 w-24 text-center font-sans text-[10.5px]">
                  {row.cls}
                </span>
              </div>
            ))}
            {FILL_LADDER.map((row) => (
              <div key={row.cls} className="flex flex-col items-center gap-2">
                <div
                  className={`border-hairline rounded-card border-ink/8 h-14 w-14 border ${row.cls}`}
                />
                <span className="text-ink/40 w-24 text-center font-sans text-[10.5px]">
                  {row.cls}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Icons">
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-6">
            {ICONS.map(({ name, Comp }) => (
              <div
                key={name}
                className="border-hairline rounded-card border-ink/8 bg-ink/3 flex flex-col items-center gap-2 border py-4"
              >
                <Comp size={20} className="text-ink/82" />
                <span className="text-ink/40 px-1 text-center font-sans text-[10px]">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" shape="pill">
              Start exploring
            </Button>
            <Button variant="accent" shape="pill" disabled>
              Pick 2 more
            </Button>
            <Button variant="ghost" shape="pill">
              Maybe later
            </Button>
            <Button
              variant="accent"
              shape="rounded"
              size="lg"
              className="w-full sm:w-auto"
            >
              Continue
            </Button>
          </div>
        </Section>

        <Section title="Chip">
          <div className="flex flex-wrap gap-2">
            {["Painting", "Photography", "Architecture", "Nature"].map(
              (label) => {
                const selected = selectedChips.has(label);
                return (
                  <Chip
                    key={label}
                    selected={selected}
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
                );
              },
            )}
            <Chip serif={false} selected>
              Sans chip
            </Chip>
          </div>
        </Section>

        <Section title="IconButton">
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
            <div className="rounded-tile bg-ink/9 p-4">
              <IconButton size={42} glass aria-label="Save (glass)">
                <Bookmark size={13} filled className="text-accent" />
              </IconButton>
            </div>
          </div>
        </Section>

        <Section title="Card">
          <div className="flex flex-wrap gap-4">
            <Card className="text-ink/82 w-56 p-5 font-serif text-[16px]">
              radius=&quot;card&quot; (22px) — feed article card
            </Card>
            <Card
              radius="tile"
              className="text-ink/62 w-56 p-5 font-sans text-[13px]"
            >
              radius=&quot;tile&quot; (18px) — saved tile
            </Card>
          </div>
        </Section>

        <Section title="Segmented">
          <Segmented
            options={[
              { key: "all", label: "All" },
              { key: "reading", label: "Reading · 3" },
            ]}
            value={segment}
            onChange={setSegment}
          />
        </Section>

        <Section title="Input">
          <Input placeholder="you@example.com" className="max-w-xs" />
        </Section>

        <Section title="Spinner">
          <div className="flex items-center gap-4">
            <Spinner size={16} />
            <Spinner size={24} />
          </div>
        </Section>

        <Section title="Rise">
          <p className="text-ink/40 font-sans text-[12px]">
            Reload the page — this card fades/rises in on mount via the shared{" "}
            <code>animate-rise</code> utility.
          </p>
        </Section>

        <Section title="Toast">
          <Button
            variant="ghost"
            shape="pill"
            onClick={() => setToastOpen(true)}
          >
            Show toast
          </Button>
        </Section>

        <Section title="BottomSheet">
          <Button
            variant="ghost"
            shape="pill"
            onClick={() => setSheetOpen(true)}
          >
            Open sheet
          </Button>
        </Section>
      </div>

      <Toast
        text="Saved to your library"
        open={toastOpen}
        onDone={() => setToastOpen(false)}
      />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <div className="text-ink font-serif text-[25px] leading-[1.18]">
          Detail sheet
        </div>
        <p className="text-ink/72 mt-3 font-serif text-[15.5px] leading-[1.6]">
          BottomSheet renders scrim + panel + grabber. Drag-to-close is
          5.5&apos;s job.
        </p>
      </BottomSheet>
    </div>
  );
}
