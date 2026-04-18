"use client";

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from './ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = () => {
    const newLocale = locale === 'ar' ? 'en' : 'ar';
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <Button variant="ghost" size="sm" onClick={switchLocale} className="gap-2">
      <Languages className="h-4 w-4" />
      {locale === 'ar' ? 'English' : 'العربية'}
    </Button>
  );
}
