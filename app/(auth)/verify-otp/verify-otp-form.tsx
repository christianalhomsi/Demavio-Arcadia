"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { otpVerifySchema, type OtpVerifyInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, KeyRound, AlertCircle, ShieldCheck } from "lucide-react";

export default function VerifyOtpForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpVerifyInput>({
    resolver: zodResolver(otpVerifySchema),
  });

  async function onSubmit(data: OtpVerifyInput) {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json?.error ?? "Verification failed."); return; }

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: json.token_hash, type: "magiclink" });
    if (error) { toast.error(error.message); return; }

    toast.success("Verified! Redirecting…");
    router.replace("/");
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden"
      style={{ boxShadow: "0 25px 50px -12px oklch(0 0 0 / 0.4)" }}>

      <div className="h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.6), oklch(0.82 0.14 200 / 0.4), transparent)" }} />

      <div className="p-6">
        <div className="space-y-1 mb-6">
          <h2 className="text-lg font-semibold">Enter your code</h2>
          <p className="text-sm text-muted-foreground">We sent a 6-digit code to your email.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</Label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              <Input id="email" type="email" placeholder="you@example.com" autoComplete="email"
                className={`pl-9 ${errors.email ? "border-destructive" : ""}`}
                {...register("email")} />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle size={11} /> {errors.email.message}
              </p>
            )}
          </div>

          {/* otp */}
          <div className="space-y-1.5">
            <Label htmlFor="otp" className="text-xs font-medium text-muted-foreground">One-time password</Label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              <Input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="123456"
                className={`pl-9 tracking-[0.4em] text-center font-mono text-lg ${errors.otp ? "border-destructive" : ""}`}
                {...register("otp")} />
            </div>
            {errors.otp && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle size={11} /> {errors.otp.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.35)" }}>
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            {isSubmitting ? "Verifying…" : "Verify & Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
