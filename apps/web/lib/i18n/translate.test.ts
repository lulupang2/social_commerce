import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCALE_COOKIE, browserLocale, resolveLocale } from './locale';
import { englishMessages } from './messages';
import { localeMessages, messageKey, translate } from './translate';

test('locale selection accepts supported values and preserves Korean as default', () => {
  assert.equal(resolveLocale('en'), 'en');
  for (const value of [undefined, 'ko', 'fr', 'en-US', '<script>']) assert.equal(resolveLocale(value), 'ko');
  assert.equal(browserLocale(), 'ko');
  assert.equal(LOCALE_COOKIE, 'summergear_locale');
});

test('request locale is explicit and cannot leak between translations', () => {
  assert.equal(translate('마켓', 'en'), 'Market');
  assert.equal(translate('Market', 'ko'), '마켓');
  assert.equal(translate('마켓', 'ko'), '마켓');
  assert.equal(translate('마켓', 'en'), 'Market');
  const korean = localeMessages('ko');
  const english = localeMessages('en');
  assert.equal(korean[messageKey('마켓')], '마켓');
  assert.equal(english[messageKey('마켓')], 'Market');
  assert.deepEqual(Object.keys(korean), Object.keys(english));
});

test('dynamic application copy preserves values and handles regex punctuation', () => {
  assert.equal(translate('2번째 사진 보기', 'en'), 'View photo 2');
  assert.equal(translate('12,345원', 'en'), '12,345 KRW');
  assert.equal(translate('3분 전', 'en'), '3 min ago');
  assert.equal(translate('2번째 사진 보기', 'ko'), '2번째 사진 보기');
  assert.equal(translate('My custom listing / 내 상품', 'en'), 'My custom listing / 내 상품');
});

test('all registered application translations have English text and stable keys', () => {
  const sources = Object.keys(englishMessages);
  assert.equal(new Set(sources.map(messageKey)).size, sources.length);
  for (const [source, english] of Object.entries(englishMessages)) {
    assert.ok(!/[가-힣]/.test(english), `Untranslated copy: ${source}`);
    const sourceSlots = [...source.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const englishSlots = [...english.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(englishSlots, sourceSlots, `Interpolation changed: ${source}`);
  }
});
