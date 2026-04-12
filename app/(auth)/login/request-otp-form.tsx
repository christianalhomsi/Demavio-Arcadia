"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { otpRequestSchema, type OtpRequestInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
type LoginInput = z.infer<typeof loginSchema>;

export default function AuthForm() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <div className="rounded-xl p-6 border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      {/* tabs */}
      <div className="flex mb-6 rounded-lg p-1 gap-1"
        style={{ background: "var(--color-surface-2)" }}>
        {(["login", "signup"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer"
            style={{
              background: tab === t ? "var(--color-primary)" : "transparent",
              color: tab === t ? "#fff" : "var(--color-muted)",
            }}>
            {t === "login" ? "Sign In" : "Sign Up"}
          </button>
        ))}
      </div>
      {tab === "login" ? <LoginForm /> : <SignUpForm />}
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) { setServerError(error.message); return; }
    router.replace("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Email" id="email" type="email" placeholder="you@example.com"
        error={errors.email?.message} reg={register("email")} />
      <Field label="Password" id="password" type="password" placeholder="••••••••"
        error={errors.password?.message} reg={register("password")} />
      {serverError && <ErrorMsg>{serverError}</ErrorMsg>}
      <SubmitBtn disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign In"}</SubmitBtn>
    </form>
  );
}

function SignUpForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpRequestInput>({
    resolver: zodResolver(otpRequestSchema),
  });

  async function onSubmit(data: OtpRequestInput) {
    setServerError(null);
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setSuccess(true); return; }
    const json = await res.json().catch(() => ({}));
    setServerError(json?.error ?? "Something went wrong. Please try again.");
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="text-3xl mb-3">📬</div>
        <p className="text-sm font-medium" style={{ color: "var(--color-success)" }}>
          Check your email for a one-time password.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Email" id="signup-email" type="email" placeholder="you@example.com"
        error={errors.email?.message} reg={register("email")} />
      {serverError && <ErrorMsg>{serverError}</ErrorMsg>}
      <SubmitBtn disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send OTP"}</SubmitBtn>
    </form>
  );
}

function Field({ label, id, type, placeholder, error, reg }: {
  label: string; id: string; type: string; placeholder: string;
  error?: string; reg: object;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}>
        {label}
      </label>
      <input id={id} type={type} placeholder={placeholder} autoComplete="off"
        className="w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
        style={{
          background: "var(--color-surface-2)",
          border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
          color: "var(--color-text)",
        }}
        {...reg} />
      {error && <ErrorMsg>{error}</ErrorMsg>}
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return <span className="text-xs" style={{ color: "var(--color-danger)" }}>{children}</span>;
}

function SubmitBtn({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={disabled}
      className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 mt-1 cursor-pointer"
      style={{
        background: disabled ? "var(--color-border)" : "var(--color-primary)",
        color: disabled ? "var(--color-muted)" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
      {children}
    </button>
  );
}
