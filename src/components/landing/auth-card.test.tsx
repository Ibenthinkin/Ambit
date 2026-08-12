// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthCard } from "./auth-card";

// vi.mock factories are hoisted above imports, so the mock functions they close over have to be
// created through vi.hoisted() rather than declared as plain top-level consts (which would still
// be in the temporal dead zone when the hoisted factory runs) — this project's first component
// tests that mock a module (PHASE5_PLAN_5.2.md Step 7).
const { signInEmailMock, signUpEmailMock, requestPasswordResetMock, pushMock } =
  vi.hoisted(() => ({
    signInEmailMock: vi.fn(),
    signUpEmailMock: vi.fn(),
    requestPasswordResetMock: vi.fn(),
    pushMock: vi.fn(),
  }));

vi.mock("~/lib/auth-client", () => ({
  authClient: {
    signIn: { email: signInEmailMock },
    signUp: { email: signUpEmailMock },
    requestPasswordReset: requestPasswordResetMock,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("AuthCard", () => {
  beforeEach(() => {
    signInEmailMock.mockReset().mockResolvedValue({ error: null });
    signUpEmailMock.mockReset().mockResolvedValue({ error: null });
    requestPasswordResetMock.mockReset().mockResolvedValue({ error: null });
    pushMock.mockReset();
  });

  it("renders signin by default; the toggle switches to signup and reveals the name field", () => {
    render(<AuthCard />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("What should we call you?"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "First time? Create your account" }),
    );

    expect(
      screen.getByPlaceholderText("What should we call you?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("blocks the network call on an invalid email", async () => {
    render(<AuthCard />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email doesn't look quite right.",
    );
    expect(signInEmailMock).not.toHaveBeenCalled();
  });

  it("blocks the network call on a short password", async () => {
    render(<AuthCard />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords need at least 8 characters.",
    );
    expect(signInEmailMock).not.toHaveBeenCalled();
  });

  it("calls signIn.email with a trimmed email on submit", async () => {
    render(<AuthCard />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "  a@b.com  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(signInEmailMock).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "longenough1",
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/feed"));
  });

  it("renders the mapped error for wrong credentials", async () => {
    signInEmailMock.mockResolvedValue({
      error: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
    });
    render(<AuthCard />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match.",
    );
  });

  it("surfaces the uninvited-signup message verbatim", async () => {
    signUpEmailMock.mockResolvedValue({
      error: {
        message:
          "Ambit is invite-only right now. Ask someone who's already in for an invite.",
      },
    });
    render(<AuthCard />);
    fireEvent.click(
      screen.getByRole("button", { name: "First time? Create your account" }),
    );
    fireEvent.change(screen.getByPlaceholderText("What should we call you?"), {
      target: { value: "Ben" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password (8+ characters)"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ambit is invite-only right now. Ask someone who's already in for an invite.",
    );
  });

  it("passes name, email, and password on signup", async () => {
    render(<AuthCard />);
    fireEvent.click(
      screen.getByRole("button", { name: "First time? Create your account" }),
    );
    fireEvent.change(screen.getByPlaceholderText("What should we call you?"), {
      target: { value: "  Ben  " },
    });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password (8+ characters)"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUpEmailMock).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "longenough1",
        name: "Ben",
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/feed"));
  });

  it("switches to forgot mode and calls requestPasswordReset with redirectTo", async () => {
    render(<AuthCard />);
    fireEvent.click(
      screen.getByRole("button", { name: "Forgot your password?" }),
    );
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(requestPasswordResetMock).toHaveBeenCalledWith({
        email: "a@b.com",
        redirectTo: "/reset-password",
      }),
    );
  });

  it("names the submitted email in the sent stage and can return to forgot", async () => {
    render(<AuthCard />);
    fireEvent.click(
      screen.getByRole("button", { name: "Forgot your password?" }),
    );
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Use a different email" }),
    );
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();
  });
});
