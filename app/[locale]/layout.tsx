import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import ReactQueryProvider from "@/lib/query/provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { NavigationLoader } from "@/components/navigation-loader";
import { QueryLoadingBar } from "@/components/query-loading-bar";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Arcadia", template: "%s | Arcadia" },
  description: "Arcadia — Staff & Player Portal",
};

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <ReactQueryProvider>
              <QueryLoadingBar />
              <NavigationLoader>
                {children}
              </NavigationLoader>
            </ReactQueryProvider>
            <Toaster richColors position={locale === 'ar' ? 'top-left' : 'top-right'} />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
