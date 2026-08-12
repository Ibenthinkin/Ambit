// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordCard } from "./reset-password-card";

const { resetPasswordMock } = vi.hoisted(() => ({
  resetPasswordMock: vi.fn(),
}));

vi.mock("~/lib/auth-client", () => ({
  authClient: {
    resetPassword: resetPasswordMock,
  },
}));

describe("ResetPasswordCard", () => {
  beforeEach(() => {
    resetPasswordMock.mockReset().mockResolvedValue({ error: null });
  });

  it("blocks the call when the passwords don't match", async () => {
    render(<ResetPasswordCard token="abc123" />);
    fireEvent.change(
      screen.getByPlaceholderText("New password (8+ characters)"),
      { target: { value: "longenough1" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "longenough2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Those passwords don't match.",
    );
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("blocks the call when the password is too short", async () => {
    render(<ResetPasswordCard token="abc123" />);
    fireEvent.change(
      screen.getByPlaceholderText("New password (8+ characters)"),
      { target: { value: "short" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords need at least 8 characters.",
    );
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("calls resetPassword with the token and renders the confirmation on success", async () => {
    render(<ResetPasswordCard token="abc123" />);
    fireEvent.change(
      screen.getByPlaceholderText("New password (8+ characters)"),
      { target: { value: "longenough1" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        newPassword: "longenough1",
        token: "abc123",
      }),
    );
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
  });
});
