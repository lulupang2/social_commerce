export const LOCALE_COOKIE = 'summergear_locale';
export type Locale = 'ko' | 'en';

export function resolveLocale(value: string | undefined): Locale {
  return value === 'en' ? 'en' : 'ko';
}

/** Browser-only defaults never change the locale of another server request. */
export function browserLocale(): Locale {
  if (typeof document === 'undefined') return 'ko';
  return resolveLocale(document.cookie.split('; ').find((item) => item.startsWith(`${LOCALE_COOKIE}=`))?.split('=')[1]);
}

export function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-US' : 'ko-KR';
}
