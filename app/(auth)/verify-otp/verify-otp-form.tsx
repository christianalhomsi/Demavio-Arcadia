"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { otpVerifySchema, type OtpVerifyInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
    <Card className="border-border/60 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-lg">Enter your code</CardTitle>
        <CardDescription>We sent a 6-digit code to your email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </Label>
            <Input id="email" type="email" placeholder="you@example.com" autoComplete="email"
              className={errors.email ? "border-destructive" : ""}
              {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">⚠ {errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="otp" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              One-time password
            </Label>
            <Input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} placeholder="123456"
              className={`tracking-[0.3em] text-center font-mono text-lg ${errors.otp ? "border-destructive" : ""}`}
              {...register("otp")} />
            {errors.otp && <p className="text-xs text-destructive">⚠ {errors.otp.message}</p>}
          </div>

          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
            {isSubmitting ? "Verifying…" : "Verify & Sign In"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
