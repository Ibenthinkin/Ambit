// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopicsScreen } from "./topics-screen";

// The Topics tab's two writes, run through TanStack Query's *real* mutation queue.
//
// `topics-screen.test.tsx` fakes `useMutation` outright, which is right for what it checks (what
// each tap sends) and useless for this: the bug this file guards lives in how two real mutations
// in one `scope` take turns. So here `api.topics.setMine/setWeight.useMutation` hand the screen's
// options straight to the real `useMutation`, with a `mutationFn` the test settles by hand, inside
// a real `QueryClientProvider`.
//
// The race: both writes share `scope: { id: "topics.setMine" }`, so a second tap waits behind the
// first. If the first write's `onSettled` refetched `topics.mine` while the second was still
// queued, the refetch would land the server's pre-second-write rows over the second tap's
// optimistic patch — and a tap in that window would build its whole-set `setMine` from the stale
// cache and delete the second pick. The rule this pins: only the last write in the queue refetches.
type Pick = { topicId: string; weight: number };

const { invalidateMock, calls, scopes, state } = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  // Every `mutationFn` call, in the order the queue actually *ran* them.
  calls: [] as { name: string; vars: unknown; resolve: () => void }[],
  // The `scope` each mutation was created with, by name — what the pin below reads.
  scopes: new Map<string, unknown>(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    mine: [] as Pick[],
  },
}));

/** A tRPC-shaped `useMutation` whose request is a promise the test resolves. */
function realMutation(name: string) {
  return (opts: Record<string, unknown>) => {
    scopes.set(name, opts.scope);
    return useMutation({
      ...opts,
      mutationFn: (vars: unknown) =>
        new Promise<void>((resolve) => {
          calls.push({ name, vars, resolve });
        }),
    });
  };
}

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      topics: {
        mine: {
          invalidate: invalidateMock,
          cancel: async () => undefined,
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
      // No stored exhibition: this file is about the write queue.
      taste: { useQuery: () => ({ data: null }) },
      setMine: { useMutation: realMutation("setMine") },
      setWeight: { useMutation: realMutation("setWeight") },
      resetWeights: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

const TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" },
  { id: "moon", label: "Moon", facet: "subject" },
  { id: "botany", label: "Botany", facet: "subject" },
  { id: "ceramics", label: "Ceramics", facet: "medium" },
  { id: "surreal", label: "Surreal", facet: "look" },
  { id: "japan", label: "Japan", facet: "place" },
];

/** Adds Botany the way a reader does since 10-02-26: search, then press its result. */
function addBotany() {
  fireEvent.change(screen.getByRole("searchbox", { name: "Add a topic" }), {
    target: { value: "bot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Botany" }));
}

/** Lets the mutation machinery's promise chains (onMutate, the queue hand-off, onSettled) run. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderScreen() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TopicsScreen dev={false} />
    </QueryClientProvider>,
  );
}

describe("TopicsScreen — the write queue", () => {
  beforeEach(() => {
    invalidateMock.mockReset();
    calls.length = 0;
    scopes.clear();
    state.topics = TOPICS;
    state.mine = [{ topicId: "astronomy", weight: 1 }];
  });

  it("both writes share one scope, so they queue rather than race", () => {
    renderScreen();
    expect(scopes.get("setMine")).toEqual({ id: "topics.setMine" });
    expect(scopes.get("setWeight")).toEqual({ id: "topics.setMine" });
  });

  it("with two writes queued, only the last one's settle refetches topics.mine", async () => {
    renderScreen();

    // Write 1: add Botany from the search box (a whole-set setMine).
    addBotany();
    await flush();
    // Write 2, tapped while write 1 is still in flight: Astronomy to "a lot" (a setWeight).
    fireEvent.click(
      within(screen.getByRole("group", { name: "Astronomy level" })).getByRole(
        "button",
        { name: "a lot" },
      ),
    );
    await flush();

    // The shared scope at work: write 2's request hasn't started — it waits behind write 1.
    expect(calls.map((c) => c.name)).toEqual(["setMine"]);

    // Write 1 lands. Write 2 is still queued, so refetching now would undo its optimistic patch.
    await act(async () => calls[0]!.resolve());
    await flush();
    expect(invalidateMock).not.toHaveBeenCalled();

    // The queue hands on to write 2; when it lands it is the last one, and it refetches.
    expect(calls.map((c) => c.name)).toEqual(["setMine", "setWeight"]);
    await act(async () => calls[1]!.resolve());
    await flush();
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("a lone write still refetches when it settles", async () => {
    renderScreen();
    addBotany();
    await flush();
    await act(async () => calls[0]!.resolve());
    await flush();
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });
});
