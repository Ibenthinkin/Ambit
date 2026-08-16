"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { z } from "zod";

import { Envelope, Lock } from "~/components/icons";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

type Mode = "signin" | "signup" | "forgot" | "forgot-sent";

// Better Auth's default minimum (src/lib/auth.ts leaves `minPasswordLength` unset, so this is the
// library default) — checked client-side too so a short password never reaches the network.
const MIN_PASSWORD_LENGTH = 8;

const emailSchema = z.string().email();

// Better Auth's client exposes `$ERROR_CODES` in principle (see the plan's docs findings), but it
// resolves via a lazy `GET /api/auth/error-codes/to-json` request that 404s under this app's
// config and silently leaves `$ERROR_CODES` as `{}` — confirmed by triggering both failures
// against the real dev server and reading `error.code` back (PHASE5_PLAN_5.2.md's explicit
// warning not to trust a hardcoded list without doing exactly this). These two string literals
// are that verified read, not a guess.
const INVALID_EMAIL_OR_PASSWORD = "INVALID_EMAIL_OR_PASSWORD";
const USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL =
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";

// Landing's auth card (Ambit - Landing.dc.html, PHASE5_PLAN_5.2.md) — a single client component
// covering all four states of the real email + password flow (sign-in, invited sign-up, forgot
// password, and the "check your inbox" confirmation). One `error` slot, centered under the CTA,
// exactly as the prototype has it — no per-field error rows (Decision in the plan's state-machine
// section).
export function AuthCard() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Guards re-entry instead of `disabled` — see the Button primitive note on why a submitting
    // CTA must stay visually "accent", not fall onto the disabled/ghost ladder.
    if (submitting) return;

    if (mode === "forgot") {
      const trimmedEmail = email.trim();
      if (!emailSchema.safeParse(trimmedEmail).success) {
        setError("That email doesn't look quite right.");
        return;
      }

      setError("");
      setSubmitting(true);
      // Always reports success, even for an unknown address — deliberate anti-enumeration
      // behavior on Better Auth's side (verified against v1.6.23 docs during planning). That's
      // why `forgot-sent` can render unconditionally below with no error branch here.
      await authClient.requestPasswordReset({
        email: trimmedEmail,
        redirectTo: "/reset-password",
      });
      setSubmitting(false);
      setMode("forgot-sent");
      return;
    }

    // signin / signup share the email + password fields and validation.
    if (mode === "signup" && name.trim().length === 0) {
      setError("Tell us what to call you.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!emailSchema.safeParse(trimmedEmail).success) {
      setError("That email doesn't look quite right.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Passwords need at least 8 characters.");
      return;
    }

    setError("");
    setSubmitting(true);

    if (mode === "signup") {
      const { error: signUpError } = await authClient.signUp.email({
        email: trimmedEmail,
        password,
        name: name.trim(),
      });
      if (signUpError) {
        setSubmitting(false);
        // The uninvited-signup case falls through to the `?? message` default deliberately:
        // src/lib/auth.ts's databaseHooks.user.create.before already throws a hand-written,
        // human message for that case, and re-wording it here would put the same sentence in two
        // places. Codes read off a live dev server (not guessed) during Step 4.
        setError(
          signUpError.code === USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
            ? "There's already an account with that email — sign in instead."
            : (signUpError.message ?? "Something went wrong. Try again."),
        );
        return;
      }
      // Leave `submitting` true (and thus the CTA busy) through the navigation itself — nothing
      // else on this page has anywhere better to send focus in the meantime, and flipping it back
      // to interactive just to immediately navigate away would flash the form as usable again.
      router.push("/feed");
      return;
    }

    const { error: signInError } = await authClient.signIn.email({
      email: trimmedEmail,
      password,
    });
    if (signInError) {
      setSubmitting(false);
      setError(
        signInError.code === INVALID_EMAIL_OR_PASSWORD
          ? "That email and password don't match."
          : (signInError.message ?? "Something went wrong. Try again."),
      );
      return;
    }
    router.push("/feed");
  }

  if (mode === "forgot-sent") {
    return (
      <div className="py-1.5 text-center">
        <div className="border-hairline border-ink/12 bg-ink/5 mx-auto flex size-14 items-center justify-center rounded-full">
          <Envelope size={26} className="text-accent" />
        </div>
        <div className="text-ink-hi mt-[18px] text-[23px] font-semibold tracking-[-0.2px]">
          Check your inbox
        </div>
        <div className="text-ink/62 mt-2 text-[15.5px] leading-[1.55]">
          We sent a password reset link to{" "}
          <span className="text-accent">{email.trim()}</span>. It expires in an
          hour.
        </div>
        <button
          type="button"
          onClick={() => switchMode("forgot")}
          className="text-ink/55 mt-[22px] font-sans text-[13px] font-medium"
        >
          Use a different email
        </button>
      </div>
    );
  }

  const ctaLabel =
    mode === "signin"
      ? "Sign in"
      : mode === "signup"
        ? "Create account"
        : "Send reset link";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-2.5">
        {mode === "signup" && (
          <div>
            <label htmlFor={nameId} className="sr-only">
              Name
            </label>
            <Input
              id={nameId}
              type="text"
              placeholder="What should we call you?"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
            />
          </div>
        )}

        <div>
          <label htmlFor={emailId} className="sr-only">
            Email
          </label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          />
        </div>

        {mode !== "forgot" && (
          <div>
            <label htmlFor={passwordId} className="sr-only">
              Password
            </label>
            <Input
              id={passwordId}
              type="password"
              placeholder={
                mode === "signup" ? "Password (8+ characters)" : "Password"
              }
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
          </div>
        )}

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
          {ctaLabel}
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

      {mode === "signin" && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            className="text-ink/55 font-sans text-[13px] font-medium"
          >
            Forgot your password?
          </button>
        </div>
      )}

      {(mode === "signin" || mode === "signup") && (
        <div className="mt-4 flex items-center justify-center gap-[7px]">
          <Lock size={12} className="text-ink/40" />
          <span className="text-ink/40 text-[11.5px] tracking-[0.2px]">
            Invite-only · no ads, no algorithm
          </span>
        </div>
      )}

      <div className="mt-4 text-center">
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className="text-ink/55 font-sans text-[13px] font-medium"
          >
            First time? Create your account
          </button>
        )}
        {mode === "signup" && (
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="text-ink/55 font-sans text-[13px] font-medium"
          >
            Already have an account? Sign in
          </button>
        )}
        {mode === "forgot" && (
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="text-ink/55 font-sans text-[13px] font-medium"
          >
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
