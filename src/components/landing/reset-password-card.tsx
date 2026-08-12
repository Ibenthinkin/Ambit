"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

// The card `/reset-password?token=...` renders once Better Auth's own redirect endpoint has
// already validated the token (see the page component). `resetPassword` does NOT sign the user
// in (verified against Better Auth v1.6.23 docs during planning) — success shows an inline
// confirmation with a link back to / to sign in, rather than faking a session.
export function ResetPasswordCard({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const newPasswordId = useId();
  const confirmPasswordId = useId();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("Passwords need at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }

    setError("");
    setSubmitting(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword,
      token,
    });
    setSubmitting(false);

    if (resetError) {
      setError(resetError.message ?? "Something went wrong. Try again.");
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="py-1.5 text-center">
        <div className="text-ink font-serif text-[23px]">Password updated.</div>
        <div className="text-ink/62 mt-2 font-serif text-[16px] leading-[1.5]">
          Sign in with your new password.
        </div>
        <Link href="/" className="mt-[22px] inline-block">
          <Button shape="rounded" size="lg" className="px-8">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="text-ink mb-5 font-serif text-[23px]">
        Choose a new password.
      </div>
      <div className="space-y-2.5">
        <div>
          <label htmlFor={newPasswordId} className="sr-only">
            New password
          </label>
          <Input
            id={newPasswordId}
            type="password"
            placeholder="New password (8+ characters)"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError("");
            }}
          />
        </div>

        <div>
          <label htmlFor={confirmPasswordId} className="sr-only">
            Confirm new password
          </label>
          <Input
            id={confirmPasswordId}
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError("");
            }}
          />
        </div>

        <Button
          type="submit"
          shape="rounded"
          size="lg"
          aria-busy={submitting}
          className={cn(
            "w-full",
            submitting && "pointer-events-none opacity-80",
          )}
        >
          {submitting && (
            <Spinner
              size={14}
              className="border-on-accent/35 border-t-on-accent"
            />
          )}
          Set new password
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="auth-error"
          className="text-error mt-[11px] text-center font-sans text-[12.5px]"
        >
          {error}
        </div>
      )}
    </form>
  );
}
