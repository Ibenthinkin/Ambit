// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileHubContext } from "~/components/profile/profile-hub";
import { weightOf } from "~/server/config/topic-levels";

import { TopicsScreen } from "./topics-screen";

// docs/DESIGN_onboarding-interview.md §3: `TopicLevels` (the summary) sits above `GroupPicker`
// (the four facet sections), so this mock models both the read side (`topics.mine` carries
// `{ topicId, weight }[]`) and the two mutations that write it: `setMine` (the group/topic
// pickers) and `setWeight` (the summary's per-topic segmented control). `state` is the fake cache
// both mutations' `onMutate` patch and both components' `useQuery`s read back. The real mutation
// queue — what happens when two writes wait on each other — is `topics-screen.queue.test.tsx`'s
// job, not this file's.
//
// `setWeight`'s mock is the one with real work to do: `onError` is never invoked by *calling*
// `mutate` — a real mutation only calls it when the network request fails. So the mock stashes
// the options object `useMutation` was called with (`state.weightOpts`, reassigned on every
// render since the screen re-creates the mutation object each time) and the `onMutate` context
// `mutate` produced (`state.weightCtx`), and the test invokes `weightOpts.onError` directly, with
// exactly the arguments TanStack Query would have.
type Pick = { topicId: string; weight: number };
type Level = "little" | "some" | "lot";
type SetWeightVars = { topicId: string; level: Level };
// The `onMutate` context `setWeight`'s real implementation returns — a snapshot of the previous
// `topics.mine` rows, restored by `onError`. Typed concretely (not `unknown`) so `state.weightCtx`
// below can be widened from its initial `undefined` by an ordinary, non-redundant type assertion.
type WeightCtx = { previous?: Pick[] } | undefined;
type SetWeightOpts = {
  onMutate?: (v: SetWeightVars) => unknown;
  onError?: (err: unknown, v: SetWeightVars, ctx: WeightCtx) => void;
};

const {
  mutateMock,
  invalidateMock,
  resetMock,
  setWeightMock,
  toastMock,
  state,
} = vi.hoisted(() => ({
  mutateMock: vi.fn<(v: { picks: Pick[] }) => void>(),
  invalidateMock: vi.fn(),
  resetMock: vi.fn(),
  setWeightMock: vi.fn<(v: SetWeightVars) => void>(),
  toastMock: vi.fn<(text: string) => void>(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    mine: [] as Pick[],
    // The last `setWeight.useMutation` options, and the context its last `mutate` call
    // produced — what the onError test below drives directly.
    weightOpts: undefined as SetWeightOpts | undefined,
    weightCtx: undefined as WeightCtx,
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
                ? (updater as (p: Pick[]) => Pick[])(state.mine)
                : (updater as Pick[]);
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
      setWeight: {
        useMutation: (opts?: SetWeightOpts) => {
          state.weightOpts = opts;
          return {
            mutate: (v: SetWeightVars) => {
              // The real `onMutate` is `async` (it `await`s `cancel()` first — file header),
              // so it returns a Promise, not the context object itself. TanStack Query awaits
              // that promise and hands its *resolved* value to `onError` as `ctx`; this mock
              // does the same rather than stashing the raw Promise (which `onError`'s own
              // `ctx?.previous` check would then silently see nothing on).
              void Promise.resolve(opts?.onMutate?.(v)).then((ctx) => {
                state.weightCtx = ctx as WeightCtx;
              });
              setWeightMock(v);
            },
            isPending: false,
          };
        },
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

/** The tab renders inside the hub, which owns the toast — a provider stands in for it — and
 *  under the app's `QueryClientProvider`, which the screen asks how many writes are queued. As a
 *  `wrapper`, both survive `rerender`. */
function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProfileHubContext.Provider value={{ toast: toastMock }}>
        {children}
      </ProfileHubContext.Provider>
    </QueryClientProvider>
  );
}

function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: Providers });
}

// Same real-id fixture as onboarding-screen.test.tsx / group-picker.test.tsx
// (docs/DESIGN_onboarding-interview.md §1 re-cut, 09-28-26): astronomy + moon share the
// two-member "Space" group, botany is the singleton "Plants" group, one topic per other facet.
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

/** The picked-topic fixture shape: every id at plain weight 1 (this screen's default write for a
 *  fresh multi-pick), unless a test needs a specific weight and builds `state.mine` by hand. */
function asPicks(ids: string[]): Pick[] {
  return ids.map((topicId) => ({ topicId, weight: 1 }));
}

/** The last `setMine` call's picks, as a set of ids — order isn't a claim any of these tests
 *  make. */
function lastWrite() {
  return new Set(mutateMock.mock.calls.at(-1)![0].picks.map((p) => p.topicId));
}

/** A topic's row in the summary (`TopicLevels`), named the way that component labels it. */
function levelRow(label: string) {
  return screen.getByRole("group", { name: `${label} level` });
}

/** Both mutations' `onMutate` is `async` (it `await`s `utils.topics.mine.cancel()` before
 *  patching the cache, matching the real screen — see its file header on why), so the patch
 *  lands one microtask after `fireEvent.click` returns, not synchronously within it. `flush`
 *  lets that microtask run before a test reads the (mocked, non-reactive) cache back out. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("TopicsScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    invalidateMock.mockReset();
    resetMock.mockReset();
    setWeightMock.mockReset();
    toastMock.mockReset();
    state.topics = TOPICS;
    state.mine = asPicks(["astronomy"]);
    state.weightOpts = undefined;
    state.weightCtx = undefined;
  });

  it("shows the intro count, then the summary, then the four facet sections with their group chips", () => {
    render(<TopicsScreen dev={false} />);

    expect(
      screen.getByText("1 on. Changes save as you go."),
    ).toBeInTheDocument();

    // The summary: astronomy (the one pick) at "some" (weight 1 falls in that band).
    expect(
      within(levelRow("Astronomy")).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Four sections, each under its onboarding question, in FACETS order.
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "What are you drawn to?",
      "In what form?",
      "What should it feel like?",
      "Anywhere in particular?",
    ]);
    // Group chips, not the flat topic list — GroupPicker's own contract, exercised here through
    // the host.
    expect(
      screen.getByRole("button", { name: `${SPACE} · 1 of 2` }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: PLANTS })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Botany" })).toBeNull();

    // Summary before the sections, in document order.
    const summary = levelRow("Astronomy");
    const firstSection = screen.getByText("What are you drawn to?");
    expect(
      summary.compareDocumentPosition(firstSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders no title, no back link and no <main> — the hub owns those", () => {
    render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("← Profile")).toBeNull();
    expect(document.querySelector("main")).toBeNull();
  });

  it("tapping Plants (a singleton group) saves the set plus botany at 'a lot', immediately", async () => {
    const { rerender } = render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: PLANTS }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [{ picks }] = mutateMock.mock.calls[0]!;
    expect(new Map(picks.map((p) => [p.topicId, p.weight]))).toEqual(
      new Map([
        ["astronomy", 1],
        ["botany", weightOf("lot")],
      ]),
    );
    // `onMutate` already patched `topics.mine` (before any server round trip) — `flush` +
    // `rerender` just force this mocked, non-reactive `useQuery` to read the patched cache the
    // way the real hook's own subscription would have done automatically.
    await flush();
    rerender(<TopicsScreen dev={false} />);
    expect(screen.getByRole("group", { name: "Botany level" })).toBeTruthy();
  });

  it("tapping the mixed Space chip completes it, at 'some'", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: `${SPACE} · 1 of 2` }));
    const [{ picks }] = mutateMock.mock.calls[0]!;
    expect(new Map(picks.map((p) => [p.topicId, p.weight]))).toEqual(
      new Map([
        ["astronomy", 1],
        ["moon", weightOf("some")],
      ]),
    );
  });

  it("a full group tap removes every member, when another topic stays picked", () => {
    state.mine = [
      { topicId: "astronomy", weight: 1 },
      { topicId: "moon", weight: weightOf("some") },
      { topicId: "botany", weight: weightOf("lot") },
    ];
    render(<TopicsScreen dev={false} />);
    fireEvent.click(screen.getByRole("button", { name: SPACE }));
    expect(lastWrite()).toEqual(new Set(["botany"]));
  });

  it("refuses to unpick the last topic — via the summary's off, or the picker's own chip — and says so", () => {
    render(<TopicsScreen dev={false} />);

    // The summary's "off" segment on the one and only pick.
    fireEvent.click(
      within(levelRow("Astronomy")).getByRole("button", { name: "off" }),
    );
    expect(mutateMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenLastCalledWith("Keep at least one topic.");

    // The picker's own single-topic chip inside Space's disclosure.
    fireEvent.click(
      screen.getByRole("button", { name: "Show 2 topics in Space" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Astronomy" }));
    expect(mutateMock).not.toHaveBeenCalled();
    // Astronomy is still picked — the refusal didn't just fail to write, it left the chip alone.
    expect(screen.getByRole("button", { name: "Astronomy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking 'a lot' on Astronomy in the summary calls setWeight, flips the segment at once, and never calls setMine", async () => {
    const { rerender } = render(<TopicsScreen dev={false} />);
    const row = levelRow("Astronomy");
    fireEvent.click(within(row).getByRole("button", { name: "a lot" }));
    expect(setWeightMock).toHaveBeenCalledWith({
      topicId: "astronomy",
      level: "lot",
    });
    // Same "already-patched cache, force the mocked hook to re-read it" move as above.
    await flush();
    rerender(<TopicsScreen dev={false} />);
    expect(
      within(levelRow("Astronomy")).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("clicking 'off' on Botany, when two topics are picked, calls setMine with Botany absent", () => {
    state.mine = [
      { topicId: "astronomy", weight: 1 },
      { topicId: "botany", weight: weightOf("lot") },
    ];
    render(<TopicsScreen dev={false} />);
    fireEvent.click(
      within(levelRow("Botany")).getByRole("button", { name: "off" }),
    );
    expect(lastWrite()).toEqual(new Set(["astronomy"]));
  });

  it("onError on setWeight restores the previous level and toasts through the hub", async () => {
    const { rerender } = render(<TopicsScreen dev={false} />);
    const row = levelRow("Astronomy");
    expect(within(row).getByRole("button", { name: "some" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(row).getByRole("button", { name: "a lot" }));
    await flush();
    rerender(<TopicsScreen dev={false} />);
    expect(
      within(levelRow("Astronomy")).getByRole("button", { name: "a lot" }),
    ).toHaveAttribute("aria-pressed", "true");

    act(() => {
      state.weightOpts!.onError!(
        new Error("boom"),
        { topicId: "astronomy", level: "lot" },
        state.weightCtx,
      );
    });
    rerender(<TopicsScreen dev={false} />);

    expect(
      within(levelRow("Astronomy")).getByRole("button", { name: "some" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(toastMock).toHaveBeenLastCalledWith(
      "Couldn't save that — try again.",
    );
  });

  it("Reset weights renders only under dev and calls the mutation; no chip carries a raw weight suffix", () => {
    state.mine = [{ topicId: "astronomy", weight: 1.5 }];
    const { unmount } = render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("button", { name: "Reset weights" })).toBeNull();
    expect(
      screen
        .getAllByRole("button")
        .some((b) => /·\s*1\.5/.test(b.textContent ?? "")),
    ).toBe(false);
    unmount();

    render(<TopicsScreen dev />);
    fireEvent.click(screen.getByRole("button", { name: "Reset weights" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getAllByRole("button")
        .some((b) => /·\s*1\.5/.test(b.textContent ?? "")),
    ).toBe(false);
  });
});
