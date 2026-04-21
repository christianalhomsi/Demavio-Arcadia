"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { User, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function SetUsernamePage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("auth");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError(t("usernameInvalid"));
      return;
    }

    setLoading(true);
    const supabase = getBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", user.id);

    if (updateError) {
      if (updateError.code === "23505") {
        setError(t("usernameTaken"));
      } else {
        setError(t("usernameUpdateFailed"));
      }
      setLoading(false);
      return;
    }

    toast.success(t("usernameSet"));
    router.push("/halls");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950/30 to-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent mb-1">
            {t("setUsername")}
          </h1>
          <p className="text-slate-400 text-sm">{t("setUsernameDescription")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs font-medium text-slate-300">
              {t("username")}
            </Label>
            <div className="relative">
              <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <Input
                id="username"
                type="text"
                placeholder="username123"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`pl-12 h-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-primary/30 focus-visible:border-primary/50 ${
                  error ? "border-red-500/50 focus-visible:ring-red-500/30" : ""
                }`}
              />
            </div>
            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1">
                <AlertCircle size={11} />
                {error}
              </p>
            )}
            <p className="text-xs text-slate-500">{t("usernameHint")}</p>
          </div>

          <Button
            type="submit"
            className="w-full gap-2 cursor-pointer font-semibold h-10 mt-5 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={loading}
          >
            {loading ? (
              <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
            ) : (
              <User size={16} />
            )}
            {loading ? t("saving") : t("continue")}
          </Button>
        </form>
      </div>
    </div>
  );
}
