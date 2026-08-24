// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileEditScreen } from "./profile-edit-screen";

// The form's own subject matter: what it seeds from, what it *sends* (normalization is the
// interesting half), and where each kind of failure lands. The zod schema's own rejections are
// `routers.test.ts`'s; the round trip to Postgres is the integration suite's.
/** The shape of a mocked `useQuery` result — annotated rather than asserted, so `data` can hold a
 * profile in one test and `undefined` in the next. */
interface QueryState {
  data: unknown;
  isPending: boolean;
  isError: boolean;
}

/**
 * The return annotation, not an assertion, is what widens `data` from `undefined` to `unknown` so a
 * test can swap a profile in. Declared as a function because `vi.hoisted` runs before any
 * module-level `const` is initialized — a hoisted factory can call this, but can't read a constant.
 */
function blankQuery(): QueryState {
  return { data: undefined, isPending: false, isError: false };
}

const {
  meState,
  pushMock,
  backMock,
  saveMutateMock,
  saveOpts,
  setDataMock,
  invalidateMock,
} = vi.hoisted(() => ({
  meState: { current: blankQuery() },
  pushMock: vi.fn(),
  backMock: vi.fn(),
  saveMutateMock: vi.fn(),
  saveOpts: {
    current: undefined as
      | undefined
      | {
          onSuccess: (row: unknown) => void;
          onError: (err: { data?: { code?: string } }) => void;
        },
  },
  setDataMock: vi.fn(),
  invalidateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      user: { me: { setData: setDataMock, invalidate: invalidateMock } },
    }),
    user: {
      me: { useQuery: () => ({ ...meState.current, refetch: vi.fn() }) },
      updateProfile: {
        useMutation: (opts: NonNullable<typeof saveOpts.current>) => {
          saveOpts.current = opts;
          return { mutate: saveMutateMock, isPending: false };
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
}));

const ME = {
  id: "user_abc123",
  name: "Ben Traverse",
  email: "ben@example.test",
  handle: "bentraverse",
  bio: "Maps, mostly.",
};

beforeEach(() => {
  meState.current = { data: ME, isPending: false, isError: false };
  sessionStorage.clear();
  pushMock.mockClear();
  backMock.mockClear();
  saveMutateMock.mockClear();
  setDataMock.mockClear();
  invalidateMock.mockClear();
});

afterEach(() => vi.useRealTimers());

describe("ProfileEditScreen", () => {
  it("seeds every field from user.me, with email read-only and explained", () => {
    render(<ProfileEditScreen />);

    expect(screen.getByLabelText("Name")).toHaveValue("Ben Traverse");
    expect(screen.getByLabelText("Handle")).toHaveValue("bentraverse");
    expect(screen.getByLabelText("About")).toHaveValue("Maps, mostly.");

    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("ben@example.test");
    expect(email).toHaveAttribute("readonly");
    expect(
      screen.getByText("Only used for your invite and sign-in."),
    ).toBeInTheDocument();
  });

  it("seeds blank fields from nulls rather than rendering 'null'", () => {
    meState.current = {
      data: { ...ME, handle: null, bio: null },
      isPending: false,
      isError: false,
    };
    render(<ProfileEditScreen />);

    expect(screen.getByLabelText("Handle")).toHaveValue("");
    expect(screen.getByLabelText("About")).toHaveValue("");
  });

  it("strips a typed @, lowercases, and trims on submit", () => {
    render(<ProfileEditScreen />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "  Ben R  " },
    });
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "@BenTest" },
    });
    fireEvent.change(screen.getByLabelText("About"), {
      target: { value: "  Curious about maps.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveMutateMock).toHaveBeenCalledWith({
      name: "Ben R",
      handle: "bentest",
      bio: "Curious about maps.",
    });
  });

  it("sends null, not an empty string, for a cleared handle and bio", () => {
    render(<ProfileEditScreen />);

    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("About"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // `""` would collide with every other user who cleared theirs — only NULLs are exempt from the
    // unique constraint.
    expect(saveMutateMock).toHaveBeenCalledWith({
      name: "Ben Traverse",
      handle: null,
      bio: null,
    });
  });

  it("on success: primes the cache, toasts, and leaves after the confirmation beat", () => {
    vi.useFakeTimers();
    render(<ProfileEditScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const updated = { ...ME, name: "Ben R" };
    act(() => saveOpts.current!.onSuccess(updated));

    expect(setDataMock).toHaveBeenCalledWith(undefined, updated);
    expect(invalidateMock).toHaveBeenCalled();
    expect(screen.getByText("Profile saved")).toBeInTheDocument();
    // Still here — the toast has to be readable before the screen goes.
    expect(pushMock).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(900));
    expect(pushMock).toHaveBeenCalledWith("/profile");
  });

  it("renders a handle conflict under the field and stays put", () => {
    render(<ProfileEditScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => saveOpts.current!.onError({ data: { code: "CONFLICT" } }));

    expect(screen.getByRole("alert")).toHaveTextContent("That handle's taken.");
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("clears a stale conflict as soon as the handle is edited", () => {
    render(<ProfileEditScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => saveOpts.current!.onError({ data: { code: "CONFLICT" } }));

    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "somethingelse" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends any other failure to the centered slot, not the handle field", () => {
    render(<ProfileEditScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() =>
      saveOpts.current!.onError({ data: { code: "INTERNAL_SERVER_ERROR" } }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save — try again.",
    );
  });

  it("Discard and the back chevron leave without submitting anything", () => {
    render(<ProfileEditScreen />);

    fireEvent.click(screen.getByText("Discard"));
    expect(saveMutateMock).not.toHaveBeenCalled();
    // No marker: this tab arrived cold, so leaving pushes rather than popping out of the app.
    expect(pushMock).toHaveBeenCalledWith("/profile");

    sessionStorage.setItem("ambit.profileEditOrigin.v1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(backMock).toHaveBeenCalledOnce();
    expect(saveMutateMock).not.toHaveBeenCalled();
  });

  it("guards against a double submit while one is in flight", () => {
    render(<ProfileEditScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saveMutateMock).toHaveBeenCalledOnce();
  });

  it("renders nothing but the error branch when the profile can't be read", () => {
    meState.current = { data: undefined, isPending: false, isError: true };
    render(<ProfileEditScreen />);

    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});
