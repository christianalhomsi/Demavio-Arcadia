import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from 'next-intl/server';
import { getServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/services/access";
import { LanguageToggle } from "@/components/language-toggle";
import AdminNav from "./admin-nav";
import Logo from "@/components/ui/logo";

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
        <div className="px-3 sm:px-4 md:px-6 h-12 sm:h-14 flex items-center gap-2 sm:gap-3">
          {/* logo */}
          <Logo href="/admin" size="sm" showText={true} />
          <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded-md"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", color: "oklch(0.75 0.18 280)" }}>
            Admin
          </span>

          <div className="flex-1" />

          <div className="flex items-center gap-1 sm:gap-1.5">
            <LanguageToggle />
            <Link href="/halls"
              className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 rounded-lg text-[10px] sm:text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <svg width="11" height="11" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span className="hidden xs:inline">{t('playerApp')}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 gap-4 sm:gap-6 md:gap-8">
        {/* sidebar */}
        <aside className="w-48 sm:w-52 shrink-0 hidden md:block">
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
