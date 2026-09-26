// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthSurface, useAuthSurface, type AuthMode } from "./auth-surface";

// The real card needs Better Auth's client; what matters here is which mode it opened in and that
// it remounts per open.
let mounts = 0;
vi.mock("~/components/landing/auth-card", () => ({
  AuthCard: ({ initialMode }: { initialMode?: string }) => {
    mounts++;
    return <div data-testid="auth-card">{initialMode ?? "signin"}</div>;
  },
}));

function Harness({ initial }: { initial?: AuthMode }) {
  const auth = useAuthSurface(initial);
  return (
    <>
      <button type="button" onClick={() => auth.openAuth("signup")}>
        open signup
      </button>
      <button type="button" onClick={() => auth.openAuth("signin")}>
        open signin
      </button>
      <AuthSurface {...auth} collapseLabel="Back" />
    </>
  );
}

const sheet = () => screen.getByTestId("auth-sheet");
const card = () => screen.getByTestId("auth-card");

describe("AuthSurface", () => {
  it("starts closed, opens in the mode asked, and remounts the card on every open", () => {
    render(<Harness />);
    expect(sheet()).toHaveAttribute("data-open", "false");
    const before = mounts;
    fireEvent.click(screen.getByText("open signup"));
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(card()).toHaveTextContent("signup");
    fireEvent.click(screen.getByText("open signin"));
    expect(card()).toHaveTextContent("signin");
    expect(mounts - before).toBeGreaterThanOrEqual(2);
  });

  it("opens at once when given an initial mode", () => {
    render(<Harness initial="signup" />);
    expect(sheet()).toHaveAttribute("data-open", "true");
    expect(card()).toHaveTextContent("signup");
  });

  it("closes on Escape, on the scrim, and on the sheet's logo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("open signup"));
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(sheet()).toHaveAttribute("data-open", "false");
    expect(screen.queryByTestId("auth-scrim")).toBeNull();

    fireEvent.click(screen.getByText("open signup"));
    fireEvent.click(screen.getByTestId("auth-scrim"));
    expect(sheet()).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByText("open signup"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(sheet()).toHaveAttribute("data-open", "false");
  });
});
