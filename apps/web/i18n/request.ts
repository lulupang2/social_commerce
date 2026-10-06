import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale } from '../lib/i18n/locale';
import { localeMessages } from '../lib/i18n/translate';

export default getRequestConfig(async () => {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: localeMessages(locale), timeZone: 'Asia/Seoul' };
});
