import assert from 'node:assert/strict';
import test from 'node:test';
import { getGoSession } from './client';
import { isProtectedPage, loginUrl, redirectIfUnauthorized, safeReturnPath } from './navigation';
import { requestJson } from '../api/json-request';
import { z } from 'zod';

test('login return paths retain catalog filters and reject external, auth and unsafe URLs', () => {
  const path = '/market?sport=tennis&minPrice=50000&source=go';
  assert.equal(safeReturnPath(path), path);
  assert.equal(new URL(loginUrl(path), 'https://example.test').searchParams.get('next'), path);
  for (const invalid of [
    null,
    '//evil.test',
    'https://evil.test',
    'javascript:alert(1)',
    '/\\evil.test',
    '/auth?next=/auth',
    '/api/v1/auth/logout',
    '/market/..//evil',
    '/market/%2f%2fevil',
    '/market\n',
  ]) {
    assert.equal(safeReturnPath(invalid), '/profile', String(invalid));
  }
  assert.equal(safeReturnPath('/order/123?paymentKey=secret&token=secret#fragment'), '/order/123');
});

test('browsing is public while personal, transaction and edit pages require login', () => {
  for (const path of ['/', '/market', '/market/123', '/community', '/community/123', '/auth'])
    assert.equal(isProtectedPage(path), false, path);
  for (const path of [
    '/profile',
    '/my/favorites',
    '/orders',
    '/order/new/123',
    '/seller/apply',
    '/operator/sellers',
    '/chat/123',
    '/chats',
    '/sell',
    '/market/create',
    '/market/123/edit',
    '/community/create',
    '/community/123/edit',
  ])
    assert.equal(isProtectedPage(path), true, path);
});

test('passive session checks stay on public pages; required actions redirect only on 401', async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const destinations: string[] = [];
  const location = {
    pathname: '/market',
    search: '?sport=tennis',
    assign: (url: string) => destinations.push(url),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let status = 401;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json(
      { code: 'UNAUTHENTICATED', message: 'A valid service session is required' },
      { status },
    );
  });
  const passive = await getGoSession();
  assert.ok(!passive.ok);
  assert.match(passive.message, /로그인이 필요/);
  assert.deepEqual(destinations, []);
  await getGoSession({ required: true });
  assert.deepEqual(destinations, [loginUrl('/market?sport=tennis')]);
  destinations.length = 0;
  status = 503;
  await getGoSession({ required: true });
  status = 403;
  await getGoSession({ required: true });
  assert.deepEqual(destinations, []);
  status = 401;
  const before = calls;
  const result = await requestJson('/api/v1/me/favorites/123', z.unknown(), {
    method: 'PUT',
    messages: { http: '실패', invalid: '응답 오류', network: '연결 오류' },
  });
  assert.ok(!result.ok);
  assert.equal(calls, before + 1, 'unauthenticated mutation never reaches the resource');
  assert.equal(destinations.length, 1);
  destinations.length = 0;
  location.pathname = '/orders';
  await requestJson('/api/v1/conversations', z.unknown(), {
    background: true,
    messages: { http: '실패', invalid: '응답 오류', network: '연결 오류' },
  });
  assert.deepEqual(destinations, [], 'background polls never interrupt the current screen');
  redirectIfUnauthorized(401);
  assert.equal(destinations.length, 1);
  destinations.length = 0;
  location.pathname = '/auth';
  redirectIfUnauthorized(401, true);
  assert.deepEqual(destinations, [], 'login must not redirect to itself');
});
