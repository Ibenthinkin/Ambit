// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONTACT_EMAIL, contactMailto } from "~/config/contact";

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
  readingData,
  setReadingMutateMock,
  setReadingOpts,
} = vi.hoisted(() => ({
  // `user.readingAmount`: null until the reader says (the questionnaire, or this screen).
  readingData: { current: null as string | null },
  setReadingMutateMock: vi.fn(),
  setReadingOpts: {
    current: undefined as undefined | { onSuccess: () => void },
  },
  topicsData: { current: [] as { id: string; label: string }[] },
  // `topics.mine` carries a weight alongside each id — this screen only reads ids off it (see
  // `topicValue` in the screen), but the mock has to model the real return shape.
  myTopicsData: { current: [] as { topicId: string; weight: number }[] },
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
    useUtils: () => ({
      topics: { mine: { invalidate: invalidateMock } },
      user: { readingAmount: { invalidate: invalidateMock, setData: vi.fn() } },
      feed: { invalidate: invalidateMock },
    }),
    user: {
      readingAmount: { useQuery: () => ({ data: readingData.current }) },
      setReadingAmount: {
        useMutation: (opts: NonNullable<typeof setReadingOpts.current>) => {
          setReadingOpts.current = opts;
          return { mutate: setReadingMutateMock, isPending: false };
        },
      },
    },
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

/** This screen never looks at the weight, so every fixture pick gets a plain 1. */
function asPicks(ids: string[]) {
  return ids.map((topicId) => ({ topicId, weight: 1 }));
}

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
  myTopicsData.current = asPicks(["astronomy", "botany", "music"]);
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
  setReadingMutateMock.mockClear();
  readingData.current = null;
  invalidateMock.mockClear();
  signOutMock.mockClear();
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
      "Reading",
      "Serendipity",
      "Notifications",
      "About Ambit",
      "Get in touch",
      "Sign out",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("the prototype's stub rows are gone; the remaining stubs say so when tapped", () => {
    renderScreen();

    // The prototype's demo values are gone: no "2 left", no "Often", no "Not determined".
    for (const fake of ["2 left", "Often", "Not determined"]) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
    // The rows that were stubs with nothing true to say are gone (DESIGN_redesign §6.5).
    for (const gone of ["Muted sources", "Camera roll", "Language"]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByText("Serendipity"));
    expect(screen.getByText("Serendipity · coming soon")).toBeInTheDocument();
  });

  it("Get in touch shows the public address and opens a mailto to it", () => {
    // jsdom's `location.href` setter navigates (and logs "not implemented"), so the setter is
    // swapped for a spy for the one tap.
    const assign = vi.fn();
    vi.stubGlobal("location", {
      get href() {
        return "";
      },
      set href(v: string) {
        assign(v);
      },
    });
    renderScreen();
    expect(screen.getByText(CONTACT_EMAIL)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Get in touch"));
    expect(assign).toHaveBeenCalledWith(contactMailto("Ambit"));
  });

  it("shows the version footer it was handed", () => {
    renderScreen();
    expect(screen.getByText("Ambit · invite-only · v0.5")).toBeInTheDocument();
  });

  // Inside the hub's wide column (docs/DESIGN_list-screens.md §6) the rows sit left-aligned at
  // the list measure. One cap, not two: there is no header of its own any more.
  it("caps itself at the list measure, left-aligned, with no header and no <main>", () => {
    renderScreen();
    expect(document.querySelectorAll(".md\\:max-w-\\[720px\\]")).toHaveLength(
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
    myTopicsData.current = asPicks([
      "astronomy",
      "botany",
      "music",
      "cartography",
      "poetry",
    ]);
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

  it("marks a denied permission with the green attention dot, not a coloured value", () => {
    stubNotifications("denied");
    renderScreen();
    const value = screen.getByText("Off");
    expect(value).not.toHaveClass("text-error");
    const row = value.closest("button")!;
    const dot = row.querySelector("[data-attention-dot]");
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-accent");
  });

  it("shows no attention dot when the permission is granted", () => {
    stubNotifications("granted");
    renderScreen();
    expect(document.querySelector("[data-attention-dot]")).toBeNull();
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
  // The accent knob was retired in redesign Task 1.3: one colour, so nothing to pick.
  it("has no Appearance row", () => {
    renderScreen();
    expect(screen.queryByText("Appearance")).toBeNull();
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

// The per-person reading amount (10-02-26): the questionnaire's last question, changeable here.
describe("SettingsScreen — Reading", () => {
  const row = () => screen.getByText("Reading").closest("button")!;

  it("shows the reader's amount on the row; never having said reads as the default, Some", () => {
    renderScreen();
    expect(row()).toHaveTextContent("Some");
  });

  it("shows a chosen amount by its label", () => {
    readingData.current = "none";
    renderScreen();
    expect(row()).toHaveTextContent("None");
  });

  it("opens a sheet of the four amounts, and a pick is saved", () => {
    renderScreen();
    fireEvent.click(row());
    const sheet = screen.getByRole("dialog", { name: "Reading" });
    expect(sheet).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "A lot" }));
    expect(setReadingMutateMock).toHaveBeenCalledExactlyOnceWith({
      amount: "lot",
    });
  });

  it("a saved pick refreshes the amount and the feed composed from the old one", () => {
    renderScreen();
    act(() => setReadingOpts.current!.onSuccess());
    // The amount's own query, and every cached feed page.
    expect(invalidateMock).toHaveBeenCalledTimes(2);
  });
});
