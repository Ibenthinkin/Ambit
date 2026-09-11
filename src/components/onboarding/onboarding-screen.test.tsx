// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

// A small fixture rather than the real vocabulary: what each test asserts is *which* chips a
// stage shows, and a hundred real chips would bury that. One topic per facet except subject,
// which has two, so "this stage's chips only" is a real claim. The screen no longer reads
// `TOPICS` at all — it is handed `topics.list`'s rows (09-10-26), so there is nothing left to
// pin against the config.
const FIXTURE_TOPICS = [
  { id: "alpha", label: "Alpha", facet: "subject" as const },
  { id: "beta", label: "Beta", facet: "subject" as const },
  { id: "gamma", label: "Gamma", facet: "medium" as const },
  { id: "delta", label: "Delta", facet: "look" as const },
  { id: "epsilon", label: "Epsilon", facet: "place" as const },
];

/** The chips, and only the chips — the bar's Back/Next/CTA are buttons too. */
function chips() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-pressed"));
}
function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({ ok: true });
    replaceMock.mockReset();
  });

  it("stage 1 shows only the subject chips, in the order given, and no Back", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    expect(chips().map((b) => b.textContent)).toEqual(["Alpha", "Beta"]);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Setup progress" }),
    ).toBeTruthy();
    expect(screen.getByText("What are you drawn to?")).toBeTruthy();
  });

  it("Next walks the four facets in order and the last stage shows the CTA", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Gamma"]);
    expect(screen.getByText("In what form?")).toBeTruthy();
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Delta"]);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Epsilon"]);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Pick 3 more|Start exploring/ }),
    ).toBeTruthy();
  });

  it("a stage with no picks can be passed", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    next();
    next();
    next();
    expect(screen.getByText("Anywhere in particular?")).toBeTruthy();
  });

  it("Back returns to the previous stage with its picks intact", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen
        .getByRole("button", { name: "Alpha" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("the count is across every stage, and the CTA flips at minPicks", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    next();
    next();
    expect(screen.getByText("3 interests chosen")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).not.toBeDisabled();
  });

  it("below minPicks the CTA is disabled and setMine is never called", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next();
    next();
    next();
    // Defense-in-depth, same posture as AuthCard's "validation failure must not fire a network
    // call" tests — click the CTA anyway even though it visually reads as disabled.
    const cta = screen.getByRole("button", { name: "Pick 2 more" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("a successful submit calls setMine once with the union of every stage's picks and navigates to /feed", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Delta" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const [{ topicIds }] = mutateAsyncMock.mock.calls[0]! as [
      { topicIds: string[] },
    ];
    expect(new Set(topicIds)).toEqual(new Set(["alpha", "gamma", "delta"]));
  });

  it("a mutation error renders in the error slot and does not navigate", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
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
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    expect(document.querySelector(".md\\:max-w-\\[600px\\]")).not.toBeNull();
  });
});
