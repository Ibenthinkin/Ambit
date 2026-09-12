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

/** The pressed chips across every facet's topic group. */
function pressed() {
  return screen
    .getAllByRole("group", { name: /topics$/ })
    .flatMap((group) => within(group).getAllByRole("button"))
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

  it("shows all four facets as sections, in order, each under its onboarding question", () => {
    render(<TopicsScreen dev={false} />);
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "What are you drawn to?",
      "In what form?",
      "What should it feel like?",
      "Anywhere in particular?",
    ]);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Facets" })).toBeNull();
    // Every facet's chips are on the page at once — no filter to flick.
    for (const label of ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(pressed()).toEqual(["Alpha"]);
  });

  it("files each topic under its own facet's group", () => {
    render(<TopicsScreen dev={false} />);
    const subject = screen.getByRole("group", { name: "Subject topics" });
    const medium = screen.getByRole("group", { name: "Medium topics" });
    expect(
      within(subject)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Alpha", "Beta"]);
    expect(
      within(medium)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Gamma"]);
  });

  it("renders no title, no back link and no <main> — the hub owns those", () => {
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
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
