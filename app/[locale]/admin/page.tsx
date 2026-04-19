import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getHalls } from "@/services/halls";
import { Building2, Users, Plus, ArrowRight, ShieldCheck, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHomePage() {
  const t = await getTranslations('admin');
  const supabase = await getServerClient();
  const admin = getAdminClient();

  const [halls, { count: userCount }] = await Promise.all([
    getHalls(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "player"),
  ]);

  const stats = [
    { label: t('totalHalls'),  value: halls.length,    icon: Building2,  color: "text-violet-400",  bg: "oklch(0.55 0.26 280 / 0.1)",  border: "oklch(0.55 0.26 280 / 0.2)" },
    { label: t('players'),       value: userCount ?? 0,  icon: Users,      color: "text-cyan-400",    bg: "oklch(0.82 0.14 200 / 0.1)",  border: "oklch(0.82 0.14 200 / 0.2)" },
  ];

  const actions = [
    {
      title: t('halls'),
      desc: t('hallsDesc'),
      icon: Building2,
      href: "/admin/halls",
      cta: t('manageHallsAction'),
      accent: "oklch(0.55 0.26 280)",
    },
    {
      title: t('users'),
      desc: t('usersDesc'),
      icon: Users,
      href: "/admin/users",
      cta: t('manageUsers'),
      accent: "oklch(0.82 0.14 200)",
    },
  ];

  return (
    <div className="space-y-8">

      {/* page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
          <ShieldCheck size={20} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('superAdmin')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('manageHalls')}</p>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className="rounded-2xl border bg-card p-5"
            style={{ borderColor: border, background: `color-mix(in oklch, ${bg}, var(--card))` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <p className={`text-4xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* quick actions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">{t('quickActions')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {actions.map(({ title, desc, icon: Icon, href, cta, accent }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/30 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 block">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
                  <Icon size={18} style={{ color: accent }} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: accent }}>
                {cta}
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
