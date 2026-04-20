"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from 'next-intl';
import { signupSchema, type SignupInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Lock, AlertCircle, Send, LogIn, MailCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginInput = z.infer<typeof loginSchema>;

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  const t = useTranslations('auth');

  async function handleGoogle() {
    setLoading(true);
    const supabase = getBrowserClient();
    const locale = window.location.pathname.split('/')[1] || 'ar';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/${locale}/auth/callback` },
    });
    if (error) { toast.error(error.message); setLoading(false); }
  }

  return (
    <button type="button" onClick={handleGoogle} disabled={loading}
      className="w-full flex items-center justify-center gap-2.5 h-10 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 transition-colors text-sm font-medium disabled:opacity-60 cursor-pointer border border-slate-800">
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-white animate-spin" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      {t('continueWithGoogle')}
    </button>
  );
}

function Divider() {
  const t = useTranslations('auth');
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-slate-800" />
      <span className="text-xs text-slate-500">{t('or')}</span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

export default function AuthForm() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const t = useTranslations('auth');

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent mb-1">Arcadia</h1>
          <p className="text-slate-400 text-xs">Gaming Hub Management</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-6">
          {(["login", "signup"] as const).map((tabKey) => (
            <button key={tabKey} onClick={() => setTab(tabKey)} type="button"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: tab === tabKey ? "oklch(0.55 0.26 280 / 0.15)" : "transparent",
                color: tab === tabKey ? "oklch(0.65 0.22 280)" : "rgba(255,255,255,0.4)",
                border: tab === tabKey ? "1px solid oklch(0.55 0.26 280 / 0.3)" : "1px solid transparent",
              }}>
              {tabKey === "login" ? t("signIn") : t("signUp")}
            </button>
          ))}
        </div>

        {/* Form */}
        <div>
          {tab === "login" ? <LoginForm /> : <SignUpForm />}
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const error = searchParams.get("error");
    const oauthCode = searchParams.get("oauth_code");
    
    if (error) {
      toast.error(`OAuth Error: ${error}`);
      console.error('🔴 OAuth Error from URL:', error);
      return;
    }
    
    if (!oauthCode) return;

    let cancelled = false;
    const run = async () => {
      console.log('🔵 Client-side: Attempting to exchange code...');
      const supabase = getBrowserClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(oauthCode);
      if (cancelled) return;
      if (error || !data?.session?.user) {
        console.error('🔴 Client exchange failed:', error);
        toast.error(error?.message || "Google login failed. Please try again.");
        return;
      }

      console.log('🟢 Client exchange success:', data.session.user.email);
      const userId = data.session.user.id;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      const role = profile?.role;

      if (role === "super_admin") {
        router.replace("/admin");
        return;
      }
      if (role === "hall_manager" || role === "hall_staff") {
        const { data: assignment } = await supabase
          .from("staff_assignments")
          .select("hall_id")
          .eq("user_id", userId)
          .maybeSingle();
        router.replace(assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls");
        return;
      }
      router.replace("/halls");
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  async function onSubmit(data: LoginInput) {
    const supabase = getBrowserClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) { toast.error(error.message); return; }
    toast.success(t('welcomeBackMessage'));
    await supabase.auth.getSession();
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    const role = profile?.role;
    if (role === "super_admin") { router.replace("/admin"); return; }
    if (role === "hall_manager" || role === "hall_staff") {
      const table = role === "hall_manager" ? "hall_managers" : "hall_staff_permissions";
      const { data: hallData } = await supabase.from(table).select("hall_id").eq("user_id", authData.user.id).maybeSingle();
      router.replace(hallData?.hall_id ? `/dashboard/${hallData.hall_id}` : "/halls");
      return;
    }
    router.replace("/halls");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label={tCommon('email')} id="email" type="email" placeholder="you@example.com"
        icon={Mail} error={errors.email?.message} reg={register("email")} />
      <Field label={tCommon('password')} id="password" type="password" placeholder="••••••••"
        icon={Lock} error={errors.password?.message} reg={register("password")} />

      <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold h-10 mt-5 bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSubmitting}>
        {isSubmitting ? (
          <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
        ) : (
          <LogIn size={16} />
        )}
        {isSubmitting ? t('signingIn') : t('signIn')}
      </Button>

      <Divider />
      <GoogleButton />
    </form>
  );
}

function SignUpForm() {
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupInput) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success(t('otpSent'));
      router.push(`/auth/verify-otp?email=${encodeURIComponent(data.email)}`);
      return;
    }
    const json = await res.json().catch(() => ({}));
    toast.error(json?.error ?? "Something went wrong.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label={tCommon('email')} id="signup-email" type="email" placeholder="you@example.com"
        icon={Mail} error={errors.email?.message} reg={register("email")} />
      <Field label={tCommon('password')} id="signup-password" type="password" placeholder="••••••••"
        icon={Lock} error={errors.password?.message} reg={register("password")} />
      <Field label={t('confirmPassword')} id="signup-confirm" type="password" placeholder="••••••••"
        icon={Lock} error={errors.confirmPassword?.message} reg={register("confirmPassword")} />

      <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold h-10 mt-5 bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSubmitting}>
        {isSubmitting ? (
          <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
        ) : (
          <Send size={16} />
        )}
        {isSubmitting ? t('sending') : t('signUp')}
      </Button>

      <Divider />
      <GoogleButton />
    </form>
  );
}

function Field({ label, id, type, placeholder, icon: Icon, error, reg }: {
  label: string; id: string; type: string; placeholder: string;
  icon: React.ElementType; error?: string; reg: object;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-slate-300">
        {label}
      </Label>
      <div className="relative">
        <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <Input id={id} type={type} placeholder={placeholder} autoComplete="new-password"
          className={`pl-12 h-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-primary/30 focus-visible:border-primary/50 ${error ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
          {...reg} />
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}
