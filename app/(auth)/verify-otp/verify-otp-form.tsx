"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { otpVerifySchema, type OtpVerifyInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";

export default function VerifyOtpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpVerifyInput>({
    resolver: zodResolver(otpVerifySchema),
  });

  async function onSubmit(data: OtpVerifyInput) {
    setServerError(null);

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setServerError(json?.error ?? "Verification failed. Please try again.");
      return;
    }

    const { token_hash } = json as { token_hash: string };

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: "magiclink",
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    router.replace("/");
  }

  return (
    <div style={card}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 600 }}>
        Enter your code
      </h1>
      <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", color: "#6b7280" }}>
        We sent a 6-digit code to your email.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div style={fieldWrap}>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            style={{ ...inputStyle, borderColor: errors.email ? "#ef4444" : "#d1d5db" }}
            {...register("email")}
          />
          {errors.email && <span style={errorStyle}>{errors.email.message}</span>}
        </div>

        <div style={fieldWrap}>
          <label htmlFor="otp" style={labelStyle}>
            One-time password
          </label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            style={{ ...inputStyle, borderColor: errors.otp ? "#ef4444" : "#d1d5db", letterSpacing: "0.2em" }}
            {...register("otp")}
          />
          {errors.otp && <span style={errorStyle}>{errors.otp.message}</span>}
        </div>

        {serverError && <span style={errorStyle}>{serverError}</span>}

        <button type="submit" disabled={isSubmitting} style={btnStyle(isSubmitting)}>
          {isSubmitting ? "Verifying…" : "Verify"}
        </button>
      </form>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  padding: "2rem",
  width: "100%",
  maxWidth: "400px",
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0.625rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontWeight: 500,
  fontSize: "0.875rem",
  cursor: disabled ? "not-allowed" : "pointer",
});
