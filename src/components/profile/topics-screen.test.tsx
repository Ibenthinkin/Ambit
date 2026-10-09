// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileHubContext } from "~/components/profile/profile-hub";

import type { ProfileTaste } from "~/lib/interview/taste";

import { TopicsScreen } from "./topics-screen";

// /profile/topics after the questionnaire (10-02-26): a flat list of the reader's topics with a
// level each, a search box to add one, and a link to retake the questions. This file checks what
// each tap *sends*, with `useMutation` faked; what happens when two real writes wait on each
// other is `topics-screen.queue.test.tsx`'s job.
type Pick = { topicId: string; weight: number };
type SetMineOpts = {
  onMutate?: (v: { picks: Pick[] }) => unknown;
  onError?: (
    err: unknown,
    v: { picks: Pick[] },
    ctx: { previous?: Pick[] },
  ) => void;
};

type Cool = { topicId: string; label: string; cool: number };
type WarmOpts = {
  onMutate?: (v: { topicId: string }) => unknown;
  onError?: (
    err: unknown,
    v: { topicId: string },
    ctx: { previous?: Cool[] },
  ) => void;
};

const {
  mutateMock,
  setWeightMock,
  resetMock,
  toastMock,
  invalidateMock,
  warmMock,
  coolsInvalidateMock,
  state,
} = vi.hoisted(() => ({
  mutateMock: vi.fn<(v: { picks: Pick[] }) => void>(),
  setWeightMock: vi.fn(),
  resetMock: vi.fn(),
  toastMock: vi.fn<(text: string) => void>(),
  invalidateMock: vi.fn(),
  warmMock: vi.fn<(v: { topicId: string }) => void>(),
  coolsInvalidateMock: vi.fn(),
  state: {
    topics: [] as { id: string; label: string; facet: string }[],
    mine: [] as Pick[],
    mineOpts: undefined as SetMineOpts | undefined,
    taste: null as ProfileTaste | null,
    cools: [] as { topicId: string; label: string; cool: number }[],
    warmOpts: undefined as WarmOpts | undefined,
  },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      topics: {
        cools: {
          invalidate: coolsInvalidateMock,
          cancel: vi.fn(),
          getData: () => state.cools,
          setData: (_input: unknown, updater: unknown) => {
            state.cools =
              typeof updater === "function"
                ? (updater as (p: Cool[]) => Cool[])(state.cools)
                : (updater as Cool[]);
          },
        },
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
      taste: { useQuery: () => ({ data: state.taste }) },
      cools: { useQuery: () => ({ data: state.cools }) },
      warm: {
        useMutation: (opts?: WarmOpts) => {
          state.warmOpts = opts;
          return {
            mutate: (v: { topicId: string }) => {
              void opts?.onMutate?.(v);
              warmMock(v);
            },
          };
        },
      },
      setMine: {
        useMutation: (opts?: SetMineOpts) => {
          state.mineOpts = opts;
          return {
            mutate: (v: { picks: Pick[] }) => {
              void opts?.onMutate?.(v);
              mutateMock(v);
            },
            isPending: false,
          };
        },
      },
      setWeight: {
        useMutation: () => ({ mutate: setWeightMock, isPending: false }),
      },
      resetWeights: {
        useMutation: () => ({ mutate: resetMock, isPending: false }),
      },
    },
  },
}));

/** The tab renders inside the hub, which owns the toast, and under the app's
 *  `QueryClientProvider`, which the screen asks how many writes are queued. */
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
const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: Providers });

const TOPICS = [
  { id: "astronomy", label: "Astronomy", facet: "subject" },
  { id: "botany", label: "Botany", facet: "subject" },
  { id: "books", label: "Books", facet: "subject" },
  { id: "ceramics", label: "Ceramics", facet: "medium" },
  { id: "album-art", label: "Album art", facet: "medium" },
  { id: "japan", label: "Japan", facet: "place" },
];
const search = (text: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Add a topic" }), {
    target: { value: text },
  });
const results = () =>
  screen.queryAllByRole("button", { name: /^Add / }).map((b) => b.textContent);
const levelRow = (label: string) =>
  screen.getByRole("group", { name: `${label} level` });
const lastWrite = () => mutateMock.mock.calls.at(-1)![0].picks;

beforeEach(() => {
  for (const m of [
    mutateMock,
    setWeightMock,
    resetMock,
    toastMock,
    invalidateMock,
    warmMock,
    coolsInvalidateMock,
  ])
    m.mockReset();
  state.cools = [];
  state.topics = TOPICS;
  state.taste = null;
  state.mine = [
    { topicId: "astronomy", weight: 2 },
    { topicId: "ceramics", weight: 1 },
  ];
});

describe("TopicsScreen", () => {
  it("lists the reader's topics under facet headings, with no group chips", () => {
    state.mine = [
      { topicId: "astronomy", weight: 2 },
      { topicId: "ceramics", weight: 1 },
      { topicId: "japan", weight: 1 },
    ];
    render(<TopicsScreen dev={false} />);
    // "3 on." then the second sentence in italics (DESIGN_redesign §6.5).
    const summary = screen.getByText(
      (_, el) =>
        el?.tagName === "P" &&
        el.textContent === "3 on. Changes save as you go.",
    );
    expect(
      within(summary).getByText("Changes save as you go.").className,
    ).toContain("italic");
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Subjects", "Mediums & traditions", "Places"]);
    expect(
      screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Astronomy level", "Ceramics level", "Japan level"]);
    expect(
      screen.queryByRole("button", { name: /Space|Plants|Show all/ }),
    ).toBeNull();
  });

  it("offers search results as outline buttons", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Add a topic" }), {
      target: { value: "bot" },
    });
    expect(
      screen.getByRole("button", { name: "Add Botany" }).className,
    ).toContain("border-ink/35");
  });

  it("moves focus in the order drawn — by heading, then label — when a row goes", async () => {
    // Drawn: Subjects [Astronomy], Mediums [Album art], Places [Japan]. Label order alone would
    // put Album art first and send focus from Astronomy to Japan.
    state.mine = [
      { topicId: "album-art", weight: 1 },
      { topicId: "astronomy", weight: 1 },
      { topicId: "japan", weight: 1 },
    ];
    const { rerender } = render(<TopicsScreen dev={false} />);
    fireEvent.click(
      within(levelRow("Astronomy")).getByRole("radio", { name: "off" }),
    );
    await waitFor(() => expect(state.mine).toHaveLength(2));
    rerender(<TopicsScreen dev={false} />);
    expect(
      within(levelRow("Album art")).getByRole("radio", { name: "some" }),
    ).toHaveFocus();
  });

  describe("search", () => {
    it("shows nothing until something is typed", () => {
      render(<TopicsScreen dev={false} />);
      expect(results()).toEqual([]);
    });

    it("matches labels anywhere, ignoring case, names that start with the words first", () => {
      render(<TopicsScreen dev={false} />);
      search("  BO ");
      // Botany and Books start with it; nothing else contains it.
      expect(results()).toEqual(["Add Books", "Add Botany"]);
      search("art");
      expect(results()).toEqual(["Add Album art"]);
    });

    it("never offers a topic the reader already has", () => {
      render(<TopicsScreen dev={false} />);
      search("a");
      expect(results()).not.toContain("Add Astronomy");
      expect(results()).not.toContain("Add Ceramics");
    });

    it("offers at most eight", () => {
      state.topics = Array.from({ length: 20 }, (_, i) => ({
        id: `t${i}`,
        label: `Topic ${String(i).padStart(2, "0")}`,
        facet: "subject",
      }));
      state.mine = [{ topicId: "t0", weight: 1 }];
      render(<TopicsScreen dev={false} />);
      search("topic");
      expect(results()).toHaveLength(8);
    });

    it("says so when nothing matches", () => {
      render(<TopicsScreen dev={false} />);
      search("zzz");
      expect(screen.getByText("No topics match “zzz”.")).toBeInTheDocument();
    });

    it("adding writes the whole set plus the new topic at 'a lot', and clears the box", () => {
      render(<TopicsScreen dev={false} />);
      search("bot");
      fireEvent.click(screen.getByRole("button", { name: "Add Botany" }));
      expect(lastWrite()).toEqual([
        { topicId: "astronomy", weight: 2 },
        { topicId: "ceramics", weight: 1 },
        // Naming one topic by itself is a strong signal (`pickWeight(1)`).
        { topicId: "botany", weight: 2 },
      ]);
      expect(screen.getByRole("searchbox")).toHaveValue("");
    });
  });

  it("a level change is one setWeight, touching no other topic", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(
      within(levelRow("Ceramics")).getByRole("radio", { name: "a little" }),
    );
    expect(setWeightMock).toHaveBeenCalledExactlyOnceWith({
      topicId: "ceramics",
      level: "little",
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("off removes the topic through setMine", () => {
    render(<TopicsScreen dev={false} />);
    fireEvent.click(
      within(levelRow("Ceramics")).getByRole("radio", { name: "off" }),
    );
    expect(lastWrite()).toEqual([{ topicId: "astronomy", weight: 2 }]);
  });

  it("removing a row by keyboard leaves focus on the next row, or the previous when it was last", async () => {
    state.mine = [
      { topicId: "astronomy", weight: 1 },
      { topicId: "botany", weight: 1 },
      { topicId: "ceramics", weight: 1 },
    ];
    const { rerender } = render(<TopicsScreen dev={false} />);
    // Botany: arrow onto "off" (focus only), then Space to choose it.
    const some = within(levelRow("Botany")).getByRole("radio", {
      name: "some",
    });
    some.focus();
    fireEvent.keyDown(some, { key: "End" });
    const off = within(levelRow("Botany")).getByRole("radio", { name: "off" });
    expect(off).toHaveFocus();
    expect(mutateMock).not.toHaveBeenCalled();
    fireEvent.keyDown(off, { key: " " });
    await waitFor(() => expect(state.mine).toHaveLength(2));
    rerender(<TopicsScreen dev={false} />);
    // The next row (Ceramics), its checked radio — not <body>.
    expect(
      within(levelRow("Ceramics")).getByRole("radio", { name: "some" }),
    ).toHaveFocus();

    // Now remove the last row: focus goes to the previous one.
    const cOff = within(levelRow("Ceramics")).getByRole("radio", {
      name: "off",
    });
    fireEvent.click(cOff);
    await waitFor(() => expect(state.mine).toHaveLength(1));
    rerender(<TopicsScreen dev={false} />);
    expect(
      within(levelRow("Astronomy")).getByRole("radio", { name: "some" }),
    ).toHaveFocus();
  });

  it("refuses to switch off the last topic, with a toast and no write", () => {
    state.mine = [{ topicId: "astronomy", weight: 1 }];
    render(<TopicsScreen dev={false} />);
    fireEvent.click(
      within(levelRow("Astronomy")).getByRole("radio", { name: "off" }),
    );
    expect(mutateMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Keep at least one topic.");
  });

  it("a refused removal leaves no focus hand-off waiting", async () => {
    state.mine = [{ topicId: "astronomy", weight: 1 }];
    const { rerender } = render(<TopicsScreen dev={false} />);
    const off = within(levelRow("Astronomy")).getByRole("radio", {
      name: "off",
    });
    off.focus();
    fireEvent.click(off);
    expect(toastMock).toHaveBeenCalledWith("Keep at least one topic.");
    expect(off).toHaveFocus();

    // Later the row leaves by another path — a refetch after a retake, say. The hand-off the
    // refused click wrote must not fire now and yank focus into the search box.
    state.mine = [];
    rerender(<TopicsScreen dev={false} />);
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("a failed save puts the picks back and says so", async () => {
    render(<TopicsScreen dev={false} />);
    const previous = [...state.mine];
    fireEvent.click(
      within(levelRow("Ceramics")).getByRole("radio", { name: "off" }),
    );
    // The optimistic patch lands a tick later: `onMutate` awaits `cancel()` first.
    await waitFor(() => expect(state.mine).toHaveLength(1));
    state.mineOpts!.onError!(new Error("x"), { picks: [] }, { previous });
    expect(state.mine).toEqual(previous);
    expect(toastMock).toHaveBeenCalledWith("Couldn't save that — try again.");
  });

  it("links to the questionnaire as a retake", () => {
    render(<TopicsScreen dev={false} />);
    expect(
      screen.getByRole("link", { name: "Retake the questions" }),
    ).toHaveAttribute("href", "/onboarding?retake=1");
  });

  it("shows Reset weights only on a dev build", () => {
    const { unmount } = render(<TopicsScreen dev={false} />);
    expect(screen.queryByRole("button", { name: "Reset weights" })).toBeNull();
    unmount();
    render(<TopicsScreen dev />);
    fireEvent.click(screen.getByRole("button", { name: "Reset weights" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  // First Exhibition (docs/DESIGN_first-exhibition.md §6): the stored exhibition, above the list.
  describe("the exhibition card", () => {
    const taste: ProfileTaste = {
      v: 1,
      hang: [],
      title: { adjective: "Quiet", noun: "Weathers" },
      wings: ["land"],
      mediums: ["ceramics"],
      temperament: {
        communal: 0,
        aesthetic: 1,
        dark: 0,
        thrilling: 0,
        cerebral: 0,
      },
      compass: null,
      opened: [],
      readingMinutes: null,
    };

    it("shows the stored exhibition below the topic search, above the level rows", () => {
      state.taste = taste;
      render(<TopicsScreen dev={false} />);
      const title = screen.getByRole("heading", { name: "Quiet Weathers" });
      const search = screen.getByText("Add a topic");
      const rows = screen.getByRole("heading", {
        level: 2,
        name: "Your topics",
      });
      // DESIGN_redesign §6.5: summary, search, then the exhibition, then the rows.
      expect(
        search.compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        title.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Medium labels come from topics.list. (The "Mostly …" half is its own <em>.)
      expect(screen.getByText(/^Land, sea & sky\./)).toHaveTextContent(
        "Land, sea & sky. Mostly ceramics.",
      );
    });

    it("shows the stored hang under the subtitle for a v2 taste", () => {
      state.taste = {
        ...taste,
        v: 2,
        hang: [
          { itemId: "a", src: "/api/img/a", title: "Heron" },
          { itemId: "b", src: "/api/img/b", title: "Lantern" },
        ],
      };
      render(<TopicsScreen dev={false} />);
      const hang = screen.getByRole("list", { name: "Hung pictures" });
      expect(within(hang).getByText("01 · Heron")).toBeInTheDocument();
      expect(within(hang).getByText("02 · Lantern")).toBeInTheDocument();
    });

    it("shows no hang, and does not throw, for a v1 taste", () => {
      state.taste = taste;
      render(<TopicsScreen dev={false} />);
      expect(
        screen.getByRole("heading", { name: "Quiet Weathers" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Hung pictures" })).toBeNull();
    });

    it("shows no card for a reader with no stored taste", () => {
      render(<TopicsScreen dev={false} />);
      expect(screen.queryByText("Your first exhibition")).toBeNull();
    });
  });

  describe("Showing less of", () => {
    const COOLS = [
      { topicId: "japan", label: "Japan", cool: 0.5 },
      { topicId: "books", label: "Books", cool: 0.7 },
    ];

    it("is absent when nothing is cooled", () => {
      render(<TopicsScreen dev={false} />);
      expect(screen.queryByText("Showing less of")).toBeNull();
    });

    it("lists the cooled topics with a count, a Warm up each, and the helper", () => {
      state.cools = COOLS;
      render(<TopicsScreen dev={false} />);
      const section = screen
        .getByRole("heading", { level: 2, name: "Showing less of" })
        .closest("section")!;
      expect(within(section).getByText("2")).toBeTruthy();
      expect(within(section).getByText("Japan")).toBeTruthy();
      expect(within(section).getByText("Books")).toBeTruthy();
      expect(
        within(section).getAllByRole("button", { name: "Warm up" }),
      ).toHaveLength(2);
      expect(
        within(section).getByText(/^Cooled by “Less of this”\./).textContent,
      ).toContain("won't drift or jump to these until you warm them up.");
    });

    it("Warm up removes the row at once, toasts, and rolls back on error", async () => {
      state.cools = COOLS;
      const { rerender } = render(<TopicsScreen dev={false} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Warm up" })[0]!);
      expect(warmMock).toHaveBeenCalledWith({ topicId: "japan" });
      expect(toastMock).toHaveBeenCalledWith("Warmed up Japan");
      // `onMutate` awaits `cancel()` first, so the patch lands a microtask later.
      await waitFor(() =>
        expect(state.cools.map((c) => c.topicId)).toEqual(["books"]),
      );
      const previous = COOLS;

      // A failed write puts the snapshot back and says so.
      state.warmOpts!.onError!(
        new Error("x"),
        { topicId: "japan" },
        {
          previous,
        },
      );
      rerender(<TopicsScreen dev={false} />);
      expect(state.cools).toEqual(COOLS);
      expect(toastMock).toHaveBeenCalledWith("Couldn't save that — try again.");
    });
  });
});
