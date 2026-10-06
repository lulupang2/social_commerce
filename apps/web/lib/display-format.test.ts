import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateTime, formatKrw, formatRelativeTime, formatWon } from './display-format';

test('relative order dates preserve minute, hour and day boundaries', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  for (const [minutes, expected] of [[0, '방금 전'], [1, '1분 전'], [59, '59분 전'], [60, '1시간 전'], [1439, '23시간 전'], [1440, '1일 전']] as const) {
    assert.equal(formatRelativeTime(new Date(now - minutes * 60000).toISOString(), now), expected);
  }
  assert.equal(formatRelativeTime('invalid', now), '');
});

test('English display preserves KRW and Seoul transaction timestamps', () => {
  assert.equal(formatWon(12345, 'en'), 'KRW 12,345');
  assert.equal(formatKrw(12345, 'en'), 'KRW 12,345');
  assert.equal(formatRelativeTime('2026-09-28T11:59:00Z', Date.parse('2026-09-28T12:00:00Z'), 'en'), '1 min ago');
  assert.equal(formatDateTime('2026-09-28T12:00:00Z', 'en'), new Date('2026-09-28T12:00:00Z').toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
});

test('amount formats preserve their currency presentation', () => {
  assert.equal(formatWon(12345), '12,345원');
  assert.equal(formatKrw(0), 'KRW 0');
});
