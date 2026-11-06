"use client";

import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, User, UserPlus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateSignIn, validateSignUp, type CredentialIssue } from "@/lib/auth/credentials";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignInButton } from "./GoogleSignInButton";

type Tab = "signin" | "signup";
type PendingSignup = { email: string; username: string; password: string };

/** The signup-otp Edge Function always answers with { status }; a network failure counts as failed. */
async function signupOtp(body: Record<string, string>): Promise<string> {
  const { data, error } = await createClient().functions.invoke("signup-otp", { body });
  return error ? "failed" : String(data?.status ?? "failed");
}

/**
 * Credentials are always typed left-to-right (email, ASCII username, password), so the icon sits on
 * the left and the show/hide toggle on the right, matching the text direction inside the box.
 */
function Field({
  icon: Icon,
  label,
  issue,
  hint,
  type,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "dir"> & {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  issue?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const id = React.useId();
  const [shown, setShown] = React.useState(false);
  const isPassword = type === "password";
  const describedBy = issue ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && !issue && (
          <span id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </span>
        )}
      </div>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          id={id}
          dir="ltr"
          type={isPassword && shown ? "text" : type}
          aria-invalid={Boolean(issue)}
          aria-describedby={describedBy}
          className={cn("pl-10 text-left", isPassword && "pr-12")}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? t.lgHidePw : t.lgShowPw}
            aria-pressed={shown}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:text-foreground active:bg-neutral-bg"
          >
            {shown ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>
      {issue && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {issue}
        </p>
      )}
    </div>
  );
}

/** Email + password (sign in / create account) and Google. `next` is already sanitized by the page. */
export function AuthForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<Tab>("signin");
  const [pending, setPending] = React.useState(false);
  const [issue, setIssue] = React.useState<CredentialIssue | null>(null);
  const [message, setMessage] = React.useState<{ tone: "error" | "info"; text: string } | null>(
    null,
  );

  // Set once a code is sent. The password stays in memory here: it is never stored server-side.
  const [pendingSignup, setPendingSignup] = React.useState<PendingSignup | null>(null);

  function switchTab(to: Tab) {
    setTab(to);
    setPendingSignup(null);
    setIssue(null);
    setMessage(null);
  }

  // The login page redirects signed-in users to the right place (players back, staff to dashboards).
  const finish = () => window.location.assign(`/login?next=${encodeURIComponent(next)}`);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setMessage(null);

    if (tab === "signin") {
      const bad = validateSignIn(email, password);
      setIssue(bad);
      if (bad) return;
      setPending(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // One message for unknown email and wrong password: never reveal which accounts exist.
        setMessage({ tone: "error", text: t.errInvalidCreds });
        setPending(false);
        return;
      }
      // A deactivated account must not keep a live session (the Google callback does the same).
      const { data: ctx } = await supabase.rpc("get_my_context");
      const status = (ctx as { profile?: { status?: string } } | null)?.profile?.status;
      if (status !== undefined && status !== "active") {
        await supabase.auth.signOut();
        setMessage({ tone: "error", text: t.loginInactive });
        setPending(false);
        return;
      }
      finish();
      return;
    }

    const username = String(f.get("username") ?? "").trim();
    const bad = validateSignUp({
      username,
      email,
      password,
      // One password field with a show/hide toggle: no second box to retype.
      confirm: password,
    });
    setIssue(bad);
    if (bad) return;
    await requestCode({ email, username, password });
    setPending(false);
  }

  // Asks for a code; the account itself is created only after the code is confirmed.
  async function requestCode(p: PendingSignup, resend = false) {
    setPending(true);
    const status = await signupOtp({ action: "request", email: p.email, username: p.username });
    setPending(false);
    if (status === "username_taken") {
      setIssue({ field: "username", message: "errUsernameTaken" });
    } else if (status === "wait") {
      setMessage({ tone: "error", text: t.errOtpWait });
    } else if (status === "ok") {
      setPendingSignup(p);
      setMessage({ tone: "info", text: resend ? t.otpResent : t.otpSent });
    } else {
      setMessage({ tone: "error", text: t.errSignUp });
    }
  }

  async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pendingSignup) return;
    const code = String(new FormData(e.currentTarget).get("otp") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      setMessage({ tone: "error", text: t.errOtp });
      return;
    }
    setPending(true);
    setMessage(null);
    const { email, password } = pendingSignup;
    const status = await signupOtp({ action: "verify", email, code, password });
    if (status === "username_taken") {
      // Taken since the code was sent: back to the form so another username can be chosen.
      setPendingSignup(null);
      setIssue({ field: "username", message: "errUsernameTaken" });
      setPending(false);
      return;
    }
    if (status !== "ok") {
      setMessage({ tone: "error", text: status === "invalid_code" ? t.errOtp : t.errSignUp });
      setPending(false);
      return;
    }
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ tone: "error", text: t.errSignUp });
      setPending(false);
      return;
    }
    finish();
  }

  const err = (field: CredentialIssue["field"]) =>
    issue?.field === field ? t[issue.message] : undefined;
  const signin = tab === "signin";

  if (pendingSignup) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-lg font-semibold">{t.otpTitle}</h2>
        <form onSubmit={verifyOtp} noValidate className="space-y-3">
          <Field
            icon={KeyRound}
            label={t.otpLabel}
            name="otp"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            autoFocus
          />
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={cn(
                "rounded-xl p-3 text-sm",
                message.tone === "error" ? "bg-danger-bg text-danger" : "bg-info-bg text-info",
              )}
            >
              {message.text}
            </p>
          )}
          <Button type="submit" className="w-full" pending={pending}>
            {t.otpVerify}
          </Button>
        </form>
        <p className="mt-2 text-center text-sm text-muted">
          <button
            type="button"
            onClick={() => requestCode(pendingSignup, true)}
            disabled={pending}
            className="cursor-pointer font-medium text-accent underline underline-offset-2"
          >
            {t.otpResend}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div
        role="tablist"
        aria-label={t.signIn}
        className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-bg p-1"
      >
        {(["signin", "signup"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={cn(
              "h-11 cursor-pointer rounded-xl text-sm font-medium transition-colors",
              tab === k
                ? "border border-primary/50 bg-surface-raised text-accent shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {k === "signin" ? t.signIn : t.signUp}
          </button>
        ))}
      </div>

      <GoogleSignInButton next={next} />

      <div className="my-2 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t.lgOrEmail}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} noValidate className="space-y-3">
        {!signin && (
          <Field
            icon={User}
            label={t.username}
            name="username"
            autoComplete="username"
            hint={t.lgUsernameHint}
            maxLength={20}
            issue={err("username")}
          />
        )}
        <Field
          icon={Mail}
          label={t.email}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          issue={err("email")}
        />
        <Field
          icon={Lock}
          label={t.password}
          name="password"
          type="password"
          autoComplete={signin ? "current-password" : "new-password"}
          hint={signin ? undefined : t.lgPwHint}
          issue={err("password")}
        />
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-xl p-3 text-sm",
              message.tone === "error" ? "bg-danger-bg text-danger" : "bg-info-bg text-info",
            )}
          >
            {message.text}
          </p>
        )}
        <Button type="submit" className="w-full" pending={pending}>
          {signin ? (
            <LogIn className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden />
          )}
          {signin ? t.signIn : t.signUp}
        </Button>
      </form>

      <p className="mt-2 text-center text-sm text-muted">
        {signin ? t.lgNoAccount : t.lgHaveAccount}{" "}
        <button
          type="button"
          onClick={() => switchTab(signin ? "signup" : "signin")}
          className="inline-flex min-h-11 cursor-pointer items-center px-1 font-medium text-accent underline underline-offset-2"
        >
          {signin ? t.signUp : t.signIn}
        </button>
      </p>
    </div>
  );
}
