"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Input } from "~/components/ui/input";

import { StepBar } from "./step-bar";

// The optional "About you" step, between the questions and the reveal — a **trial** (plan §8,
// Ben: "we will see how it feels"). Three things, none required, none used by the feed, stored
// on the `user` row and removable by dropping three columns.
//
// Two decisions that are the whole point of the screen:
//   - **One plain line** says what it is for. No "to personalise your experience".
//   - **Skip is exactly as prominent as Continue** — same button, same weight, side by side — and
//     reports nothing even if something was typed. Asking who someone is must cost them nothing
//     to decline; a pale "skip" link under a bright button would be a nudge.

/** What the step collects. Empty string / null = not given (the server stores NULL for both). */
export interface About {
  ageRange: string | null;
  location: string;
  gender: string;
}

export const AGE_RANGES = [
  "Under 25",
  "25–34",
  "35–44",
  "45–54",
  "55–64",
  "65+",
] as const;

const FIELD_LABEL =
  "text-ink/62 mb-2 block font-sans text-[12.5px] font-medium";

export interface AboutStepProps {
  /** What was given before — a reader who comes Back from the reveal sees it again. */
  initial?: About;
  onContinue: (about: About) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function AboutStep({
  initial,
  onContinue,
  onSkip,
  onBack,
}: AboutStepProps) {
  const [ageRange, setAgeRange] = useState<string | null>(
    initial?.ageRange ?? null,
  );
  const [location, setLocation] = useState(initial?.location ?? "");
  const [gender, setGender] = useState(initial?.gender ?? "");

  return (
    <>
      <div data-step="about">
        <h1 className="text-ink-hi text-[30px] leading-[1.15] font-semibold tracking-[-0.4px]">
          A little about you
        </h1>
        <p className="text-ink/62 mt-3 text-[15px] leading-[1.55]">
          All optional. We use this only to understand who Ambit is for; it
          never changes your feed and is never shared.
        </p>

        <div className="mt-7 flex flex-col gap-6">
          <div role="group" aria-labelledby="about-age">
            <span id="about-age" className={FIELD_LABEL}>
              Age
            </span>
            <div className="flex flex-wrap gap-[10px]">
              {AGE_RANGES.map((range) => (
                <Chip
                  key={range}
                  size="sm"
                  selected={ageRange === range}
                  // One at a time, and pressing the chosen one again un-chooses it — there is no
                  // other way back to "I'd rather not say".
                  onClick={() => setAgeRange(ageRange === range ? null : range)}
                >
                  {range}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="about-location" className={FIELD_LABEL}>
              Roughly where are you? A city or country is plenty
            </label>
            <Input
              id="about-location"
              value={location}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="about-gender" className={FIELD_LABEL}>
              Gender
            </label>
            {/* Free text on purpose: a list of boxes is someone else's idea of the answers. */}
            <Input
              id="about-gender"
              value={gender}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setGender(e.target.value)}
            />
          </div>
        </div>
      </div>

      <StepBar>
        <Button shape="pill" size="md" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button shape="pill" size="md" onClick={() => onSkip()}>
          Skip
        </Button>
        <Button
          shape="pill"
          size="md"
          onClick={() => onContinue({ ageRange, location, gender })}
        >
          Continue
        </Button>
      </StepBar>
    </>
  );
}
