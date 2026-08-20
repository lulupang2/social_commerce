import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrice, formatLocation, formatTime, sportLabels } from '../../lib/format';

test('sportLabels matches summer sports domain', () => {
  assert.equal(sportLabels.surf, '서핑');
  assert.equal(sportLabels.tennis, '테니스');
});

test('formatPrice formats KRW and foreign currencies correctly', () => {
  assert.equal(formatPrice({ amount: 680000, currency: 'KRW' }), '680,000원');
  assert.equal(formatPrice({ amount: 250, currency: 'USD' }), 'US$250.00');
});

test('formatLocation handles text and object locations', () => {
  assert.equal(formatLocation('강원도 양양군 죽도해변'), '강원도 양양군 죽도해변');
  assert.equal(formatLocation({ city: '서울', region: '강남구' }), '서울 · 강남구');
  assert.equal(formatLocation(undefined), '위치 미정');
});

test('formatTime calculates elapsed time relative to now', () => {
  const now = Date.now();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  assert.equal(formatTime(tenMinutesAgo, now), '10분 전');

  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(formatTime(twoHoursAgo, now), '2시간 전');
});
