import type { Metadata } from "next";
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import AuthForm from "./request-otp-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    title: `${t('signIn')} | Gaming Hub`,
  };
}

export default function LoginPage() {
  return <AuthForm />;
}
