import { browserLocale, intlLocale } from './i18n/locale';

/** The trading currency remains KRW regardless of the display language. */
export function formatWon(amount: number, locale: string = browserLocale()): string {
  return locale === 'en' ? `KRW ${amount.toLocaleString('en-US')}` : `${amount.toLocaleString('ko-KR')}원`;
}

/** Explicit currency code used in order cost breakdowns. */
export function formatKrw(amount: number, locale: string = browserLocale()): string {
  return `KRW ${amount.toLocaleString(intlLocale(locale))}`;
}

export function formatDateTime(value: string, locale: string = browserLocale()): string {
  return new Date(value).toLocaleString(intlLocale(locale), { timeZone: 'Asia/Seoul' });
}

export function formatRelativeTime(value: string, now = Date.now(), locale: string = browserLocale()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (locale === 'en') {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} days ago`;
  }
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}
