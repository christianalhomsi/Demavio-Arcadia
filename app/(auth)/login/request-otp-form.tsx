"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { otpRequestSchema, type OtpRequestInput } from "@/schemas/otp";
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

  async function handleGoogle() {
    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { toast.error(error.message); setLoading(false); }
  }

  return (
    <button type="button" onClick={handleGoogle} disabled={loading}
      className="w-full flex items-center justify-center gap-2.5 h-10 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium disabled:opacity-60 cursor-pointer">
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      Continue with Google
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-xs text-muted-foreground/60">or</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

export default function AuthForm() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden"
      style={{ boxShadow: "0 25px 50px -12px oklch(0 0 0 / 0.4)" }}>

      {/* top accent line */}
      <div className="h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.6), oklch(0.82 0.14 200 / 0.4), transparent)" }} />

      {/* tab switcher */}
      <div className="p-4 pb-0">
        <div className="flex p-1 rounded-xl gap-1 bg-muted/60">
          {(["login", "signup"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                background: tab === t ? "oklch(0.55 0.26 280)" : "transparent",
                color: tab === t ? "white" : "var(--color-muted-foreground)",
                boxShadow: tab === t ? "0 2px 8px oklch(0.55 0.26 280 / 0.3)" : "none",
              }}>
              {t === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 pt-5">
        {tab === "login" ? <LoginForm /> : <SignUpForm />}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    const supabase = getBrowserClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back!");
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
      <div className="space-y-1 mb-5">
        <h2 className="text-lg font-semibold">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
      </div>

      <Field label="Email" id="email" type="email" placeholder="you@example.com"
        icon={Mail} error={errors.email?.message} reg={register("email")} />
      <Field label="Password" id="password" type="password" placeholder="••••••••"
        icon={Lock} error={errors.password?.message} reg={register("password")} />

      <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold mt-2" disabled={isSubmitting}
        style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.35)" }}>
        {isSubmitting ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <LogIn size={15} />
        )}
        {isSubmitting ? "Signing in…" : "Sign In"}
      </Button>

      <Divider />
      <GoogleButton />
    </form>
  );
}

function SignUpForm() {
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpRequestInput>({
    resolver: zodResolver(otpRequestSchema),
  });

  async function onSubmit(data: OtpRequestInput) {
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setSuccess(true); return; }
    const json = await res.json().catch(() => ({}));
    toast.error(json?.error ?? "Something went wrong.");
  }

  if (success) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mx-auto"
          style={{ background: "oklch(0.64 0.20 145 / 0.12)", border: "1px solid oklch(0.64 0.20 145 / 0.25)" }}>
          <MailCheck size={26} style={{ color: "oklch(0.64 0.20 145)" }} />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">Check your email</p>
          <p className="text-xs text-muted-foreground mt-1">We sent you a one-time password.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1 mb-5">
        <h2 className="text-lg font-semibold">Create account</h2>
        <p className="text-sm text-muted-foreground">We'll send you a one-time password</p>
      </div>

      <Field label="Email" id="signup-email" type="email" placeholder="you@example.com"
        icon={Mail} error={errors.email?.message} reg={register("email")} />

      <Button type="submit" className="w-full gap-2 cursor-pointer font-semibold mt-2" disabled={isSubmitting}
        style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.35)" }}>
        {isSubmitting ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <Send size={15} />
        )}
        {isSubmitting ? "Sending…" : "Send OTP"}
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
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <Input id={id} type={type} placeholder={placeholder} autoComplete="new-password"
          className={`pl-9 ${error ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
          {...reg} />
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}
