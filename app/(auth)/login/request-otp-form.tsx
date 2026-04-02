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
    <div style={card}>
      <div style={tabBar}>
        <button style={tabBtn(tab === "login")} onClick={() => setTab("login")}>Sign In</button>
        <button style={tabBtn(tab === "signup")} onClick={() => setTab("signup")}>Sign Up</button>
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={formStyle}>
      <Field label="Email" id="email" type="email" placeholder="you@example.com"
        error={errors.email?.message} reg={register("email")} />
      <Field label="Password" id="password" type="password" placeholder="••••••••"
        error={errors.password?.message} reg={register("password")} />
      {serverError && <span style={errorStyle}>{serverError}</span>}
      <button type="submit" disabled={isSubmitting} style={btnStyle(isSubmitting)}>
        {isSubmitting ? "Signing in…" : "Sign In"}
      </button>
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
      <p style={{ color: "#16a34a", textAlign: "center", margin: "1.5rem 0 0" }}>
        ✓ Check your email for a one-time password.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={formStyle}>
      <Field label="Email" id="signup-email" type="email" placeholder="you@example.com"
        error={errors.email?.message} reg={register("email")} />
      {serverError && <span style={errorStyle}>{serverError}</span>}
      <button type="submit" disabled={isSubmitting} style={btnStyle(isSubmitting)}>
        {isSubmitting ? "Sending…" : "Send OTP"}
      </button>
    </form>
  );
}

function Field({ label, id, type, placeholder, error, reg }: {
  label: string; id: string; type: string; placeholder: string;
  error?: string; reg: object;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} type={type} placeholder={placeholder} autoComplete={type === "email" ? "email" : "current-password"}
        style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#d1d5db" }} {...reg} />
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)", padding: "2rem",
  width: "100%", maxWidth: "400px",
};
const tabBar: React.CSSProperties = {
  display: "flex", marginBottom: "1.5rem",
  borderBottom: "1px solid #e5e7eb",
};
const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: "0.5rem", border: "none", background: "none",
  fontWeight: active ? 600 : 400, fontSize: "0.875rem",
  color: active ? "#111827" : "#6b7280", cursor: "pointer",
  borderBottom: active ? "2px solid #111827" : "2px solid transparent",
  marginBottom: "-1px",
});
const formStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "1rem" };
const labelStyle: React.CSSProperties = { fontSize: "0.875rem", fontWeight: 500, color: "#374151" };
const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem", borderRadius: "0.375rem", border: "1px solid",
  fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box",
};
const errorStyle: React.CSSProperties = { fontSize: "0.75rem", color: "#ef4444" };
const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0.625rem", borderRadius: "0.375rem", border: "none",
  background: disabled ? "#9ca3af" : "#111827", color: "#fff",
  fontWeight: 500, fontSize: "0.875rem", cursor: disabled ? "not-allowed" : "pointer",
});
