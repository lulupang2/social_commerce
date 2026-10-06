'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n/locale';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  return (
    <select
      className="language-switcher"
      aria-label={locale === 'en' ? 'Language' : '언어'}
      value={locale}
      onChange={(event) => {
        const next = resolveLocale(event.target.value);
        document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        // Refresh server translations while preserving in-progress form inputs.
        router.refresh();
      }}
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
    </select>
  );
}
