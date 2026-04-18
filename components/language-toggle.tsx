"use client";

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLocale = () => {
    const newLocale = locale === 'ar' ? 'en' : 'ar';
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <button
      onClick={toggleLocale}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    >
      <Languages size={13} />
      <span>{locale === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}
