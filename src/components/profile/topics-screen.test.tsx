// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopicsScreen } from "./topics-screen";

// The trpc mock models more shape than onboarding's does, because this screen writes optimistically:
// it needs `useUtils().topics.mine` to answer `getData`/`setData`/`cancel`/`invalidate`, and the
// mutation mock has to actually run `onMutate` so the optimistic patch is exercised rather than
// merely declared. `state` is the fake cache the two halves share.
const { mutateMock, invalidateMock, resetMock, state } = vi.hoisted(() => ({
  mutateMock: vi.fn<(v: { topicIds: string[] }) => void>(),
  invalidateMock: vi.fn(),
  resetMock: vi.fn(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    mine: [] as string[],
    weights: [] as { topicId: string; weight: number }[],
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      topics: {
        mine: {
          invalidate: invalidateMock,
          cancel: vi.fn(),
          getData: () => state.mine,
          setData: (_input: unknown, updater: unknown) => {
            state.mine =
              typeof updater === "function"
                ? (updater as (p: string[]) => string[])(state.mine)
                : (updater as string[]);
          },
        },
        weights: { invalidate: vi.fn() },
      },
    }),
    topics: {
      list: { useQuery: () => ({ data: state.topics }) },
      mine: { useQuery: () => ({ data: state.mine }) },
      weights: { useQuery: () => ({ data: state.weights }) },
      setMine: {
        useMutation: (opts?: {
          onMutate?: (v: { topicIds: string[] }) => unknown;
        }) => ({
          mutate: (v: { topicIds: string[] }) => {
            opts?.onMutate?.(v);
            mutateMock(v);
          },
          isPending: false,
        }),
      },
      resetWeights: {
        useMutation: () => ({ mutate: resetMock, isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

const TOPICS = [
  { id: "alpha", label: "Alpha", facet: "subject" },
  { id: "beta", label: "Beta", facet: "subject" },
  { id: "gamma", label: "Gamma", facet: "medium" },
  { id: "delta", label: "Delta", facet: "look" },
  { id: "epsilon", label: "Epsilon", facet: "place" },
];

/** The pressed chips inside the topic group — the facet chips are pressed too, and not the point. */
function pressed() {
  const group = screen.getByRole("group", { name: /topics$/ });
  return within(group)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);
}

describe("TopicsScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    invalidateMock.mockReset();
    resetMock.mockReset();
    state.topics = TOPICS;
    state.mine = ["alpha"];
    state.weights = [];
  });

  it("shows four facet chips in order with Subject pressed, and that facet's topics", () => {
    render(<TopicsScreen dev={false} />);
    const facets = within(
      screen.getByRole("group", { name: "Facets" }),
    ).getAllByRole("button");
    expect(facets.map((f) => f.textContent)).toEqual([
      "Subject",
      "Medium",
      "Look",
      "Place",
    ]);
    expect(facets[0]).toHaveAttribute("aria-pressed", "true");
    expect(facets[1]).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gamma" })).toBeNull();
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("a facet chip switches the group", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    expect(screen.getByRole("button", { name: "Gamma" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(
      screen.getByRole("group", { name: "Medium topics" }),
    ).toBeInTheDocument();
  });

  it("renders no title, no back link and no <main> — the hub owns those", () => {
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("← Profile")).toBeNull();
    expect(document.querySelector("main")).toBeNull();
    expect(
      screen.getByText("1 on. Changes save as you go."),
    ).toBeInTheDocument();
  });

  it("toggling a chip on saves the new full set immediately", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(new Set(mutateMock.mock.calls[0]![0].topicIds)).toEqual(
      new Set(["alpha", "beta"]),
    );
  });

  it("toggling a chip off saves the set without it", () => {
    state.mine = ["alpha", "beta"];
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(mutateMock.mock.calls[0]![0].topicIds).toEqual(["alpha"]);
  });

  it("refuses to unpick the last topic and says so", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "Keep at least one topic.",
    );
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("renders no weights and no reset when dev is false", () => {
    state.weights = [{ topicId: "alpha", weight: 1.5 }];
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("button", { name: "Reset weights" })).toBeNull();
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
  });

  it("under dev, pressed chips show their weight and Reset weights calls the mutation", () => {
    state.weights = [{ topicId: "alpha", weight: 1.5 }];
    render(<TopicsScreen dev />);
    expect(screen.getByRole("button", { name: "Alpha · 1.5" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset weights" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("an unpicked chip shows no weight even under dev", () => {
    state.weights = [{ topicId: "beta", weight: 2 }];
    render(<TopicsScreen dev />);
    expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy();
  });
});
