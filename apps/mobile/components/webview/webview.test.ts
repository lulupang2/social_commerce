import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrice, formatLocation, formatTime, sportLabels } from '../../lib/format';
import { createBridgeDispatchScript, isTrustedNavigation, parseBridgeRequest } from './bridge';

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

test('native bridge accepts bounded media requests and rejects malformed payloads', () => {
  assert.deepEqual(
    parseBridgeRequest(
      JSON.stringify({
        type: 'SUMMERGEAR_PICK_MEDIA',
        requestId: 'request-1',
        source: 'library',
        maxCount: 4,
      }),
    ),
    {
      type: 'SUMMERGEAR_PICK_MEDIA',
      requestId: 'request-1',
      source: 'library',
      maxCount: 4,
    },
  );
  assert.equal(
    parseBridgeRequest(
      JSON.stringify({
        type: 'SUMMERGEAR_PICK_MEDIA',
        requestId: 'request-2',
        source: 'library',
        maxCount: 11,
      }),
    ),
    null,
  );
  assert.equal(parseBridgeRequest('{broken'), null);
});

test('native bridge dispatch script escapes markup and uses the shared event', () => {
  const script = createBridgeDispatchScript({
    type: 'SUMMERGEAR_BRIDGE_ERROR',
    requestId: 'request-1',
    code: 'failed',
    message: '<script>alert(1)</script>',
  });
  assert.match(script, /summergear:native-message/);
  assert.doesNotMatch(script, /<script>/);
  assert.match(script, /\\u003cscript>/);
});

test('webview navigation keeps the configured origin and rejects external origins', () => {
  assert.equal(
    isTrustedNavigation('https://app.example.test/market/1', 'https://app.example.test'),
    true,
  );
  assert.equal(
    isTrustedNavigation('https://phishing.example.test', 'https://app.example.test'),
    false,
  );
  assert.equal(isTrustedNavigation('about:blank', 'https://app.example.test'), true);
});
