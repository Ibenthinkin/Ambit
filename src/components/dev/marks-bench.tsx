"use client";

import { OrbitMark, RingMark, TerminatorMark } from "~/components/icons/marks";
import { AvatarChip } from "~/components/ui/avatar-chip";
import { avatarHue } from "~/lib/avatar-hue";

// The profile-mark bench (docs/DESIGN_landing-redo.md D7): the current chip beside the three
// candidates, for six sample readers, at the four sizes the app uses — the pill (28), the rail
// (32), the Profile hub (88) and Edit profile (104) — on the screen ground and over a picture.
// Nothing here is interactive; it exists so Ben can pick by looking.

const SAMPLE_IDS = ["ben", "alice", "kvetch", "u_7f3a", "persona-12", "zz"];
const SIZES = [28, 32, 88, 104] as const;

const CANDIDATES = [
  {
    name: "Current (Cosmos)",
    render: (id: string, size: number) => <AvatarChip size={size} />,
  },
  {
    name: "1 · Orbit",
    render: (id: string, size: number) => (
      <OrbitMark size={size} hue={avatarHue(id)} />
    ),
  },
  {
    name: "2 · Terminator",
    render: (id: string, size: number) => (
      <TerminatorMark size={size} hue={avatarHue(id)} />
    ),
  },
  {
    name: "3 · Ring",
    render: (id: string, size: number) => (
      <RingMark size={size} hue={avatarHue(id)} />
    ),
  },
];

function Grid() {
  return (
    <div className="flex flex-col gap-10">
      {CANDIDATES.map((c) => (
        <section key={c.name}>
          <h2 className="text-ink-hi mb-4 text-sm">{c.name}</h2>
          <div className="flex flex-col gap-4">
            {SAMPLE_IDS.map((id) => (
              <div key={id} className="flex items-center gap-6">
                <span className="text-ink/55 w-24 font-mono text-[12px]">
                  {id}
                </span>
                {SIZES.map((s) => (
                  <span key={s} className="flex w-[112px] items-center">
                    {c.render(id, s)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function MarksBench() {
  return (
    <main className="bg-bg min-h-dvh px-8 py-10">
      <h1 className="text-ink-hi text-h2">Profile marks</h1>
      <p className="text-ink/62 mt-2 max-w-[640px] text-sm">
        The current chip and three candidates, at the pill (28), rail (32), hub
        (88) and Edit profile (104) sizes. Left: the screen ground. Right: over
        a picture, where the rail toolbar sits.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-10 xl:grid-cols-2">
        <Grid />
        <div
          className="bg-cover bg-center p-6"
          style={{ backgroundImage: "url(/landing/fallback.webp)" }}
        >
          <Grid />
        </div>
      </div>
    </main>
  );
}
