// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsScreen } from "./settings-screen";

// The screen's subject: which rows are real, which are honest stubs, and what each one does. The
// two capability-backed rows (notifications, accent) are the interesting ones — both read state
// that doesn't exist during a server render, so both are asserted against a stubbed global rather
// than a mocked hook, which is the only way to prove the real branching.
const {
  topicsData,
  myTopicsData,
  pushMock,
  replaceMock,
  backMock,
  setMineMutateMock,
  setMineOpts,
  invalidateMock,
  signOutMock,
  installState,
  promptMock,
  purgeMock,
} = vi.hoisted(() => ({
  topicsData: { current: [] as { id: string; label: string }[] },
  myTopicsData: { current: [] as string[] },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  setMineMutateMock: vi.fn(),
  setMineOpts: {
    current: undefined as undefined | { onSuccess: () => void },
  },
  invalidateMock: vi.fn().mockResolvedValue(undefined),
  signOutMock: vi.fn().mockResolvedValue(undefined),
  installState: { current: { standalone: false, canPrompt: false } },
  promptMock: vi.fn().mockResolvedValue("accepted"),
  purgeMock: vi.fn().mockResolvedValue(undefined),
}));

// The install row reads two things no test environment provides: the display mode, and Chromium's
// deferred install prompt. Both are stubbed at the module boundary the same way the notification
// permission already is.
vi.mock("~/lib/install-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/install-store")>();
  return {
    ...actual,
    isStandalone: () => installState.current.standalone,
    useInstall: () => ({
      canPrompt: installState.current.canPrompt,
      installed: false,
      prompt: promptMock,
    }),
  };
});

vi.mock("~/lib/sw-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/sw-rules")>();
  return { ...actual, purgePagesCache: purgeMock };
});

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ topics: { mine: { invalidate: invalidateMock } } }),
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
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));

vi.mock("~/lib/auth-client", () => ({ authClient: { signOut: signOutMock } }));

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
  return render(<SettingsScreen versionLabel="v0.5" />);
}

beforeEach(() => {
  topicsData.current = TOPICS;
  myTopicsData.current = ["astronomy", "botany", "music"];
  sessionStorage.clear();
  localStorage.clear();
  stubNotifications("default");
  installState.current = { standalone: false, canPrompt: false };
  promptMock.mockClear();
  purgeMock.mockClear();
  pushMock.mockClear();
  replaceMock.mockClear();
  backMock.mockClear();
  setMineMutateMock.mockClear();
  invalidateMock.mockClear();
  signOutMock.mockClear();
  document.documentElement.removeAttribute("data-accent");
});

afterEach(() => vi.unstubAllGlobals());

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
    expect(screen.getByText("Ambit · invite-only · v0.5")).toBeInTheDocument();
  });

  // Inside the hub's wide column (docs/DESIGN_list-screens.md §6) the rows sit left-aligned at
  // the list measure. One cap, not two: there is no header of its own any more.
  it("caps itself at the list measure, left-aligned, with no header and no <main>", () => {
    renderScreen();
    expect(document.querySelectorAll(".md\\:max-w-\\[600px\\]")).toHaveLength(
      1,
    );
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Everything kept")).toBeNull();
    expect(document.querySelector("main")).toBeNull();
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

  it("the 'What you see' and 'Account details' rows switch tabs in place", () => {
    renderScreen();
    fireEvent.click(screen.getByText("What you see"));
    expect(replaceMock).toHaveBeenCalledWith("/profile/topics");
    fireEvent.click(screen.getByText("Account details"));
    expect(replaceMock).toHaveBeenCalledWith("/profile/edit");
    expect(pushMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("ambit.profileEditOrigin.v1")).toBeNull();
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

describe("SettingsScreen — Add to home screen", () => {
  it("offers the instruction sheet when the browser has no prompt", () => {
    installState.current = { standalone: false, canPrompt: false };
    renderScreen();

    fireEvent.click(screen.getByText("Add to home screen"));

    // The sheet's own title, which is the same string — two nodes now carry it.
    expect(screen.getAllByText("Add to home screen").length).toBeGreaterThan(1);
    expect(promptMock).not.toHaveBeenCalled();
  });

  it("fires the browser's real prompt when there is one", () => {
    installState.current = { standalone: false, canPrompt: true };
    renderScreen();

    fireEvent.click(screen.getByText("Add to home screen"));

    expect(promptMock).toHaveBeenCalledOnce();
  });

  it("says 'Installed' and offers nothing once the app is on the home screen", () => {
    installState.current = { standalone: true, canPrompt: false };
    renderScreen();

    expect(screen.getByText("Installed")).toBeInTheDocument();
    // The action pill is gone — there is nothing left to do from here.
    expect(screen.queryByText("Install")).not.toBeInTheDocument();
  });
});

describe("SettingsScreen — sign out", () => {
  it("signs out and returns to the landing page", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutMock).toHaveBeenCalledOnce();
    // The cached feed document goes with the session — it carries the last reader's first page.
    expect(purgeMock).toHaveBeenCalledOnce();
    // The push waits on the promise; flush the microtask queue before asserting it.
    await act(async () => undefined);
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
