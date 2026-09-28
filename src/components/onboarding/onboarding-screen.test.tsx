// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { weightOf } from "~/server/config/topic-levels";

import { OnboardingScreen } from "./onboarding-screen";

// vi.mock factories are hoisted above imports, so the mock functions they close over have to be
// created through vi.hoisted() (see auth-card.test.tsx's identical note). `api.topics.setMine
// .useMutation()` is a *hook returning an object*, not a plain function, so the mock models that
// shape rather than just a vi.fn().
const { mutateAsyncMock, replaceMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    topics: {
      setMine: { useMutation: () => ({ mutateAsync: mutateAsyncMock }) },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

// Real topic ids, because the screen files them into the real `TOPIC_GROUPS` (re-cut 09-28-26,
// docs/DESIGN_onboarding-interview.md §1) and a made-up id would land in no group and render
// nothing. Same fixture as group-picker.test.tsx / topic-levels.test.tsx: two subject groups,
// and two members of one of them (astronomy + moon are both "Space"), so "picking a group weighs
// every member at 'some'" and "opening a group and picking one member weighs it at 'a lot'" are
// both real claims. One topic per other facet.
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
];
const SPACE = "Space";
const PLANTS = "Plants";
const CERAMICS = "Ceramics & glass";
const SURREAL = "Surreal & psychedelic";

/** The chips, and only the chips — the bar's Back/Next/CTA, and (on Start) `TopicLevels`'
 *  four-way segmented buttons, are `<button>`s too but don't carry a plain `Chip`
 *  `aria-pressed`. Same filter as group-picker.test.tsx's identical helper. */
function chips() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-pressed"));
}
function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}
function back() {
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
}
/** The progress `nav`'s current-step element and its label. `aria-current` lives on a plain
 *  `<span>` (one per `PHASES` entry, not a role Testing Library can query by accessible name). */
function currentPhaseLabel() {
  const nav = screen.getByRole("navigation", { name: "Setup progress" });
  return nav.querySelector('[aria-current="step"]')?.getAttribute("aria-label");
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({ ok: true });
    replaceMock.mockReset();
  });

  it("stage 1 shows the subject groups, the heading, no Back, and Pick as the current step", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    // Two chips for three listed subjects: astronomy and moon fold into one group.
    expect(chips().map((b) => b.textContent)).toEqual([SPACE, PLANTS]);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Setup progress" }),
    ).toBeTruthy();
    expect(screen.getByText("What are you drawn to?")).toBeTruthy();
    expect(currentPhaseLabel()).toBe("Pick");
  });

  it("Next walks Subject → Medium → Look → Place → Start, and Start shows the summary CTA", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    next();
    expect(chips().map((b) => b.textContent)).toEqual([CERAMICS]);
    expect(screen.getByText("In what form?")).toBeTruthy();
    next();
    expect(chips().map((b) => b.textContent)).toEqual([SURREAL]);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Japan"]);
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    next();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByText("Here's where we'll start")).toBeTruthy();
    expect(currentPhaseLabel()).toBe("Start");
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("a stage with no picks can be passed — four Nexts reach Start with nothing chosen", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    next();
    next();
    next();
    next();
    expect(screen.getByText("Here's where we'll start")).toBeTruthy();
  });

  it("Back from Medium returns to Subject with Space still pressed", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    back();
    expect(
      screen.getByRole("button", { name: SPACE }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("Back from Start returns to Place with picks intact", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    next();
    next();
    next();
    expect(screen.getByText("Here's where we'll start")).toBeTruthy();
    back();
    expect(screen.getByText("Anywhere in particular?")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Japan" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    // Space's pick survived the round trip too — go forward again and check the summary.
    next();
    expect(screen.getByText("Here's where we'll start")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Astronomy level" })).toBeTruthy();
  });

  it("Start with nothing picked: the CTA is disabled, the status says so, and clicking it does nothing", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    next();
    next();
    next();
    next();
    const cta = screen.getByRole("button", { name: "Start exploring" });
    expect(cta).toBeDisabled();
    expect(screen.getByText("Pick at least one topic to start.")).toBeTruthy();
    fireEvent.click(cta);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("picking Space then tuning Moon to 'a lot' writes both at their levels and navigates", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    next();
    next();
    next();
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    const moonRow = screen.getByRole("group", { name: "Moon level" });
    expect(
      within(astronomyRow).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(moonRow).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(moonRow).getByRole("button", { name: "a lot" }));

    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const [{ picks }] = mutateAsyncMock.mock.calls[0]! as [
      { picks: { topicId: string; weight: number }[] },
    ];
    // Order is insertion order, not asserted here — compare as a set of (id, weight) pairs.
    expect(new Set(picks.map((p) => `${p.topicId}:${p.weight}`))).toEqual(
      new Set([`astronomy:${weightOf("some")}`, `moon:${weightOf("lot")}`]),
    );
  });

  it("opening Space's disclosure and picking only Moon writes just Moon, at 'a lot'", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show 2 topics in Space" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Moon" }));
    next();
    next();
    next();
    next();
    expect(screen.queryByRole("group", { name: "Astronomy level" })).toBeNull();
    const moonRow = screen.getByRole("group", { name: "Moon level" });
    expect(
      within(moonRow).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    const [{ picks }] = mutateAsyncMock.mock.calls[0]! as [
      { picks: { topicId: string; weight: number }[] },
    ];
    expect(picks).toEqual([{ topicId: "moon", weight: weightOf("lot") }]);
  });

  it("turning a topic off on Start removes its row; turning the last one off re-disables Start", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    next();
    next();
    next();
    const astronomyRow = screen.getByRole("group", { name: "Astronomy level" });
    fireEvent.click(within(astronomyRow).getByRole("button", { name: "off" }));
    expect(screen.queryByRole("group", { name: "Astronomy level" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).not.toBeDisabled();

    const moonRow = screen.getByRole("group", { name: "Moon level" });
    fireEvent.click(within(moonRow).getByRole("button", { name: "off" }));
    expect(screen.queryByRole("group", { name: "Moon level" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).toBeDisabled();
    expect(screen.getByText("Pick at least one topic to start.")).toBeTruthy();
  });

  it("the count label counts topics, not groups", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    expect(screen.getByText("Nothing picked yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    expect(screen.getByText("2 topics chosen")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Show 2 topics in Space" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Astronomy" }));
    expect(screen.getByText("1 topic chosen")).toBeTruthy();
  });

  it("a mutation error renders in the error slot and does not navigate", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-error")).toBeTruthy(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  // The desktop pass (docs/DESIGN_desktop-polish.md §1): list-shaped screens stop stretching at
  // 600px. Below `md` the class is inert, which is the point — the phone layout is untouched.
  it("centers in a narrow column above md", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} />);
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).not.toBeNull();
  });
});
