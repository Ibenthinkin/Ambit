// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopicsScreen } from "./topics-screen";

// The trpc mock models more shape than onboarding's does, because this screen writes optimistically:
// it needs `useUtils().topics.mine` to answer `getData`/`setData`/`cancel`/`invalidate`, and the
// mutation mock has to actually run `onMutate` so the optimistic patch is exercised rather than
// merely declared. `state` is the fake cache the two halves share.
// `TopicPick` (`db/topics.ts`) inlined rather than imported — this file mocks `~/trpc/react`
// wholesale, so pulling the server-side type in would be one more thing for that mock to shadow.
type Pick = { topicId: string; weight: number };

const { mutateMock, invalidateMock, resetMock, state } = vi.hoisted(() => ({
  mutateMock:
    vi.fn<(v: { picks: { topicId: string; weight: number }[] }) => void>(),
  invalidateMock: vi.fn(),
  resetMock: vi.fn(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    // `topics.mine` carries a weight alongside each id since 09-28-26 (Task 4 of the
    // onboarding-v2 foundation) — `topics.weights` is retired, so the dev readout tests below
    // read a weight off this instead of a separate `state.weights`.
    mine: [] as { topicId: string; weight: number }[],
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
                ? (
                    updater as (
                      p: { topicId: string; weight: number }[],
                    ) => { topicId: string; weight: number }[]
                  )(state.mine)
                : (updater as { topicId: string; weight: number }[]);
          },
        },
      },
    }),
    topics: {
      list: { useQuery: () => ({ data: state.topics }) },
      mine: { useQuery: () => ({ data: state.mine }) },
      setMine: {
        useMutation: (opts?: {
          onMutate?: (v: { picks: Pick[] }) => unknown;
        }) => ({
          mutate: (v: { picks: Pick[] }) => {
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

// Real topic ids, because the screen files them into the real `TOPIC_GROUPS` (re-cut 09-28-26,
// docs/DESIGN_onboarding-interview.md §1) — see onboarding-screen.test.tsx for the same note.
// astronomy and moon share a group ("Space"), so the mixed state and "a group tap fans out" are
// real claims; botany is a second subject group; one topic per other facet.
const TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" },
  { id: "moon", label: "Moon", facet: "subject" },
  { id: "botany", label: "Botany", facet: "subject" },
  { id: "ceramics", label: "Ceramics", facet: "medium" },
  { id: "surreal", label: "Surreal", facet: "look" },
  { id: "japan", label: "Japan", facet: "place" },
];
const SPACE = "Space";
const PLANTS = "Plants";

/** The pressed chips across every facet's *topic* row — the flat lists behind "Show all". */
function pressed() {
  return screen
    .getAllByRole("group", { name: /topics$/ })
    .flatMap((group) => within(group).getAllByRole("button"))
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);
}
/** Opens one facet section's flat topic list. */
function showAll(facet: string) {
  const section = screen.getByRole("region", {
    name: {
      Subject: "What are you drawn to?",
      Medium: "In what form?",
      Look: "What should it feel like?",
      Place: "Anywhere in particular?",
    }[facet]!,
  });
  fireEvent.click(within(section).getByRole("button", { name: /^Show all/ }));
  return section;
}
function lastWrite() {
  return new Set(mutateMock.mock.calls.at(-1)![0].picks.map((p) => p.topicId));
}

/** The picked-topic fixture shape: every id at plain weight 1, this screen's default write. */
function asPicks(ids: string[]): Pick[] {
  return ids.map((topicId) => ({ topicId, weight: 1 }));
}

describe("TopicsScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    invalidateMock.mockReset();
    resetMock.mockReset();
    state.topics = TOPICS;
    state.mine = asPicks(["astronomy"]);
  });

  it("shows all four facets as sections, in order, each under its onboarding question, as group chips", () => {
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
    // Every facet's groups are on the page at once — no filter to flick — and the individual
    // topics are behind each section's "Show all", not on the page.
    for (const label of [
      PLANTS,
      "Ceramics & glass",
      "Surreal & psychedelic",
      "Japan",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Botany" })).toBeNull();
    expect(screen.queryAllByRole("group", { name: /topics$/ })).toHaveLength(0);
  });

  it("a group with some members picked reads mixed, and says how many", () => {
    render(<TopicsScreen dev={false} />);
    const space = screen.getByRole("button", { name: `${SPACE} · 1 of 2` });
    expect(space.getAttribute("aria-pressed")).toBe("mixed");
    // A fully unpicked group is plainly off, a fully picked one plainly on.
    expect(
      screen.getByRole("button", { name: PLANTS }).getAttribute("aria-pressed"),
    ).toBe("false");
    state.mine = asPicks(["astronomy", "moon"]);
    render(<TopicsScreen dev={false} />);
    expect(
      screen
        .getAllByRole("button", { name: SPACE })
        .at(-1)!
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("files each group under its own facet's row", () => {
    render(<TopicsScreen dev={false} />);
    const subject = screen.getByRole("group", { name: "Subject groups" });
    const medium = screen.getByRole("group", { name: "Medium groups" });
    expect(
      within(subject)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([`${SPACE} · 1 of 2`, PLANTS]);
    expect(
      within(medium)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Ceramics & glass"]);
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

  it("tapping an unpicked group saves the set plus every listed member, immediately", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: PLANTS }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(lastWrite()).toEqual(new Set(["astronomy", "botany"]));
  });

  it("tapping a mixed group completes it rather than clearing it", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: `${SPACE} · 1 of 2` }));
    expect(lastWrite()).toEqual(new Set(["astronomy", "moon"]));
  });

  it("tapping a full group unpicks every member", () => {
    state.mine = asPicks(["astronomy", "moon", "botany"]);
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    expect(lastWrite()).toEqual(new Set(["botany"]));
  });

  it("refuses to unpick the last topic, through a group or a chip, and says so", () => {
    state.mine = asPicks(["botany"]);
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: PLANTS }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "Keep at least one topic.",
    );
    showAll("Subject");
    fireEvent.click(screen.getByRole("button", { name: "Botany" }));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(pressed()).toEqual(["Botany"]);
  });

  it("Show all opens a section's flat topic list, where one topic toggles alone", () => {
    render(<TopicsScreen dev={false} />);
    const section = showAll("Subject");
    const toggle = within(section).getByRole("button", { name: /^Hide/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(screen.getByRole("group", { name: "Subject topics" }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Astronomy", "Moon", "Botany"]);
    expect(pressed()).toEqual(["Astronomy"]);
    // Other sections stay folded.
    expect(screen.queryByRole("group", { name: "Medium topics" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Moon" }));
    expect(lastWrite()).toEqual(new Set(["astronomy", "moon"]));
    fireEvent.click(toggle);
    expect(screen.queryByRole("group", { name: "Subject topics" })).toBeNull();
  });

  it("the Show all button counts the section's listed topics", () => {
    render(<TopicsScreen dev={false} />);
    expect(
      screen.getByRole("button", { name: "Show all 3 topics" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Show all 1 topic" }),
    ).toHaveLength(3);
  });

  it("renders no weights and no reset when dev is false", () => {
    // `topics.mine` is where a weight lives now (`topics.weights` is retired) — astronomy has to
    // actually be picked, at 1.5, for this to be a real claim about the dev gate rather than
    // about an id that just isn't there.
    state.mine = [{ topicId: "astronomy", weight: 1.5 }];
    render(<TopicsScreen dev={false} />);
    showAll("Subject");
    expect(screen.queryByRole("button", { name: "Reset weights" })).toBeNull();
    expect(screen.getByRole("button", { name: "Astronomy" })).toBeTruthy();
  });

  it("under dev, pressed topic chips show their weight and Reset weights calls the mutation", () => {
    state.mine = [{ topicId: "astronomy", weight: 1.5 }];
    render(<TopicsScreen dev />);
    showAll("Subject");
    expect(
      screen.getByRole("button", { name: "Astronomy · 1.5" }),
    ).toBeTruthy();
    // The group chip never carries a weight — it is not a topic.
    expect(
      screen.getByRole("button", { name: `${SPACE} · 1 of 2` }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset weights" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("an unpicked chip shows no weight even under dev", () => {
    // Moon simply has no row in `mine` (unpicked) — since the readout is read straight off the
    // picks now, "no row" and "no weight to show" are the same fact, not two that have to agree.
    render(<TopicsScreen dev />);
    showAll("Subject");
    expect(screen.getByRole("button", { name: "Moon" })).toBeTruthy();
  });
});
