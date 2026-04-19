import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from 'next-intl/server';
import { getServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/services/access";
import { LanguageToggle } from "@/components/language-toggle";
import AdminNav from "./admin-nav";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('nav');
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  if (!(await isSuperAdmin(user.id))) redirect(`/${locale}/halls`);

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          {/* logo */}
          <Link href="/admin" className="flex items-center gap-2 group shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "oklch(0.65 0.22 280)" }}>
                <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M12 12h.01"/><path d="M7 12h.01"/><path d="M17 12h.01"/>
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-bold tracking-tight">
                <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
                <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
              </span>
              <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)", color: "oklch(0.75 0.18 280)" }}>
                Admin
              </span>
            </div>
          </Link>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <Link href="/halls"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              {t('playerApp')}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 max-w-6xl mx-auto w-full px-5 py-8 gap-8">
        {/* sidebar */}
        <aside className="w-52 shrink-0 hidden md:block">
          <AdminNav />
        </aside>

        {/* content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
