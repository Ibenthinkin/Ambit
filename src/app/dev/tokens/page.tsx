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
import { CollectionsSheet } from "~/components/sheets/collections-sheet";
import { SaveToCollectionSheet } from "~/components/sheets/save-to-collection-sheet";
import { ShareSheet } from "~/components/sheets/share-sheet";
import { BottomSheet } from "~/components/ui/bottom-sheet";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Chip } from "~/components/ui/chip";
import { GlassHeader } from "~/components/ui/glass-header";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Segmented } from "~/components/ui/segmented";
import { Spinner } from "~/components/ui/spinner";
import { PillToolbar, type BookmarkState } from "~/components/ui/pill-toolbar";
import { Toast } from "~/components/ui/toast";
import { usePress } from "~/hooks/use-press";
import { api } from "~/trpc/react";

// The living style guide: every token, icon, and primitive in one place with a live accent
// switcher, so the design system can be checked whole without building a real screen first.
// Originally the Phase 5.1 proof page; re-pointed at the redesign handoff
// (docs/design_handoff_ambit_pwa_redesign/) in 5.4. If something here doesn't match the handoff,
// it'll be wrong on every screen that consumes it later.
//
// It also hosts the live demo of 5.5's backbone (pill toolbar, both collection sheets, the share
// sheet, `usePress`) wired to the REAL router — see `BackboneSection` at the bottom. One more job
// is coming: this is the INTERIM HOME OF SIGN-OUT from 5.6 (when /feed's placeholder is deleted)
// until Settings lands in 5.10.
//
// `src/proxy.ts` only gates `/feed`, `/saved`, `/onboarding` — a `/dev/*` route would otherwise
// be reachable in production, so the guard is this early `notFound()`. Note that as of 5.5 the
// page DOES reach tRPC (the backbone demo), but only through the same protected procedures a real
// screen uses, scoped to the signed-in user — there's nothing here an authed user couldn't
// already see.
//
// Accent hexes are duplicated here (they also live in globals.css's `@layer base`) because the
// swatch dots need the literal color to paint *before* the attribute is switched — a
// `bg-accent` swatch would show four identical dots.
const ACCENTS = [
  { key: "indigo", label: "Indigo", hex: "#4C5FE0" },
  { key: "amber", label: "Amber", hex: "#D9A73C" },
  { key: "green", label: "Green", hex: "#3FA35C" },
  { key: "red", label: "Red", hex: "#D9483F" },
] as const;
type AccentKey = (typeof ACCENTS)[number]["key"];

// The alpha ladder from PHASE5_PLAN.md Step 2 / SPEC §10 — the whole muted-text/hairline/fill
// system, reproduced here as swatches instead of prose so a mismatch against the prototypes is
// visible at a glance.
const TEXT_LADDER = [
  {
    cls: "text-ink-hi",
    label: "Title tier",
    note: "screen + item titles ONLY (#F5F1E7)",
  },
  {
    cls: "text-ink",
    label: "Primary text",
    note: "body, list labels, toast (#EFEBE0)",
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

  const [accent, setAccent] = React.useState<AccentKey>("indigo");
  const [selectedChips, setSelectedChips] = React.useState<Set<string>>(
    () => new Set(["Painting"]),
  );
  const [segment, setSegment] = React.useState<"all" | "reading">("all");
  const [toastOpen, setToastOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [backboneToast, setBackboneToast] = React.useState<string | null>(null);
  // Bumping this remounts the two motion demos, which is what replays a CSS animation.
  const [motionKey, setMotionKey] = React.useState(0);

  // The accent knob is a `data-accent` attribute on <html> (see globals.css's `@layer base` and
  // src/app/layout.tsx). Setting it here on the real document element — not a wrapper div — is
  // the actual mechanism under test: every `bg-accent`/`text-accent`/etc. utility on this page
  // should re-resolve live when this switches, no rebuild or reload.
  React.useEffect(() => {
    document.documentElement.dataset.accent = accent;
    return () => {
      document.documentElement.dataset.accent = "indigo";
    };
  }, [accent]);

  return (
    <div className="bg-bg text-ink min-h-screen pb-32">
      <GlassHeader>
        <span className="text-ink-hi text-[28px] leading-none font-semibold tracking-[-0.2px]">
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

        {/* Sora everywhere — the redesign has no second typeface. Sizes/weights are the rows of
            the handoff README's type table that the app actually uses today; the gallery/reader
            rows get added as those screens land. */}
        <Section title="Type scale — Sora">
          <div className="flex flex-col gap-3">
            <p className="text-ink-hi text-[28px] leading-[1.1] font-semibold tracking-[-0.2px]">
              Screen title / wordmark (600, 26–28px)
            </p>
            <p className="text-ink-hi text-[25px] leading-[1.18]">
              Detail-sheet title (400, 25px)
            </p>
            <p className="text-ink-hi text-[19px] leading-[1.25] font-semibold">
              Card / tile headline (600, 19–20px)
            </p>
            <p className="text-ink/82 text-[16px] leading-[1.72]">
              Body copy — reader paragraphs, sheet fact values (400, 16px/1.72)
            </p>
            <p className="text-ink/62 text-[13.5px] leading-[1.55]">
              Lede / secondary body (400, 13.5–17px)
            </p>
            <p className="text-ink font-semibold">
              CTA label (600, 15.5px, +0.2px tracking)
            </p>
            <p className="text-ink/55 text-[12.5px] tracking-[0.15px]">
              Metadata / maker line (400, 12.5px)
            </p>
            <p className="text-ink/40 text-[10px] font-semibold tracking-[1.3px] uppercase">
              Eyebrow / source label (600, 9.5–11px, uppercase)
            </p>
          </div>
        </Section>

        {/* Surfaces + elevation: the opaque fills and the four shadows, which the alpha ladder
            below deliberately doesn't cover (those are ink-over-bg, these are their own colors). */}
        <Section title="Surfaces & elevation">
          <div className="flex flex-wrap gap-3">
            {[
              { cls: "bg-bg", label: "bg — app" },
              { cls: "bg-surface", label: "surface — sheets" },
              { cls: "bg-immersive", label: "immersive — gallery" },
              { cls: "bg-overlay", label: "overlay — toast" },
            ].map((s) => (
              <div key={s.cls} className="flex flex-col items-center gap-2">
                <div
                  className={`border-hairline rounded-card border-ink/12 h-14 w-14 border ${s.cls}`}
                />
                <span className="text-ink/40 w-24 text-center text-[10.5px]">
                  {s.label}
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <div className="bg-avatar-gradient h-14 w-14 rounded-full" />
              <span className="text-ink/40 w-24 text-center text-[10.5px]">
                avatar gradient
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            {[
              { cls: "shadow-toast", label: "toast" },
              { cls: "shadow-banner", label: "banner" },
              { cls: "shadow-sheet", label: "sheet" },
              { cls: "shadow-toolbar", label: "toolbar (5.5)" },
            ].map((s) => (
              <div key={s.cls} className="flex flex-col items-center gap-2">
                <div className={`rounded-card bg-surface h-14 w-20 ${s.cls}`} />
                <span className="text-ink/40 w-24 text-center text-[10.5px]">
                  {s.label}
                </span>
              </div>
            ))}
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
            <Card className="text-ink/82 w-56 p-5 text-[16px]">
              radius=&quot;card&quot; (22px) — feed article card
            </Card>
            <Card radius="tile" className="text-ink/62 w-56 p-5 text-[13px]">
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
          <p className="text-ink/40 text-[12px]">
            Reload the page — this card fades/rises in on mount via the shared{" "}
            <code>animate-rise</code> utility.
          </p>
        </Section>

        {/* The two sheet curves side by side. They're easy to confuse in code and very distinct
            in motion: `sheet-up` is the short, snappy pill-sheet entrance used app-wide;
            `sheet-gallery` is the longer, further-travelling one reserved for the gallery's
            details modal (5.8). Replaying them together is the only reliable way to check the
            right one is wired to the right surface. */}
        <Section title="Motion — the two sheet curves">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="h-20 w-28 overflow-hidden">
                <div
                  key={`sheet-${motionKey}`}
                  className="animate-sheet-up bg-surface border-hairline border-ink/12 rounded-t-sheet h-full w-full border-t"
                />
              </div>
              <span className="text-ink/40 w-28 text-center text-[10.5px]">
                animate-sheet-up · 260ms ease-sheet
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-20 w-28 overflow-hidden">
                <div
                  key={`gallery-${motionKey}`}
                  className="animate-sheet-gallery bg-surface border-hairline border-ink/12 rounded-t-sheet h-full w-full border-t"
                />
              </div>
              <span className="text-ink/40 w-28 text-center text-[10.5px]">
                animate-sheet-gallery · 400ms ease-settle
              </span>
            </div>
            <Button
              variant="ghost"
              shape="pill"
              onClick={() => setMotionKey((k) => k + 1)}
            >
              Replay
            </Button>
          </div>
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
          <p className="text-ink/72 text-[15.5px] leading-[1.6]">
            Scrim + panel + grabber + centered title, in on the 260ms{" "}
            <code>--ease-sheet</code> curve and out again on{" "}
            <code>sheet-down</code>. Drag-to-close belongs to 5.8&apos;s gallery
            modal, not here.
          </p>
        </div>
      </BottomSheet>

      <Toast
        text={backboneToast ?? ""}
        open={backboneToast !== null}
        onDone={() => setBackboneToast(null)}
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

  // A real item to save, drawn the same way a real screen will draw one — no dev-only procedure.
  const feed = api.feed.page.useQuery({});
  const demoItem = feed.data?.cards[0]?.item;

  const press = usePress({
    onTap: () => setPressLog("tapped"),
    onLongPress: () => setPressLog("long-pressed"),
  });

  // Everything below is a protected procedure, and this page has never needed a session before —
  // so an anonymous visit would fail every control here with an opaque UNAUTHORIZED. Say so
  // instead.
  if (feed.error?.data?.code === "UNAUTHORIZED") {
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
        <Button
          variant="ghost"
          shape="pill"
          onClick={() => setBrowseOpen(true)}
        >
          Collections sheet
        </Button>
        <Button
          variant="ghost"
          shape="pill"
          disabled={!demoItem}
          onClick={() => setSaveOpen(true)}
        >
          Save sheet
        </Button>
        <Button variant="ghost" shape="pill" onClick={() => setShareOpen(true)}>
          Share sheet
        </Button>
      </div>

      <p className="text-ink/40 text-[12px]">
        {demoItem
          ? `Demo item: ${demoItem.title}`
          : "Loading a real item from the feed…"}
      </p>

      <div
        {...press}
        className="border-hairline border-ink/12 bg-ink/5 flex h-24 touch-manipulation items-center justify-center rounded-[14px] select-none"
        style={{ WebkitTouchCallout: "none" }}
      >
        <span className="text-ink/60 text-[14px]">usePress: {pressLog}</span>
      </div>

      <PillToolbar
        bookmark={bookmark}
        onBookmark={() => (demoItem ? setSaveOpen(true) : setBrowseOpen(true))}
        onShare={() => setShareOpen(true)}
        onProfile={() => onToast("Profile is 5.10")}
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
            onSaved={(collection) => {
              setBookmark("saved");
              setCurrentCollectionId(collection.id);
              onToast(`Saved to ${collection.name}`);
            }}
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
