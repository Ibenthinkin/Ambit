// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsScreen } from "./settings-screen";

// The screen's subject: which rows are real, which are honest stubs, and what each one does. The
// two capability-backed rows (notifications, accent) are the interesting ones — both read state
// that doesn't exist during a server render, so both are asserted against a stubbed global rather
// than a mocked hook, which is the only way to prove the real branching.
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
  savedCount,
  topicsData,
  myTopicsData,
  pushMock,
  backMock,
  setMineMutateMock,
  setMineOpts,
  invalidateMock,
  signOutMock,
} = vi.hoisted(() => ({
  meState: { current: blankQuery() },
  savedCount: { current: 0 },
  topicsData: { current: [] as { id: string; label: string }[] },
  myTopicsData: { current: [] as string[] },
  pushMock: vi.fn(),
  backMock: vi.fn(),
  setMineMutateMock: vi.fn(),
  setMineOpts: {
    current: undefined as undefined | { onSuccess: () => void },
  },
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  signOutMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ topics: { mine: { invalidate: invalidateMock } } }),
    user: {
      me: { useQuery: () => ({ ...meState.current, refetch: vi.fn() }) },
    },
    saves: { count: { useQuery: () => ({ data: savedCount.current }) } },
    topics: {
      list: { useQuery: () => ({ data: topicsData.current }) },
      mine: { useQuery: () => ({ data: myTopicsData.current }) },
      setMine: {
        useMutation: (opts: NonNullable<typeof setMineOpts.current>) => {
          setMineOpts.current = opts;
          return { mutate: setMineMutateMock, isPending: false };
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: backMock }),
}));

vi.mock("~/lib/auth-client", () => ({ authClient: { signOut: signOutMock } }));

const ME = {
  id: "user_abc123",
  name: "Ben Traverse",
  email: "ben@example.test",
  handle: "bentraverse",
  bio: null,
};

const TOPICS = [
  { id: "astronomy", label: "Astronomy" },
  { id: "botany", label: "Botany" },
  { id: "music", label: "Music" },
  { id: "cartography", label: "Cartography" },
  { id: "poetry", label: "Poetry" },
];

/** Puts a `Notification` global in place with a given standing answer. */
function stubNotifications(
  permission: "default" | "granted" | "denied",
  requestPermission = vi.fn().mockResolvedValue(permission),
) {
  vi.stubGlobal("Notification", { permission, requestPermission });
  return requestPermission;
}

function renderScreen() {
  return render(<SettingsScreen versionLabel="v0.4" />);
}

beforeEach(() => {
  meState.current = { data: ME, isPending: false, isError: false };
  savedCount.current = 4;
  topicsData.current = TOPICS;
  myTopicsData.current = ["astronomy", "botany", "music"];
  sessionStorage.clear();
  localStorage.clear();
  stubNotifications("default");
  pushMock.mockClear();
  backMock.mockClear();
  setMineMutateMock.mockClear();
  invalidateMock.mockClear();
  signOutMock.mockClear();
  document.documentElement.removeAttribute("data-accent");
});

afterEach(() => vi.unstubAllGlobals());

describe("SettingsScreen — shortcut cards", () => {
  it("shows the name and pluralizes the save count", () => {
    renderScreen();
    expect(screen.getByText("Ben Traverse")).toBeInTheDocument();
    expect(screen.getByText("4 saves")).toBeInTheDocument();

    savedCount.current = 1;
    renderScreen();
    expect(screen.getAllByText("1 save").length).toBeGreaterThan(0);
  });

  it("each card writes its own marker before navigating", () => {
    renderScreen();

    fireEvent.click(screen.getByText("Edit profile"));
    expect(sessionStorage.getItem("ambit.profileEditOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/profile/edit");

    fireEvent.click(screen.getByText("Everything kept"));
    expect(sessionStorage.getItem("ambit.savedOrigin.v1")).toBe("1");
    expect(pushMock).toHaveBeenCalledWith("/saved");
  });
});

describe("SettingsScreen — rows", () => {
  it("renders every designed row", () => {
    renderScreen();
    for (const label of [
      "Account details",
      "Invite a friend",
      "Add to home screen",
      "What you see",
      "Muted sources",
      "Serendipity",
      "Camera roll",
      "Notifications",
      "Appearance",
      "Language",
      "About Ambit",
      "Get in touch",
      "Sign out",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("stub rows carry no invented values and say so when tapped", () => {
    renderScreen();

    // The prototype's demo values are gone: no "2 left", no "Often", no "Not determined".
    for (const fake of ["2 left", "Often", "Not determined"]) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
    // The two stub rows whose value is genuinely true keep it.
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Serendipity"));
    expect(screen.getByText("Serendipity · coming soon")).toBeInTheDocument();
  });

  it("shows the version footer it was handed", () => {
    renderScreen();
    expect(screen.getByText("Ambit · invite-only · v0.4")).toBeInTheDocument();
  });

  it("back pops when marked and pushes to /profile when opened cold", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(pushMock).toHaveBeenCalledWith("/profile");
    expect(backMock).not.toHaveBeenCalled();

    sessionStorage.setItem("ambit.settingsOrigin.v1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(backMock).toHaveBeenCalledOnce();
  });
});

describe("SettingsScreen — What you see", () => {
  it("labels the row with three picks alphabetically, then an overflow count", () => {
    renderScreen();
    expect(screen.getByText("Astronomy, Botany, Music")).toBeInTheDocument();

    // Alphabetical, not catalog order — Cartography sorts ahead of Music even though it comes
    // after it in TOPICS. Neither `topics.list` nor `topics.mine` is ordered, so this is the only
    // thing that makes the row read the same twice running.
    myTopicsData.current = [
      "astronomy",
      "botany",
      "music",
      "cartography",
      "poetry",
    ];
    renderScreen();
    expect(
      screen.getAllByText("Astronomy, Botany, Cartography +2").length,
    ).toBeGreaterThan(0);
  });

  it("says so when nothing is picked at all", () => {
    myTopicsData.current = [];
    renderScreen();
    expect(screen.getByText("Nothing picked")).toBeInTheDocument();
  });

  it("opens preselected, saves the toggled set, and invalidates", () => {
    renderScreen();

    fireEvent.click(screen.getByText("What you see"));
    // Preselected from `topics.mine` — `aria-pressed` is the Chip primitive's own state.
    expect(
      screen.getByRole("button", { name: "Astronomy", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cartography", pressed: false }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cartography" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setMineMutateMock).toHaveBeenCalledWith({
      topicIds: ["astronomy", "botany", "music", "cartography"],
    });

    act(() => setMineOpts.current!.onSuccess());
    expect(invalidateMock).toHaveBeenCalled();
    expect(screen.getByText("Feed updated")).toBeInTheDocument();
  });

  it("disables Save at zero picks, but allows two — the gate is 1, not onboarding's 3", () => {
    renderScreen();
    fireEvent.click(screen.getByText("What you see"));

    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.click(screen.getByRole("button", { name: "Astronomy" }));
    // Two left: an established reader narrowing their feed must not be blocked.
    expect(save).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Botany" }));
    fireEvent.click(screen.getByRole("button", { name: "Music" }));
    expect(save).toBeDisabled();
  });
});

describe("SettingsScreen — Notifications", () => {
  it("reports the browser's standing answer", () => {
    stubNotifications("granted");
    renderScreen();
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("marks a denied permission in the warn tint", () => {
    stubNotifications("denied");
    renderScreen();
    const value = screen.getByText("Off");
    expect(value).toBeInTheDocument();
    expect(value).toHaveClass("text-error");
  });

  it("prompts from the unanswered state", () => {
    const requestPermission = stubNotifications("default");
    renderScreen();

    expect(screen.getByText("Not asked")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Notifications"));
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("routes an already-answered tap to the browser-settings toast, not a dead prompt", () => {
    const requestPermission = stubNotifications("granted");
    renderScreen();

    fireEvent.click(screen.getByText("Notifications"));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(
      screen.getByText("Change this in your browser settings."),
    ).toBeInTheDocument();
  });

  it("says Unavailable — and offers no prompt — where the API doesn't exist", () => {
    // iOS Safari outside an installed PWA leaves no `Notification` at all; a webview can leave the
    // key present with an undefined value. Both must read as unsupported.
    vi.stubGlobal("Notification", undefined);
    renderScreen();

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Notifications"));
    expect(
      screen.getByText("Notifications aren't available in this browser."),
    ).toBeInTheDocument();
  });
});

describe("SettingsScreen — Appearance", () => {
  it("applies a picked accent to <html>, persists it, and relabels the row", () => {
    renderScreen();

    fireEvent.click(screen.getByText("Appearance"));
    fireEvent.click(screen.getByText("Amber"));

    // The live mechanism — globals.css keys `--accent-raw` off this attribute.
    expect(document.documentElement.dataset.accent).toBe("amber");
    expect(localStorage.getItem("ambit.accent.v1")).toBe("amber");
    expect(screen.getAllByText("Amber").length).toBeGreaterThan(0);
  });
});

describe("SettingsScreen — sign out", () => {
  it("signs out and returns to the landing page", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutMock).toHaveBeenCalledOnce();
    // The push waits on the promise; flush the microtask queue before asserting it.
    await act(async () => undefined);
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
