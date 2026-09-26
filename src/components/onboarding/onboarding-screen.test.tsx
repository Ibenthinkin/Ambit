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

// Real topic ids, because the screen files them into the real `TOPIC_GROUPS` (09-25-26) and a
// made-up id would land in no group and render nothing. Still a small fixture: what each test
// asserts is *which* group chips a stage shows, and the whole vocabulary would bury that. Two
// subject groups, and two members of one of them (astronomy + moon are both "Space & science
// fiction"), so "a pick flattens to every listed member" is a real claim. One topic per other
// facet. The fixture is what `topics.list` would return — CI's is the sixteen originals, and the
// screen must render honestly from either.
const FIXTURE_TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" as const },
  { id: "moon", label: "Moon", facet: "subject" as const },
  { id: "botany", label: "Botany", facet: "subject" as const },
  { id: "ceramics", label: "Ceramics", facet: "medium" as const },
  { id: "surreal", label: "Surreal", facet: "look" as const },
  { id: "japan", label: "Japan", facet: "place" as const },
];
const SPACE = "Space & science fiction";
const PLANTS = "Plants & fungi";
const CRAFT = "Craft & materials";
const SURREAL = "Surreal & dreamlike";

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

  it("stage 1 shows only the subject groups, in the config's order, and no Back", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    // Two chips for three listed subjects: astronomy and moon fold into one group.
    expect(chips().map((b) => b.textContent)).toEqual([SPACE, PLANTS]);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Setup progress" }),
    ).toBeTruthy();
    expect(screen.getByText("What are you drawn to?")).toBeTruthy();
  });

  it("Next walks the four facets in order and the last stage shows the CTA", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    next();
    expect(chips().map((b) => b.textContent)).toEqual([CRAFT]);
    expect(screen.getByText("In what form?")).toBeTruthy();
    next();
    expect(chips().map((b) => b.textContent)).toEqual([SURREAL]);
    next();
    expect(chips().map((b) => b.textContent)).toEqual(["Japan"]);
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
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("button", { name: SPACE }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("the count is in groups, across every stage, and the CTA flips at minPicks", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    fireEvent.click(screen.getByRole("button", { name: PLANTS }));
    next();
    fireEvent.click(screen.getByRole("button", { name: CRAFT }));
    next();
    next();
    // Space holds two listed topics, but the reader tapped three chips: the count is what they did.
    expect(screen.getByText("3 interests chosen")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).not.toBeDisabled();
  });

  it("below minPicks the CTA is disabled and setMine is never called", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
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

  it("a successful submit calls setMine once with every listed member of every picked group and navigates to /feed", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    next();
    fireEvent.click(screen.getByRole("button", { name: CRAFT }));
    next();
    fireEvent.click(screen.getByRole("button", { name: SURREAL }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const [{ topicIds }] = mutateAsyncMock.mock.calls[0]! as [
      { topicIds: string[] },
    ];
    // Space flattens to both of its listed members — and to nothing the fixture did not list,
    // though the config names twelve: an unlisted id is one `setMine` would refuse.
    expect(new Set(topicIds)).toEqual(
      new Set(["astronomy", "moon", "ceramics", "surreal"]),
    );
  });

  it("a mutation error renders in the error slot and does not navigate", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={1} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
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
