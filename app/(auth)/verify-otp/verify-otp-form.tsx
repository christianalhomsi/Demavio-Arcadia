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
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpVerifyInput>({
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
    if (!res.ok) { setServerError(json?.error ?? "Verification failed. Please try again."); return; }
    const { token_hash } = json as { token_hash: string };
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
    if (error) { setServerError(error.message); return; }
    router.replace("/");
  }

  return (
    <div className="rounded-xl p-6 border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="mb-6">
        <h1 className="text-lg font-bold mb-1" style={{ color: "var(--color-text)" }}>
          Enter your code
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          We sent a 6-digit code to your email.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Field label="Email" id="email" type="email" placeholder="you@example.com"
          error={errors.email?.message} reg={register("email")} autoComplete="email" />
        <Field label="One-time password" id="otp" type="text" placeholder="123456"
          error={errors.otp?.message} reg={register("otp")} autoComplete="one-time-code"
          extraStyle={{ letterSpacing: "0.25em" }} maxLength={6} inputMode="numeric" />
        {serverError && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{serverError}</span>}
        <button type="submit" disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 mt-1"
          style={{
            background: isSubmitting ? "var(--color-border)" : "var(--color-primary)",
            color: isSubmitting ? "var(--color-muted)" : "#fff",
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}>
          {isSubmitting ? "Verifying…" : "Verify"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, id, type, placeholder, error, reg, autoComplete, extraStyle, maxLength, inputMode }: {
  label: string; id: string; type: string; placeholder: string;
  error?: string; reg: object; autoComplete?: string;
  extraStyle?: React.CSSProperties; maxLength?: number; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}>
        {label}
      </label>
      <input id={id} type={type} placeholder={placeholder} autoComplete={autoComplete}
        maxLength={maxLength} inputMode={inputMode}
        className="w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
        style={{
          background: "var(--color-surface-2)",
          border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
          color: "var(--color-text)",
          ...extraStyle,
        }}
        {...reg} />
      {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}
