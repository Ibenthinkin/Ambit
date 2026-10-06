"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Loader } from "~/components/ui/loader";
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
        <div className="text-ink-hi text-[23px] tracking-[-0.2px]">
          Password updated.
        </div>
        <div className="text-ink/62 mt-2 text-[15.5px] leading-[1.55]">
          Sign in with your new password.
        </div>
        <Link href="/" className="mt-[22px] inline-block">
          <Button size="lg" className="px-8">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="text-ink-hi mb-5 text-[23px] tracking-[-0.2px]">
        Choose a new password.
      </div>
      <div className="space-y-5">
        <Field label="New password">
          <Input
            type="password"
            placeholder="New password (8+ characters)"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError("");
            }}
          />
        </Field>

        <Field label="Confirm new password">
          <Input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError("");
            }}
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          aria-busy={submitting}
          className={cn(
            "w-full",
            submitting && "pointer-events-none opacity-80",
          )}
        >
          {submitting && <Loader size={16} className="text-on-accent" />}
          Set new password
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="auth-error"
          // The green mono hint (DESIGN §3.2 job 7), as on the auth card.
          className="text-accent mt-[11px] text-center font-mono text-[10.5px] tracking-[0.04em]"
        >
          {error}
        </div>
      )}
    </form>
  );
}
