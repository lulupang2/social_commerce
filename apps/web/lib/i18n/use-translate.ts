'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { translate } from './translate';

export function useTranslate() {
  const locale = useLocale();
  const messages = useTranslations();
  return useCallback((source: string) => translate(source, locale, (key) => messages.raw(key) as string), [locale, messages]);
}
