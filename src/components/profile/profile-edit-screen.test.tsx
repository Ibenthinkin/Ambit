// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileEditScreen } from "./profile-edit-screen";
import { ProfileHubContext } from "./profile-hub";

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
  toastMock,
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
  toastMock: vi.fn(),
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
  toastMock.mockClear();
});

afterEach(() => vi.useRealTimers());

/** The tab renders inside the hub, which owns the toast — a provider stands in for it. */
function renderScreen() {
  return render(
    <ProfileHubContext.Provider value={{ toast: toastMock }}>
      <ProfileEditScreen />
    </ProfileHubContext.Provider>,
  );
}

describe("ProfileEditScreen", () => {
  it("seeds every field from user.me, with email read-only and explained", () => {
    renderScreen();

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
    renderScreen();

    expect(screen.getByLabelText("Handle")).toHaveValue("");
    expect(screen.getByLabelText("About")).toHaveValue("");
  });

  it("strips a typed @, lowercases, and trims on submit", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "  Ben R  " },
    });
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "@BenTest" },
    });
    fireEvent.change(screen.getByLabelText("About"), {
      target: { value: "  Curious about maps.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saveMutateMock).toHaveBeenCalledWith({
      name: "Ben R",
      handle: "bentest",
      bio: "Curious about maps.",
    });
  });

  it("sends null, not an empty string, for a cleared handle and bio", () => {
    renderScreen();

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

  it("on success: primes the cache, toasts through the hub, and stays on the tab", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const updated = { ...ME, name: "Ben R" };
    act(() => saveOpts.current!.onSuccess(updated));

    expect(setDataMock).toHaveBeenCalledWith(undefined, updated);
    expect(invalidateMock).toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Profile saved");
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
    // …and a second save is possible: the guard released when the write settled.
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saveMutateMock).toHaveBeenCalledTimes(2);
  });

  it("renders a handle conflict under the field and stays put", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    act(() => saveOpts.current!.onError({ data: { code: "CONFLICT" } }));

    expect(screen.getByRole("alert")).toHaveTextContent("That handle's taken.");
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });

  it("clears a stale conflict as soon as the handle is edited", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    act(() => saveOpts.current!.onError({ data: { code: "CONFLICT" } }));

    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "somethingelse" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends any other failure to the centered slot, not the handle field", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    act(() =>
      saveOpts.current!.onError({ data: { code: "INTERNAL_SERVER_ERROR" } }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save — try again.",
    );
  });

  it("Discard puts the loaded values back and navigates nowhere", () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Someone" },
    });
    fireEvent.change(screen.getByLabelText("Handle"), {
      target: { value: "other" },
    });
    fireEvent.change(screen.getByLabelText("About"), { target: { value: "" } });

    fireEvent.click(screen.getByText("Discard"));

    expect(screen.getByLabelText("Name")).toHaveValue("Ben Traverse");
    expect(screen.getByLabelText("Handle")).toHaveValue("bentraverse");
    expect(screen.getByLabelText("About")).toHaveValue("Maps, mostly.");
    expect(saveMutateMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("renders no header and no <main> — the hub owns those", () => {
    renderScreen();
    expect(screen.queryByRole("heading", { name: "Edit profile" })).toBeNull();
    expect(document.querySelector("main")).toBeNull();
  });

  it("guards against a double submit while one is in flight", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saveMutateMock).toHaveBeenCalledOnce();
  });

  it("renders nothing but the error branch when the profile can't be read", () => {
    meState.current = { data: undefined, isPending: false, isError: true };
    renderScreen();

    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  // Inside the hub's wide column (docs/DESIGN_list-screens.md §6) the form sits left-aligned at
  // the list measure. One cap, not two: there is no header of its own any more.
  it("caps itself at the list measure, once", () => {
    renderScreen();
    expect(document.querySelectorAll(".md\\:max-w-\\[600px\\]")).toHaveLength(
      1,
    );
  });
});
