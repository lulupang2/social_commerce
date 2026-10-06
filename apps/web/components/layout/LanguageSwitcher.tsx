'use client';

import { Languages } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE } from '@/lib/i18n/locale';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const next = locale === 'ko' ? 'en' : 'ko';
  return (
    <button
      type="button"
      className="language-switcher"
      aria-label={locale === 'en' ? 'Change language' : '언어 변경'}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        // Refresh server translations while preserving in-progress form inputs.
        router.refresh();
      }}
    >
      <Languages aria-hidden="true" size={22} />
      <span aria-hidden="true">{locale === 'ko' ? 'KO' : 'EN'}</span>
    </button>
  );
}
