import { Logo } from "~/components/icons";
import { Rise } from "~/components/ui/rise";

// Shared chrome for `/` and `/reset-password` (Ambit - Landing.dc.html): the drifting blurred
// accent orbs and the brand mark, both server-rendered since neither needs interactivity. `/`
// passes the hero + AuthCard as children; `/reset-password` skips the hero and passes only its
// card, per PHASE5_PLAN.md ("both states render inside the same <LandingShell> as /... so the
// reset page doesn't look like it belongs to a different product").
export function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg relative min-h-dvh overflow-hidden px-[30px] pb-10">
      {/* Ambient drifting orbs — decorative only. `--animate-drift` (globals.css) bakes in 18s
          forward; orb 2 is the one place in the whole system that needs a different duration/
          direction, so it overrides both via inline style (PHASE5_PLAN.md's visual spec). */}
      <div
        aria-hidden
        className="bg-accent animate-drift absolute top-[-60px] right-[-40px] size-[220px] rounded-full opacity-10 blur-[40px]"
      />
      <div
        aria-hidden
        className="bg-accent animate-drift absolute bottom-[120px] left-[-70px] size-[200px] rounded-full opacity-[0.07] blur-[46px]"
        style={{ animationDuration: "22s", animationDirection: "reverse" }}
      />

      <div className="relative z-[2] flex min-h-dvh flex-col">
        <Rise>
          <div className="flex items-center gap-2.5 pt-24">
            <Logo size={26} className="text-accent" />
            {/* The wordmark loses its italic with Newsreader — Sora ships no italic, and the
                redesign's own wordmark treatment is upright. Weight carries it instead. */}
            <span className="text-ink-hi text-[26px] font-semibold tracking-[-0.2px]">
              Ambit
            </span>
          </div>
        </Rise>

        {children}
      </div>
    </div>
  );
}
