"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { otpRequestSchema, type OtpRequestInput } from "@/schemas/otp";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginInput = z.infer<typeof loginSchema>;

export default function AuthForm() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <Card className="border-border/60 shadow-2xl" style={{ background: "var(--color-card)" }}>
      {/* tab switcher */}
      <div className="flex p-1 m-4 mb-0 rounded-lg gap-1" style={{ background: "var(--color-muted)" }}>
        {(["login", "signup"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer"
            style={{
              background: tab === t ? "oklch(0.55 0.26 280)" : "transparent",
              color: tab === t ? "white" : "var(--color-muted-foreground)",
            }}>
            {t === "login" ? "Sign In" : "Sign Up"}
          </button>
        ))}
      </div>

      {tab === "login" ? <LoginForm /> : <SignUpForm />}
    </Card>
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
    console.log("[login] profile:", profile, "user id:", authData.user.id);
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Email" id="email" type="email" placeholder="you@example.com"
          error={errors.email?.message} reg={register("email")} />
        <Field label="Password" id="password" type="password" placeholder="••••••••"
          error={errors.password?.message} reg={register("password")} />
        <Button type="submit" className="w-full mt-2 cursor-pointer" disabled={isSubmitting}
          style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
          {isSubmitting ? "Signing in…" : "Sign In"}
        </Button>
      </CardContent>
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
      <CardContent className="py-8 text-center space-y-2">
        <div className="text-4xl">📬</div>
        <p className="font-semibold text-sm" style={{ color: "oklch(0.64 0.20 145)" }}>
          Check your email for a one-time password.
        </p>
      </CardContent>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Create account</CardTitle>
        <CardDescription>We'll send you a one-time password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Email" id="signup-email" type="email" placeholder="you@example.com"
          error={errors.email?.message} reg={register("email")} />
        <Button type="submit" className="w-full mt-2 cursor-pointer" disabled={isSubmitting}
          style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
          {isSubmitting ? "Sending…" : "Send OTP"}
        </Button>
      </CardContent>
    </form>
  );
}

function Field({ label, id, type, placeholder, error, reg }: {
  label: string; id: string; type: string; placeholder: string;
  error?: string; reg: object;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input id={id} type={type} placeholder={placeholder} autoComplete="new-password"
        className={error ? "border-destructive focus-visible:ring-destructive/30" : ""}
        {...reg} />
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}
