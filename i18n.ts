import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['ar', 'en'] as const;
export const defaultLocale = 'ar' as const;

export default getRequestConfig(async ({ locale }) => {
  const currentLocale = locale || defaultLocale;
  if (!locales.includes(currentLocale as any)) notFound();

  return {
    locale: currentLocale,
    messages: (await import(`./messages/${currentLocale}.json`)).default
  };
});
