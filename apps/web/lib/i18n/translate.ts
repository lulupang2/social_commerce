import { createTranslator } from 'next-intl';
import { browserLocale, type Locale } from './locale';
import { englishMessages } from './messages';
import { mainMessages } from './main-messages';

/** Stable ASCII keys allow source copy to contain dots and other punctuation. */
export function messageKey(source: string): string {
  return 'm' + Array.from(source).map((character) => character.codePointAt(0)!.toString(16)).join('_');
}

export function localeMessages(locale: Locale): Record<string, string> {
  return Object.fromEntries(Object.entries(englishMessages).map(([source, english]) => [messageKey(source), locale === 'en' ? english : source]));
}

const english = createTranslator({ locale: 'en', messages: localeMessages('en') });
const koreanByEnglish = new Map(Object.entries(englishMessages).filter(([, value]) => value).map(([source, value]) => [value, source]));
const patterns = [...new Set([...Object.keys(mainMessages), ...Object.keys(englishMessages)])].filter((source) => /\{\w+\}/.test(source))
  // Specific messages must win over broad patterns such as "{name} 사진 {index}".
  .sort((a, b) => b.replace(/\{\w+\}/g, '').length - a.replace(/\{\w+\}/g, '').length)
  .map((source) => {
  const names: string[] = [];
  const expression = source.split(/(\{\w+\})/).map((part) => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { source, names, regex: new RegExp(`^${expression}$`) };
});

/** Only application copy is passed here; user-authored text stays untouched. */
export function translate(source: string, locale: string = browserLocale(), read = (key: string) => english.raw(key) as string): string {
  if (!source) return source;
  // Error/notice state may already contain translated copy when the user switches
  // language. Normalize known application messages without clearing form state.
  if (locale !== 'en') return koreanByEnglish.get(source) ?? source;
  if (Object.hasOwn(englishMessages, source)) return read(messageKey(source));
  for (const { source: pattern, names, regex } of patterns) {
    const match = source.match(regex);
    if (!match) continue;
    const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
    return read(messageKey(pattern)).replace(/\{(\w+)\}/g, (token, name: string) => values[name] ?? token);
  }
  return source;
}
