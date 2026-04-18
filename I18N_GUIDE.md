# دليل استخدام الترجمة (i18n)

## نظرة عامة
تم إضافة دعم اللغة العربية والإنجليزية باستخدام `next-intl` مع خط Cairo للعربية.

## اللغة الافتراضية
اللغة العربية هي اللغة الافتراضية للموقع.

## هيكل الملفات

```
messages/
├── ar.json  # الترجمة العربية
└── en.json  # الترجمة الإنجليزية

app/
├── [locale]/  # جميع الصفحات داخل هذا المجلد
│   ├── layout.tsx
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── admin/
│   └── dashboard/
```

## استخدام الترجمة في المكونات

### في Server Components:
```tsx
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

// للـ metadata
export async function generateMetadata() {
  const t = await getTranslations('auth');
  return {
    title: t('signIn')
  };
}

// في المكون
export default function Page() {
  const t = useTranslations('common');
  return <h1>{t('login')}</h1>;
}
```

### في Client Components:
```tsx
'use client';
import { useTranslations } from 'next-intl';

export default function Component() {
  const t = useTranslations('common');
  return <button>{t('submit')}</button>;
}
```

## إضافة ترجمات جديدة

1. افتح `messages/ar.json` و `messages/en.json`
2. أضف المفاتيح الجديدة:

```json
{
  "common": {
    "newKey": "القيمة بالعربية"
  }
}
```

3. استخدمها في الكود:
```tsx
const t = useTranslations('common');
t('newKey')
```

## تبديل اللغة

استخدم مكون `LanguageSwitcher`:

```tsx
import { LanguageSwitcher } from '@/components/language-switcher';

<LanguageSwitcher />
```

## الروابط

استخدم `Link` من next-intl للحفاظ على اللغة:

```tsx
import { Link } from 'next-intl';

<Link href="/dashboard">Dashboard</Link>
```

## خط Cairo

تم إضافة خط Cairo للعربية تلقائياً في `globals.css`:
- يتم تطبيقه تلقائياً عند اختيار اللغة العربية
- يدعم RTL (من اليمين لليسار)

## الوصول للغة الحالية

```tsx
import { useLocale } from 'next-intl';

const locale = useLocale(); // 'ar' أو 'en'
```

## الروابط المباشرة

- العربية: `https://yoursite.com/ar`
- الإنجليزية: `https://yoursite.com/en`
- الافتراضي: `https://yoursite.com` (يوجه للعربية)
