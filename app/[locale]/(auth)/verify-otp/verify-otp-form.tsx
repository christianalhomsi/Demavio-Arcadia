"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { otpVerifySchema, type OtpVerifyInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, KeyRound, AlertCircle, ShieldCheck } from "lucide-react";
import { useTranslations } from 'next-intl';

export default function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpVerifyInput>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: { email: emailParam },
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

    toast.success(t('accountCreated'));
    router.replace("/halls");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md px-6">
        {/* Logo/Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Arcadia</h1>
          <p className="text-slate-400 text-sm">Gaming Hub Management</p>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-white mb-2">{t('enterCode')}</h2>
          <p className="text-slate-400 text-sm">{t('otpSentDescription')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-white/80">
              {tCommon('email')}
            </Label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <Input id="email" type="email" placeholder="you@example.com" autoComplete="email"
                className={`pl-12 h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20 focus-visible:border-white/30 ${errors.email ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                {...register("email")} />
            </div>
            {errors.email && (
              <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1.5">
                <AlertCircle size={12} /> {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="otp" className="text-sm font-medium text-white/80">
              {t('oneTimePassword')}
            </Label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <Input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="123456"
                className={`pl-12 h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20 focus-visible:border-white/30 tracking-[0.4em] text-center font-mono text-lg ${errors.otp ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                {...register("otp")} />
            </div>
            {errors.otp && (
              <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1.5">
                <AlertCircle size={12} /> {errors.otp.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold h-11 mt-6 bg-white text-black hover:bg-white/90" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            {isSubmitting ? t('verifying') : t('verifyAndSignIn')}
          </Button>
        </form>
      </div>
    </div>
  );
}
