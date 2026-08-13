// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TOPICS } from "~/server/config/topics";
import { OnboardingScreen } from "./onboarding-screen";

// vi.mock factories are hoisted above imports, so the mock functions they close over have to be
// created through vi.hoisted() (see auth-card.test.tsx's identical note). This project's first
// test file mocking `~/trpc/react` — meaningfully harder than mocking `authClient`, since
// `api.topics.setMine.useMutation()` is a *hook returning an object*, not a plain function, so
// the mock has to model that shape rather than just a jest.fn().
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

// A small fixture rather than the real sixteen topics for most cases — keeps each test's
// assertions about *which* chips are showing legible. One case below (config order) uses the real
// `TOPICS` array instead, so a future edit to that file (Phase 6 grows the grid toward 32) can't
// silently break the grid without a test noticing.
const FIXTURE_TOPICS = [
  { id: "alpha", label: "Alpha" },
  { id: "beta", label: "Beta" },
  { id: "gamma", label: "Gamma" },
  { id: "delta", label: "Delta" },
];

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset().mockResolvedValue({ ok: true });
    replaceMock.mockReset();
  });

  it("renders a chip per topic, in TOPICS config order", () => {
    render(
      <OnboardingScreen
        topics={TOPICS.map((t) => ({ id: t.id, label: t.label }))}
        minPicks={3}
      />,
    );

    const buttons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(buttons.map((b) => b.textContent)).toEqual(
      TOPICS.map((t) => t.label),
    );
  });

  it("starts with nothing picked and the CTA disabled", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    expect(screen.getByText("Nothing picked yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick 3 more" })).toBeDisabled();
  });

  it("toggling a chip updates the count label and the CTA's label/enabled state", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));

    expect(screen.getByText("1 interest chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick 2 more" })).toBeDisabled();
  });

  it("the count/CTA boundary is exact at minPicks", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(screen.getByText("2 interests chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick 1 more" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));

    expect(screen.getByText("3 interests chosen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).not.toBeDisabled();
  });

  it("does not call setMine when the CTA is clicked below minPicks", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    // Defense-in-depth, same posture as AuthCard's "validation failure must not fire a network
    // call" tests — click the CTA anyway even though it visually reads as disabled.
    fireEvent.click(screen.getByRole("button", { name: "Pick 1 more" }));

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("toggling a chip off decrements the count and can drop the CTA back below threshold", () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    expect(
      screen.getByRole("button", { name: "Start exploring" }),
    ).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(screen.getByText("2 interests chosen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick 1 more" })).toBeDisabled();
  });

  it("a successful submit calls setMine with exactly the selected topic ids and navigates to /feed", async () => {
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Delta" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const [{ topicIds }] = mutateAsyncMock.mock.calls[0]! as [
      { topicIds: string[] },
    ];
    expect(topicIds.sort()).toEqual(["alpha", "beta", "delta"].sort());
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/feed"));
  });

  it("a mutation error renders in the error slot and does not navigate", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network down"));
    render(<OnboardingScreen topics={FIXTURE_TOPICS} minPicks={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong saving your picks — try again.",
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
