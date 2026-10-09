// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MoreOrLess } from "./more-or-less";

type Mine = { more: string[]; less: string[] };
type SetOpts = {
  onMutate: (v: { itemId: string; verdict: "more" | "less" }) => Promise<{
    previous?: Mine;
  }>;
  onError: (e: unknown, v: unknown, ctx?: { previous?: Mine }) => void;
  onSuccess: (r: unknown, v: { verdict: "more" | "less" }) => void;
  onSettled: () => unknown;
};
type ClearOpts = {
  onMutate: (v: { itemId: string }) => Promise<{ previous?: Mine }>;
  onSuccess: () => void;
};

const h = vi.hoisted(() => ({
  mine: { current: { more: [] as string[], less: [] as string[] } },
  mineEnabled: { current: undefined as boolean | undefined },
  setMutate: vi.fn(),
  clearMutate: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- vi.hoisted widens
  setOpts: { current: null } as { current: unknown },
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- vi.hoisted widens
  clearOpts: { current: null } as { current: unknown },
  setData: vi.fn(),
  getData: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feedback: {
        mine: {
          cancel: vi.fn().mockResolvedValue(undefined),
          getData: h.getData,
          setData: h.setData,
          invalidate: h.invalidate,
        },
        list: { invalidate: h.invalidate },
      },
      topics: {
        cools: { invalidate: h.invalidate },
        mine: { invalidate: h.invalidate },
      },
    }),
    feedback: {
      mine: {
        useQuery: (_: undefined, o: { enabled: boolean }) => {
          h.mineEnabled.current = o.enabled;
          return { data: o.enabled ? h.mine.current : undefined };
        },
      },
      set: {
        useMutation: (o: unknown) => {
          h.setOpts.current = o;
          return { mutate: h.setMutate };
        },
      },
      clear: {
        useMutation: (o: unknown) => {
          h.clearOpts.current = o;
          return { mutate: h.clearMutate };
        },
      },
    },
  },
}));

// The hoisted slots hold whatever options object the component handed `useMutation`.
const captured = <T,>(slot: { current: unknown }) => slot.current as T;

const base = {
  itemId: "i1",
  topicId: "t1",
  topicLabel: "Cartography",
  size: "phone" as const,
  authed: true,
};
const setup = (over: Partial<Parameters<typeof MoreOrLess>[0]> = {}) => {
  const onToast = vi.fn();
  const onRequireAuth = vi.fn();
  render(
    <MoreOrLess
      {...base}
      onToast={onToast}
      onRequireAuth={onRequireAuth}
      {...over}
    />,
  );
  return { onToast, onRequireAuth };
};

beforeEach(() => {
  h.mine.current = { more: [], less: [] };
  h.mineEnabled.current = undefined;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("MoreOrLess", () => {
  it("renders Less then More, neither pressed at rest", () => {
    setup();
    const group = screen.getByRole("group", { name: "More or less of this" });
    const buttons = group.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Less of this");
    expect(buttons[1]).toHaveTextContent("More of this");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    expect(group.querySelector("p")).toBeNull();
  });

  it("marks the verdict that is on, with its note", () => {
    h.mine.current = { more: ["i1"], less: [] };
    setup();
    expect(
      screen.getByRole("button", { name: /More of this/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Added to your "More of this" shelf/)).toBeTruthy();
  });

  it("names the cooled topic in the less note, and drops it for a null topic", () => {
    h.mine.current = { more: [], less: ["i1"] };
    setup();
    expect(screen.getByText(/Cartography is cooled/)).toBeTruthy();
    cleanup();
    setup({ topicLabel: null, topicId: null });
    expect(
      screen.getByText(/^This one won't come back\. Tap again/),
    ).toBeTruthy();
  });

  it("sets a verdict on tap and clears on tapping the one that is on", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Less of this/ }));
    expect(h.setMutate).toHaveBeenCalledWith({
      itemId: "i1",
      verdict: "less",
      topicId: "t1",
    });
    cleanup();
    h.mine.current = { more: ["i1"], less: [] };
    setup();
    fireEvent.click(screen.getByRole("button", { name: /More of this/ }));
    expect(h.clearMutate).toHaveBeenCalledWith({ itemId: "i1" });
  });

  it("patches feedback.mine optimistically and rolls back on error", async () => {
    const { onToast } = setup();
    const prev: Mine = { more: ["i1"], less: ["x"] };
    h.getData.mockReturnValue(prev);
    const o = captured<SetOpts>(h.setOpts);
    const ctx = await o.onMutate({ itemId: "i1", verdict: "less" });
    expect(ctx.previous).toBe(prev);
    expect(h.setData).toHaveBeenLastCalledWith(undefined, {
      more: [],
      less: ["x", "i1"],
    });
    o.onError(new Error("x"), {}, ctx);
    expect(h.setData).toHaveBeenLastCalledWith(undefined, prev);
    expect(onToast).toHaveBeenCalledWith("Couldn't save that. Try again.");
  });

  it("toasts the drift on success and Undone on clear; clear patches out of both lists", async () => {
    const { onToast } = setup();
    captured<SetOpts>(h.setOpts).onSuccess(
      { drift: { topicLabel: "Cartography", isNew: true } },
      { verdict: "more" },
    );
    expect(onToast).toHaveBeenCalledWith(
      "More of this · Now drifting toward Cartography",
    );
    h.getData.mockReturnValue({ more: ["i1"], less: [] });
    const c = captured<ClearOpts>(h.clearOpts);
    await c.onMutate({ itemId: "i1" });
    expect(h.setData).toHaveBeenLastCalledWith(undefined, {
      more: [],
      less: [],
    });
    c.onSuccess();
    expect(onToast).toHaveBeenLastCalledWith("Undone");
  });

  it("signed out: no query, both buttons ask for sign-in", () => {
    const { onRequireAuth } = setup({ authed: false });
    expect(h.mineEnabled.current).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Less of this/ }));
    fireEvent.click(screen.getByRole("button", { name: /More of this/ }));
    expect(onRequireAuth).toHaveBeenCalledTimes(2);
    expect(h.setMutate).not.toHaveBeenCalled();
  });
});
